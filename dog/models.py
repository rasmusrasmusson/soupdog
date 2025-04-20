from django.db import models
from django.contrib.auth.models import User
from django.urls import reverse
from datetime import datetime, date

class Task(models.Model):
	#readonly_fields=('id',)
	name = models.CharField(max_length=255)
	author = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)	
	type = models.CharField(max_length=255, blank=True, null=True) 
	text1 = models.TextField(max_length=255, blank=True, null=True) #Will later refer to a content table.

	#difficulty = models.CharField(max_length=255) #Should be updated from some user voting system or just set by the author.
	#time = models.CharField(max_length=255) #Standard time it takes to do it.
	#start_tool = models.ForeignKey('Tools', on_delete=models.PROTECT, blank=True, null=True)
	#start_type = models.CharField(max_length=255)
	#start_value = models.CharField(max_length=255)
	#end_tool = models.ForeignKey('Tools', on_delete=models.PROTECT, blank=True, null=True)
	#end_type = models.CharField(max_length=255)
	#end_value = models.CharField(max_length=255)	
	#difficulty = models.CharField(max_length=255) #1 to 100. Might be in the Program table instead, or in both.

	# start_method = models.ForeignKey(EndMethod, on_delete=models.CASCADE) #Refers to how to determine when the step starts, e.g., time, core_temp
	#start_value = models.CharField(max_length=255, blank=True, null=True) ##corresponding to start_method, and can mean seconds for time or C for core_temp, for example
	# end_method = models.ForeignKey(EndMethod, on_delete=models.CASCADE) #Refers to how to determine when the step ends, e.g., time, core_temp
	#end_value = models.CharField(max_length=255, blank=True, null=True) #corresponding to end_method, and can mean seconds for time or C for core_temp, for example
	#text2 = models.TextField(max_length=255, blank=True, null=True)
	#text3 = models.TextField(max_length=255, blank=True, null=True)
	#image1 = models.ImageField(blank=True, null=True, upload_to="images/program")
	#image2 = models.ImageField(blank=True, null=True, upload_to="images/program")
	#image3 = models.ImageField(blank=True, null=True, upload_to="images/program")

#	def __str__(self):
#		return f"{self.name, self.type, self.program, self.id}"

	#def get_absolute_url(self):
		#return reverse('home')
	#	return reverse('add_task_tasklist_redirect', args=[str(self.pk)])

class Product(models.Model):
	name = models.CharField(max_length=255)
	author = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
	description = models.TextField(max_length=255, blank=True, null=True)
	surface_temp = models.DecimalField(max_digits=1000, decimal_places=2, blank=True, null=True)
	core_temp = models.DecimalField(max_digits=1000, decimal_places=2, blank=True, null=True)
	mass = models.DecimalField(max_digits=1000, decimal_places=2, blank=True, null=True)
	volume = models.DecimalField(max_digits=1000, decimal_places=0, blank=True, null=True)
	quantity = models.DecimalField(max_digits=1000, decimal_places=0, blank=True, null=True)
	barcode = models.CharField(max_length=255, blank=True, null=True)	
	product_image = models.ImageField(blank=True, null=True, upload_to="images/")	
	create_date = models.DateTimeField(auto_now_add=True)
	edit_date = models.DateTimeField(auto_now=True)
	program = models.ForeignKey('Program', on_delete=models.PROTECT, related_name='product_program', blank=True, null=True)
	template = models.CharField(max_length=255, blank=True, null=True)

	def __str__(self):
		return self.name

	def get_absolute_url(self):
		return reverse('group')

class Tools(models.Model):
	name = models.TextField(max_length=255)
	description = models.TextField(max_length=255, blank=True, null=True)
	image1 = models.ImageField(blank=True, null=True, upload_to="images/tools")
	author_id = models.ForeignKey(User, on_delete=models.CASCADE)
	# version = models.CharField(max_length=255)
	categories = models.ManyToManyField('ToolCategory', through='ToolCategoryMatch')
	parent_id = models.ForeignKey('Tools', on_delete=models.PROTECT, blank=True, null=True) #Can use used when defining a sub-system, e.g., steam system in VARM1

	#type = MACHINE OR MANUAL, might be another table
	def __str__(self):
		return self.name
	
	def get_absolute_url(self):
		return reverse('home')	

