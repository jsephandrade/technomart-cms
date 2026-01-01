"""
Notification templates for different event types.
Each template defines the title, message format, and notification type.
"""

from typing import Dict, Any


class NotificationTemplate:
    """Base notification template"""

    def __init__(self, title: str, message_template: str, notification_type: str = 'info'):
        self.title = title
        self.message_template = message_template
        self.notification_type = notification_type

    def format(self, **kwargs) -> Dict[str, Any]:
        """Format the template with provided context"""
        return {
            'title': self.title.format(**kwargs),
            'message': self.message_template.format(**kwargs),
            'type': self.notification_type,
        }


# Inventory notifications
LOW_STOCK_ALERT = NotificationTemplate(
    title="Low Stock Alert",
    message_template="Item '{item_name}' is running low. Current stock: {current_stock} {unit}. Reorder threshold: {reorder_level} {unit}.",
    notification_type="warning"
)

OUT_OF_STOCK = NotificationTemplate(
    title="Out of Stock",
    message_template="Item '{item_name}' is out of stock. Please restock immediately.",
    notification_type="error"
)

ITEM_EXPIRING_SOON = NotificationTemplate(
    title="Items Expiring Soon",
    message_template="{count} item(s) will expire within {days} days. Please check your inventory.",
    notification_type="warning"
)

ITEM_EXPIRED = NotificationTemplate(
    title="Expired Items",
    message_template="Item '{item_name}' has expired. Expiration date: {expiry_date}.",
    notification_type="error"
)

# Order notifications
NEW_ORDER = NotificationTemplate(
    title="New Order Received",
    message_template="Order #{order_number} received. Total: ₱{total_amount}. Items: {item_count}.",
    notification_type="info"
)

ORDER_READY = NotificationTemplate(
    title="Order Ready for Pickup",
    message_template="Order #{order_number} is ready for pickup.{pickup_instructions}",
    notification_type="success"
)

ORDER_COMPLETED = NotificationTemplate(
    title="Order Completed",
    message_template="Order #{order_number} has been completed. Total: ₱{total_amount}.",
    notification_type="success"
)

ORDER_CANCELLED = NotificationTemplate(
    title="Order Cancelled",
    message_template="Order #{order_number} has been cancelled. Reason: {reason}.",
    notification_type="warning"
)

# Payment notifications
PAYMENT_RECEIVED = NotificationTemplate(
    title="Payment Received",
    message_template="Payment of ₱{amount} received for Order #{order_number} via {payment_method}.",
    notification_type="success"
)

PAYMENT_FAILED = NotificationTemplate(
    title="Payment Failed",
    message_template="Payment of ₱{amount} failed for Order #{order_number}. Reason: {reason}.",
    notification_type="error"
)

# Catering notifications
CATERING_BOOKING_CONFIRMED = NotificationTemplate(
    title="Catering Booking Confirmed",
    message_template="Catering event '{event_name}' on {event_date} has been confirmed. Total: ₱{total_amount}.",
    notification_type="success"
)

CATERING_BOOKING_PENDING = NotificationTemplate(
    title="New Catering Booking",
    message_template="New catering booking request for '{event_name}' on {event_date}. Please review.",
    notification_type="info"
)

CATERING_BOOKING_CANCELLED = NotificationTemplate(
    title="Catering Booking Cancelled",
    message_template="Catering event '{event_name}' on {event_date} has been cancelled.",
    notification_type="warning"
)

CATERING_REMINDER = NotificationTemplate(
    title="Upcoming Catering Event",
    message_template="Reminder: Catering event '{event_name}' is scheduled for {event_date} at {event_time}.",
    notification_type="info"
)

# Employee notifications
SHIFT_ASSIGNED = NotificationTemplate(
    title="Shift Assigned",
    message_template="You have been assigned a shift on {day} from {start_time} to {end_time}.",
    notification_type="info"
)

SHIFT_UPDATED = NotificationTemplate(
    title="Shift Updated",
    message_template="Your shift on {day} has been updated. New time: {start_time} to {end_time}.",
    notification_type="info"
)

SHIFT_CANCELLED = NotificationTemplate(
    title="Shift Cancelled",
    message_template="Your shift on {day} from {start_time} to {end_time} has been cancelled.",
    notification_type="warning"
)

LEAVE_APPROVED = NotificationTemplate(
    title="Leave Request Approved",
    message_template="Your leave request from {start_date} to {end_date} has been approved.",
    notification_type="success"
)

LEAVE_REJECTED = NotificationTemplate(
    title="Leave Request Rejected",
    message_template="Your leave request from {start_date} to {end_date} has been rejected. Reason: {reason}.",
    notification_type="error"
)

# System notifications
SYSTEM_MAINTENANCE = NotificationTemplate(
    title="System Maintenance",
    message_template="System maintenance scheduled for {date} at {time}. Expected duration: {duration}.",
    notification_type="warning"
)

BACKUP_COMPLETED = NotificationTemplate(
    title="Backup Completed",
    message_template="System backup completed successfully at {timestamp}.",
    notification_type="success"
)

BACKUP_FAILED = NotificationTemplate(
    title="Backup Failed",
    message_template="System backup failed at {timestamp}. Error: {error}.",
    notification_type="error"
)


# Template registry for easy lookup
TEMPLATES = {
    # Inventory
    'low_stock_alert': LOW_STOCK_ALERT,
    'out_of_stock': OUT_OF_STOCK,
    'item_expiring_soon': ITEM_EXPIRING_SOON,
    'item_expired': ITEM_EXPIRED,

    # Orders
    'new_order': NEW_ORDER,
    'order_ready': ORDER_READY,
    'order_completed': ORDER_COMPLETED,
    'order_cancelled': ORDER_CANCELLED,

    # Payments
    'payment_received': PAYMENT_RECEIVED,
    'payment_failed': PAYMENT_FAILED,

    # Catering
    'catering_booking_confirmed': CATERING_BOOKING_CONFIRMED,
    'catering_booking_pending': CATERING_BOOKING_PENDING,
    'catering_booking_cancelled': CATERING_BOOKING_CANCELLED,
    'catering_reminder': CATERING_REMINDER,

    # Employee
    'shift_assigned': SHIFT_ASSIGNED,
    'shift_updated': SHIFT_UPDATED,
    'shift_cancelled': SHIFT_CANCELLED,
    'leave_approved': LEAVE_APPROVED,
    'leave_rejected': LEAVE_REJECTED,

    # System
    'system_maintenance': SYSTEM_MAINTENANCE,
    'backup_completed': BACKUP_COMPLETED,
    'backup_failed': BACKUP_FAILED,
}


def get_template(template_name: str) -> NotificationTemplate:
    """Get a notification template by name"""
    template = TEMPLATES.get(template_name)
    if not template:
        raise ValueError(f"Unknown template: {template_name}")
    return template


def format_notification(template_name: str, **kwargs) -> Dict[str, Any]:
    """Format a notification using a template"""
    template = get_template(template_name)
    return template.format(**kwargs)
