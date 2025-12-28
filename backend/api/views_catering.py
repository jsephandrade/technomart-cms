import json
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import (
    CateringEvent,
    CateringEventItem,
    MenuItem,
    PaymentMethodConfig,
)
from .views_common import _actor_from_request, _has_permission


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        try:
            return datetime.strptime(str(value), "%Y-%m-%d").date()
        except ValueError as exc:  # pragma: no cover - defensive path
            raise ValueError("Invalid date format") from exc


def _parse_time(value):
    if not value:
        return None
    if hasattr(value, "hour") and hasattr(value, "minute"):
        return value
    try:
        parsed = datetime.fromisoformat(f"1970-01-01T{str(value)}")
        return parsed.time()
    except ValueError:
        try:
            return datetime.strptime(str(value), "%H:%M").time()
        except ValueError as exc:  # pragma: no cover
            raise ValueError("Invalid time format") from exc


def _decimal(value, default=Decimal("0")):
    if value is None or value == "":
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _format_time_range(start, end):
    if not start and not end:
        return ""

    def _fmt(t):
        if not t:
            return ""
        return t.strftime("%I:%M %p").lstrip("0").replace(" 0", " ")

    if start and end:
        return f"{_fmt(start)} - {_fmt(end)}"
    return _fmt(start) or _fmt(end)


def _catering_order_number(event_id):
    """
    Generate a stable catering order number with prefix 'C-' followed by six digits.
    The digits are derived from the UUID to ensure consistency for each event.
    """
    try:
        uid = UUID(str(event_id))
    except Exception:
        return ""
    number = uid.int % 900_000
    number += 100_000  # ensures six digits without leading zeros
    return f"C-{number:06d}"


def _serialize_event(event, include_items=False):
    start_time = event.start_time.isoformat() if event.start_time else None
    end_time = event.end_time.isoformat() if event.end_time else None
    event_date = event.event_date.isoformat() if event.event_date else None

    payload = {
        "id": str(event.id),
        "name": event.name,
        "client": event.client_name,
        "clientName": event.client_name,
        "clientEmail": event.client_email or "",
        "status": event.status,
        "date": event_date,
        "startTime": start_time,
        "endTime": end_time,
        "time": _format_time_range(event.start_time, event.end_time),
        "location": event.location or "",
        "attendees": event.guest_count,
        "guestCount": event.guest_count,
        "notes": event.notes or "",
        "total": float(event.estimated_total or 0),
        "estimatedTotal": float(event.estimated_total or 0),
        "orderDiscount": float(event.order_discount or 0),
        "deposit": float(event.deposit_amount or 0),
        "depositAmount": float(event.deposit_amount or 0),
        "depositPaid": event.deposit_paid,
        "paymentStatus": event.payment_status,
        "contactPerson": {
            "name": event.contact_name or "",
            "phone": event.contact_phone or "",
            "email": event.contact_email or event.client_email or "",
        },
        "createdAt": event.created_at.isoformat() if event.created_at else None,
        "updatedAt": event.updated_at.isoformat() if event.updated_at else None,
    }

    if include_items:
        items = []
        related_items = event.items.all() if hasattr(event, "items") else []
        for item in related_items:
            items.append(
                {
                    "id": str(item.id),
                    "menuItemId": str(item.menu_item_id) if item.menu_item_id else None,
                    "name": item.name,
                    "quantity": item.quantity,
                    "unitPrice": float(item.unit_price or 0),
                    "totalPrice": float(item.total_price),
                }
            )
        payload["items"] = items
    return payload


def _actor_uuid(actor):
    if hasattr(actor, "id"):
        return getattr(actor, "id")
    if isinstance(actor, dict):
        return actor.get("id")
    return None


