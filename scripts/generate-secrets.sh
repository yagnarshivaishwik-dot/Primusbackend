#!/bin/bash
# Generate Strong Secrets for Application
# This script generates cryptographically secure secrets for use in the application

echo "=========================================="
echo "Secret Generation Tool"
echo "=========================================="
echo ""
echo "This script generates strong secrets for:"
echo "  - SECRET_KEY"
echo "  - JWT_SECRET"
echo "  - POSTGRES_PASSWORD"
echo ""
echo "Generated secrets are suitable for production use."
echo ""

# Check if Python is available
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "Error: Python is required to generate secrets"
    exit 1
fi

echo "Generating secrets..."
echo ""

# Generate SECRET_KEY (32 bytes, base64 encoded)
SECRET_KEY=$($PYTHON_CMD -c "import secrets; print(secrets.token_urlsafe(32))")
echo "SECRET_KEY=$SECRET_KEY"
echo ""

# Generate JWT_SECRET (32 bytes, base64 encoded)
JWT_SECRET=$($PYTHON_CMD -c "import secrets; print(secrets.token_urlsafe(32))")
echo "JWT_SECRET=$JWT_SECRET"
echo ""

# Generate POSTGRES_PASSWORD (32 bytes, base64 encoded)
POSTGRES_PASSWORD=$($PYTHON_CMD -c "import secrets; print(secrets.token_urlsafe(32))")
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo ""

echo "=========================================="
echo "Copy these values to your .env file:"
echo "=========================================="
echo ""
echo "SECRET_KEY=$SECRET_KEY"
echo "JWT_SECRET=$JWT_SECRET"
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo ""
echo "⚠️  IMPORTANT:"
echo "  - Store these secrets securely"
echo "  - Never commit them to version control"
echo "  - Use a password manager or secrets management system"
echo "  - Rotate secrets regularly (every 90 days)"
echo ""

# Optionally save to file (user must confirm)
read -p "Save to .env.example? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cat > .env.secrets.generated << EOF
# Generated secrets - DO NOT COMMIT TO VERSION CONTROL
# Generated on: $(date)
SECRET_KEY=$SECRET_KEY
JWT_SECRET=$JWT_SECRET
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
EOF
    echo "✅ Secrets saved to .env.secrets.generated"
    echo "⚠️  Remember to add .env.secrets.generated to .gitignore"
fi

