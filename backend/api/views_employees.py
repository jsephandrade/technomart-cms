"""Employee directory and schedule endpoints.

Follows project conventions: JWT auth via Authorization Bearer, role/permission
checks via helpers in views_common, and JSON responses with { success, data }.
"""

import json
import uuid
from datetime import time
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.db.models import CharField, F, Value
from django.db.models.functions import Cast, Coalesce

from .views_common import _actor_from_request, _has_permission, _paginate, _identifier_variants
from .utils_employees import resolve_employee_ref


DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]


def _normalize_uuid_str(value):
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except Exception:
        return raw


def _parse_uuid(value):
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except Exception:
        return None


def _parse_time(val: str):
    try:
        h, m = str(val or "").split(":", 1)
        h = int(h)
        m = int(m)
        if 0 <= h < 24 and 0 <= m < 60:
            return time(hour=h, minute=m)
    except Exception:
        pass
    return None


def _safe_emp(e):
    return {
        "id": str(e.id),
        "name": e.name,
        "position": e.position,
        "hourlyRate": float(e.hourly_rate or 0),
        "contact": e.contact,
        "status": e.status,
        "createdAt": e.created_at.isoformat() if e.created_at else None,
        "updatedAt": e.updated_at.isoformat() if e.updated_at else None,
    }


def _time_to_str(val):
    if isinstance(val, time):
        return val.strftime("%H:%M")
    if isinstance(val, str):
        raw = val.strip()
        if not raw:
            return None
        parts = raw.split(":")
        if len(parts) >= 2:
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
        return raw
    return None


def _iso_or_str(val):
    if hasattr(val, "isoformat"):
        try:
            return val.isoformat()
        except Exception:
            return None
    if isinstance(val, str):
        return val
    return None


def _safe_sched(s):
    if isinstance(s, dict):
        sid = s.get("id") or s.get("schedule_id_str") or s.get("id_str")
        employee_id = s.get("employeeId") or s.get("employee_id_str") or s.get("employee_id")
        employee_name = s.get("employeeName") or s.get("employee_name") or ""
        employee_position = (
            s.get("employee_position")
            or s.get("employeePosition")
            or s.get("employee__position")
            or ""
        )
        day = s.get("day")
        start_time = s.get("start_time") or s.get("startTime")
        end_time = s.get("end_time") or s.get("endTime")
        created_at = s.get("created_at") or s.get("createdAt")
        updated_at = s.get("updated_at") or s.get("updatedAt")
    else:
        sid = getattr(s, "id", None)
        employee_id = getattr(s, "employee_id", None)
        employee_name = (
            getattr(s.employee, "name", "")
            if hasattr(s, "employee")
            else ""
        )
        employee_position = (
            getattr(s.employee, "position", "")
            if hasattr(s, "employee")
            else ""
        )
        day = getattr(s, "day", None)
        start_time = getattr(s, "start_time", None)
        end_time = getattr(s, "end_time", None)
        created_at = getattr(s, "created_at", None)
        updated_at = getattr(s, "updated_at", None)
    normalized_id = _normalize_uuid_str(sid) if sid is not None else None
    normalized_employee_id = (
        _normalize_uuid_str(employee_id) if employee_id is not None else None
    )
    return {
        "id": normalized_id if normalized_id is not None else None,
        "employeeId": normalized_employee_id if normalized_employee_id is not None else None,
        "employeeName": employee_name or "",
        "employeePosition": employee_position or "",
        "day": day,
        "startTime": _time_to_str(start_time),
        "endTime": _time_to_str(end_time),
        "createdAt": _iso_or_str(created_at),
        "updatedAt": _iso_or_str(updated_at),
    }


def _safe_role_target(t):
    return {
        "id": str(t.id),
        "day": t.day,
        "role": t.role,
        "target": int(t.target_count or 0),
        "createdAt": _iso_or_str(t.created_at),
        "updatedAt": _iso_or_str(t.updated_at),
    }


def _safe_role_exception(e):
    requested_by = getattr(e.requested_by, "name", "") or getattr(e.requested_by, "email", "")
    return {
        "id": str(e.id),
        "day": e.day,
        "role": e.role,
        "message": e.message or "",
        "requestedBy": e.requested_by_label or requested_by or "",
        "requestedAt": _iso_or_str(e.created_at),
    }


