"""User management endpoints and role configs."""

import json
import uuid
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.utils import OperationalError, ProgrammingError
from django.db import transaction
from django.conf import settings
import jwt
from django.contrib.auth.hashers import make_password

from .views_common import (
    USERS,
    _paginate,
    _maybe_seed_from_memory,
    _safe_user_from_db,
    _now_iso,
    get_role_configs,
    role_permissions_for_role,
    normalize_role_permissions,
    _set_role_config_override,
    _invalidate_role_config_cache,
    ROLE_VALUES,
)
from .utils_audit import record_audit


ALLOWED_ROLES = ROLE_VALUES


def _log_user_action(request, actor, target_user, action: str, *, details: str = "", meta=None):
    """Record activity log for user management changes; best-effort."""
    try:
        record_audit(
            request,
            user=actor if getattr(actor, "id", None) else None,
            type="action",
            action=action,
            details=details or "",
            severity="info",
            meta=meta or {},
        )
    except Exception:
        pass


@require_http_methods(["GET", "POST"]) 
def users(request):
    # For any access to the users collection, require Admin role
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1].strip()
    try:
        tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    # Determine actor role (from DB if available; otherwise rely on token claims if present)
    actor_role = None
    try:
        from .models import AppUser
        current = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        actor_role = (current.role or "").lower() if current else None
    except Exception:
        actor_role = (tp.get("role") or "").lower()
    if actor_role != "admin":
        return JsonResponse(
            {
                "success": False,
                "message": "Your account can't access User Management, please contact the Admin",
            },
            status=403,
        )
    if request.method == "GET":
        search = (request.GET.get("search") or "").lower()
        role = (request.GET.get("role") or "").lower()
        status = (request.GET.get("status") or "").lower()
        sort_by = request.GET.get("sortBy") or "name"
        sort_dir = (request.GET.get("sortDir") or "asc").lower()
        page = request.GET.get("page", 1)
        limit = request.GET.get("limit", 20)

        try:
            from .models import AppUser
            _maybe_seed_from_memory()
            qs = AppUser.objects.all()
            if search:
                from django.db.models import Q
                qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search))
            if role:
                qs = qs.filter(role=role)
            if status:
                qs = qs.filter(status=status)

            field_map = {
                "name": "name",
                "email": "email",
                "role": "role",
                "status": "status",
                "createdAt": "created_at",
                "lastLogin": "last_login",
            }
            sort_field = field_map.get(sort_by, "name")
            if sort_dir == "desc":
                sort_field = f"-{sort_field}"
            qs = qs.order_by(sort_field)

            page = max(1, int(page or 1))
            limit = max(1, int(limit or 20))
            total = qs.count()
            start = (page - 1) * limit
            end = start + limit
            items = [_safe_user_from_db(u) for u in qs[start:end]]
            pagination = {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": max(1, (total + limit - 1) // limit),
                "sortBy": sort_by,
                "sortDir": sort_dir,
            }
            return JsonResponse({"success": True, "data": items, "pagination": pagination})
        except (OperationalError, ProgrammingError):
            pass

        if getattr(settings, "DISABLE_INMEM_FALLBACK", False):
            return JsonResponse(
                {"success": False, "message": "Service temporarily unavailable"},
                status=503,
            )

        data = USERS
        if search:
            data = [u for u in data if search in u.get("name", "").lower() or search in u.get("email", "").lower()]
        if role:
            data = [u for u in data if (u.get("role", "").lower() == role)]
        if status:
            data = [u for u in data if (u.get("status", "").lower() == status)]
        reverse = sort_dir == "desc"
        try:
            data = sorted(data, key=lambda x: str(x.get(sort_by, "")).lower(), reverse=reverse)
        except Exception:
            pass
        page_data, pagination = _paginate(data, page, limit)
        return JsonResponse({"success": True, "data": page_data, "pagination": pagination})

    # Create user (admin only)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    try:
        # Authorization: only admin can create users
        # (Auth already decoded above; tp set. Verify actor is admin.)
        try:
            from .models import AppUser
            current = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        except Exception:
            current = None
        if not current or (current.role or "").lower() != "admin":
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        from .models import AppUser
        from django.db import IntegrityError
        _maybe_seed_from_memory()

        # Validate email
        new_email = (payload.get("email") or "").lower().strip()
        if not new_email or new_email == "user@example.com":
            return JsonResponse({"success": False, "message": "Valid email is required"}, status=400)

        # Check if email already exists
        existing_user = AppUser.objects.filter(email=new_email).first()
        if existing_user:
            return JsonResponse({
                "success": False,
                "message": f"Email '{new_email}' is already in use. Please use a different email."
            }, status=400)

        # Optional initial password support (admin create)
        raw_password = (payload.get("password") or "").strip()
        if raw_password and len(raw_password) < 8:
            return JsonResponse({"success": False, "message": "Password must be at least 8 characters"}, status=400)

        try:
            with transaction.atomic():
                db_user = AppUser.objects.create(
                    email=new_email,
                    name=payload.get("name") or "New User",
                    role=(payload.get("role") or "staff").lower(),
                    status="active",
                    permissions=payload.get("permissions") or [],
                    phone=(payload.get("phone") or ""),
                    password_hash=make_password(raw_password) if raw_password else "",
                )
        except IntegrityError:
            # Safety net in case of race condition
            return JsonResponse({
                "success": False,
                "message": f"Email '{new_email}' is already in use. Please use a different email."
            }, status=400)

        _log_user_action(
            request,
            actor=current,
            target_user=db_user,
            action=f"User created ({db_user.email}, role {db_user.role})",
            meta={
                "userId": str(db_user.id),
                "email": db_user.email,
                "role": db_user.role,
                "status": db_user.status,
            },
        )
        return JsonResponse({"success": True, "data": _safe_user_from_db(db_user)})
    except (OperationalError, ProgrammingError):
        pass

    if getattr(settings, "DISABLE_INMEM_FALLBACK", False):
        return JsonResponse(
            {"success": False, "message": "Service temporarily unavailable"},
            status=503,
        )

    user = {
        "id": str(uuid.uuid4()),
        "name": payload.get("name") or "New User",
        "email": payload.get("email") or "user@example.com",
        "role": (payload.get("role") or "staff").lower(),
        "status": "active",
        "createdAt": _now_iso(),
        "lastLogin": None,
        "permissions": [],
    }
    USERS.append(user)
    return JsonResponse({"success": True, "data": user})


