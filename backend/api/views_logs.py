"""Activity log endpoints: list/create logs, summary, alerts.

DB-backed when available; falls back to in-memory list when DB is not ready.
"""

import json
from datetime import timedelta, datetime
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone as dj_timezone

from .views_common import _actor_from_request, _require_admin_or_manager, _client_meta


LOGS_MEM = []  # in-memory fallback: list of dicts


def _serialize_db(log):
    try:
        user_obj = log.user
    except Exception:
        user_obj = None

    user_email = getattr(user_obj, "email", None) or getattr(log, "actor_email", "") or ""
    user_id = ""
    try:
        user_id = str(getattr(user_obj, "id", "") or getattr(log, "user_id", "") or "")
    except Exception:
        user_id = str(getattr(log, "user_id", "") or "")

    return {
        "id": str(log.id),
        "action": log.action,
        "user": user_email,
        "userId": user_id,
        "type": log.type,
        "timestamp": (log.created_at or dj_timezone.now()).isoformat(),
        "details": log.details or "",
        "severity": log.severity or "",
        "ip": log.ip_address or "",
        "userAgent": log.user_agent or "",
        "meta": log.meta or {},
    }


def _serialize_mem(entry):
    return {
        "id": str(entry.get("id")),
        "action": entry.get("action") or "",
        "user": entry.get("user") or entry.get("actorEmail") or "",
        "userId": entry.get("userId") or "",
        "type": entry.get("type") or "action",
        "timestamp": entry.get("timestamp") or dj_timezone.now().isoformat(),
        "details": entry.get("details") or "",
        "severity": entry.get("severity") or "",
        "ip": entry.get("ip") or "",
        "userAgent": entry.get("userAgent") or "",
        "meta": entry.get("meta") or {},
    }


def _parse_timerange(val: str):
    now = dj_timezone.now()
    val = (val or "").lower()
    if val == "24h":
        return now - timedelta(hours=24)
    if val == "7d":
        return now - timedelta(days=7)
    if val == "30d":
        return now - timedelta(days=30)
    return None


@require_http_methods(["GET", "POST"]) 
def logs(request):
    # Authorization: manager or admin can view; any authenticated user may create
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    if request.method == "POST":
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            data = {}
        action = (data.get("action") or "").strip() or "Activity"
        ltype = (data.get("type") or "action").lower()
        details = (data.get("details") or "").strip()
        severity = (data.get("severity") or "").lower()
        meta = data.get("meta") or {}
        ua, ip = _client_meta(request)

        try:
            from .models import AuditLog, AppUser
            # Try to resolve actor to DB user (actor may be dict fallback)
            db_actor = None
            try:
                email = (getattr(actor, "email", None) or actor.get("email") or "").lower().strip()
            except Exception:
                email = ""
            if email:
                db_actor = AppUser.objects.filter(email=email).first()
            log = AuditLog.objects.create(
                user=db_actor,
                actor_email=email,
                type=ltype if ltype in {c[0] for c in AuditLog.TYPE_CHOICES} else AuditLog.TYPE_ACTION,
                action=action,
                details=details,
                severity=severity,
                ip_address=ip,
                user_agent=ua,
                meta=meta,
            )
            return JsonResponse({"success": True, "data": _serialize_db(log)})
        except Exception:
            pass

        # Fallback memory
        from uuid import uuid4
        email = None
        try:
            email = (getattr(actor, "email", None) or actor.get("email") or "").lower().strip()
        except Exception:
            email = ""
        # Attempt to carry a userId in memory mode if available on actor
        user_id_mem = ""
        try:
            user_id_mem = str(getattr(actor, "id", "") or actor.get("id") or "")
        except Exception:
            user_id_mem = ""
        entry = {
            "id": uuid4().hex,
            "action": action,
            "user": email or "",
            "userId": user_id_mem,
            "type": ltype,
            "timestamp": dj_timezone.now().isoformat(),
            "details": details,
            "severity": severity,
            "ip": ip,
            "userAgent": ua,
            "meta": meta,
        }
        LOGS_MEM.append(entry)
        return JsonResponse({"success": True, "data": _serialize_mem(entry)})

    # GET: list logs (manager/admin only)
    try:
        is_mgr = False
        try:
            # actor is DB user or dict; reuse helper for admin/manager check if possible
            from .models import AppUser
            if hasattr(actor, "id"):
                is_mgr = _require_admin_or_manager(actor)
            else:
                # dict fallback
                role = (actor.get("role") or "").lower()
                is_mgr = role in {"admin", "manager"}
        except Exception:
            is_mgr = False
        if not is_mgr:
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        search = (request.GET.get("search") or request.GET.get("q") or "").strip().lower()
        tp = (request.GET.get("type") or "").lower()
        time_range = request.GET.get("timeRange") or request.GET.get("range") or ""
        page = int(request.GET.get("page") or 1)
        limit = int(request.GET.get("limit") or 20)

        try:
            from .models import AuditLog
            qs = AuditLog.objects.all()
            if tp:
                qs = qs.filter(type=tp)
            start = _parse_timerange(time_range)
            if start:
                qs = qs.filter(created_at__gte=start)
            if search:
                from django.db.models import Q
                qs = qs.filter(
                    Q(action__icontains=search)
                    | Q(details__icontains=search)
                    | Q(actor_email__icontains=search)
                )
            qs = qs.order_by("-created_at")
            total = qs.count()
            page = max(1, page)
            limit = max(1, limit)
            start_i = (page - 1) * limit
            end_i = start_i + limit
            items = [_serialize_db(x) for x in qs[start_i:end_i]]
            return JsonResponse(
                {
                    "success": True,
                    "data": items,
                    "pagination": {
                        "page": page,
                        "limit": limit,
                        "total": total,
                        "totalPages": max(1, (total + limit - 1) // limit),
                    },
                }
            )
        except (OperationalError, ProgrammingError):
            pass

        # Memory fallback
        items = []
        for e in LOGS_MEM:
            if tp and (e.get("type") or "").lower() != tp:
                continue
            if time_range:
                # LOGS_MEM timestamp is ISO
                start = _parse_timerange(time_range)
                if start:
                    try:
                        ts = dj_timezone.make_aware(dj_timezone.datetime.fromisoformat(e.get("timestamp").replace("Z", "+00:00")))
                    except Exception:
                        ts = dj_timezone.now()
                    if ts < start:
                        continue
            if search:
                sblob = (f"{e.get('action','')} {e.get('user','')} {e.get('details','')}" or "").lower()
                if search not in sblob:
                    continue
            items.append(_serialize_mem(e))
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        total = len(items)
        page = max(1, page)
        limit = max(1, limit)
        start_i = (page - 1) * limit
        end_i = start_i + limit
        page_items = items[start_i:end_i]
        return JsonResponse(
            {
                "success": True,
                "data": page_items,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": max(1, (total + limit - 1) // limit),
                },
            }
        )
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to fetch logs"}, status=500)


