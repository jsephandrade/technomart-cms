"""Reports endpoints: sales, inventory, orders/transactions, staff attendance, customer purchase history.

Focuses on read-only aggregation using existing models. Keep responses simple and fast.
"""

from __future__ import annotations

from datetime import datetime, timedelta
import logging
from collections import defaultdict
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils import timezone as dj_tz
from django.db.models import Sum, Count, Q

from .views_common import _actor_from_request, _has_permission
from .inventory_services import get_current_stock


logger = logging.getLogger(__name__)


def _parse_range(val: str | None):
    now = dj_tz.now()
    if not val:
        return now - timedelta(days=1), now
    s = str(val).lower().strip()
    if s == "today" or s == "24h":
        # Start of today in Manila timezone
        # Convert to local timezone first, then get start of day, then convert back to UTC for DB queries
        local_now = dj_tz.localtime(now)
        start_of_day_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Convert back to UTC for database queries
        start = dj_tz.make_aware(start_of_day_local.replace(tzinfo=None), dj_tz.get_current_timezone())
        return start, now
    if s == "7d":
        return now - timedelta(days=7), now
    if s == "30d":
        return now - timedelta(days=30), now
    try:
        # support ISO start..end
        start_s, end_s = s.split("..", 1)
        return datetime.fromisoformat(start_s), datetime.fromisoformat(end_s)
    except Exception:
        return now - timedelta(days=1), now


