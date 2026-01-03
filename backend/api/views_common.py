import json
import os
import uuid
import time
import functools
from datetime import datetime, timezone, timedelta
from django.http import JsonResponse
from django.conf import settings
from django.utils import timezone as dj_timezone
from django.core.files.base import ContentFile
from django.db.utils import OperationalError, ProgrammingError
import jwt
import base64
import re
import hashlib
import secrets

# -----------------------------
# Rate limit and lockout helpers
# -----------------------------

_RATE_BUCKETS = {}
FAILED_LOGIN_TRACK = {}


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _login_rate_key(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    email = (data.get("email") or "").lower().strip()
    return f"{_client_ip(request)}:{email}"


def _email_rate_key(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    email = (data.get("email") or "").lower().strip()
    return f"{_client_ip(request)}:{email}"


def _lockout_check_and_touch(email: str, ip: str, success: bool):
    now = int(time.time())
    key = (email or "", ip or "")
    rec = FAILED_LOGIN_TRACK.get(key)
    window = 10 * 60
    lock_seconds = 10 * 60
    threshold = 5

    if rec and rec.get("locked_until", 0) > now:
        return True, int(rec["locked_until"] - now)

    if success:
        if rec:
            FAILED_LOGIN_TRACK.pop(key, None)
        return False, 0

    if not rec or now - rec.get("first", now) > window:
        FAILED_LOGIN_TRACK[key] = {"first": now, "fail": 1, "locked_until": 0}
        return False, 0
    rec["fail"] = int(rec.get("fail", 0)) + 1
    if rec["fail"] >= threshold:
        rec["locked_until"] = now + lock_seconds
        return True, lock_seconds
    return False, 0


def _is_locked(email: str, ip: str):
    now = int(time.time())
    key = (email or "", ip or "")
    rec = FAILED_LOGIN_TRACK.get(key)
    if rec and rec.get("locked_until", 0) > now:
        return True, int(rec["locked_until"] - now)
    return False, 0


def rate_limit(limit=10, window_seconds=60, key_fn=None):
    def decorator(view_func):
        @functools.wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            now = time.time()
            key_base = key_fn(request) if key_fn else _client_ip(request)
            bucket_key = f"{key_base}:{request.path}:{request.method}:{window_seconds}:{limit}"
            bucket = _RATE_BUCKETS.get(bucket_key, [])
            threshold = now - window_seconds
            bucket = [t for t in bucket if t > threshold]
            if len(bucket) >= limit:
                oldest = min(bucket)
                retry_after = max(1, int(window_seconds - (now - oldest)))
                resp = JsonResponse({"success": False, "message": "Too many requests, slow down."})
                resp.status_code = 429
                resp["Retry-After"] = str(retry_after)
                return resp
            bucket.append(now)
            _RATE_BUCKETS[bucket_key] = bucket
            return view_func(request, *args, **kwargs)

        return _wrapped

    return decorator


# -----------------------------
# Small utils and in-memory stores
# -----------------------------

def _now_iso():
    return datetime.now(timezone.utc).isoformat()


MENU_ITEMS = []
USERS = []
ROLE_VALUES = {"admin", "manager", "staff", "faculty", "customer"}


def _paginate(list_data, page, limit):
    page = max(1, int(page or 1))
    limit = max(1, int(limit or 20))
    total = len(list_data)
    start = (page - 1) * limit
    end = start + limit
    return list_data[start:end], {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": max(1, (total + limit - 1) // limit),
    }



def _identifier_variants(value):
    """Return possible textual variants for a UUID/identifier.

    Covers dashed/non-dashed UUID forms plus the raw string so we can match
    legacy rows that persisted numeric IDs as text.
    """

    raw = str(value or "").strip()
    if not raw:
        return set()
    variants = {raw}
    lower = raw.lower()
    variants.add(lower)
    compact = raw.replace("-", "")
    if compact:
        variants.add(compact)
        variants.add(compact.lower())
    if lower:
        variants.add(lower.replace("-", ""))
    try:
        parsed = uuid.UUID(raw)
        variants.add(str(parsed))
        variants.add(parsed.hex)
    except Exception:
        pass
    return {v for v in variants if v}


def _safe_user_from_db(db_user):
    # Normalize role to the supported set; map legacy/unknown roles to 'staff'
    role = (getattr(db_user, "role", "") or "").lower()
    if role not in ROLE_VALUES:
        role = "staff"

    # Look up linked Employee record to include employeeId
    employee_id = None
    try:
        # Use the employee_profile reverse relation from the OneToOne field
        if hasattr(db_user, "employee_profile") and db_user.employee_profile:
            employee_id = str(db_user.employee_profile.id)
    except Exception:
        # If employee_profile doesn't exist or there's an error, leave as None
        employee_id = None

    explicit_permissions = getattr(db_user, "permissions", []) or []
    role_permissions = sorted(list(_role_permissions_from_config(role)))
    if role == "admin" or "all" in explicit_permissions or "all" in role_permissions:
        effective_permissions = ["all"]
    else:
        effective_permissions = sorted(list(set(role_permissions) | set(explicit_permissions)))

    return {
        "id": str(db_user.id),
        "employeeId": employee_id,
        "name": db_user.name,
        "email": db_user.email,
        "role": role,
        "status": db_user.status,
        "createdAt": (db_user.created_at or dj_timezone.now()).isoformat(),
        "lastLogin": db_user.last_login.isoformat() if db_user.last_login else None,
        "permissions": explicit_permissions,
        "rolePermissions": role_permissions,
        "effectivePermissions": effective_permissions,
        "avatar": getattr(db_user, "avatar", None) or None,
        "emailVerified": bool(getattr(db_user, "email_verified", False)),
        "phone": getattr(db_user, "phone", "") or "",
    }


def _maybe_seed_from_memory():
    try:
        from django.conf import settings as dj_settings
        # Do not auto-seed from in-memory fixtures when fallbacks are disabled (prod/staging)
        if getattr(dj_settings, "DISABLE_INMEM_FALLBACK", False):
            return
        from .models import AppUser
        if AppUser.objects.count() == 0 and USERS:
            for u in USERS:
                try:
                    from django.contrib.auth.hashers import make_password
                    AppUser.objects.create(
                        id=u.get("id") or uuid.uuid4(),
                        email=u.get("email"),
                        name=u.get("name") or (u.get("firstName", "") + " " + u.get("lastName", "")).strip() or "User",
                        role=u.get("role", "staff"),
                        status=u.get("status", "active"),
                        permissions=u.get("permissions") or [],
                        password_hash=make_password(u.get("password") or "") if u.get("password") else "",
                        avatar=u.get("avatar") or None,
                        email_verified=bool(u.get("emailVerified", True)),
                        phone=(u.get("phone") or u.get("contactNumber") or ""),
                    )
                except Exception:
                    continue
    except Exception:
        pass


# -----------------------------
# Role and permission helpers
# -----------------------------

# Canonical default permissions derived from AGENTS.md
DEFAULT_ROLE_PERMISSIONS = {
    # Admin implicitly has all permissions via wildcard
    "admin": {"all"},
    "manager": {
        # Account Management
        "account.login",
        "account.logout",
        "account.password.edit",
        "account.info.edit",
        "account.biometric",
        # Inventory Management
        "inventory.view",
        "inventory.update",
        "inventory.expiry.track",
        "inventory.menu.manage",  # Manage Menu Items
        "inventory.lowstock.alerts",
        "inventory.restock.manage",
        # Order Handling (manager handles queue and updates; tracking bulk too)
        "order.queue.handle",
        "order.status.update",
        "order.bulk.track",
        # Payments and Transactions
        "payment.process",
        "payment.records.view",
        "order.history.view",
        "payment.refund",
        # Staff and Work Scheduling
        "profile.view_roles",
        # Staff can view schedules, managers can manage
        "schedule.view_edit",
        "schedule.manage",
        "attendance.manage",
        "leave.manage",
        # Reports and Analytics
        "reports.dashboard.view",
        "reports.sales.view",
        "reports.inventory.view",
        "reports.orders.view",
        "reports.staff.view",
        "reports.customer.view",
        # Notifications
        "notification.send",
        "notification.receive",
        "notification.view",
        # Menu management (alias for clarity in endpoints)
        "menu.manage",
        # Catering module
        "catering.view",
        "catering.manage",
        # Employee directory management
        "employees.manage",
        # Verification review
        "verify.review",
    },
    "staff": {
        # Account Management
        "account.login",
        "account.logout",
        "account.password.edit",
        "account.info.edit",
        "account.biometric",
        # Inventory Management
        "inventory.view",
        "inventory.update",
        "inventory.expiry.track",
        # Order Handling
        "order.place",
        "order.status.view",
        "order.queue.handle",
        "order.status.update",
        "order.bulk.track",
        # Payments and Transactions
        "payment.process",
        "payment.records.view",
        "order.history.view",
        # Staff and Work Scheduling
        "profile.view_roles",
        # Staff can only view schedules
        "schedule.view_edit",
        # Notifications
        "notification.send",
        "notification.receive",
        "notification.view",
        # Catering module (view-only access)
        "catering.view",
        # Reports - Dashboard view
        "reports.dashboard.view",
    },
}

ROLE_ORDER = ["admin", "manager", "staff"]
ROLE_DEFINITIONS = {
    "admin": {
        "label": "Admin",
        "description": "Full access to all settings and functions",
    },
    "manager": {
        "label": "Manager",
        "description": "Manages inventory/menu, queue, refunds, and sees reports",
    },
    "staff": {
        "label": "Staff",
        "description": "Handles orders, inventory updates, and payments",
    },
}

_ROLE_CONFIG_CACHE = {"ts": 0, "data": None}
_ROLE_CONFIG_TTL_SECONDS = 30
_ROLE_CONFIG_OVERRIDES_MEM = {}


def _default_role_config_map():
    cfg = {}
    for role in ROLE_ORDER:
        meta = ROLE_DEFINITIONS.get(role, {})
        cfg[role] = {
            "label": meta.get("label") or role.capitalize(),
            "value": role,
            "description": meta.get("description") or "",
            "permissions": sorted(list(DEFAULT_ROLE_PERMISSIONS.get(role, set()))),
        }
    return cfg


def normalize_role_permissions(role_value, permissions):
    items = permissions if isinstance(permissions, (list, tuple, set)) else []
    clean = [p for p in items if isinstance(p, str)]
    if role_value == "admin":
        return ["all"]
    clean = [p for p in clean if p != "all"]
    return sorted(set(clean))


def _invalidate_role_config_cache():
    _ROLE_CONFIG_CACHE["ts"] = 0
    _ROLE_CONFIG_CACHE["data"] = None


def _set_role_config_override(role_value, cfg):
    if cfg is None:
        _ROLE_CONFIG_OVERRIDES_MEM.pop(role_value, None)
    else:
        _ROLE_CONFIG_OVERRIDES_MEM[role_value] = cfg
    _invalidate_role_config_cache()


def _load_role_config_map():
    now = time.time()
    cached = _ROLE_CONFIG_CACHE.get("data")
    cached_ts = _ROLE_CONFIG_CACHE.get("ts", 0)
    if cached and (now - cached_ts) < _ROLE_CONFIG_TTL_SECONDS:
        return cached

    cfg_map = _default_role_config_map()
    db_ok = False
    try:
        from .models import RoleConfig
        rows = RoleConfig.objects.all()
        db_ok = True
        for rc in rows:
            role_value = (rc.value or "").lower()
            if role_value not in cfg_map:
                continue
            base = cfg_map[role_value]
            perms = normalize_role_permissions(role_value, rc.permissions)
            cfg_map[role_value] = {
                "label": rc.label or base["label"],
                "value": role_value,
                "description": rc.description or base["description"],
                "permissions": perms,
            }
    except (OperationalError, ProgrammingError):
        db_ok = False
    except Exception:
        db_ok = False

    if not db_ok and _ROLE_CONFIG_OVERRIDES_MEM:
        for role_value, cfg in _ROLE_CONFIG_OVERRIDES_MEM.items():
            if role_value not in cfg_map:
                continue
            base = cfg_map[role_value]
            cfg_map[role_value] = {
                "label": cfg.get("label") or base["label"],
                "value": role_value,
                "description": cfg.get("description") or base["description"],
                "permissions": normalize_role_permissions(role_value, cfg.get("permissions")),
            }

    _ROLE_CONFIG_CACHE["data"] = cfg_map
    _ROLE_CONFIG_CACHE["ts"] = now
    return cfg_map


def get_role_configs():
    cfg_map = _load_role_config_map()
    return [cfg_map[role] for role in ROLE_ORDER if role in cfg_map]


def _role_permissions_from_config(role: str):
    role_l = (role or "").lower()
    cfg_map = _load_role_config_map()
    cfg = cfg_map.get(role_l)
    perms = cfg.get("permissions") if cfg else []
    perms = normalize_role_permissions(role_l, perms)
    if role_l == "admin" or "all" in perms:
        return {"all"}
    return set(perms)


def role_permissions_for_role(role: str):
    return sorted(list(_role_permissions_from_config(role)))


def _effective_permissions_from_role(role: str):
    return _role_permissions_from_config(role)


def _effective_permissions(user_or_dict):
    try:
        # DB model
        role = (getattr(user_or_dict, "role", "") or "").lower()
        explicit = set(getattr(user_or_dict, "permissions", []) or [])
    except Exception:
        # Dict-like
        role = (user_or_dict.get("role") or "").lower()
        explicit = set(user_or_dict.get("permissions") or [])
    # Admin wildcard
    if role == "admin" or "all" in explicit:
        return {"all"}
    # Union of defaults and explicit grants
    return _effective_permissions_from_role(role) | explicit


def _has_permission(user_or_dict, perm_code: str) -> bool:
    perms = _effective_permissions(user_or_dict)
    return "all" in perms or perm_code in perms


def _actor_from_token(token: str):
    """Decode JWT tokens issued by either our custom signer or SimpleJWT.

    Some deployments set DJANGO_JWT_SECRET (used by our auth) while SimpleJWT
    signs with SECRET_KEY. We attempt both to avoid false 401s when valid
    staff/manager/admin tokens hit endpoints like /api/orders/queue.
    """
    if not token:
        return None

    payload = None
    # Try both secrets (custom first, then SECRET_KEY for SimpleJWT)
    candidate_keys = [getattr(settings, "JWT_SECRET", None), getattr(settings, "SECRET_KEY", None)]
    seen_keys = set()
    for key in candidate_keys:
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        try:
            payload = jwt.decode(
                token,
                key,
                algorithms=list({settings.JWT_ALGORITHM, "HS256", "RS256"}),
                options={"verify_aud": False},
            )
            break
        except Exception:
            continue
    # As a last resort in dev, decode without verifying signature so staff/admin tokens
    # issued by other compatible services can pass. Still enforce exp if present.
    if not payload and getattr(settings, "DEBUG", False):
        try:
            payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
            exp = payload.get("exp")
            if exp and time.time() > float(exp):
                payload = None
        except Exception:
            payload = None
    if not payload:
        return None

    # Support both custom JWTs (sub/email) and SimpleJWT style tokens (user_id)
    email = (payload.get("email") or "").lower().strip()
    sub = str(payload.get("sub") or payload.get("user_id") or payload.get("userId") or "")

    try:
        from .models import AppUser
        _maybe_seed_from_memory()
        actor = None
        if sub:
            actor = AppUser.objects.filter(id=sub).first()
        if not actor and email:
            actor = AppUser.objects.filter(email=email).first()
        if actor:
            status_l = (getattr(actor, "status", "") or "").lower()
            if status_l == "deactivated" or getattr(actor, "is_active", True) is False:
                return None
            return actor
    except Exception:
        pass

    if email:
        actor = next((u for u in USERS if (u.get("email") or "").lower() == email), None)
        if actor:
            return actor
    if sub:
        actor = next((u for u in USERS if str(u.get("id")) == sub), None)
        if actor:
            return actor

    # Fallback: construct a lightweight actor from token claims so valid staff/manager/admin
    # tokens without a DB record can still authorize.
    if email or sub:
        return {
            "id": sub or email,
            "email": email,
            "role": (payload.get("role") or payload.get("user_role") or "staff"),
            "permissions": payload.get("permissions") or [],
        }
    return None

def _actor_from_request(request):
    """Extract the authenticated actor from Authorization header.

    Returns (actor, error_response) where actor is either AppUser instance or a
    dict from USERS fallback. If not authorized/invalid, returns (None, JsonResponse).
    """
    auth = request.META.get("HTTP_AUTHORIZATION", "") or ""
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1].strip()
        actor = _actor_from_token(token)
        if actor:
            return actor, None
    else:
        try:
            cfg = _auth_cookie_config()
            token = request.COOKIES.get(cfg["access_name"], "") or ""
            actor = _actor_from_token(token)
            if actor:
                return actor, None
        except Exception:
            pass

    # Fallback: allow Django-authenticated users (session/cookie) that carry role info
    try:
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            # Ensure we have role/email fields to drive permissions
            if getattr(user, "role", None) or getattr(user, "email", None):
                return user, None
    except Exception:
        pass

    return None, JsonResponse({"success": False, "message": "Unauthorized"}, status=401)


# Cookie helpers for httpOnly auth tokens
def _auth_cookie_config():
    samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax")
    if samesite not in {"Lax", "Strict", "None"}:
        samesite = "Lax"
    return {
        "access_name": getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "auth_access"),
        "refresh_name": getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "auth_refresh"),
        "secure": getattr(settings, "AUTH_COOKIE_SECURE", not getattr(settings, "DEBUG", False)),
        "domain": getattr(settings, "AUTH_COOKIE_DOMAIN", None),
        "path": getattr(settings, "AUTH_COOKIE_PATH", "/"),
        "samesite": samesite,
    }


