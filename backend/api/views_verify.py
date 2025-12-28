"""Identity verification endpoints: status, upload, resend token, review."""

import json
from django.http import JsonResponse, FileResponse
from django.views.decorators.http import require_http_methods
from django.conf import settings
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone as dj_timezone
import jwt

from .views_common import (
    _decode_verify_token,
    _decode_verify_token_ignore_exp,
    _safe_user_from_db,
    _extract_dataurl_image,
    _issue_verify_token_from_db,
    _issue_verify_token_from_dict,
    USERS,
    _require_admin_or_manager,
    _actor_from_request,
    _has_permission,
)
from .emails import (
    notify_admins_verification_submitted,
    email_user_verification_received,
    email_user_approved,
    email_user_rejected,
)


@require_http_methods(["GET"]) 
def verify_status(request):
    token = None
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
    if not token:
        token = request.GET.get("token") or ""
    if not token:
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
            token = data.get("verifyToken") or ""
        except Exception:
            token = ""
    payload = _decode_verify_token(token)
    if not payload:
        return JsonResponse({"success": False, "message": "Invalid token"}, status=401)
    email = (payload.get("email") or "").lower().strip()
    try:
        from .models import AppUser, AccessRequest
        u = AppUser.objects.filter(email=email).first()
        if not u:
            return JsonResponse({"success": False, "message": "Invalid token"}, status=401)
        ar = getattr(u, "access_request", None)
        if not ar:
            return JsonResponse({"success": True, "status": "pending", "hasHeadshot": False})
        return JsonResponse({
            "success": True,
            "status": ar.status,
            "hasHeadshot": bool(ar.headshot),
            "consented": bool(ar.consent_at),
        })
    except Exception:
        return JsonResponse({"success": True, "status": "pending"})


