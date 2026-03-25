from typing import Any

import pytest

from app.utils import cache as cache_mod


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.deleted: list[str] = []
        self.published: list[tuple[str, str]] = []

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int) -> None:  # noqa: ARG002
        self.store[key] = value

    async def delete(self, key: str) -> None:
        self.deleted.append(key)
        self.store.pop(key, None)

    async def publish(self, channel: str, message: str) -> None:
        self.published.append((channel, message))


@pytest.mark.asyncio
async def test_get_or_set_miss_then_hit(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRedis()
    monkeypatch.setattr(cache_mod, "_redis", fake)
    monkeypatch.setattr(cache_mod, "_redis_available", True)

    calls: dict[str, int] = {"n": 0}

    async def compute() -> dict[str, Any]:
        calls["n"] += 1
        return {"value": 42}

    result1 = await cache_mod.get_or_set(
        "test_type",
        "id=1",
        "test_cache",
        compute,
        ttl=60,
        version="vtest",
        stampede_key="id=1",
    )
    result2 = await cache_mod.get_or_set(
        "test_type",
        "id=1",
        "test_cache",
        compute,
        ttl=60,
        version="vtest",
        stampede_key="id=1",
    )

    assert result1 == {"value": 42}
    assert result2 == {"value": 42}
    assert calls["n"] == 1


@pytest.mark.asyncio
async def test_get_json_miss_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _BrokenRedis(_FakeRedis):
        async def get(self, key: str) -> str | None:  # noqa: ARG002
            raise RuntimeError("boom")

    fake = _BrokenRedis()
    monkeypatch.setattr(cache_mod, "_redis", fake)
    monkeypatch.setattr(cache_mod, "_redis_available", True)

    value = await cache_mod.get_json("type", "id", "test_cache")
    assert value is None


@pytest.mark.asyncio
async def test_invalidation_deletes_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRedis()
    fake.store["primus:test:v1:test_type:foo"] = "1"
    fake.store["primus:test:v1:test_type:bar"] = "2"
    monkeypatch.setattr(cache_mod, "_redis", fake)
    monkeypatch.setattr(cache_mod, "_redis_available", True)
    monkeypatch.setattr(cache_mod, "_config", cache_mod.RedisCacheConfig())
    cache_mod._config.environment = "test"  # type: ignore[attr-defined]

    async def _scan_iter(match: str):  # type: ignore[override]
        for key in list(fake.store.keys()):
            if key.startswith(match.rstrip("*")):
                yield key

    fake.scan_iter = _scan_iter  # type: ignore[attr-defined]

    await cache_mod.invalidate_keys([("test_type", "*")])
    assert fake.store == {}


@pytest.mark.asyncio
async def test_publish_invalidation_uses_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeRedis()
    monkeypatch.setattr(cache_mod, "_redis", fake)
    monkeypatch.setattr(cache_mod, "_redis_available", True)

    await cache_mod.publish_invalidation({"scope": "test", "items": []})
    assert any(ch == cache_mod.INVALIDATION_CHANNEL for ch, _ in fake.published)
