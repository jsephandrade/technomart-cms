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
from api.models import Order, OrderItem, MenuItem
from .serializers import OrderSerializer
from notifications.models import Notification
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone as dj_tz
import uuid
from menu.models import MenuItem  # adjust import to your menu app
from django.views.decorators.http import require_POST
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
        if not order_model.objects.filter(order_number__iexact=candidate).exists():
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
        # 1️⃣ Parse credit points requested
        requested_points = Decimal(data.get('credit_points_used', 0)).quantize(Decimal('0.01'), rounding=ROUND_DOWN)

        # 2️⃣ Fetch Paid orders to calculate earned points
        paid_orders = Order.objects.filter(placed_by=user, status='Paid')

        total_earned_points = sum(
            (order.total_amount * Decimal('0.01')).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
            for order in paid_orders
        )

        total_used_points = sum(
            (order.credit_points_used or Decimal('0.0')).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
            for order in paid_orders
        )

        # 3️⃣ Compute available points
        available_points = max(total_earned_points - total_used_points, Decimal('0.0'))

        # 4️⃣ Clamp requested points to available points and order total
        order_total = Decimal(data['total_amount']).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
        requested_points = min(requested_points, available_points, order_total)

        # 5️⃣ Check if requested points exceed available points
        if requested_points > available_points:
            return Response(
                {'success': False, 'message': 'Insufficient backend points'},
                status=400
            )

        # 6️⃣ Generate unique order number

        order_number = generate_unique_order_number(prefix="O", order_model=Order)

        # 7️⃣ Create the order
        order = Order.objects.create(
            order_number=order_number,
            placed_by=user,
            total_amount=order_total,
            credit_points_used=requested_points,
            status='Pending',
            customer_name=data['customer_name'],
            promised_time=data['promised_time'],
            order_type=data.get('order_type', 'pickup')
        )

        # 8️⃣ Create order items
        for item in data.get('items', []):
            OrderItem.objects.create(
                order=order,
                item_name=item['name'],
                price=Decimal(item['price']).quantize(Decimal('0.01'), rounding=ROUND_DOWN),
                quantity=int(item['quantity']),
                menu_item_id=item['menu_item_id'],
                size=item.get('size'),
                customize=item.get('customize')
            )

        return Response({'success': True, 'order_number': order.order_number})

    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=500)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_orders(request):
    user = request.user
    customer_name = user.get_full_name() or user.username  # fallback

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
    try:
        order = Order.objects.get(order_number=order_number)
        gcash_url = f"https://pay.gcash.com/pay?amount={order.total_amount}&note=Order{order.order_number}"
        return JsonResponse({"success": True, "gcash_url": gcash_url})
    except Order.DoesNotExist:
        return JsonResponse({"success": False, "message": "Order not found"}, status=404)

# ------------------------------
# ✅ CONFIRM PAYMENT
# ------------------------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_payment(request, order_number):
    try:
        data = request.data
        method = data.get('method', None)
        order = Order.objects.get(order_number=order_number)

        order.payment_method = method
        order.status = "pending"  # start at pending
        order.save()

        # Optionally, add credit points if needed
        user = order.placed_by
        earned_points = order.total_amount * Decimal('0.01')
        if not hasattr(user, 'credit_points'):
            user.credit_points = Decimal('0.0')
        user.credit_points += earned_points
        user.save()

        return Response({
            "success": True,
            "message": "Payment confirmed",
            "status": map_order_status(order.status),
            "earned_points": float(earned_points)
        })

    except Order.DoesNotExist:
        return Response({"success": False, "message": "Order not found"}, status=404)
@api_view(['GET'])
@permission_classes([AllowAny])
def fetch_gcash_qr(request, order_number):
    try:
        order = Order.objects.get(order_number=order_number)
        qr_url = f"https://pay.gcash.com/pay?amount={order.total_amount}&note=Order{order.order_number}"

        return Response({
            "success": True,
            "qr_url": qr_url,
            "total_amount": float(order.total_amount),
        })

    except Order.DoesNotExist:
        return Response({
            "success": False,
            "message": "Order not found"
        }, status=404)

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
            "items": items,
        })

    return Response({"success": True, "orders": orders_data})
from menu.models import MenuItem  # make sure this is your menu_item model
from api.models import Offer, AppUser
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redeem_offer(request):
    user = request.user
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
        customer_name=user.get_full_name() or user.username,
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
    all_orders = Order.objects.filter(placed_by=user)
    earned_points = sum(
        Decimal(order.total_amount) * Decimal('0.01')
        for order in all_orders
    )
    used_points = sum(
        Decimal(order.credit_points_used or 0)
        for order in all_orders
    )
    return max(earned_points - used_points, Decimal('0.00')).quantize(Decimal('0.01'), ROUND_DOWN)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def apply_voucher(request):
    try:
        user = request.user
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
            customer_name=user.get_full_name() or user.username,
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
