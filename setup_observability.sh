#!/bin/bash
# =============================================================================
# Primus Observability + Secrets Stack Setup
# Prometheus · Grafana · Node Exporter · PostgreSQL Exporter · HashiCorp Vault
# Azure VM: Ubuntu 24.04 | Data disk: /mnt/data
# =============================================================================
set -euo pipefail

# ── Variables (edit these) ───────────────────────────────────────────────────
GRAFANA_ADMIN_PASS="${GRAFANA_ADMIN_PASS:-PrimusGrafana@2026}"
PG_USER="primus_user"
PG_PASS="PrimusDbSecureP4ssw0rd!"
PG_HOST="localhost"
PG_PORT="5432"

DATA_DIR="/mnt/data"
PROMETHEUS_DATA="${DATA_DIR}/prometheus"
GRAFANA_DATA="${DATA_DIR}/grafana"
VAULT_DATA="${DATA_DIR}/vault"

BIND_ADDR="0.0.0.0"   # Change to 127.0.0.1 to restrict to localhost only
PROMETHEUS_PORT="9090"
GRAFANA_PORT="3000"
VAULT_PORT="8200"
NODE_EXPORTER_PORT="9100"
PG_EXPORTER_PORT="9187"

# ── Logging ──────────────────────────────────────────────────────────────────
log()     { echo -e "\n\033[1;34m[INFO]    $(date '+%H:%M:%S') $*\033[0m"; }
ok()      { echo -e "\033[1;32m[SUCCESS] $*\033[0m"; }
warn()    { echo -e "\033[1;33m[WARN]    $*\033[0m"; }
die()     { echo -e "\033[1;31m[ERROR]   FATAL: $*\033[0m"; exit 1; }
section() { echo -e "\n\033[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
            echo -e "\033[1;35m  $*\033[0m"
            echo -e "\033[1;35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"; }

# ── Step 1: Pre-checks ───────────────────────────────────────────────────────
section "Step 1: Pre-checks"

[[ $EUID -eq 0 ]] || die "Run as root: sudo ./setup_observability.sh"
ok "Running as root"

[[ -d "$DATA_DIR" ]] || die "$DATA_DIR does not exist. Is the data disk mounted?"
touch "$DATA_DIR/.write_test" && rm "$DATA_DIR/.write_test" || die "$DATA_DIR is not writable"
ok "Data disk $DATA_DIR is accessible"

check_port() {
    local port=$1 name=$2
    if ss -tlnp | grep -q ":${port} "; then
        warn "Port $port ($name) is already in use — existing service may be running"
    else
        ok "Port $port ($name) is free"
    fi
}
check_port "$PROMETHEUS_PORT" "Prometheus"
check_port "$GRAFANA_PORT"    "Grafana"
check_port "$VAULT_PORT"      "Vault"

# ── Create data directories ──────────────────────────────────────────────────
log "Creating data directories on $DATA_DIR"
mkdir -p "$PROMETHEUS_DATA" "$GRAFANA_DATA" "$VAULT_DATA"
ok "Directories created: prometheus, grafana, vault"

apt-get update -qq
apt-get install -y curl wget tar jq ufw apt-transport-https software-properties-common gnupg 2>/dev/null
ok "Base packages installed"

# ── Step 2: Node Exporter ────────────────────────────────────────────────────
section "Step 2: Node Exporter (system metrics)"

install_node_exporter() {
    if command -v node_exporter &>/dev/null; then
        warn "node_exporter already installed — skipping"
        return
    fi

    NE_VER=$(curl -s https://api.github.com/repos/prometheus/node_exporter/releases/latest \
        | jq -r '.tag_name' | tr -d 'v')
    log "Installing Node Exporter v${NE_VER}"

    cd /tmp
    wget -q "https://github.com/prometheus/node_exporter/releases/download/v${NE_VER}/node_exporter-${NE_VER}.linux-amd64.tar.gz"
    tar xzf "node_exporter-${NE_VER}.linux-amd64.tar.gz"
    mv "node_exporter-${NE_VER}.linux-amd64/node_exporter" /usr/local/bin/
    rm -rf "node_exporter-${NE_VER}.linux-amd64"*
    ok "Node Exporter binary installed"

    id node_exporter &>/dev/null || useradd -rs /bin/false node_exporter

    cat > /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=${BIND_ADDR}:${NODE_EXPORTER_PORT}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now node_exporter
    ok "Node Exporter service started on port $NODE_EXPORTER_PORT"
}

