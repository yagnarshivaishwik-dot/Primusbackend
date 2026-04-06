import os
from typing import Any

import requests
from fastapi import HTTPException

VAULT_ADDR = os.getenv("VAULT_ADDR", "")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "")


def _get_headers() -> dict[str, str]:
    if not VAULT_ADDR or not VAULT_TOKEN:
        raise HTTPException(status_code=503, detail="Vault is not configured")
    return {"X-Vault-Token": VAULT_TOKEN}


def read_kv_secret(path: str) -> dict[str, Any]:
    """
    Read a KV v2 secret from Vault.

    Args:
        path: Path under /v1, e.g. "secret/data/clutchhh/db"
    """
    if not VAULT_ADDR or not VAULT_TOKEN:
        raise HTTPException(status_code=503, detail="Vault is not configured")

    url = f"{VAULT_ADDR}/v1/{path.lstrip('/')}"
    resp = requests.get(url, headers=_get_headers(), timeout=5)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Vault returned status {resp.status_code} for path {path}",
        )
    payload = resp.json()
    # KV v2 structure: { data: { data: {...}, metadata: {...} } }
    data = payload.get("data", {}).get("data")
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Unexpected Vault response format")
    return data


def get_db_credentials() -> dict[str, str]:
    """
    Fetch DB credentials from Vault KV v2 at secret/primus/db.
    """
    data = read_kv_secret("secret/data/clutchhh/db")
    return {
        "username": str(data.get("username", "")),
        "password": str(data.get("password", "")),
    }


def get_master_key() -> bytes:
    """
    Fetch AES-256-GCM master key from Vault KV v2 at secret/primus/master-key.

    If the key is missing, this raises; key creation/rotation should be handled by
    external scripts (see vault/ init scripts).
    """
    data = read_kv_secret("secret/data/clutchhh/master-key")
    key_hex = data.get("key")
    if not key_hex:
        raise HTTPException(status_code=500, detail="Master key not present in Vault")
    try:
        key = bytes.fromhex(str(key_hex))
    except ValueError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail="Invalid master key encoding") from exc
    if len(key) != 32:
        raise HTTPException(status_code=500, detail="Master key must be 32 bytes (AES-256)")
    return key