@require_http_methods(["GET", "POST"])
def catering_events(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    if request.method == "GET":
        if not (_has_permission(actor, "catering.view") or _has_permission(actor, "all")):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

        search = (request.GET.get("search") or request.GET.get("q") or "").strip()
        status = (request.GET.get("status") or "").strip()
        date_from = request.GET.get("dateFrom") or request.GET.get("from")
        date_to = request.GET.get("dateTo") or request.GET.get("to")
        include_items = str(request.GET.get("includeItems") or "").lower() in {"1", "true", "yes"}
        upcoming_only = str(request.GET.get("upcoming") or "").lower() in {"1", "true", "yes"}
        try:
            limit = int(request.GET.get("limit", 100) or 100)
        except Exception:
            limit = 100
        limit = max(1, min(500, limit))

        qs = CateringEvent.objects.filter(deleted_at__isnull=True)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(client_name__icontains=search))
        if status:
            qs = qs.filter(status=status)
        if date_from:
            try:
                qs = qs.filter(event_date__gte=_parse_date(date_from))
            except ValueError:
                return JsonResponse({"success": False, "message": "Invalid dateFrom"}, status=400)
        if date_to:
            try:
                qs = qs.filter(event_date__lte=_parse_date(date_to))
            except ValueError:
                return JsonResponse({"success": False, "message": "Invalid dateTo"}, status=400)
        if upcoming_only:
            qs = qs.filter(event_date__gte=timezone.localdate())

        order_by = (request.GET.get("orderBy") or "event_date").strip()
        if order_by not in {"event_date", "created_at", "updated_at"}:
            order_by = "event_date"
        order_dir = (request.GET.get("orderDir") or "asc").lower()
        ordering = ("-" if order_dir == "desc" else "") + order_by

        if include_items:
            qs = qs.prefetch_related("items", "items__menu_item")

        events = list(qs.order_by(ordering, "start_time", "created_at")[:limit])
        data = [_serialize_event(evt, include_items=include_items) for evt in events]
        return JsonResponse({"success": True, "data": data})

    if not (_has_permission(actor, "catering.manage") or _has_permission(actor, "all")):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    name = (payload.get("name") or payload.get("eventName") or "").strip()
    client = (payload.get("client") or payload.get("clientName") or "").strip()
    if not name:
        return JsonResponse({"success": False, "message": "name is required"}, status=400)
    if not client:
        return JsonResponse({"success": False, "message": "client is required"}, status=400)

    try:
        event_date = _parse_date(payload.get("date") or payload.get("eventDate"))
    except ValueError:
        return JsonResponse({"success": False, "message": "Invalid event date"}, status=400)
    if not event_date:
        return JsonResponse({"success": False, "message": "eventDate is required"}, status=400)

    try:
        start_time = _parse_time(payload.get("startTime"))
    except ValueError:
        return JsonResponse({"success": False, "message": "Invalid startTime"}, status=400)
    try:
        end_time = _parse_time(payload.get("endTime"))
    except ValueError:
        return JsonResponse({"success": False, "message": "Invalid endTime"}, status=400)

    try:
        guest_count = int(payload.get("attendees") or payload.get("guestCount") or 0)
    except Exception:
        return JsonResponse({"success": False, "message": "attendees must be a number"}, status=400)
    guest_count = max(0, guest_count)

    estimated_total = _decimal(
        payload.get("estimatedTotal")
        or payload.get("total")
        or payload.get("totalAmount")
        or payload.get("totalEstimate")
        or 0
    )

    deposit_amount = _decimal(
        payload.get("depositAmount")
        or payload.get("deposit")
        or 0
    )
    # If deposit_amount is not provided, automatically set to 50% of total
    if deposit_amount == 0 and estimated_total > 0:
        deposit_amount = estimated_total * Decimal("0.5")

    deposit_paid = payload.get("depositPaid", False)
    payment_status = (payload.get("paymentStatus") or "unpaid").strip()

    actor_id = _actor_uuid(actor)

    with transaction.atomic():
        event = CateringEvent.objects.create(
            name=name,
            client_name=client,
            client_email=(payload.get("clientEmail") or payload.get("client_email") or "").strip() or None,
            contact_name=(payload.get("contactName") or payload.get("contact_name") or "").strip(),
            contact_phone=(payload.get("contactPhone") or payload.get("contact_phone") or "").strip(),
            contact_email=(payload.get("contactEmail") or payload.get("contact_email") or "").strip() or None,
            event_date=event_date,
            start_time=start_time,
            end_time=end_time,
            location=(payload.get("location") or "").strip(),
            guest_count=guest_count,
            status=(payload.get("status") or CateringEvent.STATUS_SCHEDULED),
            notes=(payload.get("notes") or "").strip(),
            estimated_total=estimated_total,
            deposit_amount=deposit_amount,
            deposit_paid=deposit_paid,
            payment_status=payment_status,
            created_by_id=actor_id if actor_id else None,
            updated_by_id=actor_id if actor_id else None,
        )

    return JsonResponse({"success": True, "data": _serialize_event(event)})


