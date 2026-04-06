#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"

export VAULT_ADDR VAULT_TOKEN

echo "[*] Enabling KV secrets engine at secret/ (if not already enabled)..."
vault secrets enable -path=secret -version=2 kv || true

echo "[*] Writing demo DB credentials to secret/clutchhh/db..."
vault kv put secret/clutchhh/db username="clutchhh_user" password="initial-password-123"

echo "[*] Writing demo master key (will be rotated by app if missing)..."
vault kv put secret/clutchhh/master-key key="$(openssl rand -hex 32)"

echo "[*] Applying clutchhh policy..."
vault policy write clutchhh ./policy-clutchhh.hcl

echo "[*] Done. Use VAULT_TOKEN=root (dev only) or create a constrained token with the clutchhh policy."