def _targets_by_day(items):
    result = {day: [] for day in DAYS}
    for entry in items:
        day = entry.get("day") if isinstance(entry, dict) else getattr(entry, "day", None)
        if not day:
            continue
        if day not in result:
            result[day] = []
        if isinstance(entry, dict):
            result[day].append(
                {
                    "id": entry.get("id"),
                    "role": entry.get("role"),
                    "target": entry.get("target"),
                }
            )
        else:
            result[day].append(
                {
                    "id": str(entry.id),
                    "role": entry.role,
                    "target": int(entry.target_count or 0),
                }
            )
    return result


@require_http_methods(["GET", "POST"])
def employees(request):
    """List/create employees.

    Access:
    - GET: staff+ (any authenticated user) to support schedule views
    - POST: manager/admin
    """
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    if request.method == "GET":
        try:
            from .models import Employee, AppUser
            search = (request.GET.get("search") or "").lower()
            status = (request.GET.get("status") or "").lower()
            page = request.GET.get("page", 1)
            limit = request.GET.get("limit", 50)

            # Query only explicitly created employees (no auto-sync)
            qs = Employee.objects.all()
            # Confidentiality: Staff should only see themselves
            role_l = (getattr(actor, "role", "") or "").lower()
            if role_l not in {"admin", "manager"} and not _has_permission(actor, "employees.manage"):
                actor_id = getattr(actor, "id", None)
                if actor_id:
                    # Prefer relation; if none, fall back to email/name
                    try:
                        qs_user = qs.filter(user_id=actor_id)
                        if qs_user.exists():
                            qs = qs_user
                        else:
                            actor_email = (getattr(actor, "email", "") or "").strip().lower()
                            actor_name = (getattr(actor, "name", "") or "").strip()
                            if actor_email:
                                qs = qs.filter(contact__iexact=actor_email)
                            elif actor_name:
                                qs = qs.filter(name__iexact=actor_name)
                            else:
                                qs = qs.none()
                    except Exception:
                        actor_email = (getattr(actor, "email", "") or "").strip().lower()
                        actor_name = (getattr(actor, "name", "") or "").strip()
                        if actor_email:
                            qs = qs.filter(contact__iexact=actor_email)
                        elif actor_name:
                            qs = qs.filter(name__iexact=actor_name)
                        else:
                            qs = qs.none()
                else:
                    actor_email = (getattr(actor, "email", "") or "").strip().lower()
                    actor_name = (getattr(actor, "name", "") or "").strip()
                    if actor_email:
                        qs = qs.filter(contact__iexact=actor_email)
                    elif actor_name:
                        qs = qs.filter(name__iexact=actor_name)
                    else:
                        qs = qs.none()
            if search:
                from django.db.models import Q
                qs = qs.filter(Q(name__icontains=search) | Q(position__icontains=search) | Q(contact__icontains=search))
            if status:
                qs = qs.filter(status=status)
            qs = qs.order_by("name")
            total = qs.count()
            page = max(1, int(page or 1))
            limit = max(1, int(limit or 50))
            start = (page - 1) * limit
            end = start + limit
            items = [_safe_emp(e) for e in qs[start:end]]
            pagination = {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": max(1, (total + limit - 1) // limit),
            }
            return JsonResponse({"success": True, "data": items, "pagination": pagination})
        except Exception:
            # Minimal fallback: empty list
            return JsonResponse({"success": True, "data": [], "pagination": {"page": 1, "limit": 50, "total": 0, "totalPages": 1}})

    # POST: disabled (use employees_with_schedule endpoint)
    return JsonResponse({"success": False, "message": "Employee creation is disabled; use /employees/with-schedule"}, status=403)


