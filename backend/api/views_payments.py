"""Simplified POS payment flow with clear, beginner-friendly steps."""

from __future__ import annotations

import json
import logging
from uuid import UUID
from decimal import Decimal, InvalidOperation

from django.db.models import F, Q
from django.db.utils import OperationalError, ProgrammingError
from django.http import JsonResponse
from django.utils import timezone as dj_timezone
from django.views.decorators.http import require_http_methods

from .views_common import (
    _actor_from_request,
    _has_permission,
    _client_meta,
    _require_admin_or_manager,
    rate_limit,
)
from .views_orders import (
    _create_order_from_payload,
    _safe_order,
    _start_auto_flow,
    canonical_status,
)
from .models import PaymentTransaction, PaymentMethodConfig, Order, AppUser


logger = logging.getLogger(__name__)

LOYALTY_EARN_PER_PURCHASE = Decimal("0.01")
MONEY_PLACES = Decimal("0.01")


def _to_amount(value) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_PLACES)


def _derive_catering_order_number(order_id: str) -> str:
    try:
        uid = UUID(str(order_id))
    except Exception:
        return ""
    number = uid.int % 900_000
    number += 100_000
    return f"C-{number:06d}"


def _order_numbers_for(payments) -> dict:
    ids = {str(p.order_id) for p in payments if getattr(p, "order_id", None)}
    if not ids:
        return {}
    try:
        return {
            str(o.id): o.order_number or ""
            for o in Order.objects.filter(id__in=ids)
        }
    except Exception:
        return {}


def _serialize_payment(p, order=None, order_numbers=None):
    order_id = str(p.order_id)
    order_number = ""
    if order is not None:
        order_number = getattr(order, "order_number", "") or ""
    elif order_numbers:
        order_number = order_numbers.get(order_id, "") or ""
    if not order_number:
        meta = getattr(p, "meta", {}) or {}
        order_number = (
            meta.get("order_number")
            or meta.get("orderNumber")
            or _derive_catering_order_number(order_id)
        )
    meta = getattr(p, "meta", {}) or {}
    return {
        "id": str(p.id),
        "orderId": order_id,
        "orderNumber": order_number,
        "amount": float(p.amount),
        "method": p.method,
        "status": p.status,
        "reference": p.reference or "",
        "customer": p.customer or "",
        "tenderedAmount": meta.get("tenderedAmount"),
        "changeDue": meta.get("changeDue"),
        "processedBy": (p.processed_by.email if getattr(p, "processed_by", None) else ""),
        "date": (p.created_at or dj_timezone.now()).isoformat(),
    }


def _parse_payment_payload(request):
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}
    if "amount" not in data:
        return None, JsonResponse({"success": False, "message": "Amount is required"}, status=400)
    try:
        amount = _to_amount(data.get("amount"))
    except (InvalidOperation, TypeError, ValueError):
        return None, JsonResponse({"success": False, "message": "Invalid amount"}, status=400)

    method = str(data.get("method") or "cash").lower().strip()
    allowed_methods = {choice[0] for choice in PaymentTransaction.METHOD_CHOICES}
    if method not in allowed_methods:
        return None, JsonResponse({"success": False, "message": "Unsupported payment method"}, status=400)

    tendered_raw = data.get("tenderedAmount") or data.get("tendered_amount")
    tendered_amount = amount
    if tendered_raw is not None:
        try:
            tendered_amount = _to_amount(tendered_raw)
        except (InvalidOperation, TypeError, ValueError):
            return None, JsonResponse({"success": False, "message": "Invalid tendered amount"}, status=400)

    change_due = max(tendered_amount - amount, Decimal("0.00")).quantize(MONEY_PLACES)
    payload = {
        "amount": amount,
        "method": method,
        "customer": (data.get("customer") or "").strip(),
        "reference": (data.get("reference") or data.get("txn_ref") or "").strip(),
        "tendered_amount": tendered_amount,
        "change_due": change_due,
        "idempotency_key": (request.META.get("HTTP_IDEMPOTENCY_KEY") or "").strip(),
    }
    return payload, None


