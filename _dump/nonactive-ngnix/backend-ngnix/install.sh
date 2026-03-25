#!/bin/bash

# =============================================================================
# PRIMUS BACKEND - ONE-LINE INSTALLER
# =============================================================================
# This script downloads and runs the automated deployment script
#
# USAGE:
# curl -sSL https://raw.githubusercontent.com/LORD-VAISHWIK/primus-backend/main/install.sh | bash -s yourdomain.com admin@yourdomain.com
#
# EXAMPLE:
# curl -sSL https://raw.githubusercontent.com/LORD-VAISHWIK/primus-backend/main/install.sh | bash -s primus.example.com admin@example.com
#
# NOTE: Email is used for SSL certificate registration only. SMTP will be configured separately if needed.
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

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${YELLOW}🚀 $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo)"
   exit 1
fi

# Parse arguments
DOMAIN_NAME=${1:-"localhost"}
EMAIL=${2:-"admin@localhost"}

print_header "PRIMUS BACKEND - ONE-LINE INSTALLER"
print_info "Domain: $DOMAIN_NAME"
print_info "Email: $EMAIL"
echo ""

# Download the full deployment script
print_info "Downloading automated deployment script..."
curl -sSL https://raw.githubusercontent.com/LORD-VAISHWIK/primus-backend/main/deploy_ubuntu_auto.sh -o /tmp/deploy_ubuntu_auto.sh

# Make it executable
chmod +x /tmp/deploy_ubuntu_auto.sh

print_status "Deployment script downloaded"

# Run the deployment
print_header "Starting automated deployment..."
/tmp/deploy_ubuntu_auto.sh "$DOMAIN_NAME" "$EMAIL"

# Clean up
rm -f /tmp/deploy_ubuntu_auto.sh

print_status "Installation completed!"
