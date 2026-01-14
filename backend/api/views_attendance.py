"""Attendance and Leave management endpoints.

Rules:
- Any authenticated user can GET (view) attendance and leave lists.
- Only Manager/Admin (attendance.manage / leave.manage) can create/update/delete.
"""

import json
import uuid
from datetime import datetime, date, time, timedelta
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.db.models import CharField, F, Value, Q
from django.db.models.functions import Cast, Coalesce
from django.utils import timezone as dj_tz

from .views_common import _actor_from_request, _has_permission, _identifier_variants
from .utils_employees import resolve_employee_ref


def _parse_date(val):
    try:
        if isinstance(val, date):
            return val
        return datetime.strptime(str(val), "%Y-%m-%d").date()
    except Exception:
        return None


def _parse_time(val):
    """Parse time strings in HH:MM or HH:MM:SS format into time objects."""
    try:
        if isinstance(val, time):
            return val
        raw = str(val or "").strip()
        if not raw:
            return None
        segments = raw.split(":")
        if len(segments) >= 3:
            h, m, s = segments[:3]
        elif len(segments) == 2:
            h, m = segments
            s = "0"
        else:
            return None
        return time(hour=int(h), minute=int(m), second=int(s))
    except Exception:
        return None


WEEK_DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]
WEEK_DAY_ORDER = {day: idx for idx, day in enumerate(WEEK_DAYS)}


def _day_name(value):
    if not value:
        return None
    try:
        return value.strftime("%A")
    except Exception:
        return None


def _days_in_range(start_date, end_date):
    if not start_date or not end_date or end_date < start_date:
        return []
    days = []
    seen = set()
    cursor = start_date
    while cursor <= end_date:
        label = _day_name(cursor)
        if label and label not in seen:
            days.append(label)
            seen.add(label)
        cursor = cursor + timedelta(days=1)
    return days


def _time_overlaps(start_a, end_a, start_b, end_b):
    try:
        return start_a < end_b and end_a > start_b
    except Exception:
        return False


def _actor_role(actor):
    if isinstance(actor, dict):
        return (actor.get("role") or "").lower()
    return (getattr(actor, "role", "") or "").lower()


def _employee_role_match(employee):
    position = (getattr(employee, "position", "") or "").strip()
    if position:
        return position, "position"
    role = ""
    user = getattr(employee, "user", None)
    if user:
        role = (getattr(user, "role", "") or "").strip()
    if role:
        return role, "role"
    return "", None


def _resolve_schedule_for_date(employee, record_date):
    if not employee or not record_date:
        return None
    try:
        from .models import ScheduleEntry
    except Exception:
        return None
    try:
        day_label = record_date.strftime("%A")
    except Exception:
        return None
    if not day_label:
        return None
    return (
        ScheduleEntry.objects.filter(employee=employee, day=day_label)
        .order_by("start_time")
        .first()
    )


def _calendar_exception_for_date(record_date):
    if not record_date:
        return None
    try:
        from .models import CalendarException
    except Exception:
        return None
    return CalendarException.objects.filter(date=record_date).first()


def _is_no_work_day(record_date):
    entry = _calendar_exception_for_date(record_date)
    if not entry:
        return False
    kind = (getattr(entry, "kind", "") or "").lower()
    if kind == "no_work":
        return True
    if kind == "holiday" and not getattr(entry, "is_workday_override", False):
        return True
    return False


def _attendance_status_for_checkin(employee, record_date, check_in_time, fallback="present"):
    if not employee or not record_date or not check_in_time:
        return fallback
    try:
        schedule_entry = _resolve_schedule_for_date(employee, record_date)
        if not schedule_entry or not schedule_entry.start_time:
            return fallback
        if check_in_time > schedule_entry.start_time:
            return "late"
        return "present"
    except Exception:
        return fallback


def _combine_date_time(record_date, time_value):
    if not record_date or not time_value:
        return None
    try:
        combined = datetime.combine(record_date, time_value)
        if dj_tz.is_naive(combined):
            combined = dj_tz.make_aware(combined, dj_tz.get_current_timezone())
        return combined
    except Exception:
        return None


