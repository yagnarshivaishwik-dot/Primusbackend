# =============================================================================
# Primus Platform — HashiCorp Vault production configuration
# =============================================================================
# Purpose:
#   Production-hardened Vault config: TLS, file storage with documented
#   migration plan to consul, Azure Key Vault auto-unseal, UI enabled.
#
# Forensic audit references:
#   BUG #VAULT-001  Dev-mode Vault in production — addressed (file storage + TLS).
#   BUG #VAULT-002  Manual unseal (3-of-5 shards in chat history) — replaced
#                   with Azure Key Vault auto-unseal.
#   BUG #VAULT-003  No TLS on Vault listener — addressed.
#
# Required external setup:
#   - Let's Encrypt cert at /etc/letsencrypt/live/vault.primustech.in/
#       (or equivalent — same cert path as nginx but for the vault FQDN)
#   - Azure Key Vault named "primus-vault-unseal" in tenant
#       AZURE_TENANT_ID, with a key named "vault-unseal-key" (RSA 2048+).
#       The VM must have a system-assigned managed identity with
#       "Key Vault Crypto User" role on that key.
#   - DNS A record vault.primustech.in -> VM
#   - /var/lib/vault and /opt/vault/data owned by vault:vault, mode 0700
#
# Storage migration plan (file -> consul) — documented for the future:
#   1. Stand up 3-node Consul cluster (consul.primustech.in)
#   2. `vault operator migrate -config=migrate.hcl` (offline migration)
#   3. Update this file: replace `storage "file"` with `storage "consul"` block
#   4. Restart vault, validate `vault status` shows new storage
# =============================================================================

ui = true

# ---- Listener (TLS-enabled — never disable in prod) -------------------------
listener "tcp" {
  address           = "0.0.0.0:8200"
  cluster_address   = "0.0.0.0:8201"

  tls_disable                       = 0
  tls_cert_file                     = "/etc/letsencrypt/live/vault.primustech.in/fullchain.pem"
  tls_key_file                      = "/etc/letsencrypt/live/vault.primustech.in/privkey.pem"
  tls_min_version                   = "tls12"
  tls_prefer_server_cipher_suites   = true
  tls_disable_client_certs          = true

  # Hide telemetry endpoints from the world; scraped via private network only
  telemetry {
    unauthenticated_metrics_access = false
  }
}

# ---- Storage backend --------------------------------------------------------
# Phase 1 (current): file backend. Acceptable for single-node Vault.
# Phase 2 (planned): swap to consul for HA — see migration plan in header.
storage "file" {
  path = "/opt/vault/data"
}

# Future block (commented):
# storage "consul" {
#   address = "consul.primustech.in:8500"
#   path    = "vault/"
#   scheme  = "https"
#   tls_ca_file   = "/etc/letsencrypt/live/consul.primustech.in/chain.pem"
#   tls_cert_file = "/etc/letsencrypt/live/consul.primustech.in/fullchain.pem"
#   tls_key_file  = "/etc/letsencrypt/live/consul.primustech.in/privkey.pem"
# }

# ---- Auto-unseal via Azure Key Vault ---------------------------------------
# Uses VM managed identity. No client secret stored anywhere.
seal "azurekeyvault" {
  tenant_id      = "REPLACE_WITH_AZURE_TENANT_ID"       # placeholder
  vault_name     = "primus-vault-unseal"                # placeholder
  key_name       = "vault-unseal-key"                   # placeholder
  # client_id / client_secret intentionally omitted -> managed identity flow.
  # resource = "https://vault.azure.net"                # default; leave commented
}

# ---- Cluster / API addresses ------------------------------------------------
api_addr     = "https://vault.primustech.in:8200"
cluster_addr = "https://vault.primustech.in:8201"

# ---- Lease defaults ---------------------------------------------------------
default_lease_ttl = "768h"   # 32 days  (BUG #VAULT-004: was unset, defaulted to 32d already; pinned for clarity)
max_lease_ttl     = "8760h"  # 365 days

# ---- Telemetry --------------------------------------------------------------
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# ---- Operational --------------------------------------------------------- ---
disable_mlock = false   # mlock prevents key material being swapped to disk
log_level     = "info"
log_format    = "json"
pid_file      = "/var/run/vault/vault.pid"

# Plugin directory (for custom secrets engines if ever needed)
plugin_directory = "/opt/vault/plugins"
