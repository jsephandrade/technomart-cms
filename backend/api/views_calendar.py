import json
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils.dateparse import parse_date

from .views_common import _actor_from_request, _has_permission


def _safe_exception(entry):
    roles = []
    raw_roles = (entry.roles or "").strip()
    if raw_roles:
        roles = [r.strip() for r in raw_roles.split(",") if r.strip()]
    return {
        "id": str(entry.id),
        "date": entry.date.isoformat() if entry.date else None,
        "name": entry.name,
        "kind": entry.kind,
        "scope": entry.scope,
        "roles": roles,
        "location": entry.location or "",
        "isWorkdayOverride": bool(entry.is_workday_override),
        "notes": entry.notes or "",
        "createdAt": entry.created_at.isoformat() if entry.created_at else None,
        "updatedAt": entry.updated_at.isoformat() if entry.updated_at else None,
    }


def _parse_roles(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return ",".join([str(item).strip() for item in value if str(item).strip()])
    return str(value).strip()


@require_http_methods(["GET", "POST"])
def calendar_exceptions(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    try:
        from .models import CalendarException
    except Exception:
        return JsonResponse({"success": False, "message": "Calendar unavailable"}, status=500)

    if request.method == "GET":
        start_date = parse_date(request.GET.get("startDate") or request.GET.get("start_date") or "")
        end_date = parse_date(request.GET.get("endDate") or request.GET.get("end_date") or "")
        kind = (request.GET.get("kind") or "").strip().lower()
        qs = CalendarException.objects.all()
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        if kind:
            qs = qs.filter(kind=kind)
        items = [_safe_exception(entry) for entry in qs.order_by("date", "name")]
        return JsonResponse({"success": True, "data": items})

    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    date_value = parse_date(payload.get("date") or payload.get("day") or "")
    if not date_value:
        return JsonResponse({"success": False, "message": "Date is required"}, status=400)

    name = (payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"success": False, "message": "Name is required"}, status=400)

    kind = (payload.get("kind") or "holiday").strip().lower()
    if kind not in {"holiday", "no_work"}:
        kind = "holiday"

    scope = (payload.get("scope") or "all").strip().lower()
    if scope not in {"all", "roles"}:
        scope = "all"

    roles = _parse_roles(payload.get("roles") or payload.get("role"))
    location = (payload.get("location") or "").strip()
    is_workday_override = bool(
        payload.get("isWorkdayOverride")
        or payload.get("workdayOverride")
        or payload.get("is_workday_override")
    )
    notes = (payload.get("notes") or "").strip()

    try:
        entry = CalendarException.objects.create(
            date=date_value,
            name=name,
            kind=kind,
            scope=scope,
            roles=roles,
            location=location,
            is_workday_override=is_workday_override,
            notes=notes,
            created_by=actor,
        )
        return JsonResponse({"success": True, "data": _safe_exception(entry)})
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to save exception"}, status=500)


@require_http_methods(["DELETE"])
def calendar_exception_detail(request, exc_id):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import CalendarException
        entry = CalendarException.objects.filter(id=exc_id).first()
        if not entry:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        entry.delete()
        return JsonResponse({"success": True})
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to delete exception"}, status=500)
