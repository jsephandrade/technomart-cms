"""
Celery tasks for background notification processing.
"""

import json
import logging
from datetime import timedelta
from typing import Optional, List, Dict, Any

try:
    from celery import shared_task
    CELERY_AVAILABLE = True
except ImportError:
    # Celery not installed, create a dummy decorator
    def shared_task(*args, **kwargs):
        def decorator(func):
            return func
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator
    CELERY_AVAILABLE = False

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def get_notification_model():
    """Lazy import to avoid circular dependencies"""
    from .models import Notification
    return Notification


def get_notification_preference_model():
    """Lazy import to avoid circular dependencies"""
    from .models import NotificationPreference
    return NotificationPreference


def get_notification_outbox_model():
    """Lazy import to avoid circular dependencies"""
    from .models import NotificationOutbox
    return NotificationOutbox


def get_webpush_subscription_model():
    """Lazy import to avoid circular dependencies"""
    from .models import WebPushSubscription
    return WebPushSubscription


def get_user_model():
    """Get the user model"""
    from django.contrib.auth import get_user_model
    return get_user_model()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_notification(self, user_id: int, title: str, message: str):
    """
    Send email notification to a user.

    Args:
        user_id: User ID to send notification to
        title: Email subject
        message: Email body
    """
    try:
        User = get_user_model()
        user = User.objects.get(id=user_id)

        if not user.email:
            logger.warning(f"User {user_id} has no email address")
            return False

        send_mail(
            subject=f"{settings.EMAIL_SUBJECT_PREFIX}{title}",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        logger.info(f"Email notification sent to {user.email}: {title}")
        return True

    except User.DoesNotExist:
        logger.error(f"User {user_id} not found")
        return False

    except Exception as exc:
        logger.error(f"Failed to send email to user {user_id}: {exc}")
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_push_notification(self, user_id: int, title: str, message: str, notification_type: str = 'info'):
    """
    Send push notification to all user's subscribed devices.

    Args:
        user_id: User ID to send notification to
        title: Notification title
        message: Notification message
        notification_type: Type of notification (info, warning, success, error)
    """
    try:
        from pywebpush import webpush, WebPushException

        WebPushSubscription = get_webpush_subscription_model()
        subscriptions = WebPushSubscription.objects.filter(
            user_id=user_id,
            active=True
        )

        if not subscriptions.exists():
            logger.info(f"No active push subscriptions for user {user_id}")
            return 0

        # Check if VAPID keys are configured
        if not settings.WEBPUSH_VAPID_PRIVATE_KEY or not settings.WEBPUSH_VAPID_PUBLIC_KEY:
            logger.error("VAPID keys not configured")
            return 0

        payload = json.dumps({
            'title': title,
            'message': message,
            'type': notification_type,
            'timestamp': timezone.now().isoformat(),
        })

        sent_count = 0
        failed_subscriptions = []

        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info={
                        'endpoint': subscription.endpoint,
                        'keys': {
                            'p256dh': subscription.p256dh,
                            'auth': subscription.auth,
                        }
                    },
                    data=payload,
                    vapid_private_key=settings.WEBPUSH_VAPID_PRIVATE_KEY,
                    vapid_claims={
                        'sub': settings.WEBPUSH_VAPID_SUBJECT,
                    }
                )
                sent_count += 1
                logger.info(f"Push notification sent to subscription {subscription.id}")

            except WebPushException as e:
                logger.error(f"Push notification failed for subscription {subscription.id}: {e}")
                # If subscription is expired or invalid, mark as inactive
                if e.response and e.response.status_code in [404, 410]:
                    failed_subscriptions.append(subscription.id)

        # Deactivate failed subscriptions
        if failed_subscriptions:
            WebPushSubscription.objects.filter(id__in=failed_subscriptions).update(active=False)
            logger.info(f"Deactivated {len(failed_subscriptions)} invalid subscriptions")

        return sent_count

    except Exception as exc:
        logger.error(f"Failed to send push notification to user {user_id}: {exc}")
        raise self.retry(exc=exc)


