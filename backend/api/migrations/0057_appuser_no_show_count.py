from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0056_checkout_session"),
    ]

    operations = [
        migrations.AddField(
            model_name="appuser",
            name="no_show_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
