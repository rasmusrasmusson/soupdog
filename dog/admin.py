from django.contrib import admin
from .models import Product, Group, Task, TaskIngredient, Program, Tools, TaskTool

admin.site.register(Product)
admin.site.register(Group)
admin.site.register(Task)
admin.site.register(TaskIngredient)
admin.site.register(Program)
admin.site.register(Tools)
admin.site.register(TaskTool)