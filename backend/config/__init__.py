# Use PyMySQL in environments without mysqlclient binaries.
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except Exception:
    pass

# This will make sure the app is always imported when
# Django starts so that shared_task will use this app.
try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except ImportError:
    # Celery not available, skip
    celery_app = None
    __all__ = ()
