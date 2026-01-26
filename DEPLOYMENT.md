# Deployment Guide for aaPanel (Node.js)

This guide walks you through installing **Cachy** on a server running **aaPanel**. Since the app uses server-side functions (API proxies), it is deployed as a Node.js application.

## Prerequisites

- A server with **aaPanel** installed.
- **Node.js Version Manager** (installed via aaPanel App Store). Recommended: Node v18 or v20.
- Domains pointing to the server IP (e.g., `cachy.app` and `dev.cachy.app`).

---

## 1. Strategy: Staging & Production

It is recommended to run two separate environments:

1. **Staging (`dev.cachy.app`):**
    - For testing new features.
    - Updated manually or automatically on every push to the `dev` branch.
    - Runs on a dedicated port (e.g., 3002).

2. **Production (`cachy.app`):**
    - The stable version for end-users.
    - Updated only after staging has been successfully tested (push to `main`).
    - Runs on a dedicated port (e.g., 3001).

---

## 2. Setup in aaPanel

The following steps apply to both environments (just adjust directory names).

### Step 1: Upload Files

1. Go to **Files** in aaPanel.
2. Create the folder `/www/wwwroot/cachy.app` (for Production) or `/www/wwwroot/dev.cachy.app` (for Staging).
3. Upload the project files or clone the repo directly in the terminal:

    ```bash
    cd /www/wwwroot/cachy.app
    git clone https://github.com/mydcc/cachy-app.git .
    ```

### Step 2: Install Dependencies & Build

1. Open the terminal in aaPanel or via SSH.
2. Navigate to the directory:

    ```bash
    cd /www/wwwroot/cachy.app
    ```

3. Install packages and create the build:

    ```bash
    npm install
    npm run build
    ```

    _This creates the `build/` folder containing the startable server application._

### Step 3: Create Node Project (Website > Node project)

1. Go to **Website** -> **Node project** in the aaPanel menu.
2. Click on **Add Node project**.
3. Fill in the fields:
    - **Path:** `/www/wwwroot/cachy.app`
    - **Name:** `cachy-prod` (or `cachy-dev`)
    - **Run Command:** Select `Custom Command` and enter: `node build/index.js`
      _(By default, aaPanel often looks for `app.js` or `index.js`, but SvelteKit is located in `build/index.js`)_
    - **Port:** `3001` (default for Production). _Ensure the port is open in the firewall or used internally._
    - **Node Version:** v18 or higher.
4. Click **Submit**.

### Step 4: Domain Mapping & SSL

1. After creating, click on **Mapping** (or "Domain" depending on version) in the Node projects list.
2. Add your domain (e.g., `cachy.app`).
3. Go to the **SSL** tab and apply for a free "Let's Encrypt" certificate. Enable "Force HTTPS".

---

## 3. Automated Deployment Scripts

The project includes automated deployment scripts with backup, rollback, and health checks:

### Development Deployment (`deploy.sh`)

Deploy to staging environment:

```bash
./deploy.sh
```

Features:

- ✅ Automatic backup (last 5 deployments kept)
- ✅ Graceful service shutdown (SIGTERM → SIGKILL)
- ✅ Build validation
- ✅ Health check (10s timeout)
- ✅ Auto-rollback on failure
- ✅ Optional Discord notifications

### Production Deployment (`deploy_prod.sh`)

Deploy to production environment:

```bash
./deploy_prod.sh
```

Same features as `deploy.sh` but for production environment (`cachy.app` on port 3001).

### What the Scripts Do

1. **Check deployment lock** - Prevents concurrent deployments
2. **Create backup** - Full build + package-lock.json + Git commit
3. **Pull latest code** - `git reset --hard && git pull`
4. **Install dependencies** - `npm ci --legacy-peer-deps`
5. **Build project** - `npm run build` with duration tracking
6. **Validate build** - Checks for required artifacts
7. **Set permissions** - `chown www:www` and `chmod 755`
8. **Graceful restart** - SIGTERM with 10s grace period
9. **Health check** - Verify service responds at `/api/health`
10. **Auto-rollback** - Restore backup if health check fails

### Manual Rollback

If you need to manually rollback:

```bash
# Find available backups
ls -la /backups/cachy/dev/
# or
ls -la /backups/cachy/prod/

# The scripts automatically rollback on failure, but you can
# manually restore a backup by copying the build directory
```

---

