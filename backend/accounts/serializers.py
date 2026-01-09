import re
from django.contrib.auth.hashers import make_password
from api.models import AppUser
from api.views_common import _extract_dataurl_image
from rest_framework import serializers


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(write_only=True)
    last_name = serializers.CharField(write_only=True)
    id_image = serializers.CharField(write_only=True)

    class Meta:
        model = AppUser
        fields = [
            "email",
            "role",
            "password",
            "confirm",
            "first_name",
            "last_name",
            "id_image",
        ]

    def _password_issues(self, password, email, first_name, last_name):
        issues = []
        pwd = str(password or "")
        if len(pwd) < 12:
            issues.append("Password must be at least 12 characters.")
        if not re.search(r"[A-Z]", pwd):
            issues.append("Password must include at least 1 uppercase letter.")
        if not re.search(r"[a-z]", pwd):
            issues.append("Password must include at least 1 lowercase letter.")
        if not re.search(r"[0-9]", pwd):
            issues.append("Password must include at least 1 number.")
        if not re.search(r"[^A-Za-z0-9]", pwd):
            issues.append("Password must include at least 1 symbol.")
        if re.search(r"\s", pwd):
            issues.append("Password must not contain spaces.")

        lower_pwd = pwd.lower()
        email_value = str(email or "").strip().lower()
        email_local = email_value.split("@")[0] if email_value else ""
        if email_value and email_value in lower_pwd:
            issues.append("Password must not include your email.")
        elif email_local and email_local in lower_pwd:
            issues.append("Password must not include your email.")

        first_value = str(first_name or "").strip().lower()
        last_value = str(last_name or "").strip().lower()
        if first_value and first_value in lower_pwd:
            issues.append("Password must not include your first name.")
        if last_value and last_value in lower_pwd:
            issues.append("Password must not include your last name.")

        return issues

    def validate(self, attrs):
        errors = {}
        password = attrs.get("password") or ""
        confirm = attrs.get("confirm") or ""
        email = attrs.get("email") or ""
        first_name = attrs.get("first_name") or ""
        last_name = attrs.get("last_name") or ""
        id_image = attrs.get("id_image") or ""

        if password != confirm:
            errors["confirm"] = "Passwords do not match"

        pwd_issues = self._password_issues(
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        if pwd_issues:
            errors["password"] = pwd_issues
        if not id_image:
            errors["id_image"] = ["ID photo is required."]
        else:
            _, raw = _extract_dataurl_image(id_image)
            if not raw:
                errors["id_image"] = ["ID photo must be a valid image."]

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data.pop("confirm", None)
        first = validated_data.pop("first_name")
        last = validated_data.pop("last_name")
        validated_data.pop("id_image", None)
        validated_data["name"] = f"{first} {last}"
        user = AppUser(**validated_data)
        user.set_password(password)
        user.status = "pending"
        user.save()
        return user
