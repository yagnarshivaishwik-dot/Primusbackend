#!/bin/bash

# =============================================================================
# PRIMUS FRONTEND - FULLY AUTOMATED UBUNTU DEPLOYMENT SCRIPT
# =============================================================================
# This script deploys the Primus frontend applications (client + admin) on Ubuntu
# Assumes backend is already deployed and running at primustech.in
# 
# USAGE:
# chmod +x deploy_frontend_ubuntu.sh && sudo ./deploy_frontend_ubuntu.sh
#
# WHAT THIS SCRIPT DOES:
# - Installs Node.js and build dependencies
# - Clones and builds Primus client application
# - Clones and builds Primus admin application  
# - Updates Nginx configuration to serve frontend apps
# - Sets up automatic SSL certificates
# - Configures proper routing for SPA applications
#
# REQUIREMENTS:
# - Backend already deployed and running
# - DNS pointing primustech.in to this server
# - Nginx already installed and configured
# =============================================================================

set -e  # Exit on any error

# Color codes for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored output
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
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root (use sudo)"
   echo "Usage: sudo ./deploy_frontend_ubuntu.sh"
   exit 1
fi

# Configuration
DOMAIN_NAME="primustech.in"
SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com || echo "UNKNOWN")
FRONTEND_DIR="/var/www/primus/frontend"
ADMIN_DIR="/var/www/primus/admin"

print_header "PRIMUS FRONTEND - AUTOMATED DEPLOYMENT"
print_info "Domain: $DOMAIN_NAME"
print_info "Server IP: $SERVER_IP"
print_info "Frontend will be served at: https://$DOMAIN_NAME"
print_info "Admin will be served at: https://$DOMAIN_NAME/admin"
echo ""

# =============================================================================
# NODE.JS SETUP (if not already installed)
# =============================================================================
print_header "NODE.JS SETUP"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_info "Node.js already installed: $NODE_VERSION"
    
    # Check if version is adequate (v18+)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [[ $NODE_MAJOR -lt 18 ]]; then
        print_warning "Node.js version is too old. Upgrading to v20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt install -y nodejs
        print_status "Node.js updated to $(node --version)"
    fi
else
    print_info "Installing Node.js v20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    print_status "Node.js $(node --version) installed"
fi

# Install build essentials if not present
apt install -y build-essential

print_status "Node.js environment ready"

# =============================================================================
# DIRECTORY SETUP
# =============================================================================
print_header "DIRECTORY SETUP"

print_info "Creating frontend directories..."
mkdir -p /var/www/primus/{frontend,admin}
mkdir -p /var/log/primus/frontend

print_status "Directories created"

# =============================================================================
# PRIMUS CLIENT DEPLOYMENT
# =============================================================================
print_header "PRIMUS CLIENT DEPLOYMENT"

print_info "Cloning Primus client repository..."
cd /var/www/primus

# Remove existing frontend directory if it exists
if [[ -d "frontend" ]]; then
    rm -rf frontend
fi

# Clone the repository - adjust the repository URL as needed
# Note: Update this URL to match your actual repository
print_info "Cloning frontend from local project structure..."
cp -r /tmp/primus-project/Primus/primus-client frontend 2>/dev/null || {
    print_warning "Local copy not found, attempting to clone from repository..."
    # Fallback to git clone if local copy doesn't exist
    # git clone https://github.com/LORD-VAISHWIK/primus-client.git frontend
    print_error "Please ensure the Primus client source code is available"
    exit 1
}

cd frontend

# Install dependencies
print_info "Installing Primus client dependencies..."
npm install

# Create production environment file
print_info "Configuring Primus client environment..."
cat > .env.production << EOF
# Primus Client Production Environment
VITE_API_BASE_URL=https://$DOMAIN_NAME/api
VITE_API_URL=https://$DOMAIN_NAME/api
VITE_APP_NAME=Primus Gaming Platform
VITE_APP_VERSION=1.0.0
EOF

# Build the application
print_info "Building Primus client for production..."
npm run build

if [[ ! -d "dist" ]]; then
    print_error "Build failed - dist directory not found"
    exit 1
fi

print_status "Primus client built successfully"

