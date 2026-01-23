import os
from decimal import Decimal
from uuid import uuid4
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from menu.models import MenuItem  # if MenuItem is in the same app

from django.contrib.auth.hashers import make_password, check_password
from accounts.models import AppUserManager  # <-- import the manager

try:
    from .storage import PrivateMediaStorage
except Exception:  # fallback if storage cannot be imported during migrations
    PrivateMediaStorage = None

class Offer(models.Model):
    name = models.CharField(max_length=255)
    required_points = models.PositiveIntegerField()
    menu_items = models.ManyToManyField('MenuItem', blank=True)

    def __str__(self):
        return self.name


class AppUser(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=32, default="staff")
    status = models.CharField(max_length=32, default="active")
    permissions = models.JSONField(default=list, blank=True)
    password_hash = models.CharField(max_length=128, blank=True)
    avatar = models.URLField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True)
    credit_points = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Loyalty credits available for purchases.",
    )
    no_show_count = models.PositiveIntegerField(default=0)
    no_show_locked_until = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    objects = AppUserManager()  # make sure AppUserManager is defined above
    reset_code = models.CharField(max_length=128, blank=True, null=True)
    reset_code_expiry = models.DateTimeField(blank=True, null=True) 
    class Meta:
        db_table = "app_user"
        indexes = [
            models.Index(fields=["role", "status"], name="app_user_role_status_idx"),
        ]

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["name"]
    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"

    def set_password(self, raw_password):
        """Hash the password and store it."""
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        """Check a raw password against the stored hash."""
        return check_password(raw_password, self.password_hash)


