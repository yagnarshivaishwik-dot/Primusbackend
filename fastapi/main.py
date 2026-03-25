import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict

import httpx
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt
from pydantic import BaseModel


VAULT_ADDR = os.getenv("VAULT_ADDR", "http://vault:8200")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "root")
OIDC_ISSUER = os.getenv("OIDC_ISSUER", "http://localhost:8080/realms/primus")
OIDC_AUDIENCE = os.getenv("OIDC_AUDIENCE", "primus-client")

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

app = FastAPI(title="Primus OSS Security Baseline Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: Optional[str] = None


class EncryptRequest(BaseModel):
    plaintext: str


class EncryptResponse(BaseModel):
    ciphertext: str
    nonce: str
    tag: str
    encrypted_dek: str


USERS: Dict[str, Dict] = {}
FAILED_LOGINS: Dict[str, Dict] = {}


def get_vault_client() -> httpx.AsyncClient:
    headers = {"X-Vault-Token": VAULT_TOKEN}
    return httpx.AsyncClient(base_url=VAULT_ADDR, headers=headers, timeout=10.0)


async def get_master_key() -> bytes:
    """
    Fetch AES-256-GCM master key from Vault KV. If missing, generate and store.
    """
    async with get_vault_client() as client:
        resp = await client.get("/v1/secret/data/primus/master-key")
        if resp.status_code == 200:
            data = resp.json()["data"]["data"]
            return bytes.fromhex(data["key"])

        key = os.urandom(32)
        await client.post(
            "/v1/secret/data/primus/master-key",
            json={"data": {"key": key.hex()}},
        )
        return key


async def get_db_credentials() -> Dict[str, str]:
    """
    Fetch DB credentials from Vault KV v2 at secret/primus/db.
    """
    async with get_vault_client() as client:
        resp = await client.get("/v1/secret/data/primus/db")
        if resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Vault returned {resp.status_code} for DB creds",
            )
        data = resp.json()["data"]["data"]
        return {"username": data.get("username", ""), "password": data.get("password", "")}


def rate_limit(username: str):
    record = FAILED_LOGINS.get(username)
    now = datetime.utcnow()
    if record:
        if record["locked_until"] and now < record["locked_until"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account temporarily locked due to failed attempts",
            )
        if record["count"] >= 5 and (now - record["first_fail"]) < timedelta(minutes=5):
            record["locked_until"] = now + timedelta(minutes=5)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed attempts; account locked for 5 minutes",
            )


def record_failure(username: str):
    now = datetime.utcnow()
    record = FAILED_LOGINS.get(username)
    if not record:
        FAILED_LOGINS[username] = {"count": 1, "first_fail": now, "locked_until": None}
    else:
        if (now - record["first_fail"]) > timedelta(minutes=5):
            FAILED_LOGINS[username] = {
                "count": 1,
                "first_fail": now,
                "locked_until": None,
            }
        else:
            record["count"] += 1


def reset_failures(username: str):
    FAILED_LOGINS.pop(username, None)


async def verify_oidc_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth_header.split(" ", 1)[1]

    async with httpx.AsyncClient(timeout=10.0) as client:
        jwks_url = f"{OIDC_ISSUER}/protocol/openid-connect/certs"
        jwks = (await client.get(jwks_url)).json()

    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    key = next(
        (k for k in jwks["keys"] if k.get("kid") == kid),
        None,
    )
    if not key:
        raise HTTPException(status_code=401, detail="Unable to find matching JWKS key")

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[unverified_header["alg"]],
            audience=OIDC_AUDIENCE,
            issuer=OIDC_ISSUER,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


@app.post("/register")
async def register(body: RegisterRequest):
    if body.username in USERS:
        raise HTTPException(status_code=400, detail="User already exists")
    password_hash = ph.hash(body.password)
    USERS[body.username] = {
        "id": str(uuid.uuid4()),
        "password_hash": password_hash,
        "totp_secret": None,
    }
    return {"status": "ok", "username": body.username}


@app.post("/login")
async def login(body: LoginRequest):
    rate_limit(body.username)
    user = USERS.get(body.username)
    if not user:
        record_failure(body.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    try:
        ph.verify(user["password_hash"], body.password)
    except VerifyMismatchError:
        record_failure(body.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user["totp_secret"]:
        if not body.totp_code:
            record_failure(body.username)
            raise HTTPException(status_code=401, detail="TOTP code required")
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(body.totp_code, valid_window=1):
            record_failure(body.username)
            raise HTTPException(status_code=401, detail="Invalid TOTP code")

    reset_failures(body.username)
    return {"status": "ok", "user_id": user["id"]}


@app.post("/mfa/totp/setup")
async def totp_setup(body: RegisterRequest):
    user = USERS.get(body.username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    secret = pyotp.random_base32()
    user["totp_secret"] = secret
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=body.username,
        issuer_name="Primus OSS Baseline",
    )
    return {"secret": secret, "otpauth_url": uri}


@app.post("/encrypt", response_model=EncryptResponse)
async def encrypt_demo(body: EncryptRequest):
    master_key = await get_master_key()
    dek = os.urandom(32)
    aes = AESGCM(dek)
    nonce = os.urandom(12)
    ciphertext = aes.encrypt(nonce, body.plaintext.encode("utf-8"), None)

    kek = AESGCM(master_key)
    dek_nonce = os.urandom(12)
    encrypted_dek = kek.encrypt(dek_nonce, dek, None)

    return EncryptResponse(
        ciphertext=ciphertext.hex(),
        nonce=nonce.hex(),
        tag="",
        encrypted_dek=(dek_nonce + encrypted_dek).hex(),
    )


@app.post("/decrypt")
async def decrypt_demo(resp: EncryptResponse):
    master_key = await get_master_key()
    aes_dek = AESGCM(master_key)
    dek_blob = bytes.fromhex(resp.encrypted_dek)
    dek_nonce, enc_dek = dek_blob[:12], dek_blob[12:]
    dek = aes_dek.decrypt(dek_nonce, enc_dek, None)

    aes = AESGCM(dek)
    plaintext = aes.decrypt(
        bytes.fromhex(resp.nonce),
        bytes.fromhex(resp.ciphertext),
        None,
    )
    return {"plaintext": plaintext.decode("utf-8")}


@app.get("/vault/db-creds")
async def vault_db_creds():
    """
    Demo endpoint to show current DB credentials coming from Vault.
    Useful for rotation checks.
    """
    creds = await get_db_credentials()
    return {"source": "vault", "username": creds["username"], "password": creds["password"]}


@app.get("/oidc/protected")
async def oidc_protected(payload=Depends(verify_oidc_token)):
    return {"sub": payload.get("sub"), "preferred_username": payload.get("preferred_username")}


@app.middleware("http")
async def json_logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start = datetime.utcnow()
    response = await call_next(request)
    duration_ms = (datetime.utcnow() - start).total_seconds() * 1000
    user_id = getattr(request.state, "user_id", None)
    log = {
        "ts": start.isoformat() + "Z",
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
        "user_id": user_id,
    }
    print(log, flush=True)
    return response


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