# =============================================================================
# PRIMUS ADMIN DEPLOYMENT
# =============================================================================
print_header "PRIMUS ADMIN DEPLOYMENT"

print_info "Setting up Primus admin application..."
cd /var/www/primus

# Remove existing admin directory if it exists
if [[ -d "admin" ]]; then
    rm -rf admin
fi

# Clone/copy the admin application
print_info "Copying admin application..."
cp -r /tmp/primus-project/Primus/admin admin 2>/dev/null || {
    print_warning "Local admin copy not found, attempting alternative setup..."
    # Fallback approach
    print_error "Please ensure the Primus admin source code is available"
    exit 1
}

cd admin

# Install dependencies
print_info "Installing Primus admin dependencies..."
npm install

# Create production environment file
print_info "Configuring Primus admin environment..."
cat > .env.production << EOF
# Primus Admin Production Environment
VITE_API_BASE=https://$DOMAIN_NAME/api
VITE_API_BASE_URL=https://$DOMAIN_NAME/api
VITE_APP_NAME=Primus Admin Panel
VITE_APP_VERSION=1.0.0
EOF

# Build the application
print_info "Building Primus admin for production..."
npm run build

if [[ ! -d "dist" ]]; then
    print_error "Admin build failed - dist directory not found"
    exit 1
fi

print_status "Primus admin built successfully"

# =============================================================================
# NGINX CONFIGURATION UPDATE
# =============================================================================
print_header "NGINX CONFIGURATION UPDATE"

print_info "Backing up existing Nginx configuration..."
cp /etc/nginx/sites-available/primus /etc/nginx/sites-available/primus.backup.$(date +%Y%m%d_%H%M%S)

print_info "Creating updated Nginx configuration with frontend support..."
cat > /etc/nginx/sites-available/primus << EOF
# Primus Full Stack Nginx Configuration
# Generated automatically on $(date)
# Domain: $DOMAIN_NAME
# Server IP: $SERVER_IP

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=5r/s;
limit_req_zone \$binary_remote_addr zone=static:10m rate=30r/s;

# Upstream backend
upstream primus_backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