@require_http_methods(["GET"])  # /reports/dashboard
def reports_dashboard(request):
    """Aggregate dashboard statistics: sales, orders, popular items, recent sales."""
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.dashboard.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)

    try:
        from .models import Order, OrderItem, PaymentTransaction, MenuItem

        r = request.GET.get("range", "today")
        start, end = _parse_range(r)

        # Calculate yesterday's date range for comparisons
        yesterday_start = start - timedelta(days=1)
        yesterday_end = yesterday_start.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Get start of month for monthly sales (in Manila timezone)
        now = dj_tz.now()
        local_now = dj_tz.localtime(now)
        month_start_local = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_start = dj_tz.make_aware(month_start_local.replace(tzinfo=None), dj_tz.get_current_timezone())

        # Daily sales (today)
        daily_payments = PaymentTransaction.objects.filter(
            created_at__gte=start,
            created_at__lte=end,
            status=PaymentTransaction.STATUS_COMPLETED
        )
        daily_sales = daily_payments.aggregate(total=Sum("amount"))["total"] or 0

        # Yesterday's sales for comparison
        daily_sales_yesterday = PaymentTransaction.objects.filter(
            created_at__gte=yesterday_start,
            created_at__lte=yesterday_end,
            status=PaymentTransaction.STATUS_COMPLETED
        ).aggregate(total=Sum("amount"))["total"] or 0

        # Calculate percentage change for daily sales
        daily_sales_change = 0.0
        if daily_sales_yesterday > 0:
            daily_sales_change = ((daily_sales - daily_sales_yesterday) / daily_sales_yesterday) * 100

        # Monthly sales
        monthly_payments = PaymentTransaction.objects.filter(
            created_at__gte=month_start,
            created_at__lte=end,
            status=PaymentTransaction.STATUS_COMPLETED
        )
        monthly_sales = monthly_payments.aggregate(total=Sum("amount"))["total"] or 0

        # Last month's sales for comparison
        last_month_start = (month_start - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = month_start - timedelta(seconds=1)
        monthly_sales_last_month = PaymentTransaction.objects.filter(
            created_at__gte=last_month_start,
            created_at__lte=last_month_end,
            status=PaymentTransaction.STATUS_COMPLETED
        ).aggregate(total=Sum("amount"))["total"] or 0

        # Calculate percentage change for monthly sales
        monthly_sales_change = 0.0
        if monthly_sales_last_month > 0:
            monthly_sales_change = ((monthly_sales - monthly_sales_last_month) / monthly_sales_last_month) * 100

        # Order count for today
        orders_today = Order.objects.filter(
            created_at__gte=start,
            created_at__lte=end
        ).exclude(status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED])
        order_count = orders_today.count()

        # Yesterday's order count for comparison
        orders_yesterday = Order.objects.filter(
            created_at__gte=yesterday_start,
            created_at__lte=yesterday_end
        ).exclude(status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED])
        order_count_yesterday = orders_yesterday.count()

        # Calculate percentage change for order count
        order_count_change = 0.0
        if order_count_yesterday > 0:
            order_count_change = ((order_count - order_count_yesterday) / order_count_yesterday) * 100

        # Sales by time - hourly for today, daily for multi-day ranges
        # Use Order.created_at for accurate sale timing (when order was placed)
        # Send ISO timestamps to frontend for timezone conversion
        sales_by_time = []
        sales_by_time_yesterday = []

        # Determine if this is a single-day or multi-day range
        time_diff = (end - start).total_seconds() / 3600  # hours

        if time_diff <= 24:  # Single day - use hourly breakdown
            for hour in range(0, 24):  # Every 1 hour
                # Create timezone-aware boundaries for accurate comparison
                hour_start = start.replace(hour=hour, minute=0, second=0, microsecond=0)
                hour_end = hour_start + timedelta(hours=1)

                # Aggregate by Order.total_amount for actual sale values
                # Filter out cancelled/voided orders for accurate reporting
                hour_total = Order.objects.filter(
                    created_at__gte=hour_start,
                    created_at__lt=hour_end
                ).exclude(
                    status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
                ).aggregate(total=Sum("total_amount"))["total"] or 0

                # Send ISO timestamp for frontend timezone conversion
                sales_by_time.append({
                    "time": hour_start.isoformat(),  # ISO format with timezone info
                    "amount": float(hour_total)
                })

            # Yesterday's sales for comparison (same hourly breakdown)
            for hour in range(0, 24):  # Every 1 hour
                hour_start = yesterday_start.replace(hour=hour, minute=0, second=0, microsecond=0)
                hour_end = hour_start + timedelta(hours=1)

                hour_total = Order.objects.filter(
                    created_at__gte=hour_start,
                    created_at__lt=hour_end
                ).exclude(
                    status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
                ).aggregate(total=Sum("total_amount"))["total"] or 0

                sales_by_time_yesterday.append({
                    "time": hour_start.isoformat(),
                    "amount": float(hour_total)
                })
        else:  # Multi-day range - use daily breakdown
            # Calculate number of days in range
            num_days = int((end - start).total_seconds() / 86400) + 1

            # Get daily sales for the selected range
            for day_offset in range(num_days):
                day_start = start + timedelta(days=day_offset)
                # Ensure we're working with start of day in local timezone
                local_day_start = dj_tz.localtime(day_start)
                day_start_normalized = local_day_start.replace(hour=0, minute=0, second=0, microsecond=0)
                day_start_aware = dj_tz.make_aware(day_start_normalized.replace(tzinfo=None), dj_tz.get_current_timezone())
                day_end = day_start_aware + timedelta(days=1)

                day_total = Order.objects.filter(
                    created_at__gte=day_start_aware,
                    created_at__lt=day_end
                ).exclude(
                    status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
                ).aggregate(total=Sum("total_amount"))["total"] or 0

                sales_by_time.append({
                    "time": day_start_aware.isoformat(),
                    "amount": float(day_total)
                })

            # For comparison, get the previous period (same number of days before)
            comparison_start = start - timedelta(days=num_days)
            for day_offset in range(num_days):
                day_start = comparison_start + timedelta(days=day_offset)
                local_day_start = dj_tz.localtime(day_start)
                day_start_normalized = local_day_start.replace(hour=0, minute=0, second=0, microsecond=0)
                day_start_aware = dj_tz.make_aware(day_start_normalized.replace(tzinfo=None), dj_tz.get_current_timezone())
                day_end = day_start_aware + timedelta(days=1)

                day_total = Order.objects.filter(
                    created_at__gte=day_start_aware,
                    created_at__lt=day_end
                ).exclude(
                    status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
                ).aggregate(total=Sum("total_amount"))["total"] or 0

                sales_by_time_yesterday.append({
                    "time": day_start_aware.isoformat(),
                    "amount": float(day_total)
                })

        # Sales by category (from menu items in orders)
        # Include all valid order statuses except cancelled/voided
        category_sales = defaultdict(float)
        order_items = OrderItem.objects.filter(
            order__created_at__gte=start,
            order__created_at__lte=end
        ).exclude(
            order__status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
        ).select_related('menu_item')

        for item in order_items:
            # Only count items with non-empty categories
            category = getattr(item, 'category', None)
            if category and category.strip():
                category_sales[category] += float(item.price * item.quantity)

        # Convert to list format, filter out any zero amounts
        sales_by_category = [
            {"category": cat, "amount": amount}
            for cat, amount in category_sales.items()
            if amount > 0
        ]

        # Yesterday's sales by category for comparison
        category_sales_yesterday = defaultdict(float)
        order_items_yesterday = OrderItem.objects.filter(
            order__created_at__gte=yesterday_start,
            order__created_at__lte=yesterday_end
        ).exclude(
            order__status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
        ).select_related('menu_item')

        for item in order_items_yesterday:
            category = getattr(item, 'category', None)
            if category and category.strip():
                category_sales_yesterday[category] += float(item.price * item.quantity)

        sales_by_category_yesterday = [
            {"category": cat, "amount": amount}
            for cat, amount in category_sales_yesterday.items()
            if amount > 0
        ]

        # Popular items (most ordered today)
        # Include all valid orders except cancelled/voided
        popular_items_data = OrderItem.objects.filter(
            order__created_at__gte=start,
            order__created_at__lte=end
        ).exclude(
            order__status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
        ).values('item_name').annotate(
            count=Sum('quantity')
        ).order_by('-count')[:5]

        popular_items = [
            {"name": item["item_name"], "count": item["count"]}
            for item in popular_items_data
        ]

        # Yesterday's popular items for comparison
        popular_items_yesterday_data = OrderItem.objects.filter(
            order__created_at__gte=yesterday_start,
            order__created_at__lte=yesterday_end
        ).exclude(
            order__status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
        ).values('item_name').annotate(
            count=Sum('quantity')
        ).order_by('-count')[:5]

        popular_items_yesterday = [
            {"name": item["item_name"], "count": item["count"]}
            for item in popular_items_yesterday_data
        ]

        # Recent sales (last 10 completed orders)
        recent_orders = Order.objects.filter(
            created_at__gte=start,
            created_at__lte=end
        ).exclude(
            status__in=[Order.STATUS_CANCELLED, Order.STATUS_VOIDED]
        ).order_by('-created_at')[:10]

        recent_sales = []
        for order in recent_orders:
            # Get payment method from associated payment
            payment = PaymentTransaction.objects.filter(order_id=order.order_number).first()
            payment_method = payment.method if payment else order.payment_method or "cash"

            recent_sales.append({
                "id": order.order_number,
                "total": float(order.total_amount),
                "date": order.created_at.isoformat() if order.created_at else None,
                "paymentMethod": payment_method
            })

        return JsonResponse({
            "success": True,
            "data": {
                "dailySales": float(daily_sales),
                "dailySalesYesterday": float(daily_sales_yesterday),
                "dailySalesChange": float(daily_sales_change),
                "monthlySales": float(monthly_sales),
                "monthlySalesLastMonth": float(monthly_sales_last_month),
                "monthlySalesChange": float(monthly_sales_change),
                "orderCount": order_count,
                "orderCountYesterday": order_count_yesterday,
                "orderCountChange": float(order_count_change),
                "salesByTime": sales_by_time,
                "salesByTimeYesterday": sales_by_time_yesterday,
                "salesByCategory": sales_by_category,
                "salesByCategoryYesterday": sales_by_category_yesterday,
                "popularItems": popular_items,
                "popularItemsYesterday": popular_items_yesterday,
                "recentSales": recent_sales,
                "dateRangeStart": start.isoformat(),
                "dateRangeEnd": end.isoformat(),
            }
        })
    except Exception as e:
        logger.exception("Failed to generate dashboard stats")
        return JsonResponse({"success": False, "message": f"Unable to generate dashboard stats: {str(e)}"}, status=500)


