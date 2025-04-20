import json
from django.shortcuts import render, get_object_or_404, redirect
from django.views import View
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.views.generic.detail import SingleObjectMixin
from django.contrib import messages
from .models import Product, Group, Program, Task, TaskIngredient, TaskList, TaskListMatch, TaskComponent, Tools, EndProductUsage, ToolCategory
from .forms import ProductForm, EditProductForm, GroupForm, EditGroupForm, ProgramForm, EditProgramForm, TaskForm, EditTaskForm, AddTaskIngredientForm, TaskListForm, AddExistingTaskForm, AddTaskComponentForm, EditTaskComponentForm, ToolForm, EditToolForm, AddIngredientForm, AddToolForm, AddInstructionForm, EditTaskToolForm, EpForm
from django.urls import reverse_lazy, reverse
from django.http import HttpResponseRedirect
from django.forms import inlineformset_factory

#def home(request):
#	return render(request, 'home.html', {})

##GENERAL##
class HomeView(ListView):
	model = TaskList
	template_name = 'home.html'
	#ordering = ['-id'] can later be used to show the latest updated groups.

##GROUPS##
class GroupView(ListView):
	model = Product
	template_name = 'group.html'
	ordering = ['-edit_date']

class GroupDetailView(DetailView):
	model = Group
	template_name = 'group.html'

class AddGroupView(CreateView):
	model = Group
	form_class = GroupForm
	template_name = 'add_group.html'

class EditGroupView(UpdateView):
	model = Group
	form_class = EditGroupForm	
	template_name = 'edit_group.html'		

class AddProductToGroup(ListView):
	model = Product
	template_name = 'add_product_to_group.html'

##PRODUCTS##
class ProductView(DetailView):
	model = Product
	template_name = 'product.html'

class AddProductView(CreateView):
	model = Product	
	form_class = ProductForm
	template_name = 'add_product.html'

class EditProductView(UpdateView):
	model = Product
	form_class = EditProductForm	
	template_name = 'edit_product.html'	

class DeleteProductView(DeleteView):
	model = Product
	template_name = 'delete_product.html'
	success_url = reverse_lazy('home')

def AddProduct2(request, task, tasklist): #Later change this to AddIngredient
	return render(request, 'add_product_2.html', {'task': task, 'tasklist': tasklist})

def EditIngredient(request, component, tasklist):
	ingredient = TaskComponent.objects.get(id=component)
	ingredient = Product.objects.get(id=ingredient.product_id)
	return render(request, 'edit_ingredient.html', {'component': component, 'tasklist': tasklist, 'ingredient': ingredient })

def ProductMatch(request, task, tasklist):
	task = Task.objects.get(id=task)
	task = task.id
	tasklist = TaskList.objects.get(id=tasklist)
	tasklist = tasklist.id

	if request.method == "POST":
		product_name = None
		description = ""
		mass = None
		volume = None
		quantity = None
		#template = None

		if request.POST['product_name']:
			product_name = request.POST['product_name']
		if request.POST['description']:
			description = request.POST['description']
		if request.POST['mass']:
			mass = request.POST['mass']
		if request.POST['volume']:
			volume = request.POST['volume']
		if request.POST['quantity']:
			quantity = request.POST['quantity']
		#if request.POST['template']:
			#template = request.POST['template']										

		# ADD INGREDIENT TO A TASK
		product = Product.objects.filter(name=product_name, description=description, mass=mass, volume=volume, quantity=quantity).order_by('-template').values('id')[:1]		
		# Does product exist?
		# Yes: Add product to Task component.
		if product: 
			add_to_task = 'yes' #Remove
			new_product = 'no' #Remove
			n = TaskComponent.objects.create(task_id=task, product_id=product)
			
			# End product
			# Are all task components ingredients?
			task_component_all = TaskComponent.objects.filter(task_id=task).count() #How many components added to the task?
			task_component_ingredient = TaskComponent.objects.filter(task_id=task, tool_id__isnull=True, text__isnull=True).count() #How many components are only ingredients?
			if task_component_all == task_component_ingredient: #Checks if all components for the task are ingredients.

				#Set the ingredient as an end product.
				n = TaskComponent.objects.create(task_id=task, end_product_id=product) 

			# To task list view				
			return redirect('task_list_match_view' , tasklist)
			#n.save()

		# No. Create a new product.
		else:
			add_to_task = 'yes' #Remove
			new_product = 'yes' #Remove
			n = Product.objects.create(name=product_name, description=description, mass=mass, volume=volume, quantity=quantity)
			new_task = n.id

			# Add product to Task component.
			n = TaskComponent.objects.create(task_id=task, product_id=new_task)
			n = TaskComponent.objects.create(task_id=task, end_product_id=product) #if no other component exists for the task.

			# End product
			# Are all task components ingredients?
				# - Since the page reloads, I need to apply a different logic here than for when the product exists.

				#Set the ingredient as an end product.

			# To task list view				
			return redirect('task_list_match_view' , tasklist)