@require_http_methods(["GET", "PATCH", "DELETE"])
def catering_event_detail(request, event_id):
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    try:
        event = CateringEvent.objects.prefetch_related("items", "items__menu_item").filter(deleted_at__isnull=True).get(pk=event_id)
    except CateringEvent.DoesNotExist:
        return JsonResponse({"success": False, "message": "Event not found"}, status=404)

    if request.method == "GET":
        if not (_has_permission(actor, "catering.view") or _has_permission(actor, "all")):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
        return JsonResponse({"success": True, "data": _serialize_event(event, include_items=True)})

    if not (_has_permission(actor, "catering.manage") or _has_permission(actor, "all")):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    if request.method == "DELETE":
        # Soft delete: mark as deleted but keep in database
        if event.status == CateringEvent.STATUS_CANCELLED:
            # Already cancelled - perform soft delete
            event.deleted_at = timezone.now()
            event.deleted_by_id = _actor_uuid(actor)
            event.save(update_fields=["deleted_at", "deleted_by"])
            return JsonResponse({"success": True, "message": "Event removed successfully"})
        else:
            # Not cancelled - just cancel it
            event.status = CateringEvent.STATUS_CANCELLED
            event.updated_by_id = _actor_uuid(actor)
            event.save(update_fields=["status", "updated_by", "updated_at"])
            return JsonResponse({"success": True, "data": _serialize_event(event, include_items=True)})

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    updated_fields = []

    if "name" in payload or "eventName" in payload:
        event.name = (payload.get("name") or payload.get("eventName") or event.name).strip()
        updated_fields.append("name")
    if "client" in payload or "clientName" in payload:
        event.client_name = (payload.get("client") or payload.get("clientName") or event.client_name).strip()
        updated_fields.append("client_name")
    if "clientEmail" in payload or "client_email" in payload:
        client_email = (payload.get("clientEmail") or payload.get("client_email") or "").strip() or None
        event.client_email = client_email
        updated_fields.append("client_email")
    if "contactName" in payload or "contact_name" in payload:
        event.contact_name = (payload.get("contactName") or payload.get("contact_name") or "").strip()
        updated_fields.append("contact_name")
    if "contactPhone" in payload or "contact_phone" in payload:
        event.contact_phone = (payload.get("contactPhone") or payload.get("contact_phone") or "").strip()
        updated_fields.append("contact_phone")
    if "contactEmail" in payload or "contact_email" in payload:
        contact_email = (payload.get("contactEmail") or payload.get("contact_email") or "").strip() or None
        event.contact_email = contact_email
        updated_fields.append("contact_email")
    if "location" in payload:
        event.location = (payload.get("location") or "").strip()
        updated_fields.append("location")
    if "notes" in payload:
        event.notes = (payload.get("notes") or "").strip()
        updated_fields.append("notes")
    if "attendees" in payload or "guestCount" in payload:
        try:
            event.guest_count = max(0, int(payload.get("attendees") or payload.get("guestCount") or 0))
        except Exception:
            return JsonResponse({"success": False, "message": "attendees must be a number"}, status=400)
        updated_fields.append("guest_count")
    if "status" in payload:
        status = (payload.get("status") or "").strip()
        if status not in dict(CateringEvent.STATUS_CHOICES):
            return JsonResponse({"success": False, "message": "Invalid status"}, status=400)
        event.status = status
        updated_fields.append("status")
    if "date" in payload or "eventDate" in payload:
        try:
            event.event_date = _parse_date(payload.get("date") or payload.get("eventDate"))
        except ValueError:
            return JsonResponse({"success": False, "message": "Invalid event date"}, status=400)
        updated_fields.append("event_date")
    if "startTime" in payload:
        try:
            event.start_time = _parse_time(payload.get("startTime"))
        except ValueError:
            return JsonResponse({"success": False, "message": "Invalid startTime"}, status=400)
        updated_fields.append("start_time")
    if "endTime" in payload:
        try:
            event.end_time = _parse_time(payload.get("endTime"))
        except ValueError:
            return JsonResponse({"success": False, "message": "Invalid endTime"}, status=400)
        updated_fields.append("end_time")
    if "estimatedTotal" in payload or "total" in payload or "totalAmount" in payload:
        event.estimated_total = _decimal(
            payload.get("estimatedTotal") or payload.get("total") or payload.get("totalAmount"),
            default=event.estimated_total,
        )
        updated_fields.append("estimated_total")
        # Auto-update deposit_amount to 50% of new total if not explicitly provided
        if "depositAmount" not in payload and "deposit" not in payload:
            event.deposit_amount = event.estimated_total * Decimal("0.5")
            updated_fields.append("deposit_amount")
    if "depositAmount" in payload or "deposit" in payload:
        event.deposit_amount = _decimal(
            payload.get("depositAmount") or payload.get("deposit"),
            default=event.deposit_amount,
        )
        if "deposit_amount" not in updated_fields:
            updated_fields.append("deposit_amount")
    if "depositPaid" in payload:
        event.deposit_paid = bool(payload.get("depositPaid", False))
        updated_fields.append("deposit_paid")
    if "paymentStatus" in payload:
        payment_status = (payload.get("paymentStatus") or "").strip()
        if payment_status:
            event.payment_status = payment_status
            updated_fields.append("payment_status")

    if updated_fields:
        actor_id = _actor_uuid(actor)
        event.updated_by_id = actor_id if actor_id else None
        updated_fields.append("updated_by")
        updated_fields.append("updated_at")
        event.save(update_fields=updated_fields)

    event.refresh_from_db()
    return JsonResponse({"success": True, "data": _serialize_event(event, include_items=True)})