@require_http_methods(["GET", "PUT", "DELETE"])
def user_detail(request, user_id):
    user_id = str(user_id)
    try:
        from .models import AppUser
        _maybe_seed_from_memory()
        # Require admin for all operations in user management, including viewing details
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        token = auth.split(" ", 1)[1].strip()
        try:
            tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except Exception:
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        actor = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        if not actor or (actor.role or "").lower() != "admin":
            return JsonResponse(
                {
                    "success": False,
                    "message": "Your account can't access User Management, please contact the Admin",
                },
                status=403,
            )
        db_user = AppUser.objects.filter(id=user_id).first()
        if not db_user:
            raise OperationalError("not found")

        if request.method == "GET":
            return JsonResponse({"success": True, "data": _safe_user_from_db(db_user)})
        if request.method == "DELETE":
            # Admin only delete (already validated above)
            db_user.delete()
            _log_user_action(
                request,
                actor=actor,
                target_user=db_user,
                action=f"User deleted ({db_user.email})",
                meta={"userId": user_id, "email": db_user.email, "role": db_user.role, "status": db_user.status},
            )
            return JsonResponse({"success": True, "message": "Deleted"})

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        # Only admin can update user details in User Management
        # (actor already validated as admin above)
        changed = False
        changes = {}
        before_snapshot = {
            "name": db_user.name,
            "email": db_user.email,
            "role": db_user.role,
            "status": db_user.status,
            "permissions": db_user.permissions,
            "phone": db_user.phone,
        }
        password_changed = False
        # Optional password update
        if "password" in payload and payload["password"] is not None:
            new_pw = (str(payload.get("password")) or "").strip()
            if new_pw and len(new_pw) < 8:
                return JsonResponse({"success": False, "message": "Password must be at least 8 characters"}, status=400)
            if new_pw:
                db_user.password_hash = make_password(new_pw)
                changed = True
                password_changed = True

        for k in ["name", "email", "role", "status", "permissions", "phone"]:
            if k in payload and payload[k] is not None:
                new_val = payload[k] if k != "role" else str(payload[k]).lower()
                setattr(db_user, "email" if k == "email" else k, new_val)
                if before_snapshot.get(k) != new_val:
                    changes[k] = {"from": before_snapshot.get(k), "to": new_val}
                changed = True
        if "role" in changes and "permissions" not in payload:
            old_defaults = set(role_permissions_for_role(before_snapshot.get("role") or ""))
            explicit = set(db_user.permissions or [])
            cleaned = sorted(list(explicit - old_defaults))
            if cleaned != (db_user.permissions or []):
                db_user.permissions = cleaned
                changes["permissions"] = {
                    "from": before_snapshot.get("permissions"),
                    "to": cleaned,
                }
                changed = True
        if changed:
            db_user.save()
            changed_fields = sorted(list(changes.keys()))
            if password_changed and "password" not in changed_fields:
                changed_fields.append("password")
            action_fields = ",".join(changed_fields) if changed_fields else "password"
            _log_user_action(
                request,
                actor=actor,
                target_user=db_user,
                action=f"User updated ({action_fields})",
                meta={
                    "userId": user_id,
                    "email": db_user.email,
                    "changes": changes,
                    "passwordChanged": password_changed,
                },
            )
        return JsonResponse({"success": True, "data": _safe_user_from_db(db_user)})
    except (OperationalError, ProgrammingError):
        pass

    if getattr(settings, "DISABLE_INMEM_FALLBACK", False):
        return JsonResponse(
            {"success": False, "message": "Service temporarily unavailable"},
            status=503,
        )

    idx = next((i for i, u in enumerate(USERS) if u.get("id") == user_id), -1)
    if idx == -1:
        return JsonResponse({"success": False, "message": "Not found"}, status=404)
    if request.method == "GET":
        return JsonResponse({"success": True, "data": USERS[idx]})
    if request.method == "DELETE":
        USERS.pop(idx)
        return JsonResponse({"success": True, "message": "Deleted"})
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    user = {**USERS[idx]}
    for k in ["name", "email", "role", "status", "permissions"]:
        if k in payload and payload[k] is not None:
            user[k] = payload[k] if k != "role" else str(payload[k]).lower()
    USERS[idx] = user
    return JsonResponse({"success": True, "data": user})


