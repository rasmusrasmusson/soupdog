from django import forms
from .models import Product, Group, Program, Task, TaskIngredient, TaskList, TaskListMatch, TaskComponent, ToolCategory, Tools, EndProductUsage

choices = [('coding', 'coding'), ('sports', 'sports'), ('entertainment', 'entertainment'),]
#choices = Category.objects.all().values_list('name', 'name')

#PRODUCT#
class ProductForm(forms.ModelForm):
	class Meta:
		model = Product
		fields = ('name', 'author', 'description','surface_temp', 'core_temp','volume', 'mass', 'quantity', 'product_image')
		widgets = {
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'author': forms.Select(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
			'surface_temp': forms.TextInput(attrs={'class': 'form-control'}),
			'core_temp': forms.TextInput(attrs={'class': 'form-control'}),
			'volume': forms.TextInput(attrs={'class': 'form-control'}),
			'mass': forms.TextInput(attrs={'class': 'form-control'}),
			'quantity': forms.TextInput(attrs={'class': 'form-control'}),
		}


class ToolCategoryForm(forms.ModelForm):
    class Meta:
        model = ToolCategory
        fields = ['name', 'parent']
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['parent'].queryset = ToolCategory.objects.exclude(
            id__in=self.instance.get_descendants(include_self=True)
        )

class EditProductForm(forms.ModelForm):
	class Meta:
		model = Product
		fields = ('name', 'description', 'surface_temp', 'core_temp','volume', 'mass', 'quantity', 'barcode', 'product_image')
		widgets = {
			#'program': forms.Select(attrs={'class': 'form-control'}),
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
			'surface_temp': forms.TextInput(attrs={'class': 'form-control'}),
			'core_temp': forms.TextInput(attrs={'class': 'form-control'}),
			'volume': forms.TextInput(attrs={'class': 'form-control'}),
			'mass': forms.TextInput(attrs={'class': 'form-control'}),
			'quantity': forms.TextInput(attrs={'class': 'form-control'}),
			'barcode': forms.TextInput(attrs={'class': 'form-control'}),			
		}

class EpForm(forms.ModelForm):
	class Meta:
		model = EndProductUsage
		fields = ('task_list', 'end_product', 'used_in_task', 'felix')
		widgets = {
			#'program': forms.Select(attrs={'class': 'form-control'}),
			'task_list': forms.TextInput(attrs={'class': 'form-control'}),
			'end_product': forms.Textarea(attrs={'class': 'form-control'}),
			'used_in_task': forms.TextInput(attrs={'class': 'form-control'}),
			'felix': forms.TextInput(attrs={'class': 'form-control'}),
		}

#TOOLS#
class ToolForm(forms.ModelForm):
	class Meta:
		model = Tools
		fields = ('name', 'description','image1', 'author_id','parent_id')
		widgets = {
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
			'image1': forms.TextInput(attrs={'class': 'form-control'}),
			'author_id': forms.TextInput(attrs={'class': 'form-control'}),
			'parent_id': forms.TextInput(attrs={'class': 'form-control'}),
		}

class EditToolForm(forms.ModelForm):
	class Meta:
		model = Tools
		fields = ('name', 'description','image1', 'author_id','parent_id')
		widgets = {
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
			'image1': forms.TextInput(attrs={'class': 'form-control'}),
			'author_id': forms.TextInput(attrs={'class': 'form-control'}),
			'parent_id': forms.TextInput(attrs={'class': 'form-control'}),			
		}


#GROUPS#
class GroupForm(forms.ModelForm):
	class Meta:
		model = Group
		fields = ('name', 'author', 'description')
		widgets = {
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'author': forms.Select(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
		}

class EditGroupForm(forms.ModelForm):
	class Meta:
		model = Group
		fields = ('name', 'author', 'description')
		widgets = {
			'name': forms.TextInput(attrs={'class': 'form-control'}),
			'author': forms.Select(attrs={'class': 'form-control'}),
			'description': forms.Textarea(attrs={'class': 'form-control'}),
		}

#PROGRAMS#
class ProgramForm(forms.ModelForm):
	class Meta:
		model = Program
		fields = ('author', 'name', 'version', 'product')
		widgets = {
			'author': forms.Select(attrs={'class': 'form-control'}),
			'version': forms.TextInput(attrs={'class': 'form-control'}),
			#'product': forms.TextInput(attrs={'class': 'form-control'}),
			#'product': forms.HiddenInput()
		}

class EditProgramForm(forms.ModelForm):
	class Meta:
		model = Program
		fields = ('author', 'version', 'product')
		widgets = {
			'author': forms.Select(attrs={'class': 'form-control'}),
			'version': forms.TextInput(attrs={'class': 'form-control'}),
			'product': forms.Select(choices=choices, attrs={'class': 'form-control'}),
		}

#TASKS#
class TaskForm(forms.ModelForm):
	class Meta:
		model = Task
		fields = ('author', 'type')
		widgets = {
			'author': forms.Select(attrs={'class': 'form-control'}),
			'type': forms.TextInput(attrs={'class': 'form-control'}),
			}


class AddTaskIngredientForm(forms.ModelForm):
	class Meta:
		model = TaskIngredient
		fields = ('task', 'product', 'mass', 'volume', 'quantity')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			'product': forms.Select(attrs={'class': 'form-control'}),
			'mass': forms.TextInput(attrs={'class': 'form-control'}),
			'volume': forms.TextInput(attrs={'class': 'form-control'}),
			'quantity': forms.TextInput(attrs={'class': 'form-control'}),
		}

class EditTaskForm(forms.ModelForm):
	class Meta:
		model = Task
		fields = ('author', 'type')
		widgets = {
			'author': forms.Select(attrs={'class': 'form-control'}),
			'type': forms.TextInput(attrs={'class': 'form-control'}),			
		}

#TASK LIST#
class TaskListForm(forms.ModelForm):
	class Meta:
		model = TaskList
		fields = ('product', 'channel')
		widgets = {
			'product': forms.Select(choices=choices, attrs={'class': 'form-control'}),
			'channel': forms.TextInput(attrs={'class': 'form-control'}),
		}

class AddExistingTaskForm(forms.ModelForm):
	class Meta:
		model = TaskListMatch
		fields = ('task_list', 'task', 'order')
		widgets = {
			'task_list': forms.Select(choices=choices, attrs={'class': 'form-control'}),
			'task': forms.Select(choices=choices, attrs={'class': 'form-control'}),
			'order': forms.TextInput(attrs={'class': 'form-control'}),
		}

#TASK COMPONENTS#
class AddTaskComponentForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'product', 'tool', 'text', 'setting_1', 'setting_2', 'time')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			#'task': forms.HiddenInput(),
			'product': forms.Select(attrs={'class': 'form-control'}),
			'tool': forms.Select(attrs={'class': 'form-control'}),
			'text': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_1': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_2': forms.TextInput(attrs={'class': 'form-control'}),
			'time': forms.TextInput(attrs={'class': 'form-control'}),
			#'author': forms.HiddenInput(),
			#'program': forms.HiddenInput(),
			#'product': forms.HiddenInput(),
		}

class AddIngredientForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'product')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			#'task': forms.HiddenInput(),
			'product': forms.Select(attrs={'class': 'form-control'}),
		}

class AddToolForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'tool', 'setting_1', 'setting_2', 'time')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			'tool': forms.Select(attrs={'class': 'form-control','required': 'true'}),
			'setting_1': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_2': forms.TextInput(attrs={'class': 'form-control'}),
			'time': forms.TextInput(attrs={'class': 'form-control'}),
		}

class AddInstructionForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'text')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			'text': forms.TextInput(attrs={'class': 'form-control'}),
		}		

class EditTaskComponentForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'product', 'tool', 'text', 'setting_1', 'setting_2', 'time')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			#'task': forms.HiddenInput(),
			'product': forms.Select(attrs={'class': 'form-control'}),
			'tool': forms.Select(attrs={'class': 'form-control'}),
			'text': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_1': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_2': forms.TextInput(attrs={'class': 'form-control'}),
			'time': forms.TextInput(attrs={'class': 'form-control'}),
			#'author': forms.HiddenInput(),
			#'program': forms.HiddenInput(),
			#'product': forms.HiddenInput(),
		}

class EditTaskToolForm(forms.ModelForm):
	class Meta:
		model = TaskComponent
		fields = ('task', 'tool', 'setting_1', 'setting_2', 'time')
		widgets = {
			'task': forms.Select(attrs={'class': 'form-control'}),
			'tool': forms.Select(attrs={'class': 'form-control'}),
			'setting_1': forms.TextInput(attrs={'class': 'form-control'}),
			'setting_2': forms.TextInput(attrs={'class': 'form-control'}),
			'time': forms.TextInput(attrs={'class': 'form-control'}),
		}

class ToolCategoryForm(forms.ModelForm):
	class Meta:
		model = ToolCategory
		fields = ['name', 'parent']
	
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		# Exclude the current instance from parent choices to prevent circular references
		if self.instance and self.instance.pk:
			self.fields['parent'].queryset = ToolCategory.objects.exclude(
				pk=self.instance.pk
			).exclude(
				parent__pk=self.instance.pk  # Also exclude descendants
			)

#choices = [('coding', 'coding'), ('sports', 'sports'), ('entertainment', 'entertainment'),]
#choices = Category.objects.all().values_list('name','name')
#choice_list = []
#for item in choices:
#	choice_list.append(item)

#class PostForm(forms.ModelForm):
#	class Meta:
#		model = Post
#		fields = ('title', 'title_tag', 'author', 'category', 'body')

#		widgets = {
#			'title': forms.TextInput(attrs={'class': 'form-control'}),
#			'title_tag': forms.TextInput(attrs={'class': 'form-control', 'placeholder': choices}),
#			'author': forms.Select(attrs={'class': 'form-control'}),
#			'category': forms.Select(choices=choice_list, attrs={'class': 'form-control'}),
			#'category': forms.Select(choices=choices, attrs={'class': 'form-control'}),
#			'body': forms.Textarea(attrs={'class': 'form-control'}),
#		}
