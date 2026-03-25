# Lance Backend Deployment Guide

This guide provides specific instructions for deploying the Lance backend API to Ubuntu 22.04.

## Prerequisites

- Ubuntu 22.04 VPS (tested on VMware)
- Python 3.10+
- Domain: api.primustech.in pointing to your server IP
- SSL certificate (we'll use Let's Encrypt)

## Backend Structure

The backend is structured as:
- `backend/main.py` - Entry point that imports the FastAPI app
- `backend/app/main.py` - Main FastAPI application with all routes
- `backend/app/` - Application modules, endpoints, models, etc.

## Environment Variables

Copy `env.example` to `.env` and update with your values:

```bash
cp env.example .env
nano .env
```

Critical variables to update:
- `DATABASE_URL` - For production, use PostgreSQL instead of SQLite
- `JWT_SECRET` - Generate a strong secret: `openssl rand -hex 32`
- `SECRET_KEY` - Generate another strong secret
- `APP_SECRET` - Generate another strong secret for OTP
- SMTP settings for email functionality
- OAuth credentials if using social login
- Payment gateway credentials if using payments

## Deployment Steps

### 1. System Dependencies

```bash
# As root or with sudo
apt update && apt upgrade -y
apt install -y python3-pip python3-venv python3-dev build-essential
apt install -y postgresql postgresql-contrib  # If using PostgreSQL
apt install -y redis-server  # If using Redis for OTP
```

### 2. Backend Setup

```bash
# Create app user
sudo useradd -m -s /bin/bash primus
sudo mkdir -p /srv/primus-backend
sudo chown -R primus:primus /srv/primus-backend

# Switch to app user
sudo -iu primus
cd /srv/primus-backend

# Clone repository
git clone https://github.com/your-repo/lance.git .
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Copy and configure environment
cp env.example .env
# Edit .env with your production values
nano .env
```

### 3. Database Setup

For production, use PostgreSQL:

```bash
# As root/sudo
sudo -u postgres psql

CREATE USER primus WITH PASSWORD 'your-secure-password';
CREATE DATABASE lance_db OWNER primus;
GRANT ALL PRIVILEGES ON DATABASE lance_db TO primus;
\q

# Update DATABASE_URL in .env:
# DATABASE_URL=postgresql://primus:your-secure-password@localhost/lance_db
```

### 4. Test the Application

```bash
# As primus user, in the backend directory with venv activated
cd /srv/primus-backend/backend
source .venv/bin/activate

# Test run
python main.py
# Should see: INFO:     Uvicorn running on http://0.0.0.0:8000

# Test with curl
curl http://localhost:8000/health
# Should return: {"status":"ok","service":"lance-backend","timestamp":"..."}
```

### 5. Systemd Service

Create `/etc/systemd/system/primus-api.service`:

```ini
[Unit]
Description=Primus Lance API (Gunicorn)
After=network.target postgresql.service

[Service]
User=primus
Group=primus
WorkingDirectory=/srv/primus-backend/backend
Environment="PATH=/srv/primus-backend/backend/.venv/bin"
ExecStart=/srv/primus-backend/backend/.venv/bin/gunicorn -k uvicorn.workers.UvicornWorker -w 4 -b 127.0.0.1:8000 main:app --access-logfile - --error-logfile -
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Note: Adjust workers (`-w 4`) based on CPU cores: `(2 × CPU cores) + 1`

### 6. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable primus-api
sudo systemctl start primus-api
sudo systemctl status primus-api

# View logs
sudo journalctl -u primus-api -f
```

### 7. Nginx Configuration

Create `/etc/nginx/sites-available/api.primustech.in`:

```nginx
server {
    server_name api.primustech.in;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/api.primustech.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. SSL Certificate

```bash
sudo certbot --nginx -d api.primustech.in
```

## Updating the Application

Create an update script at `/srv/primus-backend/update.sh`:

```bash
#!/bin/bash
cd /srv/primus-backend
git pull origin main
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart primus-api
```

Make it executable: `chmod +x /srv/primus-backend/update.sh`

## Monitoring

### Check service status
```bash
sudo systemctl status primus-api
```

### View logs
```bash
# Service logs
sudo journalctl -u primus-api -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

### Test endpoints
```bash
# Health check
curl https://api.primustech.in/health

# API root
curl https://api.primustech.in/
```

## Troubleshooting

1. **502 Bad Gateway**: Check if the backend service is running
   ```bash
   sudo systemctl status primus-api
   sudo journalctl -u primus-api -n 50
   ```

2. **CORS errors**: Ensure frontend domain is in the `origins` list in `app/main.py`

3. **Database connection errors**: Check DATABASE_URL and PostgreSQL service
   ```bash
   sudo systemctl status postgresql
   ```

4. **Permission errors**: Ensure primus user owns all files
   ```bash
   sudo chown -R primus:primus /srv/primus-backend
   ```

5. **Module import errors**: Ensure virtual environment is activated and all dependencies installed
   ```bash
   source /srv/primus-backend/backend/.venv/bin/activate
   pip install -r requirements.txt
   ```

## Performance Tuning

1. **Gunicorn Workers**: Adjust based on CPU cores
   - Rule: `(2 × CPU cores) + 1`
   - For 2 cores: `-w 5`
   - For 4 cores: `-w 9`

2. **Database Connection Pool**: Configure in SQLAlchemy
   ```python
   # In database.py
   engine = create_engine(
       DATABASE_URL,
       pool_size=20,
       max_overflow=40,
       pool_pre_ping=True,
   )
   ```

3. **Redis for Caching**: If using Redis, ensure it's configured and running
   ```bash
   sudo systemctl status redis-server
   ```

## Security Checklist

- [ ] Changed all default secrets in .env
- [ ] PostgreSQL using strong password
- [ ] Firewall configured (only SSH, HTTP, HTTPS open)
- [ ] SSL certificate installed and auto-renewing
- [ ] CORS configured for production domain only
- [ ] Debug mode disabled in production
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`