@require_http_methods(["PATCH"])
def user_status(request, user_id):
    user_id = str(user_id)
    try:
        from .models import AppUser
        _maybe_seed_from_memory()
        # Only admin can change status
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        token = auth.split(" ", 1)[1].strip()
        try:
            tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except Exception:
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        actor = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        if not actor or (actor.role or "").lower() != "admin":
            return JsonResponse(
                {
                    "success": False,
                    "message": "Your account can't access User Management, please contact the Admin",
                },
                status=403,
            )
        db_user = AppUser.objects.filter(id=user_id).first()
        if not db_user:
            raise OperationalError("not found")
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        status = (payload.get("status") or "").lower()
        if status not in {"active", "deactivated"}:
            return JsonResponse({"success": False, "message": "Invalid status"}, status=400)
        previous = db_user.status
        db_user.status = status
        db_user.save(update_fields=["status"])
        _log_user_action(
            request,
            actor=actor,
            target_user=db_user,
            action=f"User status updated to {status}",
            meta={"userId": user_id, "status": status, "previousStatus": previous},
        )
        return JsonResponse({"success": True, "data": _safe_user_from_db(db_user)})
    except (OperationalError, ProgrammingError):
        pass

    if getattr(settings, "DISABLE_INMEM_FALLBACK", False):
        return JsonResponse(
            {"success": False, "message": "Service temporarily unavailable"},
            status=503,
        )

    idx = next((i for i, u in enumerate(USERS) if u.get("id") == user_id), -1)
    if idx == -1:
        return JsonResponse({"success": False, "message": "Not found"}, status=404)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    status = (payload.get("status") or "").lower()
    if status not in {"active", "deactivated"}:
        return JsonResponse({"success": False, "message": "Invalid status"}, status=400)
    USERS[idx]["status"] = status
    return JsonResponse({"success": True, "data": USERS[idx]})