install_node_exporter

# ── Step 3: PostgreSQL Exporter ──────────────────────────────────────────────
section "Step 3: PostgreSQL Exporter"

install_pg_exporter() {
    if command -v postgres_exporter &>/dev/null; then
        warn "postgres_exporter already installed — skipping"
        return
    fi

    PGE_VER=$(curl -s https://api.github.com/repos/prometheus-community/postgres_exporter/releases/latest \
        | jq -r '.tag_name' | tr -d 'v')
    log "Installing postgres_exporter v${PGE_VER}"

    cd /tmp
    wget -q "https://github.com/prometheus-community/postgres_exporter/releases/download/v${PGE_VER}/postgres_exporter-${PGE_VER}.linux-amd64.tar.gz"
    tar xzf "postgres_exporter-${PGE_VER}.linux-amd64.tar.gz"
    mv "postgres_exporter-${PGE_VER}.linux-amd64/postgres_exporter" /usr/local/bin/
    rm -rf "postgres_exporter-${PGE_VER}.linux-amd64"*
    ok "postgres_exporter binary installed"

    id postgres_exporter &>/dev/null || useradd -rs /bin/false postgres_exporter

    # Write connection string to environment file (not inline, safer)
    cat > /etc/default/postgres_exporter <<EOF
DATA_SOURCE_NAME=postgresql://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/postgres?sslmode=disable
EOF
    chmod 600 /etc/default/postgres_exporter

    cat > /etc/systemd/system/postgres_exporter.service <<EOF
[Unit]
Description=Prometheus PostgreSQL Exporter
After=network.target postgresql.service

[Service]
User=postgres_exporter
Group=postgres_exporter
EnvironmentFile=/etc/default/postgres_exporter
Type=simple
ExecStart=/usr/local/bin/postgres_exporter --web.listen-address=${BIND_ADDR}:${PG_EXPORTER_PORT}
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now postgres_exporter
    ok "postgres_exporter service started on port $PG_EXPORTER_PORT"
}

install_pg_exporter

# ── Step 4: Prometheus ───────────────────────────────────────────────────────
section "Step 4: Prometheus"

install_prometheus() {
    if command -v prometheus &>/dev/null; then
        warn "Prometheus already installed — skipping binary install"
    else
        PROM_VER=$(curl -s https://api.github.com/repos/prometheus/prometheus/releases/latest \
            | jq -r '.tag_name' | tr -d 'v')
        log "Installing Prometheus v${PROM_VER}"

        cd /tmp
        wget -q "https://github.com/prometheus/prometheus/releases/download/v${PROM_VER}/prometheus-${PROM_VER}.linux-amd64.tar.gz"
        tar xzf "prometheus-${PROM_VER}.linux-amd64.tar.gz"
        mv "prometheus-${PROM_VER}.linux-amd64/prometheus"   /usr/local/bin/
        mv "prometheus-${PROM_VER}.linux-amd64/promtool"     /usr/local/bin/
        mkdir -p /etc/prometheus
        # consoles/console_libraries removed in Prometheus 3.x — skip if absent
        [[ -d "prometheus-${PROM_VER}.linux-amd64/consoles" ]] && \
            mv "prometheus-${PROM_VER}.linux-amd64/consoles" /etc/prometheus/ || true
        [[ -d "prometheus-${PROM_VER}.linux-amd64/console_libraries" ]] && \
            mv "prometheus-${PROM_VER}.linux-amd64/console_libraries" /etc/prometheus/ || true
        rm -rf "prometheus-${PROM_VER}.linux-amd64"*
        ok "Prometheus binaries installed"
    fi

    id prometheus &>/dev/null || useradd -rs /bin/false prometheus
    mkdir -p /etc/prometheus "$PROMETHEUS_DATA"
    chown -R prometheus:prometheus /etc/prometheus "$PROMETHEUS_DATA"

    # Write prometheus.yml
    cat > /etc/prometheus/prometheus.yml <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:${PROMETHEUS_PORT}']

  - job_name: 'node_exporter'
    static_configs:
      - targets: ['localhost:${NODE_EXPORTER_PORT}']

  - job_name: 'primus_backend'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:${PG_EXPORTER_PORT}']
EOF

    chown prometheus:prometheus /etc/prometheus/prometheus.yml
    ok "prometheus.yml written"

    cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus Monitoring
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \\
  --config.file=/etc/prometheus/prometheus.yml \\
  --storage.tsdb.path=${PROMETHEUS_DATA} \\
  --web.listen-address=${BIND_ADDR}:${PROMETHEUS_PORT} \\
  --storage.tsdb.retention.time=30d
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable prometheus
    systemctl restart prometheus
    sleep 2
    systemctl is-active --quiet prometheus && ok "Prometheus running on port $PROMETHEUS_PORT" \
        || die "Prometheus failed to start — check: journalctl -xe -u prometheus"
}

