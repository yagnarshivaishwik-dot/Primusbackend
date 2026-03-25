import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.utils.vault import get_master_key


def encrypt_value(plaintext: str) -> str:
    """
    Encrypt a sensitive value using envelope encryption:

    - Generate random DEK (32 bytes)
    - Encrypt plaintext with AES-256-GCM using DEK
    - Encrypt DEK with AES-256-GCM using KEK (master key) from Vault
    - Return JSON-serializable string with all components
    """
    if plaintext is None:
        return ""

    master_key = get_master_key()

    dek = AESGCM.generate_key(bit_length=256)
    aes_dek = AESGCM(dek)

    nonce = os.urandom(12)
    ciphertext = aes_dek.encrypt(nonce, plaintext.encode("utf-8"), None)

    kek = AESGCM(master_key)
    dek_nonce = os.urandom(12)
    encrypted_dek = kek.encrypt(dek_nonce, dek, None)

    blob: dict[str, str] = {
        "v": "1",
        "n": nonce.hex(),
        "ct": ciphertext.hex(),
        "dek": (dek_nonce + encrypted_dek).hex(),
    }
    # Simple JSON-ish representation without importing json here; callers can
    # store as a string field in the database.
    return ";".join(f"{k}={v}" for k, v in blob.items())


def decrypt_value(blob: str) -> str:
    """
    Decrypt a value previously encrypted with encrypt_value.

    The blob is stored as a semi-colon separated key=value string.
    """
    if not blob:
        return ""

    parts = {}
    for item in blob.split(";"):
        if not item or "=" not in item:
            continue
        k, v = item.split("=", 1)
        parts[k] = v

    if parts.get("v") != "1":
        raise ValueError("Unsupported encryption version")

    master_key = get_master_key()

    dek_blob = bytes.fromhex(parts["dek"])
    dek_nonce, enc_dek = dek_blob[:12], dek_blob[12:]
    kek = AESGCM(master_key)
    dek = kek.decrypt(dek_nonce, enc_dek, None)

    aes_dek = AESGCM(dek)
    nonce = bytes.fromhex(parts["n"])
    ciphertext = bytes.fromhex(parts["ct"])
    plaintext = aes_dek.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
