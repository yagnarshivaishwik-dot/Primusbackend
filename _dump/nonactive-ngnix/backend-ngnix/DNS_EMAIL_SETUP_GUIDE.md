# 🌐 DNS Configuration Guide for Primus Backend

This guide helps you set up DNS records for your Primus backend deployment. Email configuration is now optional and can be set up later if needed.

## 📡 DNS Records Setup

### 🎯 Required DNS Records

Before running the deployment script, you **MUST** configure these DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `yourdomain.com` | `YOUR_SERVER_IP` | 300 |
| A | `www.yourdomain.com` | `YOUR_SERVER_IP` | 300 |

### 🚀 Recommended DNS Records (Optional but Helpful)

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `api.yourdomain.com` | `YOUR_SERVER_IP` | 300 |
| A | `admin.yourdomain.com` | `YOUR_SERVER_IP` | 300 |

### 📋 Example DNS Configuration

If your domain is `primus.example.com` and server IP is `192.168.1.100`:

```
A    primus.example.com        192.168.1.100
A    www.primus.example.com    192.168.1.100
A    api.primus.example.com    192.168.1.100
A    admin.primus.example.com  192.168.1.100
```

## 🛠️ How to Set Up DNS Records

### 1. **GoDaddy**
1. Log into GoDaddy account
2. Go to "My Products" → "DNS"
3. Click "Manage" next to your domain
4. Click "Add Record"
5. Select "A" record type
6. Enter the name and server IP
7. Set TTL to 300 seconds
8. Save changes

### 2. **Namecheap**
1. Log into Namecheap account
2. Go to "Domain List" → "Manage" 
3. Click "Advanced DNS" tab
4. Click "Add New Record"
5. Select "A Record"
6. Enter host and server IP
7. Set TTL to 300
8. Save changes

### 3. **Cloudflare**
1. Log into Cloudflare dashboard
2. Select your domain
3. Go to "DNS" tab
4. Click "Add record"
5. Select "A" type
6. Enter name and server IP
7. Set TTL to 300 seconds
8. Save record

### 4. **Google Domains**
1. Log into Google Domains
2. Select your domain
3. Go to "DNS" tab
4. Scroll to "Custom resource records"
5. Add A records with your server IP
6. Save changes

### 5. **AWS Route 53**
1. Log into AWS Console
2. Go to Route 53 service
3. Select your hosted zone
4. Click "Create Record"
5. Select "A" record type
6. Enter subdomain and server IP
7. Set TTL to 300
8. Create record

## 🔍 DNS Verification

### Test DNS Propagation

After setting up DNS records, test them:

```bash
# Test main domain
nslookup yourdomain.com

# Test www subdomain
nslookup www.yourdomain.com

# Check from multiple locations
dig yourdomain.com @8.8.8.8
dig yourdomain.com @1.1.1.1
```

### Online DNS Checkers
- https://dnschecker.org/
- https://www.whatsmydns.net/
- https://mxtoolbox.com/DNSLookup.aspx

### DNS Propagation Time
- **Typical time**: 5-60 minutes
- **Maximum time**: 24-48 hours
- **TTL 300**: Changes propagate in ~5 minutes

## 📧 Email Configuration Guide (Optional)

**Note:** Email configuration is now optional. Your backend works fully without email setup. Configure email only if you need password reset or notification features.

### 🎯 Gmail Setup (Recommended)

Gmail is the easiest and most reliable option for SMTP:

#### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable "2-Step Verification"
3. Complete the setup process

#### Step 2: Generate App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" as the app
3. Select "Other" as the device
4. Enter "Primus Backend" as the name
5. Click "Generate"
6. **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

#### Step 3: Update .env File
```env
# Enable email features first
ENABLE_EMAIL_FEATURES=True
ENABLE_PASSWORD_RESET=True
ENABLE_EMAIL_VERIFICATION=True

# Configure SMTP
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop
SMTP_FROM_EMAIL=noreply@yourdomain.com
SMTP_FROM_NAME=Primus Gaming Center
```

#### Step 4: Restart Backend
```bash
sudo systemctl restart primus-backend
```

### 🔧 Alternative SMTP Providers

#### 1. **SendGrid**
```env
SMTP_SERVER=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=your_sendgrid_api_key
```

#### 2. **Mailgun**
```env
SMTP_SERVER=smtp.mailgun.org
SMTP_PORT=587
SMTP_USERNAME=postmaster@mg.yourdomain.com
SMTP_PASSWORD=your_mailgun_password
```

