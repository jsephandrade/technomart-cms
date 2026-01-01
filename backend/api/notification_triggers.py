"""
Notification triggers for business events.
These functions create notifications when certain events occur.
"""

import logging
import os
from typing import List, Optional
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.db.models import F, Q
from django.utils import timezone

from .notification_templates import format_notification

logger = logging.getLogger(__name__)

User = get_user_model()


def _celery_enabled() -> bool:
    if os.getenv("DISABLE_CELERY", "").strip().lower() in {"1", "true", "yes", "on"}:
        return False
    if not os.getenv("CELERY_BROKER_URL"):
        return False
    return True


# Try to import Celery task, fallback to sync if not available
try:
    from .tasks import create_notification, create_notification_sync, CELERY_AVAILABLE
    USE_CELERY = bool(CELERY_AVAILABLE) and _celery_enabled()
except Exception:
    from .tasks import create_notification_sync
    create_notification = None
    USE_CELERY = False
    logger.warning("Celery not available, using synchronous notification creation")


def _create_notification(**kwargs):
    """Helper to call create_notification with or without Celery"""
    if USE_CELERY and create_notification:
        # Use Celery async
        return create_notification.delay(**kwargs)
    else:
        # Use synchronous version
        return create_notification_sync(**kwargs)


def get_admin_users() -> List[int]:
    """Get all admin and manager user IDs"""
    try:
        admin_users = User.objects.filter(
            Q(role='admin') | Q(role='manager')
        ).values_list('id', flat=True)
        return list(admin_users)
    except Exception as e:
        logger.error(f"Failed to get admin users: {e}")
        return []


# ========== Inventory Triggers ==========

def trigger_low_stock_alert(item):
    """
    Trigger low stock alert notification.

    Args:
        item: InventoryItem instance
    """
    try:
        if item.stock_quantity <= item.reorder_level:
            notification_data = format_notification(
                'low_stock_alert',
                item_name=item.name,
                current_stock=item.stock_quantity,
                unit=item.unit or 'units',
                reorder_level=item.reorder_level
            )

            # Notify all admins and managers
            for user_id in get_admin_users():
                _create_notification(
                    user_id=user_id,
                    title=notification_data['title'],
                    message=notification_data['message'],
                    notification_type=notification_data['type'],
                    meta={'item_id': str(item.id), 'event_type': 'low_stock'}
                )

            logger.info(f"Low stock alert triggered for item {item.name}")

    except Exception as e:
        logger.error(f"Failed to trigger low stock alert: {e}")


def trigger_out_of_stock(item):
    """
    Trigger out of stock notification.

    Args:
        item: InventoryItem instance
    """
    try:
        if item.stock_quantity <= 0:
            notification_data = format_notification(
                'out_of_stock',
                item_name=item.name
            )

            # Notify all admins and managers
            for user_id in get_admin_users():
                _create_notification(
                    user_id=user_id,
                    title=notification_data['title'],
                    message=notification_data['message'],
                    notification_type=notification_data['type'],
                    meta={'item_id': str(item.id), 'event_type': 'out_of_stock'}
                )

            logger.info(f"Out of stock notification triggered for item {item.name}")

    except Exception as e:
        logger.error(f"Failed to trigger out of stock notification: {e}")


def check_expiring_items():
    """
    Check for items expiring soon and trigger notifications.
    Should be run daily via Celery beat.
    """
    try:
        from .models import InventoryItem

        # Items expiring in the next 7 days
        expiry_threshold = timezone.now() + timedelta(days=7)

        expiring_items = InventoryItem.objects.filter(
            expiry_date__lte=expiry_threshold,
            expiry_date__gte=timezone.now(),
            status='active'
        )

        if expiring_items.exists():
            notification_data = format_notification(
                'item_expiring_soon',
                count=expiring_items.count(),
                days=7
            )

            # Notify all admins and managers
            for user_id in get_admin_users():
                _create_notification(
                    user_id=user_id,
                    title=notification_data['title'],
                    message=notification_data['message'],
                    notification_type=notification_data['type'],
                    meta={'event_type': 'items_expiring_soon', 'item_count': expiring_items.count()}
                )

            logger.info(f"Expiring items notification triggered for {expiring_items.count()} items")

    except Exception as e:
        logger.error(f"Failed to check expiring items: {e}")


# ========== Order Triggers ==========