def EditIngredientCheck(request, component, tasklist):
	tasklist = TaskList.objects.get(id=tasklist)
	tasklist = tasklist.id
	component = TaskComponent.objects.get(id=component)
	component = component.product_id

	if request.method == "POST":
		product_name = None
		description = ""
		mass = None
		volume = None
		quantity = None

		if request.POST['product_name']:
			product_name = request.POST['product_name']
		if request.POST['description']:
			description = request.POST['description']
		if request.POST['mass']:
			mass = request.POST['mass']
		if request.POST['volume']:
			volume = request.POST['volume']
		if request.POST['quantity']:
			quantity = request.POST['quantity']
		Product.objects.filter(id=component).update(name=product_name, description=description, mass=mass, volume=volume, quantity=quantity)
		return redirect('task_list_match_view' , tasklist)

##TOOLS##
class ListToolsView(ListView):
	model = Tools
	template_name = 'list_tools.html'

class ToolView(DetailView):
	model = Tools
	template_name = 'tool.html'

def AddToolView(request, task, tasklist):

	return render(request, 'add_tool.html', {'tasklist': tasklist, 'task': task})

class EditToolView(View):
	def get(self, request, task, tasklist, tool):
		try:
			tool_obj = get_object_or_404(Tools, id=tool)
			task_obj = get_object_or_404(Task, id=task)
			tasklist_obj = get_object_or_404(TaskList, id=tasklist)

			# Get all categories and build a proper hierarchy
			all_categories = ToolCategory.objects.all().select_related('parent').prefetch_related('children')
			
			def build_hierarchy(categories, parent=None):
				hierarchy = []
				for category in categories:
					if category.parent == parent:
						node = {
							'id': category.id,
							'name': category.name,
							'children': build_hierarchy(categories, category)
						}
						hierarchy.append(node)
				return hierarchy

			# Build complete hierarchy
			full_hierarchy = build_hierarchy(all_categories)
			
			# Debug output
			print("Hierarchy structure:", json.dumps(full_hierarchy, indent=2))
			
			return render(request, 'edit_tool.html', {
				'tool': tool_obj,
				'task': task_obj,
				'tasklist': tasklist_obj,
				'kitchen_tools': json.dumps({
					'name': 'Kitchen Tools',
					'children': full_hierarchy
				}),
				'initial_categories': list(tool_obj.categories.values_list('name', flat=True)),
				'has_image': bool(tool_obj.image1)
			})
			
		except Exception as e:
			messages.error(request, f"Error loading tool: {str(e)}")
			return redirect('add_task_tool', tasklist=tasklist, task=task)