@shared_task
def auto_advance_orders(limit: int = 50):
    """
    Automatically advance POS orders whose auto-advance timers have elapsed.
    Returns the number of orders processed in this run.
    """
    from django.utils import timezone as dj_timezone

    try:
        from .models import Order
        from .views_orders import (
            canonical_status,
            can_transition,
            _auto_next_status,
            _start_auto_flow,
            _clear_auto_flow,
            _safe_order,
            recalc_order_counters,
            record_order_event,
            publish_event,
        )
    except Exception as exc:
        logger.error(f"Auto advance initialization failed: {exc}")
        return 0

    now_ts = dj_timezone.now()
    pending_ids = list(
        Order.objects.filter(
            auto_advance_paused=False,
            auto_advance_at__isnull=False,
            auto_advance_at__lte=now_ts,
        )
        .exclude(status__in={"completed", "cancelled", "voided", "refunded"})
        .values_list("id", flat=True)[: max(1, int(limit or 50))]
    )

    processed = 0

    for order_id in pending_ids:
        try:
            with transaction.atomic():
                order = (
                    Order.objects.select_for_update()
                    .select_related("placed_by")
                    .prefetch_related("items__menu_item")
                    .get(id=order_id)
                )

                if order.auto_advance_paused:
                    continue

                now_inner = dj_timezone.now()
                if not order.auto_advance_at or order.auto_advance_at > now_inner:
                    continue

                target_status = order.auto_advance_target or _auto_next_status(order.status)
                if not target_status:
                    clear_fields = _clear_auto_flow(order, reason="auto_no_target")
                    if clear_fields:
                        if "updated_at" not in clear_fields:
                            clear_fields.append("updated_at")
                        order.save(update_fields=clear_fields)
                    continue

                current_canonical = canonical_status(order.status)
                target_canonical = canonical_status(target_status)

                if not can_transition(current_canonical, target_canonical):
                    clear_fields = _clear_auto_flow(order, reason="auto_invalid_transition")
                    if clear_fields:
                        if "updated_at" not in clear_fields:
                            clear_fields.append("updated_at")
                        order.save(update_fields=clear_fields)
                    continue

                previous_status = order.status
                order.status = target_status
                update_fields = ["status", "updated_at"]

                if target_canonical == "completed":
                    order.completed_at = now_inner
                    update_fields.append("completed_at")

                auto_fields = _start_auto_flow(order, now=now_inner)
                if auto_fields:
                    update_fields.extend(auto_fields)

                # Deduplicate update fields while preserving order
                update_fields = list(dict.fromkeys(update_fields))
                order.save(update_fields=update_fields)

                if target_canonical in {"staged", "handoff"} and current_canonical not in {
                    "staged",
                    "handoff",
                }:
                    try:
                        from .notification_triggers import trigger_order_ready_for_pickup

                        trigger_order_ready_for_pickup(order)
                    except Exception:
                        pass

                try:
                    recalc_order_counters(order)
                except Exception:
                    pass

                order.refresh_from_db()
                order_payload = _safe_order(order)

                record_order_event(
                    order,
                    event_type="order.auto_advanced",
                    from_state=current_canonical,
                    to_state=canonical_status(order.status),
                    actor=None,
                    payload={
                        "previousStatus": previous_status,
                        "nextStatus": order.status,
                        "autoAdvanceAt": order_payload.get("autoAdvanceAt"),
                    },
                )

                publish_event(
                    "order.status_changed",
                    {"order": order_payload, "status": canonical_status(order.status)},
                    roles={"admin", "manager", "staff"},
                    user_ids=[str(order.placed_by_id)] if getattr(order, "placed_by_id", None) else None,
                )

                processed += 1
        except Order.DoesNotExist:
            continue
        except Exception as exc:
            logger.error(f"Failed to auto advance order {order_id}: {exc}")
            continue

    return processed


