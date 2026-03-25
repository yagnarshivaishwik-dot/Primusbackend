# Manual Secret Rotation Checklist

**Status:** ⚠️ **MANUAL OPERATIONS REQUIRED**  
**Priority:** CRITICAL - Must be completed before production deployment  
**Estimated Time:** 45-60 minutes total

---

## Pre-Rotation Checklist

Before starting, ensure you have:

- [ ] Access to Google Cloud Console (project owner/editor)
- [ ] Access to Gmail account: `support@primusadmin.in`
- [ ] Access to PostgreSQL database (superuser or postgres user)
- [ ] Access to production environment variables/secrets management
- [ ] Database backup created (recommended)
- [ ] Maintenance window scheduled (if needed)
- [ ] Team notified of rotation process

---

## Rotation Steps

### Step 1: Google OAuth Credentials Rotation

**Time:** 15-20 minutes  
**Guide:** `docs/rotate-google-oauth.md`

#### Actions Required:

1. [ ] **Revoke Old Credential**
   - [ ] Log into Google Cloud Console
   - [ ] Navigate to APIs & Services → Credentials
   - [ ] Find OAuth Client ID: `760371470519-ma43dvpeogg1e3nf4ud5l8q1hnqlr155.apps.googleusercontent.com`
   - [ ] Delete the credential
   - [ ] Confirm deletion

2. [ ] **Create New Credential**
   - [ ] Create new OAuth 2.0 Client ID
   - [ ] Configure authorized redirect URIs:
     - `https://primustech.in/api/social/auth/google`
     - `https://www.primustech.in/api/social/auth/google`
     - `http://localhost:8000/api/social/auth/google` (dev only)
   - [ ] Copy new Client ID: `________________________`
   - [ ] Copy new Client Secret: `________________________`

3. [ ] **Update Environment Variables**
   ```bash
   GOOGLE_CLIENT_ID=<new-client-id>
   GOOGLE_CLIENT_SECRET=<new-client-secret>
   ```
   - [ ] Updated in production environment
   - [ ] Updated in staging environment (if applicable)
   - [ ] Updated in development `.env` file
   - [ ] Verified no old values remain in codebase

4. [ ] **Verify OAuth Functionality**
   - [ ] Test Google login in staging/dev
   - [ ] Verify redirect URIs work correctly
   - [ ] Check application logs for errors

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 2: Gmail App Password Rotation

**Time:** 15-20 minutes  
**Guide:** `docs/rotate-gmail-app-password.md`

#### Actions Required:

1. [ ] **Revoke Old App Password**
   - [ ] Go to Google Account Security
   - [ ] Navigate to 2-Step Verification → App passwords
   - [ ] Find app password for "Primus Backend"
   - [ ] Delete the old password
   - [ ] Confirm deletion

2. [ ] **Generate New App Password**
   - [ ] Create new app password
   - [ ] Name: `Primus Backend Production`
   - [ ] Copy 16-character password: `________________________`
   - [ ] Store securely (password manager)

3. [ ] **Update Environment Variables**
   ```bash
   MAIL_PASSWORD=<new-16-character-password>
   ```
   - [ ] Updated in production environment
   - [ ] Updated in staging environment (if applicable)
   - [ ] Updated in development `.env` file
   - [ ] Verified no old values remain in codebase

4. [ ] **Restart Application**
   - [ ] Restarted backend service
   - [ ] Verified service started successfully

5. [ ] **Verify Email Functionality**
   - [ ] Send test OTP email
   - [ ] Verify email received
   - [ ] Check application logs for errors

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 3: Database Password Rotation

**Time:** 20-30 minutes  
**Guide:** `docs/rotate-database-password.md`

#### Actions Required:

1. [ ] **Create Database Backup**
   ```bash
   pg_dump -U primus -h localhost primus_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```
   - [ ] Backup created
   - [ ] Backup location: `________________________`
   - [ ] Backup verified (can restore if needed)

2. [ ] **Generate Strong Password**
   ```bash
   # Using openssl
   openssl rand -base64 32
   ```
   - [ ] Password generated: `________________________`
   - [ ] Password stored securely
   - [ ] Password meets requirements (32+ chars, mixed case, numbers, special chars)

3. [ ] **Update PostgreSQL Password**
   ```sql
   ALTER USER primus WITH PASSWORD '<new-password>';
   ```
   - [ ] Connected to PostgreSQL
   - [ ] Password updated successfully
   - [ ] Verified with `\du primus`

4. [ ] **Update Environment Variables**
   ```bash
   POSTGRES_PASSWORD=<new-password>
   DATABASE_URL=postgresql://primus:<new-password>@localhost:5432/primus_db
   ```
   - [ ] Updated in production environment
   - [ ] Updated in staging environment (if applicable)
   - [ ] Updated in development `.env` file
   - [ ] Updated in `docker-compose.yml` (if used)
   - [ ] Verified password is URL-encoded if needed

5. [ ] **Restart Services**
   - [ ] Restarted database service (if needed)
   - [ ] Restarted backend service
   - [ ] Verified services started successfully

6. [ ] **Verify Database Connection**
   - [ ] Test connection: `psql -U primus -h localhost -d primus_db -c "SELECT 1;"`
   - [ ] Application connects successfully
   - [ ] Health check endpoint works: `/health`
   - [ ] Check application logs for connection errors

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 4: Generate New Application Secrets

**Time:** 5 minutes

#### Actions Required:

1. [ ] **Generate SECRET_KEY**
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   - [ ] Generated: `________________________`
   - [ ] Updated in production: `SECRET_KEY=...`
   - [ ] Updated in staging: `SECRET_KEY=...`
   - [ ] Updated in development `.env`

