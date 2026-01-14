from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from api.models import AppUser
from api.views_common import _actor_from_request
from .models import Feedback
from .serializers import FeedbackSerializer

def _resolve_feedback_user(actor):
    if isinstance(actor, AppUser):
        return actor
    if isinstance(actor, dict):
        actor_id = actor.get('id')
        actor_email = (actor.get('email') or '').lower().strip()
        if actor_id:
            user = AppUser.objects.filter(id=actor_id).first()
            if user:
                return user
        if actor_email:
            return AppUser.objects.filter(email=actor_email).first()
    return None

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def feedback_list_create(request):
    """
    GET: List all feedbacks
    POST: Create a new feedback
    """
    if request.method == 'GET':
        feedbacks = Feedback.objects.all().order_by('-created_at')
        serializer = FeedbackSerializer(feedbacks, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        actor, error_response = _actor_from_request(request)
        if error_response is not None:
            return error_response
        feedback_user = _resolve_feedback_user(actor)
        if feedback_user is None:
            return Response(
                {"detail": "Authentication required to submit feedback."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = FeedbackSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=feedback_user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([AllowAny])
@authentication_classes([])
def feedback_detail(request, feedback_id):
    """
    PATCH: Toggle or set feedback resolved status.
    """
    feedback = get_object_or_404(Feedback, id=feedback_id)
    resolved = request.data.get('resolved', None)

    if resolved is None:
        next_value = not feedback.resolved
    elif isinstance(resolved, str):
        next_value = resolved.strip().lower() in {'1', 'true', 'yes', 'y'}
    else:
        next_value = bool(resolved)

    feedback.resolved = next_value
    feedback.resolved_at = timezone.now() if next_value else None
    feedback.save(update_fields=['resolved', 'resolved_at'])

    serializer = FeedbackSerializer(feedback)
    return Response(serializer.data)