class ToolCategory(models.Model):
	name = models.CharField(max_length=100)
	parent = models.ForeignKey('self', on_delete=models.CASCADE,  
							null=True, blank=True, 
							related_name='children')
	created_at = models.DateTimeField(auto_now_add=True)
#	tool = models.ForeignKey(Tools, on_delete=models.CASCADE) #Can probably be removed
#	category = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True) #Can probably be removed

	def __str__(self):
		return self.name

	class Meta:
		verbose_name_plural = "Tool Categories"

	#class Meta:
	#	unique_together = ('tool', 'category')


class ToolCategoryMatch(models.Model):
	tool = models.ForeignKey('Tools', on_delete=models.CASCADE, blank=True, null=True)
	category = models.ForeignKey('ToolCategory', on_delete=models.CASCADE, blank=True, null=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		unique_together = ('tool', 'category')

class UsedFor(models.Model): #Defines the usage of a tool.
	tool_category = models.ForeignKey(ToolCategory, on_delete=models.CASCADE, blank=True, null=True)
	#parent = models.ForeignKey(UsedFor, on_delete=models.CASCADE, blank=True, null=True)
	name = models.CharField(max_length=255, blank=True, null=True) #e.g., measure > measure length | heat > heat speed | modify > chop | modify > cut 
	product_result = models.CharField(max_length=255, blank=True, null=True) #e.g., chopped, heated
	task_activity = models.CharField(max_length=255, blank=True, null=True) #e.g., chop, chopped

class UsedForMatch(models.Model): #Matches a tool with used for categories
	used_for_category = models.ForeignKey(UsedFor, on_delete=models.CASCADE, blank=True, null=True)
	tool = models.ForeignKey(Tools, on_delete=models.CASCADE, blank=True, null=True)
	value = models.CharField(max_length=255, blank=True, null=True) #Value for the specific parameter, e.g., max_heat = 250

class MyTools: #Lists what tools a person has in a certain location. This will be used in instructions to show available tools.
	user = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
	tool = models.ForeignKey(Tools, on_delete=models.CASCADE, blank=True, null=True)
	#location #FK to a location table, where we register addresses to a user or users (could be shared by many)
	note = models.CharField(max_length=255, blank=True, null=True)

class TaskComponent(models.Model):
	task = models.ForeignKey('Task', on_delete=models.CASCADE, blank=True, null=True, related_name='task_component')
	product = models.ForeignKey('Product',  on_delete=models.CASCADE, blank=True, null=True, related_name="Product")
	end_product = models.ForeignKey('Product', on_delete=models.CASCADE, blank=True, null=True, related_name="end_product")
	tool = models.ForeignKey('Tools', on_delete=models.CASCADE, blank=True, null=True)
	text = models.CharField(max_length=255, blank=True, null=True)
	setting_1 = models.CharField(max_length=255, blank=True, null=True)
	setting_2 = models.CharField(max_length=255, blank=True, null=True)
	time = models.CharField(max_length=255, blank=True, null=True) #in seconds
	order = models.CharField(max_length=255, blank=True, null=True)

	#def __str__(self):
	#	return self.task

	#sdef get_absolute_url(self):
		#return reverse('task_list_match_view', args=(str(task.id)) )
	#	return reverse('task_list_match_view', args=(str(self.tsklst)) )

	def get_absolute_url(self):
		return reverse("task_list_match_view", args=[str(self.setting_1)])	#This works, but takes a field value
		#return reverse("task_list_match_view", args=[str(self.object.tsklst.pk)])	

#	def __init__(self, *args, **kwargs):
#		super().__init__(*args, **kwargs)
#		self.fields['task'].initial = '1'

class TaskList(models.Model):
	product = models.ForeignKey('Product', on_delete=models.CASCADE, blank=True, null=True)
	channel = models.CharField(max_length=255)

class TaskListMatch(models.Model):
	order = models.IntegerField(blank=True, null=True)
	task = models.ForeignKey(Task, on_delete=models.PROTECT, related_name='taskss') #This is called task_id in the DB...
	task_list = models.ForeignKey(TaskList, on_delete=models.PROTECT)

	def __unicode__(self):
		return ""

class EndProductUsage(models.Model):
	task_component = models.ForeignKey('TaskComponent', on_delete=models.CASCADE, blank=True, null=True)
	used_in_task = models.ForeignKey('Task', on_delete=models.CASCADE, blank=True, null=True, related_name='ep_task')
	task_list_match = models.ForeignKey('TaskListMatch', on_delete=models.CASCADE, blank=True, null=True, related_name='ep_tasklist')
	task_list = models.ForeignKey('TaskList', on_delete=models.CASCADE, blank=True, null=True, related_name='ep_tasklist')
	end_product = models.ForeignKey('Product', on_delete=models.CASCADE, blank=True, null=True, related_name='ep_product')
	added_from_task = models.ForeignKey('Task', on_delete=models.CASCADE, blank=True, null=True)
	felix = models.CharField(max_length=255, blank=True, null=True)

class Ingredient(models.Model):
	program = models.ForeignKey('Program', on_delete=models.PROTECT, blank=True, null=True)	
	task = models.ForeignKey('Task', on_delete=models.CASCADE, blank=True, null=True)
	product = models.ForeignKey('Product', on_delete=models.CASCADE, blank=True, null=True)
	tool = models.ForeignKey('Tools', on_delete=models.CASCADE, blank=True, null=True)
	
	def __str__(self):
		return str(self.name) + ' | ' + str(self.author)

class Program(models.Model): #Change name to TaskListTasks
	name = models.CharField(max_length=255)
	author = models.ForeignKey(User, on_delete=models.CASCADE)
	version = models.CharField(max_length=255)
	product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='product') #Later this reference will be replaced by a TaskListView reference.
	order = models.IntegerField(blank=True, null=True)

