# Manual Rotation Guide: Google OAuth Credentials

**Issue:** CRIT-001 - Google OAuth client secret exposed in repository

**Severity:** CRITICAL

**Status:** MANUAL - Requires console access

---

## Prerequisites

- Access to Google Cloud Console (https://console.cloud.google.com/)
- Project Owner or Editor role on the Google Cloud project
- Access to update environment variables in production deployment

---

## Step-by-Step Rotation Instructions

### Step 1: Revoke Existing OAuth Credentials

1. Navigate to Google Cloud Console: https://console.cloud.google.com/
2. Select project: **primus-472420**
3. Go to **APIs & Services** → **Credentials**
4. Find the OAuth 2.0 Client ID: `760371470519-ma43dvpeogg1e3nf4ud5l8q1hnqlr155.apps.googleusercontent.com`
5. Click on the credential to open details
6. Click **DELETE** button
7. Confirm deletion

**⚠️ WARNING:** This will immediately invalidate the exposed credential. Ensure you have the new credential ready before proceeding to production.

---

### Step 2: Create New OAuth Credentials

1. In Google Cloud Console, go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure OAuth consent screen first:
   - User Type: **External** (or Internal if using Google Workspace)
   - App name: **Primus Gaming Platform**
   - User support email: Your email
   - Developer contact: Your email
   - Save and continue through scopes and test users
4. For OAuth client:
   - Application type: **Web application**
   - Name: **Primus Backend API**
   - Authorized JavaScript origins:
     - `https://primustech.in`
     - `https://www.primustech.in`
   - Authorized redirect URIs:
     - `https://primustech.in/api/social/callback/google`
     - `https://www.primustech.in/api/social/callback/google`
5. Click **CREATE**
6. **Copy the Client ID and Client Secret immediately** - you won't be able to see the secret again

---

### Step 3: Update Environment Variables

Update the following environment variables in your production environment:

```bash
# In production .env file or environment configuration
GOOGLE_CLIENT_ID=<new-client-id>
GOOGLE_CLIENT_SECRET=<new-client-secret>
```

**For Docker deployments:**
```yaml
# In docker-compose.yml or Kubernetes secrets
environment:
  - GOOGLE_CLIENT_ID=<new-client-id>
  - GOOGLE_CLIENT_SECRET=<new-client-secret>
```

**For systemd services:**
```ini
# In /etc/systemd/system/primus-backend.service
Environment="GOOGLE_CLIENT_ID=<new-client-id>"
Environment="GOOGLE_CLIENT_SECRET=<new-client-secret>"
```

---

### Step 4: Restart Application

Restart the backend service to load new credentials:

```bash
# Docker Compose
docker-compose restart backend

# systemd
sudo systemctl restart primus-backend

# Kubernetes
kubectl rollout restart deployment/backend
```

---

### Step 5: Verify Rotation

1. Test Google OAuth login flow
2. Check application logs for any OAuth errors
3. Verify users can authenticate via Google

---

### Step 6: Clean Up Git History (Optional but Recommended)

If the secret was committed to git history:

```bash
# Use git-filter-repo or BFG Repo-Cleaner to remove secret from history
# This requires coordination with team and force push

# Example with git-filter-repo:
git filter-repo --path backend/client_secret_*.json --invert-paths
git filter-repo --replace-text <(echo "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==>REDACTED")

# Force push (coordinate with team first!)
git push origin --force --all
```

**⚠️ WARNING:** Force pushing rewrites git history. Coordinate with your team before doing this.

---

## Rollback Plan

If the new credentials don't work:

1. **DO NOT** restore the old exposed credentials
2. Create another new credential set
3. Update environment variables again
4. Restart application

---

## Verification Checklist

- [ ] Old credential deleted from Google Cloud Console
- [ ] New credential created
- [ ] Environment variables updated in all environments (dev, staging, production)
- [ ] Application restarted
- [ ] Google OAuth login tested and working
- [ ] No errors in application logs
- [ ] Git history cleaned (if applicable)

---

## Estimated Time

- **Revocation:** 2 minutes
- **Creation:** 5 minutes
- **Environment Update:** 5-10 minutes (depends on deployment method)
- **Testing:** 5 minutes
- **Total:** ~20 minutes

---

## Required Permissions

- Google Cloud Project Owner or Editor
- Access to production environment configuration
- Application restart permissions

---

## Notes

- The exposed credential (`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`) must be considered compromised
- Never commit OAuth secrets to version control
- Use secret management systems (AWS Secrets Manager, HashiCorp Vault, etc.) for production
- Rotate credentials regularly (every 90 days recommended)

