# Generated by Django 4.2.18 on 2025-02-09 07:31

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dog', '0002_taskcomponent_text'),
    ]

    operations = [
        migrations.AddField(
            model_name='task',
            name='setting_1',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='task',
            name='setting_2',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='task',
            name='time',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
