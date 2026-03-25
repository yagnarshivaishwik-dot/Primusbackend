import asyncio
import json
import logging
import os
import random
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar, cast

try:
    from prometheus_client import Counter as _RealCounter
except Exception:  # pragma: no cover
    _RealCounter = None  # type: ignore[assignment]

    class _DummyCounter:  # type: ignore[too-many-instance-attributes]
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def labels(self, **kwargs: Any) -> "_DummyCounter":
            return self

        def inc(self, amount: float = 1.0) -> None:
            return None

    Counter = _DummyCounter  # type: ignore[assignment]
else:
    Counter = _RealCounter

try:
    from redis.asyncio import Redis
except Exception:  # pragma: no cover
    Redis = None  # type: ignore[assignment]


logger = logging.getLogger(__name__)

T = TypeVar("T")


CACHE_HITS = Counter(
    "primus_cache_hits",
    "Number of cache hits in Primus Redis cache",
    ["cache_name"],
)
CACHE_MISSES = Counter(
    "primus_cache_misses",
    "Number of cache misses in Primus Redis cache",
    ["cache_name"],
)


class RedisCacheConfig:
    def __init__(self) -> None:
        self.redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
        self.redis_password = os.getenv("REDIS_PASSWORD") or None
        self.redis_namespace = os.getenv("REDIS_NAMESPACE", "primus")
        self.default_ttl = int(os.getenv("CACHE_DEFAULT_TTL", "300"))
        self.max_connections = int(os.getenv("REDIS_CONNECTION_MAX", "50"))
        self.environment = os.getenv("ENVIRONMENT", "development")
        self.version = os.getenv("CACHE_VERSION", "v1")


_config = RedisCacheConfig()
_redis: Redis | None = None
_redis_lock = asyncio.Lock()
_redis_available: bool = False


async def init_redis_client() -> None:
    global _redis, _redis_available

    if Redis is None:
        logger.warning("redis.asyncio is not installed; Redis caching is disabled")
        _redis_available = False
        return

    async with _redis_lock:
        if _redis is not None:
            return

        try:
            _redis = Redis.from_url(
                _config.redis_url,
                password=_config.redis_password,
                max_connections=_config.max_connections,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
                decode_responses=True,
            )
            await _redis.ping()
            _redis_available = True
            logger.info("Connected to Redis for caching at %s", _config.redis_url)
        except Exception as exc:  # pragma: no cover - network issues
            logger.error("Failed to initialize Redis client: %s", exc)
            _redis = None
            _redis_available = False


async def close_redis_client() -> None:
    global _redis, _redis_available
    if _redis is not None:
        try:
            await _redis.close()
            logger.info("Redis client closed")
        except Exception as exc:  # pragma: no cover - network issues
            logger.warning("Error closing Redis client: %s", exc)
    _redis = None
    _redis_available = False


async def get_redis() -> Redis | None:
    if not _redis_available:
        return None
    return _redis


def _jit_ttl(base_ttl: int) -> int:
    if base_ttl <= 0:
        return 0
    jitter = random.randint(-int(base_ttl * 0.1), int(base_ttl * 0.1))
    return max(1, base_ttl + jitter)


def _namespaced_key(key_type: str, identifier: str, version: str | None = None) -> str:
    ver = version or _config.version
    env = _config.environment or "development"
    return f"primus:{env}:{ver}:{key_type}:{identifier}"


def _dumps(value: Any) -> str:
    try:
        import orjson

        return cast(str, orjson.dumps(value).decode("utf-8"))
    except Exception:  # pragma: no cover - optional dependency
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def _loads(value: str) -> Any:
    try:
        import orjson

        return orjson.loads(value)
    except Exception:  # pragma: no cover - optional dependency
        return json.loads(value)


async def get_json(
    key_type: str,
    identifier: str,
    cache_name: str,
    version: str | None = None,
) -> Any | None:
    redis = await get_redis()
    if redis is None:
        CACHE_MISSES.labels(cache_name=cache_name).inc()
        return None

    key = _namespaced_key(key_type, identifier, version)
    try:
        raw = await redis.get(key)
        if raw is None:
            CACHE_MISSES.labels(cache_name=cache_name).inc()
            return None
        CACHE_HITS.labels(cache_name=cache_name).inc()
        return _loads(raw)
    except Exception as exc:  # pragma: no cover - network issues
        logger.warning("Redis get_json failed for key %s: %s", key, exc)
        CACHE_MISSES.labels(cache_name=cache_name).inc()
        return None