class AddTaskTool(View):
	def get(self, request, tasklist, task):
		all_tools = Tools.objects.all()
		task_obj = get_object_or_404(Task, id=task)
		tasklist_obj = get_object_or_404(TaskList, id=tasklist)

		return render(request, 'add_task_tool.html', {
			'all_tools': all_tools,
			'task': task_obj,
			'tasklist': tasklist_obj,
			'selected_tool': None
		})

	def post(self, request, tasklist, task):
		if 'select_tool' in request.POST:
			tool_id = request.POST.get('tool_id')
			tool = get_object_or_404(Tools, id=tool_id)
			task_obj = get_object_or_404(Task, id=task)

			task_obj.tool = tool
			task_obj.save()

			messages.success(request, f'Tool "{tool.name}" added to task successfully!')
			return redirect('task_detail', task_id=task)

		elif 'update_tool' in request.POST:
			try:
				tool_id = request.POST.get('tool_id')
				tool = get_object_or_404(Tools, id=tool_id)

				tool.name = request.POST.get('name')
				tool.description = request.POST.get('description')

				if 'image1' in request.FILES:
					tool.image1 = request.FILES['image1']

				tool.save()

				selected_categories = request.POST.get('categories', '').split(',')
				current_categories = set(tool.categories.values_list('name', flat=True))
				new_categories = set(selected_categories)

				for category_name in current_categories - new_categories:
					category = ToolCategory.objects.get(name=category_name)
					ToolCategoryMatch.objects.filter(tool=tool, category=category).delete()

				for category_name in new_categories - current_categories:
					if category_name:
						category = ToolCategory.objects.get(name=category_name)
						ToolCategoryMatch.objects.create(tool=tool, category=category)

				messages.success(request, 'Tool updated successfully!')
				return redirect('add_task_tool', tasklist=tasklist, task=task)

			except Exception as e:
				messages.error(request, f'Error updating tool: {str(e)}')
				return redirect('add_task_tool', tasklist=tasklist, task=task)

		return redirect('add_task_tool', tasklist=tasklist, task=task)

class DeleteToolView(DeleteView):
	model = Tools
	template_name = 'delete_tool.html'
	success_url = reverse_lazy('tool_list')

##PROGRAM##	
class ProgramView(DetailView):
	model = Program
	template_name = 'program.html'

def addProgram(request, pk):
	product = Product.objects.get(id=pk)
	product_name = product.name
	form = ProgramForm()
	if request.method == 'POST':
		form = ProgramForm(initial={'product':product})
		if form.is_valid():
			form.save()
			return redirect('program.html')
	context = {
		'form': form,
		'product_name': product_name,
		}
	return render(request, 'add_program.html', context)

class EditProgramView(UpdateView):
	model = Program
	form_class = TaskForm
	template_name = 'edit_program.html'	

##TASKS
def TaskView(request, pk):
	task_component = TaskComponent.objects.filter(task_id=pk)
	return render(request, 'task.html', {'pk': pk, 'task_component': task_component})
	def get_queryset(self):
		return self.object.ingredient.all()

class AddTaskIngredientView(CreateView):
	model = TaskIngredient
	form_class = AddTaskIngredientForm
	template_name = 'add_task_ingredient.html'

def DeleteTaskChoice(request, tasklist, tasklistmatch, task):
	task_count = TaskListMatch.objects.filter(task=task).count()
	if task_count > 1:
		return redirect('delete_task_from_list', tasklistmatch, tasklist)
	else:
		return redirect('delete_task_tasklistmatch', tasklistmatch, tasklist, task)
		#return render(request, 'delete_task_choice.html', {'tasklist': tasklist, "tasklistmatch": tasklistmatch, "task": task, "task_count": task_count})

def DeleteTaskTasklistmatch(request, tasklistmatch, tasklist, task):
	tasklistmatch = TaskListMatch.objects.get(id=tasklistmatch)
	tasklistmatch.delete()
	task = Task.objects.get(id=task)
	task.delete()	
	return HttpResponseRedirect(reverse('task_list_match_view', kwargs={"cats": tasklist}))

