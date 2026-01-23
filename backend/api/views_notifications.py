"""Notification endpoints: list, create, mark read, mark all read, delete.

DB-backed when available; safe fallbacks if DB not yet migrated.
"""

import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils import timezone as dj_timezone
from django.db.utils import OperationalError, ProgrammingError

from .views_common import _actor_from_request, _has_permission, rate_limit


NOTIFS_MEM = []


def _serialize_db(n):
    return {
        "id": str(n.id),
        "title": n.title,
        "message": n.message or "",
        "type": n.type or "info",
        "read": bool(n.read),
        "createdAt": (n.created_at or dj_timezone.now()).isoformat(),
    }


def _serialize_mem(e):
    return {
        "id": str(e.get("id")),
        "title": e.get("title") or "Notification",
        "message": e.get("message") or "",
        "type": e.get("type") or "info",
        "read": bool(e.get("read")),
        "createdAt": e.get("createdAt") or dj_timezone.now().isoformat(),
    }

ADMIN_NOTIFICATION_EVENT_TYPES = {
    "new_user_registration",
    "role_changed",
    "verification_submitted",
    "verification_approved",
    "verification_rejected",
    "system_maintenance",
    "backup_completed",
    "backup_failed",
    "test_notification",
}

def _actor_role(actor):
    try:
        role = getattr(actor, "role", "")
    except Exception:
        role = ""
    if not role and isinstance(actor, dict):
        role = actor.get("role") or ""
    return str(role or "").lower()

def _wants_admin_scope(request, actor):
    scope = (request.GET.get("scope") or request.GET.get("category") or "").lower()
    return scope == "admin" and _actor_role(actor) == "admin"


