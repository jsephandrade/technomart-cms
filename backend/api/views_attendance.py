"""Attendance and Leave management endpoints.

Rules:
- Any authenticated user can GET (view) attendance and leave lists.
- Only Manager/Admin (attendance.manage / leave.manage) can create/update/delete.
"""

import json
import uuid
from datetime import datetime, date, time
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.db.models import CharField, F, Value
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
                    if AppUser and isinstance(actor, AppUser) and not emp_obj.user_id:
                        role = (getattr(actor, "role", "") or "").lower()
                        if role in {"staff", "manager"}:
                            updates = []
                            emp_obj.user = actor
                            updates.append("user")
                            if not emp_obj.contact:
                                email = (getattr(actor, "email", "") or "").strip()
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

    if not AppUser or not isinstance(actor, AppUser):
        return None, None

    role = (getattr(actor, "role", "") or "").lower()
    if role not in {"staff", "manager"}:
        return None, None

    name = (getattr(actor, "name", "") or "").strip()
    email = (getattr(actor, "email", "") or "").strip()
    if not name:
        name = email or "Staff"

    try:
        emp = Employee.objects.create(
            name=name,
            position=role,
            contact=email,
            status="active",
            user=actor,
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
                _, self_emp_id = _employee_for_actor(actor, allow_fallback=True)
                if not self_emp_id:
                    return JsonResponse({"success": True, "data": []})
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

        if not can_manage:
            if emp_id:
                allowed = _identifier_variants(self_employee_id)
                if emp_id not in allowed and str(emp_id) not in allowed:
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
            status = "present"
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
                    rec.status = status
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
        if "employeeId" in payload and payload["employeeId"]:
            e = Employee.objects.filter(id=payload["employeeId"]).first()
            if not e:
                return JsonResponse({"success": False, "message": "Employee not found"}, status=404)
            rec.employee = e
        if "startDate" in payload and payload["startDate"]:
            sd = _parse_date(payload["startDate"]) 
            if not sd:
                return JsonResponse({"success": False, "message": "Invalid startDate"}, status=400)
            rec.start_date = sd
        if "endDate" in payload and payload["endDate"]:
            ed = _parse_date(payload["endDate"]) 
            if not ed:
                return JsonResponse({"success": False, "message": "Invalid endDate"}, status=400)
            rec.end_date = ed
        if rec.end_date < rec.start_date:
            return JsonResponse({"success": False, "message": "endDate must be after startDate"}, status=400)
        if "type" in payload and payload["type"]:
            rec.type = str(payload["type"]).lower()
        if "status" in payload and payload["status"]:
            rec.status = str(payload["status"]).lower()
            rec.decided_by = getattr(actor, "email", "") or getattr(actor, "name", "") or ""
            rec.decided_at = dj_tz.now()
        if "reason" in payload and payload["reason"] is not None:
            rec.reason = str(payload["reason"]) 
        rec.save()
        return JsonResponse({"success": True, "data": _safe_leave(rec)})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


__all__ = [
    "attendance",
    "attendance_detail",
    "leaves",
    "leave_detail",
]