@require_http_methods(["POST"])
def employees_with_schedule(request):
    """Create employee plus initial schedule entries in one request."""
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "employees.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = (payload.get("name") or "").strip()
    if not name:
        return JsonResponse({"success": False, "message": "Name is required"}, status=400)

    schedule_payload = payload.get("schedule") or []
    if not isinstance(schedule_payload, list):
        schedule_payload = []

    valid_rows = []
    for entry in schedule_payload:
        day = entry.get("day")
        st = _parse_time(entry.get("startTime") or entry.get("start_time"))
        et = _parse_time(entry.get("endTime") or entry.get("end_time"))
        if day in DAYS and st and et and st < et:
            valid_rows.append({"day": day, "start_time": st, "end_time": et})

    try:
        from .models import Employee, ScheduleEntry
        with transaction.atomic():
            emp = Employee.objects.create(
                name=name,
                position=(payload.get("position") or "").strip(),
                hourly_rate=float(payload.get("hourlyRate") or 0),
                contact=(payload.get("contact") or "").strip(),
                status=(payload.get("status") or "active").lower(),
            )
            created_schedule = []
            for row in valid_rows:
                entry = ScheduleEntry.objects.create(
                    employee=emp, day=row["day"], start_time=row["start_time"], end_time=row["end_time"]
                )
                created_schedule.append(entry)
        return JsonResponse(
            {
                "success": True,
                "data": {
                    "employee": _safe_emp(emp),
                    "schedule": [_safe_sched(s) for s in created_schedule],
                },
            }
        )
    except Exception:
        return JsonResponse({"success": False, "message": "Failed to create employee with schedule"}, status=500)