@require_http_methods(["POST"]) 
def verify_upload(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    verify_token = data.get("verifyToken") or ""
    consent = bool(data.get("consent", False))
    image_data = data.get("imageData") or data.get("headshot") or ""

    payload = _decode_verify_token(verify_token)
    if not payload:
        return JsonResponse({"success": False, "message": "Invalid token"}, status=401)

    mime, raw = _extract_dataurl_image(image_data)
    if not raw:
        return JsonResponse({"success": False, "message": "Invalid image data"}, status=400)

    ext = ".jpg"
    if mime == "image/png":
        ext = ".png"
    elif mime in ("image/jpeg", "image/jpg"):
        ext = ".jpg"
    elif mime == "image/webp":
        ext = ".webp"

    try:
        from .models import AppUser, AccessRequest
        from django.core.files.base import ContentFile
        email = (payload.get("email") or "").lower().strip()
        u = AppUser.objects.filter(email=email).first()
        if not u:
            return JsonResponse({"success": False, "message": "User not found"}, status=404)
        ar, _ = AccessRequest.objects.get_or_create(user=u)
        filename = f"headshot{ext}"
        ar.headshot.save(filename, ContentFile(raw), save=False)
        if consent:
            ar.consent_at = dj_timezone.now()
        if (u.status or "").lower() != "active":
            u.status = "pending"
            u.save(update_fields=["status"]) 
        ar.save()
        try:
            email_user_verification_received(u)
            notify_admins_verification_submitted(u, ar)
        except Exception:
            pass
        return JsonResponse({"success": True, "status": ar.status})
    except Exception:
        return JsonResponse({"success": False, "message": "Upload failed"}, status=500)


__all__ = [
    "verify_status",
    "verify_upload",
]


from .views_common import _decode_verify_token_ignore_exp
from .views_common import _issue_verify_token_from_dict

@require_http_methods(["POST"]) 
def verify_resend_token(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    old = (data.get("verifyToken") or data.get("token") or "").strip()
    if not old:
        return JsonResponse({"success": False, "message": "Missing token"}, status=400)
    payload = _decode_verify_token_ignore_exp(old)
    if not payload:
        return JsonResponse({"success": True})
    email = (payload.get("email") or "").lower().strip()
    try:
        from .models import AppUser
        u = AppUser.objects.filter(email=email).first()
        if not u or (u.status or "").lower() == "active":
            return JsonResponse({"success": True})
        return JsonResponse({"success": True, "verifyToken": _issue_verify_token_from_db(u)})
    except Exception:
        pass
    u = next((x for x in USERS if (x.get("email") or "").lower() == email), None)
    if not u or (u.get("status") or "").lower() == "active":
        return JsonResponse({"success": True})
    return JsonResponse({"success": True, "verifyToken": _issue_verify_token_from_dict(u)})


@require_http_methods(["GET"]) 
def verify_requests(request):
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        from .models import AppUser, AccessRequest
        reviewer = AppUser.objects.filter(email=(payload.get("email") or "").lower()).first()
        # Require manager/admin role and explicit permission
        if not reviewer or not _require_admin_or_manager(reviewer) or not _has_permission(reviewer, "verify.review"):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        status_q = (request.GET.get("status") or "pending").lower()
        page = max(1, int(request.GET.get("page") or 1))
        limit = max(1, min(100, int(request.GET.get("limit") or 20)))
        search = (request.GET.get("search") or "").strip().lower()

        qs = AccessRequest.objects.select_related("user").all()
        if status_q:
            qs = qs.filter(status=status_q)
        if search:
            from django.db.models import Q
            qs = qs.filter(Q(user__email__icontains=search) | Q(user__name__icontains=search))
        total = qs.count()
        start = (page - 1) * limit
        end = start + limit
        items = []
        for ar in qs.order_by("-created_at")[start:end]:
            items.append({
                "id": str(ar.id),
                "status": ar.status,
                "createdAt": (ar.created_at).isoformat() if ar.created_at else None,
                "verifiedAt": ar.verified_at.isoformat() if ar.verified_at else None,
                "verifiedBy": ar.verified_by,
                "notes": ar.notes or "",
                "hasHeadshot": bool(ar.headshot),
                "user": {
                    "id": str(ar.user.id),
                    "email": ar.user.email,
                    "name": ar.user.name,
                    "role": ar.user.role,
                    "status": ar.user.status,
                    "avatar": ar.user.avatar or None,
                    "phone": getattr(ar.user, "phone", "") or "",
                    "emailVerified": bool(getattr(ar.user, "email_verified", False)),
                },
                "headshotUrl": f"/api/verify/headshot/{ar.id}",
            })
        return JsonResponse({
            "success": True,
            "data": items,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": max(1, (total + limit - 1) // limit),
            },
        })
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to load requests"}, status=500)


@require_http_methods(["GET"]) 
def verify_headshot(request, request_id):
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        from .models import AppUser, AccessRequest
        reviewer = AppUser.objects.filter(email=(payload.get("email") or "").lower()).first()
        # Require manager/admin role and explicit permission
        if not reviewer or not _require_admin_or_manager(reviewer) or not _has_permission(reviewer, "verify.review"):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        ar = AccessRequest.objects.filter(id=request_id).first()
        if not ar or not ar.headshot:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        f = ar.headshot.open("rb")
        name = getattr(ar.headshot, "name", "headshot.jpg")
        if name.endswith(".png"):
            ctype = "image/png"
        elif name.endswith(".webp"):
            ctype = "image/webp"
        else:
            ctype = "image/jpeg"
        return FileResponse(f, content_type=ctype)
    except Exception:
        return JsonResponse({"success": False, "message": "Error"}, status=500)


@require_http_methods(["POST"]) 
def verify_approve(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}

    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    request_id = (data.get("requestId") or "").strip()
    role = (data.get("role") or "staff").lower()
    note = (data.get("note") or "").strip()
    if role not in {"admin", "manager", "staff"}:
        return JsonResponse({"success": False, "message": "Invalid role"}, status=400)
    if not request_id:
        return JsonResponse({"success": False, "message": "Missing requestId"}, status=400)

    try:
        from .models import AppUser, AccessRequest
        reviewer = AppUser.objects.filter(email=(payload.get("email") or "").lower()).first()
        if not reviewer or not _require_admin_or_manager(reviewer):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
        ar = AccessRequest.objects.filter(id=request_id).select_related("user").first()
        if not ar:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        ar.status = AccessRequest.STATUS_APPROVED
        ar.verified_at = dj_timezone.now()
        ar.verified_by = reviewer.email
        if note:
            ar.notes = (ar.notes or "") + ("\n" if ar.notes else "") + note
        ar.save()
        u = ar.user
        u.role = role
        u.status = "active"
        # Assign default permissions for the role if none set
        try:
            u.save(update_fields=["role", "status"])
        except Exception:
            u.save(update_fields=["role", "status"])
        try:
            email_user_approved(u)
        except Exception:
            pass
        return JsonResponse({"success": True, "data": {"id": str(ar.id), "status": ar.status, "user": {"id": str(u.id), "role": u.role, "status": u.status}}})
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to approve"}, status=500)


@require_http_methods(["POST"]) 
def verify_reject(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    request_id = (data.get("requestId") or "").strip()
    note = (data.get("note") or "").strip()

    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        from .models import AppUser, AccessRequest
        reviewer = AppUser.objects.filter(email=(payload.get("email") or "").lower()).first()
        if not reviewer or not _require_admin_or_manager(reviewer):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
        ar = AccessRequest.objects.filter(id=request_id).select_related("user").first()
        if not ar:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        ar.status = AccessRequest.STATUS_REJECTED
        ar.verified_at = dj_timezone.now()
        ar.verified_by = reviewer.email
        if note:
            ar.notes = (ar.notes or "") + ("\n" if ar.notes else "") + note
        ar.save()
        u = ar.user
        if (u.status or "").lower() != "active":
            u.status = "pending"
            u.save(update_fields=["status"])
        try:
            email_user_rejected(u, note)
        except Exception:
            pass
        return JsonResponse({"success": True, "data": {"id": str(ar.id), "status": ar.status}})
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to reject"}, status=500)


__all__.extend([
    "verify_resend_token",
    "verify_requests",
    "verify_headshot",
    "verify_approve",
    "verify_reject",
])
