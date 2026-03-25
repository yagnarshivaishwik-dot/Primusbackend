#!/bin/bash

# =============================================================================
# PRIMUS BACKEND - IMMEDIATE DEBUG SCRIPT
# =============================================================================
# This script helps diagnose Primus backend deployment issues
# Run with: chmod +x debug_primus.sh && sudo ./debug_primus.sh

echo "🔍 PRIMUS BACKEND DEBUGGING"
echo "=========================="
echo "Date: $(date)"
echo "Server: $(hostname)"
echo ""

# =============================================================================
# CHECK BASIC SYSTEM STATUS
# =============================================================================
echo "📊 SYSTEM STATUS:"
echo "=================="
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo ""

# =============================================================================
# CHECK SERVICES
# =============================================================================
echo "🔧 SERVICE STATUS:"
echo "=================="
services=("primus-backend" "postgresql" "redis-server" "nginx")
for service in "${services[@]}"; do
    if systemctl is-active --quiet "$service"; then
        echo "✅ $service: RUNNING"
    else
        echo "❌ $service: NOT RUNNING"
    fi
done
echo ""

# =============================================================================
# CHECK DIRECTORIES AND FILES
# =============================================================================
echo "📁 FILE STRUCTURE:"
echo "=================="
if [[ -d "/var/www/primus" ]]; then
    echo "✅ /var/www/primus exists"
    ls -la /var/www/primus/ | head -10
else
    echo "❌ /var/www/primus does not exist"
fi
echo ""

if [[ -d "/var/www/primus/backend" ]]; then
    echo "✅ Backend directory exists"
    echo "Files in backend:"
    ls -la /var/www/primus/backend/ | head -10
else
    echo "❌ Backend directory does not exist"
fi
echo ""

# =============================================================================
# CHECK PYTHON ENVIRONMENT
# =============================================================================
echo "🐍 PYTHON ENVIRONMENT:"
echo "======================"
if [[ -d "/var/www/primus/backend/venv" ]]; then
    echo "✅ Virtual environment exists"
    
    # Check Python version
    if [[ -x "/var/www/primus/backend/venv/bin/python" ]]; then
        echo "Python version: $(/var/www/primus/backend/venv/bin/python --version)"
    fi
    
    # Check if key packages are installed
    echo ""
    echo "Key packages:"
    cd /var/www/primus/backend 2>/dev/null || true
    source venv/bin/activate 2>/dev/null || true
    
    packages=("fastapi" "uvicorn" "gunicorn" "sqlalchemy" "psycopg2")
    for pkg in "${packages[@]}"; do
        if python -c "import $pkg" 2>/dev/null; then
            echo "✅ $pkg: installed"
        else
            echo "❌ $pkg: missing"
        fi
    done
else
    echo "❌ Virtual environment does not exist"
fi
echo ""

# =============================================================================
# CHECK ENVIRONMENT FILE
# =============================================================================
echo "⚙️ ENVIRONMENT CONFIGURATION:"
echo "============================="
if [[ -f "/var/www/primus/backend/.env" ]]; then
    echo "✅ .env file exists"
    echo "Environment variables (first 10 lines):"
    head -10 /var/www/primus/backend/.env | sed 's/PASSWORD=.*/PASSWORD=***HIDDEN***/' | sed 's/SECRET=.*/SECRET=***HIDDEN***/'
else
    echo "❌ .env file does not exist"
fi
echo ""

# =============================================================================
# TEST DATABASE CONNECTION
# =============================================================================
echo "🗄️ DATABASE CONNECTION:"
echo "======================="
if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
    
    # Test if primus database exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw primus_db; then
        echo "✅ Database 'primus_db' exists"
    else
        echo "❌ Database 'primus_db' does not exist"
    fi
    
    # Test if primus user exists
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='primus'" | grep -q 1; then
        echo "✅ PostgreSQL user 'primus' exists"
    else
        echo "❌ PostgreSQL user 'primus' does not exist"
    fi
