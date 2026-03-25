from fastapi import APIRouter, Depends, HTTPException

from app.api.endpoints.auth import get_current_user, require_role
from app.utils.encryption import decrypt_value, encrypt_value
from app.utils.vault import get_db_credentials

router = APIRouter()


@router.get("/vault/db-creds")
def vault_db_creds(current_user=Depends(require_role("admin"))):
    """
    Return current DB credentials as stored in Vault.

    This is intended for verification of Vault integration and rotation only and
    should be further locked down or removed in production.
    """
    creds = get_db_credentials()
    return {"source": "vault", "username": creds["username"], "password": creds["password"]}


@router.post("/encrypt")
def encrypt_demo(value: str, current_user=Depends(get_current_user)):
    """
    Demonstrate application-level envelope encryption using the shared KEK from Vault.
    """
    if not value:
        raise HTTPException(status_code=400, detail="Value is required")
    encrypted = encrypt_value(value)
    return {"encrypted": encrypted}


@router.post("/decrypt")
def decrypt_demo(blob: str, current_user=Depends(get_current_user)):
    """
    Demonstrate decryption of values encrypted by /encrypt.
    """
    if not blob:
        raise HTTPException(status_code=400, detail="Encrypted blob is required")
    plaintext = decrypt_value(blob)
    return {"plaintext": plaintext}
