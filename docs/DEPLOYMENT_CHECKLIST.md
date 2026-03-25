# Deployment Checklist

**Last Updated:** 2024-12-01  
**Version:** 1.0.0

---

## Pre-Deployment Checklist

### 1. Security & Secrets ✅

- [ ] **Rotate all exposed secrets** (see `docs/rotate-*.md` guides)
  - [ ] Google OAuth credentials rotated
  - [ ] Database password changed
  - [ ] Gmail app password rotated (if exposed)
  - [ ] All JWT secrets regenerated

- [ ] **Set all required environment variables** in production:
  ```bash
  # Core secrets (REQUIRED)
  SECRET_KEY=<strong-secret-32-chars>
  JWT_SECRET=<strong-secret-32-chars>
  APP_SECRET=<strong-secret-32-chars>
  POSTGRES_PASSWORD=<strong-password-32-chars>
  
  # Database
  DATABASE_URL=postgresql://user:password@host:5432/dbname
  ENVIRONMENT=production
  
  # OAuth (after rotation)
  GOOGLE_CLIENT_ID=<new-client-id>
  GOOGLE_CLIENT_SECRET=<new-client-secret>
  
  # Email
  MAIL_PASSWORD=<gmail-app-password>
  
  # Optional: JWT configuration
  JWT_ALGORITHM=HS256
  ACCESS_TOKEN_EXPIRE_MINUTES=120
  ```

- [ ] **Verify `.env` file is NOT committed** to repository
- [ ] **Verify `.gitignore`** includes `.env`, `*.pem`, `*.key`, etc.

### 2. Database Migration ✅

- [ ] **Run Alembic migrations:**
  ```bash
  cd backend
  alembic upgrade head
  ```

- [ ] **Verify database schema** matches expected structure
- [ ] **Backup production database** before migration
- [ ] **Test migrations** in staging environment first

### 3. Dependencies & Build ✅

- [ ] **Install production dependencies:**
  ```bash
  cd backend
  pip install -r requirements.txt
  ```

- [ ] **Verify Docker image builds** (if using Docker):
  ```bash
  docker build -t primus-backend:latest .
  ```

- [ ] **Run security scans:**
  ```bash
  pip install safety bandit
  safety check -r requirements.txt
  bandit -r app/ -ll
  ```

### 4. Testing ✅

- [ ] **Run test suite:**
  ```bash
  cd backend
  pip install -r requirements-dev.txt
  pytest tests/ -v
  ```

- [ ] **Check test coverage:**
  ```bash
  pytest --cov=app tests/ --cov-report=html
  ```

- [ ] **Verify all critical security tests pass:**
  - [ ] Account lockout tests
  - [ ] CSRF protection tests
  - [ ] File upload security tests
  - [ ] CSV import security tests
  - [ ] Wallet authorization tests
  - [ ] Webhook authorization tests

### 5. Configuration Verification ✅

- [ ] **Verify `ALLOW_ALL_CORS=false`** in production
- [ ] **Set `ALLOWED_ORIGINS`** with production frontend URLs
- [ ] **Verify `ENABLE_CSRF_PROTECTION=true`** in production
- [ ] **Set rate limiting** appropriately for production load
- [ ] **Configure Redis** for OTP and caching (if used)  
  - [ ] Set `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_NAMESPACE`, `CACHE_DEFAULT_TTL`, `REDIS_CONNECTION_MAX`  
  - [ ] Use `CACHE_VERSION` to version cache keys for safe rollouts and rollbacks  
  - [ ] Confirm application can start and serve traffic even if Redis is temporarily unavailable

### 6. Infrastructure ✅

- [ ] **Verify Redis is running** (if used for OTP/rate limiting/caching)  
  - [ ] Redis is deployed in a **private subnet** (no public IP)  
  - [ ] `AUTH` is enabled with a strong password  
  - [ ] TLS is enabled on the Redis endpoint (or via a terminating proxy)  
  - [ ] `maxmemory` and eviction policy configured (e.g. `allkeys-lru` or `volatile-lru`)  
  - [ ] Network ACLs / security groups restrict access to backend servers only
