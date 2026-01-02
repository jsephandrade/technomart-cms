import random,string
import uuid
import base64
from django.contrib.auth import get_user_model

from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib.auth.hashers import make_password
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import api_view, permission_classes

from api.models import AppUser
from .serializers import RegisterSerializer


# ----------------------
# REGISTER
# ----------------------
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(
                {"success": True, "message": "Account created successfully"}, status=201
            )
        return Response({"success": False, "errors": serializer.errors}, status=400)


# ----------------------
# LOGIN
# ----------------------
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        password = request.data.get("password")

        if not email or not password:
            return Response(
                {"detail": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = AppUser.objects.get(email=email)
        except AppUser.DoesNotExist:
            return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.check_password(password):
            return Response({"detail": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        return Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        })


# ----------------------
# PROFILE
# ----------------------
class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        avatar_value = user.avatar or None
        if avatar_value and not str(avatar_value).startswith("http"):
            avatar_value = request.build_absolute_uri(avatar_value)
        return Response({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "status": user.status,
            "credit_points": user.credit_points,
            "avatar": avatar_value,
            "phone": user.phone,
        })


# ----------------------
# UPDATE AVATAR
# ----------------------
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_avatar(request):
    user = request.user
    try:
        upload = request.FILES.get('avatar') or request.FILES.get('image')
        if upload:
            ext = (upload.name.rsplit('.', 1)[-1] or 'jpg').lower()
            filename = f"avatars/{user.id}/{uuid.uuid4().hex}.{ext}"
            path = default_storage.save(filename, upload)
            avatar_url = default_storage.url(path)
        else:
            avatar_data = request.data.get('avatar')
            if not avatar_data:
                return Response({'error': 'Avatar image is required.'}, status=status.HTTP_400_BAD_REQUEST)

            if ';base64,' in avatar_data:
                format, imgstr = avatar_data.split(';base64,')
                ext = format.split('/')[-1] or 'jpg'
            else:
                imgstr = avatar_data
                ext = 'jpg'

            filename = f"avatars/{user.id}/{uuid.uuid4().hex}.{ext}"
            decoded = base64.b64decode(imgstr)
            path = default_storage.save(filename, ContentFile(decoded))
            avatar_url = default_storage.url(path)

        if avatar_url and not avatar_url.startswith('http'):
            avatar_url = request.build_absolute_uri(avatar_url)

        user.avatar = avatar_url
        user.save(update_fields=['avatar'])

        return Response({
            "message": "Avatar updated successfully",
            "avatar_url": avatar_url
        }, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ----------------------
# CHANGE PASSWORD
# ----------------------
@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    new_password = request.data.get('password')

    if not new_password or len(new_password) < 6:
        return Response({'error': 'Password must be at least 6 characters.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    return Response({'success': True, 'message': 'Password changed successfully!'}, status=status.HTTP_200_OK)


# ----------------------
# PASSWORD RESET
# ----------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request(request):
    email = request.data.get('email')
    if not email:
        return Response({"message": "Email required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = AppUser.objects.get(email=email)
    except AppUser.DoesNotExist:
        return Response({"message": "Email not found"}, status=status.HTTP_404_NOT_FOUND)

    # Generate and hash reset code
    reset_code = str(random.randint(100000, 999999))
    user.reset_code = make_password(reset_code)
    user.reset_code_expiry = timezone.now() + timezone.timedelta(hours=1)
    user.save()

    # Send code via email
    send_mail(
    'Your Password Reset Code',
    f'Your reset code is: {reset_code}',
    settings.DEFAULT_FROM_EMAIL,  # ✅ Correct
    [email],
    fail_silently=False,
)



    return Response({"message": "Reset code sent"}, status=status.HTTP_200_OK)


# ----------------------
# VERIFY RESET CODE & SET NEW PASSWORD
# ----------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    email = request.data.get('email')
    reset_code = request.data.get('reset_code')
    new_password = request.data.get('new_password')

    if not email or not reset_code or not new_password:
        return Response({"message": "Email, reset code, and new password are required."},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        user = AppUser.objects.get(email=email)
    except AppUser.DoesNotExist:
        return Response({"message": "Invalid email"}, status=status.HTTP_404_NOT_FOUND)

    # Check expiry
    if not user.reset_code_expiry or timezone.now() > user.reset_code_expiry:
        return Response({"message": "Reset code expired"}, status=status.HTTP_400_BAD_REQUEST)

    from django.contrib.auth.hashers import check_password

    if not check_password(reset_code, user.reset_code):
        return Response({"message": "Invalid reset code"}, status=status.HTTP_400_BAD_REQUEST)

    # Set new password
    user.set_password(new_password)
    user.reset_code = None
    user.reset_code_expiry = None
    user.save()

    return Response({"message": "Password reset successful"}, status=status.HTTP_200_OK)
from django.contrib.auth.models import User
User = get_user_model()  # 👈 always use this

class GuestLoginView(APIView):
    permission_classes = [AllowAny]  # ✅ This makes it public

    def get(self, request):
        # Create a guest user or get an existing one
        guest_user, created = User.objects.get_or_create(username="guest_user")
        if created:
            guest_user.set_unusable_password()
            guest_user.save()

        # Generate JWT tokens
        refresh = RefreshToken.for_user(guest_user)
        return Response({
            "success": True,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": guest_user.id,
                "username": guest_user.username
            }
        })

@api_view(['GET'])
@permission_classes([AllowAny])
def guest_login(request):
    # Generate dummy email
    guest_email = f"guest_{User.objects.count() + 1}@guest.local"

    # Generate random password
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=12))

    # Create guest user using required fields only
    guest_user = User.objects.create_user(
        email=guest_email,
        password=password
    )

    # Generate JWT tokens
    refresh = RefreshToken.for_user(guest_user)
    access = refresh.access_token

    return Response({
        "access": str(access),
        "refresh": str(refresh),
        "user": {"id": guest_user.id, "email": guest_user.email}
    }, status=status.HTTP_200_OK)