def EditTaskView(request, pk):
	task_component = TaskComponent.objects.filter(task_id=pk)
	form_class = EditTaskForm
	return render(request, 'edit_task.html', {'pk': pk, 'task_component': task_component})

def TaskIngredientView(request, pk):
	task_ingredients = Task.objects.filter(id=pk)

class DeleteTaskIngredientView(DeleteView):
	model = TaskIngredient
	template_name = 'delete_task_ingredient.html'
	success_url = reverse_lazy('edit_task', args=[str(6)])

##TASK LIST##
class AddTaskListView(CreateView):
	model = TaskList
	form_class = TaskListForm
	template_name = 'add_task_list.html'
	success_url = reverse_lazy('home')

class EpCreate(CreateView):
	model = EndProductUsage
	form_class = EpForm
	template_name = 'ep_create.html'
	success_url = reverse_lazy('home')

def TaskListMatchView(request, cats):
	task_component = TaskComponent.objects.all #Need to filter this to the current tasklist!! task_component_this below, probably.
	task_list_match = TaskListMatch.objects.filter(task_list_id=cats).order_by("id") #Order by order field, once that is populated.
	task_list_match_reverse = task_list_match.order_by("-id")
	task_component_relevant = TaskComponent.objects.filter(end_product_id__isnull=False)
	tasklist_tasks = task_list_match.values_list('task_id')
	task_strange = list(task_list_match) + list(task_component_relevant)
	end_product_exist = 0 
	last_task = 0
	tasklistmatch_count = 0
	ep_product = 0 #Can probably delete
	end_product_used = EndProductUsage.objects.filter(task_list_id = cats)
	task_component_id = 0 #Only for testing. Can delete later.
	used_in_task_id = 0 #Only for testing. Can delete later.
	end_product_id = 0 #Only for testing. Can delete later.
	added_from_task_id = 0 #Only for testing. Can delete later.
	task_list_match_id = 0 #Only for testing. Can delete later.
	ep_added_to_task = None	
	
	#ADD A TASK IN A TASKLIST
	if request.POST.get('add_task'):
		# Add task
		n = Task.objects.create() 
		n.save()
		add_task = n.id
		TaskListMatch.objects.create(task_id=add_task, task_list_id=cats)
		# Automatically add end product
		task_copied = 0
		for b in task_list_match_reverse:
			if task_copied > 0:
				break
			else:
				for c in task_component_relevant.filter(task_id=b.task_id).order_by("-id"): #Change this order_by to order, if I add order to the task components.
					if end_product_used.filter(task_component_id = c.id, task_list_id = cats).count() > 0:
						None
					else:
						TaskComponent.objects.create(task_id=add_task, product_id=c.end_product_id, end_product_id=c.end_product_id) #Adds the last task with an end product
						EndProductUsage.objects.create(task_component_id=c.id, used_in_task_id=add_task, task_list_match_id=b.id , task_list_id=cats, end_product_id=c.end_product_id) #Also add task_list_match_id= ,.
						task_copied = b.id
		task_list_match = TaskListMatch.objects.filter(task_list_id=cats).order_by("id") #Order by order field, once that is populated.

	#MANUALLY ADD END PRODUCT FROM OTHER TASK
	if request.POST.get('inherit_ep'):
		inherit_ep = request.POST.get('inherit_ep')
		inherit_ep = {i.split(":")[0]: int(i.split(":")[1]) for i in request.POST.get('inherit_ep').split(", ")}
		task_component_id = inherit_ep.get("task_component_id")
		used_in_task_id = request.POST.get('used_in_task')
		task_list_match_id = inherit_ep.get('task_list_match_id')
		end_product_id = inherit_ep.get("end_product_id")
		added_from_task_id = inherit_ep.get("added_from_task_id")
		EndProductUsage.objects.create(task_component_id=task_component_id, used_in_task_id=used_in_task_id, task_list_match_id=task_list_match_id, task_list_id=cats, end_product_id=end_product_id, added_from_task_id=added_from_task_id)
		TaskComponent.objects.create(task_id=used_in_task_id, product_id=end_product_id)

	#SHOW ADD END PRODUCT FROM OTHER TASK BUTTON 
	end_product_usage_list = EndProductUsage.objects.filter(task_list_id=cats)
	end_product_available = TaskComponent.objects.filter(task_id__id__in=tasklist_tasks.all(), end_product_id__isnull=False)
	for exclude_entry in end_product_usage_list:
		end_product_available = end_product_available.exclude(task_id=exclude_entry.added_from_task_id, end_product_id=exclude_entry.end_product_id)

	# Check the EndProductUsage for records that have a matching task id and product id, and remove these from the end_product_available
	#Should result in an object of end products that aren't listed in the EndProductUsage table for the given task list.

	# DELETE TASK COMPONENT - INGREDIENT
	if request.POST.get('delete_component'):
		delete_component = request.POST.get('delete_component')
		delete_item = TaskComponent.objects.get(id=delete_component)
		delete_item.delete()
		delete_from_task = request.POST.get('delete_from_task')
		delete_ingredient = request.POST.get('delete_ingredient')
		# I need to delete from end_product_usage only if the record is registered there.
		if request.POST.get('remove_from_ep_usage'):
			delete_end_product_usage = EndProductUsage.objects.get(used_in_task_id=delete_from_task, end_product_id=delete_ingredient)
			delete_end_product_usage.delete()

	#ADD TOOL TO TASK
	if request.POST.get('tool'):
		if request.POST.get('time-seconds'):
			tool_seconds = int(request.POST.get('time-seconds'))
		else:
			tool_seconds = 0
		if request.POST.get('time-minutes'):
			tool_minutes = (int(request.POST.get('time-minutes'))) * 60
		else:
			tool_minutes = 0
		if request.POST.get('time-hours'):
			tool_hours = (int(request.POST.get('time-hours'))) * 3600
		else:
			tool_hours = 0
		if request.POST.get('time-days'):
			tool_days = (int(request.POST.get('time-days'))) * 86400
		else:
			tool_days = 0
		tooltime = tool_seconds + tool_minutes + tool_hours + tool_days
		TaskComponent.objects.create(task_id=request.POST.get('task'), tool_id=request.POST.get('tool'), setting_1=request.POST.get('setting_1'), setting_2=request.POST.get('setting_1'), time=tooltime)

	# DELETE TASK FROM TASKLIST
	if request.POST.get('delete_task'): 
		delete_task_id = request.POST.get('delete_task')
		delete_task_count = TaskListMatch.objects.filter(task_id=delete_task_id).count()
		#Delete record in EndProductUsage table.
		if delete_task_count > 1 :#Is the task used in more than 1 tasklist?
			#Yes: Delete the task from tasklist match table for the current tasklist.
			tasklistmatch = TaskListMatch.objects.get(task_id=delete_task_id ,task_list_id=cats)
			tasklistmatch.delete()
		else:
			#No: Delete the task from tasklist match table for the current tasklist AND delete the task from the task table.
			tasklistmatch = TaskListMatch.objects.get(task_id=delete_task_id ,task_list_id=cats)
			tasklistmatch.delete()
			taskdelete = Task.objects.get(id=delete_task_id)
			taskdelete.delete()
		task_list_match = TaskListMatch.objects.filter(task_list_id=cats).order_by("id") #Order by order field, once that is populated.

	#for listtask in task_list_match:
	#	tasklistmatch_count = listtask.task.id
	
	return render(request, 'task_list_match_view.html', {'task_component_relevant': task_component_relevant, 'task_list_match_reverse': task_list_match_reverse, 'task_strange': task_strange, 'task_component_relevant': task_component_relevant, 'last_task': last_task, 'end_product_usage_list': end_product_usage_list, 'end_product_available': end_product_available, 'end_product_exist': end_product_exist, 'end_product_used': end_product_used, 'task_component_id': task_component_id, 'used_in_task_id': used_in_task_id, 'task_list_match_id': task_list_match_id, 'end_product_id': end_product_id, 'added_from_task_id': added_from_task_id, 'end_product_used': end_product_used, 'ep_product': ep_product, 'cats': cats, 'task_list_match': task_list_match, 'task_component': task_component, 'tasklistmatch_count': tasklistmatch_count, 'tasklist_tasks': tasklist_tasks})

