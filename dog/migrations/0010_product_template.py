# Generated by Django 4.2.18 on 2025-02-22 17:39

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dog', '0009_alter_task_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='template',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
