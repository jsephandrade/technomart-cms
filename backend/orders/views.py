from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal, ROUND_DOWN
from .utils import map_order_status  # if you put it in utils.py

from rest_framework import status
from api.models import Order, OrderItem
from .serializers import CreditPointsSerializer  
from rest_framework import serializers
from decimal import Decimal

from django.http import JsonResponse
from django.db import transaction
from django.utils.dateparse import parse_datetime
from api.models import Order, OrderItem, MenuItem, PaymentTransaction, CheckoutSession
from .serializers import OrderSerializer
from notifications.models import Notification
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone as dj_tz
import uuid
from menu.models import MenuItem  # adjust import to your menu app
from django.views.decorators.http import require_POST

PAYMENT_CASH_ALIASES = {
    "cash",
    "counter",
    "pay_at_counter",
    "pay-at-counter",
    "pay at counter",
    "cod",
}
LOYALTY_META_KEY = "loyaltyAwarded"


def _normalize_payment_method(value):
    return str(value or "").strip().lower()


def _is_cash_method(value):
    return _normalize_payment_method(value) in PAYMENT_CASH_ALIASES


def _is_guest_user(user):
    if not user:
        return False
    email = str(getattr(user, "email", "") or "").strip().lower()
    if email.endswith("@guest.local"):
        return True
    username = str(getattr(user, "username", "") or "").strip().lower()
    return username == "guest_user"


def _get_display_name(user, order=None):
    if user:
        get_full_name = getattr(user, "get_full_name", None)
        if callable(get_full_name):
            try:
                full_name = get_full_name()
                if full_name:
                    return full_name
            except Exception:
                pass
        for attr in ("name", "username", "email"):
            value = getattr(user, attr, "")
            if value:
                return str(value)
    if order and getattr(order, "customer_name", ""):
        return str(order.customer_name)
    return ""


CHECKOUT_EXPIRY_MINUTES = 30


def _parse_uuid(value):
    try:
        return uuid.UUID(str(value))
    except Exception:
        return None


def _parse_promised_time(value):
    if not value:
        return None
    parsed = parse_datetime(str(value))
    return parsed


def _coerce_decimal(value, default=Decimal("0.00")):
    try:
        return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    except Exception:
        return default


def _get_checkout_session(identifier):
    if not identifier:
        return None
    uid = _parse_uuid(identifier)
    if uid:
        session = CheckoutSession.objects.filter(id=uid).first()
        if session:
            return session
    return (
        CheckoutSession.objects.filter(order_number__iexact=str(identifier))
        .order_by("-created_at")
        .first()
    )


def _resolve_order_or_checkout(identifier):
    order = Order.objects.filter(order_number=identifier).first()
    if order:
        return order, None
    return None, _get_checkout_session(identifier)


def _is_order_fully_paid(order):
    if not order:
        return False
    method = _normalize_payment_method(getattr(order, "payment_method", ""))
    if not method:
        return False
    if _is_cash_method(method):
        order_ids = [str(order.id)]
        if getattr(order, "order_number", ""):
            order_ids.append(str(order.order_number))
        return PaymentTransaction.objects.filter(
            order_id__in=order_ids, status=PaymentTransaction.STATUS_COMPLETED
        ).exists()
    return True


