from django.urls import path
from . import views
from .views import GuestLoginView
from .views import guest_login

from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView,
    LoginView,
    ProfileView,
    change_password,
    update_avatar,
    password_reset_request,
    password_reset_confirm,
    google_login,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),  # JWT login
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'), # JWT refresh

    path('update-avatar/', update_avatar, name='update-avatar'),
    path('change-password/', change_password, name='change-password'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('guest-login/', guest_login, name='guest-login'),

    # PASSWORD RESET
    path('password-reset/', password_reset_request, name='password-reset'),
    path('password-reset/confirm/', password_reset_confirm, name='password-reset-confirm'),
    path('google-login/', google_login, name='google-login'),
]
