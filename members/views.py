from django.shortcuts import render
from django.views import generic
from django.contrib.auth.forms import UserCreationForm, UserChangeForm#, PassWordChangeForm
#from django.contrib.auth.views import PassWordChangeView
from django.urls import reverse_lazy
from .forms import SignUpForm, EditProfileForm

#class PassWordsChangeView(PassWordChangeView):
#	form_class = PassWordChangeForm
#	success_url = reverse_lazy('home')

class UserRegisterView(generic.CreateView):
	form_class = SignUpForm
	template_name = 'registration/register.html'
	success_url = reverse_lazy('login')

class UserEditView(generic.UpdateView):
	form_class = EditProfileForm
	template_name = 'registration/edit_profile.html'
	success_url = reverse_lazy('home')

	def get_object(self):
		return self.request.user