def DeleteTaskFromList(request, tasklistmatch, tasklist):
	tasklistmatch = TaskListMatch.objects.get(id=tasklistmatch)
	tasklistmatch.delete()

	return HttpResponseRedirect(reverse('task_list_match_view', kwargs={"cats": tasklist}))

##TASK COMPONENT##
class AddIngredient(CreateView):
	model = TaskComponent
	form_class = AddIngredientForm
	template_name = 'add_ingredient.html'

	def get_initial(self, *args, **kwargs):
		initial = super().get_initial()
		initial['task'] = self.kwargs.get('pk')
		return initial

	def get_context_data(self, **kwargs):
		context = super().get_context_data(**kwargs)
		context["tsklst"] = self.kwargs.get('tsklst')
		return context

	def get_success_url(self):
		cats = self.kwargs["tsklst"]
		return reverse("task_list_match_view", kwargs={"cats": cats})

		#all_tools = Tools.objects.all
		#task = task
		#tasklist = tasklist
		#tool_id = 0



class AddInstruction(CreateView):
	model = TaskComponent
	form_class = AddInstructionForm
	template_name = 'add_instruction.html'

	def get_initial(self, *args, **kwargs):
		initial = super().get_initial()
		initial['task'] = self.kwargs.get('pk')
		return initial

	def get_context_data(self, **kwargs):
		context = super().get_context_data(**kwargs)
		context["tsklst"] = self.kwargs.get('tsklst')
		return context

	def get_success_url(self):
		cats = self.kwargs["tsklst"]
		return reverse("task_list_match_view", kwargs={"cats": cats})		

