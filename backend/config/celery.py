import os
from celery import Celery
from celery.schedules import crontab

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('technomart')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

# Configure Celery to use Redis as broker and result backend
app.conf.update(
    broker_url=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    result_backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Manila',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

# Periodic tasks schedule
app.conf.beat_schedule = {
    'process-notification-outbox': {
        'task': 'api.tasks.process_notification_outbox',
        'schedule': crontab(minute='*/2'),  # Every 2 minutes
    },
    'auto-advance-orders': {
        'task': 'api.tasks.auto_advance_orders',
        'schedule': 10.0,  # Every 10 seconds
    },
    'auto-expire-no-show-orders': {
        'task': 'api.tasks.auto_expire_no_show_orders',
        'schedule': 60.0,  # Every 60 seconds
    },
    'cleanup-old-notifications': {
        'task': 'api.tasks.cleanup_old_notifications',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
