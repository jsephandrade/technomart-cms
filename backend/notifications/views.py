from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.http import JsonResponse
from api.models import Notification
from api.views_common import _actor_from_request
from notifications.serializers import NotificationSerializer


@api_view(["GET"])
@permission_classes([AllowAny])
def notifications_list(request):
    # Use the same token/session extraction as other API views to avoid auth mismatches
    actor, err = _actor_from_request(request)
    if not actor:
        # Fallback to DRF/Django auth user if present
        user = getattr(request, "user", None)
        if user and getattr(user, "is_authenticated", False):
            actor = user
    if not actor:
        return JsonResponse({"success": False, "message": "Unauthorized"}, status=401)

    try:
        notifications = Notification.objects.filter(user=actor).order_by("-created_at")
        limit_raw = request.GET.get("limit")
        if limit_raw:
            try:
                limit = int(limit_raw)
                if limit > 0:
                    notifications = notifications[:limit]
            except Exception:
                pass
        serializer = NotificationSerializer(notifications, many=True)
        return Response({"success": True, "data": serializer.data})
    except Exception as exc:
        return JsonResponse(
            {"success": False, "message": "Failed to load notifications"},
            status=500,
        )
