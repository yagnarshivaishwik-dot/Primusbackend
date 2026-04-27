#!/usr/bin/env bash
# Bugzilla installer for Ubuntu 22.04 / 24.04 on an Azure VM.
# Idempotent — safe to re-run after fixing config or upgrading.
#
# Usage:
#   1. cp .env.example .env  &&  edit .env
#   2. sudo ./install.sh
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
    graphviz patchutils \
    msmtp msmtp-mta mailutils \
    certbot python3-certbot-apache \
    curl ca-certificates openssl
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
    DBD::mysql \
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
\$db_driver        = 'mysql';
\$db_host          = '${DB_HOST}';
\$db_name          = '${DB_NAME}';
\$db_user          = '${DB_USER}';
\$db_pass          = '${DB_PASS}';
\$db_port          = 0;
\$db_sock          = '';
\$db_check         = 1;
\$index_html       = 0;
\$interdiffbin     = '/usr/bin/interdiff';
\$diffpath         = '/usr/bin/diff';
\$site_wide_secret = '${secret}';
EOF
  chown www-data:www-data localconfig
  chmod 640 localconfig
}

# ── 7. checksetup.pl (schema + admin) ────────────────────────────────
step_checksetup() {
  log "Running checksetup.pl…"
  cd "${INSTALL_DIR}"

  local admin_pass="${ADMIN_PASSWORD:-}"
  if [[ -z "$admin_pass" ]]; then
    admin_pass=$(openssl rand -base64 18)
    log "Generated admin password — saving to /root/.bugzilla-admin-password"
  fi

  local scheme="http"
  [[ "${ENABLE_TLS}" == "true" ]] && scheme="https"

  local answers=/tmp/bugzilla-answers.$$
  cat > "$answers" <<EOF
\$answer{'ADMIN_EMAIL'}          = '${ADMIN_EMAIL}';
\$answer{'ADMIN_PASSWORD'}       = '${admin_pass}';
\$answer{'ADMIN_REALNAME'}       = 'Bugzilla Admin';
\$answer{'urlbase'}              = '${scheme}://${DOMAIN}/';
\$answer{'ssl_redirect'}         = $( [[ "$scheme" == "https" ]] && echo 1 || echo 0 );
\$answer{'mail_delivery_method'} = 'Sendmail';
\$answer{'mailfrom'}             = '${SMTP_FROM}';
\$answer{'sendmailnow'}          = 1;
EOF

  ./checksetup.pl "$answers"
  rm -f "$answers"

  install -m 600 /dev/null /root/.bugzilla-admin-password
  printf '%s\n' "$admin_pass" > /root/.bugzilla-admin-password

  chown -R www-data:www-data "${INSTALL_DIR}"
}

# ── 8. apache vhost ──────────────────────────────────────────────────
step_apache() {
  log "Configuring Apache vhost for ${DOMAIN}…"
  a2enmod cgi headers rewrite ssl perl expires deflate >/dev/null

  cat > /etc/apache2/sites-available/bugzilla.conf <<EOF
<VirtualHost *:80>
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
  systemctl reload apache2
}

# ── 9. TLS via Let's Encrypt ─────────────────────────────────────────
step_tls() {
  if [[ "${ENABLE_TLS}" != "true" ]]; then
    log "Skipping TLS (ENABLE_TLS=false)."
    return
  fi
  log "Requesting Let's Encrypt cert for ${DOMAIN}…"
  certbot --apache --non-interactive --agree-tos \
    -m "${LE_EMAIL}" -d "${DOMAIN}" \
    --redirect --keep-until-expiring
}

# ── 10. summary ──────────────────────────────────────────────────────
step_summary() {
  local scheme="http"
  [[ "${ENABLE_TLS}" == "true" ]] && scheme="https"
  cat <<EOF

  ────────────────────────────────────────────────────────────
  Bugzilla install complete

    URL       : ${scheme}://${DOMAIN}
    Admin     : ${ADMIN_EMAIL}
    Password  : (see /root/.bugzilla-admin-password)
    Install   : ${INSTALL_DIR}
    Database  : ${DB_NAME}@${DB_HOST}
    SMTP      : ${SMTP_HOST}:${SMTP_PORT} via msmtp
    Logs      : /var/log/apache2/bugzilla-{access,error}.log
                /var/log/msmtp.log
                /var/log/bugzilla-install.log

  Next steps
    1. Open the URL, log in, change the admin password.
    2. Administration → Products → create your first product.
    3. Trigger a bug change and confirm the email arrives.
    4. Schedule backups:
         mysqldump ${DB_NAME} | gzip > bugs-\$(date +%F).sql.gz
         tar czf bugs-data-\$(date +%F).tgz ${INSTALL_DIR}/data
    5. Re-run this script after editing .env or to upgrade Bugzilla.
  ────────────────────────────────────────────────────────────

EOF
}

main() {
  require_root
  load_env
  step_apt_deps
  step_mariadb
  step_clone
  step_perl_deps
  step_msmtp
  step_localconfig
  step_checksetup
  step_apache
  step_tls
  step_summary
}

main "$@" 2>&1 | tee -a /var/log/bugzilla-install.log