2. [ ] **Generate JWT_SECRET**
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   - [ ] Generated: `________________________`
   - [ ] Updated in production: `JWT_SECRET=...`
   - [ ] Updated in staging: `JWT_SECRET=...`
   - [ ] Updated in development `.env`

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 5: Update All Environment Variables

**Time:** 10 minutes

#### Complete Environment Variable Checklist:

```bash
# Required in Production (will fail-fast if missing)
SECRET_KEY=<generated-above>
JWT_SECRET=<generated-above>
POSTGRES_PASSWORD=<generated-above>
DATABASE_URL=postgresql://primus:$POSTGRES_PASSWORD@localhost:5432/primus_db

# OAuth (after rotation)
GOOGLE_CLIENT_ID=<new-client-id>
GOOGLE_CLIENT_SECRET=<new-client-secret>

# Email (after rotation)
MAIL_PASSWORD=<new-app-password>

# Security Configuration
ALLOWED_REDIRECTS=http://127.0.0.1,http://localhost,https://primustech.in
MAX_FAILED_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
RATE_LIMIT_PER_MINUTE=60
MAX_REQUEST_SIZE_BYTES=10485760
ENABLE_CSRF_PROTECTION=true

# Environment
ENVIRONMENT=production
ALLOW_ALL_CORS=false
```

**Update Locations:**

- [ ] Production environment variables (AWS Secrets Manager / Vault / etc.)
- [ ] Staging environment variables
- [ ] Development `.env` file
- [ ] Docker Compose `.env` file (if used)
- [ ] Kubernetes secrets (if used)
- [ ] CI/CD pipeline secrets
- [ ] Documentation updated (if needed)

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 6: Run Database Migrations

**Time:** 5 minutes

#### Actions Required:

1. [ ] **Navigate to Backend Directory**
   ```bash
   cd backend
   ```

2. [ ] **Run Alembic Migrations**
   ```bash
   alembic upgrade head
   ```
   - [ ] Migrations applied successfully
   - [ ] No errors in migration output
   - [ ] Database schema updated

3. [ ] **Verify Migration Status**
   ```bash
   alembic current
   ```
   - [ ] Current revision verified
   - [ ] All migrations applied

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 7: Restart Application

**Time:** 5 minutes

#### Actions Required:

1. [ ] **Restart Backend Service**
   ```bash
   # Docker Compose
   docker-compose restart backend
   
   # Systemd
   sudo systemctl restart primus-backend
   
   # Kubernetes
   kubectl rollout restart deployment primus-backend
   ```

2. [ ] **Verify Application Starts**
   - [ ] Service started successfully
   - [ ] No errors in startup logs
   - [ ] Health check passes: `curl http://localhost:8000/health`

3. [ ] **Check Logs for Errors**
   ```bash
   docker-compose logs backend | tail -50
   ```
   - [ ] No connection errors
   - [ ] No authentication errors
   - [ ] No configuration errors

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

### Step 8: Verification & Testing

**Time:** 15 minutes

#### Functional Tests:

1. [ ] **Authentication**
   - [ ] User can log in with email/password
   - [ ] Account lockout works after 5 failed attempts
   - [ ] Password complexity enforced on registration

2. [ ] **OAuth Login**
   - [ ] Google OAuth login works
   - [ ] Redirect URIs work correctly
   - [ ] User created/retrieved successfully

3. [ ] **Email Functionality**
   - [ ] OTP email sent successfully
   - [ ] Email received in inbox
   - [ ] Email content correct

4. [ ] **Database Operations**
   - [ ] User queries work
   - [ ] Wallet operations work
   - [ ] Session management works
   - [ ] No connection errors

5. [ ] **Security Features**
   - [ ] CSRF protection active
   - [ ] Rate limiting works
   - [ ] Security headers present
   - [ ] File upload validation works

**Status:** ☐ Not Started | ☐ In Progress | ☐ Complete | ☐ Verified

---

## Post-Rotation Checklist

- [ ] All old credentials revoked/deleted
- [ ] All new credentials generated and stored securely
- [ ] All environment variables updated
- [ ] Database migrations applied
- [ ] Application restarted successfully
- [ ] All functionality verified
- [ ] Team notified of completion
- [ ] Documentation updated
- [ ] Backup of old credentials deleted (after verification period)

---

## Rollback Plan

If issues occur:

1. **Immediate:** Revert to previous environment variables
2. **Database:** Restore from backup if needed
3. **OAuth:** Re-enable old credential temporarily (if not deleted)
4. **Application:** Rollback to previous deployment

**Rollback Contacts:**
- DevOps: ________________
- Database Admin: ________________
- Security Team: ________________

---

## Verification Script

Run this script to verify all secrets are set:

```bash
#!/bin/bash
# verify-secrets.sh

echo "Checking required environment variables..."

required_vars=(
  "SECRET_KEY"
  "JWT_SECRET"
  "POSTGRES_PASSWORD"
  "DATABASE_URL"
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "MAIL_PASSWORD"
)

missing_vars=()

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
    echo "❌ $var is not set"
  else
    echo "✅ $var is set"
  fi
done

if [ ${#missing_vars[@]} -eq 0 ]; then
  echo ""
  echo "✅ All required environment variables are set!"
else
  echo ""
  echo "❌ Missing variables: ${missing_vars[*]}"
  exit 1
fi
```

---

## Completion Sign-Off

**Completed By:** ________________  
**Date:** ________________  
**Time:** ________________  
**Verified By:** ________________  
**Notes:** ________________

---

**Last Updated:** 2025-01-27