install_prometheus

# ── Step 5: Grafana ──────────────────────────────────────────────────────────
section "Step 5: Grafana"

install_grafana() {
    if systemctl is-active --quiet grafana-server 2>/dev/null; then
        warn "Grafana already running — skipping install"
        return
    fi

    log "Adding Grafana APT repository"
    mkdir -p /etc/apt/keyrings
    wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
    echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" \
        > /etc/apt/sources.list.d/grafana.list
    apt-get update -qq
    apt-get install -y grafana
    ok "Grafana installed"

    # Move data dir to /mnt/data
    sed -i "s|^;*data =.*|data = ${GRAFANA_DATA}|" /etc/grafana/grafana.ini
    sed -i "s|^;*logs =.*|logs = /var/log/grafana|"  /etc/grafana/grafana.ini

    # Set admin password
    sed -i "s|^;*admin_password =.*|admin_password = ${GRAFANA_ADMIN_PASS}|" /etc/grafana/grafana.ini
    sed -i "s|^;*admin_user =.*|admin_user = admin|" /etc/grafana/grafana.ini

    # HTTP port
    sed -i "s|^;*http_port =.*|http_port = ${GRAFANA_PORT}|" /etc/grafana/grafana.ini
    sed -i "s|^;*http_addr =.*|http_addr = ${BIND_ADDR}|"    /etc/grafana/grafana.ini

    chown -R grafana:grafana "$GRAFANA_DATA" 2>/dev/null || true

    # Provision Prometheus datasource
    mkdir -p /etc/grafana/provisioning/datasources
    cat > /etc/grafana/provisioning/datasources/prometheus.yml <<EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:${PROMETHEUS_PORT}
    isDefault: true
    editable: true
EOF

    # Provision dashboard imports (Node Exporter + PostgreSQL)
    mkdir -p /etc/grafana/provisioning/dashboards
    cat > /etc/grafana/provisioning/dashboards/default.yml <<EOF
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: 'Primus'
    type: file
    disableDeletion: false
    options:
      path: /var/lib/grafana/dashboards
EOF

    mkdir -p /var/lib/grafana/dashboards

    # Download Node Exporter Full dashboard (ID 1860)
    log "Downloading Node Exporter dashboard from Grafana.com"
    DASH=$(curl -s "https://grafana.com/api/dashboards/1860/revisions/latest/download")
    echo "{\"dashboard\": $DASH, \"overwrite\": true}" | jq '.dashboard' \
        > /var/lib/grafana/dashboards/node_exporter.json 2>/dev/null || \
        warn "Could not download Node Exporter dashboard (needs internet)"

    # Download PostgreSQL dashboard (ID 9628)
    DASH=$(curl -s "https://grafana.com/api/dashboards/9628/revisions/latest/download")
    echo "{\"dashboard\": $DASH, \"overwrite\": true}" | jq '.dashboard' \
        > /var/lib/grafana/dashboards/postgresql.json 2>/dev/null || \
        warn "Could not download PostgreSQL dashboard (needs internet)"

    chown -R grafana:grafana /var/lib/grafana/dashboards

    systemctl daemon-reload
    systemctl enable --now grafana-server
    sleep 2
    systemctl is-active --quiet grafana-server && ok "Grafana running on port $GRAFANA_PORT" \
        || die "Grafana failed to start — check: journalctl -xe -u grafana-server"
}

install_grafana

# ── Step 6: HashiCorp Vault ──────────────────────────────────────────────────
section "Step 6: HashiCorp Vault"

