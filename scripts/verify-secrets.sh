#!/bin/bash
# Secret Rotation Verification Script
# This script verifies that all required secrets are set and not using default values

set -e

echo "=========================================="
echo "Secret Rotation Verification"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track status
ERRORS=0
WARNINGS=0

# Function to check if variable is set
check_var() {
    local var_name=$1
    local var_value=${!var_name}
    local is_secret=$2
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name is NOT SET${NC}"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    
    # Check for default/weak values
    case "$var_value" in
        "changeme"|"your-*"|"dev-*"|"test-*"|"supersecret*"|"default-*")
            echo -e "${YELLOW}⚠️  $var_name is set but may be using a default/weak value${NC}"
            WARNINGS=$((WARNINGS + 1))
            ;;
        *)
            if [ "$is_secret" = "true" ]; then
                # Show first 4 chars and last 4 chars for secrets
                local len=${#var_value}
                if [ $len -gt 8 ]; then
                    local preview="${var_value:0:4}...${var_value: -4}"
                    echo -e "${GREEN}✅ $var_name is set (${preview})${NC}"
                else
                    echo -e "${YELLOW}⚠️  $var_name is set but seems too short${NC}"
                    WARNINGS=$((WARNINGS + 1))
                fi
            else
                echo -e "${GREEN}✅ $var_name is set${NC}"
            fi
            ;;
    esac
    return 0
}

# Function to check if value contains exposed secret
check_exposed() {
    local var_name=$1
    local var_value=${!var_name}
    
    # Known exposed values that must be changed
    local exposed_values=(
        "wfcq egau rthj wlgj"
        "760371470519-ma43dvpeogg1e3nf4ud5l8q1hnqlr155"
        "496813374696-q63fi7dr27q34hvgk6d8tolsv8rtitdg"
    )
    
    for exposed in "${exposed_values[@]}"; do
        if [ "$var_value" = "$exposed" ]; then
            echo -e "${RED}❌ $var_name contains EXPOSED SECRET - MUST BE ROTATED${NC}"
            ERRORS=$((ERRORS + 1))
            return 1
        fi
    done
    return 0
}

echo "Checking required environment variables..."
echo ""

# Required secrets (will fail-fast in production)
check_var "SECRET_KEY" true
check_exposed "SECRET_KEY"

check_var "JWT_SECRET" true
check_exposed "JWT_SECRET"

check_var "DATABASE_URL" false

# Check POSTGRES_PASSWORD if using PostgreSQL
if [[ "$DATABASE_URL" == postgresql://* ]]; then
    check_var "POSTGRES_PASSWORD" true
    check_exposed "POSTGRES_PASSWORD"
fi

echo ""
echo "Checking OAuth credentials..."
check_var "GOOGLE_CLIENT_ID" false
check_exposed "GOOGLE_CLIENT_ID"

check_var "GOOGLE_CLIENT_SECRET" true
check_exposed "GOOGLE_CLIENT_SECRET"

echo ""
echo "Checking email configuration..."
check_var "MAIL_PASSWORD" true
check_exposed "MAIL_PASSWORD"

echo ""
echo "Checking security configuration..."
check_var "ALLOWED_REDIRECTS" false
check_var "MAX_FAILED_LOGIN_ATTEMPTS" false
check_var "LOCKOUT_DURATION_MINUTES" false
check_var "RATE_LIMIT_PER_MINUTE" false
check_var "ENABLE_CSRF_PROTECTION" false

echo ""
echo "Checking environment..."
ENVIRONMENT=${ENVIRONMENT:-development}
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${GREEN}✅ ENVIRONMENT is set to production${NC}"
    
    # In production, ALLOW_ALL_CORS must be false
    if [ "${ALLOW_ALL_CORS:-false}" = "true" ]; then
        echo -e "${RED}❌ ALLOW_ALL_CORS is true in production - SECURITY RISK${NC}"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "${GREEN}✅ ALLOW_ALL_CORS is false (correct for production)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  ENVIRONMENT is not set to production (current: $ENVIRONMENT)${NC}"
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run database migrations: alembic upgrade head"
    echo "2. Restart application"
    echo "3. Verify functionality"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Checks passed with $WARNINGS warning(s)${NC}"
    echo ""
    echo "Review warnings above and ensure all values are properly configured."
    exit 0
else
    echo -e "${RED}❌ Verification failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please fix the errors above before proceeding with deployment."
    exit 1
fi