class RoleConfig(models.Model):
    """Configurable permissions for built-in roles."""

    value = models.CharField(max_length=32, unique=True)
    label = models.CharField(max_length=64)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "role_config"
        indexes = [
            models.Index(fields=["value"], name="role_config_value_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.label} ({self.value})"
def _headshot_upload_path(instance, filename):
    # Store under a per-user folder with a random filename; keep extension if present
    base, ext = os.path.splitext(filename or "")
    ext = ext if ext else ".bin"
    return f"access_requests/{instance.user_id}/{uuid4().hex}{ext}"

def _headshot_multi_upload_path(instance, filename):
    base, ext = os.path.splitext(filename or "")
    ext = ext if ext else ".jpg"
    user_id = getattr(instance.request, "user_id", "unknown")
    return f"access_requests/{user_id}/shots/{uuid4().hex}{ext}"


class AccessRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    # One request per user account (update in place on resubmission)
    user = models.OneToOneField(
        AppUser,
        on_delete=models.CASCADE,
        related_name="access_request",
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)

    # Evidence
    headshot = models.FileField(
        upload_to=_headshot_upload_path,
        blank=True,
        null=True,
        storage=PrivateMediaStorage() if PrivateMediaStorage else None,
    )
    consent_at = models.DateTimeField(blank=True, null=True)
    code = models.CharField(max_length=32, blank=True, null=True)
    extra = models.JSONField(default=dict, blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    verified_by = models.CharField(max_length=255, blank=True, null=True, help_text="Verifier identifier (e.g., email)")
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "access_request"

    def mark_consented(self):
        self.consent_at = timezone.now()
        self.save(update_fields=["consent_at"]) 

    def approve(self, verifier_identifier: str = ""):
        self.status = self.STATUS_APPROVED
        self.verified_at = timezone.now()
        self.verified_by = verifier_identifier or self.verified_by
        self.save(update_fields=["status", "verified_at", "verified_by"]) 

    def reject(self, verifier_identifier: str = "", note: str = ""):
        self.status = self.STATUS_REJECTED
        self.verified_at = timezone.now()
        self.verified_by = verifier_identifier or self.verified_by
        if note:
            self.notes = (self.notes or "") + ("\n" if self.notes else "") + note
        self.save(update_fields=["status", "verified_at", "verified_by", "notes"]) 


class AccessRequestHeadshot(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    request = models.ForeignKey(
        AccessRequest,
        on_delete=models.CASCADE,
        related_name="headshots",
    )
    image = models.FileField(
        upload_to=_headshot_multi_upload_path,
        blank=True,
        null=True,
        storage=PrivateMediaStorage() if PrivateMediaStorage else None,
    )
    position = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "access_request_headshot"
        indexes = [
            models.Index(fields=["request", "created_at"]),
        ]


class RefreshToken(models.Model):
    """Persistent refresh token with rotation and revocation support.

    The raw token is only shown to the client once and its SHA256 is stored.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="refresh_tokens")
    token_hash = models.CharField(max_length=128, unique=True)
    remember = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(blank=True, null=True)
    rotated_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="rotated_to"
    )
    user_agent = models.CharField(max_length=256, blank=True)
    ip_address = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "refresh_token"
        indexes = [
            models.Index(fields=["user", "expires_at"]),
        ]

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        return timezone.now() < self.expires_at


class ResetToken(models.Model):
    """One-time password reset token with optional 6-digit code fallback."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="reset_tokens")
    token_hash = models.CharField(max_length=128, unique=True)
    code_hash = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=256, blank=True)
    attempts = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "reset_token"
        indexes = [
            models.Index(fields=["user", "expires_at"]),
        ]

    @property
    def is_active(self) -> bool:
        if self.revoked_at or self.used_at:
            return False
        return timezone.now() < self.expires_at


class PasswordResetCode(models.Model):
    """Short‑lived OTP for password reset verification.

    Stores only a SHA256 hash of the 6‑digit code. Single‑use with
    attempt tracking and strict expiry.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="password_reset_codes")
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)

    class Meta:
        db_table = "password_reset_code"
        indexes = [
            models.Index(fields=["user", "expires_at", "used"]),
        ]

    @property
    def is_active(self) -> bool:
        if self.used:
            return False
        return timezone.now() < self.expires_at


class LoginOTP(models.Model):
    """One-time login verification code delivered via email."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="login_otps")
    code_hash = models.CharField(max_length=128)
    remember = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(blank=True, null=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=256, blank=True)

    class Meta:
        db_table = "login_otp"
        indexes = [
            models.Index(fields=["user", "expires_at", "consumed_at"]),
        ]

    @property
    def is_active(self) -> bool:
        if self.consumed_at:
            return False
        return timezone.now() < self.expires_at


def _facetpl_upload_path(instance, filename):
    base, ext = os.path.splitext(filename or "")
    ext = ext if ext else ".jpg"
    return f"face_templates/{instance.user_id}/{uuid4().hex}{ext}"


class FaceTemplate(models.Model):
    """Face template using DeepFace embeddings for production-grade face recognition.

    Stores facial embeddings generated by deep learning models (Facenet512, VGG-Face, etc.)
    for secure and accurate face-based authentication. Supports multiple recognition models
    and distance metrics for flexible deployment scenarios.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="face_template")

    # DeepFace embedding (stored as JSON array, typically 512 or 2622 dimensions)
    embedding = models.TextField(help_text="JSON array of facial embedding vector")

    # Model configuration
    model_name = models.CharField(
        max_length=32,
        default="Facenet512",
        help_text="DeepFace model used: Facenet512, VGG-Face, ArcFace, etc."
    )
    distance_metric = models.CharField(
        max_length=16,
        default="cosine",
        help_text="Distance metric: cosine, euclidean, euclidean_l2"
    )

    # Optional reference image for audit/debugging
    reference = models.FileField(
        upload_to=_facetpl_upload_path,
        blank=True,
        null=True,
        storage=PrivateMediaStorage() if PrivateMediaStorage else None,
        help_text="Reference face image for audit purposes"
    )

    # Legacy field for backward compatibility (can be removed after migration)
    ahash = models.CharField(
        max_length=16,
        blank=True,
        null=True,
        help_text="DEPRECATED: Legacy average hash field"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "face_template"
        indexes = [
            models.Index(fields=['model_name']),
        ]

    def __str__(self):
        return f"FaceTemplate for {self.user.email} ({self.model_name})"


# -----------------------------
# Employees & Scheduling
# -----------------------------


class Employee(models.Model):
    """Employee directory entry for scheduling and staffing.

    This model is intentionally separate from AppUser to allow
    non-login employees to exist. It can be linked to an AppUser
    by email in the future if needed.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    # Optional link to an AppUser for confidentiality-aware features
    user = models.OneToOneField(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
        limit_choices_to={"role__in": ["staff", "manager"]},
    )
    name = models.CharField(max_length=255)
    position = models.CharField(max_length=128, blank=True)
    hire_date = models.DateField(null=True, blank=True)
    contact = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=32, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "employee"
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.position})"

    def clean(self):
        super().clean()
        self._validate_user_role()

    def save(self, *args, **kwargs):
        self._validate_user_role()
        return super().save(*args, **kwargs)

    def _validate_user_role(self):
        if not self.user_id:
            return

        role = (getattr(self.user, "role", "") or "").lower()
        if role not in {"staff", "manager"}:
            raise ValidationError(
                {"user": "Only staff and manager accounts can be linked to an employee record."}
            )


class ScheduleEntry(models.Model):
    """Simple weekly schedule entry for an employee.

    Uses a day-of-week string (e.g., 'Monday') and start/end times.
    """

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="schedules")
    day = models.CharField(max_length=16)  # Sunday..Saturday
    start_time = models.TimeField()
    end_time = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "schedule_entry"
        indexes = [
            models.Index(fields=["employee", "day"]),
        ]


