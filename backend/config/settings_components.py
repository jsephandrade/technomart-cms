import os
from pathlib import Path


def _env_bool(key: str, default: bool = False) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val in {"1", "true", "True", "yes", "on"}


def get_database(BASE_DIR: Path):
    """Return the MySQL database configuration used across all environments."""
    DB_NAME = os.getenv("DJANGO_DB_NAME", "technomart")
    DB_USER = os.getenv("DJANGO_DB_USER", "tm_user")
    DB_PASSWORD = os.getenv("DJANGO_DB_PASSWORD", "tm_password")
    DB_HOST = os.getenv("DJANGO_DB_HOST", "mysql")  # default to docker-compose service name
    DB_PORT = os.getenv("DJANGO_DB_PORT", "3306")
    try:
        DB_CONN_MAX_AGE = int(os.getenv("DJANGO_DB_CONN_MAX_AGE", "60") or 60)
    except Exception:
        DB_CONN_MAX_AGE = 60

    return {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": DB_NAME,
            "USER": DB_USER,
            "PASSWORD": DB_PASSWORD,
            "HOST": DB_HOST,
            "PORT": DB_PORT,
            "CONN_MAX_AGE": DB_CONN_MAX_AGE,
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }


def get_cors():
    allowed = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]
    headers = list(
        set(
            [
                "accept",
                "accept-encoding",
                "authorization",
                "content-type",
                "dnt",
                "origin",
                "idempotency-key",
                "user-agent",
                "x-csrftoken",
                "x-requested-with",
            ]
        )
    )
    return allowed, headers


def get_jwt():
    from django.conf import settings as dj_settings  # late import

    JWT_SECRET = os.getenv("DJANGO_JWT_SECRET", dj_settings.SECRET_KEY)
    JWT_ALGORITHM = os.getenv("DJANGO_JWT_ALG", "HS256")
    try:
        JWT_EXP_SECONDS = int(os.getenv("DJANGO_JWT_EXP_SECONDS", "3600"))
    except Exception:
        JWT_EXP_SECONDS = 3600
    try:
        JWT_REMEMBER_EXP_SECONDS = int(
            os.getenv("DJANGO_JWT_REMEMBER_SECONDS", str(30 * 24 * 60 * 60))
        )
    except Exception:
        JWT_REMEMBER_EXP_SECONDS = 30 * 24 * 60 * 60
    try:
        JWT_REFRESH_EXP_SECONDS = int(
            os.getenv("DJANGO_JWT_REFRESH_SECONDS", str(7 * 24 * 60 * 60))
        )
    except Exception:
        JWT_REFRESH_EXP_SECONDS = 7 * 24 * 60 * 60
    try:
        JWT_REFRESH_REMEMBER_EXP_SECONDS = int(
            os.getenv(
                "DJANGO_JWT_REFRESH_REMEMBER_SECONDS", str(30 * 24 * 60 * 60)
            )
        )
    except Exception:
        JWT_REFRESH_REMEMBER_EXP_SECONDS = 30 * 24 * 60 * 60
    return {
        "JWT_SECRET": JWT_SECRET,
        "JWT_ALGORITHM": JWT_ALGORITHM,
        "JWT_EXP_SECONDS": JWT_EXP_SECONDS,
        "JWT_REMEMBER_EXP_SECONDS": JWT_REMEMBER_EXP_SECONDS,
        "JWT_REFRESH_EXP_SECONDS": JWT_REFRESH_EXP_SECONDS,
        "JWT_REFRESH_REMEMBER_EXP_SECONDS": JWT_REFRESH_REMEMBER_EXP_SECONDS,
    }


def _parse_admins(raw: str):
    out = []
    if not raw:
        return out
    parts = [x.strip() for x in raw.split(",") if x.strip()]
    for p in parts:
        if "<" in p and ">" in p:
            name = p.split("<", 1)[0].strip()
            email = p.split("<", 1)[1].split(">", 1)[0].strip()
        else:
            name = p
            email = p
        if email:
            out.append((name or email, email))
    return out


def get_email():
    EMAIL_BACKEND = os.getenv(
        "DJANGO_EMAIL_BACKEND",
        "django.core.mail.backends.console.EmailBackend",
    )
    DEFAULT_FROM_EMAIL = os.getenv("DJANGO_DEFAULT_FROM_EMAIL", "no-reply@canteen.local")
    SERVER_EMAIL = os.getenv("DJANGO_SERVER_EMAIL", DEFAULT_FROM_EMAIL)
    try:
        EMAIL_PORT = int(os.getenv("DJANGO_EMAIL_PORT", "25"))
    except Exception:
        EMAIL_PORT = 25

    cfg = {
        "EMAIL_BACKEND": EMAIL_BACKEND,
        "DEFAULT_FROM_EMAIL": DEFAULT_FROM_EMAIL,
        "SERVER_EMAIL": SERVER_EMAIL,
        "EMAIL_HOST": os.getenv("DJANGO_EMAIL_HOST", "localhost"),
        "EMAIL_PORT": EMAIL_PORT,
        "EMAIL_HOST_USER": os.getenv("DJANGO_EMAIL_HOST_USER", ""),
        "EMAIL_HOST_PASSWORD": os.getenv("DJANGO_EMAIL_HOST_PASSWORD", ""),
        "EMAIL_USE_TLS": _env_bool("DJANGO_EMAIL_USE_TLS", False),
        "EMAIL_USE_SSL": _env_bool("DJANGO_EMAIL_USE_SSL", False),
        "ADMINS": _parse_admins(os.getenv("DJANGO_ADMINS", "")),
        "EMAIL_SUBJECT_PREFIX": os.getenv("DJANGO_EMAIL_SUBJECT_PREFIX", "[Canteen]"),
    }
    return cfg

def get_channel_layers():
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    return {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [redis_url],
            },
        }
    }