def _auto_mark_absent_if_shift_passed(employee, record_date, now=None):
    if not employee or not record_date:
        return None
    try:
        from .models import AttendanceRecord
    except Exception:
        return None
    try:
        if _is_no_work_day(record_date):
            return None
        schedule_entry = _resolve_schedule_for_date(employee, record_date)
        if not schedule_entry or not schedule_entry.end_time:
            return None
        now_dt = dj_tz.localtime(now or dj_tz.now())
        shift_end = _combine_date_time(record_date, schedule_entry.end_time)
        if not shift_end or now_dt <= shift_end:
            return None
        existing = AttendanceRecord.objects.filter(
            employee=employee, date=record_date
        ).first()
        if existing:
            if not existing.check_in and existing.status != "absent":
                existing.status = "absent"
                existing.notes = existing.notes or "Shift window closed without clock-in"
                existing.save(update_fields=["status", "notes", "updated_at"])
            return existing
        return AttendanceRecord.objects.create(
            employee=employee,
            date=record_date,
            status="absent",
            notes="Shift window closed without clock-in",
        )
    except Exception:
        return None


def _auto_assign_leave_coverage(leave_record):
    try:
        from .models import Employee, ScheduleEntry, LeaveRecord
    except Exception:
        return []

    leave_employee = leave_record.employee
    days = _days_in_range(leave_record.start_date, leave_record.end_date)
    if not days:
        return []

    entries = list(
        ScheduleEntry.objects.filter(employee=leave_employee, day__in=days)
    )
    if not entries:
        return []

    role_key, role_source = _employee_role_match(leave_employee)
    candidate_qs = (
        Employee.objects.select_related("user")
        .filter(status="active")
        .exclude(id=leave_employee.id)
    )
    candidate_qs = candidate_qs.filter(
        Q(user__isnull=True)
        | (Q(user__status__iexact="active") & Q(user__is_active=True))
    )
    if role_key and role_source == "position":
        candidate_qs = candidate_qs.filter(position__iexact=role_key)
    elif role_key and role_source == "role":
        candidate_qs = candidate_qs.filter(user__role__iexact=role_key)

    candidates = list(candidate_qs)
    if not candidates:
        return []

    candidate_ids = [c.id for c in candidates]
    on_leave_ids = set(
        LeaveRecord.objects.filter(
            employee_id__in=candidate_ids,
            status=LeaveRecord.STATUS_APPROVED,
            start_date__lte=leave_record.end_date,
            end_date__gte=leave_record.start_date,
        ).values_list("employee_id", flat=True)
    )
    candidates = [c for c in candidates if c.id not in on_leave_ids]
    if not candidates:
        return []

    schedule_rows = list(
        ScheduleEntry.objects.filter(employee_id__in=[c.id for c in candidates], day__in=days)
    )
    schedule_by_employee_day = {}
    for row in schedule_rows:
        schedule_by_employee_day.setdefault(row.employee_id, {}).setdefault(
            row.day, []
        ).append(row)

    candidate_name_map = {
        c.id: (c.name or "").strip().lower() for c in candidates
    }
    assignments = []
    entries.sort(
        key=lambda entry: (
            WEEK_DAY_ORDER.get(entry.day, 99),
            entry.start_time,
            entry.end_time,
        )
    )

    for entry in entries:
        available = []
        for candidate in candidates:
            day_entries = schedule_by_employee_day.get(candidate.id, {}).get(
                entry.day, []
            )
            if any(
                _time_overlaps(
                    entry.start_time,
                    entry.end_time,
                    other.start_time,
                    other.end_time,
                )
                for other in day_entries
            ):
                continue
            available.append(candidate)
        if not available:
            continue
        available.sort(
            key=lambda c: (
                len(
                    schedule_by_employee_day.get(c.id, {}).get(entry.day, [])
                ),
                candidate_name_map.get(c.id, ""),
            )
        )
        chosen = available[0]
        entry.employee = chosen
        entry.save(update_fields=["employee"])
        schedule_by_employee_day.setdefault(chosen.id, {}).setdefault(
            entry.day, []
        ).append(entry)
        assignments.append(
            {
                "scheduleId": str(entry.id),
                "day": entry.day,
                "fromEmployeeId": str(leave_employee.id),
                "toEmployeeId": str(chosen.id),
            }
        )
        try:
            from .notification_triggers import trigger_shift_assigned

            trigger_shift_assigned(chosen, entry)
        except Exception:
            pass

    return assignments


def _normalize_uuid(value):
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