else
    echo "❌ PostgreSQL is not running"
fi
echo ""

# =============================================================================
# TEST APPLICATION IMPORT
# =============================================================================
echo "🚀 APPLICATION TEST:"
echo "==================="
if [[ -f "/var/www/primus/backend/main.py" ]]; then
    echo "✅ main.py exists"
    
    cd /var/www/primus/backend 2>/dev/null || true
    if [[ -f "venv/bin/activate" ]]; then
        source venv/bin/activate
        echo "Testing application import..."
        
        if python -c "from main import app; print('✅ Application imports successfully')" 2>/dev/null; then
            echo "✅ Application can be imported"
        else
            echo "❌ Application import failed"
            echo "Error details:"
            python -c "from main import app" 2>&1 | head -10
        fi
    else
        echo "❌ Virtual environment not available for testing"
    fi
else
    echo "❌ main.py does not exist"
fi
echo ""

# =============================================================================
# CHECK SYSTEMD SERVICE
# =============================================================================
echo "🔧 SYSTEMD SERVICE:"
echo "=================="
if [[ -f "/etc/systemd/system/primus-backend.service" ]]; then
    echo "✅ Service file exists"
    
    echo ""
    echo "Service status:"
    systemctl status primus-backend --no-pager -l || true
    
    echo ""
    echo "Recent service logs (last 20 lines):"
    journalctl -u primus-backend --no-pager -l -n 20 || true
else
    echo "❌ Service file does not exist"
fi
echo ""

# =============================================================================
# CHECK NETWORK PORTS
# =============================================================================
echo "🌐 NETWORK PORTS:"
echo "================"
echo "Listening ports:"
ss -tulpn | grep -E ':(80|443|8000|5432|6379)' || echo "No relevant ports found"
echo ""

# =============================================================================
# MANUAL STARTUP TEST
# =============================================================================
echo "🧪 MANUAL STARTUP TEST:"
echo "======================"
if [[ -f "/var/www/primus/backend/main.py" && -f "/var/www/primus/backend/venv/bin/activate" ]]; then
    echo "Attempting manual application startup..."
    cd /var/www/primus/backend
    source venv/bin/activate
    
    # Try to start the app manually for 5 seconds
    timeout 5s python -m uvicorn main:app --host 127.0.0.1 --port 8001 2>&1 | head -10 || echo "Manual startup test completed"
else
    echo "❌ Cannot perform manual startup test - files missing"
fi
echo ""

# =============================================================================
# RECOMMENDATIONS
# =============================================================================
echo "💡 TROUBLESHOOTING RECOMMENDATIONS:"
echo "=================================="
echo ""

if ! systemctl is-active --quiet primus-backend; then
    echo "🔧 Service is not running. Try:"
    echo "   sudo systemctl start primus-backend"
    echo "   sudo journalctl -u primus-backend -f"
    echo ""
fi

if [[ ! -d "/var/www/primus/backend/venv" ]]; then
    echo "🐍 Virtual environment missing. Try:"
    echo "   cd /var/www/primus/backend"
    echo "   python3 -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -r requirements.txt"
    echo ""
fi

if [[ ! -f "/var/www/primus/backend/.env" ]]; then
    echo "⚙️ Environment file missing. Try:"
    echo "   Re-run the deployment script"
    echo ""
fi

echo "🔄 To restart everything:"
echo "   sudo systemctl stop primus-backend"
echo "   sudo systemctl start primus-backend"
echo "   sudo systemctl status primus-backend"
echo ""

echo "🚀 To re-run deployment:"
echo "   curl -sSL https://raw.githubusercontent.com/LORD-VAISHWIK/primus-backend/main/install.sh | sudo bash -s yourdomain.com admin@yourdomain.com"
echo ""

echo "🔍 DEBUG COMPLETE"
