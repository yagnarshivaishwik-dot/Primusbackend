"""
Celery application configuration.

Usage:
    # Start worker:
    celery -A app.celery_app worker --loglevel=info

    # Start beat scheduler:
    celery -A app.celery_app beat --loglevel=info

    # Start both (dev only):
    celery -A app.celery_app worker --beat --loglevel=info

Requires REDIS_URL (or CELERY_BROKER_URL) to be set.
"""

import os

from celery import Celery
from celery.schedules import crontab

BROKER_URL = os.getenv("CELERY_BROKER_URL", os.getenv("REDIS_URL", "redis://localhost:6379/1"))
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", BROKER_URL)

celery_app = Celery(
    "primus",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=[
        "app.tasks.celery_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Retry failed tasks up to 3 times with exponential backoff
    task_default_retry_delay=30,
    task_max_retries=3,
    # Result expiry: 1 hour
    result_expires=3600,
    # Beat schedule for periodic tasks
    beat_schedule={
        "revenue-aggregation-daily": {
            "task": "app.tasks.celery_tasks.revenue_aggregation_task",
            "schedule": crontab(hour=2, minute=0),  # 2:00 AM UTC daily
            "options": {"queue": "periodic"},
        },
        "presence-monitor": {
            "task": "app.tasks.celery_tasks.presence_monitor_task",
            "schedule": 15.0,  # Every 15 seconds
            "options": {"queue": "realtime"},
        },
    },
    # Task routing
    task_routes={
        "app.tasks.celery_tasks.revenue_aggregation_task": {"queue": "periodic"},
        "app.tasks.celery_tasks.presence_monitor_task": {"queue": "realtime"},
        "app.tasks.celery_tasks.refresh_materialized_views": {"queue": "periodic"},
    },
)
