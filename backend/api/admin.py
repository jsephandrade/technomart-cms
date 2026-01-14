from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html
from django.urls import path, reverse
from django.http import FileResponse, Http404, HttpResponseForbidden
from django import forms

from .models import AppUser, AccessRequest, MenuItem, PaymentProof
from .emails import (
    email_user_approved,
    email_user_rejected,
)


APPROVE_ROLE_CHOICES = (
    ("staff", "Staff"),
    ("manager", "Manager"),
    ("admin", "Admin"),
)


class ApproveActionForm(forms.Form):
    role = forms.ChoiceField(choices=APPROVE_ROLE_CHOICES, required=True, initial="staff")
    note = forms.CharField(required=False, widget=forms.Textarea(attrs={"rows": 2}))


@admin.register(AppUser)
class AppUserAdmin(admin.ModelAdmin):
    list_display = ("email", "name", "role", "status", "credit_points", "created_at", "last_login")
    list_filter = ("role", "status")
    search_fields = ("email", "name")
    ordering = ("-created_at",)
    readonly_fields = ("created_at", "updated_at", "last_login")


@admin.register(AccessRequest)
class AccessRequestAdmin(admin.ModelAdmin):
    list_display = (
        "user_email",
        "user_name",
        "status",
        "created_at",
        "verified_at",
        "headshot_preview",
    )
    list_filter = ("status",)
    search_fields = ("user__email", "user__name")
    ordering = ("-created_at",)
    actions = ("approve_selected", "reject_selected")
    action_form = ApproveActionForm

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                "headshot/<uuid:pk>/",
                self.admin_site.admin_view(self.headshot_view),
                name="api_accessrequest_headshot",
            ),
        ]
        return custom + urls

    def user_email(self, obj):
        return obj.user.email

    def user_name(self, obj):
        return obj.user.name

    user_email.short_description = "Email"
    user_name.short_description = "Name"

    def headshot_preview(self, obj):
        if not obj.headshot:
            return "—"
        try:
            url = reverse("admin:api_accessrequest_headshot", args=[obj.pk])
            return f'<img src="{url}" alt="headshot" style="max-height:80px;border-radius:6px;border:1px solid #ddd;" />'
        except Exception:
            return "(image)"

    headshot_preview.allow_tags = True
    headshot_preview.short_description = "Headshot"

    def headshot_view(self, request, pk):
        if not request.user.is_authenticated or not request.user.is_staff:
            return HttpResponseForbidden("Forbidden")
        try:
            ar = AccessRequest.objects.get(pk=pk)
        except AccessRequest.DoesNotExist:
            raise Http404("Not found")
        if not ar.headshot:
            raise Http404("No headshot")
        f = ar.headshot.open("rb")
        # Try to guess content type by extension
        name = getattr(ar.headshot, "name", "headshot.jpg")
        if name.endswith(".png"):
            ctype = "image/png"
        elif name.endswith(".webp"):
            ctype = "image/webp"
        else:
            ctype = "image/jpeg"
        return FileResponse(f, content_type=ctype)

    @admin.action(description="Approve and assign role")
    def approve_selected(self, request, queryset):
        role = request.POST.get("role") or "staff"
        note = (request.POST.get("note") or "").strip()
        if role not in dict(APPROVE_ROLE_CHOICES):
            role = "staff"
        count = 0
        for ar in queryset:
            try:
                ar.status = AccessRequest.STATUS_APPROVED
                ar.verified_at = timezone.now()
                ar.verified_by = request.user.get_username()
                if note:
                    ar.notes = (ar.notes or "") + ("\n" if ar.notes else "") + note
                ar.save()
                # Activate and set role
                u = ar.user
                u.role = role
                u.status = "active"
                u.save(update_fields=["role", "status"])
                try:
                    email_user_approved(u)
                except Exception:
                    pass
                count += 1
            except Exception:
                continue
        self.message_user(request, f"Approved {count} request(s) as {role}.", messages.SUCCESS)

    @admin.action(description="Reject selected")
    def reject_selected(self, request, queryset):
        note = (request.POST.get("note") or "").strip()
        count = 0
        for ar in queryset:
            try:
                ar.status = AccessRequest.STATUS_REJECTED
                ar.verified_at = timezone.now()
                ar.verified_by = request.user.get_username()
                if note:
                    ar.notes = (ar.notes or "") + ("\n" if ar.notes else "") + note
                ar.save()
                # Keep user disabled/pending
                u = ar.user
                if (u.status or "").lower() != "active":
                    u.status = "pending"
                    u.save(update_fields=["status"])
                try:
                    email_user_rejected(u, note)
                except Exception:
                    pass
                count += 1
            except Exception:
                continue
        self.message_user(request, f"Rejected {count} request(s).", messages.WARNING)


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "price", "available", "updated_at")
    list_filter = ("available", "category")
    search_fields = ("name", "description", "category")
    ordering = ("name",)


@admin.register(PaymentProof)
class PaymentProofAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "order_number",
        "status",
        "amount",
        "submitted_by",
        "created_at",
    )
    list_filter = ("status", "created_at")
    search_fields = ("order__order_number", "reference_number", "submitted_by__email")
    readonly_fields = ("created_at", "updated_at", "proof_preview")
    ordering = ("-created_at",)

    def order_number(self, obj):
        return getattr(obj.order, "order_number", "")

    order_number.short_description = "Order #"

    def proof_preview(self, obj):
        if not obj.proof_image:
            return ""
        try:
            return format_html(
                '<img src="{}" alt="proof" style="max-height:160px;border-radius:6px;border:1px solid #ddd;" />',
                obj.proof_image.url,
            )
        except Exception:
            return "(image)"

    proof_preview.short_description = "Proof"
