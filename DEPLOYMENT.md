# Deployment Guide for Self-Hosted Server

This guide will help you set up the game server and client on a Linux server in `/var/www`.

## Prerequisites

- Node.js (v18 or higher) and npm installed
- PM2 installed globally (`npm install -g pm2`)
- Apache2 installed (for serving the client and proxying WebSocket connections)

## Step 1: Install Server Dependencies

```bash
cd /var/www/server
npm install
```

## Step 2: Build the Client

```bash
cd /var/www
npm install
npm run build
```

This creates a `dist/` folder with the built client files.

## Step 3: Configure Environment Variables

Create a `.env` file in the client root (or set environment variables):

```bash
cd /var/www
echo "VITE_SERVER_URL=http://your-server-ip:3001" > .env
# Or if using a domain:
# echo "VITE_SERVER_URL=https://yourdomain.com" > .env
```

Then rebuild:
```bash
npm run build
```

## Step 4: Set Up PM2 for the Server

Create a PM2 ecosystem file:

```bash
cd /var/www/server
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'game-server',
    script: 'server.ts',
    interpreter: 'tsx',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOF
```

Create logs directory:
```bash
mkdir -p logs
```

Start the server:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on reboot
```

## Step 5: Configure Apache2

### Enable Required Apache Modules

First, enable the necessary Apache modules for proxying and WebSocket support:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod rewrite
sudo systemctl restart apache2
```

### Create Apache Virtual Host Configuration

Create an Apache virtual host configuration file:

```bash
sudo nano /etc/apache2/sites-available/game.conf
```

Add this configuration (replace `your-domain.com` with your domain or use your server IP):

```apache
<VirtualHost *:80>
    ServerName your-domain.com  # Replace with your domain or IP
    
    # Serve the built client files
    DocumentRoot /var/www/dist
    
    <Directory /var/www/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        
        # Handle client-side routing (SPA)
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Proxy WebSocket connections to Socket.io server
    ProxyPreserveHost On
    ProxyRequests Off
    
    # Socket.io WebSocket proxy
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule /socket.io/(.*) ws://localhost:3001/socket.io/$1 [P,L]
    
    # Socket.io HTTP fallback proxy
    RewriteCond %{HTTP:Upgrade} !=websocket [NC]
    RewriteRule /socket.io/(.*) http://localhost:3001/socket.io/$1 [P,L]
    
    # Proxy headers
    ProxyPass /socket.io/ http://localhost:3001/socket.io/
    ProxyPassReverse /socket.io/ http://localhost:3001/socket.io/
    
    # WebSocket upgrade headers
    <LocationMatch "/socket.io/.*">
        ProxyPass ws://localhost:3001/socket.io/
        ProxyPassReverse ws://localhost:3001/socket.io/
    </LocationMatch>
    
    ErrorLog ${APACHE_LOG_DIR}/game-error.log
    CustomLog ${APACHE_LOG_DIR}/game-access.log combined
</VirtualHost>
```

Enable the site:
```bash
sudo a2ensite game.conf
sudo apache2ctl configtest  # Test configuration
sudo systemctl reload apache2
```

### Alternative Apache Configuration (Simpler)

If the above doesn't work, try this simpler configuration:

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    DocumentRoot /var/www/dist
    
    <Directory /var/www/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>
    
    # Proxy Socket.io
    ProxyPass /socket.io/ http://localhost:3001/socket.io/
    ProxyPassReverse /socket.io/ http://localhost:3001/socket.io/
    
    ProxyPass /socket.io ws://localhost:3001/socket.io
    ProxyPassReverse /socket.io ws://localhost:3001/socket.io
    
    ErrorLog ${APACHE_LOG_DIR}/game-error.log
    CustomLog ${APACHE_LOG_DIR}/game-access.log combined
</VirtualHost>
```

## Step 6: Update Server CORS Settings

If using HTTPS or a specific domain, update the server CORS:

Edit `/var/www/server/server.ts`:

```typescript
const io = new Server(httpServer, {
    cors: {
        origin: "https://your-domain.com",  // Replace with your domain
        methods: ["GET", "POST"]
    }
});
```

Then restart PM2:
```bash
pm2 restart game-server
```

## Step 7: Firewall Configuration

Make sure ports are open:

```bash
# Allow HTTP (80) and HTTPS (443) for Apache2
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow direct server access (optional, if not using Apache proxy)
sudo ufw allow 3001/tcp
```

## Step 8: SSL/HTTPS (Optional but Recommended)

Install Certbot for Let's Encrypt SSL with Apache:

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d your-domain.com
```

Certbot will automatically configure Apache for HTTPS and set up automatic renewal.

Update your `.env` file to use HTTPS:
```bash
echo "VITE_SERVER_URL=https://your-domain.com" > .env
npm run build
```

## Troubleshooting

### Check server logs:
```bash
pm2 logs game-server
```

### Check Apache logs:
```bash
sudo tail -f /var/log/apache2/game-error.log
sudo tail -f /var/log/apache2/game-access.log
# Or general Apache logs:
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/apache2/access.log
```

### Restart services:
```bash
pm2 restart game-server
sudo systemctl restart apache2
# Or reload configuration:
sudo systemctl reload apache2
```

### Test WebSocket connection:
Open browser console and check for connection errors. The client should connect to the Socket.io server automatically.

## File Structure

```
/var/www/
├── dist/              # Built client files (served by Apache2)
├── src/               # Client source code
├── server/            # Server code
│   ├── server.ts
│   ├── package.json
│   └── logs/         # PM2 logs
├── package.json
└── .env              # Environment variables
```

## Quick Commands Reference

```bash
# Start server
pm2 start /var/www/server/ecosystem.config.js

# Stop server
pm2 stop game-server

# Restart server
pm2 restart game-server

# View logs
pm2 logs game-server

# Rebuild client
cd /var/www && npm run build

# Reload Apache2
sudo systemctl reload apache2

# Restart Apache2
sudo systemctl restart apache2

# Check Apache2 status
sudo systemctl status apache2

# Test Apache2 configuration
sudo apache2ctl configtest
```

