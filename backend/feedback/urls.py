from django.urls import path
from . import views

urlpatterns = [
    path('', views.feedback_list_create, name='feedback-list-create'),
    path('<int:feedback_id>/', views.feedback_detail, name='feedback-detail'),
]
