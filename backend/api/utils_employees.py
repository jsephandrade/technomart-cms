from __future__ import annotations

from typing import Optional, Tuple

from django.db.models import CharField
from django.db.models.functions import Cast, Lower

from .models import Employee
from .views_common import _identifier_variants


def resolve_employee_ref(actor, *, allow_fallback: bool = True) -> Tuple[Optional[Employee], Optional[str]]:
    """Return the Employee linked to the actor plus a safe string identifier."""

    if not actor:
        return None, None

    try:
        actor_id = getattr(actor, "id", None)
    except Exception:
        actor_id = None
    if actor_id is None and isinstance(actor, dict):
        actor_id = actor.get("id") or actor.get("user_id") or actor.get("userId")

    # Try the direct relation first (works for new UUID-based rows)
    if actor_id:
        try:
            emp = Employee.objects.filter(user_id=actor_id).first()
        except Exception:
            emp = None
        else:
            if emp:
                return emp, str(emp.id)

    if not allow_fallback:
        return None, None

    # Legacy rows may store IDs as raw strings/integers; use annotations to avoid UUID casts
    try:
        qs = Employee.objects.annotate(
            id_str=Cast("id", CharField()),
            user_id_str=Cast("user_id", CharField()),
            contact_lower=Lower("contact"),
            name_lower=Lower("name"),
        ).values("id_str", "user_id_str", "contact_lower", "name_lower")
    except Exception:
        return None, None

    variants = _identifier_variants(actor_id)
    if variants:
        row = qs.filter(user_id_str__in=variants).first()
        if row:
            return None, row["id_str"]

    email = (getattr(actor, "email", "") or "").strip().lower()
    if not email and isinstance(actor, dict):
        email = (actor.get("email") or "").strip().lower()
    if email:
        row = qs.filter(contact_lower=email).first()
        if row:
            return None, row["id_str"]

    name_val = (getattr(actor, "name", "") or "").strip().lower()
    if not name_val and isinstance(actor, dict):
        name_val = (actor.get("name") or "").strip().lower()
    if name_val:
        row = qs.filter(name_lower=name_val).first()
        if row:
            return None, row["id_str"]

    return None, None