def _parse_payment_payload_dict(data, request):
    if not isinstance(data, dict):
        data = {}
    if "amount" not in data:
        return None, JsonResponse({"success": False, "message": "Amount is required"}, status=400)
    try:
        amount = _to_amount(data.get("amount"))
    except (InvalidOperation, TypeError, ValueError):
        return None, JsonResponse({"success": False, "message": "Invalid amount"}, status=400)

    method = str(data.get("method") or "cash").lower().strip()
    allowed_methods = {choice[0] for choice in PaymentTransaction.METHOD_CHOICES}
    if method not in allowed_methods:
        return None, JsonResponse({"success": False, "message": "Unsupported payment method"}, status=400)

    tendered_raw = data.get("tenderedAmount") or data.get("tendered_amount")
    tendered_amount = amount
    if tendered_raw is not None:
        try:
            tendered_amount = _to_amount(tendered_raw)
        except (InvalidOperation, TypeError, ValueError):
            return None, JsonResponse({"success": False, "message": "Invalid tendered amount"}, status=400)

    change_due = max(tendered_amount - amount, Decimal("0.00")).quantize(MONEY_PLACES)
    payload = {
        "amount": amount,
        "method": method,
        "customer": (data.get("customer") or "").strip(),
        "reference": (data.get("reference") or data.get("txn_ref") or "").strip(),
        "tendered_amount": tendered_amount,
        "change_due": change_due,
        "idempotency_key": (
            request.META.get("HTTP_IDEMPOTENCY_KEY")
            or data.get("idempotencyKey")
            or ""
        ).strip(),
    }
    return payload, None


def _method_enabled(method: str) -> bool:
    try:
        cfg = PaymentMethodConfig.objects.first()
    except Exception:
        return True
    if not cfg:
        return True
    allowed = {
        "cash": bool(getattr(cfg, "cash_enabled", True)),
        "card": bool(getattr(cfg, "card_enabled", True)),
        "mobile": bool(getattr(cfg, "mobile_enabled", True)),
    }
    return allowed.get(method, True)


def _existing_payment(order_id: str, payload) -> PaymentTransaction | None:
    if not payload.get("idempotency_key"):
        return None
    try:
        return PaymentTransaction.objects.filter(
            order_id=str(order_id),
            meta__idempotencyKey=payload["idempotency_key"],
        ).first()
    except Exception:
        return None


def _payment_meta(payload) -> dict:
    meta = {
        "source": "pos",
        "tenderedAmount": float(payload.get("tendered_amount", 0)),
        "changeDue": float(payload.get("change_due", 0)),
    }
    if payload.get("idempotency_key"):
        meta["idempotencyKey"] = payload["idempotency_key"]
    return meta


def _update_order_after_payment(order, method: str):
    order.payment_method = method
    update_fields = ["payment_method", "updated_at"]
    if canonical_status(order.status) in {"new", "pending"}:
        order.status = Order.STATUS_ACCEPTED
        update_fields.append("status")
    try:
        auto_fields = _start_auto_flow(order)
    except Exception:
        auto_fields = []
    for field in auto_fields:
        if field not in update_fields:
            update_fields.append(field)
    try:
        order.save(update_fields=update_fields)
    except Exception:
        order.save()


def _reward_loyalty_points(user_id):
    if not user_id:
        return
    try:
        AppUser.objects.filter(id=user_id).update(
            credit_points=F("credit_points") + LOYALTY_EARN_PER_PURCHASE
        )
    except Exception:
        logger.exception("Failed to award credit points for purchase")


def _audit_payment(request, actor, payment):
    try:
        from .utils_audit import record_audit

        ua, ip = _client_meta(request)
        record_audit(
            request,
            user=actor if hasattr(actor, "id") else None,
            type="action",
            action="Payment processed",
            details=f"order={payment.order_id} amount={payment.amount} method={payment.method}",
            severity="info",
            meta={
                "orderId": str(payment.order_id),
                "amount": float(payment.amount),
                "method": payment.method,
                "paymentId": str(payment.id),
                "userAgent": ua,
                "ip": ip,
            },
        )
    except Exception:
        pass