@require_http_methods(["GET", "PUT", "DELETE"])
def employee_detail(request, emp_id):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Employee
        emp = Employee.objects.filter(id=emp_id).first()
        if not emp:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        if request.method == "GET":
            return JsonResponse({"success": True, "data": _safe_emp(emp)})

        # Mutations require manager/admin (or explicit employees.manage permission)
        role_l = getattr(actor, "role", "").lower()
        if not (_has_permission(actor, "employees.manage") or role_l in {"admin", "manager"}):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        if request.method == "DELETE":
            emp.delete()
            return JsonResponse({"success": True})

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        changed = False
        if "name" in payload and payload["name"] is not None:
            emp.name = str(payload["name"]).strip(); changed = True
        if "position" in payload and payload["position"] is not None:
            emp.position = str(payload["position"]).strip(); changed = True
        if "hourlyRate" in payload and payload["hourlyRate"] is not None:
            try:
                emp.hourly_rate = float(payload["hourlyRate"]) ; changed = True
            except Exception:
                pass
        if "contact" in payload and payload["contact"] is not None:
            emp.contact = str(payload["contact"]).strip(); changed = True
        if "status" in payload and payload["status"] is not None:
            emp.status = str(payload["status"]).lower(); changed = True
        if changed:
            emp.save()
        return JsonResponse({"success": True, "data": _safe_emp(emp)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["GET", "POST", "DELETE"])
def schedule(request):
    """List/create schedule entries.

    Access:
    - GET: staff+ with permission 'schedule.view_edit' (view only)
    - POST: manager/admin or permission 'schedule.manage'
    """
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if request.method == "GET":
        if not _has_permission(actor, "schedule.view_edit"):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    else:
        # Mutations require manage permission or manager/admin role
        role_l = getattr(actor, "role", "").lower()
        if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        from .models import ScheduleEntry, Employee
        if request.method == "GET":
            employee_id_param = request.GET.get("employeeId")
            day = request.GET.get("day")
            qs = ScheduleEntry.objects.annotate(
                schedule_id_str=Cast("id", CharField()),
                employee_id_str=Cast("employee_id", CharField()),
                employee_name=Coalesce(F("employee__name"), Value("")),
                employee_position=Coalesce(F("employee__position"), Value("")),
            )
            role_l = (getattr(actor, "role", "") or "").lower()
            can_manage = role_l in {"admin", "manager"} or _has_permission(actor, "schedule.manage")
            if not can_manage:
                _, self_emp_id = resolve_employee_ref(actor, allow_fallback=True)
                if not self_emp_id:
                    return JsonResponse({"success": True, "data": []})
                allowed_ids = _identifier_variants(self_emp_id) or {str(self_emp_id)}
                qs = qs.filter(employee_id_str__in=allowed_ids)
            elif employee_id_param:
                candidate_ids = _identifier_variants(employee_id_param)
                if candidate_ids:
                    qs = qs.filter(employee_id_str__in=candidate_ids)
            if day:
                qs = qs.filter(day=day)
            qs = qs.order_by("employee_name", "day", "start_time")
            rows = qs.values(
                "schedule_id_str",
                "employee_id_str",
                "employee_name",
                "employee_position",
                "day",
                "start_time",
                "end_time",
                "created_at",
                "updated_at",
            )
            items = [_safe_sched(row) for row in rows]
            return JsonResponse({"success": True, "data": items})

        if request.method == "DELETE":
            employee_id_param = request.GET.get("employeeId") or request.GET.get("employee_id")
            day = request.GET.get("day")
            st = _parse_time(request.GET.get("startTime") or request.GET.get("start_time"))
            et = _parse_time(request.GET.get("endTime") or request.GET.get("end_time"))

            if not employee_id_param:
                return JsonResponse(
                    {"success": False, "message": "employeeId is required"},
                    status=400,
                )
            if day not in DAYS:
                return JsonResponse({"success": False, "message": "Invalid day"}, status=400)
            if not st or not et or st >= et:
                return JsonResponse({"success": False, "message": "Invalid start/end time"}, status=400)

            qs = ScheduleEntry.objects.filter(day=day, start_time=st, end_time=et)
            variants = _identifier_variants(employee_id_param)
            if variants:
                qs = qs.annotate(
                    employee_id_str=Cast("employee_id", CharField())
                ).filter(employee_id_str__in=variants)
            else:
                qs = qs.filter(employee_id=employee_id_param)

            deleted_count, _ = qs.delete()
            if deleted_count == 0:
                return JsonResponse({"success": False, "message": "Not found"}, status=404)
            return JsonResponse({"success": True, "deleted": deleted_count})

        # POST create
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        emp_id = payload.get("employeeId") or payload.get("employee")
        day = payload.get("day")
        st = _parse_time(payload.get("startTime"))
        et = _parse_time(payload.get("endTime"))
        if not emp_id:
            return JsonResponse({"success": False, "message": "employeeId is required"}, status=400)
        if day not in DAYS:
            return JsonResponse({"success": False, "message": "Invalid day"}, status=400)
        if not st or not et or st >= et:
            return JsonResponse({"success": False, "message": "Invalid start/end time"}, status=400)
        from .models import Employee
        emp = Employee.objects.filter(id=emp_id).first()
        if not emp:
            return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
        with transaction.atomic():
            entry = ScheduleEntry.objects.create(employee=emp, day=day, start_time=st, end_time=et)
        return JsonResponse({"success": True, "data": _safe_sched(entry)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["GET"])
def schedule_analytics(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = (getattr(actor, "role", "") or "").lower()
    if role_l not in {"admin", "manager", "staff"}:
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import ScheduleEntry
        entries = (
            ScheduleEntry.objects.select_related("employee")
            .order_by("employee__name", "day", "start_time")
            .all()
        )
        data = [_safe_sched(entry) for entry in entries]
        return JsonResponse({"success": True, "data": data})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["PUT", "DELETE"]) 
def schedule_detail(request, sid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    # Mutations require manage permission or manager/admin role
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import ScheduleEntry, Employee
        parsed_sid = _parse_uuid(sid)
        if not parsed_sid:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        s = ScheduleEntry.objects.select_related("employee").filter(id=parsed_sid).first()
        if not s:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        if request.method == "DELETE":
            s.delete()
            return JsonResponse({"success": True})
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        changed = False
        if "employeeId" in payload and payload["employeeId"]:
            emp = Employee.objects.filter(id=payload["employeeId"]).first()
            if not emp:
                return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
            s.employee = emp; changed = True
        if "day" in payload and payload["day"]:
            if payload["day"] not in DAYS:
                return JsonResponse({"success": False, "message": "Invalid day"}, status=400)
            s.day = payload["day"]; changed = True
        if "startTime" in payload and payload["startTime"]:
            st = _parse_time(payload["startTime"]) 
            if not st:
                return JsonResponse({"success": False, "message": "Invalid startTime"}, status=400)
            s.start_time = st; changed = True
        if "endTime" in payload and payload["endTime"]:
            et = _parse_time(payload["endTime"]) 
            if not et:
                return JsonResponse({"success": False, "message": "Invalid endTime"}, status=400)
            s.end_time = et; changed = True
        if s.start_time and s.end_time and s.start_time >= s.end_time:
            return JsonResponse({"success": False, "message": "startTime must be before endTime"}, status=400)
        if changed:
            s.save()
        # Refresh relation
        s = ScheduleEntry.objects.select_related("employee").get(id=s.id)
        return JsonResponse({"success": True, "data": _safe_sched(s)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["GET", "PUT"])
def schedule_role_targets(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        from .models import TeamCompositionTarget
        if request.method == "GET":
            day = request.GET.get("day")
            qs = TeamCompositionTarget.objects.all()
            if day:
                qs = qs.filter(day=day)
            qs = qs.order_by("day", "role")
            items = [_safe_role_target(t) for t in qs]
            return JsonResponse(
                {"success": True, "data": {"items": items, "targetsByDay": _targets_by_day(items)}}
            )

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        day = payload.get("day")
        targets_by_day = payload.get("targetsByDay")
        targets = payload.get("targets")

        update_map = {}
        if day:
            if day not in DAYS:
                return JsonResponse({"success": False, "message": "Invalid day"}, status=400)
            update_map[day] = targets if isinstance(targets, list) else []
        elif isinstance(targets_by_day, dict):
            update_map = targets_by_day
        elif isinstance(targets, list):
            for entry in targets:
                entry_day = entry.get("day")
                if not entry_day:
                    continue
                update_map.setdefault(entry_day, []).append(entry)
        else:
            return JsonResponse({"success": False, "message": "No targets provided"}, status=400)

        for entry_day in update_map.keys():
            if entry_day not in DAYS:
                return JsonResponse(
                    {"success": False, "message": f"Invalid day: {entry_day}"},
                    status=400,
                )

        with transaction.atomic():
            for entry_day, entries in update_map.items():
                TeamCompositionTarget.objects.filter(day=entry_day).delete()
                for entry in entries or []:
                    role = str(entry.get("role") or "").strip()
                    target = entry.get("target")
                    try:
                        target = int(target)
                    except Exception:
                        target = 0
                    if not role or target <= 0:
                        continue
                    TeamCompositionTarget.objects.create(
                        day=entry_day,
                        role=role,
                        target_count=target,
                        created_by=actor,
                        updated_by=actor,
                    )

        qs = TeamCompositionTarget.objects.order_by("day", "role")
        items = [_safe_role_target(t) for t in qs]
        return JsonResponse(
            {"success": True, "data": {"items": items, "targetsByDay": _targets_by_day(items)}}
        )
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["GET", "POST", "DELETE"])
def schedule_role_exceptions(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        from .models import TeamCompositionException
        if request.method == "GET":
            day = request.GET.get("day")
            qs = TeamCompositionException.objects.all()
            if day:
                qs = qs.filter(day=day)
            qs = qs.order_by("-created_at")
            items = [_safe_role_exception(e) for e in qs]
            return JsonResponse({"success": True, "data": items})

        if request.method == "DELETE":
            clear_all = (request.GET.get("clear") or "").lower() in {"1", "true", "all"}
            if clear_all:
                TeamCompositionException.objects.all().delete()
                return JsonResponse({"success": True})
            return JsonResponse({"success": False, "message": "Missing clear=all"}, status=400)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        day = payload.get("day")
        role = str(payload.get("role") or "").strip()
        message = str(payload.get("message") or "").strip()
        requested_by_label = str(payload.get("requestedBy") or "").strip()

        if day not in DAYS:
            return JsonResponse({"success": False, "message": "Invalid day"}, status=400)
        if not role:
            return JsonResponse({"success": False, "message": "Role is required"}, status=400)

        entry = TeamCompositionException.objects.create(
            day=day,
            role=role,
            message=message,
            requested_by=actor,
            requested_by_label=requested_by_label,
        )
        return JsonResponse({"success": True, "data": _safe_role_exception(entry)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["DELETE"])
def schedule_role_exception_detail(request, eid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    role_l = getattr(actor, "role", "").lower()
    if not (_has_permission(actor, "schedule.manage") or role_l in {"admin", "manager"}):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import TeamCompositionException
        entry = TeamCompositionException.objects.filter(id=eid).first()
        if not entry:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        entry.delete()
        return JsonResponse({"success": True})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


__all__ = [
    "employees",
    "employees_with_schedule",
    "employee_detail",
    "schedule",
    "schedule_detail",
    "schedule_role_targets",
    "schedule_role_exceptions",
    "schedule_role_exception_detail",
]