## 4. Discord Notifications (Optional)

The deployment scripts support Discord webhook notifications for deployment events.

### Setup

1. **Create Discord Webhook:**
   - Go to Discord Server Settings → Integrations → Webhooks
   - Click "New Webhook"
   - Copy the webhook URL

2. **Configure Environment Variables:**

   Add to your shell profile (`~/.bashrc` or `~/.profile`):

   ```bash
   # Development webhook
   export DISCORD_WEBHOOK_DEV="https://discord.com/api/webhooks/YOUR_DEV_WEBHOOK"
   
   # Production webhook
   export DISCORD_WEBHOOK_PROD="https://discord.com/api/webhooks/YOUR_PROD_WEBHOOK"
   ```

   Or export before deployment:

   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
   ./deploy.sh
   ```

3. **Test Webhook:**

   ```bash
   ./scripts/discord-notify.sh test
   ```

### Notification Events

When configured, you'll receive Discord notifications for:

- 🚀 **Deployment Started** - User, commit info, branch
- 📦 **Build Started/Completed** - Build duration
- ✅ **Deployment Success** - Total duration, environment
- ❌ **Build/Deployment Failed** - Error details
- 🔙 **Rollback Performed** - Reason for rollback
- ⚠️ **Health Check Failed** - Service not responding

### Without Configuration

If `DISCORD_WEBHOOK_URL` is not set, the scripts **run normally without errors** - notifications are simply skipped (silent fail).

---

## 5. Health Check Endpoint

The application includes a health check endpoint for monitoring:

```bash
curl http://localhost:3001/api/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "version": "0.94.3",
  "environment": "production"
}
```

This endpoint is used by the deployment scripts to verify the service started correctly.

---

## 6. Manual Updates (Legacy Method)

If you prefer not to use the automated scripts:

**Manually via Terminal:**

```bash
# 1. Switch to directory
cd /www/wwwroot/cachy.app

# 2. Get latest code
git pull

# 3. Rebuild (IMPORTANT!)
npm ci --legacy-peer-deps  # Use npm ci instead of npm install
npm run build

# 4. Restart process (via aaPanel GUI or command)
# In aaPanel: Website -> Node project -> cachy-prod -> Restart
```

---

## 7. Environment Variables (Optional)

If you need to change configurations (like ports or API secrets), you can create a `.env` file in the root directory:

```env
PORT=3001
ORIGIN=https://cachy.app
NODE_ENV=production
```

_Note: `ORIGIN` is important for SvelteKit Form Actions to avoid CSRF errors._

---

## 8. Troubleshooting

### Deployment Fails

1. **Check logs:**

   ```bash
   tail -f /var/log/cachy/deploy_YYYYMMDD.log
   ```

2. **Deployment lock exists:**

   ```bash
   rm /tmp/cachy_deploy_dev.lock
   # or
   rm /tmp/cachy_deploy_prod.lock
   ```

3. **Build fails:**
   - Check if package.json has `build` script
   - Ensure all dependencies are in package.json
   - Try manual build: `npm ci && npm run build`

### Health Check Fails

1. **Service not starting:**
   - Check aaPanel Node project status
   - Verify port is not in use: `lsof -i :3001`
   - Check service logs in aaPanel

2. **Endpoint not responding:**
   - Verify service is running: `curl http://localhost:3001/api/health`
   - Check if build/index.js exists
   - Restart manually via aaPanel

### Rollback Issues

1. **No backup available:**
   - First deployment has no backup
   - Manually fix and redeploy

2. **Rollback didn't help:**
   - Check backup directory: `ls -la /backups/cachy/`
   - Manually restore specific backup
   - Review deployment logs

### Discord Notifications Not Working

1. **Test webhook:**

   ```bash
   ./scripts/discord-notify.sh test
   ```

2. **Check environment variable:**

   ```bash
   echo $DISCORD_WEBHOOK_URL
   ```

3. **Webhook URL invalid:**
   - Regenerate webhook in Discord
   - Ensure no trailing spaces in URL
   - Test with curl manually

---

## 9. Port Summary (Example)

| Environment    | Path                         | Port   | Domain          |
| :------------- | :--------------------------- | :----- | :-------------- |
| **Production** | `/www/wwwroot/cachy.app`     | `3001` | `cachy.app`     |
| **Staging**    | `/www/wwwroot/dev.cachy.app` | `3002` | `dev.cachy.app` |