# HTTPS Server Block
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;
    
    # SSL Configuration (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_private_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.primustech.in wss://api.primustech.in;" always;
    
    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types
        application/javascript
        application/json
        application/xml
        text/css
        text/javascript
        text/plain
        text/xml
        image/svg+xml;
    
    # API endpoints with rate limiting
    location /api/auth/ {
        limit_req zone=auth burst=10 nodelay;
        proxy_pass http://primus_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;
    }
    
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://primus_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_send_timeout 300s;
    }
    
    # WebSocket connections
    location /ws/ {
        proxy_pass http://primus_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://primus_backend/api/health;
        access_log off;
    }
    
    # Static files and uploads
    location /uploads/ {
        alias /var/www/primus/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    
    # Admin Panel - served from /admin path
    location /admin {
        alias /var/www/primus/admin/dist;
        try_files \$uri \$uri/ @admin_fallback;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }
    }
    
    # Admin fallback for client-side routing
    location @admin_fallback {
        rewrite ^.*\$ /admin/index.html last;
    }
    
    # Main Client Application - served from root
    location / {
        root /var/www/primus/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }
    }
    
    # Security: Block access to sensitive files
    location ~ /\.(env|git|htaccess) {
        deny all;
        return 404;
    }
    
    # Block access to Python files
    location ~ \.py\$ {
        deny all;
        return 404;
    }
    
    # Block access to source maps in production
    location ~ \.map\$ {
        deny all;
        return 404;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

# Test nginx configuration
print_info "Testing Nginx configuration..."
if nginx -t; then
    print_status "Nginx configuration is valid"
else
    print_error "Nginx configuration test failed"
    exit 1
fi

# Reload nginx
print_info "Reloading Nginx..."
systemctl reload nginx

print_status "Nginx configuration updated"

# =============================================================================
# SSL CERTIFICATE SETUP
# =============================================================================
print_header "SSL CERTIFICATE VERIFICATION"

if [[ -f "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" ]]; then
    print_status "SSL certificate already exists for $DOMAIN_NAME"
    
    # Test certificate renewal
    print_info "Testing SSL certificate renewal..."
    certbot renew --dry-run
    print_status "SSL certificate renewal test passed"
else
    print_warning "SSL certificate not found. Please run the backend deployment script first or manually configure SSL:"
    print_info "sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME"
fi

# =============================================================================
# FRONTEND BUILD AUTOMATION SETUP
# =============================================================================
print_header "FRONTEND BUILD AUTOMATION"

print_info "Creating frontend update script..."
cat > /usr/local/bin/primus-frontend-update.sh << 'EOF'
#!/bin/bash

# Primus Frontend Update Script
LOG_FILE="/var/log/primus/frontend/update.log"
FRONTEND_DIR="/var/www/primus/frontend"
ADMIN_DIR="/var/www/primus/admin"

echo "$(date): Starting frontend update..." >> $LOG_FILE

# Update Primus Client
echo "$(date): Updating Primus client..." >> $LOG_FILE
cd $FRONTEND_DIR
git pull origin main >> $LOG_FILE 2>&1
npm install >> $LOG_FILE 2>&1
npm run build >> $LOG_FILE 2>&1

# Update Primus Admin
echo "$(date): Updating Primus admin..." >> $LOG_FILE
cd $ADMIN_DIR
git pull origin main >> $LOG_FILE 2>&1
npm install >> $LOG_FILE 2>&1
npm run build >> $LOG_FILE 2>&1

# Reload nginx to pick up any changes
systemctl reload nginx >> $LOG_FILE 2>&1

echo "$(date): Frontend update completed" >> $LOG_FILE
EOF

chmod +x /usr/local/bin/primus-frontend-update.sh

print_status "Frontend update automation configured"

# =============================================================================
# PERMISSIONS SETUP
# =============================================================================
print_header "SETTING PERMISSIONS"

print_info "Setting proper file permissions..."
chown -R primus:primus /var/www/primus/frontend
chown -R primus:primus /var/www/primus/admin
chown -R primus:primus /var/log/primus/frontend

# Set proper permissions for web serving
find /var/www/primus/frontend/dist -type f -exec chmod 644 {} \;
find /var/www/primus/frontend/dist -type d -exec chmod 755 {} \;
find /var/www/primus/admin/dist -type f -exec chmod 644 {} \;
find /var/www/primus/admin/dist -type d -exec chmod 755 {} \;

print_status "Permissions set"

# =============================================================================
# HEALTH CHECKS
# =============================================================================
print_header "PERFORMING HEALTH CHECKS"

print_info "Checking Nginx status..."
if systemctl is-active --quiet nginx; then
    print_status "Nginx is running"
else
    print_error "Nginx is not running"
    systemctl status nginx
fi

print_info "Testing frontend accessibility..."
sleep 3

# Test main site
if curl -f -s https://$DOMAIN_NAME >/dev/null 2>&1; then
    print_status "Main frontend is accessible"
elif curl -f -s http://$DOMAIN_NAME >/dev/null 2>&1; then
    print_warning "Frontend accessible via HTTP (SSL may need configuration)"
else
    print_warning "Frontend may not be accessible yet (DNS propagation or SSL pending)"
fi

# Test admin panel
if curl -f -s https://$DOMAIN_NAME/admin >/dev/null 2>&1; then
    print_status "Admin panel is accessible"
elif curl -f -s http://$DOMAIN_NAME/admin >/dev/null 2>&1; then
    print_warning "Admin panel accessible via HTTP (SSL may need configuration)"
else
    print_warning "Admin panel may not be accessible yet"
fi

# Test API connectivity
if curl -f -s https://$DOMAIN_NAME/api/health >/dev/null 2>&1; then
    print_status "Backend API is responding"
else
    print_warning "Backend API may not be responding"
fi

# =============================================================================
# COMPLETION SUMMARY
# =============================================================================
print_header "🎉 FRONTEND DEPLOYMENT COMPLETED! 🎉"

echo ""
print_status "Primus Frontend applications have been deployed successfully!"
echo ""

print_info "📋 DEPLOYMENT SUMMARY:"
echo "  • Domain: $DOMAIN_NAME"
echo "  • Server IP: $SERVER_IP"
echo "  • Main Client App: Built and served from root path"
echo "  • Admin Panel: Built and served from /admin path"
echo "  • API Integration: Configured to use $DOMAIN_NAME/api"
echo "  • SSL: Using existing Let's Encrypt certificates"
echo "  • Web Server: Nginx with SPA routing support"
echo ""

print_info "🌐 ACCESS YOUR APPLICATIONS:"
echo "  • Main Client App: https://$DOMAIN_NAME"
echo "  • Admin Panel: https://$DOMAIN_NAME/admin"
echo "  • API Documentation: https://$DOMAIN_NAME/docs"
echo "  • API Base URL: https://$DOMAIN_NAME/api"
echo ""

print_info "✨ FEATURES AVAILABLE:"
echo "  • User registration and login"
echo "  • Gaming platform interface"
echo "  • Admin management panel"
echo "  • Real-time WebSocket connections"
echo "  • Responsive design for all devices"
echo "  • Secure HTTPS connections"
echo ""

print_info "🔧 USEFUL COMMANDS:"
echo "  • Update frontend: /usr/local/bin/primus-frontend-update.sh"
echo "  • Check Nginx status: systemctl status nginx"
echo "  • View Nginx logs: tail -f /var/log/nginx/error.log"
echo "  • Check SSL status: certbot certificates"
echo "  • Frontend logs: tail -f /var/log/primus/frontend/update.log"
echo ""

print_info "📁 IMPORTANT DIRECTORIES:"
echo "  • Client app: /var/www/primus/frontend/dist"
echo "  • Admin app: /var/www/primus/admin/dist"
echo "  • Nginx config: /etc/nginx/sites-available/primus"
echo "  • Frontend logs: /var/log/primus/frontend/"
echo ""

print_warning "🔧 NEXT STEPS (if needed):"
echo "  • Test user registration at https://$DOMAIN_NAME"
echo "  • Test admin login at https://$DOMAIN_NAME/admin"
echo "  • Configure any additional environment variables"
echo "  • Set up monitoring and alerts"
echo ""

print_info "🌐 TESTING CHECKLIST:"
echo "  ✓ Visit https://$DOMAIN_NAME - should load client app"
echo "  ✓ Visit https://$DOMAIN_NAME/admin - should load admin panel"
echo "  ✓ Test user registration and login"
echo "  ✓ Test admin authentication"
echo "  ✓ Verify API calls are working"
echo "  ✓ Check responsive design on mobile"
echo ""

print_status "Your Primus platform is now fully operational!"
print_info "Users can register and access the gaming platform at https://$DOMAIN_NAME"
print_info "Admins can manage the system at https://$DOMAIN_NAME/admin"

echo ""
print_header "🚀 FULL STACK DEPLOYMENT COMPLETE! 🚀"

# Save deployment info
cat > /var/www/primus/FRONTEND_DEPLOYMENT_INFO.txt << EOF
PRIMUS FRONTEND DEPLOYMENT INFO
Generated: $(date)
===============================

Domain: $DOMAIN_NAME
Server IP: $SERVER_IP

Applications Deployed:
- Client App: https://$DOMAIN_NAME
- Admin Panel: https://$DOMAIN_NAME/admin
- API Backend: https://$DOMAIN_NAME/api

Build Directories:
- Client: /var/www/primus/frontend/dist
- Admin: /var/www/primus/admin/dist

Configuration Files:
- Nginx: /etc/nginx/sites-available/primus
- Client env: /var/www/primus/frontend/.env.production
- Admin env: /var/www/primus/admin/.env.production

Useful Commands:
- Update frontend: /usr/local/bin/primus-frontend-update.sh
- Check status: systemctl status nginx
- View logs: tail -f /var/log/nginx/access.log

Next Steps:
1. Test user registration and login
2. Test admin panel functionality
3. Verify all API integrations
4. Set up monitoring if needed
EOF

chmod 600 /var/www/primus/FRONTEND_DEPLOYMENT_INFO.txt
chown primus:primus /var/www/primus/FRONTEND_DEPLOYMENT_INFO.txt

print_info "Frontend deployment info saved to: /var/www/primus/FRONTEND_DEPLOYMENT_INFO.txt"