#### 3. **AWS SES**
```env
SMTP_SERVER=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=your_aws_access_key_id
SMTP_PASSWORD=your_aws_secret_access_key
```

#### 4. **Microsoft Outlook/Hotmail**
```env
SMTP_SERVER=smtp.live.com
SMTP_PORT=587
SMTP_USERNAME=your-email@outlook.com
SMTP_PASSWORD=your_outlook_password
```

#### 5. **Yahoo Mail**
```env
SMTP_SERVER=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USERNAME=your-email@yahoo.com
SMTP_PASSWORD=your_app_password
```

### 📬 Email Testing

After configuring email, test it:

```bash
# Check if your backend can send emails
curl -X POST "https://yourdomain.com/api/auth/request-password-reset" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## 🚀 Complete Deployment Process

### Step 1: Configure DNS Records
Set up the DNS records as described above and wait for propagation.

### Step 2: Get Email Credentials
Set up Gmail App Password or alternative SMTP credentials.

### Step 3: Run Deployment Script
```bash
# Download and run the deployment script
curl -sSL https://raw.githubusercontent.com/LORD-VAISHWIK/primus-backend/main/deploy_ubuntu.sh -o deploy_ubuntu.sh
chmod +x deploy_ubuntu.sh
sudo ./deploy_ubuntu.sh yourdomain.com your-email@domain.com
```

### Step 4: Update Email Configuration
```bash
# Edit the environment file
sudo nano /var/www/primus/backend/.env

# Update these lines:
SMTP_USERNAME=your-actual-email@gmail.com
SMTP_PASSWORD=your-16-character-app-password

# Restart the backend
sudo systemctl restart primus-backend
```

### Step 5: Test Everything
```bash
# Check service status
/usr/local/bin/primus-status.sh

# Test API
curl https://yourdomain.com/api/health

# Test email functionality
curl -X POST "https://yourdomain.com/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'
```

## ⚠️ Troubleshooting

### DNS Issues

**Problem**: Domain doesn't resolve to server IP
```bash
# Check current DNS resolution
nslookup yourdomain.com

# Check if server is reachable
ping yourdomain.com

# Check from different DNS servers
dig yourdomain.com @8.8.8.8
dig yourdomain.com @1.1.1.1
```

**Solutions**:
- Wait longer for DNS propagation (up to 48 hours)
- Clear local DNS cache: `sudo systemctl flush-dns`
- Check DNS records at registrar
- Verify server IP is correct

### SSL Certificate Issues

**Problem**: SSL certificate fails to install
```bash
# Check DNS resolution first
nslookup yourdomain.com

# Try manual SSL setup
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Check Nginx configuration
sudo nginx -t
```

**Solutions**:
- Ensure DNS is properly configured and propagated
- Check firewall allows ports 80 and 443
- Verify domain ownership
- Try again after DNS propagation

### Email Issues

**Problem**: Emails not sending
```bash
# Check backend logs
sudo journalctl -u primus-backend -f

# Test SMTP connection
telnet smtp.gmail.com 587
```

**Solutions**:
- Verify Gmail App Password is correct (16 characters)
- Check 2FA is enabled on Google account
- Ensure firewall allows outbound port 587
- Try alternative SMTP provider

### Common Error Messages

**"DNS resolution failed"**
- Wait for DNS propagation
- Check DNS records are correct
- Verify server IP

**"SSL certificate validation failed"**
- Ensure DNS points to correct server
- Check domain is accessible via HTTP first
- Wait for DNS propagation

**"SMTP authentication failed"**
- Verify email credentials
- Check App Password is correct
- Enable "Less secure app access" if needed

## 📞 Support

If you encounter issues:

1. **Check logs**: `sudo journalctl -u primus-backend -f`
2. **Run status check**: `/usr/local/bin/primus-status.sh`
3. **Test individual components**:
   - DNS: `nslookup yourdomain.com`
   - HTTP: `curl http://yourdomain.com`
   - HTTPS: `curl https://yourdomain.com`
   - API: `curl https://yourdomain.com/api/health`

## 🎉 Success Checklist

✅ DNS records configured and propagated  
✅ Domain resolves to server IP  
✅ Email credentials configured  
✅ Deployment script completed successfully  
✅ SSL certificate installed (for domains)  
✅ API accessible at `/docs`  
✅ Email functionality tested  
✅ All services running properly  

Your Primus backend is now ready for production! 🚀
