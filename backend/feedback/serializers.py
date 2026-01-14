from rest_framework import serializers
from .models import Feedback

class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feedback
        fields = [
            'id',
            'category',
            'message',
            'created_at',
            'resolved',
            'resolved_at',
        ]
