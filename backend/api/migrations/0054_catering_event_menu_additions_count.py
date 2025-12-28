from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0053_role_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="cateringevent",
            name="menu_additions_count",
            field=models.PositiveSmallIntegerField(
                default=0, help_text="Number of post-save menu updates"
            ),
        ),
    ]
