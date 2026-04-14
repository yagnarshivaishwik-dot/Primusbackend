import os

from fastapi import APIRouter, Depends, HTTPException

from app.api.endpoints.auth import get_current_user, require_role
from app.utils.encryption import decrypt_value, encrypt_value
from app.utils.vault import get_db_credentials

router = APIRouter()

# Guard: These endpoints expose sensitive crypto operations.
# In production they are disabled entirely unless explicitly opted in.
_ENABLE_SECURITY_DEBUG = os.getenv("ENABLE_SECURITY_DEBUG_ENDPOINTS", "false").lower() == "true"
_IS_PRODUCTION = os.getenv("ENVIRONMENT", "").lower() == "production"


def _require_debug_endpoints():
    """Block access to security debug endpoints in production unless explicitly enabled."""
    if _IS_PRODUCTION and not _ENABLE_SECURITY_DEBUG:
        raise HTTPException(
            status_code=404,
            detail="Not found",
        )


@router.get("/vault/db-creds")
def vault_db_creds(
    _guard=Depends(_require_debug_endpoints),
    current_user=Depends(require_role("superadmin")),
):
    """
    Return current DB credentials as stored in Vault.
    Restricted to superadmin only. Disabled in production by default.
    """
    creds = get_db_credentials()
    return {"source": "vault", "username": creds["username"], "password": creds["password"]}


@router.post("/encrypt")
def encrypt_demo(
    value: str,
    _guard=Depends(_require_debug_endpoints),
    current_user=Depends(require_role("superadmin")),
):
    """
    Demonstrate application-level envelope encryption.
    Restricted to superadmin only. Disabled in production by default.
    """
    if not value:
        raise HTTPException(status_code=400, detail="Value is required")
    encrypted = encrypt_value(value)
    return {"encrypted": encrypted}


@router.post("/decrypt")
def decrypt_demo(
    blob: str,
    _guard=Depends(_require_debug_endpoints),
    current_user=Depends(require_role("superadmin")),
):
    """
    Demonstrate decryption of values encrypted by /encrypt.
    Restricted to superadmin only. Disabled in production by default.
    """
    if not blob:
        raise HTTPException(status_code=400, detail="Encrypted blob is required")
    plaintext = decrypt_value(blob)
    return {"plaintext": plaintext}