@require_http_methods(["PATCH"]) 
def user_role(request, user_id):
    user_id = str(user_id)
    try:
        from .models import AppUser
        _maybe_seed_from_memory()
        # Admin only
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        token = auth.split(" ", 1)[1].strip()
        try:
            tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except Exception:
            return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
        actor = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        if not actor or (actor.role or "").lower() != "admin":
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
        db_user = AppUser.objects.filter(id=user_id).first()
        if not db_user:
            raise OperationalError("not found")
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        role = (payload.get("role") or "").lower()
        if role not in ALLOWED_ROLES:
            return JsonResponse({"success": False, "message": "Invalid role"}, status=400)
        previous_role = (db_user.role or "").lower()
        old_defaults = set(role_permissions_for_role(previous_role))
        explicit = set(db_user.permissions or [])
        cleaned = sorted(list(explicit - old_defaults))

        db_user.role = role
        if cleaned != (db_user.permissions or []):
            db_user.permissions = cleaned
            db_user.save(update_fields=["role", "permissions"])
        else:
            db_user.save(update_fields=["role"])
        _log_user_action(
            request,
            actor=actor,
            target_user=db_user,
            action=f"User role updated to {role}",
            meta={"userId": user_id, "role": role, "previousRole": previous_role},
        )
        return JsonResponse({"success": True, "data": _safe_user_from_db(db_user)})
    except (OperationalError, ProgrammingError):
        pass

    idx = next((i for i, u in enumerate(USERS) if u.get("id") == user_id), -1)
    if idx == -1:
        return JsonResponse({"success": False, "message": "Not found"}, status=404)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    role = (payload.get("role") or "").lower()
    if role not in ALLOWED_ROLES:
        return JsonResponse({"success": False, "message": "Invalid role"}, status=400)
    USERS[idx]["role"] = role
    return JsonResponse({"success": True, "data": USERS[idx]})


@require_http_methods(["GET"]) 
def user_roles(request):
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    token = auth.split(" ", 1)[1].strip()
    try:
        tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    # Admin-only role config visibility
    actor_role = None
    try:
        from .models import AppUser
        actor = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        actor_role = (actor.role or "").lower() if actor else None
    except Exception:
        actor_role = (tp.get("role") or "").lower()
    if actor_role != "admin":
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    return JsonResponse({"success": True, "data": get_role_configs()})


@require_http_methods(["PUT"]) 
def user_role_config(request, value):
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    # Admin only can change role configs
    auth = request.META.get("HTTP_AUTHORIZATION", "")
    if not auth.startswith("Bearer "):
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    try:
        token = auth.split(" ", 1)[1].strip()
        tp = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        from .models import AppUser
        actor = AppUser.objects.filter(email=(tp.get("email") or "").lower()).first()
        if not actor or (actor.role or "").lower() != "admin":
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    except Exception:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)
    role_value = (value or payload.get("value") or "").lower()
    if not role_value:
        return JsonResponse({"success": False, "message": "Missing role value"}, status=400)
    # Restrict to the built-in roles only
    if role_value not in ALLOWED_ROLES:
        return JsonResponse({"success": False, "message": "Invalid role"}, status=400)

    existing = next((r for r in get_role_configs() if r.get("value") == role_value), None) or {}
    label = payload.get("label") or existing.get("label") or role_value.capitalize()
    description = payload.get("description") or existing.get("description") or ""
    if "permissions" in payload:
        permissions = normalize_role_permissions(role_value, payload.get("permissions"))
    else:
        permissions = normalize_role_permissions(role_value, existing.get("permissions") or [])

    cfg = {
        "label": label,
        "value": role_value,
        "description": description,
        "permissions": permissions,
    }

    old_defaults = set(role_permissions_for_role(role_value))
    try:
        from .models import RoleConfig, AppUser
        RoleConfig.objects.update_or_create(
            value=role_value,
            defaults={
                "label": label,
                "description": description,
                "permissions": permissions,
            },
        )
        _set_role_config_override(role_value, None)
        _invalidate_role_config_cache()

        # Normalize per-user explicit permissions so role changes apply immediately.
        if old_defaults:
            for user in AppUser.objects.filter(role=role_value):
                explicit = set(user.permissions or [])
                cleaned = sorted(list(explicit - old_defaults))
                if cleaned != (user.permissions or []):
                    user.permissions = cleaned
                    user.save(update_fields=["permissions"])
        return JsonResponse({"success": True, "data": cfg})
    except (OperationalError, ProgrammingError):
        if getattr(settings, "DISABLE_INMEM_FALLBACK", False):
            return JsonResponse(
                {"success": False, "message": "Service temporarily unavailable"},
                status=503,
            )
        _set_role_config_override(role_value, cfg)
        return JsonResponse({"success": True, "data": cfg})


__all__ = [
    "users",
    "user_detail",
    "user_status",
    "user_role",
    "user_roles",
    "user_role_config",
]