def _set_auth_cookies(
    response,
    access_token,
    refresh_token,
    *,
    remember=False,
    access_max_age=None,
):
    if response is None:
        return response
    cfg = _auth_cookie_config()
    if access_token:
        response.set_cookie(
            cfg["access_name"],
            access_token,
            max_age=access_max_age,
            httponly=True,
            secure=cfg["secure"],
            samesite=cfg["samesite"],
            domain=cfg["domain"],
            path=cfg["path"],
        )
    if refresh_token:
        refresh_ttl = (
            settings.JWT_REFRESH_REMEMBER_EXP_SECONDS
            if remember
            else settings.JWT_REFRESH_EXP_SECONDS
        )
        response.set_cookie(
            cfg["refresh_name"],
            refresh_token,
            max_age=refresh_ttl,
            httponly=True,
            secure=cfg["secure"],
            samesite=cfg["samesite"],
            domain=cfg["domain"],
            path=cfg["path"],
        )
    return response


def _clear_auth_cookies(response):
    if response is None:
        return response
    cfg = _auth_cookie_config()
    response.delete_cookie(cfg["access_name"], domain=cfg["domain"], path=cfg["path"])
    response.delete_cookie(cfg["refresh_name"], domain=cfg["domain"], path=cfg["path"])
    return response