@require_http_methods(["POST"])  # /orders/checkout
@rate_limit(limit=20, window_seconds=60)
def order_checkout(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "order.place") or not _has_permission(
        actor, "payment.process"
    ):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        payload = {}

    idempotency_key = (
        request.META.get("HTTP_IDEMPOTENCY_KEY")
        or payload.get("idempotencyKey")
        or ""
    ).strip()

    order = None
    order_payload = None
    if idempotency_key:
        try:
            order = (
                Order.objects.filter(meta__posIdempotencyKey=idempotency_key)
                .select_related("placed_by")
                .first()
            )
            if order:
                order_payload = _safe_order(order, with_items=False)
        except Exception:
            order = None

    if not order:
        order, order_payload, error = _create_order_from_payload(
            payload, actor, with_items=False
        )
        if error:
            return error
        if idempotency_key:
            try:
                meta = order.meta or {}
                meta["posIdempotencyKey"] = idempotency_key
                order.meta = meta
                order.save(update_fields=["meta", "updated_at"])
            except Exception:
                logger.exception("Failed to store POS idempotency key")

    payment_seed = payload.get("payment") or {}
    raw_payment = {
        "amount": payment_seed.get("amount")
        or payload.get("amount")
        or payload.get("total")
        or float(order.total_amount or 0),
        "method": payment_seed.get("method") or payload.get("paymentMethod") or "cash",
        "tenderedAmount": payment_seed.get("tenderedAmount")
        or payload.get("tenderedAmount")
        or payment_seed.get("tendered_amount")
        or payload.get("tendered_amount"),
        "customer": payment_seed.get("customer") or payload.get("customer") or "",
        "reference": payment_seed.get("reference") or payload.get("reference") or "",
        "idempotencyKey": payment_seed.get("idempotencyKey")
        or payload.get("idempotencyKey")
        or idempotency_key,
    }

    payment_payload, parse_err = _parse_payment_payload_dict(raw_payment, request)
    if parse_err:
        return parse_err
    payment_payload["method"] = PaymentTransaction.METHOD_CASH
    if not _method_enabled(payment_payload["method"]):
        return JsonResponse(
            {
                "success": False,
                "message": f"Payment method '{payment_payload['method']}' is disabled",
            },
            status=400,
        )

    if order.total_amount and abs(order.total_amount - payment_payload["amount"]) > Decimal("0.01"):
        payment_payload["amount"] = Decimal(order.total_amount).quantize(MONEY_PLACES)

    existing = _existing_payment(str(order.id), payment_payload)
    if existing:
        order_payload = _safe_order(order, with_items=False)
        order_payload["payment"] = _serialize_payment(existing, order)
        return JsonResponse({"success": True, "data": order_payload})

    already_paid = (
        PaymentTransaction.objects.filter(
            order_id=str(order.id), status=PaymentTransaction.STATUS_COMPLETED
        )
        .order_by("-created_at")
        .first()
    )
    if already_paid and not payment_payload.get("idempotency_key"):
        order_payload = _safe_order(order, with_items=False)
        order_payload["payment"] = _serialize_payment(already_paid, order)
        return JsonResponse({"success": True, "data": order_payload})

    payment = PaymentTransaction.objects.create(
        order_id=str(order.id),
        amount=payment_payload["amount"],
        method=payment_payload["method"],
        status=PaymentTransaction.STATUS_COMPLETED,
        reference=payment_payload["reference"],
        customer=payment_payload["customer"],
        processed_by=actor if hasattr(actor, "id") else None,
        meta=_payment_meta(payment_payload),
    )

    _update_order_after_payment(order, payment_payload["method"])
    _reward_loyalty_points(order.placed_by_id or getattr(actor, "id", None))
    _audit_payment(request, actor, payment)

    order_payload = _safe_order(order, with_items=False)
    order_payload["payment"] = _serialize_payment(payment, order)
    return JsonResponse({"success": True, "data": order_payload})


