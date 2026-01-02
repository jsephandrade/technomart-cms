from django.db import migrations, models
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0055_alter_roleconfig_id"),
    ]

    operations = [
        migrations.CreateModel(
            name="CheckoutSession",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)),
                ("order_id", models.UUIDField(blank=True, null=True)),
                ("order_number", models.CharField(max_length=32, blank=True)),
                (
                    "status",
                    models.CharField(
                        max_length=16,
                        choices=[
                            ("pending", "Pending"),
                            ("awaiting_cash", "Awaiting Cash"),
                            ("paid", "Paid"),
                            ("finalized", "Finalized"),
                            ("expired", "Expired"),
                        ],
                        default="pending",
                    ),
                ),
                ("subtotal", models.DecimalField(max_digits=12, decimal_places=2, default=0)),
                ("discount", models.DecimalField(max_digits=12, decimal_places=2, default=0)),
                ("total_amount", models.DecimalField(max_digits=12, decimal_places=2, default=0)),
                ("credit_points_used", models.DecimalField(max_digits=10, decimal_places=2, default=0)),
                ("order_type", models.CharField(max_length=32, blank=True)),
                ("customer_name", models.CharField(max_length=255, blank=True)),
                ("promised_time", models.DateTimeField(blank=True, null=True)),
                ("payload", models.JSONField(default=dict, blank=True)),
                ("idempotency_key", models.CharField(max_length=64, blank=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        to="api.appuser",
                        null=True,
                        blank=True,
                        on_delete=models.SET_NULL,
                        related_name="checkout_sessions",
                    ),
                ),
            ],
            options={
                "db_table": "checkout_session",
                "indexes": [
                    models.Index(fields=["status", "created_at"], name="checkout_status_created_idx"),
                    models.Index(fields=["order_number"], name="checkout_order_number_idx"),
                    models.Index(fields=["idempotency_key"], name="checkout_idempotency_idx"),
                ],
            },
        ),
    ]
