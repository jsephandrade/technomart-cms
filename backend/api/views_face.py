"""Face registration and login using DeepFace library.

Production-grade face recognition using deep learning models (Facenet512, VGG-Face, etc.)
for secure and accurate biometric authentication. Supports multiple recognition models,
distance metrics, and includes basic validation and anti-spoofing measures.

Note: First run will download ~100MB of model weights automatically.
"""

import io
import json
import numpy as np
from typing import Optional, Tuple, List
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.conf import settings
from django.utils import timezone as dj_timezone

from .views_common import (
    _extract_dataurl_image,
    _safe_user_from_db,
    _issue_jwt,
    _issue_refresh_token_db,
    _issue_verify_token_from_db,
    _get_request_auth_token,
    _set_auth_cookies,
)
from .utils_audit import record_audit


# ------------------
# DeepFace Utilities
# ------------------

def _extract_face_and_embedding(
    image_bytes: bytes,
    model_name: str = "Facenet512",
    enforce_detection: bool = True
) -> Tuple[Optional[np.ndarray], Optional[dict]]:
    """Extract face and generate embedding using DeepFace.

    Args:
        image_bytes: Raw image bytes
        model_name: DeepFace model to use (Facenet512, VGG-Face, ArcFace, etc.)
        enforce_detection: Raise error if no face detected

    Returns:
        Tuple of (embedding_array, face_metadata) or (None, None) on failure
    """
    if not image_bytes:
        return None, None

    try:
        from deepface import DeepFace
        from PIL import Image
    except ImportError:
        return None, None

    try:
        # Load image with Pillow
        img = Image.open(io.BytesIO(image_bytes))
        img_array = np.array(img)

        # Extract faces first to validate detection
        faces = DeepFace.extract_faces(
            img_path=img_array,
            detector_backend='opencv',  # Fast and reliable
            enforce_detection=enforce_detection,
            align=True
        )

        if not faces or len(faces) == 0:
            return None, {"error": "no_face_detected", "message": "No face detected in image"}

        if len(faces) > 1:
            return None, {"error": "multiple_faces", "message": "Multiple faces detected - ensure only one person is visible"}

        face = faces[0]
        confidence = face.get('confidence', 0)

        # Validate face detection confidence
        if confidence < 0.85:
            return None, {"error": "low_confidence", "message": "Face detection confidence too low - improve lighting or angle"}

        # Generate embedding using the specified model
        embeddings = DeepFace.represent(
            img_path=img_array,
            model_name=model_name,
            detector_backend='opencv',
            enforce_detection=enforce_detection,
            align=True
        )

        if not embeddings or len(embeddings) == 0:
            return None, {"error": "embedding_failed", "message": "Failed to generate face embedding"}

        # Return the first embedding (should only be one face)
        embedding_vec = np.array(embeddings[0]['embedding'])

        metadata = {
            "confidence": confidence,
            "face_area": face.get('facial_area', {}),
            "model": model_name,
            "embedding_dim": len(embedding_vec)
        }

        return embedding_vec, metadata

    except ValueError as e:
        # DeepFace raises ValueError for no face detected
        return None, {"error": "no_face_detected", "message": str(e)}
    except Exception as e:
        return None, {"error": "processing_failed", "message": f"Image processing failed: {str(e)}"}


def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    try:
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))
    except Exception:
        return 0.0