def _safe_att(a):
    if isinstance(a, dict):
        rid = a.get("id") or a.get("record_id_str") or a.get("id_str")
        employee_id = a.get("employeeId") or a.get("employee_id_str") or a.get("employee_id")
        employee_name = a.get("employeeName") or a.get("employee_name") or ""
        date_v = a.get("date")
        check_in = a.get("check_in") or a.get("checkIn")
        check_out = a.get("check_out") or a.get("checkOut")
        status = a.get("status")
        notes = a.get("notes")
        created_at = a.get("created_at") or a.get("createdAt")
        updated_at = a.get("updated_at") or a.get("updatedAt")
    else:
        rid = getattr(a, "id", None)
        employee_id = getattr(a, "employee_id", None)
        employee_name = getattr(a.employee, "name", "") if hasattr(a, "employee") else ""
        date_v = getattr(a, "date", None)
        check_in = getattr(a, "check_in", None)
        check_out = getattr(a, "check_out", None)
        status = getattr(a, "status", None)
        notes = getattr(a, "notes", "")
        created_at = getattr(a, "created_at", None)
        updated_at = getattr(a, "updated_at", None)
    return {
        "id": _normalize_uuid(rid) if rid is not None else None,
        "employeeId": _normalize_uuid(employee_id) if employee_id is not None else None,
        "employeeName": employee_name or "",
        "date": _iso_or_str(date_v),
        "checkIn": _time_to_str(check_in),
        "checkOut": _time_to_str(check_out),
        "status": status,
        "notes": notes or "",
        "createdAt": _iso_or_str(created_at),
        "updatedAt": _iso_or_str(updated_at),
    }


def _safe_leave(l):
    return {
        "id": str(l.id),
        "employeeId": str(l.employee_id),
        "employeeName": getattr(l.employee, "name", ""),
        "startDate": l.start_date.isoformat(),
        "endDate": l.end_date.isoformat(),
        "type": l.type,
        "status": l.status,
        "reason": l.reason or "",
        "decidedBy": l.decided_by or "",
        "decidedAt": l.decided_at.isoformat() if l.decided_at else None,
        "createdAt": l.created_at.isoformat() if l.created_at else None,
        "updatedAt": l.updated_at.isoformat() if l.updated_at else None,
    }


def _employee_for_actor(actor, *, create_if_missing=False, allow_fallback=True):
    """Resolve (and optionally create) the employee profile linked to the actor."""

    emp, emp_id = resolve_employee_ref(actor, allow_fallback=allow_fallback)
    if emp:
        return emp, str(emp.id)

    if emp_id:
        try:
            from .models import Employee, AppUser
        except Exception:
            Employee = None
            AppUser = None
        if Employee:
            try:
                emp_obj = Employee.objects.filter(id=emp_id).first()
            except Exception:
                emp_obj = None
            if emp_obj:
                try:
                    actor_user = None
                    if AppUser and isinstance(actor, AppUser):
                        actor_user = actor
                    elif AppUser and isinstance(actor, dict):
                        actor_id = actor.get("id") or actor.get("user_id") or actor.get("userId")
                        actor_email = (actor.get("email") or "").strip().lower()
                        if actor_id:
                            actor_user = AppUser.objects.filter(id=actor_id).first()
                        if not actor_user and actor_email:
                            actor_user = AppUser.objects.filter(email=actor_email).first()
                    if actor_user and not emp_obj.user_id:
                        role = (getattr(actor_user, "role", "") or "").lower()
                        if role in {"staff", "manager"}:
                            updates = []
                            emp_obj.user = actor_user
                            updates.append("user")
                            if not emp_obj.contact:
                                email = (getattr(actor_user, "email", "") or "").strip()
                                if email:
                                    emp_obj.contact = email
                                    updates.append("contact")
                            emp_obj.save(update_fields=updates)
                except Exception:
                    pass
                return emp_obj, str(emp_obj.id)

    if not create_if_missing:
        return None, None

    try:
        from .models import Employee, AppUser
    except Exception:
        return None, None

    actor_user = actor if AppUser and isinstance(actor, AppUser) else None
    if not actor_user and isinstance(actor, dict):
        actor_id = actor.get("id") or actor.get("user_id") or actor.get("userId")
        actor_email = (actor.get("email") or "").strip().lower()
        try:
            if actor_id:
                actor_user = AppUser.objects.filter(id=actor_id).first()
            if not actor_user and actor_email:
                actor_user = AppUser.objects.filter(email=actor_email).first()
        except Exception:
            actor_user = None

    if not actor_user:
        return None, None

    role = (getattr(actor_user, "role", "") or "").lower()
    if role not in {"staff", "manager"}:
        return None, None

    name = (getattr(actor_user, "name", "") or "").strip()
    email = (getattr(actor_user, "email", "") or "").strip()
    if not name:
        name = email or "Staff"

    try:
        emp = Employee.objects.create(
            name=name,
            position=role,
            contact=email,
            status="active",
            user=actor_user,
        )
        return emp, str(emp.id)
    except Exception:
        return None, None


