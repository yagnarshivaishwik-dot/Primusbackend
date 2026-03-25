#!/bin/bash

# =============================================================================
# PRIMUS BACKEND - DEPLOYMENT CLEANUP SCRIPT
# =============================================================================
# This script cleans up a previous Primus deployment to allow fresh installation
# 
# USAGE:
# chmod +x cleanup_deployment.sh && sudo ./cleanup_deployment.sh
#
# WARNING: This will remove all Primus data, users, and configurations!
# =============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${YELLOW}🧹 $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo)"
   exit 1
fi

print_header "PRIMUS DEPLOYMENT CLEANUP"
print_warning "This will remove ALL Primus data, users, and configurations!"
echo ""

read -p "Are you sure you want to continue? This action cannot be undone! (type 'yes' to confirm): " -r
if [[ ! $REPLY == "yes" ]]; then
    print_info "Cleanup cancelled."
    exit 0
fi

echo ""
print_header "Starting cleanup process..."

# =============================================================================
# STOP SERVICES
# =============================================================================
print_info "Stopping Primus services..."
systemctl stop primus-backend || true
systemctl disable primus-backend || true

# =============================================================================
# REMOVE SYSTEMD SERVICE
# =============================================================================
print_info "Removing systemd service..."
rm -f /etc/systemd/system/primus-backend.service
systemctl daemon-reload

# =============================================================================
# REMOVE NGINX CONFIGURATION
# =============================================================================
print_info "Removing Nginx configuration..."
rm -f /etc/nginx/sites-enabled/primus
rm -f /etc/nginx/sites-available/primus
systemctl reload nginx || true

# =============================================================================
# REMOVE POSTGRESQL DATABASE AND USER
# =============================================================================
print_info "Removing PostgreSQL database and user..."
sudo -u postgres psql -c "DROP DATABASE IF EXISTS primus_db;" || true
sudo -u postgres psql -c "DROP USER IF EXISTS primus;" || true

# =============================================================================
# REMOVE APPLICATION FILES
# =============================================================================
print_info "Removing application files..."
rm -rf /var/www/primus
rm -rf /var/log/primus

# =============================================================================
# REMOVE SYSTEM USER
# =============================================================================
print_info "Removing system user..."
userdel primus || true
groupdel primus || true

# =============================================================================
# REMOVE SCRIPTS AND CRON JOBS
# =============================================================================
print_info "Removing management scripts..."
rm -f /usr/local/bin/primus-backup.sh
rm -f /usr/local/bin/primus-status.sh

# Remove cron jobs
print_info "Removing cron jobs..."
crontab -l 2>/dev/null | grep -v primus | crontab - || true

# =============================================================================
# REMOVE LOG ROTATION
# =============================================================================
print_info "Removing log rotation configuration..."
rm -f /etc/logrotate.d/primus

print_status "Cleanup completed successfully!"
print_info "You can now run the deployment script again for a fresh installation."
echo ""
print_header "🎉 CLEANUP COMPLETE! 🎉"
