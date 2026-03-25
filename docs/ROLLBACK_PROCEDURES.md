# Rollback Procedures

**Last Updated:** 2024-12-01  
**Version:** 1.0.0

---

## Overview

This document outlines procedures for rolling back deployments when issues are detected. Rollbacks should be performed quickly to minimize impact on users.

---

## When to Rollback

**Immediate Rollback Required:**
- Application crashes or won't start
- Database corruption or migration failures
- Critical security vulnerability discovered
- Data loss or corruption detected
- Authentication system completely broken

**Consider Rollback:**
- High error rates (>5% of requests failing)
- Performance degradation (>50% slower response times)
- Critical features not working
- Payment processing failures

**Do NOT Rollback For:**
- Minor UI issues
- Non-critical feature bugs
- Performance issues affecting <1% of users
- Issues that can be fixed with hotfix

---

## Pre-Rollback Checklist

- [ ] **Identify the issue** and confirm rollback is necessary
- [ ] **Notify team** of rollback decision
- [ ] **Document the issue** for post-mortem
- [ ] **Locate previous working version** (commit hash or tag)
- [ ] **Verify backup exists** for database and files
- [ ] **Prepare rollback commands** (test in staging if possible)

---

## Rollback Procedures

### Option 1: Code Rollback (No Database Changes)

**Use when:** Only code changes need to be reverted, database schema unchanged.

**Steps:**

1. **Stop the application:**
   ```bash
   # Systemd
   sudo systemctl stop primus-backend
   
   # Docker Compose
   cd backend
   docker-compose down
   ```

2. **Revert code to previous version:**
   ```bash
   cd backend
   git log --oneline -10  # Find previous working commit
   git checkout <previous-commit-hash>
   # OR
   git checkout <previous-tag>
   ```

3. **Restart application:**
   ```bash
   # Systemd
   sudo systemctl start primus-backend
   
   # Docker Compose
   docker-compose up -d
   ```

4. **Verify rollback:**
   ```bash
   curl https://your-domain.com/health
   # Check logs
   tail -f /var/log/primus-backend/app.log
   ```

**Time Estimate:** 5-10 minutes

---

### Option 2: Full Rollback (Code + Database)

**Use when:** Database migrations were applied and need to be reverted.

**Steps:**

1. **Stop the application:**
   ```bash
   sudo systemctl stop primus-backend
   # OR
   docker-compose down
   ```

2. **Restore database from backup:**
   ```bash
   # List available backups
   ls -lh backups/
   
   # Restore most recent backup before deployment
   psql -U primus primus_db < backups/backup_YYYYMMDD_HHMMSS.sql
   
   # Verify restore
   psql -U primus primus_db -c "SELECT COUNT(*) FROM users;"
   ```

3. **Revert code:**
   ```bash
   cd backend
   git checkout <previous-commit-hash>
   ```

4. **Restart application:**
   ```bash
   sudo systemctl start primus-backend
   # OR
   docker-compose up -d
   ```

5. **Verify rollback:**
   - Check health endpoint
   - Test critical features
   - Verify database integrity

**Time Estimate:** 15-30 minutes

---

### Option 3: Partial Rollback (Feature Flag)

**Use when:** Only specific features need to be disabled, rest of deployment is fine.

**Steps:**

1. **Disable feature via environment variable:**
   ```bash
   # Edit .env or environment config
   DISABLE_FEATURE_X=true
   ```

2. **Restart application:**
   ```bash
   sudo systemctl restart primus-backend
   ```

3. **Monitor for stability**

**Time Estimate:** 2-5 minutes

---

## Database Migration Rollback

### Using Alembic

```bash
cd backend

# List migration history
alembic history

# Rollback one migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade <revision-hash>

# Rollback all migrations (DANGEROUS)
alembic downgrade base
```

**⚠️ Warning:** Always backup database before downgrading migrations.

---

## Docker-Specific Rollback

### Using Docker Tags

```bash
# List available image tags
docker images | grep primus-backend

# Rollback to previous image
docker-compose down
docker-compose up -d --image primus-backend:previous-tag

# OR update docker-compose.yml to use previous tag
# Then: docker-compose up -d
```

### Using Docker Registry

```bash
# Pull previous version
docker pull your-registry/primus-backend:previous-tag

# Update docker-compose.yml
# Then restart
docker-compose up -d
```

---

## Post-Rollback Steps

### 1. Verify System Health

- [ ] **Health check passes**
- [ ] **Critical endpoints responding**
- [ ] **Database queries working**
- [ ] **No error spikes in logs**
- [ ] **Authentication working**

### 2. Monitor for 30 Minutes

- [ ] **Watch error rates**
- [ ] **Monitor response times**
- [ ] **Check for new errors**
- [ ] **Verify user reports**

### 3. Document the Rollback

- [ ] **Record rollback time and duration**
- [ ] **Document reason for rollback**
- [ ] **Note any data loss or issues**
- [ ] **Create post-mortem ticket**

### 4. Plan Fix

- [ ] **Identify root cause** of original issue
- [ ] **Create fix** for the problem
- [ ] **Test fix** in staging
- [ ] **Plan re-deployment** with fix

---

## Rollback Scenarios

### Scenario 1: Failed Database Migration

**Symptoms:** Application starts but database queries fail, migration errors in logs.

**Rollback:**
```bash
# 1. Stop app
docker-compose down

# 2. Restore database
psql -U primus primus_db < backup_before_migration.sql

# 3. Revert code
git checkout <pre-migration-commit>

# 4. Restart
docker-compose up -d
```

---

### Scenario 2: Broken Authentication

**Symptoms:** Users cannot log in, OAuth redirects fail.

**Rollback:**
```bash
# 1. Revert auth-related code
git checkout <previous-commit>

# 2. Restart
sudo systemctl restart primus-backend

# 3. Verify OAuth credentials still valid
```

---

### Scenario 3: Performance Degradation

**Symptoms:** Response times increased significantly, timeouts.

**Rollback:**
```bash
# Quick rollback to previous version
git checkout <previous-tag>
sudo systemctl restart primus-backend
```

---

## Prevention

### Before Deployment

- [ ] **Test in staging** environment first
- [ ] **Run database migrations** in staging
- [ ] **Load test** new changes
- [ ] **Review code changes** carefully
- [ ] **Create database backup** before migration

### During Deployment

- [ ] **Deploy during low-traffic** periods
- [ ] **Monitor closely** for first 30 minutes
- [ ] **Have rollback plan** ready
- [ ] **Keep team on standby**

---

## Emergency Contacts

- **On-Call Engineer:** [phone number]
- **Database Admin:** [phone number]
- **DevOps Lead:** [phone number]

---

## Recovery Time Objectives (RTO)

- **Critical Issues:** < 15 minutes
- **High Priority:** < 30 minutes
- **Medium Priority:** < 1 hour

---

**⚠️ Remember:** Rollback quickly if critical issues detected. Better to rollback and fix properly than to cause extended downtime.