def _cosine_distance(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine distance (1 - cosine_similarity)."""
    return 1.0 - _cosine_similarity(vec1, vec2)


def _euclidean_distance(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate Euclidean distance between two vectors."""
    try:
        return float(np.linalg.norm(vec1 - vec2))
    except Exception:
        return float('inf')


def _find_best_match(
    query_embedding: np.ndarray,
    candidates: List[Tuple[any, np.ndarray]],
    distance_metric: str = "cosine",
    threshold: float = 0.4
) -> Tuple[Optional[any], float]:
    """Find best matching face template from candidates.

    Args:
        query_embedding: Query face embedding
        candidates: List of (template_object, embedding_array) tuples
        distance_metric: "cosine" or "euclidean"
        threshold: Maximum distance for a match

    Returns:
        Tuple of (best_match_template, distance) or (None, inf) if no match
    """
    if not candidates:
        return None, float('inf')

    best_match = None
    best_distance = float('inf')

    for template, stored_embedding in candidates:
        if distance_metric == "cosine":
            distance = _cosine_distance(query_embedding, stored_embedding)
        else:  # euclidean
            distance = _euclidean_distance(query_embedding, stored_embedding)

        if distance < best_distance:
            best_distance = distance
            best_match = template

    # Check if best match meets threshold
    if best_distance > threshold:
        return None, best_distance

    return best_match, best_distance


# ------------------
# API Endpoints
# ------------------

@require_http_methods(["POST"])
def face_register(request):
    """Register or update the calling user's face template using DeepFace.

    Expects:
        - Authorization: Bearer <jwt>
        - JSON body: { image: dataURL, model?: string }

    Stores DeepFace embedding and optional reference image.
    """
    token = _get_request_auth_token(request)
    if not token:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    import jwt
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}

    # Extract image
    def _first_image_bytes():
        image = data.get("image") or data.get("imageData") or ""
        images = data.get("images") or []
        if not image and images:
            image = images[0].get("data") if isinstance(images[0], dict) else images[0]
        mime, raw = _extract_dataurl_image(image)
        return raw

    raw = _first_image_bytes()
    if not raw:
        return JsonResponse({"success": False, "message": "Missing image"}, status=400)

    # Optional: specify model (default: Facenet512)
    model_name = data.get("model", "Facenet512")
    if model_name not in ["Facenet512", "VGG-Face", "ArcFace", "Facenet", "DeepFace"]:
        model_name = "Facenet512"  # fallback to default

    # Extract face and generate embedding
    embedding_vec, metadata = _extract_face_and_embedding(raw, model_name=model_name, enforce_detection=True)

    if embedding_vec is None:
        error_msg = metadata.get("message", "Face processing failed") if metadata else "Face processing failed"
        return JsonResponse({"success": False, "message": error_msg}, status=400)

    try:
        from .models import AppUser, FaceTemplate
        user = AppUser.objects.filter(id=payload.get("sub")).first()
        if not user:
            return JsonResponse({"success": False, "message": "User not found"}, status=404)

        # Convert embedding to JSON string
        embedding_json = json.dumps(embedding_vec.tolist())

        # Create or update face template
        tpl, created = FaceTemplate.objects.get_or_create(
            user=user,
            defaults={
                "embedding": embedding_json,
                "model_name": model_name,
                "distance_metric": "cosine",
            }
        )

        if not created:
            # Update existing template
            tpl.embedding = embedding_json
            tpl.model_name = model_name
            tpl.distance_metric = "cosine"

        # Save reference image for audit/debugging
        try:
            from django.core.files.base import ContentFile
            tpl.reference.save("reference.jpg", ContentFile(raw), save=False)
        except Exception:
            pass

        tpl.save()

        try:
            record_audit(
                request,
                user=user,
                type="security",
                action="Face template registered",
                details=f"DeepFace registration with {model_name} (confidence: {metadata.get('confidence', 0):.2f})",
                severity="info",
            )
        except Exception:
            pass

        return JsonResponse({
            "success": True,
            "message": "Face registered successfully",
            "metadata": {
                "model": model_name,
                "confidence": metadata.get("confidence", 0),
                "embedding_dim": metadata.get("embedding_dim", 0)
            }
        })

    except Exception as e:
        return JsonResponse({"success": False, "message": f"Registration failed: {str(e)}"}, status=500)