def trigger_new_order(order):
    """
    Trigger new order notification.

    Args:
        order: Order instance
    """
    try:
        notification_data = format_notification(
            'new_order',
            order_number=order.id,
            total_amount=f"{order.total_amount:,.2f}" if order.total_amount else "0.00",
            item_count=order.items.count() if hasattr(order, 'items') else 0
        )

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'order_id': str(order.id), 'event_type': 'new_order'}
            )

        logger.info(f"New order notification triggered for order {order.id}")

    except Exception as e:
        logger.error(f"Failed to trigger new order notification: {e}")


def trigger_order_completed(order):
    """
    Trigger order completed notification.

    Args:
        order: Order instance
    """
    try:
        notification_data = format_notification(
            'order_completed',
            order_number=order.id,
            total_amount=f"{order.total_amount:,.2f}" if order.total_amount else "0.00"
        )

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'order_id': str(order.id), 'event_type': 'order_completed'}
            )

        logger.info(f"Order completed notification triggered for order {order.id}")

    except Exception as e:
        logger.error(f"Failed to trigger order completed notification: {e}")


def _build_pickup_instructions(order) -> str:
    parts: List[str] = []
    shelf_slot = getattr(order, "shelf_slot", None)
    if shelf_slot:
        parts.append(f" Pick up at shelf {shelf_slot}.")
    handoff_code = getattr(order, "handoff_code", None)
    if handoff_code:
        parts.append(f" Handoff code: {handoff_code}.")
    return "".join(parts)


def trigger_order_ready_for_pickup(order):
    """
    Trigger notification when an order is ready for pickup.

    Args:
        order: Order instance
    """
    try:
        user_id = getattr(order, "placed_by_id", None)
        if not user_id:
            return

        order_number = getattr(order, "order_number", None) or getattr(order, "id", "")
        pickup_instructions = _build_pickup_instructions(order)
        notification_data = format_notification(
            'order_ready',
            order_number=order_number,
            pickup_instructions=pickup_instructions,
        )

        _create_notification(
            user_id=user_id,
            title=notification_data['title'],
            message=notification_data['message'],
            notification_type=notification_data['type'],
            meta={'order_id': str(order.id), 'event_type': 'order_ready'},
        )

        logger.info(f"Order ready notification triggered for order {order.id}")

    except Exception as e:
        logger.error(f"Failed to trigger order ready notification: {e}")


# ========== Payment Triggers ==========

def trigger_payment_received(order, amount, payment_method):
    """
    Trigger payment received notification.

    Args:
        order: Order instance
        amount: Payment amount
        payment_method: Payment method used
    """
    try:
        notification_data = format_notification(
            'payment_received',
            amount=f"{amount:,.2f}",
            order_number=order.id,
            payment_method=payment_method
        )

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'order_id': str(order.id), 'event_type': 'payment_received', 'amount': str(amount)}
            )

        logger.info(f"Payment received notification triggered for order {order.id}")

    except Exception as e:
        logger.error(f"Failed to trigger payment received notification: {e}")


# ========== Catering Triggers ==========

def trigger_catering_booking(event):
    """
    Trigger catering booking notification.

    Args:
        event: CateringEvent instance
    """
    try:
        template_name = 'catering_booking_confirmed' if event.status == 'confirmed' else 'catering_booking_pending'

        notification_data = format_notification(
            template_name,
            event_name=event.event_name or 'Unnamed Event',
            event_date=event.event_date.strftime('%B %d, %Y') if event.event_date else 'TBD',
            total_amount=f"{event.total_amount:,.2f}" if event.total_amount else "0.00"
        )

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'event_id': str(event.id), 'event_type': 'catering_booking'}
            )

        logger.info(f"Catering booking notification triggered for event {event.id}")

    except Exception as e:
        logger.error(f"Failed to trigger catering booking notification: {e}")


def trigger_catering_status_change(event, old_status):
    """
    Trigger notification when catering event status changes.

    Args:
        event: CateringEvent instance
        old_status: Previous status
    """
    try:
        if event.status == 'confirmed' and old_status != 'confirmed':
            notification_data = format_notification(
                'catering_booking_confirmed',
                event_name=event.event_name or 'Unnamed Event',
                event_date=event.event_date.strftime('%B %d, %Y') if event.event_date else 'TBD',
                total_amount=f"{event.total_amount:,.2f}" if event.total_amount else "0.00"
            )
        elif event.status == 'cancelled':
            notification_data = format_notification(
                'catering_booking_cancelled',
                event_name=event.event_name or 'Unnamed Event',
                event_date=event.event_date.strftime('%B %d, %Y') if event.event_date else 'TBD'
            )
        else:
            return  # No notification for other status changes

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'event_id': str(event.id), 'event_type': 'catering_status_change', 'old_status': old_status}
            )

        logger.info(f"Catering status change notification triggered for event {event.id}")

    except Exception as e:
        logger.error(f"Failed to trigger catering status change notification: {e}")


