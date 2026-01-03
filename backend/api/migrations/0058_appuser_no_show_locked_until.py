from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0057_appuser_no_show_count"),
    ]

    operations = [
        migrations.AddField(
            model_name="appuser",
            name="no_show_locked_until",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
