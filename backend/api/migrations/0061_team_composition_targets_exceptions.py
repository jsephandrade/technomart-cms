from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0060_cateringpackage_cateringpackageitem_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="TeamCompositionTarget",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("day", models.CharField(max_length=16)),
                ("role", models.CharField(max_length=64)),
                ("target_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="team_composition_targets_created",
                        to="api.appuser",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="team_composition_targets_updated",
                        to="api.appuser",
                    ),
                ),
            ],
            options={
                "db_table": "team_composition_target",
            },
        ),
        migrations.CreateModel(
            name="TeamCompositionException",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("day", models.CharField(max_length=16)),
                ("role", models.CharField(max_length=64)),
                ("message", models.TextField(blank=True)),
                ("requested_by_label", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "requested_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="team_composition_exceptions",
                        to="api.appuser",
                    ),
                ),
            ],
            options={
                "db_table": "team_composition_exception",
            },
        ),
        migrations.AddConstraint(
            model_name="teamcompositiontarget",
            constraint=models.UniqueConstraint(
                fields=("day", "role"),
                name="team_composition_target_day_role_uniq",
            ),
        ),
        migrations.AddIndex(
            model_name="teamcompositiontarget",
            index=models.Index(fields=["day", "role"], name="team_comp_target_day_role_idx"),
        ),
        migrations.AddIndex(
            model_name="teamcompositionexception",
            index=models.Index(fields=["day", "role"], name="team_comp_exc_day_role_idx"),
        ),
        migrations.AddIndex(
            model_name="teamcompositionexception",
            index=models.Index(fields=["created_at"], name="team_comp_exc_created_idx"),
        ),
    ]