install_vault() {
    if command -v vault &>/dev/null; then
        warn "Vault already installed — skipping"
    else
        log "Adding HashiCorp APT repository"
        wget -q -O - https://apt.releases.hashicorp.com/gpg | gpg --dearmor \
            -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
        echo "deb [arch=amd64 signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
            > /etc/apt/sources.list.d/hashicorp.list
        apt-get update -qq
        apt-get install -y vault
        ok "Vault installed: $(vault version)"
    fi

    id vault &>/dev/null || useradd -rs /bin/false vault
    mkdir -p /etc/vault "$VAULT_DATA"
    chown vault:vault "$VAULT_DATA"

    cat > /etc/vault/config.hcl <<EOF
# HashiCorp Vault Configuration
# WARNING: tls_disable = 1 is for initial setup only.
# Enable TLS before going to production!

ui = true

storage "file" {
  path = "${VAULT_DATA}"
}

listener "tcp" {
  address     = "${BIND_ADDR}:${VAULT_PORT}"
  tls_disable = 1
}

api_addr = "http://${BIND_ADDR}:${VAULT_PORT}"
EOF

    chown vault:vault /etc/vault/config.hcl
    chmod 640 /etc/vault/config.hcl

    # Set VAULT_SKIP_VERIFY environment for vault user
    cat > /etc/default/vault <<EOF
VAULT_ADDR=http://127.0.0.1:${VAULT_PORT}
EOF

    cat > /etc/systemd/system/vault.service <<EOF
[Unit]
Description=HashiCorp Vault
Documentation=https://www.vaultproject.io/docs/
After=network.target

[Service]
User=vault
Group=vault
EnvironmentFile=/etc/default/vault
ExecStart=/usr/bin/vault server -config=/etc/vault/config.hcl
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=process
KillSignal=SIGINT
Restart=on-failure
RestartSec=5s
LimitNOFILE=65536
LimitMEMLOCK=infinity
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_SYSLOG CAP_IPC_LOCK

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable vault
    systemctl restart vault
    sleep 3
    systemctl is-active --quiet vault && ok "Vault service running on port $VAULT_PORT" \
        || die "Vault failed to start — check: journalctl -xe -u vault"
}

install_vault

# ── Step 7: Vault Initialization ─────────────────────────────────────────────
section "Step 7: Vault Initialization"

VAULT_ADDR="http://127.0.0.1:${VAULT_PORT}"
export VAULT_ADDR

init_vault() {
    sleep 2  # Let Vault settle

    INIT_STATUS=$(vault status -format=json 2>/dev/null | jq -r '.initialized' 2>/dev/null || echo "false")

    if [[ "$INIT_STATUS" == "true" ]]; then
        warn "Vault is already initialized — skipping init"
        warn "If Vault is sealed, unseal it manually with your stored unseal keys"
        return
    fi

    log "Initializing Vault (5 key shares, 3 threshold)"
    INIT_OUTPUT=$(vault operator init -key-shares=5 -key-threshold=3 -format=json)

    UNSEAL_KEY_1=$(echo "$INIT_OUTPUT" | jq -r '.unseal_keys_b64[0]')
    UNSEAL_KEY_2=$(echo "$INIT_OUTPUT" | jq -r '.unseal_keys_b64[1]')
    UNSEAL_KEY_3=$(echo "$INIT_OUTPUT" | jq -r '.unseal_keys_b64[2]')
    UNSEAL_KEY_4=$(echo "$INIT_OUTPUT" | jq -r '.unseal_keys_b64[3]')
    UNSEAL_KEY_5=$(echo "$INIT_OUTPUT" | jq -r '.unseal_keys_b64[4]')
    ROOT_TOKEN=$(echo   "$INIT_OUTPUT" | jq -r '.root_token')

    echo ""
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║            ⚠️  VAULT INIT KEYS — STORE THESE SECURELY  ⚠️            ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    echo "║  Unseal Key 1: $UNSEAL_KEY_1"
    echo "║  Unseal Key 2: $UNSEAL_KEY_2"
    echo "║  Unseal Key 3: $UNSEAL_KEY_3"
    echo "║  Unseal Key 4: $UNSEAL_KEY_4"
    echo "║  Unseal Key 5: $UNSEAL_KEY_5"
    echo "║"
    echo "║  Root Token:   $ROOT_TOKEN"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    echo "║  ⚠  These keys are shown ONCE. Copy them now and store offline.     ║"
    echo "║  ⚠  Losing all unseal keys = permanent data loss.                   ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo ""

    # Save to root-only readable file as backup (warn user)
    KEYS_FILE="/root/.vault_init_keys"
    cat > "$KEYS_FILE" <<KEYS
# Vault Init Keys — $(date)
# DELETE THIS FILE after saving keys to a password manager!
UNSEAL_KEY_1=$UNSEAL_KEY_1
UNSEAL_KEY_2=$UNSEAL_KEY_2
UNSEAL_KEY_3=$UNSEAL_KEY_3
UNSEAL_KEY_4=$UNSEAL_KEY_4
UNSEAL_KEY_5=$UNSEAL_KEY_5
ROOT_TOKEN=$ROOT_TOKEN
KEYS
    chmod 400 "$KEYS_FILE"
    warn "Keys also saved to $KEYS_FILE (chmod 400). DELETE after copying to password manager!"

    # Auto-unseal with 3 keys
    log "Unsealing Vault..."
    vault operator unseal "$UNSEAL_KEY_1" > /dev/null
    vault operator unseal "$UNSEAL_KEY_2" > /dev/null
    vault operator unseal "$UNSEAL_KEY_3" > /dev/null
    ok "Vault unsealed"

    # Enable kv secrets engine
    export VAULT_TOKEN="$ROOT_TOKEN"
    vault secrets enable -path=secret kv-v2 2>/dev/null || true
    ok "KV secrets engine enabled at secret/"

    # Store Primus DB credentials as first secret
    vault kv put secret/primus/database \
        url="postgresql+psycopg2://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/primus_db" \
        user="$PG_USER" \
        password="$PG_PASS" \
        global_url="postgresql+psycopg2://${PG_USER}:${PG_PASS}@${PG_HOST}:${PG_PORT}/primus_global" \
        > /dev/null
    ok "Primus database credentials stored in Vault at secret/primus/database"
}

