"""Profile picture storage backend.

Production: Azure Blob Storage container (default `profile-pictures`).
Dev/CI fallback: local filesystem under `uploads/avatars/` served via
`/static/avatars/` so the kiosk works without Azure credentials.

Selection rule:
- If `AZURE_STORAGE_CONNECTION_STRING` (or `AZURE_STORAGE_ACCOUNT_URL` +
  `AZURE_STORAGE_ACCOUNT_KEY`) is set, the Azure backend is used.
- Otherwise the local backend is used. Logs at startup tell you which.

Blob layout: ``profile-pictures/{user_id}/{utc_timestamp}.{ext}``.
Each upload writes a unique key, so two near-simultaneous uploads from
different cafes don't collide. The previous blob (if any) is deleted
best-effort after the new URL is committed in the database.
"""
from __future__ import annotations

import logging
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

# 5 MiB hard cap per the spec. Note `MAX_AVATAR_BYTES` (2 MiB) on the
# legacy `/api/me/avatar` route is intentionally untouched.
MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024


# ---------------------------------------------------------------------------
# Backend interface
# ---------------------------------------------------------------------------


class ProfilePictureBackend(ABC):
    """Abstract storage backend for profile pictures."""

    backend_name: str = "abstract"

    @abstractmethod
    def upload(self, *, user_id: int, content: bytes, mime: str) -> str:
        """Upload `content` and return a publicly-fetchable URL."""

    @abstractmethod
    def delete(self, url: str) -> None:
        """Delete the blob/file at `url` (best-effort)."""


# ---------------------------------------------------------------------------
# Local-disk backend (dev/CI fallback)
# ---------------------------------------------------------------------------


class LocalProfilePictureBackend(ProfilePictureBackend):
    """Stores files under `uploads/avatars/`. URLs are built relative to the
    request base URL by the caller via :meth:`build_local_url`.
    """

    backend_name = "local"

    def __init__(self, base_dir: str | os.PathLike[str] | None = None) -> None:
        self._base_dir = Path(base_dir or os.getenv("AVATAR_DIR", "uploads/avatars"))
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def upload(self, *, user_id: int, content: bytes, mime: str) -> str:
        ext = ALLOWED_MIME.get(mime, ".jpg")
        # Filename includes uuid to defeat collisions on identical timestamps.
        fname = f"{user_id}-{uuid.uuid4().hex}{ext}"
        (self._base_dir / fname).write_bytes(content)
        # Return the relative public path; caller composes the absolute URL.
        return f"/static/avatars/{fname}"

    def delete(self, url: str) -> None:
        if not url:
            return
        parsed = urlparse(url)
        # Accept absolute URLs (`http://host/static/avatars/foo.jpg`) and
        # relative paths (`/static/avatars/foo.jpg`).
        path = parsed.path or url
        if "/static/avatars/" not in path:
            return
        try:
            name = path.rsplit("/", 1)[-1]
            (self._base_dir / name).unlink(missing_ok=True)
        except Exception:  # pragma: no cover - best-effort
            logger.debug("Local avatar delete failed for %s", url, exc_info=True)


# ---------------------------------------------------------------------------
# Azure Blob backend
# ---------------------------------------------------------------------------


class AzureProfilePictureBackend(ProfilePictureBackend):
    """Backed by an Azure Blob Storage container.

    The container is created (and made public-read) on first use unless
    `AZURE_PROFILE_PICTURES_PUBLIC=0` is set, in which case URLs are
    expected to be served via SAS or a CDN front. The simple
    public-container option matches the spec's "URL saved into DB and
    fetched directly by the client".
    """

    backend_name = "azure"

    def __init__(
        self,
        *,
        container_name: str,
        connection_string: str | None,
        account_url: str | None,
        account_key: str | None,
        public: bool,
    ) -> None:
        # Imported lazily so tests / minimal installs don't pay the
        # cost when Azure isn't configured.
        from azure.storage.blob import BlobServiceClient, PublicAccess

        if connection_string:
            self._service = BlobServiceClient.from_connection_string(connection_string)
        elif account_url and account_key:
            self._service = BlobServiceClient(
                account_url=account_url, credential=account_key
            )
        else:
            raise ValueError("Azure Blob Storage credentials missing.")

        self._container_name = container_name
        self._public = public
        self._container = self._service.get_container_client(container_name)
        try:
            self._container.create_container(
                public_access=PublicAccess.Blob if public else None
            )
            logger.info("Created Azure container '%s' (public=%s)", container_name, public)
        except Exception:
            # 409 ContainerAlreadyExists is expected on every run after the first.
            logger.debug("Azure container '%s' already exists (or creation skipped).", container_name)

    def _blob_name(self, user_id: int, mime: str) -> str:
        ext = ALLOWED_MIME.get(mime, ".jpg")
        # ISO-8601-ish, filesystem-safe: `2026-05-06T14-20-55-<uuid>.jpg`.
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
        return f"{user_id}/{ts}-{uuid.uuid4().hex[:8]}{ext}"

    def upload(self, *, user_id: int, content: bytes, mime: str) -> str:
        from azure.storage.blob import ContentSettings

        blob_name = self._blob_name(user_id, mime)
        blob = self._container.get_blob_client(blob_name)
        blob.upload_blob(
            content,
            overwrite=True,
            content_settings=ContentSettings(
                content_type=mime,
                cache_control="public, max-age=31536000, immutable",
            ),
        )
        return blob.url

    def delete(self, url: str) -> None:
        if not url:
            return
        try:
            parsed = urlparse(url)
            # Path: /<container>/<user_id>/<filename>
            parts = parsed.path.lstrip("/").split("/", 1)
            if len(parts) < 2 or parts[0] != self._container_name:
                # URL points to a different container — leave alone.
                return
            blob_name = parts[1]
            self._container.get_blob_client(blob_name).delete_blob()
        except Exception:  # pragma: no cover - best-effort
            logger.debug("Azure blob delete failed for %s", url, exc_info=True)


# ---------------------------------------------------------------------------
# Backend selection
# ---------------------------------------------------------------------------


_backend: ProfilePictureBackend | None = None


def get_backend() -> ProfilePictureBackend:
    """Return the singleton storage backend.

    Selection happens once per process: switching from local to Azure
    therefore requires an app restart, which is the intended behaviour
    for a kiosk fleet.
    """
    global _backend
    if _backend is not None:
        return _backend

    container_name = os.getenv("AZURE_PROFILE_PICTURES_CONTAINER", "profile-pictures")
    public = os.getenv("AZURE_PROFILE_PICTURES_PUBLIC", "1") not in {"0", "false", "False"}

    conn = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL")
    account_key = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")

    if conn or (account_url and account_key):
        try:
            _backend = AzureProfilePictureBackend(
                container_name=container_name,
                connection_string=conn,
                account_url=account_url,
                account_key=account_key,
                public=public,
            )
            logger.info("Profile pictures: using Azure Blob Storage (container=%s).", container_name)
            return _backend
        except Exception:
            logger.exception("Azure Blob backend init failed; falling back to local disk.")

    _backend = LocalProfilePictureBackend()
    logger.info("Profile pictures: using local disk (uploads/avatars/). Set AZURE_STORAGE_CONNECTION_STRING for production.")
    return _backend


def reset_backend_for_tests() -> None:
    """Test helper — drop the cached backend so env changes take effect."""
    global _backend
    _backend = None


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def to_absolute_url(url: str, *, base_url: str) -> str:
    """If the backend returned a relative path (`/static/avatars/foo.jpg`),
    promote it to an absolute URL using the request's base URL.
    """
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    return base_url.rstrip("/") + url
