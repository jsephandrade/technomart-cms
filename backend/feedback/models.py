from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

class Feedback(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="feedbacks",
        blank=True,
        null=True,
    )
    category = models.CharField(max_length=100, blank=True, null=True)
    message = models.TextField()
    rating = models.PositiveSmallIntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return self.category or "Feedback"
