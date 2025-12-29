from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0054_catering_event_menu_additions_count"),
    ]

    operations = [
        migrations.AlterField(
            model_name="roleconfig",
            name="id",
            field=models.BigAutoField(
                auto_created=True,
                primary_key=True,
                serialize=False,
                verbose_name="ID",
            ),
        ),
    ]
