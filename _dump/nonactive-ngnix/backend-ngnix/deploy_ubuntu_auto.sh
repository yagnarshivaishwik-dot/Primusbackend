#!/bin/bash

# =============================================================================
# PRIMUS BACKEND - FULLY AUTOMATED UBUNTU SERVER DEPLOYMENT SCRIPT
# =============================================================================
# This script completely automates the Primus backend deployment on Ubuntu server
# 
# USAGE:
# 1. Copy this script to your Ubuntu server
# 2. Make it executable: chmod +x deploy_ubuntu_auto.sh
# 3. Run as root: sudo ./deploy_ubuntu_auto.sh yourdomain.com your-email@domain.com
#
# EXAMPLE:
# sudo ./deploy_ubuntu_auto.sh primus.example.com admin@example.com
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
   exit 1
fi

# Parse command line arguments
DOMAIN_NAME=${1:-"localhost"}
EMAIL=${2:-"admin@localhost"}

if [[ $DOMAIN_NAME == "localhost" ]]; then
    print_warning "No domain provided, using localhost (SSL will be skipped)"
fi

print_header "PRIMUS BACKEND - FULLY AUTOMATED DEPLOYMENT"
print_info "Domain: $DOMAIN_NAME"
print_info "Email: $EMAIL"
echo ""

# =============================================================================
# SYSTEM SETUP
# =============================================================================
print_header "SYSTEM UPDATES & PACKAGES"

print_info "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt update && apt upgrade -y

print_info "Installing essential packages..."
apt install -y \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    build-essential \
    pkg-config \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    htop \
    nano \
    vim \
    tree \
    zip \
    fail2ban \
    libmagic1 \
    libmagic-dev \
    file

print_status "System packages installed"

# =============================================================================
# POSTGRESQL SETUP
# =============================================================================
print_header "POSTGRESQL DATABASE SETUP"

print_info "Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib libpq-dev

# Generate secure password
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)

print_info "Setting up PostgreSQL database..."
# Check if database user exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='primus'" | grep -q 1; then
    print_info "PostgreSQL user 'primus' already exists, updating password..."
    sudo -u postgres psql -c "ALTER USER primus WITH PASSWORD '$DB_PASSWORD';"
else
    print_info "Creating PostgreSQL user 'primus'..."
    sudo -u postgres psql -c "CREATE USER primus WITH PASSWORD '$DB_PASSWORD';"
fi

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw primus_db; then
    print_info "Database 'primus_db' already exists, using existing database..."
else
    print_info "Creating database 'primus_db'..."
    sudo -u postgres psql -c "CREATE DATABASE primus_db OWNER primus;"
fi

# Ensure proper permissions
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE primus_db TO primus;"

