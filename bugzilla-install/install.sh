#!/usr/bin/env bash
# Bugzilla installer for Ubuntu 22.04 / 24.04 on an Azure VM.
#
# - Idempotent: safe to re-run for upgrades or config changes.
# - Pass FRESH_INSTALL=true to wipe any prior install (DB, files, vhost,
#   admin-password file, ports.conf customisation) before installing.
#
# Usage:
#   1. cp .env.example .env  &&  edit .env
#   2. sudo ./install.sh                       # idempotent
#      sudo FRESH_INSTALL=true ./install.sh    # nuke + reinstall
#
# Logs:  /var/log/bugzilla-install.log

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# ── helpers ──────────────────────────────────────────────────────────
log()  { printf '\e[1;34m[bugzilla]\e[0m %s\n' "$*"; }
warn() { printf '\e[1;33m[bugzilla]\e[0m %s\n' "$*" >&2; }
die()  { printf '\e[1;31m[bugzilla]\e[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "Run as root (use sudo)."
}

load_env() {
  [[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy .env.example and edit."
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  : "${DOMAIN:?DOMAIN required}"
  : "${ADMIN_EMAIL:?ADMIN_EMAIL required}"
  : "${DB_PASS:?DB_PASS required}"
  : "${SMTP_HOST:?SMTP_HOST required}"
  : "${SMTP_USER:?SMTP_USER required}"
  : "${SMTP_PASS:?SMTP_PASS required}"
  : "${INSTALL_DIR:=/var/www/bugzilla}"
  : "${BUGZILLA_VERSION:=release-5.2-stable}"
  : "${DB_NAME:=bugs}"
  : "${DB_USER:=bugs}"
  : "${DB_HOST:=localhost}"
  : "${ENABLE_TLS:=true}"
  : "${SMTP_FROM:=bugzilla@${DOMAIN}}"
  : "${LE_EMAIL:=$ADMIN_EMAIL}"
  : "${APACHE_PORT:=80}"
  : "${FRESH_INSTALL:=false}"

  # Build the public URL for urlbase / summary.
  local scheme="http"
  [[ "${ENABLE_TLS}" == "true" ]] && scheme="https"
  if [[ "${ENABLE_TLS}" == "true" || "${APACHE_PORT}" == "80" ]]; then
    PUBLIC_URL="${scheme}://${DOMAIN}"
  else
    PUBLIC_URL="${scheme}://${DOMAIN}:${APACHE_PORT}"
  fi
}

# ── 0. (optional) wipe prior install ─────────────────────────────────
step_reset() {
  if [[ "${FRESH_INSTALL}" != "true" ]]; then
    return
  fi
  log "FRESH_INSTALL=true — wiping any prior Bugzilla state…"

  # Stop apache so port frees up cleanly
  systemctl stop apache2 >/dev/null 2>&1 || true

  # Disable + remove our vhost
  a2dissite bugzilla >/dev/null 2>&1 || true
  rm -f /etc/apache2/sites-available/bugzilla.conf

  # Restore the original ports.conf if we backed it up
  if [[ -f /etc/apache2/ports.conf.bugzilla-orig ]]; then
    cp /etc/apache2/ports.conf.bugzilla-orig /etc/apache2/ports.conf
  fi

  # Re-enable Apache's stock default site so apache still starts on its own
  a2ensite 000-default >/dev/null 2>&1 || true

  # Remove install tree
  rm -rf "${INSTALL_DIR}"

  # Drop DB + user (only if MariaDB is up)
  if systemctl is-active --quiet mariadb; then
    mysql <<SQL || true
DROP DATABASE IF EXISTS \`${DB_NAME}\`;
DROP USER IF EXISTS '${DB_USER}'@'${DB_HOST}';
FLUSH PRIVILEGES;
SQL
  fi

  # Cleanup files
  rm -f /root/.bugzilla-admin-password
  rm -f /etc/apache2/conf-available/bugzilla.conf
  rm -f /var/log/apache2/bugzilla-*.log

  systemctl reset-failed apache2 >/dev/null 2>&1 || true

  log "Wipe complete."
}

# ── 1. system packages ───────────────────────────────────────────────
step_apt_deps() {
  log "Installing system packages…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    git build-essential pkg-config \
    apache2 libapache2-mod-perl2 libapache2-mod-perl2-dev \
    perl cpanminus \
    mariadb-server mariadb-client \
    libmariadb-dev libssl-dev libgd-dev \
    libexpat1-dev libxml2-dev zlib1g-dev \
    libdbi-perl libdbd-mysql-perl \
    graphviz patchutils \
    msmtp msmtp-mta mailutils \
    certbot python3-certbot-apache \
    curl ca-certificates openssl

  # DBD::MariaDB is required for MariaDB 10.6+ but its apt package
  # (libdbd-mariadb-perl) lives in 'universe' which Azure-minimal
  # images strip. Try apt first, fall back to cpanm.
  if ! apt-get install -y -qq libdbd-mariadb-perl 2>/dev/null; then
    log "libdbd-mariadb-perl not in apt — building DBD::MariaDB via cpanm"
    cpanm --quiet --notest DBD::MariaDB
  fi

  # apt's apache2 post-install can leave the unit failed on cloud images.
  systemctl reset-failed apache2 >/dev/null 2>&1 || true
  systemctl enable apache2 >/dev/null 2>&1 || true
}

# ── 2. database ──────────────────────────────────────────────────────
step_mariadb() {
  log "Configuring MariaDB…"
  systemctl enable --now mariadb

  mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'${DB_HOST}' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'${DB_HOST}' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'${DB_HOST}';
FLUSH PRIVILEGES;
SQL

  cat > /etc/mysql/mariadb.conf.d/99-bugzilla.cnf <<EOF
[mysqld]
max_allowed_packet = 100M
sql_mode = STRICT_ALL_TABLES,NO_AUTO_VALUE_ON_ZERO
innodb_default_row_format = dynamic
innodb_file_per_table = 1
EOF
  systemctl restart mariadb
}

# ── 3. fetch source ──────────────────────────────────────────────────
step_clone() {
  log "Fetching Bugzilla ${BUGZILLA_VERSION}…"
  install -d "${INSTALL_DIR%/*}"
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    git -C "${INSTALL_DIR}" fetch --tags --quiet origin
    git -C "${INSTALL_DIR}" checkout --quiet "${BUGZILLA_VERSION}"
    git -C "${INSTALL_DIR}" pull --ff-only --quiet || true
  else
    git clone --branch "${BUGZILLA_VERSION}" --depth 1 \
      https://github.com/bugzilla/bugzilla.git "${INSTALL_DIR}"
  fi
}

# ── 4. perl modules ──────────────────────────────────────────────────
step_perl_deps() {
  log "Installing Perl dependencies (5–10 min on first run)…"
  cd "${INSTALL_DIR}"
  ./checksetup.pl --check-modules || true
  cpanm --quiet --notest --installdeps . || true
  cpanm --quiet --notest \
    Apache2::SizeLimit \
    Email::Sender \
    Email::MIME \
    Cache::Memcached \
    File::MimeInfo::Magic || true
}

# ── 5. SMTP relay (Azure blocks port 25) ─────────────────────────────
step_msmtp() {
  log "Configuring SMTP relay (msmtp → ${SMTP_HOST}:${SMTP_PORT})…"
  cat > /etc/msmtprc <<EOF
defaults
auth      on
tls       on
tls_starttls on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile   /var/log/msmtp.log

account   default
host      ${SMTP_HOST}
port      ${SMTP_PORT}
from      ${SMTP_FROM}
user      ${SMTP_USER}
password  ${SMTP_PASS}
EOF
  chmod 600 /etc/msmtprc
  chown root:root /etc/msmtprc
  ln -sf /usr/bin/msmtp /usr/sbin/sendmail
}

# ── 6. localconfig ───────────────────────────────────────────────────
step_localconfig() {
  log "Writing localconfig…"
  cd "${INSTALL_DIR}"
  local secret
  if [[ -f localconfig ]] && grep -q "site_wide_secret" localconfig; then
    secret=$(grep "site_wide_secret" localconfig | sed -E "s/.*'([^']+)'.*/\1/")
  else
    secret=$(openssl rand -hex 32)
  fi

  cat > localconfig <<EOF
\$create_htaccess  = 1;
\$webservergroup   = 'www-data';
\$use_suexec       = 0;
\$db_driver        = 'mariadb';
\$db_host          = '${DB_HOST}';
\$db_name          = '${DB_NAME}';
\$db_user          = '${DB_USER}';
\$db_pass          = '${DB_PASS}';
\$db_port          = 0;
\$db_sock          = '';
\$db_check         = 1;
\$db_mariadb_ssl_ca_file     = '';
\$db_mariadb_ssl_ca_path     = '';
\$db_mariadb_ssl_client_cert = '';
\$db_mariadb_ssl_client_key  = '';
\$db_mysql_ssl_ca_file       = '';
\$db_mysql_ssl_ca_path       = '';
\$db_mysql_ssl_client_cert   = '';
\$db_mysql_ssl_client_key    = '';
\$index_html       = 0;
\$interdiffbin     = '/usr/bin/interdiff';
\$diffpath         = '/usr/bin/diff';
\$site_wide_secret = '${secret}';
EOF
  chown www-data:www-data localconfig
  chmod 640 localconfig
}

# ── 7. pre-create writable dirs ──────────────────────────────────────
# Bugzilla's checksetup.pl uses File::Temp on data/ before its own
# filesystem-creation phase, so the dir must exist beforehand.
step_filesystem() {
  log "Pre-creating writable directories…"
  install -d -o www-data -g www-data "${INSTALL_DIR}/data"
  install -d -o www-data -g www-data "${INSTALL_DIR}/data/webdot"
  install -d -o www-data -g www-data "${INSTALL_DIR}/data/attachments"
  install -d -o www-data -g www-data "${INSTALL_DIR}/data/extensions"
  install -d -o www-data -g www-data "${INSTALL_DIR}/template_cache" 2>/dev/null || true
  install -d -o www-data -g www-data "${INSTALL_DIR}/graphs" 2>/dev/null || true
}

# ── 8. checksetup.pl (schema + admin) ────────────────────────────────
step_checksetup() {
  log "Running checksetup.pl…"
  cd "${INSTALL_DIR}"

  local admin_pass="${ADMIN_PASSWORD:-}"
  if [[ -z "$admin_pass" ]]; then
    admin_pass=$(openssl rand -base64 18)
    log "Generated admin password — saving to /root/.bugzilla-admin-password"
  fi

  local answers=/tmp/bugzilla-answers.$$
  cat > "$answers" <<EOF
\$answer{'ADMIN_EMAIL'}          = '${ADMIN_EMAIL}';
\$answer{'ADMIN_PASSWORD'}       = '${admin_pass}';
\$answer{'ADMIN_REALNAME'}       = 'Bugzilla Admin';
\$answer{'urlbase'}              = '${PUBLIC_URL}/';
\$answer{'ssl_redirect'}         = $( [[ "${ENABLE_TLS}" == "true" ]] && echo 1 || echo 0 );
\$answer{'mail_delivery_method'} = 'Sendmail';
\$answer{'mailfrom'}             = '${SMTP_FROM}';
\$answer{'sendmailnow'}          = 1;
EOF

  # Two runs: first creates schema + admin; second clears the
  # "new variables in localconfig — please review" advisory.
  ./checksetup.pl "$answers"
  ./checksetup.pl "$answers"
  rm -f "$answers"

  install -m 600 /dev/null /root/.bugzilla-admin-password
  printf '%s\n' "$admin_pass" > /root/.bugzilla-admin-password

  chown -R www-data:www-data "${INSTALL_DIR}"
}

# ── 9. apache vhost on $APACHE_PORT ──────────────────────────────────
step_apache() {
  log "Configuring Apache to listen on :${APACHE_PORT}…"

  a2enmod cgi headers rewrite perl expires deflate >/dev/null
  if [[ "${ENABLE_TLS}" == "true" ]]; then
    a2enmod ssl >/dev/null
  else
    # Without TLS we don't want the ssl module loaded, because its
    # ports.conf snippet adds Listen 443 — which collides with anything
    # else on 443 (e.g. a docker-proxy on a multi-tenant VM).
    a2dismod ssl >/dev/null 2>&1 || true
  fi

  # Backup original ports.conf so reset can restore it.
  if [[ ! -f /etc/apache2/ports.conf.bugzilla-orig ]]; then
    cp /etc/apache2/ports.conf /etc/apache2/ports.conf.bugzilla-orig
  fi

  # Rewrite ports.conf from the pristine backup so Listen ${APACHE_PORT}
  # is the single HTTP listener (avoids stale Listen 80/8080 lines).
  awk -v port="${APACHE_PORT}" '
    /^Listen 80$/      { print "Listen " port; next }
    /^[[:space:]]*Listen [0-9]+$/ {
      # leave SSL Listen 443 lines as-is; ssl module gating handles them
      print; next
    }
    { print }
  ' /etc/apache2/ports.conf.bugzilla-orig > /etc/apache2/ports.conf

  cat > /etc/apache2/sites-available/bugzilla.conf <<EOF
<VirtualHost *:${APACHE_PORT}>
    ServerName ${DOMAIN}
    DocumentRoot ${INSTALL_DIR}

    <Directory ${INSTALL_DIR}>
        AddHandler cgi-script .cgi
        Options +ExecCGI +FollowSymLinks
        DirectoryIndex index.cgi index.html
        AllowOverride All
        Require all granted
    </Directory>

    <Directory ${INSTALL_DIR}/data>
        Require all denied
    </Directory>
    <Directory ${INSTALL_DIR}/template>
        Require all denied
    </Directory>

    ErrorLog  \${APACHE_LOG_DIR}/bugzilla-error.log
    CustomLog \${APACHE_LOG_DIR}/bugzilla-access.log combined
</VirtualHost>
EOF

  a2dissite 000-default >/dev/null 2>&1 || true
  a2ensite bugzilla    >/dev/null
  apache2ctl configtest

  systemctl reset-failed apache2 >/dev/null 2>&1 || true
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl restart apache2
}

# ── 10. TLS via Let's Encrypt ────────────────────────────────────────
step_tls() {
  if [[ "${ENABLE_TLS}" != "true" ]]; then
    log "Skipping TLS (ENABLE_TLS=false)."
    return
  fi
  if [[ "${APACHE_PORT}" != "80" ]]; then
    warn "ENABLE_TLS=true but APACHE_PORT=${APACHE_PORT}; Let's Encrypt"
    warn "needs port 80 for HTTP-01 challenge. Skipping certbot."
    return
  fi
  log "Requesting Let's Encrypt cert for ${DOMAIN}…"
  certbot --apache --non-interactive --agree-tos \
    -m "${LE_EMAIL}" -d "${DOMAIN}" \
    --redirect --keep-until-expiring
}

# ── 11. verify it's actually serving ─────────────────────────────────
step_verify() {
  log "Verifying Apache responds on :${APACHE_PORT}…"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    "http://localhost:${APACHE_PORT}/" || true)
  case "$code" in
    200|301|302)
      log "✓ HTTP ${code} from localhost:${APACHE_PORT}"
      ;;
    *)
      warn "Got HTTP '${code}' from localhost:${APACHE_PORT} — investigate:"
      warn "  sudo journalctl -xeu apache2.service --no-pager | tail -50"
      warn "  sudo tail -n 50 /var/log/apache2/bugzilla-error.log"
      ;;
  esac
}

# ── 12. summary ──────────────────────────────────────────────────────
step_summary() {
  cat <<EOF

  ────────────────────────────────────────────────────────────
  Bugzilla install complete

    URL       : ${PUBLIC_URL}
    Admin     : ${ADMIN_EMAIL}
    Password  : (see /root/.bugzilla-admin-password)
    Install   : ${INSTALL_DIR}
    Database  : ${DB_NAME}@${DB_HOST}
    Apache    : listening on :${APACHE_PORT}
    SMTP      : ${SMTP_HOST}:${SMTP_PORT} via msmtp
    Logs      : /var/log/apache2/bugzilla-{access,error}.log
                /var/log/msmtp.log
                /var/log/bugzilla-install.log

  Don't forget — open ${APACHE_PORT}/tcp in your Azure NSG:
    Portal → VM → Networking → Add inbound port rule
      Destination port: ${APACHE_PORT}
      Protocol: TCP, Action: Allow

  Next steps
    1. Open the URL, log in with the admin password above.
    2. Administration → Parameters → urlbase = ${PUBLIC_URL}/
    3. Administration → Products → create your first product.
    4. File a bug, change status, confirm the email arrives.
    5. Backups:
         mysqldump ${DB_NAME} | gzip > bugs-\$(date +%F).sql.gz
         tar czf bugs-data-\$(date +%F).tgz ${INSTALL_DIR}/data
    6. Re-run this script after editing .env or to upgrade Bugzilla.
       (Add FRESH_INSTALL=true to nuke and start over.)
  ────────────────────────────────────────────────────────────

EOF
}

main() {
  require_root
  load_env
  step_reset
  step_apt_deps
  step_mariadb
  step_clone
  step_perl_deps
  step_msmtp
  step_localconfig
  step_filesystem
  step_checksetup
  step_apache
  step_tls
  step_verify
  step_summary
}

main "$@" 2>&1 | tee -a /var/log/bugzilla-install.log
