from django.db import migrations, models
import uuid
import api.models


class Migration(migrations.Migration):

    dependencies = [
        ("api", "0065_remove_employee_hourly_rate"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("unpaid", "Unpaid"),
                    ("pending", "Pending Verification"),
                    ("paid", "Paid"),
                    ("rejected", "Rejected"),
                ],
                default="unpaid",
                max_length=16,
            ),
        ),
        migrations.CreateModel(
            name="PaymentProof",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("amount", models.DecimalField(max_digits=12, decimal_places=2)),
                ("reference_number", models.CharField(max_length=64, blank=True)),
                ("proof_image", models.ImageField(upload_to=api.models._payment_proof_upload_path)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("verified", "Verified"), ("rejected", "Rejected")], default="pending", max_length=16)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("reviewed_notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("order", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="payment_proofs", to="api.order")),
                ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="payment_proofs_reviewed", to="api.appuser")),
                ("submitted_by", models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="payment_proofs", to="api.appuser")),
            ],
            options={
                "db_table": "payment_proof",
                "indexes": [
                    models.Index(fields=["order", "status"], name="payment_proof_order_status_idx"),
                    models.Index(fields=["status", "created_at"], name="payment_proof_status_created_idx"),
                ],
            },
        ),
    ]