@require_http_methods(["GET", "POST"])
def attendance(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import AttendanceRecord, Employee
        can_manage = _has_permission(actor, "attendance.manage")
        if request.method == "GET":
            employee_id_param = request.GET.get("employeeId")
            dfrom = _parse_date(request.GET.get("from"))
            dto = _parse_date(request.GET.get("to"))
            status = (request.GET.get("status") or "").lower()
            qs = AttendanceRecord.objects.annotate(
                record_id_str=Cast("id", CharField()),
                employee_id_str=Cast("employee_id", CharField()),
                employee_name=Coalesce(F("employee__name"), Value("")),
            )
            if not can_manage:
                self_emp, self_emp_id = _employee_for_actor(
                    actor, allow_fallback=True
                )
                if not self_emp_id:
                    return JsonResponse({"success": True, "data": []})
                if not self_emp and self_emp_id:
                    self_emp = Employee.objects.filter(id=self_emp_id).first()
                if self_emp:
                    _auto_mark_absent_if_shift_passed(
                        self_emp, dj_tz.localdate()
                    )
                allowed_ids = _identifier_variants(self_emp_id) or {str(self_emp_id)}
                qs = qs.filter(employee_id_str__in=allowed_ids)
            elif employee_id_param:
                candidate_ids = _identifier_variants(employee_id_param)
                if candidate_ids:
                    qs = qs.filter(employee_id_str__in=candidate_ids)

            if dfrom:
                qs = qs.filter(date__gte=dfrom)
            if dto:
                qs = qs.filter(date__lte=dto)
            if status:
                qs = qs.filter(status=status)
            qs = qs.order_by("-date", "employee_name")
            rows = qs.values(
                "record_id_str",
                "employee_id_str",
                "employee_name",
                "date",
                "check_in",
                "check_out",
                "status",
                "notes",
                "created_at",
                "updated_at",
            )
            data = [_safe_att(row) for row in rows]
            return JsonResponse({"success": True, "data": data})

        self_employee = None
        self_employee_id = None
        self_employee, self_employee_id = _employee_for_actor(
            actor, create_if_missing=True, allow_fallback=True
        )
        if not can_manage:
            if not self_employee or not self_employee_id:
                return JsonResponse({"success": False, "message": "No employee profile found"}, status=403)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        emp_id = payload.get("employeeId")
        d = _parse_date(payload.get("date"))
        if not d:
            return JsonResponse({"success": False, "message": "date is required"}, status=400)

        exception_entry = _calendar_exception_for_date(d)
        if exception_entry and _is_no_work_day(d):
            label = "Holiday" if exception_entry.kind == "holiday" else "No work day"
            return JsonResponse(
                {"success": False, "message": f"{label} - attendance is disabled"},
                status=403,
            )

        if not can_manage:
            if emp_id:
                allowed = _identifier_variants(self_employee_id)
                actor_id = getattr(actor, "id", None)
                if actor_id is None and isinstance(actor, dict):
                    actor_id = actor.get("id") or actor.get("user_id") or actor.get("userId")
                actor_id_variants = _identifier_variants(actor_id)
                if (
                    emp_id not in allowed
                    and str(emp_id) not in allowed
                    and emp_id not in actor_id_variants
                    and str(emp_id) not in actor_id_variants
                ):
                    return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
            emp = self_employee
            emp_id = str(self_employee_id)

        else:
            actor_id = getattr(actor, "id", None)
            actor_id_variants = _identifier_variants(actor_id)
            if emp_id:
                emp = Employee.objects.filter(id=emp_id).first()
                if not emp:
                    if self_employee and emp_id in actor_id_variants:
                        emp = self_employee
                        emp_id = str(self_employee_id)
                    else:
                        return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
            else:
                if not self_employee:
                    return JsonResponse({"success": False, "message": "employeeId is required"}, status=400)
                emp = self_employee
                emp_id = str(self_employee_id)

        ci = _parse_time(payload.get("checkIn")) if payload.get("checkIn") else None
        co = _parse_time(payload.get("checkOut")) if payload.get("checkOut") else None
        status = (payload.get("status") or "present").lower()
        if not can_manage:
            status = _attendance_status_for_checkin(emp, d, ci, "present")
        notes = payload.get("notes") or ""

        with transaction.atomic():
            defaults = {
                "check_in": ci,
                "check_out": co,
                "status": status,
                "notes": notes,
            }
            rec, created = AttendanceRecord.objects.get_or_create(
                employee=emp,
                date=d,
                defaults=defaults,
            )
            if created:
                return JsonResponse({"success": True, "data": _safe_att(rec)})

            if not can_manage:
                updated = False
                if ci and not rec.check_in:
                    rec.check_in = ci
                    rec.status = _attendance_status_for_checkin(
                        emp, rec.date, ci, rec.status or "present"
                    )
                    updated = True
                if co and not rec.check_out:
                    rec.check_out = co
                    updated = True
                if notes and notes != rec.notes:
                    rec.notes = notes
                    updated = True
                if updated:
                    rec.save()
                return JsonResponse({"success": True, "data": _safe_att(rec)})

            # Managers/Admins can upsert the record with provided fields
            updated = False
            if "checkIn" in payload:
                rec.check_in = ci
                updated = True
            if "checkOut" in payload:
                rec.check_out = co
                updated = True
            if payload.get("status"):
                rec.status = status
                updated = True
            if "notes" in payload:
                rec.notes = notes
                updated = True
            if updated:
                rec.save()
        return JsonResponse({"success": True, "data": _safe_att(rec)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["PUT", "DELETE"]) 
def attendance_detail(request, rid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import AttendanceRecord, Employee
        rec = AttendanceRecord.objects.select_related("employee").filter(id=rid).first()
        if not rec:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)

        can_manage = _has_permission(actor, "attendance.manage")
        if not can_manage:
            self_employee, self_employee_id = _employee_for_actor(actor, allow_fallback=True)
            allowed = _identifier_variants(self_employee_id)
            if not self_employee_id or str(rec.employee_id) not in allowed:
                return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        if request.method == "DELETE":
            if not can_manage:
                return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
            rec.delete()
            return JsonResponse({"success": True})

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        if can_manage:
            if "employeeId" in payload and payload["employeeId"]:
                e = Employee.objects.filter(id=payload["employeeId"]).first()
                if not e:
                    return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
                rec.employee = e
            if "date" in payload and payload["date"]:
                d = _parse_date(payload["date"])
                if not d:
                    return JsonResponse({"success": False, "message": "Invalid date"}, status=400)
                rec.date = d
            if "checkIn" in payload:
                rec.check_in = _parse_time(payload["checkIn"]) if payload["checkIn"] else None
            if "checkOut" in payload:
                rec.check_out = _parse_time(payload["checkOut"]) if payload["checkOut"] else None
            if "status" in payload and payload["status"]:
                rec.status = str(payload["status"]).lower()
            if "notes" in payload and payload["notes"] is not None:
                rec.notes = str(payload["notes"])
            rec.save()
            return JsonResponse({"success": True, "data": _safe_att(rec)})

        updated = False
        if "checkIn" in payload:
            rec.check_in = _parse_time(payload["checkIn"]) if payload["checkIn"] else None
            if rec.check_in:
                rec.status = _attendance_status_for_checkin(
                    rec.employee, rec.date, rec.check_in, rec.status or "present"
                )
            updated = True
        if "checkOut" in payload:
            rec.check_out = _parse_time(payload["checkOut"]) if payload["checkOut"] else None
            updated = True
        if "notes" in payload:
            rec.notes = str(payload["notes"] or "")
            updated = True
        if not updated:
            return JsonResponse({"success": False, "message": "No valid fields to update"}, status=400)
        rec.save()
        return JsonResponse({"success": True, "data": _safe_att(rec)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["GET", "POST"]) 
def leaves(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import LeaveRecord, Employee
        if request.method == "GET":
            # Only managers/admins can view leave records
            if not _has_permission(actor, "leave.manage"):
                return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
            employee_id = request.GET.get("employeeId")
            status = (request.GET.get("status") or "").lower()
            type_v = (request.GET.get("type") or "").lower()
            qs = LeaveRecord.objects.select_related("employee").all()
            if employee_id:
                qs = qs.filter(employee_id=employee_id)
            if status:
                qs = qs.filter(status=status)
            if type_v:
                qs = qs.filter(type=type_v)
            qs = qs.order_by("-start_date", "employee__name")
            return JsonResponse({"success": True, "data": [_safe_leave(x) for x in qs]})

        # POST: allow staff/managers to request; managers/admins manage
        can_manage = _has_permission(actor, "leave.manage")
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        emp_id = payload.get("employeeId")
        sd = _parse_date(payload.get("startDate"))
        ed = _parse_date(payload.get("endDate"))
        if not emp_id or not sd or not ed:
            return JsonResponse({"success": False, "message": "employeeId, startDate, endDate required"}, status=400)
        if ed < sd:
            return JsonResponse({"success": False, "message": "endDate must be after startDate"}, status=400)
        # If actor cannot manage, force employee to self (by email/name mapping)
        if not can_manage:
            # Try to map AppUser -> Employee by relation, then by email in contact, then by name
            e = None
            try:
                actor_id = getattr(actor, "id", None)
                if actor_id:
                    e = Employee.objects.filter(user_id=actor_id).first()
            except Exception:
                e = None
            if not e:
                actor_email = (getattr(actor, "email", "") or "").strip().lower()
                if actor_email:
                    e = Employee.objects.filter(contact__iexact=actor_email).first()
            if not e:
                actor_name = (getattr(actor, "name", "") or "").strip()
                if actor_name:
                    e = Employee.objects.filter(name__iexact=actor_name).first()
            if not e:
                return JsonResponse({"success": False, "message": "No employee profile linked to your account"}, status=400)
        else:
            e = Employee.objects.filter(id=emp_id).first()
            if not e:
                return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
        with transaction.atomic():
            rec = LeaveRecord.objects.create(
                employee=e,
                start_date=sd,
                end_date=ed,
                type=(payload.get("type") or "other").lower(),
                # Staff requests are always pending; managers/admins can pre-set
                status=(payload.get("status") or "pending").lower() if can_manage else "pending",
                reason=payload.get("reason") or "",
                decided_by="",
            )
        return JsonResponse({"success": True, "data": _safe_leave(rec)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["PUT", "DELETE"]) 
def leave_detail(request, lid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "leave.manage"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import LeaveRecord, Employee
        rec = LeaveRecord.objects.select_related("employee").filter(id=lid).first()
        if not rec:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        if request.method == "DELETE":
            rec.delete()
            return JsonResponse({"success": True})
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        status_requested = (payload.get("status") or "").lower().strip()
        if status_requested in {"approved", "rejected"}:
            actor_role = _actor_role(actor)
            _, actor_emp_id = resolve_employee_ref(actor, allow_fallback=True)
            if actor_role == "manager" and actor_emp_id and str(actor_emp_id) == str(rec.employee_id):
                return JsonResponse(
                    {
                        "success": False,
                        "message": "You cannot approve or reject your own leave request.",
                    },
                    status=403,
                )
        old_status = rec.status
        status_changed = False
        assignments = []
        with transaction.atomic():
            if "employeeId" in payload and payload["employeeId"]:
                e = Employee.objects.filter(id=payload["employeeId"]).first()
                if not e:
                    return JsonResponse(
                        {"success": False, "message": "Employee not found"}, status=404
                    )
                rec.employee = e
            if "startDate" in payload and payload["startDate"]:
                sd = _parse_date(payload["startDate"])
                if not sd:
                    return JsonResponse(
                        {"success": False, "message": "Invalid startDate"},
                        status=400,
                    )
                rec.start_date = sd
            if "endDate" in payload and payload["endDate"]:
                ed = _parse_date(payload["endDate"])
                if not ed:
                    return JsonResponse(
                        {"success": False, "message": "Invalid endDate"},
                        status=400,
                    )
                rec.end_date = ed
            if rec.end_date < rec.start_date:
                return JsonResponse(
                    {"success": False, "message": "endDate must be after startDate"},
                    status=400,
                )
            if "type" in payload and payload["type"]:
                rec.type = str(payload["type"]).lower()
            if "status" in payload and payload["status"]:
                rec.status = str(payload["status"]).lower()
                rec.decided_by = (
                    getattr(actor, "email", "") or getattr(actor, "name", "") or ""
                )
                rec.decided_at = dj_tz.now()
            if "reason" in payload and payload["reason"] is not None:
                rec.reason = str(payload["reason"])
            rec.save()
            status_changed = rec.status != old_status
            if status_changed and rec.status == LeaveRecord.STATUS_APPROVED:
                assignments = _auto_assign_leave_coverage(rec)
        if status_changed:
            try:
                from .notification_triggers import trigger_leave_status_change

                trigger_leave_status_change(rec)
            except Exception:
                pass
        return JsonResponse({"success": True, "data": _safe_leave(rec)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


__all__ = [
    "attendance",
    "attendance_detail",
    "leaves",
    "leave_detail",
]
