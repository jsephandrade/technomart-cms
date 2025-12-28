from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0052_auditlog_alert_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoleConfig",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("value", models.CharField(max_length=32, unique=True)),
                ("label", models.CharField(max_length=64)),
                ("description", models.TextField(blank=True)),
                ("permissions", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "role_config",
            },
        ),
        migrations.AddIndex(
            model_name="roleconfig",
            index=models.Index(fields=["value"], name="role_config_value_idx"),
        ),
    ]
