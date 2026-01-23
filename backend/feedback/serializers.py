from rest_framework import serializers
from .models import Feedback

class FeedbackSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.name', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = Feedback
        fields = [
            'id',
            'user',
            'user_name',
            'user_email',
            'category',
            'message',
            'rating',
            'created_at',
            'resolved',
            'resolved_at',
        ]
        read_only_fields = ['user']