# ========== Employee Triggers ==========

def trigger_shift_assigned(employee, schedule):
    """
    Trigger shift assigned notification.

    Args:
        employee: Employee instance
        schedule: Schedule instance
    """
    try:
        notification_data = format_notification(
            'shift_assigned',
            day=schedule.day,
            start_time=schedule.start_time.strftime('%I:%M %p') if schedule.start_time else 'TBD',
            end_time=schedule.end_time.strftime('%I:%M %p') if schedule.end_time else 'TBD'
        )

        # Notify the employee (if they have a user account)
        if hasattr(employee, 'user_id') and employee.user_id:
            _create_notification(
                user_id=employee.user_id,
                title=notification_data['title'],
                message=notification_data['message'],
                notification_type=notification_data['type'],
                meta={'schedule_id': str(schedule.id), 'event_type': 'shift_assigned'}
            )

            logger.info(f"Shift assigned notification triggered for employee {employee.id}")

    except Exception as e:
        logger.error(f"Failed to trigger shift assigned notification: {e}")


def trigger_leave_status_change(leave_request):
    """
    Trigger notification when leave request status changes.

    Args:
        leave_request: LeaveRequest instance
    """
    try:
        if leave_request.status == 'approved':
            template_name = 'leave_approved'
        elif leave_request.status == 'rejected':
            template_name = 'leave_rejected'
        else:
            return  # No notification for pending status

        notification_data = format_notification(
            template_name,
            start_date=leave_request.start_date.strftime('%B %d, %Y') if leave_request.start_date else 'TBD',
            end_date=leave_request.end_date.strftime('%B %d, %Y') if leave_request.end_date else 'TBD',
            reason=leave_request.rejection_reason or 'N/A'
        )

        # Notify the employee (if they have a user account)
        if hasattr(leave_request, 'employee') and hasattr(leave_request.employee, 'user_id'):
            if leave_request.employee.user_id:
                _create_notification(
                    user_id=leave_request.employee.user_id,
                    title=notification_data['title'],
                    message=notification_data['message'],
                    notification_type=notification_data['type'],
                    meta={'leave_request_id': str(leave_request.id), 'event_type': 'leave_status_change'}
                )

                logger.info(f"Leave status change notification triggered for leave request {leave_request.id}")

    except Exception as e:
        logger.error(f"Failed to trigger leave status change notification: {e}")


# ========== Menu & POS Triggers ==========

def trigger_menu_item_added(menu_item):
    """
    Trigger notification when new menu item is added.

    Args:
        menu_item: MenuItem instance
    """
    try:
        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title="New Menu Item Added",
                message=f"New menu item '{menu_item.name}' has been added to the menu at ₱{menu_item.price:,.2f}.",
                notification_type='success',
                meta={'menu_item_id': str(menu_item.id), 'event_type': 'menu_item_added'}
            )

        logger.info(f"Menu item added notification triggered for {menu_item.name}")

    except Exception as e:
        logger.error(f"Failed to trigger menu item added notification: {e}")


def trigger_large_order(order, threshold=5000):
    """
    Trigger notification for large orders exceeding threshold.

    Args:
        order: Order instance
        threshold: Amount threshold for large orders (default: 5000)
    """
    try:
        if order.total_amount and order.total_amount >= threshold:
            # Notify all admins and managers
            for user_id in get_admin_users():
                _create_notification(
                    user_id=user_id,
                    title="Large Order Alert",
                    message=f"Large order #{order.id} placed for ₱{order.total_amount:,.2f}. Please review and prioritize.",
                    notification_type='warning',
                    meta={'order_id': str(order.id), 'event_type': 'large_order', 'amount': str(order.total_amount)}
                )

            logger.info(f"Large order notification triggered for order {order.id}")

    except Exception as e:
        logger.error(f"Failed to trigger large order notification: {e}")


# ========== User & Account Triggers ==========