# -----------------------------
# Team Composition Targets
# -----------------------------


class TeamCompositionTarget(models.Model):
    """Daily role caps for scheduling."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    day = models.CharField(max_length=16)
    role = models.CharField(max_length=64)
    target_count = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_composition_targets_created",
    )
    updated_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_composition_targets_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "team_composition_target"
        constraints = [
            models.UniqueConstraint(
                fields=["day", "role"], name="team_composition_target_day_role_uniq"
            ),
        ]
        indexes = [
            models.Index(fields=["day", "role"], name="team_comp_target_day_role_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.day}: {self.role} ({self.target_count})"


class TeamCompositionException(models.Model):
    """Exception request when daily role caps are exceeded."""

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    day = models.CharField(max_length=16)
    role = models.CharField(max_length=64)
    message = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_composition_exceptions",
    )
    requested_by_label = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "team_composition_exception"
        indexes = [
            models.Index(fields=["day", "role"], name="team_comp_exc_day_role_idx"),
            models.Index(fields=["created_at"], name="team_comp_exc_created_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.day}: {self.role}"


# -----------------------------
# Calendar Exceptions
# -----------------------------


class CalendarException(models.Model):
    """Calendar-level exceptions such as holidays and no-work days."""

    KIND_HOLIDAY = "holiday"
    KIND_NO_WORK = "no_work"
    KIND_CHOICES = [
        (KIND_HOLIDAY, "Holiday"),
        (KIND_NO_WORK, "No work day"),
    ]

    SCOPE_ALL = "all"
    SCOPE_ROLES = "roles"
    SCOPE_CHOICES = [
        (SCOPE_ALL, "All staff"),
        (SCOPE_ROLES, "Roles only"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    date = models.DateField()
    name = models.CharField(max_length=255)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default=KIND_HOLIDAY)
    scope = models.CharField(max_length=16, choices=SCOPE_CHOICES, default=SCOPE_ALL)
    roles = models.CharField(max_length=255, blank=True)
    location = models.CharField(max_length=255, blank=True)
    is_workday_override = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="calendar_exceptions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "calendar_exception"
        indexes = [
            models.Index(fields=["date"], name="calendar_exc_date_idx"),
            models.Index(fields=["kind", "date"], name="calendar_exc_kind_date_idx"),
        ]
        ordering = ["date", "name"]

    def __str__(self) -> str:
        return f"{self.date}: {self.name}"


# -----------------------------
# Activity / Audit Logging
# -----------------------------


class AuditLog(models.Model):
    TYPE_LOGIN = "login"
    TYPE_ACTION = "action"
    TYPE_SYSTEM = "system"
    TYPE_SECURITY = "security"
    TYPE_CHOICES = [
        (TYPE_LOGIN, "Login"),
        (TYPE_ACTION, "Action"),
        (TYPE_SYSTEM, "System"),
        (TYPE_SECURITY, "Security"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True)
    actor_email = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_ACTION)
    action = models.CharField(max_length=255)
    details = models.TextField(blank=True)
    severity = models.CharField(max_length=16, blank=True)  # e.g., info, warning, critical
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=256, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    acknowledged_at = models.DateTimeField(blank=True, null=True)
    dismissed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_log"
        indexes = [
            models.Index(fields=["type", "created_at"]),
            models.Index(fields=["actor_email", "created_at"]),
        ]


# -----------------------------
# Notifications
# -----------------------------


class Notification(models.Model):
    TYPE_INFO = "info"
    TYPE_WARNING = "warning"
    TYPE_SUCCESS = "success"
    TYPE_ERROR = "error"
    TYPE_CHOICES = [
        (TYPE_INFO, "Info"),
        (TYPE_WARNING, "Warning"),
        (TYPE_SUCCESS, "Success"),
        (TYPE_ERROR, "Error"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="notifications")
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_INFO)
    read = models.BooleanField(default=False)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notification"
        indexes = [
            models.Index(fields=["user", "read", "created_at"]),
            models.Index(fields=["type", "created_at"]),
        ]


class NotificationPreference(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.OneToOneField(AppUser, on_delete=models.CASCADE, related_name="notification_pref")
    email_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=False)
    low_stock = models.BooleanField(default=True)
    order = models.BooleanField(default=True)
    payment = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_preference"
        indexes = [
            models.Index(fields=["user"]),
        ]


class WebPushSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    expiration_time = models.DateTimeField(blank=True, null=True)
    user_agent = models.CharField(max_length=256, blank=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "webpush_subscription"
        indexes = [
            models.Index(fields=["user", "active"]),
        ]


class NotificationOutbox(models.Model):
    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(AppUser, on_delete=models.CASCADE, related_name="notif_outbox")
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=16, default=STATUS_PENDING)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_outbox"
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]


# -----------------------------
# Payments
# -----------------------------


class PaymentTransaction(models.Model):
    METHOD_CASH = "cash"
    METHOD_CARD = "card"
    METHOD_MOBILE = "mobile"
    METHOD_CHOICES = [
        (METHOD_CASH, "Cash"),
        (METHOD_CARD, "Card"),
        (METHOD_MOBILE, "Mobile"),
    ]

    STATUS_COMPLETED = "completed"
    STATUS_PENDING = "pending"
    STATUS_FAILED = "failed"
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = [
        (STATUS_COMPLETED, "Completed"),
        (STATUS_PENDING, "Pending"),
        (STATUS_FAILED, "Failed"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order_id = models.CharField(max_length=64)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=16, choices=METHOD_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_COMPLETED)
    reference = models.CharField(max_length=128, blank=True)
    customer = models.CharField(max_length=255, blank=True)
    processed_by = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments_processed")
    refunded_at = models.DateTimeField(blank=True, null=True)
    refunded_by = models.CharField(max_length=255, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_txn"
        indexes = [
            models.Index(fields=["order_id", "created_at"]),
            models.Index(fields=["method", "created_at"]),
            models.Index(fields=["status", "created_at"]),
        ]


def _payment_proof_upload_path(instance, filename):
    base, ext = os.path.splitext(filename or "")
    ext = ext.lower() if ext else ".jpg"
    return f"payment_proofs/{instance.order_id}/{uuid4().hex}{ext}"


class PaymentProof(models.Model):
    STATUS_PENDING = "pending"
    STATUS_VERIFIED = "verified"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_VERIFIED, "Verified"),
        (STATUS_REJECTED, "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order = models.ForeignKey(
        "Order",
        on_delete=models.CASCADE,
        related_name="payment_proofs",
    )
    submitted_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_proofs",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference_number = models.CharField(max_length=64, blank=True)
    proof_image = models.ImageField(upload_to=_payment_proof_upload_path)
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    reviewed_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payment_proofs_reviewed",
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_proof"
        indexes = [
            models.Index(fields=["order", "status"]),
            models.Index(fields=["status", "created_at"]),
        ]


class PaymentMethodConfig(models.Model):
    id = models.SmallIntegerField(primary_key=True, default=1, editable=False)
    cash_enabled = models.BooleanField(default=True)
    card_enabled = models.BooleanField(default=True)
    mobile_enabled = models.BooleanField(default=True)
    updated_by = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_method_config"


# -----------------------------
# Checkout Sessions
# -----------------------------


class CheckoutSession(models.Model):
    STATUS_PENDING = "pending"
    STATUS_AWAITING_CASH = "awaiting_cash"
    STATUS_PAID = "paid"
    STATUS_FINALIZED = "finalized"
    STATUS_EXPIRED = "expired"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_AWAITING_CASH, "Awaiting Cash"),
        (STATUS_PAID, "Paid"),
        (STATUS_FINALIZED, "Finalized"),
        (STATUS_EXPIRED, "Expired"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    user = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="checkout_sessions",
    )
    order_id = models.UUIDField(null=True, blank=True)
    order_number = models.CharField(max_length=32, blank=True)
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit_points_used = models.DecimalField(
        max_digits=10, decimal_places=2, default=0
    )
    order_type = models.CharField(max_length=32, blank=True)
    customer_name = models.CharField(max_length=255, blank=True)
    promised_time = models.DateTimeField(blank=True, null=True)
    payload = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=64, blank=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "checkout_session"
        indexes = [
            models.Index(
                fields=["status", "created_at"],
                name="checkout_status_created_idx",
            ),
            models.Index(fields=["order_number"], name="checkout_order_number_idx"),
            models.Index(fields=["idempotency_key"], name="checkout_idempotency_idx"),
        ]

# -----------------------------
# Attendance & Leave
# -----------------------------


class AttendanceRecord(models.Model):
    STATUS_PRESENT = "present"
    STATUS_ABSENT = "absent"
    STATUS_LATE = "late"
    STATUS_CHOICES = [
        (STATUS_PRESENT, "Present"),
        (STATUS_ABSENT, "Absent"),
        (STATUS_LATE, "Late"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    employee = models.ForeignKey("Employee", on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    check_in = models.TimeField(blank=True, null=True)
    check_out = models.TimeField(blank=True, null=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PRESENT)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "attendance_record"
        unique_together = ("employee", "date")
        indexes = [
            models.Index(fields=["employee", "date"]),
            models.Index(fields=["date"]),
        ]


class LeaveRecord(models.Model):
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    TYPE_SICK = "sick"
    TYPE_VACATION = "vacation"
    TYPE_OTHER = "other"
    TYPE_CHOICES = [
        (TYPE_SICK, "Sick"),
        (TYPE_VACATION, "Vacation"),
        (TYPE_OTHER, "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    employee = models.ForeignKey("Employee", on_delete=models.CASCADE, related_name="leave_records")
    start_date = models.DateField()
    end_date = models.DateField()
    type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=TYPE_OTHER)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reason = models.TextField(blank=True)
    decided_by = models.CharField(max_length=255, blank=True)
    decided_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "leave_record"
        indexes = [
            models.Index(fields=["employee", "start_date", "end_date"]),
            models.Index(fields=["status"]),
        ]


# -----------------------------
# Inventory
# -----------------------------


class InventoryItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=128, blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=32, blank=True)
    min_stock = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    supplier = models.CharField(max_length=255, blank=True)
    last_restocked = models.DateTimeField(blank=True, null=True)
    expiry_date = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inventory_item"
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["category"]),
            models.Index(fields=["quantity"]),
            models.Index(fields=["min_stock"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.quantity} {self.unit})"


class InventoryActivity(models.Model):
    ACTION_RESTOCK = "restock"
    ACTION_USAGE = "usage"
    ACTION_ADJUST = "adjust"
    ACTION_SET = "set"
    ACTION_EXPIRY_CHECK = "expiry_check"
    ACTION_UPDATE = "update"
    ACTION_CHOICES = [
        (ACTION_RESTOCK, "Restock"),
        (ACTION_USAGE, "Usage"),
        (ACTION_ADJUST, "Adjust"),
        (ACTION_SET, "Set"),
        (ACTION_EXPIRY_CHECK, "Expiry Check"),
        (ACTION_UPDATE, "Update"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="activities")
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    quantity_change = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    previous_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    new_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reason = models.CharField(max_length=255, blank=True)
    performed_by = models.CharField(max_length=255, blank=True)
    actor = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inventory_activity"
        indexes = [
            models.Index(fields=["item", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]


class Location(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=32, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inv_location"
        indexes = [
            models.Index(fields=["code"]),
        ]

    def __str__(self) -> str:
        return f"{self.code}: {self.name}"


class Batch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="batches")
    lot_code = models.CharField(max_length=64, blank=True)
    expiry_date = models.DateField(blank=True, null=True)
    received_at = models.DateTimeField(blank=True, null=True)
    supplier = models.CharField(max_length=255, blank=True)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "inv_batch"
        indexes = [
            models.Index(fields=["item", "expiry_date"]),
            models.Index(fields=["lot_code"]),
        ]


class StockMovement(models.Model):
    TYPE_RECEIPT = "RECEIPT"
    TYPE_SALE = "SALE"
    TYPE_ADJUSTMENT = "ADJUSTMENT"
    TYPE_WASTE = "WASTE"
    TYPE_TRANSFER_IN = "TRANSFER_IN"
    TYPE_TRANSFER_OUT = "TRANSFER_OUT"
    TYPE_RETURN = "RETURN"
    TYPE_CHOICES = [
        (TYPE_RECEIPT, "Receipt"),
        (TYPE_SALE, "Sale/Consumption"),
        (TYPE_ADJUSTMENT, "Manual Adjustment"),
        (TYPE_WASTE, "Waste"),
        (TYPE_TRANSFER_IN, "Transfer In"),
        (TYPE_TRANSFER_OUT, "Transfer Out"),
        (TYPE_RETURN, "Return to Supplier"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="movements")
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="movements")
    batch = models.ForeignKey(Batch, on_delete=models.SET_NULL, null=True, blank=True, related_name="movements")
    movement_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    qty = models.DecimalField(max_digits=14, decimal_places=4)
    effective_at = models.DateTimeField()
    recorded_at = models.DateTimeField()
    actor = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True)
    reference_type = models.CharField(max_length=32, blank=True)
    reference_id = models.CharField(max_length=64, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    idempotency_key = models.CharField(max_length=64, blank=True, null=True, unique=True)

    class Meta:
        db_table = "inv_stock_movement"
        indexes = [
            models.Index(fields=["item", "location", "effective_at"]),
            models.Index(fields=["batch"]),
            models.Index(fields=["movement_type", "effective_at"]),
            models.Index(fields=["recorded_at"]),
            models.Index(fields=["item", "recorded_at"]),
            models.Index(fields=["location", "recorded_at"]),
        ]
        constraints = [
            models.CheckConstraint(check=~models.Q(qty=0), name="movement_qty_nonzero"),
        ]


class ReorderSetting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="reorder_settings")
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="reorder_settings")
    reorder_point = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    reorder_qty = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    lead_time_days = models.PositiveIntegerField(default=0)
    low_stock_threshold = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "inv_reorder_setting"
        constraints = [
            models.UniqueConstraint(fields=["item", "location"], name="uniq_item_location_reorder"),
        ]


# -----------------------------
# Menu Management
# -----------------------------


class MenuCategory(models.Model):
    """Category for organizing menu items."""
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=128, unique=True)
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "menu_category"
        ordering = ["sort_order", "name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["sort_order"]),
        ]

    def __str__(self) -> str:
        return self.name


class MenuItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(max_length=128, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    available = models.BooleanField(default=True)
    archived = models.BooleanField(default=False)
    is_special = models.BooleanField(default=False)  # <-- add this

    archived_at = models.DateTimeField(blank=True, null=True)
    image = models.ImageField(upload_to="menu_items/", blank=True, null=True)
    ingredients = models.JSONField(default=list, blank=True)
    preparation_time = models.PositiveIntegerField(default=0, help_text="Minutes")
    pax_per_preparation = models.PositiveIntegerField(
        default=0,
        help_text="Estimated number of pax available per batch",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "menu_item"
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["category"]),
            models.Index(fields=["available"]),
            models.Index(fields=["archived"], name="menuitem_archived_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.category})"


# -----------------------------
# Catering Packages
# -----------------------------


class CateringPackage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    price_per_pax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    min_pax = models.PositiveIntegerField(default=1)
    max_pax = models.PositiveIntegerField(blank=True, null=True)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catering_package"
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["active"]),
        ]

    def __str__(self) -> str:
        return self.name


class CateringPackageItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    package = models.ForeignKey(
        CateringPackage,
        on_delete=models.CASCADE,
        related_name="items",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="catering_package_items",
    )
    name = models.CharField(max_length=255)
    quantity_per_pax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catering_package_item"
        indexes = [
            models.Index(fields=["package"]),
            models.Index(fields=["menu_item"]),
        ]
        ordering = ["sort_order", "created_at"]

    def __str__(self) -> str:
        return f"{self.package.name}: {self.name}"


# -----------------------------
# Catering Events
# -----------------------------


class CateringEvent(models.Model):
    STATUS_SCHEDULED = "scheduled"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_SCHEDULED, "Scheduled"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    name = models.CharField(max_length=255)
    client_name = models.CharField(max_length=255)
    client_email = models.EmailField(blank=True, null=True)
    contact_name = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=64, blank=True)
    contact_email = models.EmailField(blank=True, null=True)
    event_date = models.DateField()
    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)
    location = models.CharField(max_length=255, blank=True)
    guest_count = models.PositiveIntegerField(default=0)
    package = models.ForeignKey(
        CateringPackage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    package_name = models.CharField(max_length=255, blank=True)
    package_price_per_pax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    package_snapshot = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)
    notes = models.TextField(blank=True)
    estimated_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    order_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Discount applied to the order")
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Deposit amount required")
    deposit_paid = models.BooleanField(default=False, help_text="Whether deposit has been paid")
    payment_status = models.CharField(max_length=32, default="unpaid", help_text="Overall payment status: unpaid, partial, paid")
    menu_additions_count = models.PositiveSmallIntegerField(default=0, help_text="Number of post-save menu updates")
    deleted_at = models.DateTimeField(blank=True, null=True, help_text="Soft delete timestamp")
    deleted_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        related_name="catering_events_deleted",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        related_name="catering_events",
        null=True,
        blank=True,
    )
    updated_by = models.ForeignKey(
        AppUser,
        on_delete=models.SET_NULL,
        related_name="catering_events_updated",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catering_event"
        indexes = [
            models.Index(fields=["event_date", "status"]),
            models.Index(fields=["client_name"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} on {self.event_date}" if self.event_date else self.name


class CateringEventItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    event = models.ForeignKey(
        CateringEvent,
        on_delete=models.CASCADE,
        related_name="items",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="catering_items",
    )
    name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "catering_event_item"
        indexes = [
            models.Index(fields=["event"]),
        ]

    @property
    def total_price(self):
        from decimal import Decimal

        qty = Decimal(self.quantity or 0)
        price = Decimal(self.unit_price or 0)
        return (qty * price).quantize(Decimal("0.01"))


# -----------------------------
# Orders
# -----------------------------


class Order(models.Model):
    STATUS_NEW = "new"
    STATUS_PENDING = "pending"  # legacy alias of NEW
    STATUS_ACCEPTED = "accepted"
    STATUS_IN_QUEUE = "in_queue"  # legacy alias of ACCEPTED
    STATUS_IN_PREP = "in_prep"
    STATUS_IN_PROGRESS = "in_progress"  # legacy alias of IN_PREP
    STATUS_ASSEMBLING = "assembling"
    STATUS_READY = "ready"  # legacy alias of STAGED
    STATUS_STAGED = "staged"
    STATUS_HANDOFF = "handoff"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_VOIDED = "voided"
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = [
        (STATUS_NEW, "New"),
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_IN_QUEUE, "In Queue"),
        (STATUS_IN_PREP, "In Preparation"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_ASSEMBLING, "Assembling"),
        (STATUS_STAGED, "Staged"),
        (STATUS_READY, "Ready"),
        (STATUS_HANDOFF, "Handoff"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_VOIDED, "Voided"),
        (STATUS_REFUNDED, "Refunded"),
    ]
    PAYMENT_UNPAID = "unpaid"
    PAYMENT_PENDING = "pending"
    PAYMENT_PAID = "paid"
    PAYMENT_REJECTED = "rejected"
    PAYMENT_STATUS_CHOICES = [
        (PAYMENT_UNPAID, "Unpaid"),
        (PAYMENT_PENDING, "Pending Verification"),
        (PAYMENT_PAID, "Paid"),
        (PAYMENT_REJECTED, "Rejected"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order_number = models.CharField(max_length=32, unique=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    order_type = models.CharField(max_length=32, blank=True)  # e.g., walk-in, delivery
    customer_name = models.CharField(max_length=255, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=16, blank=True)  # cash/card/mobile
    payment_status = models.CharField(
        max_length=16, choices=PAYMENT_STATUS_CHOICES, default=PAYMENT_UNPAID
    )
    placed_by = models.ForeignKey('AppUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    completed_at = models.DateTimeField(blank=True, null=True)
    promised_time = models.DateTimeField(blank=True, null=True)
    quoted_minutes = models.PositiveIntegerField(default=15)
    channel = models.CharField(max_length=32, blank=True)
    priority = models.CharField(max_length=16, default="normal")
    eta_seconds = models.IntegerField(default=0)
    is_throttled = models.BooleanField(default=False)
    throttle_reason = models.CharField(max_length=255, blank=True)
    bulk_reference = models.CharField(max_length=64, blank=True)
    shelf_slot = models.CharField(max_length=16, blank=True)
    handoff_code = models.CharField(max_length=32, blank=True)
    handoff_verified_at = models.DateTimeField(blank=True, null=True)
    handoff_verified_by = models.CharField(max_length=255, blank=True)
    partial_ready_items = models.PositiveIntegerField(default=0)
    total_items_cached = models.PositiveIntegerField(default=0)
    last_station_code = models.CharField(max_length=32, blank=True)
    late_by_seconds = models.IntegerField(default=0)
    meta = models.JSONField(default=dict, blank=True)
    auto_advance_target = models.CharField(max_length=32, blank=True)
    auto_advance_at = models.DateTimeField(blank=True, null=True)
    phase_started_at = models.DateTimeField(blank=True, null=True)
    phase_sequence = models.PositiveIntegerField(default=0)
    auto_advance_paused = models.BooleanField(default=False)
    auto_advance_pause_reason = models.CharField(max_length=255, blank=True)
    auto_advance_duration_seconds = models.PositiveIntegerField(default=40)
    credit_points_used = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    use_credit_points = models.BooleanField(default=False)
    credit_points_before = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "order"
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["auto_advance_at"], name="order_auto_advance_at_idx"),
        ]

    
    def save(self, *args, **kwargs):
        if not self.order_number:  # None or ''
            self.order_number = uuid4().hex[:12].upper()
        super().save(*args, **kwargs)

class OrderItem(models.Model):
    STATE_QUEUED = "queued"
    STATE_FIRING = "firing"
    STATE_COOKING = "cooking"
    STATE_HOLD = "hold"
    STATE_DELAYED = "delayed"
    STATE_READY = "ready"
    STATE_REFIRED = "refired"
    STATE_CANCELLED = "cancelled"
    STATE_COMPLETED = "completed"
    STATE_CHOICES = [
        (STATE_QUEUED, "Queued"),
        (STATE_FIRING, "Firing"),
        (STATE_COOKING, "Cooking"),
        (STATE_HOLD, "Hold"),
        (STATE_DELAYED, "Delayed"),
        (STATE_READY, "Item Ready"),
        (STATE_REFIRED, "Re-fired"),
        (STATE_CANCELLED, "Cancelled"),
        (STATE_COMPLETED, "Completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey('MenuItem', on_delete=models.SET_NULL, null=True, blank=True)
    item_name = models.CharField(max_length=255)
    category = models.CharField(max_length=128, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    quantity = models.PositiveIntegerField(default=1)
    state = models.CharField(max_length=16, choices=STATE_CHOICES, default=STATE_QUEUED)
    station_code = models.CharField(max_length=32, blank=True)
    station_name = models.CharField(max_length=64, blank=True)
    cook_seconds_estimate = models.PositiveIntegerField(default=0)
    cook_seconds_actual = models.PositiveIntegerField(default=0)
    fired_at = models.DateTimeField(blank=True, null=True)
    ready_at = models.DateTimeField(blank=True, null=True)
    hold_until = models.DateTimeField(blank=True, null=True)
    batch_id = models.CharField(max_length=64, blank=True)
    priority = models.CharField(max_length=16, default="normal")
    sequence = models.PositiveIntegerField(default=0)
    modifiers = models.JSONField(default=list, blank=True)
    allergens = models.JSONField(default=list, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    size = models.CharField(max_length=50, null=True, blank=True)
    customize = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "order_item"
        indexes = [
            models.Index(fields=["order"]),
            models.Index(fields=["station_code", "state"], name="order_item_station_state_idx"),
            models.Index(fields=["batch_id"], name="order_item_batch_idx"),
        ]

    @property
    def current_state(self) -> str:
        return self.state

    @property
    def is_active(self) -> bool:
        return self.state not in {self.STATE_CANCELLED, self.STATE_COMPLETED}


class KitchenStation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=64)
    tags = models.JSONField(default=list, blank=True)
    capacity = models.PositiveIntegerField(default=4)
    auto_batch_window_seconds = models.PositiveIntegerField(default=90)
    make_to_stock = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    is_expo = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "kitchen_station"
        indexes = [
            models.Index(fields=["is_active", "sort_order"], name="kitchen_station_active_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class OrderEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="events", null=True, blank=True)
    actor = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True)
    event_type = models.CharField(max_length=64)
    from_state = models.CharField(max_length=32, blank=True)
    to_state = models.CharField(max_length=32, blank=True)
    station_code = models.CharField(max_length=32, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "order_event"
        indexes = [
            models.Index(fields=["order", "created_at"], name="order_event_order_created_idx"),
            models.Index(fields=["event_type"], name="order_event_type_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.event_type} on {self.order_id}"


# -----------------------------
# Cash handling (sessions and movements)
# -----------------------------


class CashSession(models.Model):
    STATUS_OPEN = "open"
    STATUS_CLOSED = "closed"
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    opened_by = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, related_name="cash_opened")
    closed_by = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="cash_closed")
    status = models.CharField(max_length=16, default=STATUS_OPEN)
    opening_float = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    closing_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.CharField(max_length=255, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        db_table = "cash_session"
        indexes = [models.Index(fields=["status", "opened_at"]) ]


class CashEntry(models.Model):
    TYPE_IN = "cash_in"
    TYPE_OUT = "cash_out"
    TYPE_SALE = "sale"
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    session = models.ForeignKey(CashSession, on_delete=models.CASCADE, related_name="entries")
    type = models.CharField(max_length=16)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reference = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    actor = models.ForeignKey(AppUser, on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "cash_entry"
        indexes = [models.Index(fields=["session", "created_at"]) ]