@require_http_methods(["GET"]) 
def logs_summary(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    # manager/admin only
    is_mgr = False
    try:
        from .models import AppUser
        if hasattr(actor, "id"):
            is_mgr = _require_admin_or_manager(actor)
        else:
            role = (actor.get("role") or "").lower()
            is_mgr = role in {"admin", "manager"}
    except Exception:
        is_mgr = False
    if not is_mgr:
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    def _window_counts(start_delta_days):
        start = dj_timezone.now() - timedelta(days=start_delta_days)
        try:
            from .models import AuditLog
            qs = AuditLog.objects.filter(created_at__gte=start)
            out = {"login": 0, "action": 0, "system": 0, "security": 0}
            from django.db import models
            for tp, cnt in qs.values_list("type").annotate(c=models.Count("id")):
                out[tp] = cnt
            return out
        except Exception:
            out = {"login": 0, "action": 0, "system": 0, "security": 0}
            for e in LOGS_MEM:
                try:
                    ts = dj_timezone.make_aware(datetime.fromisoformat(e.get("timestamp").replace("Z", "+00:00")))
                except Exception:
                    ts = dj_timezone.now()
                if ts >= start:
                    tp = (e.get("type") or "action").lower()
                    if tp in out:
                        out[tp] += 1
            return out

    data = {
        "today": _window_counts(1),
        "week": _window_counts(7),
        "month": _window_counts(30),
    }
    return JsonResponse({"success": True, "data": data})


@require_http_methods(["GET"]) 
def logs_alerts(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    # manager/admin only
    is_mgr = False
    try:
        from .models import AppUser
        if hasattr(actor, "id"):
            is_mgr = _require_admin_or_manager(actor)
        else:
            role = (actor.get("role") or "").lower()
            is_mgr = role in {"admin", "manager"}
    except Exception:
        is_mgr = False
    if not is_mgr:
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        from .models import AuditLog
        qs = AuditLog.objects.filter(type="security").order_by("-created_at")[:20]
        out = []
        for l in qs:
            sev = (l.severity or "").lower()
            if sev not in {"warning", "critical"}:
                continue
            item = _serialize_db(l)
            out.append(
                {
                    "id": item.get("id") or str(l.id),
                    "type": "critical" if sev == "critical" else "warning",
                    "severity": sev,
                    "title": item.get("action") or l.action,
                    "description": item.get("details") or l.details or "",
                    "timestamp": item.get("timestamp") or l.created_at.isoformat(),
                    "user": item.get("user") or "",
                    "userId": item.get("userId") or "",
                    "ip": item.get("ip") or "",
                    "meta": item.get("meta") or {},
                }
            )
        return JsonResponse({"success": True, "data": out})
    except (OperationalError, ProgrammingError):
        pass

    # Fallback memory
    out = []
    for e in sorted(LOGS_MEM, key=lambda x: x.get("timestamp", ""), reverse=True)[:20]:
        if (e.get("type") or "").lower() != "security":
            continue
        sev = (e.get("severity") or "").lower()
        if sev not in {"warning", "critical"}:
            continue
        item = _serialize_mem(e)
        out.append(
            {
                "id": item.get("id") or str(e.get("id")),
                "type": "critical" if sev == "critical" else "warning",
                "severity": sev,
                "title": item.get("action") or e.get("action") or "Security Event",
                "description": item.get("details") or e.get("details") or "",
                "timestamp": item.get("timestamp")
                or e.get("timestamp")
                or dj_timezone.now().isoformat(),
                "user": item.get("user") or "",
                "userId": item.get("userId") or "",
                "ip": item.get("ip") or "",
                "meta": item.get("meta") or {},
            }
        )
    return JsonResponse({"success": True, "data": out})


__all__ = ["logs", "logs_summary", "logs_alerts"]