def _get_refresh_token_from_request(request):
    cfg = _auth_cookie_config()
    return request.COOKIES.get(cfg["refresh_name"], "") or ""


# JWT and token helpers
# -----------------------------

def _issue_jwt(db_user, exp_seconds=None):
    now = int(time.time())
    if exp_seconds is None:
        exp_seconds = getattr(settings, "JWT_EXP_SECONDS", 3600)
    exp = now + int(exp_seconds)
    payload = {
        "sub": str(db_user.id),
        "email": db_user.email,
        "role": db_user.role,
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_jwt_from_dict(user_dict, exp_seconds=None):
    now = int(time.time())
    if exp_seconds is None:
        exp_seconds = getattr(settings, "JWT_EXP_SECONDS", 3600)
    exp = now + int(exp_seconds)
    payload = {
        "sub": str(user_dict.get("id")),
        "email": user_dict.get("email"),
        "role": user_dict.get("role", "staff"),
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_jwt_from_payload(payload):
    now = int(time.time())
    exp = now + getattr(settings, "JWT_EXP_SECONDS", 3600)
    new_payload = {
        "sub": str(payload.get("sub")),
        "email": payload.get("email"),
        "role": payload.get("role", "staff"),
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(new_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_verify_token_from_db(db_user):
    now = int(time.time())
    exp = now + 15 * 60
    payload = {"typ": "verify", "sub": str(db_user.id), "email": db_user.email, "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_verify_token_from_dict(user_dict):
    now = int(time.time())
    exp = now + 15 * 60
    payload = {"typ": "verify", "sub": str(user_dict.get("id")), "email": user_dict.get("email"), "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_emailverify_token_from_db(db_user):
    now = int(time.time())
    exp = now + 24 * 60 * 60
    payload = {"typ": "emailverify", "sub": str(db_user.id), "email": db_user.email, "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_emailverify_token_from_dict(user_dict):
    now = int(time.time())
    exp = now + 24 * 60 * 60
    payload = {"typ": "emailverify", "sub": str(user_dict.get("id")), "email": user_dict.get("email"), "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode_emailverify_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("typ") != "emailverify":
            return None
        return payload
    except Exception:
        return None


def _issue_pwdreset_token_from_db(db_user):
    now = int(time.time())
    exp = now + 15 * 60
    payload = {"typ": "pwdreset", "sub": str(db_user.id), "email": db_user.email, "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _issue_pwdreset_token_from_dict(user_dict):
    now = int(time.time())
    exp = now + 15 * 60
    payload = {"typ": "pwdreset", "sub": str(user_dict.get("id")), "email": user_dict.get("email"), "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode_pwdreset_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("typ") != "pwdreset":
            return None
        return payload
    except Exception:
        return None


def _issue_pwdcommit_token_from_db(db_user, reset_token_id: str, ttl_seconds: int = 5 * 60):
    now = int(time.time())
    exp = now + int(ttl_seconds)
    payload = {"typ": "pwdcommit", "sub": str(db_user.id), "email": db_user.email, "rid": str(reset_token_id), "iat": now, "exp": exp}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode_pwdcommit_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("typ") != "pwdcommit":
            return None
        return payload
    except Exception:
        return None


def _decode_verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("typ") != "verify":
            return None
        return payload
    except Exception:
        return None


def _decode_verify_token_ignore_exp(token: str):
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        if payload.get("typ") != "verify":
            return None
        return payload
    except Exception:
        return None


def _extract_dataurl_image(data_url: str):
    if not data_url:
        return None, None
    m = re.match(r"^data:([^;]+);base64,(.*)$", data_url, re.DOTALL)
    if not m:
        # Fallback: accept raw base64 without data URL prefix
        cleaned = re.sub(r"\s+", "", str(data_url))
        if not cleaned:
            return None, None
        padding = len(cleaned) % 4
        if padding:
            cleaned += "=" * (4 - padding)
        try:
            binary = base64.b64decode(cleaned)
            return None, binary
        except Exception:
            return None, None
    mime = m.group(1)
    b64 = re.sub(r"\s+", "", m.group(2))
    padding = len(b64) % 4
    if padding:
        b64 += "=" * (4 - padding)
    try:
        binary = base64.b64decode(b64)
        return mime, binary
    except Exception:
        return None, None


# -----------------------------
# Refresh token helpers (DB + in-memory fallback)
# -----------------------------

def _client_meta(request):
    try:
        ua = request.META.get("HTTP_USER_AGENT", "")[:255]
        ip = request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR") or ""
        ip = (ip.split(",")[0].strip() if "," in ip else ip)[:64]
        return ua, ip
    except Exception:
        return "", ""


def _issue_refresh_token_db(db_user, remember=False, request=None, rotated_from=None):
    try:
        from .models import RefreshToken
        raw = secrets.token_urlsafe(48)
        rhash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        ttl = getattr(settings, "JWT_REFRESH_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60) if remember else getattr(settings, "JWT_REFRESH_EXP_SECONDS", 7 * 24 * 60 * 60)
        ua, ip = _client_meta(request) if request is not None else ("", "")
        RefreshToken.objects.create(
            user=db_user,
            token_hash=rhash,
            remember=bool(remember),
            expires_at=dj_timezone.now() + timedelta(seconds=int(ttl)),
            rotated_from=rotated_from,
            user_agent=ua,
            ip_address=ip,
        )
        return raw
    except Exception:
        safe_user = _safe_user_from_db(db_user)
        return _issue_refresh_token_mem(safe_user, remember=remember, request=request)


_REFRESH_TOKENS_MEM = {}


def _issue_refresh_token_mem(user_dict, remember=False, request=None):
    raw = secrets.token_urlsafe(48)
    ttl = getattr(settings, "JWT_REFRESH_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60) if remember else getattr(settings, "JWT_REFRESH_EXP_SECONDS", 7 * 24 * 60 * 60)
    now = int(time.time())
    exp = now + int(ttl)
    _REFRESH_TOKENS_MEM[raw] = {
        "sub": str(user_dict.get("id")),
        "email": (user_dict.get("email") or "").lower().strip(),
        "remember": bool(remember),
        "exp": exp,
        "revoked": False,
    }
    return raw


def _rotate_refresh_token_mem(raw, request=None):
    entry = _REFRESH_TOKENS_MEM.get(raw)
    if not entry or entry.get("revoked"):
        return None
    now = int(time.time())
    if now >= int(entry.get("exp", 0)):
        return None
    entry["revoked"] = True
    user_dict = {"id": entry.get("sub"), "email": entry.get("email"), "role": "staff"}
    new_raw = _issue_refresh_token_mem(user_dict, remember=entry.get("remember", False), request=request)
    access_ttl = getattr(settings, "JWT_REMEMBER_EXP_SECONDS", 30 * 24 * 60 * 60) if entry.get("remember") else getattr(settings, "JWT_EXP_SECONDS", 3600)
    new_access = _issue_jwt_from_dict(user_dict, exp_seconds=access_ttl)
    return {"token": new_access, "refreshToken": new_raw}


def _revoke_refresh_token(request, raw):
    try:
        from .models import RefreshToken
        rhash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        rt = RefreshToken.objects.filter(token_hash=rhash, revoked_at__isnull=True).first()
        if rt:
            rt.revoked_at = dj_timezone.now()
            rt.save(update_fields=["revoked_at"])
            return True
    except Exception:
        pass
    if raw in _REFRESH_TOKENS_MEM:
        _REFRESH_TOKENS_MEM[raw]["revoked"] = True
        return True
    return False


def _revoke_all_refresh_tokens(db_user):
    try:
        from .models import RefreshToken
        RefreshToken.objects.filter(user=db_user, revoked_at__isnull=True).update(revoked_at=dj_timezone.now())
    except Exception:
        pass
    try:
        sub = str(getattr(db_user, "id", ""))
        email = (getattr(db_user, "email", "") or "").lower().strip()
        for raw, entry in list(_REFRESH_TOKENS_MEM.items()):
            if entry.get("revoked"):
                continue
            if entry.get("sub") == sub or (email and entry.get("email") == email):
                entry["revoked"] = True
    except Exception:
        pass


def _revoke_all_refresh_tokens_mem(user_dict):
    try:
        sub = str(user_dict.get("id") or "")
        email = (user_dict.get("email") or "").lower().strip()
        for raw, entry in list(_REFRESH_TOKENS_MEM.items()):
            if entry.get("revoked"):
                continue
            if entry.get("sub") == sub or (email and entry.get("email") == email):
                entry["revoked"] = True
    except Exception:
        pass


def _require_admin_or_manager(db_user):
    try:
        role = (getattr(db_user, "role", "") or "").lower()
        return role in {"admin", "manager"}
    except Exception:
        return False
