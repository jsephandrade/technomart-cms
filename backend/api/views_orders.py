"""Order endpoints: place order, detail, queue/history, status updates.

Permissions mapping (from views_common.DEFAULT_ROLE_PERMISSIONS):
- Staff/Manager/Admin can place orders (order.place), view status (order.status.view),
  handle queue (order.queue.handle), update status (order.status.update), and bulk track (order.bulk.track).
"""

from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from uuid import UUID
from decimal import Decimal
from typing import Iterable, Optional

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import transaction
from django.db.models import Avg, Count, F, Q, Sum
from django.utils import timezone as dj_tz
from django.utils.crypto import get_random_string

from .events import publish_event
from .views_common import _actor_from_request, _has_permission, rate_limit


logger = logging.getLogger(__name__)


ORDER_NUMBER_RANDOM_CHARS = "0123456789"


def _normalize_order_number_candidate(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = str(value).strip().lstrip("#")
    return cleaned.upper()


def _order_reference_from_number(order_number: str) -> str:
    if not order_number:
        return ""
    parts = [part for part in str(order_number).split("-") if part]
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return str(order_number)


def generate_unique_order_number(*, prefix: str = "W", order_model=None, max_attempts: int = 64) -> str:
    prefix_clean = (prefix or "W").strip()[:1].upper() or "W"
    if order_model is None:
        from .models import Order as OrderModel

        order_model = OrderModel

    attempt = 0

    while attempt < max_attempts:
        random_component = get_random_string(
            length=6, allowed_chars=ORDER_NUMBER_RANDOM_CHARS
        )
        candidate = f"{prefix_clean}-{random_component}"
        if not order_model.objects.filter(order_number__iexact=candidate).exists():
            return candidate
        attempt += 1

    raise RuntimeError("Unable to generate unique order number")


def canonical_status(status: Optional[str]) -> str:
    if not status:
        return "new"
    normalized = str(status).lower()
    return ORDER_STATUS_CANONICAL_MAP.get(normalized, normalized)


def status_display(status: Optional[str]) -> str:
    return ORDER_STATUS_DISPLAY.get(canonical_status(status), (status or "Unknown").title())


def is_terminal(status: Optional[str]) -> bool:
    return canonical_status(status) in ORDER_TERMINAL_STATUSES


def can_transition(current: str, target: str) -> bool:
    current_canon = canonical_status(current)
    target_canon = canonical_status(target)
    allowed = ALLOWED_TRANSITIONS.get(current_canon, set())
    if target_canon in allowed:
        return True
    # Allow direct transition if target is the canonical equivalent of a legacy value
    legacy_target = ORDER_STATUS_CANONICAL_MAP.get(target, target)
    return legacy_target in allowed


def canonical_item_state(state: Optional[str]) -> str:
    if not state:
        return "queued"
    return str(state).lower()


def can_item_transition(current: str, target: str) -> bool:
    current_state = canonical_item_state(current)
    target_state = canonical_item_state(target)
    allowed = ITEM_ALLOWED_TRANSITIONS.get(current_state, set())
    return target_state in allowed


def ensure_handoff_code(order) -> str:
    if order.handoff_code:
        return order.handoff_code
    code = get_random_string(
        length=6, allowed_chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    )
    order.handoff_code = code
    order.save(update_fields=["handoff_code", "updated_at"])
    return code


def recalc_order_counters(order, items: Optional[Iterable] = None):
    if items is None:
        items = list(order.items.all())
    else:
        items = list(items)

    total_quantity = 0
    ready_quantity = 0
    last_station = ""
    last_updated = None

    for item in items:
        qty = int(getattr(item, "quantity", 0) or 0)
        total_quantity += qty
        state = canonical_item_state(getattr(item, "state", None))
        if state in {"ready", "completed"}:
            ready_quantity += qty
        if state in ITEM_ACTIVE_STATES:
            ts = getattr(item, "updated_at", None)
            if ts and (last_updated is None or ts > last_updated):
                last_updated = ts
                last_station = item.station_code or ""

    order.total_items_cached = total_quantity
    order.partial_ready_items = ready_quantity
    order.last_station_code = last_station or order.last_station_code or ""

    late_seconds = 0
    if order.promised_time:
        now_ts = dj_tz.now()
        if now_ts > order.promised_time:
            late_seconds = int((now_ts - order.promised_time).total_seconds())
    order.late_by_seconds = late_seconds

    update_fields = [
        "total_items_cached",
        "partial_ready_items",
        "last_station_code",
        "late_by_seconds",
        "updated_at",
    ]
    order.save(update_fields=update_fields)
    return order


def record_order_event(order, *, item=None, event_type="", from_state="", to_state="", actor=None, station_code="", payload=None):
    from .models import OrderEvent  # late import to avoid circular

    try:
        OrderEvent.objects.create(
            order=order,
            item=item,
            actor=actor if getattr(actor, "id", None) else None,
            event_type=event_type or "order.event",
            from_state=from_state or "",
            to_state=to_state or "",
            station_code=station_code or "",
            payload=payload or {},
        )
    except Exception:
        logger.exception("Failed to record order event")


DEFAULT_EXPO_STATION_CODE = "expo"

CATEGORY_STATION_KEYWORDS = [
    ("grill", "grill"),
    ("bbq", "grill"),
    ("barbecue", "grill"),
    ("fried", "fry"),
    ("fries", "fry"),
    ("fry", "fry"),
    ("salad", "salad"),
    ("sides", "fry"),
    ("dessert", "dessert"),
    ("cake", "dessert"),
    ("sweet", "dessert"),
    ("drink", "bar"),
    ("beverage", "bar"),
    ("juice", "bar"),
    ("coffee", "bar"),
    ("tea", "bar"),
    ("soup", "grill"),
    ("noodle", "grill"),
]

PRIORITY_ORDER = {
    "vip": 0,
    "high": 1,
    "normal": 2,
    "medium": 2,
    "standard": 2,
    "low": 3,
}


def allocate_batch_id(station_code: Optional[str]) -> str:
    stamp = dj_tz.now().strftime("%y%m%d%H%M%S")
    code = (station_code or "batch").upper()
    return f"{code}-{stamp}"


def _load_station_lookup():
    from .models import KitchenStation

    stations = list(
        KitchenStation.objects.filter(is_active=True).order_by("sort_order")
    )
    return {station.code: station for station in stations}, stations


def resolve_station_for_item(menu_item, *, explicit_station=None, station_lookup=None):
    if station_lookup is None:
        station_lookup, _ = _load_station_lookup()

    if explicit_station:
        station = station_lookup.get(explicit_station)
        if station:
            return station

    category = (getattr(menu_item, "category", "") or "").lower()
    name = (getattr(menu_item, "name", "") or "").lower()

    for keyword, station_code in CATEGORY_STATION_KEYWORDS:
        if keyword in category or keyword in name:
            station = station_lookup.get(station_code)
            if station:
                return station

    # Default to expo if available, else any station
    fallback = station_lookup.get(DEFAULT_EXPO_STATION_CODE)
    if fallback:
        return fallback
    return next(iter(station_lookup.values()), None)


def parse_iso_datetime(value: Optional[str]):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        try:
            dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None
    if dt.tzinfo is None:
        try:
            dt = dj_tz.make_aware(dt)  # type: ignore[attr-defined]
        except Exception:
            dt = dt.replace(tzinfo=dj_tz.get_current_timezone())  # type: ignore[attr-defined]
    return dt
ORDER_STATES = [
    ("new", "New"),
    ("pending", "Pending"),
    ("accepted", "Accepted"),
    ("in_queue", "In Queue"),
    ("in_prep", "In Preparation"),
    ("in_progress", "In Progress"),
    ("assembling", "Assembling"),
    ("staged", "Staged"),
    ("ready", "Ready"),
    ("handoff", "Handoff"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
    ("voided", "Voided"),
    ("refunded", "Refunded"),
]

ORDER_STATUS_CANONICAL_MAP = {
    "pending": "new",
    "in_queue": "accepted",
    "in_progress": "in_prep",
    "ready": "staged",
}

ORDER_STATUS_DISPLAY = {
    "new": "New",
    "accepted": "Accepted",
    "in_prep": "In Prep",
    "assembling": "Assembling",
    "staged": "Staged",
    "handoff": "Handoff",
    "completed": "Completed",
    "cancelled": "Cancelled",
    "voided": "Voided",
    "refunded": "Refunded",
}

ALLOWED_TRANSITIONS = {
    "new": {"accepted", "cancelled"},
    "accepted": {"in_prep", "assembling", "cancelled"},
    "in_prep": {"assembling", "staged", "cancelled"},
    "assembling": {"staged", "handoff", "cancelled"},
    "staged": {"handoff", "completed", "cancelled"},
    "handoff": {"completed", "voided"},
    "completed": {"refunded"},
    "cancelled": set(),
    "voided": set(),
    "refunded": set(),
}

ORDER_ACTIVE_STATUSES = {
    "new",
    "pending",
    "accepted",
    "in_queue",
    "in_prep",
    "in_progress",
    "assembling",
    "staged",
    "ready",
    "handoff",
}

ORDER_TERMINAL_STATUSES = {"completed", "cancelled", "voided", "refunded"}

AUTO_ADVANCE_DEFAULT_SECONDS = max(
    5,
    int(getattr(settings, "POS_QUEUE_AUTO_ADVANCE_SECONDS", 60) or 60),
)
AUTO_ADVANCE_PHASE_RULES = [
    {
        "name": "prep",
        "current": {"new", "pending", "accepted", "in_queue"},
        "target": "in_progress",
    },
    {
        "name": "stage",
        "current": {"in_progress", "in_prep", "assembling"},
        "target": "ready",
    },
    {
        "name": "complete",
        "current": {"ready", "staged"},
        "target": "completed",
    },
]


def _auto_next_status(status: Optional[str]) -> Optional[str]:
    canonical = canonical_status(status)
    for rule in AUTO_ADVANCE_PHASE_RULES:
        if canonical in rule["current"]:
            return rule["target"]
    return None


def _auto_should_track(status: Optional[str]) -> bool:
    canonical = canonical_status(status)
    return canonical not in ORDER_TERMINAL_STATUSES


def _coerce_duration_seconds(candidate: Optional[int]) -> int:
    try:
        seconds = int(candidate)
        if seconds <= 0:
            raise ValueError
        return seconds
    except Exception:
        return AUTO_ADVANCE_DEFAULT_SECONDS


def _reset_auto_flow(
    order,
    *,
    now=None,
    target: Optional[str] = None,
    duration_seconds: Optional[int] = None,
    increment_sequence: bool = True,
) -> list[str]:
    """
    Configure or clear the auto-advance timer for the given order.
    Returns a list of model fields that were mutated.
    """
    update_fields: list[str] = []
    if not _auto_should_track(order.status):
        order.auto_advance_target = ""
        order.auto_advance_at = None
        order.phase_started_at = None
        order.auto_advance_paused = False
        order.auto_advance_pause_reason = ""
        update_fields.extend(
            [
                "auto_advance_target",
                "auto_advance_at",
                "phase_started_at",
                "auto_advance_paused",
                "auto_advance_pause_reason",
            ]
        )
        return update_fields

    auto_candidate = _auto_next_status(order.status)
    selected_target = target or order.auto_advance_target or auto_candidate
    if selected_target:
        current_canonical = canonical_status(order.status)
        target_canonical = canonical_status(selected_target)
        allowed_targets = ALLOWED_TRANSITIONS.get(current_canonical, set())
        if (
            not allowed_targets
            or target_canonical == current_canonical
            or target_canonical not in allowed_targets
        ):
            selected_target = auto_candidate or ""
    if not selected_target:
        order.auto_advance_target = ""
        order.auto_advance_at = None
        order.phase_started_at = None
        order.auto_advance_paused = False
        order.auto_advance_pause_reason = ""
        update_fields.extend(
            [
                "auto_advance_target",
                "auto_advance_at",
                "phase_started_at",
                "auto_advance_paused",
                "auto_advance_pause_reason",
            ]
        )
        return update_fields

    now_ts = now or dj_tz.now()
    seconds = _coerce_duration_seconds(
        duration_seconds or order.auto_advance_duration_seconds or AUTO_ADVANCE_DEFAULT_SECONDS
    )
    order.auto_advance_target = selected_target
    order.auto_advance_duration_seconds = seconds
    order.phase_started_at = now_ts
    order.auto_advance_at = now_ts + timedelta(seconds=seconds)
    order.auto_advance_paused = False
    order.auto_advance_pause_reason = ""
    update_fields.extend(
        [
            "auto_advance_target",
            "auto_advance_duration_seconds",
            "phase_started_at",
            "auto_advance_at",
            "auto_advance_paused",
            "auto_advance_pause_reason",
        ]
    )
    if increment_sequence:
        order.phase_sequence = (order.phase_sequence or 0) + 1
        update_fields.append("phase_sequence")
    return update_fields


def _pause_auto_flow(order, *, reason: str = "") -> list[str]:
    order.auto_advance_paused = True
    order.auto_advance_pause_reason = reason or ""
    order.phase_started_at = None
    order.auto_advance_at = None
    return [
        "auto_advance_paused",
        "auto_advance_pause_reason",
        "phase_started_at",
        "auto_advance_at",
    ]


def _clear_auto_flow(order, *, reason: str = "") -> list[str]:
    order.auto_advance_target = ""
    order.auto_advance_at = None
    order.phase_started_at = None
    order.auto_advance_paused = False
    order.auto_advance_pause_reason = reason or ""
    return [
        "auto_advance_target",
        "auto_advance_at",
        "phase_started_at",
        "auto_advance_paused",
        "auto_advance_pause_reason",
    ]


def _start_auto_flow(order, *, now=None, duration_seconds: Optional[int] = None) -> list[str]:
    if not _auto_should_track(order.status):
        return _clear_auto_flow(order)
    next_target = _auto_next_status(order.status)
    return _reset_auto_flow(
        order,
        now=now,
        target=next_target,
        duration_seconds=duration_seconds,
        increment_sequence=True,
    )

ITEM_STATES = [
    ("queued", "Queued"),
    ("firing", "Firing"),
    ("cooking", "Cooking"),
    ("hold", "Hold"),
    ("delayed", "Delayed"),
    ("ready", "Ready"),
    ("refired", "Re-fired"),
    ("cancelled", "Cancelled"),
    ("completed", "Completed"),
]

ITEM_ALLOWED_TRANSITIONS = {
    "queued": {"firing", "cancelled", "delayed"},
    "firing": {"cooking", "hold", "cancelled"},
    "cooking": {"hold", "ready", "delayed", "cancelled"},
    "hold": {"cooking", "ready", "cancelled"},
    "delayed": {"cooking", "cancelled"},
    "ready": {"completed", "refired"},
    "refired": {"cooking", "hold"},
    "cancelled": set(),
    "completed": set(),
}

ITEM_ACTIVE_STATES = {
    "queued",
    "firing",
    "cooking",
    "hold",
    "delayed",
    "refired",
}


def _parse_uuid(val):
    try:
        if not val:
            return None
        _ = UUID(str(val))
        return str(val)
    except Exception:
        return None


def _safe_item(i):
    state = canonical_item_state(getattr(i, "state", None))
    now_ts = dj_tz.now()
    state_started = getattr(i, "updated_at", None) or getattr(i, "created_at", None)

    if state in {"firing", "cooking"} and getattr(i, "fired_at", None):
        state_started = i.fired_at
    elif state in {"ready", "completed"} and getattr(i, "ready_at", None):
        state_started = i.ready_at

    seconds_in_state = 0
    if state_started:
        try:
            seconds_in_state = max(
                0, int((now_ts - state_started).total_seconds())
            )
        except Exception:
            seconds_in_state = 0

    age_seconds = 0
    if getattr(i, "created_at", None):
        try:
            age_seconds = max(
                0, int((now_ts - i.created_at).total_seconds())
            )
        except Exception:
            age_seconds = 0

    return {
        "id": str(i.id),
        "menuItemId": str(i.menu_item_id) if i.menu_item_id else None,
        "name": i.item_name,
        "price": float(i.price or 0),
        "quantity": int(i.quantity or 0),
        "total": float((i.price or 0) * (i.quantity or 0)),
        "state": state,
        "stateDisplay": dict(ITEM_STATES).get(state, state.title()),
        "stationCode": i.station_code or None,
        "stationName": i.station_name or None,
        "cookSecondsEstimate": int(i.cook_seconds_estimate or 0),
        "cookSecondsActual": int(i.cook_seconds_actual or 0),
        "firedAt": i.fired_at.isoformat() if i.fired_at else None,
        "readyAt": i.ready_at.isoformat() if i.ready_at else None,
        "holdUntil": i.hold_until.isoformat() if i.hold_until else None,
        "batchId": i.batch_id or None,
        "priority": i.priority or "normal",
        "sequence": int(i.sequence or 0),
        "modifiers": list(i.modifiers or []),
        "allergens": list(i.allergens or []),
        "hasAllergens": bool(i.allergens),
        "notes": i.notes or "",
        "meta": i.meta or {},
        "createdAt": i.created_at.isoformat() if i.created_at else None,
        "updatedAt": i.updated_at.isoformat() if i.updated_at else None,
        "ageSeconds": age_seconds,
        "secondsInState": seconds_in_state,
        "isDelayed": state == "delayed" or (
            i.hold_until is not None and i.hold_until > now_ts
        ),
    }


def _safe_order(o, with_items=True):
    canonical = canonical_status(o.status)
    promised_time = o.promised_time.isoformat() if o.promised_time else None
    time_completed = o.completed_at.isoformat() if o.completed_at else None
    now_ts = dj_tz.now()
    age_seconds = 0
    if o.created_at:
        try:
            age_seconds = max(0, int((now_ts - o.created_at).total_seconds()))
        except Exception:
            age_seconds = 0

    data = {
        "id": str(o.id),
        "orderNumber": o.order_number,
        "status": o.status,
        "canonicalStatus": canonical,
        "statusDisplay": status_display(o.status),
        "type": o.order_type or "walk-in",
        "customerName": o.customer_name or "",
        "subtotal": float(o.subtotal or 0),
        "discount": float(o.discount or 0),
        "total": float(o.total_amount or 0),
        "paymentMethod": o.payment_method or None,
        "timeReceived": o.created_at.isoformat() if o.created_at else None,
        "timeCompleted": time_completed,
        "createdAt": o.created_at.isoformat() if o.created_at else None,
        "updatedAt": o.updated_at.isoformat() if o.updated_at else None,
        "promisedTime": promised_time,
        "quoteMinutes": int(o.quoted_minutes or 0),
        "channel": o.channel or (o.order_type or "").lower() or "walk-in",
        "priority": o.priority or "normal",
        "etaSeconds": int(o.eta_seconds or 0),
        "isThrottled": bool(o.is_throttled),
        "throttleReason": o.throttle_reason or "",
        "bulkReference": o.bulk_reference or "",
        "shelfSlot": o.shelf_slot or "",
        "handoffCode": o.handoff_code or "",
        "handoffVerifiedAt": o.handoff_verified_at.isoformat()
        if o.handoff_verified_at
        else None,
        "handoffVerifiedBy": o.handoff_verified_by or "",
        "partialReadyItems": int(o.partial_ready_items or 0),
        "totalItems": int(o.total_items_cached or 0),
        "lastStationCode": o.last_station_code or "",
        "lateBySeconds": int(o.late_by_seconds or 0),
        "ageSeconds": age_seconds,
        "meta": o.meta or {},
        "phaseSequence": int(o.phase_sequence or 0),
        "phaseStartedAt": o.phase_started_at.isoformat()
        if o.phase_started_at
        else None,
        "autoAdvanceAt": o.auto_advance_at.isoformat()
        if o.auto_advance_at
        else None,
        "autoAdvanceTarget": o.auto_advance_target or "",
        "autoAdvancePaused": bool(o.auto_advance_paused),
        "autoAdvancePauseReason": o.auto_advance_pause_reason or "",
        "autoAdvanceDurationSeconds": int(
            o.auto_advance_duration_seconds or AUTO_ADVANCE_DEFAULT_SECONDS
        ),
    }
    data["autoAdvance"] = {
        "phaseSequence": data["phaseSequence"],
        "phaseStartedAt": data["phaseStartedAt"],
        "autoAdvanceAt": data["autoAdvanceAt"],
        "targetStatus": data["autoAdvanceTarget"],
        "paused": data["autoAdvancePaused"],
        "pauseReason": data["autoAdvancePauseReason"],
        "durationSeconds": data["autoAdvanceDurationSeconds"],
    }
    if with_items:
        try:
            items = list(o.items.all())
            safe_items = [_safe_item(x) for x in items]
            data["items"] = safe_items
            total_qty = sum(it["quantity"] for it in safe_items)
            ready_qty = sum(
                it["quantity"] for it in safe_items if it["state"] in {"ready", "completed"}
            )
            data["totalItems"] = total_qty
            data["partialReadyItems"] = ready_qty
            data["pendingItems"] = max(0, total_qty - ready_qty)
            data["hasAllergens"] = any(it["hasAllergens"] for it in safe_items)
            data["hasModifiers"] = any(bool(it["modifiers"]) for it in safe_items)
        except Exception:
            data["items"] = []
            data["pendingItems"] = 0
            data["hasAllergens"] = False
            data["hasModifiers"] = False
    return data


@require_http_methods(["GET", "POST"])  # list or create
@rate_limit(limit=20, window_seconds=60)
def orders(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    # GET list with basic filters
    if request.method == "GET":
        try:
            from .models import Order
            status = (request.GET.get("status") or "").lower().strip()
            channel = (request.GET.get("channel") or "").strip()
            priority = (request.GET.get("priority") or "").strip().lower()
            search = (request.GET.get("search") or "").strip().lower()
            try:
                page = int(request.GET.get("page") or 1)
            except Exception:
                page = 1
            try:
                limit = int(request.GET.get("limit") or 50)
            except Exception:
                limit = 50
            page = max(1, page)
            limit = max(1, min(200, limit))
            qs = Order.objects.all()
            if status:
                canonical = canonical_status(status)
                if canonical != status:
                    qs = qs.filter(status__in=[status, canonical])
                else:
                    qs = qs.filter(status=canonical)
            if channel:
                qs = qs.filter(channel__iexact=channel)
            if priority:
                qs = qs.filter(priority__iexact=priority)
            if search:
                qs = qs.filter(order_number__icontains=search)
            qs = qs.order_by("-created_at")
            total = qs.count()
            start = (page - 1) * limit
            end = start + limit
            rows = list(qs[start:end])
            data = [_safe_order(x) for x in rows]
            return JsonResponse({
                "success": True,
                "data": data,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": max(1, (total + limit - 1) // limit),
                },
            })
        except Exception:
            logger.exception("Failed to list orders")
            return JsonResponse({"success": False, "message": "Unable to fetch orders"}, status=500)

    # POST create (place order)
    if not _has_permission(actor, "order.place"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}
    items = payload.get("items") or []
    order_type = (payload.get("type") or "walk-in").lower()
    customer_name = (payload.get("customerName") or "").strip()
    discount = Decimal(str(payload.get("discount") or 0))
    payment_method = (
        (payload.get("paymentMethod") or payload.get("payment_method") or payload.get("paymentMode"))
        or ""
    ).strip()
    promised_time_input = payload.get("promisedTime") or payload.get("promised_time") or None
    promised_time = parse_iso_datetime(promised_time_input) if promised_time_input else None
    if not isinstance(items, list) or not items:
        return JsonResponse({"success": False, "message": "items is required"}, status=400)

    try:
        from .models import Order, OrderItem, MenuItem

        station_lookup, station_list = _load_station_lookup()
        active_item_states = list(ITEM_ACTIVE_STATES)
        wip_rows = (
            OrderItem.objects.filter(state__in=active_item_states)
            .values("station_code")
            .annotate(total_qty=Sum("quantity"))
        )
        station_wip = defaultdict(int)
        for row in wip_rows:
            code = row.get("station_code") or DEFAULT_EXPO_STATION_CODE
            station_wip[code] = int(row.get("total_qty") or 0)

        base_quote = (
            payload.get("quoteMinutes")
            or payload.get("quotedMinutes")
            or payload.get("quoted_minutes")
            or 12
        )
        try:
            base_quote = int(base_quote)
        except Exception:
            base_quote = 12
        base_quote = max(6, min(base_quote, 90))
        recommended_quote = base_quote

        throttle_reason = (payload.get("throttleReason") or "").strip()
        requested_priority = (payload.get("priority") or "normal").lower()
        requested_channel = (payload.get("channel") or order_type or "walk-in").lower()
        requested_shelf = (payload.get("shelfSlot") or "").upper()
        bulk_reference = payload.get("bulkReference") or ""
        is_throttled = bool(payload.get("isThrottled") or False)
        requested_number = (
            payload.get("orderNumber")
            or payload.get("order_number")
            or payload.get("orderNo")
            or payload.get("order_no")
        )
        order_number = _normalize_order_number_candidate(requested_number)
        prefix_source = requested_channel or order_type or "walk-in"
        prefix_letter = (prefix_source[:1].upper() if prefix_source else "W") or "W"
        if order_number:
            if Order.objects.filter(order_number__iexact=order_number).exists():
                order_number = generate_unique_order_number(
                    prefix=prefix_letter, order_model=Order
                )
        else:
            order_number = generate_unique_order_number(
                prefix=prefix_letter, order_model=Order
            )


        auto_throttle = []
        subtotal = Decimal("0")
        line_blueprints = []
        sequence_counter = 1

        with transaction.atomic():
            for it in items:
                mid = it.get("menuItemId") or it.get("id")
                qty = int(it.get("quantity") or it.get("qty") or 0)
                if not mid or qty <= 0:
                    continue
                mi = MenuItem.objects.filter(id=mid, available=True).first()
                if not mi:
                    continue

                price = Decimal(mi.price or 0)
                subtotal += price * qty

                explicit_station = (it.get("stationCode") or it.get("station") or "").lower() or None
                station = resolve_station_for_item(
                    mi, explicit_station=explicit_station, station_lookup=station_lookup
                )
                station_code = station.code if station else DEFAULT_EXPO_STATION_CODE
                fallback_station = station_lookup.get(DEFAULT_EXPO_STATION_CODE)
                station_name = (
                    station.name
                    if station
                    else (fallback_station.name if fallback_station else "Expo")
                )

                station_wip[station_code] += qty
                capacity = max(1, getattr(station, "capacity", 4) or 1)
                utilization = station_wip[station_code] / capacity
                if utilization > 1:
                    auto_throttle.append((station_code, utilization, capacity))
                    recommended_quote = max(
                        recommended_quote,
                        base_quote + int((station_wip[station_code] - capacity + 1) * 2),
                    )

                prep_minutes = int(getattr(mi, "preparation_time", 0) or 0)
                cook_seconds_estimate = int(max(0, prep_minutes * 60))

                modifiers = it.get("modifiers") or []
                allergens = it.get("allergens") or []
                notes = it.get("notes") or ""
                category = mi.category or ""
                line_blueprints.append(
                    {
                        "menu_item": mi,
                        "quantity": qty,
                        "price": price,
                        "category": category,
                        "station_code": station_code,
                        "station_name": station_name,
                        "cook_seconds_estimate": cook_seconds_estimate,
                        "priority": (it.get("priority") or requested_priority),
                        "modifiers": modifiers,
                        "allergens": allergens,
                        "notes": notes,
                        "sequence": sequence_counter,
                        "explicit_station": explicit_station,
                    }
                )
                sequence_counter += 1

            if not line_blueprints:
                return JsonResponse({"success": False, "message": "No valid items"}, status=400)

            if auto_throttle and not throttle_reason:
                parts = []
                for code, util, cap in auto_throttle:
                    station = station_lookup.get(code)
                    name = station.name if station else code.upper()
                    parts.append(f"{name} at {int(util * 100)}% load")
                throttle_reason = ", ".join(parts)
                is_throttled = True

        discount = max(Decimal("0"), discount)
        if discount > subtotal:
            discount = subtotal
        total = subtotal - discount
        totals_payload = payload.get("totals") or {}
        total_override = (
            totals_payload.get("total")
            or totals_payload.get("grandTotal")
            or totals_payload.get("amount")
        )
        if total_override is not None:
            try:
                total = Decimal(str(total_override))
            except Exception:
                total = subtotal - discount
        total = max(Decimal("0"), total)
        eta_seconds = max(0, int(recommended_quote) * 60)

        o = Order.objects.create(
            order_number=order_number,
            status="accepted",
            order_type=order_type,
            channel=requested_channel,
            customer_name=customer_name,
            subtotal=subtotal,
            discount=discount,
            total_amount=total,  # Make sure 'total' is Decimal(subtotal - discount)
            payment_method=payment_method or ("cash" if requested_channel == "walk-in" else ""),
            placed_by=actor if getattr(actor, "id", None) else None,  # correct FK to AppUser
            promised_time=promised_time,
            quoted_minutes=recommended_quote,
            priority=requested_priority,
            eta_seconds=eta_seconds,
            is_throttled=is_throttled,
            throttle_reason=throttle_reason or "",
            bulk_reference=bulk_reference or "",
            shelf_slot=requested_shelf.upper() if requested_shelf else "",
            auto_advance_duration_seconds=AUTO_ADVANCE_DEFAULT_SECONDS,
        )
        created_items = []
        for blueprint in line_blueprints:
                item = OrderItem.objects.create(
                    order=o,
                    menu_item=blueprint["menu_item"],
                    item_name=blueprint["menu_item"].name,
                    category=blueprint["category"],
                    price=blueprint["price"],
                    quantity=blueprint["quantity"],
                    state="queued",
                    station_code=blueprint["station_code"],
                    station_name=blueprint["station_name"],
                    cook_seconds_estimate=blueprint["cook_seconds_estimate"],
                    priority=blueprint["priority"],
                    sequence=blueprint["sequence"],
                    modifiers=blueprint["modifiers"],
                    allergens=blueprint["allergens"],
                    notes=blueprint["notes"],
                    meta={"stationSuggestion": blueprint["explicit_station"]} if blueprint["explicit_station"] else {},
                )
                created_items.append(item)

        recalc_order_counters(o, created_items)

        order_payload = _safe_order(o)
        record_order_event(
            o,
            event_type="order.created",
            to_state=o.status,
            actor=actor if hasattr(actor, "id") else None,
            payload={
                "channel": requested_channel,
                "priority": requested_priority,
                "isThrottled": is_throttled,
                "quotedMinutes": recommended_quote,
            },
        )
        publish_event("order.created", {"order": order_payload}, roles={"admin", "manager", "staff"}, user_ids=[str(o.placed_by_id)] if getattr(o, "placed_by_id", None) else None)

        # Trigger notifications for new order and large orders
        try:
            from .notification_triggers import trigger_new_order, trigger_large_order
            trigger_new_order(o)
            trigger_large_order(o)
        except Exception:
            pass

        return JsonResponse({"success": True, "data": order_payload})
    except Exception:
        logger.exception("Failed to create order")
        return JsonResponse({"success": False, "message": "Failed to create order"}, status=500)


@require_http_methods(["GET"])
@rate_limit(limit=30, window_seconds=60)
def order_generate_number(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "order.place"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    channel = (request.GET.get("channel") or request.GET.get("type") or "walk-in").strip().lower()
    prefix = channel[:1].upper() or "W"

    try:
        from .models import Order

        order_number = generate_unique_order_number(prefix=prefix, order_model=Order)
        reference = _order_reference_from_number(order_number)
        return JsonResponse(
            {
                "success": True,
                "data": {
                    "orderNumber": order_number,
                    "orderReference": reference,
                },
            }
        )
    except Exception:
        logger.exception("Failed to generate order number")
        return JsonResponse({"success": False, "message": "Unable to generate order number"}, status=500)


@require_http_methods(["GET"])  # queue
@rate_limit(limit=60, window_seconds=60)
def order_queue(request):
    allow_public = getattr(settings, "ORDER_QUEUE_PUBLIC", False)
    actor, err = _actor_from_request(request)
    if not actor and not allow_public:
        return err
    if actor and not _has_permission(actor, "order.queue.handle"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import Order, OrderItem, OrderEvent

        station_lookup, stations = _load_station_lookup()
        active_statuses = set(ORDER_ACTIVE_STATUSES)
        now_ts = dj_tz.now()

        qs = (
            Order.objects.filter(status__in=active_statuses)
            .prefetch_related("items")
            .order_by("created_at")
        )

        orders_payload = []
        station_items_map: dict[str, list] = defaultdict(list)
        station_quantity: dict[str, int] = defaultdict(int)
        smart_batch_candidates: dict[tuple[str, str], list] = defaultdict(list)
        status_counts: dict[str, int] = defaultdict(int)
        channel_counts: dict[str, int] = defaultdict(int)
        priority_counts: dict[str, int] = defaultdict(int)
        ready_for_handoff = []
        late_orders = []
        total_prep_seconds = 0
        prep_samples = 0
        lateness_accumulator = 0
        lateness_samples = 0
        on_time_count = 0

        for order in qs:
            safe = _safe_order(order)
            orders_payload.append(safe)

            canonical = canonical_status(order.status)
            status_counts[canonical] += 1
            channel_counts[safe["channel"]] += 1
            priority_counts[safe["priority"]] += 1

            if order.promised_time:
                compare_ts = order.completed_at or (order.updated_at if canonical in {"staged", "handoff"} else now_ts)
                lateness = 0
                if compare_ts and compare_ts > order.promised_time:
                    lateness = int((compare_ts - order.promised_time).total_seconds())
                lateness_accumulator += max(0, lateness)
                lateness_samples += 1
                if lateness <= 0:
                    on_time_count += 1

            if canonical in {"staged", "handoff"}:
                code = ensure_handoff_code(order)
                safe["handoffCode"] = code
                ready_for_handoff.append(
                    {
                        "orderId": safe["id"],
                        "orderNumber": safe["orderNumber"],
                        "handoffCode": code,
                        "shelfSlot": safe["shelfSlot"],
                        "customerName": safe["customerName"],
                        "lateBySeconds": safe["lateBySeconds"],
                    }
                )

            if safe["lateBySeconds"] > 0 and canonical not in ORDER_TERMINAL_STATUSES:
                late_orders.append(safe["id"])

            item_objects = list(order.items.all())
            object_map = {str(obj.id): obj for obj in item_objects}

            for safe_item in safe.get("items", []):
                item_obj = object_map.get(safe_item["id"])
                state = canonical_item_state(safe_item["state"])
                station_code = safe_item["stationCode"] or DEFAULT_EXPO_STATION_CODE
                station_quantity[station_code] += safe_item["quantity"]

                station_items_map[station_code].append(
                    {
                        "itemId": safe_item["id"],
                        "orderId": safe["id"],
                        "orderNumber": safe["orderNumber"],
                        "state": state,
                        "stateDisplay": safe_item["stateDisplay"],
                        "quantity": safe_item["quantity"],
                        "menuItemId": safe_item["menuItemId"],
                        "name": safe_item["name"],
                        "secondsInState": safe_item["secondsInState"],
                        "ageSeconds": safe_item["ageSeconds"],
                        "priority": safe_item["priority"],
                        "channel": safe["channel"],
                        "orderStatus": safe["canonicalStatus"],
                        "promisedTime": safe["promisedTime"],
                        "lateBySeconds": safe["lateBySeconds"],
                        "isLate": safe["lateBySeconds"] > 0 and canonical not in ORDER_TERMINAL_STATUSES,
                        "allergens": safe_item["allergens"],
                        "modifiers": safe_item["modifiers"],
                        "notes": safe_item["notes"],
                        "customerName": safe["customerName"],
                    }
                )

                if state in {"queued", "firing"} and item_obj is not None:
                    smart_batch_candidates[
                        (
                            station_code,
                            safe_item["menuItemId"] or (safe_item["name"] or "").lower(),
                        )
                    ].append(
                        {
                            "order_id": safe["id"],
                            "order_number": safe["orderNumber"],
                            "item_id": safe_item["id"],
                            "menu_item_id": safe_item["menuItemId"],
                            "item_name": safe_item["name"],
                            "quantity": safe_item["quantity"],
                            "created_at": item_obj.created_at or now_ts,
                            "state": state,
                        }
                    )

                if (
                    item_obj
                    and item_obj.fired_at
                    and item_obj.ready_at
                    and item_obj.ready_at > item_obj.fired_at
                ):
                    prep_duration = int(
                        (item_obj.ready_at - item_obj.fired_at).total_seconds()
                    )
                    total_prep_seconds += prep_duration
                    prep_samples += max(1, item_obj.quantity or 1)

        station_payload = []
        throttle_reasons = []
        max_utilization = 0.0

        def _sort_station_items(items):
            return sorted(
                items,
                key=lambda entry: (
                    PRIORITY_ORDER.get(entry["priority"], 2),
                    -int(entry["secondsInState"] or 0),
                    entry["orderNumber"],
                ),
            )

        for station in stations:
            code = station.code
            items = _sort_station_items(station_items_map.get(code, []))
            active_qty = station_quantity.get(code, 0)
            utilization = active_qty / max(1, station.capacity or 1)
            max_utilization = max(max_utilization, utilization)
            avg_state_seconds = (
                sum(int(item["secondsInState"] or 0) for item in items) / len(items)
                if items
                else 0
            )
            over_capacity = utilization > 1.0
            if over_capacity or utilization >= 0.9:
                pct = int(utilization * 100)
                throttle_reasons.append(f"{station.name} at {pct}% load")

            station_payload.append(
                {
                    "code": code,
                    "name": station.name,
                    "tags": station.tags,
                    "capacity": station.capacity,
                    "autoBatchWindowSeconds": station.auto_batch_window_seconds,
                    "makeToStock": station.make_to_stock,
                    "isExpo": station.is_expo,
                    "queueCount": len(items),
                    "activeQuantity": active_qty,
                    "utilization": round(utilization, 3),
                    "overCapacity": over_capacity,
                    "averageSecondsInState": int(avg_state_seconds),
                    "nextAvailabilitySeconds": int(
                        max(0, (active_qty - station.capacity))
                    )
                    * station.auto_batch_window_seconds,
                    "lateCount": sum(1 for item in items if item["isLate"]),
                    "items": items,
                }
            )

        # Include any ad-hoc stations that might not be configured yet
        for code, items in station_items_map.items():
            if code in station_lookup:
                continue
            items_sorted = _sort_station_items(items)
            active_qty = station_quantity.get(code, 0)
            station_payload.append(
                {
                    "code": code,
                    "name": code.upper(),
                    "tags": [],
                    "capacity": max(1, active_qty),
                    "autoBatchWindowSeconds": 90,
                    "makeToStock": [],
                    "isExpo": False,
                    "queueCount": len(items_sorted),
                    "activeQuantity": active_qty,
                    "utilization": 1.0,
                    "overCapacity": False,
                    "averageSecondsInState": int(
                        sum(int(item["secondsInState"] or 0) for item in items_sorted)
                        / len(items_sorted)
                    )
                    if items_sorted
                    else 0,
                    "nextAvailabilitySeconds": 0,
                    "lateCount": sum(1 for item in items_sorted if item["isLate"]),
                    "items": items_sorted,
                }
            )

        smart_batches = []
        for key, entries in smart_batch_candidates.items():
            if len(entries) <= 1:
                continue
            station_code, sku = key
            station = station_lookup.get(station_code)
            window_seconds = (
                station.auto_batch_window_seconds if station else 90
            )
            entries_sorted = sorted(entries, key=lambda e: e["created_at"])
            if (
                entries_sorted[-1]["created_at"] - entries_sorted[0]["created_at"]
            ) > timedelta(seconds=window_seconds):
                continue
            total_qty = sum(entry["quantity"] for entry in entries_sorted)
            if total_qty <= 1:
                continue
            smart_batches.append(
                {
                    "stationCode": station_code,
                    "stationName": station.name if station else station_code.upper(),
                    "menuItemId": entries_sorted[0]["menu_item_id"],
                    "itemName": entries_sorted[0]["item_name"],
                    "totalQuantity": total_qty,
                    "orders": [
                        {
                            "orderId": entry["order_id"],
                            "orderNumber": entry["order_number"],
                            "quantity": entry["quantity"],
                            "state": entry["state"],
                        }
                        for entry in entries_sorted
                    ],
                    "windowSeconds": window_seconds,
                    "recommendedFireAt": (
                        entries_sorted[0]["created_at"]
                        + timedelta(seconds=window_seconds)
                    ).isoformat(),
                }
            )

        average_prep_seconds = (
            int(total_prep_seconds / prep_samples) if prep_samples else 0
        )
        average_lateness_seconds = (
            int(lateness_accumulator / lateness_samples) if lateness_samples else 0
        )
        on_time_percent = (
            round(100 * on_time_count / lateness_samples, 2)
            if lateness_samples
            else 0
        )

        capacity_snapshot = {
            "stations": station_payload,
            "shouldThrottle": bool(throttle_reasons),
            "throttleReasons": throttle_reasons,
            "peakUtilization": round(max_utilization, 3),
            "recommendedQuoteMinutes": max(
                8, int(12 + max(0.0, max_utilization - 0.85) * 20)
            ),
        }

        event_cursor = (
            OrderEvent.objects.filter(order__status__in=active_statuses)
            .order_by("-created_at")
            .values_list("created_at", flat=True)
            .first()
        )

        summary = {
            "totalOrders": len(orders_payload),
            "statusCounts": status_counts,
            "channelCounts": channel_counts,
            "priorityCounts": priority_counts,
            "readyForHandoff": len(ready_for_handoff),
            "lateOrders": len(late_orders),
            "averagePrepSeconds": average_prep_seconds,
            "averageLatenessSeconds": average_lateness_seconds,
            "onTimePercent": on_time_percent,
        }

        return JsonResponse(
            {
                "success": True,
                "data": {
                    "orders": orders_payload,
                    "stations": station_payload,
                    "summary": summary,
                    "capacity": capacity_snapshot,
                    "batches": smart_batches,
                    "handoff": {
                        "pending": ready_for_handoff,
                        "lateOrders": late_orders,
                    },
                    "eventCursor": event_cursor.isoformat()
                    if event_cursor
                    else None,
                    "generatedAt": now_ts.isoformat(),
                },
            }
        )
    except Exception:
        logger.exception("Failed to fetch order queue")
        return JsonResponse({"success": False, "message": "Failed to fetch queue"}, status=500)


@require_http_methods(["GET"])  # history
@rate_limit(limit=30, window_seconds=60)
def order_history(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Order
        qs = Order.objects.filter(status__in=["completed", "cancelled", "refunded"]).order_by("-created_at")
        return JsonResponse({"success": True, "data": [_safe_order(x) for x in qs]})
    except Exception:
        logger.exception("Failed to fetch order history")
        return JsonResponse({"success": False, "message": "Failed to fetch history"}, status=500)


@require_http_methods(["GET"])  # bulk progress by IDs
@rate_limit(limit=120, window_seconds=60)
def order_bulk_progress(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "order.bulk.track"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    ids_param = request.GET.get("order_ids") or request.GET.get("ids") or ""
    ids = [s for s in [x.strip() for x in ids_param.split(",")] if s]
    uuids = []
    for s in ids:
        u = _parse_uuid(s)
        if u:
            uuids.append(u)
    try:
        from .models import Order
        qs = Order.objects.filter(id__in=uuids)
        data = [{"id": str(x.id), "status": x.status, "updatedAt": x.updated_at.isoformat() if x.updated_at else None} for x in qs]
        return JsonResponse({"success": True, "data": data})
    except Exception:
        logger.exception("Failed to fetch bulk order progress")
        return JsonResponse({"success": False, "message": "Failed to fetch orders"}, status=500)


@require_http_methods(["PATCH"])
@rate_limit(limit=60, window_seconds=60)
def order_item_state(request, oid, item_id):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not (
        _has_permission(actor, "order.queue.handle")
        or _has_permission(actor, "order.status.update")
    ):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import Order

        order = (
            Order.objects.prefetch_related("items__menu_item")
            .filter(id=oid)
            .first()
        )
        if not order:
            return JsonResponse({"success": False, "message": "Order not found"}, status=404)

        items_lookup = {str(it.id): it for it in order.items.all()}
        item = items_lookup.get(str(item_id))
        if not item:
            return JsonResponse({"success": False, "message": "Item not found"}, status=404)

        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        new_state_raw = (payload.get("state") or "").strip()
        target_state = canonical_item_state(new_state_raw or item.state)
        if new_state_raw and target_state not in {s for s, _ in ITEM_STATES}:
            return JsonResponse({"success": False, "message": "Invalid item state"}, status=400)

        previous_state = canonical_item_state(item.state)
        state_changed = False

        if new_state_raw:
            if (
                target_state != previous_state
                and not can_item_transition(previous_state, target_state)
            ):
                return JsonResponse(
                    {
                        "success": False,
                        "message": f"Illegal transition from {previous_state} to {target_state}",
                    },
                    status=400,
                )
            if target_state != previous_state:
                item.state = target_state
                state_changed = True

        now_ts = dj_tz.now()
        update_fields: list[str] = []

        if state_changed:
            update_fields.append("state")
            if target_state in {"firing", "cooking"}:
                item.fired_at = now_ts
                if "fired_at" not in update_fields:
                    update_fields.append("fired_at")
                if item.ready_at:
                    item.ready_at = None
                    update_fields.append("ready_at")
            if target_state == "ready":
                item.ready_at = now_ts
                update_fields.append("ready_at")
                if item.fired_at:
                    item.cook_seconds_actual = int(
                        max(0, (now_ts - item.fired_at).total_seconds())
                    )
                    update_fields.append("cook_seconds_actual")
            if target_state == "hold":
                hold_until_value = payload.get("holdUntil")
                hold_until = parse_iso_datetime(hold_until_value)
                if hold_until:
                    item.hold_until = hold_until
                    update_fields.append("hold_until")
            elif target_state not in {"hold", "delayed"} and item.hold_until:
                item.hold_until = None
                update_fields.append("hold_until")
            if target_state == "refired":
                item.batch_id = allocate_batch_id(item.station_code)
                item.fired_at = now_ts
                item.ready_at = None
                update_fields.extend(["batch_id", "fired_at", "ready_at"])

        if "stationCode" in payload:
            station_code = (payload.get("stationCode") or "").lower()
            if station_code:
                station_lookup, _ = _load_station_lookup()
                station = station_lookup.get(station_code)
                if station:
                    item.station_code = station.code
                    item.station_name = station.name
                else:
                    item.station_code = station_code
                    item.station_name = station_code.upper()
                update_fields.extend(["station_code", "station_name"])

        if "cookSecondsEstimate" in payload:
            try:
                estimate = max(0, int(payload.get("cookSecondsEstimate")))
                item.cook_seconds_estimate = estimate
                update_fields.append("cook_seconds_estimate")
            except Exception:
                pass

        if "cookSecondsActual" in payload:
            try:
                actual = max(0, int(payload.get("cookSecondsActual")))
                item.cook_seconds_actual = actual
                update_fields.append("cook_seconds_actual")
            except Exception:
                pass

        if "modifiers" in payload and isinstance(payload["modifiers"], list):
            item.modifiers = payload["modifiers"]
            update_fields.append("modifiers")

        if "allergens" in payload and isinstance(payload["allergens"], list):
            item.allergens = payload["allergens"]
            update_fields.append("allergens")

        if "notes" in payload:
            item.notes = payload.get("notes") or ""
            update_fields.append("notes")

        if "priority" in payload:
            item.priority = (payload.get("priority") or item.priority or "normal").lower()
            update_fields.append("priority")

        if "batchId" in payload:
            item.batch_id = payload.get("batchId") or item.batch_id
            update_fields.append("batch_id")

        if state_changed and target_state == "firing" and not item.batch_id:
            item.batch_id = allocate_batch_id(item.station_code)
            update_fields.append("batch_id")

        if update_fields:
            if "updated_at" not in update_fields:
                update_fields.append("updated_at")
            item.save(update_fields=update_fields)
        else:
            item.save(update_fields=["updated_at"])

        recalc_order_counters(order)

        # Auto-progress order when all items are ready
        previous_order_state = canonical_status(order.status)
        auto_transition = None
        item_states = {canonical_item_state(it.state) for it in order.items.all()}
        if item_states and item_states <= {"ready", "completed"}:
            desired = "staged" if payload.get("autoStage") else "assembling"
            current_order_state = canonical_status(order.status)
            if desired == "staged" and current_order_state not in {"staged", "handoff", "completed"}:
                auto_transition = desired
            elif desired == "assembling" and current_order_state in {"accepted", "in_prep"}:
                auto_transition = desired

        if auto_transition and canonical_status(order.status) != auto_transition:
            order.status = auto_transition
            update_order_fields = ["status", "updated_at"]
            if auto_transition == "staged" and not order.handoff_code:
                order.handoff_code = get_random_string(
                    length=6, allowed_chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
                )
                update_order_fields.append("handoff_code")
            order.save(update_fields=update_order_fields)
            record_order_event(
                order,
                event_type="order.status_auto",
                from_state=previous_order_state,
                to_state=auto_transition,
                actor=actor if hasattr(actor, "id") else None,
                payload={"trigger": "item_state"},
            )

        order.refresh_from_db()
        order_payload = _safe_order(order)
        item_payload = next(
            (it for it in order_payload.get("items", []) if it["id"] == str(item.id)),
            None,
        )

        record_order_event(
            order,
            item=item,
            event_type="order.item_state_changed",
            from_state=previous_state,
            to_state=canonical_item_state(item.state),
            actor=actor if hasattr(actor, "id") else None,
            station_code=item.station_code or "",
            payload={
                "manual": payload.get("manual", True),
                "notes": payload.get("notes") or "",
            },
        )

        publish_event(
            "order.item_state_changed",
            {
                "orderId": str(order.id),
                "order": order_payload,
                "item": item_payload,
            },
            roles={"admin", "manager", "staff"},
        )

        return JsonResponse(
            {"success": True, "data": {"order": order_payload, "item": item_payload}}
        )
    except Exception:
        logger.exception("Failed to update order item state")
        return JsonResponse(
            {"success": False, "message": "Failed to update item"}, status=500
        )


@require_http_methods(["GET"])  # detail
@rate_limit(limit=60, window_seconds=60)
def order_detail(request, oid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        from .models import Order
        o = Order.objects.filter(id=oid).first()
        if not o:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        return JsonResponse({"success": True, "data": _safe_order(o)})
    except Exception:
        logger.exception("Failed to fetch order detail")
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["PATCH"])  # auto flow controls
@rate_limit(limit=30, window_seconds=60)
def order_auto_flow(request, oid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "order.status.update"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import Order

        o = (
            Order.objects.select_related("placed_by")
            .prefetch_related("items__menu_item")
            .filter(id=oid)
            .first()
        )
        if not o:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        action = str(payload.get("action") or "").strip().lower()
        reason = str(payload.get("reason") or "").strip()
        duration_seconds = payload.get("durationSeconds")
        target_override = payload.get("targetStatus")

        update_fields: list[str] = []

        if action == "pause":
            update_fields = _pause_auto_flow(o, reason=reason)
        elif action in {"resume", "start"}:
            target = target_override or o.auto_advance_target or _auto_next_status(o.status)
            update_fields = _reset_auto_flow(
                o,
                now=dj_tz.now(),
                target=target,
                duration_seconds=duration_seconds,
                increment_sequence=True,
            )
        elif action == "reset":
            update_fields = _reset_auto_flow(
                o,
                now=dj_tz.now(),
                target=target_override or _auto_next_status(o.status),
                duration_seconds=duration_seconds,
                increment_sequence=True,
            )
        elif action in {"clear", "disable"}:
            update_fields = _clear_auto_flow(o, reason=reason)
        else:
            return JsonResponse({"success": False, "message": "Invalid action"}, status=400)

        if update_fields:
            if "updated_at" not in update_fields:
                update_fields.append("updated_at")
            o.save(update_fields=update_fields)
        else:
            o.save(update_fields=["updated_at"])

        o.refresh_from_db()
        order_payload = _safe_order(o)
        record_order_event(
            o,
            event_type="order.auto_flow",
            actor=actor if hasattr(actor, "id") else None,
            payload={
                "action": action,
                "reason": reason,
                "durationSeconds": duration_seconds,
                "targetStatus": target_override or "",
            },
        )
        try:
            from .utils_audit import record_audit

            record_audit(
                request,
                user=actor if hasattr(actor, "id") else None,
                type="action",
                action="Order auto flow update",
                details=f"order={o.order_number} action={action}",
                severity="info",
                meta={
                    "orderId": str(o.id),
                    "action": action,
                    "reason": reason,
                    "durationSeconds": duration_seconds,
                },
            )
        except Exception:
            pass

        publish_event(
            "order.auto_flow",
            {"order": order_payload, "action": action},
            roles={"admin", "manager", "staff"},
            user_ids=[str(o.placed_by_id)] if getattr(o, "placed_by_id", None) else None,
        )
        return JsonResponse({"success": True, "data": order_payload})
    except Exception:
        logger.exception("Failed to update order auto flow")
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


@require_http_methods(["PATCH"])  # status update
@rate_limit(limit=30, window_seconds=60)
def order_status(request, oid):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "order.status.update"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import Order
        o = (
            Order.objects.select_related("placed_by")
            .prefetch_related("items__menu_item")
            .filter(id=oid)
            .first()
        )
        if not o:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        new_status_raw = (payload.get("status") or "").strip()
        target_status = canonical_status(new_status_raw or o.status)
        if new_status_raw and target_status not in {s for s, _ in ORDER_STATES}:
            return JsonResponse({"success": False, "message": "Invalid status"}, status=400)

        previous_status = o.status
        previous_canonical = canonical_status(previous_status)
        current_canonical = canonical_status(o.status)
        status_changed = False

        if new_status_raw:
            if not can_transition(current_canonical, target_status):
                return JsonResponse(
                    {
                        "success": False,
                        "message": f"Illegal transition from {current_canonical} to {target_status}",
                    },
                    status=400,
                )
            if target_status != current_canonical:
                o.status = target_status
                status_changed = True

        update_fields: list[str] = []

        if status_changed:
            update_fields.append("status")
            if target_status == "completed":
                o.completed_at = dj_tz.now()
                update_fields.append("completed_at")
            elif previous_canonical == "completed" and target_status != "completed":
                o.completed_at = None
                update_fields.append("completed_at")

        auto_fields: list[str] = []

        if status_changed:
            if canonical_status(o.status) in ORDER_TERMINAL_STATUSES:
                auto_fields = _clear_auto_flow(o, reason="status_changed")
            else:
                auto_fields = _start_auto_flow(o)

        if "shelfSlot" in payload:
            o.shelf_slot = (payload.get("shelfSlot") or "").upper()
            update_fields.append("shelf_slot")

        if "priority" in payload:
            o.priority = (payload.get("priority") or o.priority or "normal").lower()
            update_fields.append("priority")

        if "quoteMinutes" in payload or "quotedMinutes" in payload:
            quoted = payload.get("quoteMinutes") or payload.get("quotedMinutes")
            try:
                quoted_int = int(quoted)
                if quoted_int > 0:
                    o.quoted_minutes = quoted_int
                    o.eta_seconds = quoted_int * 60
                    update_fields.extend(["quoted_minutes", "eta_seconds"])
            except Exception:
                pass

        if "promisedTime" in payload:
            parsed = parse_iso_datetime(payload.get("promisedTime"))
            if parsed:
                o.promised_time = parsed
                update_fields.append("promised_time")

        if "isThrottled" in payload:
            o.is_throttled = bool(payload.get("isThrottled"))
            update_fields.append("is_throttled")

        if "throttleReason" in payload:
            o.throttle_reason = payload.get("throttleReason") or ""
            update_fields.append("throttle_reason")

        if "bulkReference" in payload:
            o.bulk_reference = payload.get("bulkReference") or ""
            update_fields.append("bulk_reference")

        if "handoffCode" in payload and payload.get("handoffCode"):
            o.handoff_code = payload.get("handoffCode")
            update_fields.append("handoff_code")

        if target_status in {"staged", "handoff"} and not o.handoff_code:
            o.handoff_code = get_random_string(
                length=6, allowed_chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            )
            update_fields.append("handoff_code")

        if "handoffVerifiedBy" in payload:
            verifier = (payload.get("handoffVerifiedBy") or "").strip()
            if verifier:
                o.handoff_verified_by = verifier
                o.handoff_verified_at = dj_tz.now()
                update_fields.extend(["handoff_verified_by", "handoff_verified_at"])

        if "meta" in payload and isinstance(payload["meta"], dict):
            meta = o.meta or {}
            meta.update(payload["meta"])
            o.meta = meta
            update_fields.append("meta")

        if auto_fields:
            update_fields.extend(auto_fields)

        if update_fields:
            if "updated_at" not in update_fields:
                update_fields.append("updated_at")
            o.save(update_fields=update_fields)
        else:
            o.save(update_fields=["updated_at"])

        # Optional: decrement inventory on completion using simple recipe from MenuItem.ingredients
        if canonical_status(o.status) == "completed":
            try:
                from .models import InventoryItem
                from .inventory_services import consume_for_order
                # Build components = [(InventoryItem, qty)]
                comp_map: dict[str, int] = {}
                for li in o.items.select_related("menu_item").all():
                    mi = li.menu_item
                    if not mi:
                        continue
                    ings = mi.ingredients or []
                    for inv_id in ings:
                        try:
                            # treat ingredient as inventory item id; 1 unit per line-item quantity
                            iid = str(inv_id)
                            comp_map[iid] = comp_map.get(iid, 0) + int(li.quantity or 0)
                        except Exception:
                            continue
                if comp_map:
                    # Load items present in comp_map
                    invs = {str(x.id): x for x in InventoryItem.objects.filter(id__in=list(comp_map.keys()))}
                    components = [(invs[k], comp_map[k]) for k in comp_map.keys() if k in invs]
                    if components:
                        # Use MAIN location by default
                        from .models import Location
                        loc = Location.objects.filter(code="MAIN").first() or Location.objects.create(code="MAIN", name="Main")
                        consume_for_order(order_id=str(o.id), components=components, location=loc, actor=actor if hasattr(actor, "id") else None)
            except Exception:
                pass

            # Trigger notification for completed order
            if status_changed and previous_canonical != "completed":
                try:
                    from .notification_triggers import trigger_order_completed
                    trigger_order_completed(o)
                except Exception:
                    pass
        # Optional: audit log
        try:
            from .utils_audit import record_audit
            record_audit(
                request,
                user=actor if hasattr(actor, "id") else None,
                type="action",
                action="Order status update",
                details=f"order={o.order_number} status={new_status}",
                severity="info",
                meta={"orderId": str(o.id), "status": new_status},
            )
        except Exception:
            pass

        try:
            recalc_order_counters(o)
        except Exception:
            pass

        o.refresh_from_db()
        order_payload = _safe_order(o)

        record_order_event(
            o,
            event_type="order.status_changed",
            from_state=previous_canonical,
            to_state=canonical_status(o.status),
            actor=actor if hasattr(actor, "id") else None,
            payload={
                "reason": payload.get("reason") or "",
                "notes": payload.get("notes") or "",
            },
        )

        try:
            from .utils_audit import record_audit

            record_audit(
                request,
                user=actor if hasattr(actor, "id") else None,
                type="action",
                action="Order status update",
                details=f"order={o.order_number} {previous_canonical}->{canonical_status(o.status)}",
                severity="info",
                meta={
                    "orderId": str(o.id),
                    "from": previous_canonical,
                    "to": canonical_status(o.status),
                    "reason": payload.get("reason") or "",
                },
            )
        except Exception:
            pass

        publish_event(
            "order.status_changed",
            {"order": order_payload, "status": canonical_status(o.status)},
            roles={"admin", "manager", "staff"},
            user_ids=[str(o.placed_by_id)] if getattr(o, "placed_by_id", None) else None,
        )
        return JsonResponse({"success": True, "data": order_payload})
    except Exception:
        return JsonResponse({"success": False, "message": "Server error"}, status=500)


__all__ = [
    "orders",
    "order_queue",
    "order_history",
    "order_bulk_progress",
    "order_detail",
    "order_auto_flow",
    "order_item_state",
    "order_status",
]
