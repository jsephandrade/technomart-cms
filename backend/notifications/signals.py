from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from api.models import Notification
from api.models import MenuItem  # assuming MenuItem is in api.models

User = get_user_model()

def _notify_all_users(*, title: str, message: str, ntype: str) -> None:
    try:
        user_ids = list(User.objects.values_list("id", flat=True))
        if not user_ids:
            return
        Notification.objects.bulk_create(
            [
                Notification(
                    user_id=user_id,
                    title=title,
                    message=message,
                    type=ntype,
                )
                for user_id in user_ids
            ],
            batch_size=500,
        )
    except Exception:
        # Notifications should never break primary app flows.
        try:
            for user in User.objects.all():
                try:
                    Notification.objects.create(
                        user=user,
                        title=title,
                        message=message,
                        type=ntype,
                    )
                except Exception:
                    continue
        except Exception:
            pass

# MenuItem created or updated
@receiver(post_save, sender=MenuItem)
def menuitem_post_save(sender, instance, created, **kwargs):
    try:
        if kwargs.get("raw"):
            return

        update_fields = kwargs.get("update_fields") or None
        if update_fields:
            update_fields = {str(f) for f in update_fields}
            # Archive/restore flows toggle `archived` and `archived_at` and should not
            # be treated as "sold out" changes.
            if {"archived", "archived_at"} & update_fields:
                return

        if created:
            _notify_all_users(
                title="New Menu Item Added",
                message=f"{instance.name} is now available!",
                ntype=Notification.TYPE_SUCCESS,
            )
            return

        # "Sold out" = item marked unavailable (availability endpoint / manual toggle).
        # Only run when availability is part of the update (when update_fields is known).
        if update_fields and "available" not in update_fields:
            return

        if getattr(instance, "available", True) is False:
            _notify_all_users(
                title="Menu Item Sold Out",
                message=f"{instance.name} is now sold out!",
                ntype=Notification.TYPE_WARNING,
            )
    except Exception:
        # Signals must not crash requests (e.g., restore/archive endpoints).
        return

# MenuItem deleted
@receiver(post_delete, sender=MenuItem)
def menuitem_post_delete(sender, instance, **kwargs):
    try:
        if kwargs.get("raw"):
            return
        _notify_all_users(
            title="Menu Item Removed",
            message=f"{instance.name} has been removed from the menu.",
            ntype=Notification.TYPE_ERROR,
        )
    except Exception:
        return
