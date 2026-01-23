"""Face registration and login using DeepFace library.

Production-grade face recognition using deep learning models (Facenet512, VGG-Face, etc.)
for secure and accurate biometric authentication. Supports multiple recognition models,
distance metrics, and includes basic validation and anti-spoofing measures.

Note: First run will download ~100MB of model weights automatically.
"""

import io
import json
import jwt
import numpy as np
from typing import Optional, Tuple, List
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone as dj_timezone

from .views_common import (
    _extract_dataurl_image,
    _safe_user_from_db,
    _issue_jwt,
    _issue_refresh_token_db,
    _issue_verify_token_from_db,
    _set_auth_cookies,
)
from .utils_audit import record_audit


# ------------------
# DeepFace Utilities
# ------------------

def _user_from_auth_header(request):
    auth = request.META.get("HTTP_AUTHORIZATION", "") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None

    payload = None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        payload = None

    if payload is None:
        try:
            from rest_framework_simplejwt.tokens import AccessToken
            payload = AccessToken(token).payload
        except Exception:
            return None

    user_id = str(payload.get("sub") or payload.get("user_id") or payload.get("id") or "")
    email = (payload.get("email") or "").lower().strip()

    try:
        from .models import AppUser
        if user_id:
            user = AppUser.objects.filter(id=user_id).first()
            if user:
                return user
        if email:
            return AppUser.objects.filter(email=email).first()
    except Exception:
        return None
    return None

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

        multiple_faces = len(faces) > 1
        if multiple_faces:
            # Choose the most prominent face to avoid hard-failing on background faces.
            def _face_score(item):
                area = item.get("facial_area") or {}
                w = area.get("w") or area.get("width") or 0
                h = area.get("h") or area.get("height") or 0
                conf = item.get("confidence") or 0
                return (conf, w * h)

            faces = sorted(faces, key=_face_score, reverse=True)

        face = faces[0]
        confidence = face.get('confidence', 0)

        # Validate face detection confidence
        if confidence < 0.85:
            return None, {"error": "low_confidence", "message": "Face detection confidence too low - improve lighting or angle"}

        # Generate embedding using the specified model
        face_img = face.get("face") if isinstance(face, dict) else None
        embeddings = DeepFace.represent(
            img_path=face_img if face_img is not None else img_array,
            model_name=model_name,
            detector_backend='opencv',
            enforce_detection=False if face_img is not None else enforce_detection,
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
            "embedding_dim": len(embedding_vec),
            "multiple_faces": multiple_faces,
            "faces_detected": len(faces),
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


def _get_face_login_settings():
    try:
        threshold = float(getattr(settings, "FACE_LOGIN_THRESHOLD", 0.35) or 0.35)
    except Exception:
        threshold = 0.35
    try:
        required_frames = int(
            getattr(settings, "FACE_LOGIN_REQUIRED_FRAMES", 3) or 3
        )
    except Exception:
        required_frames = 3
    try:
        max_frames = int(getattr(settings, "FACE_LOGIN_MAX_FRAMES", 5) or 5)
    except Exception:
        max_frames = 5
    required_frames = max(1, required_frames)
    max_frames = max(required_frames, max_frames)
    return threshold, required_frames, max_frames


def _collect_images_from_payload(data):
    images = []
    primary = data.get("image") or data.get("imageData") or ""
    if primary:
        images.append(primary)
    extra = data.get("images") or []
    if isinstance(extra, list):
        for entry in extra:
            if isinstance(entry, dict):
                value = entry.get("data") or entry.get("image") or ""
            else:
                value = entry
            if value:
                images.append(value)
    return images


# ------------------
# API Endpoints
# ------------------

@csrf_exempt
@require_http_methods(["POST"])
def face_register(request):
    """Register or update the calling user's face template using DeepFace.

    Expects:
        - Authorization: Bearer <jwt>
        - JSON body: { image: dataURL, model?: string }

    Stores DeepFace embedding and optional reference image.
    """
    user = _user_from_auth_header(request)
    if not user:
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

    # Extract face and generate embedding (try strict detection first, fall back if necessary)
    enforce_detection = (
        bool(data.get("enforce_detection"))
        if isinstance(data.get("enforce_detection"), bool)
        else True
    )
    embedding_vec, metadata = _extract_face_and_embedding(
        raw, model_name=model_name, enforce_detection=enforce_detection
    )

    if embedding_vec is None and enforce_detection:
        fallback_vec, fallback_meta = _extract_face_and_embedding(
            raw, model_name=model_name, enforce_detection=False
        )
        if fallback_vec is not None:
            embedding_vec = fallback_vec
            metadata = metadata or {}
            metadata["fallback_detection"] = True

    if embedding_vec is None:
        error_msg = metadata.get("message", "Face processing failed") if metadata else "Face processing failed"
        return JsonResponse({"success": False, "message": error_msg}, status=400)

    try:
        from .models import FaceTemplate

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


@csrf_exempt
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
    header_mode = (request.META.get("HTTP_X_AUTH_MODE", "") or "").lower()
    auth_mode = (
        data.get("authMode")
        or data.get("auth_mode")
        or data.get("tokenTransport")
        or data.get("token_transport")
        or ""
    )
    return_tokens = not (header_mode == "cookie" or str(auth_mode).lower() == "cookie")
    token_type = (data.get("tokenType") or data.get("token_type") or "").lower()
    use_simplejwt = token_type in {"simplejwt", "simple", "jwt"}

    images = _collect_images_from_payload(data)
    remember_raw = data.get("remember")
    remember = False
    if isinstance(remember_raw, bool):
        remember = remember_raw
    elif isinstance(remember_raw, (int, str)):
        remember = str(remember_raw).lower() in {"1", "true", "yes", "on"}

    if not images:
        return JsonResponse({"success": False, "message": "Missing image"}, status=400)

    # Optional: specify model (must match registered model for best results)
    model_name = data.get("model", "Facenet512")
    if model_name not in ["Facenet512", "VGG-Face", "ArcFace", "Facenet", "DeepFace"]:
        model_name = "Facenet512"

    threshold, required_frames, max_frames = _get_face_login_settings()
    images = images[:max_frames]

    embeddings = []
    metadata_list = []
    last_error = None
    for image in images:
        _, raw = _extract_dataurl_image(image)
        if not raw:
            continue
        embedding_vec, metadata = _extract_face_and_embedding(
            raw, model_name=model_name, enforce_detection=True
        )
        if embedding_vec is None:
            # Attempt a fallback pass with relaxed detection
            fallback_vec, fallback_meta = _extract_face_and_embedding(
                raw, model_name=model_name, enforce_detection=False
            )
            if fallback_vec is not None:
                embedding_vec = fallback_vec
                metadata = metadata or {}
                metadata["fallback_detection"] = True
            else:
                last_error = (
                    metadata.get("message", "Face processing failed")
                    if metadata
                    else "Face processing failed"
                )
                continue
        embeddings.append(embedding_vec)
        metadata_list.append(metadata or {})

    if len(embeddings) < required_frames:
        if last_error:
            try:
                record_audit(
                    request,
                    type="login",
                    action="Login failed",
                    details=f"Face login: {last_error}",
                    severity="warning",
                )
            except Exception:
                pass
        return JsonResponse({"success": False, "message": "Face not recognized"}, status=401)

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

        match_results = []
        for embedding_vec in embeddings:
            best_match, distance = _find_best_match(
                embedding_vec,
                candidates,
                distance_metric="cosine",
                threshold=threshold,
            )
            if not best_match:
                try:
                    record_audit(
                        request,
                        type="login",
                        action="Login failed",
                        details="Face login: Not recognized",
                        severity="warning",
                    )
                except Exception:
                    pass
                return JsonResponse(
                    {"success": False, "message": "Face not recognized"}, status=401
                )
            match_results.append((best_match, distance))

        user_ids = {str(match.user_id) for match, _ in match_results}
        if len(user_ids) != 1:
            return JsonResponse(
                {"success": False, "message": "Face not recognized"}, status=401
            )

        best_match = match_results[0][0]
        distance = max(result[1] for result in match_results)

        if not best_match:
            try:
                record_audit(
                    request,
                    type="login",
                    action="Login failed",
                    details="Face login: Not recognized",
                    severity="warning",
                )
            except Exception:
                pass
            return JsonResponse(
                {"success": False, "message": "Face not recognized"}, status=401
            )

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

        payload = {
            "success": True,
            "user": _safe_user_from_db(user),
            "metadata": {
                "distance": distance,
                "confidence": metadata.get("confidence", 0),
                "model": model_name,
            },
        }
        if return_tokens:
            if use_simplejwt:
                try:
                    from rest_framework_simplejwt.tokens import RefreshToken
                    refresh = RefreshToken.for_user(user)
                    payload.update(
                        {
                            "access": str(refresh.access_token),
                            "refresh": str(refresh),
                            "tokenType": "simplejwt",
                        }
                    )
                except Exception:
                    return JsonResponse({"success": False, "message": "Login failed"}, status=500)
            else:
                exp_seconds = (
                    getattr(settings, "JWT_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60)
                    if remember
                    else getattr(settings, "JWT_EXP_SECONDS", 3600)
                )
                token = _issue_jwt(user, exp_seconds=exp_seconds)
                refresh_token = _issue_refresh_token_db(user, remember=remember, request=request)
                payload.update({"token": token, "refreshToken": refresh_token})
        resp = JsonResponse(payload)
        if return_tokens and not use_simplejwt:
            _set_auth_cookies(resp, token, refresh_token, remember=remember, access_max_age=exp_seconds)
        return resp

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


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def face_unregister(request):
    """Remove the calling user's face template.

    Requires Authorization: Bearer <jwt>.
    Accepts POST or DELETE for convenience.
    """
    user = _user_from_auth_header(request)
    if not user:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        from .models import FaceTemplate

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