class AddTaskComponent(CreateView):
	model = TaskComponent
	form_class = AddTaskComponentForm
	template_name = 'add_task_component.html'

	def get_initial(self, *args, **kwargs):
		initial = super().get_initial()
		initial['task'] = self.kwargs.get('pk')
		return initial

	def get_context_data(self, **kwargs):
		context = super().get_context_data(**kwargs)
		context["tsklst"] = self.kwargs.get('tsklst')
		return context

	def get_success_url(self):
		cats = self.kwargs["tsklst"]
		return reverse("task_list_match_view", kwargs={"cats": cats})

class TaskComponentView(DetailView):
	model = TaskComponent
	template_name = 'task_component_view.html'

class TaskComponentEdit(UpdateView):
	model = TaskComponent
	template_name = 'task_component_edit.html'
	form_class = EditTaskComponentForm

	def get_success_url(self):
		return reverse("task_list_match_view", kwargs={"cats": self.kwargs["tasklist"]})

class EditTaskTool(UpdateView):
	model = TaskComponent
	template_name = 'edit_task_tool.html'
	form_class = EditTaskToolForm

	def get_success_url(self):
		return reverse("task_list_match_view", kwargs={"cats": self.kwargs["tasklist"]})

def TaskComponentDelete(request, component, tasklist):
	taskcomponent = TaskComponent.objects.get(id=component)
	taskcomponent.delete()

	return HttpResponseRedirect(reverse('task_list_match_view', kwargs={"cats": tasklist}))

class AddExistingTask(CreateView):
	model = TaskListMatch
	form_class = AddExistingTaskForm
	template_name = 'add_existing_task.html'

	def get_success_url(self):
		cats = self.kwargs["pk"]
		return reverse("task_list_match_view", kwargs={"cats": cats})
