from django.urls import path
from .import views
from .views import HomeView, GroupView, AddGroupView, EditGroupView, ProductView, AddProductView, EditProductView, DeleteProductView, ProgramView, EditProgramView, TaskView, EditTaskView, addProgram, AddProductToGroup, AddTaskIngredientView, TaskIngredientView, DeleteTaskIngredientView, AddTaskListView, TaskListMatchView, AddExistingTask, AddTaskComponent, TaskComponentView, TaskComponentEdit, TaskComponentDelete, ListToolsView, ToolView, AddToolView, EditToolView, DeleteToolView, DeleteTaskChoice, DeleteTaskFromList, DeleteTaskTasklistmatch, AddIngredient, AddInstruction, EditTaskTool, AddProduct2, ProductMatch, EditIngredient, EditIngredientCheck, AddTaskTool, EpCreate
urlpatterns = [
    #path('', views.home, name="home"),

	#GROUP#
 	path('group', GroupView.as_view(), name="group"),
 	path('add_group', AddGroupView.as_view(), name="add_group"),
 	path('group/edit/<int:pk>', EditGroupView.as_view(), name="edit_group"),
 	path('group/add_product/<int:pk>', AddProductToGroup.as_view(), name="add_product_to_group"),

    #PRODUCT#
    path('', HomeView.as_view(), name="home"),
 	path('product/<int:pk>', ProductView.as_view(), name="product"),
 	path('add_product', AddProductView.as_view(), name="add_product"),
 	path('product/edit/<int:pk>', EditProductView.as_view(), name="edit_product"),
 	path('product/<int:pk>/delete', DeleteProductView.as_view(), name="delete_product"),
 	path('product/add/<int:task>/<int:tasklist>', AddProduct2, name="add_product_2"),
	path('product/edit/ingredient/<int:component>/<int:tasklist>', EditIngredient, name="edit_ingredient"),
	path('product/edit/ingredient/check/<int:component>/<int:tasklist>', EditIngredientCheck, name="edit_ingredient_check"),
 	path('product/search/match/<int:task>/<int:tasklist>', ProductMatch, name="product_match"),

    #TOOL#
 	path('tool', ListToolsView.as_view(), name="tool_list"),
 	path('tool/<int:pk>', ToolView.as_view(), name="tool"),
 	path('add_tool/<int:task>/<int:tasklist>', AddToolView, name="add_tool"),
 	#path('tool/edit/<int:task>/<int:tasklist>/<int:tool>', EditToolView, name="edit_tool"),
	#path('tool/edit/<int:task>/<int:tasklist>/<int:tool>/', EditToolView.as_view(), name='edit_tool'),
	path('edit-tool/<int:task>/<int:tasklist>/<int:tool>/', EditToolView.as_view(), name='edit_tool'),
	

	path('tool/<int:pk>/delete', DeleteToolView.as_view(), name="delete_tool"),
	
	#path('tool/create-tool/', CreateToolView.as_view(), name='create_tool'),

 	#PROGRAM#
	path('program/<int:pk>', ProgramView.as_view(), name="program"),
	path('add_program/<int:pk>', addProgram, name="add_program"),
	path('program/edit/<int:pk>', EditProgramView.as_view(), name="edit_program"),

	#TASKS#
	path('task/<int:pk>', TaskView, name="task"),
	path('task/edit/<int:pk>', EditTaskView, name="edit_task"),
 	path('task/addtaskingredient/<int:pk>', AddTaskIngredientView.as_view(), name="add_task_ingredient"),
 	path('task/deletetaskingredient/<int:pk>/delete', DeleteTaskIngredientView.as_view(), name="delete_task_ingredient"),
	path('task/taskingredient/<int:pk>', TaskIngredientView, name="taskingredient"),
	path('task/task/delete_choice/<int:tasklist>/<int:tasklistmatch>/<int:task>', DeleteTaskChoice, name="delete_task_choice"),
	path('task/task/tasklist/<int:tasklistmatch>/<int:tasklist>/<int:task>>delete', DeleteTaskTasklistmatch, name="delete_task_tasklistmatch"),

 	#TASK LIST#
 	path('add_task_list/', AddTaskListView.as_view(), name="add_task_list"),
 	path('task_list_match/<int:cats>', TaskListMatchView, name="task_list_match_view"),
 	path('task_list_match/<int:pk>/add_existing', AddExistingTask.as_view(), name="add_existing_task"),
 	path('task_list_match/task_component/<int:pk>', TaskComponentView.as_view(), name="task_component_view"),
 	path('task_list_match/task/<int:tasklistmatch>/<int:tasklist>/delete', DeleteTaskFromList, name="delete_task_from_list"),

 	#TASK COMPONENT#
 	path('task_list_match/<int:pk>/add_component/<int:tsklst>', AddTaskComponent.as_view(), name="add_task_component"),
 	path('task_list_match/<int:pk>/add_ingredient/<int:tsklst>', AddIngredient.as_view(), name="add_ingredient"),
# 	path('task_list_match/<int:task>/add_tool/<int:tasklist>', AddTaskTool.as_view(), name="add_task_tool"),
 	path('task_list_match/<int:tasklist>/add_tool/<int:task>/', AddTaskTool.as_view(), name='add_task_tool'),
 	path('task_list_match/<int:pk>/add_instruction/<int:tsklst>', AddInstruction.as_view(), name="add_instruction"),
 	path('task/component/<int:pk>', TaskComponentView.as_view(), name="task_component"),
	path('task/component/edit/<int:pk>/<int:tasklist>', TaskComponentEdit.as_view(), name="task_component_edit"),
	path('task/component/delete/<int:component>/<int:tasklist>', TaskComponentDelete, name="task_component_delete"),
	path('task/component/edit/task/tool/<int:pk>/<int:tasklist>', EditTaskTool.as_view(), name="edit_task_tool"),


	
	#path('add_post/<int:pk>', AddPostView.as_view(), name="add_post"),
 	#path('add_category/<int:pk>', AddCategoryView.as_view(), name="add_category"),

	path('EpCreate', EpCreate.as_view(), name="ep_create"),



]