init_vault

# ── Step 8: Firewall ─────────────────────────────────────────────────────────
section "Step 8: Firewall Configuration"

configure_firewall() {
    if ! command -v ufw &>/dev/null; then
        warn "ufw not found — skipping firewall config"
        return
    fi

    warn "Opening ports 3000 (Grafana), 9090 (Prometheus), 8200 (Vault) — restrict in production!"
    ufw allow 3000/tcp comment "Grafana"
    ufw allow 9090/tcp comment "Prometheus"
    ufw allow 8200/tcp comment "Vault"
    ufw allow 9100/tcp comment "Node Exporter"
    ufw --force enable
    ok "Firewall rules applied"
}

configure_firewall

# ── Final Verification ────────────────────────────────────────────────────────
section "Verification"

verify_service() {
    local name=$1 port=$2
    if systemctl is-active --quiet "$name"; then
        ok "$name is running"
    else
        warn "$name is NOT running — check: journalctl -xe -u $name"
    fi
    if ss -tlnp | grep -q ":${port} "; then
        ok "  → listening on port $port"
    else
        warn "  → NOT listening on port $port"
    fi
}

verify_service node_exporter    "$NODE_EXPORTER_PORT"
verify_service postgres_exporter "$PG_EXPORTER_PORT"
verify_service prometheus        "$PROMETHEUS_PORT"
verify_service grafana-server    "$GRAFANA_PORT"
verify_service vault             "$VAULT_PORT"

# ── Summary ───────────────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "<your-public-ip>")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 🎉 Observability stack is ready!"
echo ""
echo "  Grafana     → http://${PUBLIC_IP}:3000  (admin / ${GRAFANA_ADMIN_PASS})"
echo "  Prometheus  → http://${PUBLIC_IP}:9090"
echo "  Vault UI    → http://${PUBLIC_IP}:8200/ui"
echo ""
echo " Data stored on Azure disk:"
echo "  Prometheus  → $PROMETHEUS_DATA"
echo "  Grafana     → $GRAFANA_DATA"
echo "  Vault       → $VAULT_DATA"
echo ""
echo " ⚠  Security reminders:"
echo "  1. Change Grafana password immediately after first login"
echo "  2. Enable TLS on Vault before going to production"
echo "  3. Delete /root/.vault_init_keys after saving keys offline"
echo "  4. Restrict firewall rules to known IPs for Prometheus/Vault"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
