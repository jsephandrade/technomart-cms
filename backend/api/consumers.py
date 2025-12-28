from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .views_common import _actor_from_token, _safe_user_from_db

logger = logging.getLogger(__name__)


async def _resolve_actor(token: str):
    if not token:
        return None
    return await sync_to_async(_actor_from_token, thread_sensitive=True)(token)


def _role_group(role: str) -> str:
    return f"role_{role.lower()}" if role else "role_staff"


def _user_group(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    return f"user_{user_id}"


def _sanitize_group(name: str) -> str:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    safe = "".join(ch if ch in allowed else "_" for ch in name)
    return safe[:100] or "broadcast"


class EventStreamConsumer(AsyncJsonWebsocketConsumer):
    """Unified websocket for broadcasting realtime events to clients."""

    actor = None
    groups_joined: set[str]

    async def connect(self):
        token = self._extract_token()
        actor = await _resolve_actor(token)
        if not actor:
            await self.close(code=4401)
            return

        self.actor = actor
        self.groups_joined = {"broadcast"}

        user_id = None
        role = "staff"
        try:
            if hasattr(actor, "id"):
                user_id = str(actor.id)
                role = (getattr(actor, "role", "staff") or "staff").lower()
            else:
                user_id = str(actor.get("id")) if actor.get("id") is not None else None
                role = (actor.get("role") or "staff").lower()
        except Exception:  # pragma: no cover - defensive only
            logger.exception("Failed to derive websocket groups for actor")

        role_group = _sanitize_group(_role_group(role))
        self.groups_joined.add(role_group)

        user_group = _user_group(user_id)
        if user_group:
            self.groups_joined.add(_sanitize_group(user_group))

        for group in self.groups_joined:
            await self.channel_layer.group_add(group, self.channel_name)

        await self.accept()
        safe_actor = None
        try:
            if hasattr(actor, "id"):
                safe_actor = _safe_user_from_db(actor)
        except Exception:
            safe_actor = None
        payload = {
            "userId": user_id,
            "role": role,
            "user": safe_actor,
        }
        await self.send_json({
            "type": "connection.ack",
            "event": "connection.established",
            "payload": payload,
        })

    async def disconnect(self, code):
        if getattr(self, "groups_joined", None):
            for group in self.groups_joined:
                try:
                    await self.channel_layer.group_discard(group, self.channel_name)
                except Exception:
                    continue
        self.actor = None
        self.groups_joined = set()

    async def receive_json(self, content, **kwargs):
        action = (content or {}).get("action")
        if action == "ping":
            await self.send_json({
                "type": "connection.pong",
                "event": "ping",
                "payload": {"message": "pong"},
            })
        elif action == "subscribe":
            await self.send_json({
                "type": "connection.ack",
                "event": "subscribe",
                "payload": {"status": "ok"},
            })
        else:
            await self.send_json({
                "type": "connection.error",
                "event": "unsupported_action",
                "payload": {"message": "Unsupported action"},
            })

    async def event_message(self, event):
        await self.send_json({
            "type": "event",
            "event": event.get("event"),
            "payload": event.get("payload"),
        })

    def _extract_token(self) -> Optional[str]:
        query = self.scope.get("query_string", b"") or b""
        if query:
            params = parse_qs(query.decode("utf-8"))
            token = params.get("token")
            if token:
                return token[0]
        headers = dict((name.lower(), value) for name, value in (self.scope.get("headers") or []))
        auth_header = headers.get(b"authorization")
        if auth_header:
            try:
                header_str = auth_header.decode("utf-8")
                if header_str.lower().startswith("bearer "):
                    return header_str.split(" ", 1)[1].strip()
            except Exception:
                logger.exception("Failed to parse Authorization header for websocket connection")
        cookies = self.scope.get("cookies") or {}
        try:
            from django.conf import settings as dj_settings
            cookie_name = getattr(dj_settings, "AUTH_COOKIE_ACCESS_NAME", "authToken")
        except Exception:
            cookie_name = "authToken"
        token = cookies.get(cookie_name)
        return token