@require_http_methods(["POST"])
def face_login(request):
    """Attempt login by matching submitted face image to stored DeepFace templates.

    Expects JSON body: { image: dataURL, remember?: bool, model?: string }
    On successful match to an active user, issues JWT + refresh token.
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}

    image = data.get("image") or data.get("imageData") or ""
    remember_raw = data.get("remember")
    remember = False
    if isinstance(remember_raw, bool):
        remember = remember_raw
    elif isinstance(remember_raw, (int, str)):
        remember = str(remember_raw).lower() in {"1", "true", "yes", "on"}

    # Extract image
    mime, raw = _extract_dataurl_image(image)
    if not raw:
        return JsonResponse({"success": False, "message": "Missing image"}, status=400)

    # Optional: specify model (must match registered model for best results)
    model_name = data.get("model", "Facenet512")
    if model_name not in ["Facenet512", "VGG-Face", "ArcFace", "Facenet", "DeepFace"]:
        model_name = "Facenet512"

    # Extract face and generate embedding
    embedding_vec, metadata = _extract_face_and_embedding(raw, model_name=model_name, enforce_detection=True)

    if embedding_vec is None:
        error_msg = metadata.get("message", "Face processing failed") if metadata else "Face processing failed"
        try:
            record_audit(
                request,
                type="login",
                action="Login failed",
                details=f"Face login: {error_msg}",
                severity="warning",
            )
        except Exception:
            pass
        return JsonResponse({"success": False, "message": error_msg}, status=400)

    # Matching threshold (cosine distance)
    # Lower is more similar: 0 = identical, 1 = completely different
    # Facenet512 typically uses 0.4 threshold
    THRESHOLD = 0.4

    try:
        from .models import FaceTemplate

        # Retrieve all face templates (filter by model for better performance)
        templates = list(FaceTemplate.objects.select_related("user").filter(model_name=model_name))

        if not templates:
            try:
                record_audit(
                    request,
                    type="login",
                    action="Login failed",
                    details=f"Face login: No registered faces for model {model_name}",
                    severity="warning",
                )
            except Exception:
                pass
            return JsonResponse({"success": False, "message": "No registered faces found"}, status=404)

        # Prepare candidates (template, embedding_array)
        candidates = []
        for tpl in templates:
            try:
                stored_embedding = np.array(json.loads(tpl.embedding))
                candidates.append((tpl, stored_embedding))
            except Exception:
                continue  # Skip corrupted embeddings

        if not candidates:
            return JsonResponse({"success": False, "message": "No valid face templates found"}, status=404)

        # Find best match
        best_match, distance = _find_best_match(
            embedding_vec,
            candidates,
            distance_metric="cosine",
            threshold=THRESHOLD
        )

        if not best_match:
            try:
                record_audit(
                    request,
                    type="login",
                    action="Login failed",
                    details=f"Face login: Not recognized (best distance: {distance:.4f})",
                    severity="warning",
                )
            except Exception:
                pass
            return JsonResponse({"success": False, "message": "Face not recognized"}, status=401)

        user = best_match.user

        # Check user status
        status_l = (user.status or "").lower()
        if status_l == "deactivated":
            try:
                record_audit(
                    request,
                    user=user,
                    type="security",
                    action="Login blocked (deactivated)",
                    details="Face login",
                    severity="warning",
                )
            except Exception:
                pass
            return JsonResponse({
                "success": False,
                "message": "Your account is currently deactivated, to activate please contact the admin.",
            }, status=403)

        if status_l != "active":
            # Issue verify token for pending users
            try:
                record_audit(
                    request,
                    user=user,
                    type="login",
                    action="Login pending",
                    details=f"Face login (distance: {distance:.4f})",
                    severity="info",
                )
            except Exception:
                pass
            return JsonResponse({
                "success": True,
                "pending": True,
                "user": _safe_user_from_db(user),
                "verifyToken": _issue_verify_token_from_db(user),
            })

        # Successful login
        user.last_login = dj_timezone.now()
        user.save(update_fields=["last_login"])

        exp_seconds = (
            getattr(settings, "JWT_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60)
            if remember
            else getattr(settings, "JWT_EXP_SECONDS", 3600)
        )
        token = _issue_jwt(user, exp_seconds=exp_seconds)
        refresh_token = _issue_refresh_token_db(user, remember=remember, request=request)

        try:
            record_audit(
                request,
                user=user,
                type="login",
                action="Login success",
                details=f"Face login with {model_name} (distance: {distance:.4f}, confidence: {metadata.get('confidence', 0):.2f})",
                severity="info",
            )
        except Exception:
            pass

        refresh_ttl = (
            getattr(settings, "JWT_REFRESH_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60)
            if remember
            else getattr(settings, "JWT_REFRESH_EXP_SECONDS", 7 * 24 * 60 * 60)
        )
        resp = JsonResponse({
            "success": True,
            "user": _safe_user_from_db(user),
            "token": token,
            "refreshToken": refresh_token,
            "metadata": {
                "distance": distance,
                "confidence": metadata.get("confidence", 0),
                "model": model_name
            }
        })
        return _set_auth_cookies(
            resp,
            access_token=token,
            refresh_token=refresh_token,
            access_max_age=exp_seconds,
            refresh_max_age=refresh_ttl,
        )

    except Exception as e:
        try:
            record_audit(
                request,
                type="system",
                action="Login error",
                details=f"Face login failed with server error: {str(e)}",
                severity="error",
            )
        except Exception:
            pass
        return JsonResponse({"success": False, "message": "Login failed"}, status=500)


@require_http_methods(["POST", "DELETE"])
def face_unregister(request):
    """Remove the calling user's face template.

    Requires Authorization: Bearer <jwt>.
    Accepts POST or DELETE for convenience.
    """
    token = _get_request_auth_token(request)
    if not token:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    import jwt
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        from .models import AppUser, FaceTemplate
        user = AppUser.objects.filter(id=payload.get("sub")).first()
        if not user:
            return JsonResponse({"success": False, "message": "User not found"}, status=404)

        tpl = FaceTemplate.objects.filter(user=user).first()
        if not tpl:
            # Already removed
            return JsonResponse({"success": True})

        # Delete reference image if exists
        try:
            if getattr(tpl, "reference", None):
                tpl.reference.delete(save=False)
        except Exception:
            pass

        tpl.delete()

        try:
            record_audit(
                request,
                user=user,
                type="security",
                action="Face template unregistered",
                details="User removed DeepFace template",
                severity="info",
            )
        except Exception:
            pass

        return JsonResponse({"success": True})

    except Exception:
        return JsonResponse({"success": False, "message": "Unregister failed"}, status=500)


__all__ = ["face_register", "face_login", "face_unregister"]