@require_http_methods(["POST"])  # /orders/<order_id>/payment
@rate_limit(limit=20, window_seconds=60)
def order_payment(request, order_id: str):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "payment.process"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    payload, parse_err = _parse_payment_payload(request)
    if parse_err:
        return parse_err
    # POS-only: enforce cash to keep the flow fast and predictable
    payload["method"] = PaymentTransaction.METHOD_CASH
    if not _method_enabled(payload["method"]):
        return JsonResponse({"success": False, "message": f"Payment method '{payload['method']}' is disabled"}, status=400)

    order = Order.objects.filter(id=order_id).select_related("placed_by").first()
    if not order:
        return JsonResponse({"success": False, "message": "Order not found"}, status=404)

    if order.total_amount and abs(order.total_amount - payload["amount"]) > Decimal("0.01"):
        payload["amount"] = Decimal(order.total_amount).quantize(MONEY_PLACES)

    existing = _existing_payment(order_id, payload)
    if existing:
        return JsonResponse({"success": True, "data": _serialize_payment(existing, order)})

    already_paid = (
        PaymentTransaction.objects.filter(
            order_id=str(order_id), status=PaymentTransaction.STATUS_COMPLETED
        )
        .order_by("-created_at")
        .first()
    )
    if already_paid and not payload.get("idempotency_key"):
        return JsonResponse({"success": True, "data": _serialize_payment(already_paid, order)})

    pending_payment = (
        PaymentTransaction.objects.filter(
            order_id=str(order_id), status=PaymentTransaction.STATUS_PENDING
        )
        .order_by("-created_at")
        .first()
    )
    if pending_payment:
        pending_payment.status = PaymentTransaction.STATUS_COMPLETED
        pending_payment.amount = payload["amount"]
        pending_payment.reference = payload["reference"] or pending_payment.reference
        pending_payment.customer = payload["customer"] or pending_payment.customer
        pending_payment.processed_by = actor if hasattr(actor, "id") else None
        meta = pending_payment.meta or {}
        meta.update(_payment_meta(payload))
        pending_payment.meta = meta
        pending_payment.save(
            update_fields=[
                "status",
                "amount",
                "reference",
                "customer",
                "processed_by",
                "meta",
                "updated_at",
            ]
        )

        _update_order_after_payment(order, payload["method"])
        _reward_loyalty_points(order.placed_by_id or getattr(actor, "id", None))
        _audit_payment(request, actor, pending_payment)

        return JsonResponse(
            {"success": True, "data": _serialize_payment(pending_payment, order)}
        )

    payment = PaymentTransaction.objects.create(
        order_id=str(order_id),
        amount=payload["amount"],
        method=payload["method"],
        status=PaymentTransaction.STATUS_COMPLETED,
        reference=payload["reference"],
        customer=payload["customer"],
        processed_by=actor if hasattr(actor, "id") else None,
        meta=_payment_meta(payload),
    )

    _update_order_after_payment(order, payload["method"])
    _reward_loyalty_points(order.placed_by_id or getattr(actor, "id", None))
    _audit_payment(request, actor, payment)

    return JsonResponse({"success": True, "data": _serialize_payment(payment, order)})


