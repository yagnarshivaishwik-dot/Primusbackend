#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-root}"

export VAULT_ADDR VAULT_TOKEN

NEW_PASS="rotated-$(openssl rand -hex 8)"

echo "[*] Rotating DB password in Vault to ${NEW_PASS}..."
vault kv put secret/clutchhh/db username="clutchhh_user" password="${NEW_PASS}"

echo "[*] Rotation complete. New secret version:"
vault kv get secret/clutchhh/db