@require_http_methods(["PUT", "PATCH"])
def catering_event_menu_items(request, event_id):
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    if not (_has_permission(actor, "catering.manage") or _has_permission(actor, "all")):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        event = CateringEvent.objects.filter(deleted_at__isnull=True).get(pk=event_id)
    except CateringEvent.DoesNotExist:
        return JsonResponse({"success": False, "message": "Event not found"}, status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    items_payload = payload.get("items") if isinstance(payload, dict) else payload
    if not isinstance(items_payload, list):
        return JsonResponse({"success": False, "message": "items must be a list"}, status=400)

    normalized = []
    total_amount = Decimal("0")
    menu_items_map = {}

    menu_item_ids = [
        item.get("menuItemId") or item.get("menu_item_id")
        for item in items_payload
        if item.get("menuItemId") or item.get("menu_item_id")
    ]
    menu_item_ids = [mid for mid in menu_item_ids if mid]
    if menu_item_ids:
        qs = MenuItem.objects.filter(id__in=menu_item_ids)
        menu_items_map = {str(mi.id): mi for mi in qs}

    for item in items_payload:
        menu_item_id = item.get("menuItemId") or item.get("menu_item_id")
        name = (item.get("name") or "").strip()
        if not name and menu_item_id:
            menu = menu_items_map.get(str(menu_item_id))
            name = menu.name if menu else ""
        if not name:
            return JsonResponse({"success": False, "message": "Each item requires a name or menuItemId"}, status=400)
        try:
            quantity = int(item.get("quantity") or 0)
        except Exception:
            return JsonResponse({"success": False, "message": "quantity must be a number"}, status=400)
        quantity = max(1, quantity)
        unit_price = item.get("unitPrice")
        if unit_price is None and item.get("price") is not None:
            try:
                total_price = Decimal(str(item.get("price")))
                unit_price = (total_price / Decimal(quantity)) if quantity else total_price
            except Exception:
                unit_price = Decimal("0")
        unit_price = _decimal(unit_price)
        total_amount += unit_price * Decimal(quantity)
        normalized.append(
            {
                "menu_item_id": str(menu_item_id) if menu_item_id else None,
                "name": name,
                "quantity": quantity,
                "unit_price": unit_price,
            }
        )

    actor_id = _actor_uuid(actor)

    with transaction.atomic():
        event.items.all().delete()
        for item in normalized:
            CateringEventItem.objects.create(
                event=event,
                menu_item=menu_items_map.get(item["menu_item_id"]) if item["menu_item_id"] else None,
                name=item["name"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
            )
        event.estimated_total = total_amount
        # Automatically set deposit_amount to 50% of total
        event.deposit_amount = total_amount * Decimal("0.5")
        event.updated_by_id = actor_id if actor_id else None
        event.save(update_fields=["estimated_total", "deposit_amount", "updated_by", "updated_at"])

    event.refresh_from_db()
    return JsonResponse({"success": True, "data": _serialize_event(event, include_items=True)})


@require_http_methods(["POST"])
def catering_event_payment(request, event_id):
    """Process payment for a catering event (deposit or full)"""
    actor, err = _actor_from_request(request)
    if not actor:
        return err

    if not (_has_permission(actor, "catering.manage") or _has_permission(actor, "all")):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        event = CateringEvent.objects.filter(deleted_at__isnull=True).get(pk=event_id)
    except CateringEvent.DoesNotExist:
        return JsonResponse({"success": False, "message": "Event not found"}, status=404)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return JsonResponse({"success": False, "message": "Invalid JSON"}, status=400)

    payment_type = (payload.get("paymentType") or "").strip().lower()  # 'deposit' or 'full'
    payment_method = (payload.get("paymentMethod") or "cash").strip().lower()  # 'cash', 'card', 'mobile'
    amount = _decimal(payload.get("amount") or 0)

    if payment_type not in {"deposit", "full"}:
        return JsonResponse({"success": False, "message": "Invalid payment type"}, status=400)

    # Enforce globally configured payment method availability
    cfg = None
    try:
        cfg = PaymentMethodConfig.objects.first()
    except Exception:
        cfg = None
    if cfg:
        allowed_methods = {
            "cash": bool(getattr(cfg, "cash_enabled", True)),
            "card": bool(getattr(cfg, "card_enabled", True)),
            "mobile": bool(getattr(cfg, "mobile_enabled", True)),
        }
        if not allowed_methods.get(payment_method, True):
            return JsonResponse(
                {"success": False, "message": f"Payment method '{payment_method}' is disabled"},
                status=400,
            )

    if payment_method not in {"cash", "card", "mobile"}:
        return JsonResponse({"success": False, "message": "Invalid payment method"}, status=400)

    if amount <= 0:
        return JsonResponse({"success": False, "message": "Invalid amount"}, status=400)

    # Calculate expected amount based on payment type
    if payment_type == "deposit":
        expected_amount = event.deposit_amount
    else:  # full payment
        status = (event.payment_status or "").strip().lower()
        has_partial = bool(event.deposit_paid) or status == "partial"
        if status == "paid":
            expected_amount = Decimal("0")
        elif has_partial:
            expected_amount = event.estimated_total - event.deposit_amount
        else:
            expected_amount = event.estimated_total
        if expected_amount < 0:
            expected_amount = Decimal("0")

    # Validate amount (allow small floating point differences)
    if abs(amount - expected_amount) > Decimal("0.01"):
        return JsonResponse({
            "success": False,
            "message": f"Amount mismatch. Expected: {float(expected_amount):.2f}, Received: {float(amount):.2f}"
        }, status=400)

    actor_id = _actor_uuid(actor)

    with transaction.atomic():
        # Update event payment status
        if payment_type == "deposit":
            event.deposit_paid = True
            event.payment_status = "partial"
        else:  # full payment
            event.deposit_paid = True
            event.payment_status = "paid"

        event.updated_by_id = actor_id if actor_id else None
        event.save(update_fields=["deposit_paid", "payment_status", "updated_by", "updated_at"])

        # Record payment transaction (if PaymentTransaction model is being used)
        try:
            from .models import PaymentTransaction
            PaymentTransaction.objects.create(
                order_id=str(event.id),
                amount=amount,
                method=payment_method,
                status=PaymentTransaction.STATUS_COMPLETED,
                customer=event.client_name,
                processed_by_id=actor_id if actor_id else None,
                meta={
                    "event_name": event.name,
                    "payment_type": payment_type,
                    "event_date": event.event_date.isoformat() if event.event_date else None,
                    "order_number": _catering_order_number(event.id),
                    "event_id": str(event.id),
                    "source": "catering",
                }
            )
        except Exception:
            pass  # PaymentTransaction is optional

    event.refresh_from_db()
    return JsonResponse({
        "success": True,
        "message": f"{'Deposit' if payment_type == 'deposit' else 'Full'} payment processed successfully",
        "data": _serialize_event(event, include_items=True)
    })

