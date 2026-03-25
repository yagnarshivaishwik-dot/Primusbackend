# Gmail App Password Rotation Guide

**Status:** MANUAL  
**Priority:** CRITICAL  
**Estimated Time:** 15-20 minutes

## Overview

This guide walks through rotating the Gmail App Password that was exposed in the repository. The exposed password must be revoked and replaced with a new one.

## Prerequisites

- Access to the Gmail account: `support@primusadmin.in`
- Access to Google Account settings
- Access to production environment variables/secrets management

## Steps

### 1. Revoke the Exposed App Password

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Sign in with `support@primusadmin.in`
3. Under "Signing in to Google", click **"2-Step Verification"**
4. Scroll down to **"App passwords"**
5. Find the app password labeled for "Primus Backend" or similar
6. Click the **trash icon** to delete it
7. Confirm deletion

**Note:** This will immediately invalidate the old password. The application will stop sending emails until the new password is configured.

### 2. Generate New App Password

1. Still in "App passwords" section
2. Click **"Select app"** → Choose **"Mail"**
3. Click **"Select device"** → Choose **"Other (Custom name)"**
4. Enter name: `Primus Backend Production`
5. Click **"Generate"**
6. **Copy the 16-character password immediately** (it won't be shown again)
   - Format: `xxxx xxxx xxxx xxxx` (4 groups of 4 characters)

### 3. Update Environment Variables

#### Option A: Docker Compose / Local Environment

Update `.env` file:
```bash
MAIL_PASSWORD=<new-16-character-password-without-spaces>
```

Or with spaces:
```bash
MAIL_PASSWORD="xxxx xxxx xxxx xxxx"
```

#### Option B: Production Server (Environment Variables)

```bash
# SSH into production server
export MAIL_PASSWORD="<new-16-character-password-without-spaces>"

# Or update in your secrets management system:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Kubernetes Secrets
# - Docker Secrets
```

#### Option C: Kubernetes

```bash
kubectl create secret generic primus-mail-secret \
  --from-literal=mail-password="<new-password>" \
  --dry-run=client -o yaml | kubectl apply -f -
```

#### Option D: Docker Secrets

```bash
echo "<new-password>" | docker secret create mail_password -
```

### 4. Restart Application

```bash
# Docker Compose
docker-compose restart backend

# Systemd
sudo systemctl restart primus-backend

# Kubernetes
kubectl rollout restart deployment primus-backend

# Docker Swarm
docker service update --force primus_backend
```

### 5. Verify Email Functionality

1. Trigger an OTP email:
   ```bash
   curl -X POST https://your-domain.com/api/send-otp/ \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com"}'
   ```

2. Check application logs for email sending errors:
   ```bash
   docker-compose logs backend | grep -i mail
   ```

3. Verify email is received in test inbox

### 6. Update Documentation

- Update any internal documentation that references the old password
- Ensure team members know the password has been rotated
- Document the new password location in your secrets management system

## Rollback Plan

If email functionality breaks:

1. **Immediate:** Generate a new app password and update environment variables
2. **If that fails:** Check Gmail account security settings for any blocks
3. **Last resort:** Temporarily disable email verification (not recommended for production)

## Security Notes

- **Never commit** the new password to version control
- Store passwords in a secure secrets management system
- Rotate passwords regularly (every 90 days recommended)
- Use different app passwords for different environments (dev/staging/prod)
- Monitor Gmail account for suspicious activity

## Verification Checklist

- [ ] Old app password revoked in Google Account
- [ ] New app password generated
- [ ] Environment variable updated in all environments
- [ ] Application restarted
- [ ] Email sending verified
- [ ] Logs checked for errors
- [ ] Team notified of rotation

## Support

If you encounter issues:
1. Check Gmail account security settings
2. Verify 2-Step Verification is enabled
3. Check application logs for specific error messages
4. Ensure firewall/network allows SMTP connections (port 587)

---

**Last Updated:** 2025-01-27  
**Next Review:** 2025-04-27 (90 days)