@shared_task
def process_notification_outbox():
    """
    Process pending notifications in the outbox.
    Sends notifications via email and/or push based on user preferences.
    """
    NotificationOutbox = get_notification_outbox_model()
    NotificationPreference = get_notification_preference_model()

    # Get pending notifications (max 100 per run to avoid overload)
    pending = NotificationOutbox.objects.filter(
        status='pending',
        attempts__lt=5,  # Max 5 attempts
    ).order_by('created_at')[:100]

    if not pending:
        logger.debug("No pending notifications to process")
        return 0

    processed_count = 0

    for outbox_item in pending:
        try:
            with transaction.atomic():
                # Update attempts
                outbox_item.attempts += 1
                outbox_item.save(update_fields=['attempts', 'updated_at'])

                # Get user preferences
                try:
                    prefs = NotificationPreference.objects.get(user_id=outbox_item.user_id)
                except NotificationPreference.DoesNotExist:
                    # Create default preferences
                    prefs = NotificationPreference.objects.create(
                        user_id=outbox_item.user_id,
                        email_enabled=True,
                        push_enabled=False,
                    )

                # Send email if enabled
                if prefs.email_enabled:
                    send_email_notification.delay(
                        user_id=outbox_item.user_id,
                        title=outbox_item.title,
                        message=outbox_item.message,
                    )

                # Send push if enabled
                if prefs.push_enabled:
                    send_push_notification.delay(
                        user_id=outbox_item.user_id,
                        title=outbox_item.title,
                        message=outbox_item.message,
                        notification_type='info',
                    )

                # Mark as sent
                outbox_item.status = 'sent'
                outbox_item.save(update_fields=['status', 'updated_at'])
                processed_count += 1

        except Exception as e:
            logger.error(f"Failed to process outbox item {outbox_item.id}: {e}")
            outbox_item.status = 'failed'
            outbox_item.last_error = str(e)
            outbox_item.save(update_fields=['status', 'last_error', 'updated_at'])

    logger.info(f"Processed {processed_count} notifications from outbox")
    return processed_count


@shared_task
def cleanup_old_notifications():
    """
    Clean up old read notifications (older than 30 days).
    Keep unread notifications indefinitely.
    """
    Notification = get_notification_model()

    cutoff_date = timezone.now() - timedelta(days=30)

    deleted_count, _ = Notification.objects.filter(
        read=True,
        created_at__lt=cutoff_date
    ).delete()

    logger.info(f"Cleaned up {deleted_count} old notifications")
    return deleted_count


def create_notification_sync(
    user_id: int,
    title: str,
    message: str,
    notification_type: str = 'info',
    meta: Optional[Dict[str, Any]] = None,
    send_immediately: bool = True
):
    """
    Create a notification synchronously (without Celery).

    Args:
        user_id: User ID to send notification to
        title: Notification title
        message: Notification message
        notification_type: Type of notification (info, warning, success, error)
        meta: Additional metadata (optional)
        send_immediately: If True, send via email/push immediately. If False, add to outbox.
    """
    Notification = get_notification_model()
    NotificationOutbox = get_notification_outbox_model()

    try:
        # Create in-app notification
        notification = Notification.objects.create(
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type,
            meta=meta or {},
            read=False,
        )

        logger.info(f"Created notification {notification.id} for user {user_id}")

        # Add to outbox for email/push delivery
        if send_immediately:
            NotificationOutbox.objects.create(
                user_id=user_id,
                title=title,
                message=message,
                status='pending',
            )

        return str(notification.id)

    except Exception as e:
        logger.error(f"Failed to create notification for user {user_id}: {e}")
        raise


@shared_task
def create_notification(
    user_id: int,
    title: str,
    message: str,
    notification_type: str = 'info',
    meta: Optional[Dict[str, Any]] = None,
    send_immediately: bool = True
):
    """
    Create a notification and optionally send it immediately.

    Args:
        user_id: User ID to send notification to
        title: Notification title
        message: Notification message
        notification_type: Type of notification (info, warning, success, error)
        meta: Additional metadata (optional)
        send_immediately: If True, send via email/push immediately. If False, add to outbox.
    """
    return create_notification_sync(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        meta=meta,
        send_immediately=send_immediately
    )
