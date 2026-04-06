"""
Background task supervisor with automatic restart on failure.

Wraps asyncio coroutines so that a crash in one task does not
silently kill it — the supervisor logs the exception and restarts
the task after a configurable delay.
"""

import asyncio
import logging

logger = logging.getLogger("primus.tasks.supervisor")


async def supervised_task(
    name: str,
    coro_fn,
    restart_delay: float = 5.0,
    max_rapid_restarts: int = 10,
    rapid_restart_window: float = 60.0,
):
    """
    Run *coro_fn()* in a loop with automatic restart on failure.

    Args:
        name: Human-readable task name for logging.
        coro_fn: An async callable (no arguments) that runs the task.
        restart_delay: Seconds to wait before restarting after a crash.
        max_rapid_restarts: If the task crashes this many times within
            *rapid_restart_window* seconds, increase delay exponentially
            to avoid a tight crash loop.
        rapid_restart_window: Window in seconds for counting rapid restarts.
    """
    restart_times: list[float] = []
    current_delay = restart_delay

    while True:
        try:
            logger.info("[supervisor] Starting task: %s", name)
            await coro_fn()
            # If the coroutine returns normally, it has completed — exit the loop.
            logger.info("[supervisor] Task %s completed normally", name)
            break
        except asyncio.CancelledError:
            logger.info("[supervisor] Task %s cancelled — shutting down", name)
            break
        except Exception:
            logger.exception("[supervisor] Task %s crashed", name)

            # Track rapid restart frequency
            now = asyncio.get_event_loop().time()
            restart_times = [t for t in restart_times if now - t < rapid_restart_window]
            restart_times.append(now)

            if len(restart_times) >= max_rapid_restarts:
                current_delay = min(current_delay * 2, 300)  # Cap at 5 minutes
                logger.warning(
                    "[supervisor] Task %s crashed %d times in %.0fs — "
                    "increasing restart delay to %.0fs",
                    name,
                    len(restart_times),
                    rapid_restart_window,
                    current_delay,
                )
            else:
                current_delay = restart_delay

            logger.info("[supervisor] Restarting task %s in %.0fs", name, current_delay)
            await asyncio.sleep(current_delay)