def _ensure_pending_cash_payment(order, *, customer_name=""):
    order_ids = [str(order.id)]
    if order.order_number:
        order_ids.append(str(order.order_number))
    existing = (
        PaymentTransaction.objects.filter(order_id__in=order_ids)
        .exclude(status=PaymentTransaction.STATUS_REFUNDED)
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing

    meta = {"source": "online", "orderNumber": order.order_number}
    return PaymentTransaction.objects.create(
        order_id=str(order.id),
        amount=order.total_amount or Decimal("0.00"),
        method=PaymentTransaction.METHOD_CASH,
        status=PaymentTransaction.STATUS_PENDING,
        customer=customer_name or order.customer_name or "",
        meta=meta,
    )


def _credits_for_amount(total_amount):
    dec_amount = _coerce_decimal(total_amount)
    if dec_amount < Decimal("100"):
        return Decimal("0.00")
    credits = (dec_amount / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    return credits


def _maybe_award_loyalty_points(order):
    if not order:
        return Decimal("0.00")
    status_value = str(getattr(order, "status", "")).strip().lower()
    if status_value != "completed":
        return Decimal("0.00")
    if not _is_order_fully_paid(order):
        return Decimal("0.00")
    user = getattr(order, "placed_by", None)
    if not user:
        return Decimal("0.00")
    if _is_guest_user(user):
        return Decimal("0.00")
    meta = order.meta or {}
    if meta.get(LOYALTY_META_KEY):
        return Decimal("0.00")
    earned_points = _credits_for_amount(order.total_amount)
    if earned_points <= 0:
        meta[LOYALTY_META_KEY] = True
        order.meta = meta
        order.save(update_fields=["meta", "updated_at"])
        return Decimal("0.00")
    if not hasattr(user, "credit_points"):
        user.credit_points = Decimal("0.0")
    user.credit_points += earned_points
    user.save()
    meta[LOYALTY_META_KEY] = True
    order.meta = meta
    order.save(update_fields=["meta", "updated_at"])
    return earned_points
from django.utils.crypto import get_random_string

ORDER_NUMBER_RANDOM_CHARS = "0123456789"


def generate_unique_order_number(prefix="O", order_model=None, max_attempts=64):
    prefix_clean = (prefix or "O").strip()[:1].upper() or "O"
    if order_model is None:
        order_model = Order

    attempt = 0
    while attempt < max_attempts:
        random_component = get_random_string(
            length=6, allowed_chars=ORDER_NUMBER_RANDOM_CHARS
        )
        candidate = f"{prefix_clean}-{random_component}"
        exists_in_sessions = False
        try:
            exists_in_sessions = CheckoutSession.objects.filter(
                order_number__iexact=candidate
            ).exists()
        except Exception:
            exists_in_sessions = False
        if (
            not order_model.objects.filter(order_number__iexact=candidate).exists()
            and not exists_in_sessions
        ):
            return candidate
        attempt += 1

    raise RuntimeError("Unable to generate unique order number")

# ------------------------------
# ✅ CREATE ORDER
# ------------------------------
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.utils import timezone
import uuid
from api.models import Order, OrderItem, MenuItem
# Serializer for credit points
class CreditPointsSerializer(serializers.Serializer):
    credit_points = serializers.DecimalField(max_digits=10, decimal_places=2)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def order_status(request, order_number):
    try:
        order = Order.objects.get(order_number=order_number, customer_name=request.user.name)
        items = [
            {
                "name": item.item_name,
                "quantity": item.quantity,
                "price": float(item.price),
            } for item in order.items.all()
        ]

        return JsonResponse({
            "success": True,
            "status": map_order_status(order.status),
            "items": items
        })

    except Order.DoesNotExist:
        return JsonResponse(
            {"success": False, "message": "Order not found or not yours"},
            status=404
        )


# api/views.py
from django.contrib.auth.decorators import login_required

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import traceback
@require_POST
def cancel_order(request, order_number):
    # Fetch order without checking user
    order = get_object_or_404(Order, order_number=order_number)
    order.status = 'cancelled'
    order.save()
    return JsonResponse({'message': f'Order {order_number} cancelled successfully.'})
@api_view(['GET'])
@permission_classes([AllowAny])
def get_order(request, order_number):
    try:
        order = Order.objects.get(order_number=order_number)
        items = [
            {
                "name": oi.item_name,
                "price": float(oi.price),
                "quantity": oi.quantity,
            } 
            for oi in order.orderitem_set.all()
        ]

        return Response({
            "success": True,
            "order_number": order.order_number,
            "order_type": order.order_type,
            "total_amount": float(order.total_amount),
            "promised_time": order.promised_time,
            "status": order.status,
            "items": items
        })
    except Order.DoesNotExist:
        return Response({"success": False, "message": "Order not found"}, status=404)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_order(request):
    user = request.user
    data = request.data

    try:
        idempotency_key = (
            request.headers.get("Idempotency-Key") or data.get("idempotency_key")
        )
        if idempotency_key:
            existing = (
                CheckoutSession.objects.filter(
                    user=user, idempotency_key=str(idempotency_key).strip()
                )
                .order_by("-created_at")
                .first()
            )
            if existing and existing.status != CheckoutSession.STATUS_EXPIRED:
                return Response(
                    {
                        "success": True,
                        "checkout_id": str(existing.id),
                        "order_number": existing.order_number,
                        "total": float(existing.total_amount or 0),
                        "credit_points_used": float(existing.credit_points_used or 0),
                    }
                )

        # 1?,???? Parse credit points requested
        requested_points = _coerce_decimal(data.get("credit_points_used", 0))

        # 2?,???? Compute available points
        available_points = get_available_points(user)

        # 4?,???? Clamp requested points to available points and order total
        order_total = _coerce_decimal(data.get("total_amount", 0))
        requested_points = min(requested_points, available_points, order_total)

        # 5?,???? Check if requested points exceed available points
        if requested_points > available_points:
            return Response(
                {'success': False, 'message': 'Insufficient backend points'},
                status=400
            )

        # 6?,???? Reserve order number for checkout
        order_number = generate_unique_order_number(prefix="O", order_model=Order)
        promised_time = _parse_promised_time(data.get("promised_time"))
        payload = data if isinstance(data, dict) else dict(data)

        session = CheckoutSession.objects.create(
            user=user,
            order_number=order_number,
            status=CheckoutSession.STATUS_PENDING,
            subtotal=_coerce_decimal(data.get("subtotal", order_total)),
            discount=_coerce_decimal(data.get("discount", 0)),
            total_amount=order_total,
            credit_points_used=requested_points,
            order_type=data.get("order_type", "pickup"),
            customer_name=data.get("customer_name", ""),
            promised_time=promised_time,
            payload=payload,
            idempotency_key=str(idempotency_key).strip() if idempotency_key else "",
            expires_at=dj_tz.now() + timedelta(minutes=CHECKOUT_EXPIRY_MINUTES),
        )

        return Response(
            {
                "success": True,
                "checkout_id": str(session.id),
                "order_number": session.order_number,
                "total": float(order_total),
                "credit_points_used": float(requested_points),
            }
        )

    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_orders(request):
    user = request.user
    customer_name = _get_display_name(user)  # fallback

    orders = Order.objects.filter(customer_name=customer_name)

    if not orders.exists():
        return Response({"orders": []}, status=200)

    serializer = OrderSerializer(orders, many=True)
    return Response({"orders": serializer.data}, status=200)

# ------------------------------
# ✅ USER CREDIT POINTS
# ------------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_credit_points(request):
    user = request.user
    available_points = get_available_points(user)
    serializer = CreditPointsSerializer({'credit_points': available_points})
    return Response(serializer.data)
@api_view(['GET'])
@permission_classes([AllowAny])
def gcash_link(request, order_number):
    order, session = _resolve_order_or_checkout(order_number)
    if not order and not session:
        return JsonResponse({"success": False, "message": "Order not found"}, status=404)
    amount = order.total_amount if order else session.total_amount
    ref = order.order_number if order else (session.order_number or str(session.id))
    gcash_url = f"https://pay.gcash.com/pay?amount={amount}&note=Order{ref}"
    return JsonResponse({"success": True, "gcash_url": gcash_url})

# ------------------------------
# ✅ CONFIRM PAYMENT
# ------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_payment(request, order_number):
    data = request.data
    method = data.get("method", None)
    if not method:
        return Response(
            {"success": False, "message": "Payment method is required"},
            status=400,
        )

    order = Order.objects.filter(order_number=order_number).first()
    if order:
        order.payment_method = method
        order.status = "pending"
        order.save(update_fields=["payment_method", "status"])

        if _is_cash_method(method):
            _ensure_pending_cash_payment(
                order,
                customer_name=_get_display_name(request.user, order),
            )

        earned_points = _maybe_award_loyalty_points(order)

        return Response(
            {
                "success": True,
                "message": "Payment confirmed",
                "status": map_order_status(order.status),
                "order_number": order.order_number,
                "order_id": str(order.id),
                "earned_points": float(earned_points),
            }
        )

    session = _get_checkout_session(order_number)
    if not session:
        return Response({"success": False, "message": "Order not found"}, status=404)

    if session.expires_at and session.expires_at < dj_tz.now():
        session.status = CheckoutSession.STATUS_EXPIRED
        session.save(update_fields=["status", "updated_at"])
        return Response(
            {"success": False, "message": "Checkout session expired"},
            status=400,
        )

    if session.order_id:
        existing = Order.objects.filter(id=session.order_id).first() or Order.objects.filter(
            order_number=session.order_number
        ).first()
        if existing:
            return Response(
                {
                    "success": True,
                    "message": "Payment confirmed",
                    "status": map_order_status(existing.status),
                    "order_number": existing.order_number,
                    "order_id": str(existing.id),
                }
            )

    payload = session.payload or {}
    items = payload.get("items", [])
    order_total = session.total_amount or _coerce_decimal(payload.get("total_amount", 0))
    subtotal = session.subtotal or _coerce_decimal(payload.get("subtotal", order_total))
    discount = session.discount or _coerce_decimal(payload.get("discount", 0))
    credit_points_used = session.credit_points_used or _coerce_decimal(
        payload.get("credit_points_used", 0)
    )
    promised_time = session.promised_time or _parse_promised_time(
        payload.get("promised_time")
    )
    order_number_value = session.order_number or generate_unique_order_number(
        prefix="O", order_model=Order
    )
    customer_name = session.customer_name or payload.get("customer_name") or _get_display_name(
        session.user
    )
    order_type = session.order_type or payload.get("order_type", "pickup")
    channel = payload.get("channel") or "online"

    with transaction.atomic():
        order = Order.objects.create(
            order_number=order_number_value,
            placed_by=session.user,
            total_amount=order_total,
            credit_points_used=credit_points_used,
            status="pending",
            customer_name=customer_name,
            promised_time=promised_time,
            order_type=order_type,
            subtotal=subtotal,
            discount=discount,
            channel=channel,
        )

        for item in items:
            OrderItem.objects.create(
                order=order,
                item_name=item.get("name") or item.get("item_name") or "Item",
                price=_coerce_decimal(item.get("price", 0)),
                quantity=int(item.get("quantity") or 1),
                menu_item_id=item.get("menu_item_id") or item.get("menuItemId"),
                size=item.get("size"),
                customize=item.get("customize"),
            )

        order.payment_method = method
        order.save(update_fields=["payment_method"])

        if _is_cash_method(method):
            _ensure_pending_cash_payment(
                order,
                customer_name=_get_display_name(session.user, order),
            )

        session.order_id = order.id
        session.order_number = order.order_number
        session.status = (
            CheckoutSession.STATUS_AWAITING_CASH
            if _is_cash_method(method)
            else CheckoutSession.STATUS_FINALIZED
        )
        session.save(update_fields=["order_id", "order_number", "status", "updated_at"])

    earned_points = _maybe_award_loyalty_points(order)

    return Response(
        {
            "success": True,
            "message": "Payment confirmed",
            "status": map_order_status(order.status),
            "order_number": order.order_number,
            "order_id": str(order.id),
            "earned_points": float(earned_points),
        }
    )
@api_view(['GET'])
@permission_classes([AllowAny])
def fetch_gcash_qr(request, order_number):
    order, session = _resolve_order_or_checkout(order_number)
    if not order and not session:
        return Response(
            {
                "success": False,
                "message": "Order not found",
            },
            status=404,
        )
    amount = order.total_amount if order else session.total_amount
    ref = order.order_number if order else (session.order_number or str(session.id))
    qr_url = f"https://pay.gcash.com/pay?amount={amount}&note=Order{ref}"

    return Response(
        {
            "success": True,
            "qr_url": qr_url,
            "total_amount": float(amount),
        }
    )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_orders(request):
    orders = Order.objects.filter(placed_by=request.user).order_by('-created_at')
    orders_data = []

    for order in orders:
        items = [
            {
                "name": item.item_name,
                "quantity": item.quantity,
                "price": float(item.price),
                "size": getattr(item, "size", None),
                "customize": getattr(item, "customize", None),
                "image": getattr(item, "image", None),
            } 
            for item in order.items.all()
        ]

        orders_data.append({
            "order_number": order.order_number,
            "status": order.status,
            "total_amount": float(order.total_amount),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "items": items,
        })

    return Response({"success": True, "orders": orders_data})
from menu.models import MenuItem  # make sure this is your menu_item model
from api.models import Offer, AppUser
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redeem_offer(request):
    user = request.user
    if _is_guest_user(user):
        return Response(
            {"success": False, "message": "Guest users cannot use credit points."},
            status=403,
        )
    offer_id = request.data.get('offer_id')
    points_to_use = Decimal(request.data.get('points_used', 0)).quantize(Decimal('0.01'), ROUND_DOWN)

    offer = get_object_or_404(Offer, id=offer_id)

    # ✅ Calculate available points dynamically
    available_points = get_available_points(user)
    if points_to_use > available_points:
        return Response({"success": False, "message": "Not enough credit points"}, status=400)

    # Generate order
    order_number = generate_unique_order_number(prefix="O", order_model=Order)
    order = Order.objects.create(
        order_number=order_number,
        placed_by=user,
        customer_name=_get_display_name(user),
        order_type=request.data.get('order_type', 'pickup'),
        promised_time=request.data.get('promised_time'),
        subtotal=Decimal('0.00'),
        discount=Decimal('0.00'),
        total_amount=Decimal('0.00'),
        credit_points_used=points_to_use,
        use_credit_points=True,
        credit_points_before=available_points,
        status='Pending',
    )

    subtotal = Decimal('0.00')
    item_names = []
    for menu_item in offer.menu_items.all():
        OrderItem.objects.create(
            order=order,
            item_name=menu_item.name,
            price=menu_item.price,
            quantity=1,
            menu_item=menu_item
        )
        subtotal += menu_item.price
        item_names.append(menu_item.name)

    # Update totals after deduction
    order.subtotal = subtotal
    order.total_amount = subtotal - points_to_use
    order.save(update_fields=['subtotal', 'total_amount'])

    return Response({
        "success": True,
        "message": f"Offer '{offer.name}' redeemed successfully!",
        "order_number": order.order_number,
        "items": item_names,
        "points_used": points_to_use,
        "points_before": available_points,
        "remaining_points": available_points - points_to_use
    }, status=201)
def get_available_points(user):
    if _is_guest_user(user):
        return Decimal("0.00")
    all_orders = Order.objects.filter(placed_by=user)
    completed_orders = [
        _credits_for_amount(order.total_amount)
        for order in all_orders
        if str(getattr(order, "status", "")).strip().lower() == "completed"
        and _is_order_fully_paid(order)
    ]
    earned_points = sum(completed_orders, Decimal("0.00"))
    used_points = sum(
        [
            Decimal(order.credit_points_used or 0).quantize(
                Decimal("0.01"), rounding=ROUND_DOWN
            )
            for order in all_orders
        ],
        Decimal("0.00"),
    )
    return max(earned_points - used_points, Decimal("0.00")).quantize(
        Decimal("0.01"), ROUND_DOWN
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def apply_voucher(request):
    try:
        user = request.user
        if _is_guest_user(user):
            return Response(
                {"success": False, "message": "Guest users cannot use credit points."},
                status=403,
            )
        voucher_points = int(request.data.get('points', 0))

        if voucher_points > user.credit_points:
            return Response({"success": False, "message": "Not enough points"}, status=400)

        # Deduct points
        user.credit_points -= voucher_points
        user.save()

        # Create a “free order” with total_amount = 0
        order_number = generate_unique_order_number(prefix="O", order_model=Order)

        order = Order.objects.create(
        order_number=order_number,
        placed_by=user,
        total_amount=0,
        credit_points_used=voucher_points,
        status='Pending',
        customer_name=_get_display_name(user),
        promised_time=request.data.get('promised_time', None),
        order_type=request.data.get('order_type', 'pickup')
    )

        # Optionally add order items
        for item in request.data.get('items', []):
            OrderItem.objects.create(
                order=order,
                item_name=item['name'],
                price=0,
                quantity=int(item.get('quantity', 1)),
                menu_item_id=item.get('menu_item_id'),
                size=item.get('size'),
                customize=item.get('customize')
            )

        return Response({
            "success": True,
            "message": "Voucher applied and order created",
            "order_number": order.order_number,
            "points_deducted": voucher_points
        })

    except Exception as e:
        return Response({"success": False, "message": str(e)}, status=500)
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redeem_offer(request):
    user = request.user
    if _is_guest_user(user):
        return Response(
            {"success": False, "message": "Guest users cannot use credit points."},
            status=403,
        )
    offer_id = request.data.get('offer_id')
    points_to_use = Decimal(request.data.get('points_used', 0)).quantize(Decimal('0.01'), ROUND_DOWN)

    # Get the offer
    offer = get_object_or_404(Offer, id=offer_id)

    # Calculate available points dynamically
    available_points = get_available_points(user)
    if points_to_use > available_points:
        return Response({"success": False, "message": "Not enough credit points"}, status=400)

    # Create unique order number
    order_number = generate_unique_order_number(prefix="O", order_model=Order)

    # Create the order
    order = Order.objects.create(
        order_number=order_number,
        placed_by=user,
        customer_name=getattr(user, "full_name", str(user)),   
        promised_time=request.data.get('promised_time'),
        subtotal=Decimal('0.00'),
        discount=Decimal('0.00'),
        total_amount=Decimal('0.00'),
        credit_points_used=points_to_use,
        use_credit_points=True,
        credit_points_before=available_points,
        status='Pending',
    )

    # Add menu items from the offer
    subtotal = Decimal('0.00')
    item_names = []
    for menu_item in offer.menu_items.all():
        OrderItem.objects.create(
            order=order,
            item_name=menu_item.name,
            price=menu_item.price,
            quantity=1,
            menu_item=menu_item
        )
        subtotal += menu_item.price
        item_names.append(menu_item.name)

    # Update totals after deduction
    order.subtotal = subtotal
    order.total_amount = max(subtotal - points_to_use, Decimal('0.00'))
    order.save(update_fields=['subtotal', 'total_amount'])

    remaining_points = available_points - points_to_use

    return Response({
        "success": True,
        "message": f"Offer '{offer.name}' redeemed successfully!",
        "order_number": order.order_number,
        "items": item_names,
        "points_before": available_points,
        "points_used": points_to_use,
        "remaining_points": remaining_points
    }, status=201)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_special_offers(request):
    # Example: pick items that are marked as special or just top 5 items
    offers = MenuItem.objects.filter(is_special=True)[:10]  # adjust your filter
    
    data = [{
        "id": item.id,
        "name": item.name,
        "required_points": item.points or 0,  # you can calculate points per item
        "image": item.image.url if item.image else None
    } for item in offers]
    
    return Response({"success": True, "offers": data})


@api_view(['GET'])
@permission_classes([AllowAny])
def list_special_offers(request):
    offers = Offer.objects.all()  # fetch all offers

    data = [{
        "id": offer.id,
        "name": offer.name,
        "required_points": offer.required_points
    } for offer in offers]

    return Response({"success": True, "offers": data})
