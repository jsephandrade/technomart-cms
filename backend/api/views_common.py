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
    if role not in {"admin", "manager", "staff"}:
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

    return {
        "id": str(db_user.id),
        "employeeId": employee_id,
        "name": db_user.name,
        "email": db_user.email,
        "role": role,
        "status": db_user.status,
        "createdAt": (db_user.created_at or dj_timezone.now()).isoformat(),
        "lastLogin": db_user.last_login.isoformat() if db_user.last_login else None,
        "permissions": getattr(db_user, "permissions", []) or [],
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


def _effective_permissions_from_role(role: str):
    role_l = (role or "").lower()
    return set(DEFAULT_ROLE_PERMISSIONS.get(role_l, set()))


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
    """Extract the authenticated actor from Authorization header or auth cookie.

    Returns (actor, error_response) where actor is either AppUser instance or a
    dict from USERS fallback. If not authorized/invalid, returns (None, JsonResponse).
    """
    token = _get_request_auth_token(request)
    if token:
        actor = _actor_from_token(token)
        if actor:
            return actor, None

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


def _auth_cookie_enabled() -> bool:
    return bool(getattr(settings, "AUTH_COOKIE_ENABLED", False))


def _get_request_auth_token(request):
    auth = request.META.get("HTTP_AUTHORIZATION", "") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()

    if not _auth_cookie_enabled():
        return None

    cookie_name = getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "authToken")
    token = request.COOKIES.get(cookie_name) or ""
    return token or None


def _set_auth_cookies(
    response,
    *,
    access_token: str | None = None,
    refresh_token: str | None = None,
    access_max_age: int | None = None,
    refresh_max_age: int | None = None,
):
    if not _auth_cookie_enabled():
        return response

    secure = bool(getattr(settings, "AUTH_COOKIE_SECURE", False))
    samesite = getattr(settings, "AUTH_COOKIE_SAMESITE", "Lax")
    domain = getattr(settings, "AUTH_COOKIE_DOMAIN", "") or None
    path = getattr(settings, "AUTH_COOKIE_PATH", "/") or "/"

    access_name = getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "authToken")
    refresh_name = getattr(settings, "AUTH_COOKIE_REFRESH_NAME", "refreshToken")

    if access_token:
        response.set_cookie(
            access_name,
            access_token,
            max_age=access_max_age,
            httponly=True,
            secure=secure,
            samesite=samesite,
            domain=domain,
            path=path,
        )

    if refresh_token:
        response.set_cookie(
            refresh_name,
            refresh_token,
            max_age=refresh_max_age,
            httponly=True,
            secure=secure,
            samesite=samesite,
            domain=domain,
            path=path,
        )

    return response


def _clear_auth_cookies(response):
    if not _auth_cookie_enabled():
        return response

    domain = getattr(settings, "AUTH_COOKIE_DOMAIN", "") or None
    path = getattr(settings, "AUTH_COOKIE_PATH", "/") or "/"

    access_name = getattr(settings, "AUTH_COOKIE_ACCESS_NAME", "authToken")
    refresh_name = getattr(settings, "AUTH_COOKIE_REFRESH_NAME", "refreshToken")

    response.delete_cookie(access_name, domain=domain, path=path)
    response.delete_cookie(refresh_name, domain=domain, path=path)
    return response


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
    m = re.match(r"^data:([^;]+);base64,(.*)$", data_url)
    if not m:
        return None, None
    mime = m.group(1)
    b64 = m.group(2)
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
    return {
        "token": new_access,
        "refreshToken": new_raw,
        "remember": bool(entry.get("remember")),
    }


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
