# Cloudflare Tunnel Setup Guide for primustech.in

This guide will help you set up your PC as a backend server accessible through primustech.in using Cloudflare tunnels.

## Prerequisites

1. **Cloudflare Account**: Make sure you have a Cloudflare account with the domain `primustech.in` added
2. **Domain Setup**: Ensure `primustech.in` is using Cloudflare nameservers
3. **Administrator Access**: You'll need admin privileges on your Windows PC

## Quick Setup (Automated)

### Option 1: Run the PowerShell Script (Recommended)

1. **Open PowerShell as Administrator**
2. **Navigate to your backend directory**:
   ```powershell
   cd K:\lance\backend
   ```
3. **Run the setup script**:
   ```powershell
   .\setup-cloudflare-tunnel.ps1
   ```

The script will automatically:
- Download and install `cloudflared`
- Authenticate with your Cloudflare account
- Create a tunnel named `primustech-backend`
- Configure DNS routing
- Create startup scripts

### Option 2: Manual Setup

If you prefer to set up manually or the script fails:

#### Step 1: Install cloudflared

1. Download `cloudflared` from: https://github.com/cloudflare/cloudflared/releases/latest
2. Choose `cloudflared-windows-amd64.exe`
3. Place it in a directory like `C:\Program Files\Cloudflare\`
4. Add the directory to your system PATH

#### Step 2: Authenticate

```powershell
cloudflared tunnel login
```

This opens a browser window. Log in to Cloudflare and select `primustech.in`.

#### Step 3: Create Tunnel

```powershell
cloudflared tunnel create primustech-backend
```

#### Step 4: Configure DNS

```powershell
cloudflared tunnel route dns primustech-backend primustech.in
```

#### Step 5: Create Configuration File

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\YOUR_USERNAME\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  # Route API requests to FastAPI backend
  - hostname: primustech.in
    path: /api/*
    service: http://localhost:8000
  
  # Route WebSocket connections
  - hostname: primustech.in
    path: /ws/*
    service: http://localhost:8000
  
  # Route health check
  - hostname: primustech.in
    path: /health
    service: http://localhost:8000
  
  # Route root endpoint
  - hostname: primustech.in
    path: /
    service: http://localhost:8000
  
  # Catch-all rule (required)
  - service: http_status:404

metrics: 127.0.0.1:2000
```

## Configuration

### Backend Configuration

1. **Copy environment file**:
   ```powershell
   copy env.production .env
   ```

2. **Edit `.env` file** with your actual values:
   - Update JWT secrets
   - Configure SMTP settings
   - Set OAuth credentials
   - **Ensure `ALLOW_ALL_CORS=true` is set**

3. **Key settings for tunnel**:
   ```env
   ALLOW_ALL_CORS=true
   APP_BASE_URL=https://primustech.in
   ```

### Frontend Configuration

Update your frontend to use the tunnel URL:
- API Base URL: `https://primustech.in/api`
- WebSocket URL: `wss://primustech.in/ws`

## Running the Services

### Option 1: Use Batch Scripts (Created by setup script)

1. **Start everything**:
   ```cmd
   start-all.bat
   ```

2. **Or start individually**:
   ```cmd
   start-backend.bat    # Just the backend
   start-tunnel.bat     # Just the tunnel
   ```

### Option 2: Manual Start

1. **Start your backend** (in one terminal):
   ```powershell
   cd K:\lance\backend
   # Activate virtual environment if using one
   venv\Scripts\activate
   python main.py
   ```

2. **Start the tunnel** (in another terminal):
   ```powershell
   cloudflared tunnel --config %USERPROFILE%\.cloudflared\config.yml run primustech-backend
   ```

## Testing the Setup

1. **Check backend locally**:
   - http://localhost:8000/health
   - http://localhost:8000/api/auth/me

2. **Check through tunnel**:
   - https://primustech.in/health
   - https://primustech.in/api/auth/me

3. **Test CORS**:
   ```javascript
   // In browser console on any domain:
   fetch('https://primustech.in/health')
     .then(r => r.json())
     .then(console.log)
   ```

## Troubleshooting

### Common Issues

1. **Tunnel not starting**:
   - Check if port 8000 is available
   - Verify backend is running first
   - Check tunnel configuration file

2. **CORS errors**:
   - Ensure `ALLOW_ALL_CORS=true` in `.env`
   - Restart backend after changing environment

3. **DNS not resolving**:
   - Wait up to 5 minutes for DNS propagation
   - Check Cloudflare dashboard for DNS records

4. **Authentication failed**:
   - Make sure you're logged into the correct Cloudflare account
   - Verify `primustech.in` domain is in your account

### Logs and Debugging

1. **Backend logs**: Check the terminal where you started the backend
2. **Tunnel logs**: Check the tunnel terminal for connection status
3. **Cloudflare dashboard**: Monitor tunnel status in Zero Trust > Access > Tunnels

## Security Considerations

1. **CORS**: Currently set to allow all origins (`*`). For production, consider restricting to specific domains.

2. **Environment variables**: Keep your `.env` file secure and never commit it to version control.

3. **Firewall**: The tunnel creates an outbound connection, so no inbound firewall rules needed.

## Production Recommendations

1. **Database**: Switch from SQLite to PostgreSQL for production
2. **Secrets**: Use strong, unique secrets for JWT and app keys
3. **Monitoring**: Set up logging and monitoring for your services
4. **Backups**: Regular database backups
5. **SSL**: Cloudflare provides SSL automatically

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Cloudflare tunnel documentation
3. Check your backend logs for errors

## File Structure After Setup

```
backend/
├── .env                              # Your environment configuration
├── env.production                    # Environment template
├── cloudflare-tunnel-config.yml      # Tunnel configuration template
├── setup-cloudflare-tunnel.ps1       # Automated setup script
├── start-backend.bat                 # Backend startup script
├── start-tunnel.bat                  # Tunnel startup script
├── start-all.bat                     # Combined startup script
└── CLOUDFLARE_TUNNEL_SETUP.md        # This guide
```

Your API will be accessible at `https://primustech.in` once everything is running!
