from decimal import Decimal, ROUND_CEILING

from django.db import transaction

from .models import CateringEventItem


def _decimal(value, default=Decimal("0")):
    if value is None or value == "":
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _calculate_quantity(qty_per_pax, guest_count):
    qty = _decimal(qty_per_pax)
    if qty <= 0 or guest_count <= 0:
        return 0
    total = qty * Decimal(guest_count)
    return int(total.to_integral_value(rounding=ROUND_CEILING))


def apply_catering_package(
    event,
    package,
    *,
    guest_count=None,
    actor_id=None,
    use_item_price=False,
):
    resolved_guest_count = guest_count if guest_count is not None else event.guest_count
    try:
        resolved_guest_count = int(resolved_guest_count or 0)
    except Exception:
        resolved_guest_count = 0
    resolved_guest_count = max(0, resolved_guest_count)

    price_per_pax = _decimal(getattr(package, "price_per_pax", 0))
    items_snapshot = []
    package_items = list(package.items.select_related("menu_item").all())

    with transaction.atomic():
        event.items.all().delete()
        for pkg_item in package_items:
            qty_per_pax = _decimal(getattr(pkg_item, "quantity_per_pax", 0))
            quantity = _calculate_quantity(qty_per_pax, resolved_guest_count)
            if quantity <= 0:
                continue
            menu_item = getattr(pkg_item, "menu_item", None)
            fallback_name = menu_item.name if menu_item else ""
            name = (pkg_item.name or fallback_name or "Item").strip()
            unit_price = _decimal(menu_item.price if (menu_item and use_item_price) else 0)

            CateringEventItem.objects.create(
                event=event,
                menu_item=menu_item,
                name=name,
                quantity=quantity,
                unit_price=unit_price,
                notes=pkg_item.notes or "",
            )
            items_snapshot.append(
                {
                    "menuItemId": str(menu_item.id) if menu_item else None,
                    "name": name,
                    "quantityPerPax": float(qty_per_pax),
                    "notes": pkg_item.notes or "",
                }
            )

        event.package = package
        event.package_name = package.name
        event.package_price_per_pax = price_per_pax
        event.package_snapshot = items_snapshot
        event.estimated_total = price_per_pax * Decimal(resolved_guest_count)
        event.deposit_amount = event.estimated_total * Decimal("0.5")
        event.guest_count = resolved_guest_count
        if actor_id:
            event.updated_by_id = actor_id
        event.save(
            update_fields=[
                "package",
                "package_name",
                "package_price_per_pax",
                "package_snapshot",
                "estimated_total",
                "deposit_amount",
                "guest_count",
                "updated_by",
                "updated_at",
            ]
        )

    return event