#	def __int__(self):
#		return self.id
#	def __str__(self):
#		return f"{self.name, self.product}"

class TextContent(models.Model):
	en_en = models.TextField(max_length=255, blank=True, null=True)
	zh_cn = models.TextField(max_length=255, blank=True, null=True)
	sv_se = models.TextField(max_length=255, blank=True, null=True)

class TaskTool(models.Model):
	task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='tooltask')
	tool = models.ForeignKey(Tools, on_delete=models.CASCADE)

	def __str__(self):
		return str(self.task) + " --- " + str(self.tool)
		#return f"{self.task, self.tool}"

	def get_absolute_url(self):
		return reverse('home')

class TaskIngredient(models.Model):
	task = models.ForeignKey('Task', on_delete=models.CASCADE, blank=True, null=True, related_name='tasks')
	product = models.ForeignKey('Product', on_delete=models.CASCADE, blank=True, null=True)
	mass = models.TextField(max_length=255, blank=True, null=True)
	volume = models.TextField(max_length=255, blank=True, null=True)
	quantity = models.TextField(max_length=255, blank=True, null=True)

	def __str__(self):
		return f"{self.task, self.product}"

	def get_absolute_url(self):
		return reverse('edit_task', args=(str(self.task.id)))
		#return reverse('home')

# To be removed:

class Post(models.Model):
	title = models.CharField(max_length=255)
	title_tag = models.CharField(max_length=255)
	#author = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True)
	#body = models.TextField()
	#post_date = models.DateField(auto_now_add=True)
	#category = models.CharField(max_length=255, default='coding')
#	category= models.ForeignKey(Category ,max_length=60, on_delete=models.CASCADE, related_name= 'catego')



#	def _str_(self):
#		return self.title + ' | ' str(self.author)

#	def get_absolute_url(self):
#		return reverse('home')
		#return reverse('article-detail', args=(str(self.id))) #the argument passes the id of the thing created to the next page.
class Group(models.Model):
	name = models.CharField(max_length=255)
	author = models.ForeignKey(User, on_delete=models.CASCADE)
	description = models.TextField(max_length=255, blank=True, null=True)

	def __str__(self):
		return self.name + ' | ' + str(self.author)

	def get_absolute_url(self):
		return reverse('home')

class GroupProductView(models.Model):
	group = models.ManyToManyField(Group)
	product = models.ManyToManyField(Product)

	def __int__(self):
		return self.id
	#def get_absolute_url(self):