@require_http_methods(["GET"])  # /payments
def payments_list(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "payment.records.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    search = (request.GET.get("search") or "").strip().lower()
    status = (request.GET.get("status") or "").strip().lower()
    method = (request.GET.get("method") or "").strip().lower()
    date_range = (request.GET.get("timeRange") or request.GET.get("dateRange") or "").strip().lower()
    try:
        page = max(1, int(request.GET.get("page") or 1))
    except Exception:
        page = 1
    try:
        limit = max(1, min(200, int(request.GET.get("limit") or 50)))
    except Exception:
        limit = 50

    try:
        qs = PaymentTransaction.objects.all()
        if status:
            qs = qs.filter(status=status)
        if method:
            qs = qs.filter(method=method)
        if search:
            order_ids_from_number = list(
                Order.objects.filter(order_number__icontains=search).values_list("id", flat=True)
            )
            id_values = [str(x) for x in order_ids_from_number if x]
            query = (
                Q(order_id__icontains=search)
                | Q(customer__icontains=search)
                | Q(reference__icontains=search)
            )
            if id_values:
                query |= Q(order_id__in=id_values)
            qs = qs.filter(query)
        if date_range in {"24h", "7d", "30d"}:
            from datetime import timedelta

            start = dj_timezone.now() - (
                timedelta(hours=24)
                if date_range == "24h"
                else timedelta(days=7)
                if date_range == "7d"
                else timedelta(days=30)
            )
            qs = qs.filter(created_at__gte=start)
        qs = qs.order_by("-created_at")
        total = qs.count()
        start_i = (page - 1) * limit
        end_i = start_i + limit
        slice_items = list(qs[start_i:end_i])
        order_numbers = _order_numbers_for(slice_items)
        items = [_serialize_payment(x, order_numbers=order_numbers) for x in slice_items]
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
        return JsonResponse(
            {
                "success": True,
                "data": [],
                "pagination": {"page": 1, "limit": 0, "total": 0, "totalPages": 1},
            }
        )


@require_http_methods(["POST"])  # /payments/<uuid:pid>/refund
def payment_refund(request, pid: str):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "payment.refund"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        p = PaymentTransaction.objects.filter(id=pid).first()
        if not p:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        if p.status == PaymentTransaction.STATUS_REFUNDED:
            return JsonResponse({"success": True, "data": _serialize_payment(p)})
        p.status = PaymentTransaction.STATUS_REFUNDED
        p.refunded_at = dj_timezone.now()
        p.refunded_by = getattr(actor, "email", "") or ""
        p.save(update_fields=["status", "refunded_at", "refunded_by", "updated_at"])
        try:
            from .utils_audit import record_audit

            record_audit(
                request,
                user=actor if hasattr(actor, "id") else None,
                type="action",
                action="Payment refunded",
                details=f"paymentId={pid} order={p.order_id}",
                severity="warning",
                meta={"paymentId": str(p.id), "orderId": p.order_id},
            )
        except Exception:
            pass
        return JsonResponse({"success": True, "data": _serialize_payment(p)})
    except Exception:
        return JsonResponse({"success": False, "message": "Refund failed"}, status=500)


__all__ = [
    "order_checkout",
    "order_payment",
    "payments_list",
    "payment_refund",
    "payments_config",
    "payment_invoice",
]


@require_http_methods(["GET", "PUT"])  # /payments/config
def payments_config(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        cfg, _ = PaymentMethodConfig.objects.get_or_create(id=1)
        if request.method == "GET":
            return JsonResponse(
                {
                    "success": True,
                    "data": {
                        "cash": bool(cfg.cash_enabled),
                        "card": bool(cfg.card_enabled),
                        "mobile": bool(cfg.mobile_enabled),
                    },
                }
            )
        if not _require_admin_or_manager(actor):
            return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except Exception:
            data = {}

        def _getb(v, curr):
            if isinstance(v, bool):
                return v
            if isinstance(v, (int, str)):
                s = str(v).lower()
                if s in {"1", "true", "yes", "on"}:
                    return True
                if s in {"0", "false", "no", "off"}:
                    return False
            return curr

        cfg.cash_enabled = _getb(data.get("cash"), cfg.cash_enabled)
        cfg.card_enabled = _getb(data.get("card"), cfg.card_enabled)
        cfg.mobile_enabled = _getb(data.get("mobile"), cfg.mobile_enabled)
        cfg.updated_by = getattr(actor, "email", "") or ""
        cfg.save()
        return JsonResponse({"success": True})
    except (OperationalError, ProgrammingError):
        pass
    if request.method == "GET":
        return JsonResponse({"success": True, "data": {"cash": True, "card": True, "mobile": True}})
    return JsonResponse({"success": True})


@require_http_methods(["GET"])  # /payments/<uuid:pid>/invoice
def payment_invoice(request, pid: str):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    try:
        p = PaymentTransaction.objects.filter(id=pid).first()
        if not p:
            return JsonResponse({"success": False, "message": "Not found"}, status=404)
        try:
            import io
            from reportlab.pdfgen import canvas  # type: ignore
            from reportlab.lib.pagesizes import letter  # type: ignore

            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=letter)
            width, height = letter
            y = height - 72
            c.setFont("Helvetica-Bold", 16)
            c.drawString(72, y, "Payment Invoice")
            y -= 24
            c.setFont("Helvetica", 10)
            fields = [
                ("Invoice ID", str(p.id)),
                ("Order ID", p.order_id),
                ("Date", (p.created_at or dj_timezone.now()).strftime("%Y-%m-%d %H:%M:%S")),
                ("Amount", f"₱{float(p.amount):.2f}"),
                ("Method", p.method.title()),
                ("Status", p.status),
                ("Reference", p.reference or ""),
                ("Customer", p.customer or ""),
                ("Processed By", (p.processed_by.email if getattr(p, "processed_by", None) else "")),
            ]
            for label, val in fields:
                y -= 16
                c.drawString(72, y, f"{label}: {val}")
            c.showPage()
            c.save()
            pdf = buf.getvalue()
            from django.http import HttpResponse

            resp = HttpResponse(pdf, content_type="application/pdf")
            resp["Content-Disposition"] = f'inline; filename="invoice-{p.id}.pdf"'
            return resp
        except Exception:
            return JsonResponse({"success": False, "message": "Invoice generation not available"}, status=501)
    except Exception:
        return JsonResponse({"success": False, "message": "Failed"}, status=500)