@require_http_methods(["GET", "POST"])  # list or create
@rate_limit(limit=120, window_seconds=60)
def notifications(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    # GET list
    if request.method == "GET":
        limit = int(request.GET.get("limit") or 50)
        page = int(request.GET.get("page") or 1)
        read_q = (request.GET.get("read") or "").strip().lower()
        read_filter = None
        if read_q in {"true", "1", "yes"}:
            read_filter = True
        elif read_q in {"false", "0", "no"}:
            read_filter = False
        try:
            from .models import Notification
            qs = Notification.objects.filter(user=actor).order_by("-created_at")
            if read_filter is not None:
                qs = qs.filter(read=read_filter)
            if _wants_admin_scope(request, actor):
                qs = qs.filter(meta__event_type__in=ADMIN_NOTIFICATION_EVENT_TYPES)
            total = qs.count()
            start = max(0, (page - 1) * max(1, limit))
            end = start + max(1, limit)
            items = [_serialize_db(x) for x in qs[start:end]]
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
        except (OperationalError, ProgrammingError):
            pass
        # Memory fallback filtered to actor (email match not stored; show all)
        mem_items = list(NOTIFS_MEM)
        if _wants_admin_scope(request, actor):
            filtered = []
            for item in mem_items:
                meta = item.get("meta") or {}
                event_type = str(meta.get("event_type") or "").lower()
                if event_type and event_type in ADMIN_NOTIFICATION_EVENT_TYPES:
                    filtered.append(item)
            mem_items = filtered
        if read_filter is not None:
            mem_items = [
                item for item in mem_items if bool(item.get("read")) is read_filter
            ]
        items = [
            _serialize_mem(x)
            for x in sorted(mem_items, key=lambda y: y.get("createdAt", ""), reverse=True)
        ]
        total = len(items)
        start = max(0, (page - 1) * max(1, limit))
        end = start + max(1, limit)
        return JsonResponse({
            "success": True,
            "data": items[start:end],
            "pagination": {"page": page, "limit": limit, "total": total, "totalPages": max(1, (total + limit - 1) // limit)},
        })

    # POST create new notification (requires permission)
    try:
        if not _has_permission(actor, "notification.send"):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    except Exception:
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    title = (data.get("title") or "").strip() or "Notification"
    message = (data.get("message") or "").strip()
    ntype = (data.get("type") or "info").lower()
    user_id = str(data.get("userId") or "").strip()

    # Resolve recipient
    recip = None
    try:
        from .models import AppUser
        if user_id:
            recip = AppUser.objects.filter(id=user_id).first()
        if not recip:
            recip = actor if hasattr(actor, "id") else None
    except Exception:
        recip = None

    try:
        from .models import Notification, NotificationPreference
        if not recip:
            return JsonResponse({"success": False, "message": "Recipient not found"}, status=400)
        # Always store the record
        n = Notification.objects.create(user=recip, title=title, message=message, type=ntype)
        # Optional push send according to preferences
        # Enqueue outbox for push delivery (processed by worker/command)
        try:
            pref, _ = NotificationPreference.objects.get_or_create(user=recip)
        except Exception:
            pref = None
        try:
            if pref is None or getattr(pref, "push_enabled", False):
                from .models import NotificationOutbox
                NotificationOutbox.objects.create(user=recip, title=title, message=message)
        except Exception:
            pass
        return JsonResponse({"success": True, "data": _serialize_db(n)})
    except Exception:
        pass

    # Memory fallback
    from uuid import uuid4
    e = {"id": uuid4().hex, "title": title, "message": message, "type": ntype, "read": False, "createdAt": dj_timezone.now().isoformat()}
    NOTIFS_MEM.append(e)
    return JsonResponse({"success": True, "data": _serialize_mem(e)})


@require_http_methods(["POST"])  # mark single as read
def notification_read(request, notif_id: str):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Notification
        n = Notification.objects.filter(id=notif_id, user=actor).first()
        if not n:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        if not n.read:
            n.read = True
            n.save(update_fields=["read"])
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    # Memory fallback
    for e in NOTIFS_MEM:
        if str(e.get("id")) == str(notif_id):
            e["read"] = True
            break
    return JsonResponse({"success": True})


@require_http_methods(["POST"])  # mark all as read
def notifications_mark_all(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Notification
        Notification.objects.filter(user=actor, read=False).update(read=True)
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    for e in NOTIFS_MEM:
        e["read"] = True
    return JsonResponse({"success": True})


@require_http_methods(["DELETE"])  # delete a notification
def notification_delete(request, notif_id: str):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Notification
        n = Notification.objects.filter(id=notif_id, user=actor).first()
        if not n:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        n.delete()
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    # Memory fallback
    before = len(NOTIFS_MEM)
    NOTIFS_MEM[:] = [x for x in NOTIFS_MEM if str(x.get("id")) != str(notif_id)]
    return JsonResponse({"success": True, "deleted": before - len(NOTIFS_MEM)})


__all__ = [
    "notifications",
    "notification_read",
    "notifications_mark_all",
    "notification_delete",
]


@require_http_methods(["GET", "PUT"])  # user preferences
def notifications_settings(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import NotificationPreference
        pref, _ = NotificationPreference.objects.get_or_create(user=actor)
        if request.method == "GET":
            return JsonResponse({
                "success": True,
                "data": {
                    "emailEnabled": bool(pref.email_enabled),
                    "pushEnabled": bool(pref.push_enabled),
                    "lowStock": bool(pref.low_stock),
                    "order": bool(pref.order),
                    "payment": bool(pref.payment),
                },
            })
        # PUT: update
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            data = {}
        def _getb(k, curr):
            v = data.get(k)
            if isinstance(v, bool):
                return v
            if isinstance(v, (int, str)):
                s = str(v).lower()
                if s in {"1", "true", "yes", "on"}:
                    return True
                if s in {"0", "false", "no", "off"}:
                    return False
            return curr
        pref.email_enabled = _getb("emailEnabled", pref.email_enabled)
        pref.push_enabled = _getb("pushEnabled", pref.push_enabled)
        pref.low_stock = _getb("lowStock", pref.low_stock)
        pref.order = _getb("order", pref.order)
        pref.payment = _getb("payment", pref.payment)
        pref.save()
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    # Memory fallback: store in NOTIFS_MEM as a single dict keyed by actor
    key = f"pref:{getattr(actor, 'email', '')}"
    curr = next((x for x in NOTIFS_MEM if x.get("id") == key), None)
    if request.method == "GET":
        data = curr.get("data") if curr else None
        if not data:
            data = {"emailEnabled": True, "pushEnabled": False, "lowStock": True, "order": True, "payment": True}
        return JsonResponse({"success": True, "data": data})
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    if curr:
        curr["data"] = {**curr.get("data", {}), **data}
    else:
        NOTIFS_MEM.append({"id": key, "data": data})
    return JsonResponse({"success": True})


@require_http_methods(["GET"])  # return VAPID public key if configured
def notifications_push_public_key(request):
    try:
        from django.conf import settings
        pub = getattr(settings, "WEBPUSH_VAPID_PUBLIC_KEY", "") or ""
    except Exception:
        pub = ""
    return JsonResponse({"success": True, "data": {"publicKey": pub}})


@require_http_methods(["POST"])  # subscribe or update
def notifications_push_subscribe(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    endpoint = (data.get("endpoint") or "").strip()
    keys = data.get("keys") or {}
    p256dh = (keys.get("p256dh") or "").strip()
    auth = (keys.get("auth") or "").strip()
    exp_raw = data.get("expirationTime")
    if not endpoint or not p256dh or not auth:
        return JsonResponse({"success": False, "message": "Invalid subscription"}, status=400)
    exp = None
    try:
        if exp_raw:
            # exp_raw can be ms epoch or ISO
            if isinstance(exp_raw, (int, float)):
                exp = dj_timezone.datetime.fromtimestamp(float(exp_raw) / 1000.0, tz=dj_timezone.utc)
            elif isinstance(exp_raw, str):
                exp = dj_timezone.datetime.fromisoformat(exp_raw.replace("Z", "+00:00"))
    except Exception:
        exp = None
    ua = request.META.get("HTTP_USER_AGENT", "")[:255]
    try:
        from .models import WebPushSubscription
        sub = WebPushSubscription.objects.filter(endpoint=endpoint).first()
        if sub:
            sub.user = actor
            sub.p256dh = p256dh
            sub.auth = auth
            sub.expiration_time = exp
            sub.user_agent = ua
            sub.active = True
            sub.save(update_fields=["user", "p256dh", "auth", "expiration_time", "user_agent", "active", "updated_at"])
        else:
            sub = WebPushSubscription.objects.create(
                user=actor,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                expiration_time=exp,
                user_agent=ua,
                active=True,
            )
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    return JsonResponse({"success": True})


@require_http_methods(["DELETE", "POST"])  # unsubscribe (accepts either verb)
def notifications_push_unsubscribe(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    endpoint = (data.get("endpoint") or "").strip()
    if not endpoint:
        return JsonResponse({"success": False, "message": "Missing endpoint"}, status=400)
    try:
        from .models import WebPushSubscription
        sub = WebPushSubscription.objects.filter(endpoint=endpoint, user=actor).first()
        if sub:
            sub.active = False
            sub.save(update_fields=["active", "updated_at"])
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    return JsonResponse({"success": True})


@require_http_methods(["POST"])  # trigger test notification
@rate_limit(limit=10, window_seconds=60)  # Max 10 test notifications per minute
def notifications_test_trigger(request):
    """Trigger a test notification for testing purposes"""
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}

    notification_type = (data.get("type") or "info").lower()
    if notification_type not in ['info', 'success', 'warning', 'error']:
        notification_type = 'info'

    try:
        from .notification_triggers import trigger_test_notification
        success = trigger_test_notification(actor.id, notification_type)

        if success:
            return JsonResponse({
                "success": True,
                "message": f"Test {notification_type} notification triggered successfully"
            })
        else:
            return JsonResponse({
                "success": False,
                "message": "Failed to trigger notification"
            }, status=500)

    except Exception as e:
        return JsonResponse({
            "success": False,
            "message": f"Error triggering notification: {str(e)}"
        }, status=500)
