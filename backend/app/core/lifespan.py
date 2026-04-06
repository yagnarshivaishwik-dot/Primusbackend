"""
FastAPI lifespan context — startup and shutdown hooks.

Starts background tasks on startup, cleans up on shutdown.
Extracted from main.py for maintainability.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context.

    Starts supervised background tasks on startup
    and closes Redis on shutdown.
    """
    from app.tasks.presence import presence_monitor_loop
    from app.tasks.revenue_aggregation import revenue_aggregation_loop
    from app.tasks.supervisor import supervised_task
    from app.tasks.timeleft_broadcast import _broadcast_timeleft_loop
    from app.utils.cache import (
        close_redis_client,
        init_redis_client,
        subscribe_invalidation_loop,
    )

    # Start background tasks with supervisor (auto-restart on crash)
    try:
        asyncio.create_task(supervised_task("timeleft_broadcast", _broadcast_timeleft_loop))
        asyncio.create_task(supervised_task("presence_monitor", presence_monitor_loop))
        asyncio.create_task(supervised_task("revenue_aggregation", revenue_aggregation_loop))
    except Exception as e:
        logging.error(f"Failed to start background task: {e}")

    # Initialize Redis caching
    try:
        await init_redis_client()
        asyncio.create_task(supervised_task("cache_invalidation", subscribe_invalidation_loop))
    except Exception as e:  # pragma: no cover
        logging.error(f"Failed to initialize Redis caching: {e}")

    yield

    # Shutdown
    try:
        await close_redis_client()
    except Exception as e:  # pragma: no cover
        logging.error(f"Failed to close Redis client: {e}")
