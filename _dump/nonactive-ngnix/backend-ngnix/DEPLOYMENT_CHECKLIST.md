# Lance Backend Deployment Checklist

## Pre-Deployment
- [ ] Domain DNS configured (api.primustech.in → server IP)
- [ ] Ubuntu 22.04 server ready (VMware or VPS)
- [ ] SSH access to server configured
- [ ] Repository accessible from server

## Environment Setup
- [ ] Copy `env.example` to `.env`
- [ ] Generate secure JWT_SECRET: `openssl rand -hex 32`
- [ ] Generate secure SECRET_KEY: `openssl rand -hex 32`  
- [ ] Generate secure APP_SECRET: `openssl rand -hex 32`
- [ ] Configure DATABASE_URL (PostgreSQL for production)
- [ ] Configure SMTP settings for emails
- [ ] Set APP_BASE_URL to https://api.primustech.in
- [ ] Configure OAuth credentials (if using)
- [ ] Configure payment gateway keys (if using)

## Server Configuration
- [ ] Install system dependencies
  ```bash
  sudo apt update && sudo apt upgrade -y
  sudo apt install -y nginx git python3 python3-venv python3-pip postgresql redis-server
  ```
- [ ] Configure firewall
  ```bash
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- [ ] Create app user: `sudo useradd -m -s /bin/bash primus`
- [ ] Create app directory: `sudo mkdir -p /srv/primus-backend`
- [ ] Set permissions: `sudo chown -R primus:primus /srv/primus-backend`

## Database Setup (PostgreSQL)
- [ ] Create database user
- [ ] Create database
- [ ] Update DATABASE_URL in .env
- [ ] Test database connection

## Application Deployment
- [ ] Clone repository to `/srv/primus-backend`
- [ ] Create Python virtual environment
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Test application: `python main.py`
- [ ] Verify health endpoint: `curl http://localhost:8000/health`

## Service Configuration
- [ ] Create systemd service file: `/etc/systemd/system/primus-api.service`
- [ ] Enable service: `sudo systemctl enable primus-api`
- [ ] Start service: `sudo systemctl start primus-api`
- [ ] Verify service status: `sudo systemctl status primus-api`

## Nginx Configuration
- [ ] Create nginx config: `/etc/nginx/sites-available/api.primustech.in`
- [ ] Enable site: `sudo ln -s ../sites-available/api.primustech.in ../sites-enabled/`
- [ ] Test nginx config: `sudo nginx -t`
- [ ] Reload nginx: `sudo systemctl reload nginx`

## SSL Certificate
- [ ] Install certbot: `sudo apt install certbot python3-certbot-nginx`
- [ ] Get certificate: `sudo certbot --nginx -d api.primustech.in`
- [ ] Verify auto-renewal: `sudo certbot renew --dry-run`

## Post-Deployment Testing
- [ ] Test HTTPS endpoint: `curl https://api.primustech.in/health`
- [ ] Check CORS headers (from browser console)
- [ ] Test WebSocket connections (if applicable)
- [ ] Monitor logs: `sudo journalctl -u primus-api -f`
- [ ] Check Nginx access logs
- [ ] Verify all API endpoints working

## Security Final Check
- [ ] All secrets changed from defaults
- [ ] Debug mode disabled
- [ ] CORS restricted to production domain
- [ ] Firewall properly configured
- [ ] Database using secure password
- [ ] SSL certificate active and valid

## Documentation
- [ ] Document any custom configurations
- [ ] Save all credentials securely
- [ ] Create update/maintenance procedures
- [ ] Document monitoring procedures