- [ ] **Verify PostgreSQL is running** and accessible
- [ ] **Check disk space** for uploads and logs
- [ ] **Configure log rotation** for application logs
- [ ] **Set up monitoring** and alerting

---

## Deployment Steps

### Step 1: Pre-Deployment Backup

```bash
# Backup database
pg_dump -U primus primus_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup application files
tar -czf app_backup_$(date +%Y%m%d_%H%M%S).tar.gz backend/uploads backend/logs
```

### Step 2: Deploy Code

**Option A: Direct Deployment**
```bash
cd backend
git pull origin main
pip install -r requirements.txt
alembic upgrade head
```

**Option B: Docker Deployment**
```bash
docker-compose pull
docker-compose up -d --build
```

### Step 3: Verify Deployment

- [ ] **Health check:**
  ```bash
  curl https://your-domain.com/health
  ```

- [ ] **Verify API endpoints** respond correctly
- [ ] **Check application logs** for errors
- [ ] **Monitor error rates** for first 15 minutes

### Step 4: Post-Deployment Verification

- [ ] **Test authentication** (login/logout)
- [ ] **Test OAuth login** (Google/Discord/Twitter)
- [ ] **Test file upload** functionality
- [ ] **Test payment processing** (if applicable)
- [ ] **Verify audit logging** is working
- [ ] **Check rate limiting** is active
- [ ] **Verify CSRF protection** is enabled

---

## Post-Deployment Monitoring

### First Hour

- [ ] Monitor application logs for errors
- [ ] Check error rates and response times
- [ ] Verify database connections are stable
- [ ] Monitor memory and CPU usage
- [ ] Check for any security alerts

### First 24 Hours

- [ ] Review audit logs for suspicious activity
- [ ] Monitor failed login attempts
- [ ] Check rate limiting effectiveness
- [ ] Verify all critical features working
- [ ] Review performance metrics

---

## Rollback Procedure

See `docs/ROLLBACK_PROCEDURES.md` for detailed rollback steps.

**Quick Rollback:**
```bash
# Stop application
systemctl stop primus-backend  # or docker-compose down

# Restore database backup
psql -U primus primus_db < backup_YYYYMMDD_HHMMSS.sql

# Revert code to previous version
git checkout <previous-commit-hash>

# Restart application
systemctl start primus-backend  # or docker-compose up -d
```

---

## Environment-Specific Notes

### Production

- **Never** set `ALLOW_ALL_CORS=true`
- **Never** use default secrets
- **Always** use HTTPS
- **Always** enable CSRF protection
- **Always** enable rate limiting
- **Always** enable audit logging

### Staging

- Can use `ALLOW_ALL_CORS=true` for testing
- Use strong but different secrets from production
- Test all security features before production deployment

### Development

- Can use SQLite for local development
- Default secrets allowed (with warnings)
- Can disable CSRF for easier testing
- Can disable rate limiting for development

---

## Troubleshooting

### Common Issues

1. **Application won't start:**
   - Check environment variables are set
   - Verify database connection
   - Check logs for specific errors

2. **Database migration fails:**
   - Restore from backup
   - Check Alembic version history
   - Verify database permissions

3. **OAuth not working:**
   - Verify redirect URIs match in OAuth provider console
   - Check OAuth credentials are correct
   - Verify CORS settings allow OAuth redirects

4. **Rate limiting too aggressive:**
   - Adjust `RATE_LIMIT_PER_MINUTE` in environment
   - Check Redis is working correctly
   - Review rate limit logs

---

## Support Contacts

- **Security Issues:** security@yourdomain.com
- **Deployment Issues:** devops@yourdomain.com
- **Application Issues:** support@yourdomain.com

---

**✅ Deployment Complete - Monitor for 24 hours**