async def set_json(
    key_type: str,
    identifier: str,
    value: Any,
    cache_name: str,
    ttl: int | None = None,
    version: str | None = None,
) -> None:
    redis = await get_redis()
    if redis is None:
        return

    key = _namespaced_key(key_type, identifier, version)
    payload = _dumps(value)
    expires_in = _jit_ttl(ttl or _config.default_ttl)

    try:
        await redis.set(key, payload, ex=expires_in)
    except Exception as exc:  # pragma: no cover - network issues
        logger.warning("Redis set_json failed for key %s: %s", key, exc)


ComputeFunc = Callable[[], Awaitable[T]]


async def get_or_set(
    key_type: str,
    identifier: str,
    cache_name: str,
    compute_func: ComputeFunc[T],
    ttl: int | None = None,
    version: str | None = None,
    stampede_key: str | None = None,
) -> T:
    cached = await get_json(key_type, identifier, cache_name, version)
    if cached is not None:
        return cast(T, cached)

    redis = await get_redis()
    lock_key = None
    have_lock = False

    if redis is not None and stampede_key:
        lock_key = _namespaced_key("lock", stampede_key, version)
        try:
            have_lock = await redis.set(lock_key, "1", ex=30, nx=True)
        except Exception as exc:  # pragma: no cover - network issues
            logger.warning("Redis SETNX lock failed for key %s: %s", lock_key, exc)

    if not have_lock and redis is not None:
        await asyncio.sleep(0.05)
        cached_again = await get_json(key_type, identifier, cache_name, version)
        if cached_again is not None:
            return cast(T, cached_again)

    result = await compute_func()
    await set_json(key_type, identifier, result, cache_name, ttl=ttl, version=version)

    if have_lock and redis is not None and lock_key:
        try:
            await redis.delete(lock_key)
        except Exception:
            pass

    return result


async def invalidate_keys(
    patterns: list[tuple[str, str]],
    version: str | None = None,
) -> None:
    redis = await get_redis()
    if redis is None:
        return

    try:
        ver = version or _config.version
        env = _config.environment or "development"
        for key_type, identifier in patterns:
            pattern = f"primus:{env}:{ver}:{key_type}:{identifier}"
            async for key in redis.scan_iter(match=pattern):
                try:
                    await redis.delete(key)
                except Exception:
                    logger.debug("Failed to delete cache key %s", key)
    except Exception as exc:  # pragma: no cover - network issues
        logger.warning("Redis invalidate_keys failed: %s", exc)


INVALIDATION_CHANNEL = "primus-cache-invalidate"


async def publish_invalidation(
    payload: dict[str, str | list[dict[str, str]]],
) -> None:
    redis = await get_redis()
    if redis is None:
        return
    try:
        message = _dumps(payload)
        await redis.publish(INVALIDATION_CHANNEL, message)
    except Exception as exc:  # pragma: no cover - network issues
        logger.warning("Redis publish_invalidation failed: %s", exc)


async def subscribe_invalidation_loop() -> None:
    redis = await get_redis()
    if redis is None:
        logger.info("Redis not available; invalidation subscriber disabled")
        return

    try:
        pubsub = redis.pubsub()
        await pubsub.subscribe(INVALIDATION_CHANNEL)
        logger.info("Subscribed to Redis invalidation channel %s", INVALIDATION_CHANNEL)

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            try:
                data = _loads(cast(str, message["data"]))
                items = data.get("items", [])
                patterns: list[tuple[str, str]] = []
                for item in items:
                    key_type = item.get("type")
                    identifier = item.get("id")
                    if key_type and identifier:
                        patterns.append((key_type, identifier))
                if patterns:
                    await invalidate_keys(patterns)
            except Exception as exc:
                logger.warning("Failed to process invalidation message: %s", exc)
    except Exception as exc:  # pragma: no cover - network issues
        logger.warning("Redis invalidation subscriber stopped: %s", exc)