def trigger_new_user_registration(user):
    """
    Trigger notification when new user registers.

    Args:
        user: AppUser instance
    """
    try:
        # Notify all admins
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title="New User Registration",
                message=f"New user {user.email} has registered and is pending approval.",
                notification_type='info',
                meta={'new_user_id': str(user.id), 'event_type': 'new_user_registration'}
            )

        logger.info(f"New user registration notification triggered for {user.email}")

    except Exception as e:
        logger.error(f"Failed to trigger new user registration notification: {e}")


def trigger_user_role_changed(user, old_role, new_role):
    """
    Trigger notification when user role changes.

    Args:
        user: AppUser instance
        old_role: Previous role
        new_role: New role
    """
    try:
        # Notify the user
        _create_notification(
            user_id=user.id,
            title="Role Updated",
            message=f"Your role has been changed from {old_role} to {new_role}.",
            notification_type='info',
            meta={'event_type': 'role_changed', 'old_role': old_role, 'new_role': new_role}
        )

        # Notify admins
        for admin_id in get_admin_users():
            if admin_id != user.id:
                _create_notification(
                    user_id=admin_id,
                    title="User Role Changed",
                    message=f"User {user.email}'s role changed from {old_role} to {new_role}.",
                    notification_type='info',
                    meta={'affected_user_id': str(user.id), 'event_type': 'role_changed'}
                )

        logger.info(f"Role change notification triggered for user {user.email}")

    except Exception as e:
        logger.error(f"Failed to trigger role change notification: {e}")


# ========== Daily Summary Triggers ==========

def trigger_daily_sales_summary():
    """
    Trigger daily sales summary notification.
    Should be run daily via Celery beat at end of day.
    """
    try:
        from .models import Order
        from django.db.models import Sum, Count

        today = timezone.now().date()
        today_start = timezone.datetime.combine(today, timezone.datetime.min.time())
        today_end = timezone.datetime.combine(today, timezone.datetime.max.time())

        # Get today's stats
        stats = Order.objects.filter(
            created_at__range=(today_start, today_end),
            status='completed'
        ).aggregate(
            total_sales=Sum('total_amount'),
            order_count=Count('id')
        )

        total_sales = stats['total_sales'] or 0
        order_count = stats['order_count'] or 0

        # Notify all admins and managers
        for user_id in get_admin_users():
            _create_notification(
                user_id=user_id,
                title="Daily Sales Summary",
                message=f"Today's sales: ₱{total_sales:,.2f} from {order_count} completed orders.",
                notification_type='success',
                meta={'event_type': 'daily_sales_summary', 'date': str(today), 'total_sales': str(total_sales)}
            )

        logger.info(f"Daily sales summary notification triggered: ₱{total_sales:,.2f}")

    except Exception as e:
        logger.error(f"Failed to trigger daily sales summary: {e}")


def trigger_low_inventory_report():
    """
    Trigger low inventory report notification.
    Should be run daily via Celery beat.
    """
    try:
        from .models import InventoryItem

        low_stock_items = InventoryItem.objects.filter(
            stock_quantity__lte=F('reorder_level'),
            status='active'
        )

        if low_stock_items.exists():
            count = low_stock_items.count()

            # Notify all admins and managers
            for user_id in get_admin_users():
                _create_notification(
                    user_id=user_id,
                    title="Low Inventory Report",
                    message=f"{count} item(s) are currently low on stock. Please review and reorder.",
                    notification_type='warning',
                    meta={'event_type': 'low_inventory_report', 'item_count': count}
                )

            logger.info(f"Low inventory report notification triggered: {count} items")

    except Exception as e:
        logger.error(f"Failed to trigger low inventory report: {e}")


# ========== Test Trigger (for frontend testing) ==========

def trigger_test_notification(user_id, notification_type='info'):
    """
    Trigger a test notification for testing purposes.

    Args:
        user_id: User ID to send notification to
        notification_type: Type of notification (info, success, warning, error)
    """
    try:
        messages = {
            'info': ('Test Notification', 'This is a test info notification sent at ' + timezone.now().strftime('%I:%M %p')),
            'success': ('Success Notification', 'This is a test success notification! Everything is working great.'),
            'warning': ('Warning Notification', 'This is a test warning notification. Please review this alert.'),
            'error': ('Error Notification', 'This is a test error notification. Immediate action may be required.'),
        }

        title, message = messages.get(notification_type, messages['info'])

        _create_notification(
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            meta={'event_type': 'test_notification', 'test_type': notification_type}
        )

        logger.info(f"Test notification ({notification_type}) triggered for user {user_id}")
        return True

    except Exception as e:
        logger.error(f"Failed to trigger test notification: {e}")
        return False