@require_http_methods(["GET"])  # /reports/sales
def reports_sales(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.sales.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from django.db.models import Sum
        from .models import PaymentTransaction
        r = request.GET.get("range")
        start, end = _parse_range(r)
        qs = PaymentTransaction.objects.filter(created_at__gte=start, created_at__lte=end)
        total = qs.aggregate(total=Sum("amount")).get("total") or 0
        by_method = (
            qs.values("method").annotate(total=Sum("amount")).order_by()
        )
        return JsonResponse({
            "success": True,
            "data": {
                "total": float(total or 0),
                "byMethod": {row["method"]: float(row["total"] or 0) for row in by_method},
                "range": {"from": start.isoformat(), "to": end.isoformat()},
            },
        })
    except Exception:
        logger.exception("Failed to generate sales report")
        return JsonResponse({"success": False, "message": "Unable to generate sales report"}, status=500)


@require_http_methods(["GET"])  # /reports/inventory
def reports_inventory(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.inventory.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from .models import InventoryItem
        items = list(InventoryItem.objects.all().order_by("name"))
        ids = [str(i.id) for i in items]
        stock_map = get_current_stock(ids, location_id=None, as_of=None)
        data = [
            {
                "id": str(i.id),
                "name": i.name,
                "category": i.category,
                "quantity": float(stock_map.get(str(i.id), 0)),
                "unit": i.unit,
                "minStock": float(i.min_stock or 0),
                "expiryDate": i.expiry_date.isoformat() if i.expiry_date else None,
            }
            for i in items
        ]
        return JsonResponse({"success": True, "data": data})
    except Exception:
        logger.exception("Failed to generate inventory report")
        return JsonResponse({"success": False, "message": "Unable to generate inventory report"}, status=500)


@require_http_methods(["GET"])  # /reports/orders
def reports_orders(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.orders.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from django.db.models import Count
        from .models import Order
        rows = Order.objects.values("status").annotate(count=Count("id"))
        return JsonResponse({"success": True, "data": {r["status"]: r["count"] for r in rows}})
    except Exception:
        logger.exception("Failed to generate orders report")
        return JsonResponse({"success": False, "message": "Unable to generate orders report"}, status=500)


@require_http_methods(["GET"])  # /reports/staff-attendance
def reports_staff_attendance(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.staff.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    try:
        from django.db.models import Count
        from .models import AttendanceRecord
        rows = AttendanceRecord.objects.values("status").annotate(count=Count("id"))
        return JsonResponse({"success": True, "data": {r["status"]: r["count"] for r in rows}})
    except Exception:
        logger.exception("Failed to generate staff attendance report")
        return JsonResponse({"success": False, "message": "Unable to generate staff attendance report"}, status=500)


@require_http_methods(["GET"])  # /reports/customer-history?customer=
def reports_customer_history(request):
    actor, err = _actor_from_request(request)
    if not actor:
        return err
    if not _has_permission(actor, "reports.customer.view"):
        return JsonResponse({"success": False, "message": "Forbidden"}, status=403)
    customer = (request.GET.get("customer") or "").strip()
    try:
        from .models import PaymentTransaction
        qs = PaymentTransaction.objects.all()
        if customer:
            qs = qs.filter(customer__icontains=customer)
        qs = qs.order_by("-created_at")[:500]
        data = [
            {
                "id": str(p.id),
                "orderId": p.order_id,
                "orderNumber": str(p.order_id) if p.order_id else "",
                "amount": float(p.amount or 0),
                "method": p.method,
                "status": p.status,
                "date": p.created_at.isoformat() if p.created_at else None,
                "reference": p.reference or "",
                "customer": p.customer or "",
            }
            for p in qs
        ]
        return JsonResponse({"success": True, "data": data})
    except Exception:
        logger.exception("Failed to generate customer history report")
        return JsonResponse({"success": False, "message": "Unable to generate customer history report"}, status=500)


__all__ = [
    "reports_dashboard",
    "reports_sales",
    "reports_inventory",
    "reports_orders",
    "reports_staff_attendance",
    "reports_customer_history",
]