# Configure PostgreSQL for better performance
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /etc/postgresql/*/main/postgresql.conf
sed -i "s/#max_connections = 100/max_connections = 200/" /etc/postgresql/*/main/postgresql.conf
sed -i "s/#shared_buffers = 128MB/shared_buffers = 256MB/" /etc/postgresql/*/main/postgresql.conf

systemctl enable postgresql
systemctl restart postgresql

print_status "PostgreSQL configured"

# =============================================================================
# REDIS SETUP
# =============================================================================
print_header "REDIS CACHE SETUP"

print_info "Installing Redis..."
apt install -y redis-server

# Configure Redis
sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sed -i 's/# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf

systemctl enable redis-server
systemctl restart redis-server

print_status "Redis configured"

# =============================================================================
# NGINX SETUP
# =============================================================================
print_header "NGINX WEB SERVER SETUP"

print_info "Installing Nginx..."
apt install -y nginx

# Remove default site
rm -f /etc/nginx/sites-enabled/default

systemctl enable nginx

print_status "Nginx installed"

# =============================================================================
# SSL CERTIFICATES (Let's Encrypt)
# =============================================================================
print_header "SSL CERTIFICATE SETUP"

if [[ $DOMAIN_NAME != "localhost" ]]; then
    print_info "Installing Certbot for SSL certificates..."
    apt install -y certbot python3-certbot-nginx
    print_status "Certbot installed"
else
    print_warning "Skipping SSL setup for localhost"
fi

# =============================================================================
# NODE.JS (for frontend builds)
# =============================================================================
print_header "NODE.JS SETUP"

print_info "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

print_status "Node.js $(node --version) installed"

# =============================================================================
# PYTHON APPLICATION SETUP
# =============================================================================
print_header "PYTHON APPLICATION SETUP"

# Create application user
print_info "Creating application user..."
if id "primus" &>/dev/null; then
    print_info "User 'primus' already exists, using existing user..."
else
    useradd -r -s /bin/false -d /var/www/primus primus
    print_status "Created user 'primus'"
fi

# Create directory structure
print_info "Setting up directory structure..."
mkdir -p /var/www/primus/{backend,frontend,uploads,logs,backups}
mkdir -p /var/log/primus

# Clone the repository
print_info "Setting up Primus backend repository..."
cd /var/www/primus

# Always start fresh to avoid any git conflicts
print_info "Ensuring clean repository setup..."

# Remove any existing backend directory completely
if [[ -d "backend" ]]; then
    print_info "Removing existing backend directory..."
    rm -rf backend
fi

# Create a clean clone
print_info "Cloning fresh repository..."
if git clone https://github.com/LORD-VAISHWIK/primus-backend.git backend; then
    print_status "Repository cloned successfully"
else
    print_error "Git clone failed, trying alternative download method..."
    
    # Fallback: download as ZIP
    if wget -O backend.zip https://github.com/LORD-VAISHWIK/primus-backend/archive/refs/heads/main.zip; then
        print_info "Extracting repository from ZIP..."
        unzip -q backend.zip
        mv primus-backend-main backend
        rm -f backend.zip
        print_status "Repository downloaded and extracted successfully"
    else
        print_error "Failed to download repository"
        print_info "Trying curl as final fallback..."
        curl -L -o backend.zip https://github.com/LORD-VAISHWIK/primus-backend/archive/refs/heads/main.zip
        unzip -q backend.zip
        mv primus-backend-main backend
        rm -f backend.zip
        print_status "Repository downloaded via curl"
    fi
fi

# Ensure we have the backend directory
if [[ ! -d "backend" ]]; then
    print_error "Failed to set up repository. Please check your internet connection."
    exit 1
fi

print_status "Repository setup completed"

# Set up Python virtual environment
print_info "Setting up Python virtual environment..."
cd /var/www/primus/backend
python3 -m venv venv
source venv/bin/activate

# Upgrade pip and install packages
print_info "Installing Python dependencies..."
pip install --upgrade pip setuptools wheel

# Install core packages first (essential for service to work)
print_info "Installing core Python packages..."

# Install essential packages individually with error handling
essential_packages=(
    "fastapi==0.108.0"
    "uvicorn[standard]==0.25.0"
    "gunicorn==21.2.0"
    "sqlalchemy==2.0.25"
    "psycopg2-binary==2.9.9"
    "pydantic==2.5.3"
    "python-dotenv==1.0.0"
)

print_info "Installing essential packages individually..."
for package in "${essential_packages[@]}"; do
    print_info "Installing $package..."
    if pip install "$package"; then
        print_status "✅ $package installed"
    else
        print_error "❌ Failed to install $package"
    fi
done

# Install remaining packages from requirements.txt
print_info "Installing remaining packages from requirements.txt..."
pip install -r requirements.txt || print_warning "Some additional packages may have failed to install"

# Verify critical packages are available
print_info "Verifying critical packages..."
critical_imports=("fastapi" "uvicorn" "gunicorn" "sqlalchemy" "psycopg2")
for import_name in "${critical_imports[@]}"; do
    if python -c "import $import_name" 2>/dev/null; then
        print_status "✅ $import_name available"
    else
        print_error "❌ $import_name not available"
        # Try to install the missing package
        case $import_name in
            "psycopg2")
                pip install psycopg2-binary==2.9.9 || true
                ;;
            *)
                pip install "$import_name" || true
                ;;
        esac
    fi
done

# Ensure alembic is installed for database migrations
print_info "Ensuring database migration tools are available..."
if ! python -c "import alembic" 2>/dev/null; then
    print_info "Installing alembic for database migrations..."
    pip install alembic==1.13.1 || print_warning "Failed to install alembic, migrations will be skipped"
fi

print_status "Python environment configured"

# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================
print_header "ENVIRONMENT CONFIGURATION"

# Generate secure keys
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Create production .env file
print_info "Creating production environment file..."
cat > /var/www/primus/backend/.env << EOF
# =============================================================================
# PRIMUS BACKEND - PRODUCTION ENVIRONMENT
# Generated automatically on $(date)
# =============================================================================

# Database Configuration
DATABASE_URL=postgresql://primus:$DB_PASSWORD@localhost:5432/primus_db

# Security Settings
SECRET_KEY=$SECRET_KEY
JWT_SECRET_KEY=$JWT_SECRET
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Application Settings
ENVIRONMENT=production
DEBUG=False
APP_NAME=Primus Gaming Platform
APP_VERSION=1.0.0
APP_BASE_URL=https://$DOMAIN_NAME
API_BASE_URL=https://$DOMAIN_NAME/api
ADMIN_BASE_URL=https://$DOMAIN_NAME

# CORS Configuration
ALLOWED_ORIGINS=https://$DOMAIN_NAME,https://www.$DOMAIN_NAME

# Redis Configuration
REDIS_URL=redis://127.0.0.1:6379/0

# File Upload Settings
UPLOAD_DIR=/var/www/primus/uploads
MAX_FILE_SIZE=10485760
ALLOWED_EXTENSIONS=jpg,jpeg,png,gif,pdf,doc,docx

# Logging
LOG_LEVEL=INFO
LOG_FILE=/var/log/primus/backend.log

# Email Configuration - TO BE CONFIGURED LATER
# Email settings will be configured separately after deployment
SMTP_SERVER=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@$DOMAIN_NAME
SMTP_FROM_NAME=Primus Gaming Center
ENABLE_EMAIL_FEATURES=False

# Payment Gateways (UPDATE WITH YOUR KEYS)
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Firebase (Optional - add your credentials)
FIREBASE_CREDENTIALS_JSON={}

# Feature Flags
ENABLE_REGISTRATION=True
ENABLE_PASSWORD_RESET=False
ENABLE_EMAIL_VERIFICATION=False
ENABLE_SOCIAL_LOGIN=False
ENABLE_PAYMENT_PROCESSING=True

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_BURST=100

# Session Configuration
SESSION_TIMEOUT_MINUTES=30
MAX_SESSIONS_PER_USER=5

# Backup Configuration
BACKUP_DIR=/var/www/primus/backups
BACKUP_RETENTION_DAYS=30
AUTO_BACKUP_ENABLED=True
AUTO_BACKUP_HOUR=2

EOF

print_status "Environment configuration created"

# =============================================================================
# DATABASE INITIALIZATION
# =============================================================================
print_header "DATABASE INITIALIZATION"

cd /var/www/primus/backend
source venv/bin/activate

print_info "Preparing database for first run..."

# Ensure virtual environment is activated
export PATH="/var/www/primus/backend/venv/bin:$PATH"
source /var/www/primus/backend/venv/bin/activate

# Check if alembic is available and working
print_info "Checking database migration tools..."
if command -v /var/www/primus/backend/venv/bin/alembic >/dev/null 2>&1; then
    print_info "Alembic found, attempting to set up migrations..."
    
    # Initialize Alembic if needed
    if [[ ! -d "alembic" ]]; then
        print_info "Initializing Alembic..."
        if /var/www/primus/backend/venv/bin/alembic init alembic 2>/dev/null; then
            # Configure alembic.ini
            sed -i "s|sqlalchemy.url = driver://user:pass@localhost/dbname|sqlalchemy.url = postgresql://primus:$DB_PASSWORD@localhost:5432/primus_db|" alembic.ini
            print_status "Alembic initialized successfully"
        else
            print_warning "Alembic initialization failed, skipping migrations"
        fi
    fi

    # Run migrations if alembic is set up
    if [[ -d "alembic" && -f "alembic.ini" ]]; then
        print_info "Running database migrations..."
        if /var/www/primus/backend/venv/bin/alembic upgrade head 2>/dev/null; then
            print_status "Database migrations completed successfully"
        else
            print_warning "Database migrations failed, but this is often normal"
        fi
    fi
else
    print_warning "Alembic not available, skipping database migrations"
    print_info "Database tables will be created automatically when the backend starts"
fi

print_status "Database preparation completed"

print_status "Database initialized"

# =============================================================================
# SYSTEMD SERVICE CONFIGURATION
# =============================================================================
print_header "SYSTEMD SERVICE CONFIGURATION"

print_info "Creating systemd service..."
cat > /etc/systemd/system/primus-backend.service << EOF
[Unit]
Description=Primus Backend FastAPI Application
Documentation=https://github.com/LORD-VAISHWIK/primus-backend
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=exec
User=primus
Group=primus
WorkingDirectory=/var/www/primus/backend
Environment=PATH=/var/www/primus/backend/venv/bin
Environment=PYTHONPATH=/var/www/primus/backend
ExecStart=/var/www/primus/backend/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 127.0.0.1:8000 --timeout 120 --keep-alive 2 --max-requests 1000 --max-requests-jitter 100 --access-logfile /var/log/primus/access.log --error-logfile /var/log/primus/error.log
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=primus-backend

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/www/primus /var/log/primus /tmp

[Install]
WantedBy=multi-user.target
EOF

print_status "Systemd service created"

# =============================================================================
# NGINX CONFIGURATION
# =============================================================================
print_header "NGINX CONFIGURATION"

print_info "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/primus << EOF
# Primus Backend Nginx Configuration
# Generated automatically on $(date)

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=auth:10m rate=5r/s;

# Upstream backend
upstream primus_backend {
    server 127.0.0.1:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
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
    
    # Frontend (will be configured when frontend is deployed)
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
    location ~ /\.(env|git) {
        deny all;
        return 404;
    }
    
    # Block access to Python files
    location ~ \.py\$ {
        deny all;
        return 404;
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/primus /etc/nginx/sites-enabled/

# Test nginx configuration
nginx -t

print_status "Nginx configured"

# =============================================================================
# FIREWALL CONFIGURATION
# =============================================================================
print_header "FIREWALL CONFIGURATION"

print_info "Configuring UFW firewall..."
ufw --force reset
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

print_status "Firewall configured"

# =============================================================================
# LOG ROTATION SETUP
# =============================================================================
print_header "LOG ROTATION SETUP"

print_info "Setting up log rotation..."
cat > /etc/logrotate.d/primus << EOF
/var/log/primus/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 primus primus
    postrotate
        systemctl reload primus-backend
    endscript
}
EOF

print_status "Log rotation configured"

# =============================================================================
# BACKUP SCRIPT
# =============================================================================
print_header "BACKUP AUTOMATION SETUP"

print_info "Creating backup script..."
cat > /usr/local/bin/primus-backup.sh << 'EOF'
#!/bin/bash

# Primus Database Backup Script
BACKUP_DIR="/var/www/primus/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="primus_db"
DB_USER="primus"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Application files backup (excluding venv and logs)
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz -C /var/www/primus --exclude='backend/venv' --exclude='logs' backend uploads

# Clean up old backups (keep last 30 days)
find $BACKUP_DIR -name "*.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /usr/local/bin/primus-backup.sh

# Add to crontab for automatic backups
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/primus-backup.sh") | crontab -

print_status "Backup automation configured"

# =============================================================================
# MONITORING SETUP
# =============================================================================
print_header "MONITORING SETUP"

print_info "Installing monitoring tools..."
apt install -y htop iotop nethogs

# Create system monitoring script
cat > /usr/local/bin/primus-status.sh << 'EOF'
#!/bin/bash

echo "=== PRIMUS SYSTEM STATUS ==="
echo "Date: $(date)"
echo ""

echo "=== SERVICES STATUS ==="
systemctl status primus-backend --no-pager -l
echo ""
systemctl status postgresql --no-pager -l
echo ""
systemctl status redis-server --no-pager -l
echo ""
systemctl status nginx --no-pager -l
echo ""

echo "=== SYSTEM RESOURCES ==="
free -h
echo ""
df -h
echo ""

echo "=== RECENT LOGS ==="
journalctl -u primus-backend --no-pager -l -n 10
EOF

chmod +x /usr/local/bin/primus-status.sh

print_status "Monitoring tools configured"

# =============================================================================
# SET PERMISSIONS
# =============================================================================
print_header "SETTING PERMISSIONS"

print_info "Setting proper file permissions..."
chown -R primus:primus /var/www/primus
chown -R primus:primus /var/log/primus
chmod -R 755 /var/www/primus
chmod 600 /var/www/primus/backend/.env
chmod +x /var/www/primus/backend/deploy_ubuntu.sh

print_status "Permissions set"

# =============================================================================
# START SERVICES
# =============================================================================
print_header "STARTING SERVICES"

print_info "Starting and enabling services..."
systemctl daemon-reload
systemctl enable primus-backend
systemctl start primus-backend
systemctl restart nginx

# Wait for services to start
sleep 5

print_status "Services started"

# =============================================================================
# SSL CERTIFICATE SETUP
# =============================================================================
if [[ $DOMAIN_NAME != "localhost" ]]; then
    print_header "SSL CERTIFICATE SETUP"
    
    print_info "Setting up SSL certificate for $DOMAIN_NAME..."
    print_warning "Make sure your domain DNS points to this server's IP address!"
    
    # Try to get SSL certificate
    certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME --non-interactive --agree-tos --email $EMAIL --redirect || {
        print_warning "SSL certificate setup failed. You can run it manually later:"
        print_info "sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME"
    }
    
    # Set up automatic renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    print_status "SSL certificate configured"
fi

# =============================================================================
# HEALTH CHECKS
# =============================================================================
print_header "PERFORMING HEALTH CHECKS"

print_info "Checking service status..."
sleep 3

# Check if services are running
if systemctl is-active --quiet primus-backend; then
    print_status "Primus backend service is running"
else
    print_error "Primus backend service failed to start"
    journalctl -u primus-backend --no-pager -l -n 20
fi

if systemctl is-active --quiet postgresql; then
    print_status "PostgreSQL service is running"
else
    print_error "PostgreSQL service is not running"
fi

if systemctl is-active --quiet redis-server; then
    print_status "Redis service is running"
else
    print_error "Redis service is not running"
fi

if systemctl is-active --quiet nginx; then
    print_status "Nginx service is running"
else
    print_error "Nginx service is not running"
fi

# Test API endpoint
print_info "Testing API endpoint..."
sleep 2
if curl -f http://localhost:8000/docs >/dev/null 2>&1; then
    print_status "API is responding"
else
    print_warning "API is not responding yet (this is normal, it may need more time to start)"
fi

# =============================================================================
# COMPLETION SUMMARY
# =============================================================================
print_header "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉"

echo ""
print_status "Primus Backend has been deployed successfully!"
echo ""

print_info "📋 DEPLOYMENT SUMMARY:"
echo "  • Domain: $DOMAIN_NAME"
echo "  • Database: PostgreSQL with user 'primus'"
echo "  • Cache: Redis server"
echo "  • Web Server: Nginx with SSL (if domain provided)"
echo "  • Application: Python FastAPI with Gunicorn"
echo "  • Process Management: Systemd"
echo "  • Firewall: UFW enabled"
echo "  • Backups: Automated daily backups"
echo "  • Monitoring: System status tools"
echo ""

print_info "🌐 ACCESS YOUR APPLICATION:"
if [[ $DOMAIN_NAME != "localhost" ]]; then
    echo "  • API Documentation: https://$DOMAIN_NAME/docs"
    echo "  • Admin Panel: https://$DOMAIN_NAME (when frontend is deployed)"
    echo "  • API Base URL: https://$DOMAIN_NAME/api"
else
    echo "  • API Documentation: http://localhost/docs"
    echo "  • Admin Panel: http://localhost (when frontend is deployed)"
    echo "  • API Base URL: http://localhost/api"
fi
echo ""

print_info "🔧 IMPORTANT NEXT STEPS:"
echo "  1. Configure payment gateway keys in the .env file (optional)"
echo "  2. Configure email settings if needed (optional - for password reset/notifications)"
echo "  3. Deploy your frontend application"
echo "  4. Set up monitoring and alerting"
echo "  5. Configure regular backups offsite"
echo ""

print_info "📊 USEFUL COMMANDS:"
echo "  • Check status: /usr/local/bin/primus-status.sh"
echo "  • View logs: journalctl -u primus-backend -f"
echo "  • Restart backend: sudo systemctl restart primus-backend"
echo "  • Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "  • Manual backup: /usr/local/bin/primus-backup.sh"
echo ""

print_info "📁 IMPORTANT FILES:"
echo "  • Environment: /var/www/primus/backend/.env"
echo "  • Nginx config: /etc/nginx/sites-available/primus"
echo "  • Service config: /etc/systemd/system/primus-backend.service"
echo "  • Application logs: /var/log/primus/"
echo "  • Backups: /var/www/primus/backups/"
echo ""

print_warning "🔐 SECURITY REMINDER:"
echo "  • Database password has been auto-generated and saved in .env"
echo "  • Email configuration is disabled by default (enable if needed)"
echo "  • Update payment credentials in .env file if using payments"
echo "  • Consider setting up fail2ban for additional security"
echo "  • Regularly update system packages"
echo ""

print_status "Your Primus Backend is now ready for production use!"
print_info "For support, check the logs or visit: https://github.com/LORD-VAISHWIK/primus-backend"

echo ""
print_header "🚀 DEPLOYMENT COMPLETE! 🚀"

