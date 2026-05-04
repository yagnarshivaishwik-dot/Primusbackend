"""Phase 7 storage abstraction.

Audit reference: master report Section E.3 + master verdict G.2.

Today screenshots and uploads are written to local disk
(`/app/uploads`, `/app/screenshots`). That breaks the moment we run more
than one backend replica, and it can never survive a container restart in
a stateless deploy. Phase 7 introduces a small ObjectStore abstraction
with two backends:

  - LocalDiskStore  — exact preservation of existing behavior (default)
  - S3CompatibleStore — boto3 against any S3-compatible service:
      AWS S3, Cloudflare R2, Backblaze B2, MinIO

Selection is driven by `PRIMUS_STORAGE_BACKEND`:
  unset / "local"  → LocalDiskStore
  "s3"             → S3CompatibleStore (requires PRIMUS_S3_* env vars)

The module exposes one function `get_object_store()` returning a
singleton. Endpoint code calls `store.put`, `store.signed_url`,
`store.delete` and the rest. No endpoint should construct a backend
directly.

Multi-tenant scoping:
  Every key is prefixed with `cafe_id/<id>/` so a misconfigured ACL
  cannot expose another cafe's screenshots.
"""

from __future__ import annotations

import io
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO, Optional


logger = logging.getLogger("primus.storage")


class ObjectStore(ABC):
    """Minimal interface every backend must satisfy."""

    @abstractmethod
    def put(
        self,
        key: str,
        body: bytes | BinaryIO,
        *,
        content_type: str = "application/octet-stream",
        cafe_id: int | None = None,
    ) -> str:
        """Persist `body` at `key`. Returns the canonical key (with prefix)."""

    @abstractmethod
    def get(self, key: str, *, cafe_id: int | None = None) -> bytes:
        """Return the bytes for the key. Raises FileNotFoundError on miss."""

    @abstractmethod
    def signed_url(
        self,
        key: str,
        *,
        cafe_id: int | None = None,
        expires_in: int = 3600,
    ) -> str:
        """Return a temporary URL the browser can fetch directly."""

    @abstractmethod
    def delete(self, key: str, *, cafe_id: int | None = None) -> bool:
        """Delete the key. Returns True if a row was removed."""


def _scope(cafe_id: int | None, key: str) -> str:
    """Apply tenant scoping. Cafe-id is required in production-like
    deployments and skipped only when None is explicitly passed (used by
    a few global assets like brand logos)."""
    key = key.lstrip("/")
    if cafe_id is None:
        return f"global/{key}"
    return f"cafe_id/{int(cafe_id)}/{key}"


# --- local disk backend ----------------------------------------------------

class LocalDiskStore(ObjectStore):
    """Preserves the legacy behaviour: write under a host directory.

    NOT safe across replicas. Production should set
    PRIMUS_STORAGE_BACKEND=s3.
    """

    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, scoped_key: str) -> Path:
        # Defense-in-depth path-traversal check: resolve under root and verify.
        p = (self.root / scoped_key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError(f"local store: key {scoped_key!r} escapes root")
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def put(self, key, body, *, content_type="application/octet-stream", cafe_id=None):
        scoped = _scope(cafe_id, key)
        path = self._path(scoped)
        if isinstance(body, (bytes, bytearray)):
            path.write_bytes(bytes(body))
        else:
            with path.open("wb") as fh:
                # streaming copy to bound memory
                while chunk := body.read(64 * 1024):
                    fh.write(chunk)
        return scoped

    def get(self, key, *, cafe_id=None):
        scoped = _scope(cafe_id, key)
        path = self._path(scoped)
        if not path.exists():
            raise FileNotFoundError(scoped)
        return path.read_bytes()

    def signed_url(self, key, *, cafe_id=None, expires_in=3600):
        # Local backend: the key is served by FastAPI through an
        # auth-gated route. Return a synthesized URL the FE can rewrite.
        # Real signed URLs only make sense against S3.
        scoped = _scope(cafe_id, key)
        return f"/api/storage/local/{scoped}"

    def delete(self, key, *, cafe_id=None):
        scoped = _scope(cafe_id, key)
        path = self._path(scoped)
        if path.exists():
            path.unlink()
            return True
        return False


# --- S3-compatible backend -------------------------------------------------

class S3CompatibleStore(ObjectStore):
    """Works against AWS S3 and any compatible service (R2, B2, MinIO).

    Env vars required:
      PRIMUS_S3_ENDPOINT       e.g., https://<account>.r2.cloudflarestorage.com
      PRIMUS_S3_REGION         e.g., auto (R2) or us-east-1 (AWS)
      PRIMUS_S3_BUCKET         destination bucket name
      PRIMUS_S3_ACCESS_KEY_ID
      PRIMUS_S3_SECRET_KEY     (read from secrets store, not committed)
      PRIMUS_S3_FORCE_PATH_STYLE  optional; "true" for MinIO/R2

    boto3 is the implementation. We import lazily so deployments without
    the dependency installed still load the module (the LocalDiskStore
    stays usable).
    """

    def __init__(self) -> None:
        try:
            import boto3  # type: ignore
            from botocore.config import Config  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "S3CompatibleStore requires boto3; install via "
                "`pip install boto3` and rebuild the image"
            ) from exc

        self.bucket = os.environ["PRIMUS_S3_BUCKET"]
        endpoint = os.environ["PRIMUS_S3_ENDPOINT"]
        region = os.environ.get("PRIMUS_S3_REGION") or "auto"
        force_path = os.environ.get("PRIMUS_S3_FORCE_PATH_STYLE", "false").lower() == "true"

        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=os.environ["PRIMUS_S3_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["PRIMUS_S3_SECRET_KEY"],
            config=Config(
                s3={"addressing_style": "path" if force_path else "virtual"},
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    def put(self, key, body, *, content_type="application/octet-stream", cafe_id=None):
        scoped = _scope(cafe_id, key)
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        else:
            data = body.read()
        self._client.put_object(
            Bucket=self.bucket,
            Key=scoped,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return scoped

    def get(self, key, *, cafe_id=None):
        scoped = _scope(cafe_id, key)
        try:
            resp = self._client.get_object(Bucket=self.bucket, Key=scoped)
        except self._client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
            raise FileNotFoundError(scoped)
        return resp["Body"].read()

    def signed_url(self, key, *, cafe_id=None, expires_in=3600):
        scoped = _scope(cafe_id, key)
        # Cap expires_in to 1 day so a leaked URL has bounded lifetime.
        expires_in = max(60, min(int(expires_in), 86400))
        return self._client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self.bucket, "Key": scoped},
            ExpiresIn=expires_in,
        )

    def delete(self, key, *, cafe_id=None):
        scoped = _scope(cafe_id, key)
        self._client.delete_object(Bucket=self.bucket, Key=scoped)
        return True


# --- factory ---------------------------------------------------------------

_singleton: ObjectStore | None = None


def get_object_store() -> ObjectStore:
    """Return the process-wide ObjectStore instance, building it on first use."""
    global _singleton
    if _singleton is not None:
        return _singleton

    backend = (os.getenv("PRIMUS_STORAGE_BACKEND") or "local").strip().lower()
    if backend == "s3":
        _singleton = S3CompatibleStore()
        logger.info("storage: S3-compatible backend initialized (bucket=%s)",
                    os.environ.get("PRIMUS_S3_BUCKET", "?"))
    else:
        root = os.getenv("PRIMUS_LOCAL_STORAGE_ROOT") or "/app/uploads"
        _singleton = LocalDiskStore(root)
        logger.info("storage: local-disk backend initialized at %s", root)
    return _singleton
