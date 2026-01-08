from rest_framework import serializers
from decimal import Decimal
from api.models import CateringEvent, CateringEventItem
from api.catering_packages import apply_catering_package

class CateringEventItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CateringEventItem
        fields = ["id", "name", "quantity", "unit_price", "notes", "menu_item"]

class CateringEventSerializer(serializers.ModelSerializer):
    items = CateringEventItemSerializer(many=True, required=False)

    class Meta:
        model = CateringEvent
        fields = "__all__"

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        package = validated_data.pop("package", None)
        validated_data.pop("package_snapshot", None)
        validated_data.pop("package_name", None)
        validated_data.pop("package_price_per_pax", None)
        discount = Decimal(validated_data.get("order_discount", 0) or 0)
        deposit = Decimal(validated_data.get("deposit_amount", 0) or 0)

        # Create event (but total not set yet)
        event = CateringEvent.objects.create(**validated_data)

        if package:
            apply_catering_package(
                event,
                package,
                guest_count=event.guest_count,
                actor_id=getattr(event.created_by, "id", None),
                use_item_price=False,
            )
            return event

        subtotal = Decimal("0.00")
        for item in items_data:
            price = Decimal(item.get("unit_price", 0) or 0)
            qty = Decimal(item.get("quantity", 0) or 0)

            line_total = price * qty
            subtotal += line_total

            CateringEventItem.objects.create(event=event, **item)

        # Final Calculation
        estimated_total = subtotal - discount

        # Update total AFTER items saved
        event.estimated_total = estimated_total
        event.save()

        return event
