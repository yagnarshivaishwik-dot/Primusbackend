# Database Password Rotation Guide

**Status:** MANUAL  
**Priority:** CRITICAL  
**Estimated Time:** 20-30 minutes

## Overview

This guide walks through rotating the PostgreSQL database password that was exposed or uses a weak default. The password must be changed in PostgreSQL and updated in all application configurations.

## Prerequisites

- Access to PostgreSQL server (as superuser or postgres user)
- Access to production environment variables/secrets management
- Database backup (recommended before password change)
- Application downtime window (or ability to restart services)

## Steps

### 1. Generate Strong Password

Generate a strong password (minimum 32 characters recommended):

```bash
# Using openssl
openssl rand -base64 32

# Using Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Using pwgen (if installed)
pwgen -s 32 1
```

**Password Requirements:**
- Minimum 32 characters
- Mix of uppercase, lowercase, numbers, special characters
- No dictionary words
- Store securely (password manager)

### 2. Backup Database (Recommended)

```bash
# Create backup before password change
pg_dump -U primus -h localhost primus_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Or using Docker
docker exec primus_db pg_dump -U primus primus_db > backup.sql
```

### 3. Update PostgreSQL Password

#### Option A: Using psql

```bash
# Connect as postgres superuser
psql -U postgres -h localhost

# Change password
ALTER USER primus WITH PASSWORD 'new-strong-password-here';

# Verify
\du primus

# Exit
\q
```

#### Option B: Using Docker

```bash
# Connect to PostgreSQL container
docker exec -it primus_db psql -U postgres

# Change password
ALTER USER primus WITH PASSWORD 'new-strong-password-here';

# Exit
\q
```

#### Option C: Using SQL Script

```bash
# Create script
echo "ALTER USER primus WITH PASSWORD 'new-strong-password-here';" > change_password.sql

# Execute
psql -U postgres -h localhost -f change_password.sql

# Clean up
rm change_password.sql
```

### 4. Update Application Configuration

#### Option A: Docker Compose

Update `docker-compose.yml`:
```yaml
services:
  db:
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}  # Set in .env
  backend:
    environment:
      - DATABASE_URL=postgresql://primus:${POSTGRES_PASSWORD}@db:5432/primus_db
```

Update `.env` file:
```bash
POSTGRES_PASSWORD=new-strong-password-here
```

#### Option B: Environment Variables

```bash
export POSTGRES_PASSWORD="new-strong-password-here"
export DATABASE_URL="postgresql://primus:${POSTGRES_PASSWORD}@localhost:5432/primus_db"
```

#### Option C: Kubernetes Secrets

```bash
kubectl create secret generic primus-db-secret \
  --from-literal=postgres-password="new-strong-password-here" \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Option D: AWS Secrets Manager / HashiCorp Vault

Update the secret in your secrets management system with the new password.

### 5. Update Connection Strings

Update all places where `DATABASE_URL` is set:

```bash
# Format: postgresql://username:password@host:port/database
DATABASE_URL=postgresql://primus:new-strong-password-here@localhost:5432/primus_db
```

**Important:** Ensure password is URL-encoded if it contains special characters:
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `%` → `%25`
- `#` → `%23`
- `?` → `%3F`

### 6. Restart Services

```bash
# Docker Compose
docker-compose down
docker-compose up -d

# Or restart backend only (if DB container unchanged)
docker-compose restart backend

# Systemd
sudo systemctl restart primus-backend

# Kubernetes
kubectl rollout restart deployment primus-backend
```

### 7. Verify Connection

```bash
# Test connection from application
curl http://localhost:8000/health

# Test direct database connection
psql -U primus -h localhost -d primus_db -c "SELECT 1;"

# Check application logs
docker-compose logs backend | grep -i database
```

### 8. Update All Environments

Ensure password is updated in:
- [ ] Development environment
- [ ] Staging environment
- [ ] Production environment
- [ ] CI/CD pipeline secrets
- [ ] Backup scripts
- [ ] Monitoring tools
- [ ] Database administration tools

## Rollback Plan

If connection fails after password change:

1. **Immediate:** Revert to old password temporarily:
   ```sql
   ALTER USER primus WITH PASSWORD 'old-password';
   ```

2. **Check:** Verify `DATABASE_URL` format and encoding

3. **Verify:** Check PostgreSQL logs for connection errors:
   ```bash
   tail -f /var/log/postgresql/postgresql-*.log
   ```

4. **Restore:** If needed, restore from backup:
   ```bash
   psql -U primus -h localhost primus_db < backup.sql
   ```

## Security Best Practices

- **Never commit** passwords to version control
- Use strong, unique passwords (32+ characters)
- Rotate passwords regularly (every 90 days)
- Use different passwords for each environment
- Store passwords in secure secrets management
- Limit database user permissions (principle of least privilege)
- Enable SSL/TLS for database connections in production
- Monitor database access logs

## Verification Checklist

- [ ] Strong password generated (32+ characters)
- [ ] Database backup created
- [ ] PostgreSQL password updated
- [ ] Environment variables updated in all environments
- [ ] Connection strings updated
- [ ] Services restarted
- [ ] Database connection verified
- [ ] Application functionality tested
- [ ] Logs checked for errors
- [ ] Team notified of password change

## Additional Security Hardening

Consider implementing:

1. **SSL/TLS Encryption:**
   ```yaml
   DATABASE_URL=postgresql://primus:password@host:5432/primus_db?sslmode=require
   ```

2. **Connection Pooling:**
   - Configure SQLAlchemy pool settings
   - Set appropriate pool size and timeout

3. **Database User Permissions:**
   ```sql
   -- Review and limit permissions
   \du primus
   -- Revoke unnecessary privileges
   REVOKE ALL ON DATABASE primus_db FROM primus;
   GRANT CONNECT ON DATABASE primus_db TO primus;
   ```

4. **Network Security:**
   - Restrict database access to application servers only
   - Use firewall rules
   - Consider VPN or private network

## Support

If you encounter issues:

1. Check PostgreSQL logs: `/var/log/postgresql/postgresql-*.log`
2. Check application logs for connection errors
3. Verify `pg_hba.conf` allows connections
4. Test connection manually with `psql`
5. Verify password encoding in connection string

---

**Last Updated:** 2025-01-27  
**Next Review:** 2025-04-27 (90 days)
