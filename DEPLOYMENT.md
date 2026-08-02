# Deployment Guide for aaPanel (Node.js)

This guide walks you through installing **Cachy** on a server running **aaPanel**. Since the app uses server-side functions (API proxies), it is deployed as a Node.js application.

It is the single deployment guide for the project — the former `DEPLOY.md` was
merged into it (roadmap item 10), because two guides drifted apart and disagreed
about how to invoke `deploy.sh`.

## Prerequisites

- A server with **aaPanel** installed.
- **Node.js Version Manager** (installed via aaPanel App Store). Recommended: Node v18 or v20.
- Domains pointing to the server IP (e.g., `cachy.app` and `dev.cachy.app`).

---

## 1. Strategy: Staging & Production

It is recommended to run two separate environments:

1. **Staging (`dev.cachy.app`):**
    - For testing new features.
    - Tracks the **`develop`** branch, which semantic-release publishes as the `beta` prerelease channel.
    - Runs on a dedicated port (e.g., 3002).

2. **Production (`cachy.app`):**
    - The stable version for end-users.
    - Tracks **`main`**, updated only after staging has been successfully tested.
    - Runs on a dedicated port (e.g., 3001).

These two branch names are what `deploy.sh` enforces per mode, via
`BRANCH_STABLE` / `BRANCH_BETA` in `.deploy.conf`.

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
      Alternatively `node server.js` — a thin wrapper that defaults `PORT` to 3001 instead of adapter-node's 3000, for hosts where 3000 is already taken.
    - **Port:** `3001` (default for Production). _Ensure the port is open in the firewall or used internally._
    - **Node Version:** v18 or higher.
4. Click **Submit**.

### Step 4: Domain Mapping & SSL

1. After creating, click on **Mapping** (or "Domain" depending on version) in the Node projects list.
2. Add your domain (e.g., `cachy.app`).
3. Go to the **SSL** tab and apply for a free "Let's Encrypt" certificate. Enable "Force HTTPS".

---

## 3. Automated Deployment (`deploy.sh`)

There is **one** script, and it defaults to production:

```bash
./deploy.sh            # production — cachy.app, branch main, port 3001
./deploy.sh --beta     # staging    — dev.cachy.app, branch develop, port 3002
```

`--beta` is the only argument it recognises. Anything else is ignored and the
script deploys **production**. Before doing so it prints the target environment,
offers to switch you to the required branch, and asks for an explicit `y` — so a
mistyped argument is caught, but do not rely on that: read the banner.

Which domain, branch and port each mode uses comes from `.deploy.conf`
(`STABLE_*` / `BETA_*`). Copy `.deploy.conf.example` and adjust it before the
first run; the script generates a default from the template if the file is
missing.

> ⚠️ **One-time migration — read this before the next deploy.**
> `.deploy.conf` used to be committed. It is now gitignored, because it describes
> one specific server. `deploy.sh` runs `git reset --hard HEAD && git pull`, so
> the deploy that pulls this change **removes `.deploy.conf` from the server**.
>
> That run still succeeds — the config was sourced before the pull. The *next*
> one finds no config, regenerates it from the template with placeholder start
> commands, and fails the health check into a rollback. The failure is one deploy
> removed from its cause, which is what makes it worth calling out.
>
> **Back it up on the server first:**
>
> ```bash
> cp .deploy.conf ~/deploy.conf.backup     # before deploying
> # after the deploy that pulls this change:
> cp ~/deploy.conf.backup .deploy.conf
> ```
>
> The previously committed contents remain recoverable from git history if the
> backup is missed: `git show <commit-before>:.deploy.conf`.

Features:

- ✅ Concurrency lock — a second run refuses to start while one is in progress
- ✅ Automatic backup (last 5 deployments kept, configurable via `MAX_BACKUPS`)
- ✅ Atomic build in a shadow directory — a failed build never touches the live one
- ✅ Graceful service shutdown (SIGTERM → SIGKILL)
- ✅ Build artifact validation
- ✅ Health check against `/api/health`
- ✅ Auto-rollback on failure
- ✅ Optional Discord notifications

### What the script does

1. **Take the concurrency lock** - a second run refuses to start while one is in progress
2. **Check branch and working tree** - offers to switch branch and to stash changes
3. **Confirm** - production mode requires an explicit `y`
4. **Create backup** - full build + package-lock.json + Git commit
5. **Pull latest code** - `git reset --hard && git pull`
6. **Build in a shadow directory** - copies the tree to `.deploy_work`, runs `npm ci --legacy-peer-deps && npm run build` there. **A failed build aborts without touching the running deployment.**
7. **Validate build** - checks that `build/index.js` exists
8. **Swap** - `chown www:www`, `chmod 755`, move the old `build/` aside as `build_old_<timestamp>`, move the new one in
9. **Graceful restart** - SIGTERM, then SIGKILL after a grace period, then `START_COMMAND` from `.deploy.conf`.
   Its output is captured to `logs/start_<timestamp>.log` rather than discarded, and an immediate exit of the
   start command (e.g. a bad path) is flagged before the health check even begins.
10. **Health check** - verify the service responds at `/api/health`
11. **Auto-rollback** - restore the backup if the health check fails

### Manual rollback

The script rolls back on its own when the health check fails. To do it by hand:

```bash
# Backups are grouped by mode name — "stable" and "beta", not the domain
ls -la /backups/cachy/stable/
ls -la /backups/cachy/beta/

# The build the last deployment replaced is also still on disk:
ls -d /www/wwwroot/cachy.app/build_old_*
```

Restore by moving the wanted `build/` directory back into place and restarting
the Node project. `BACKUP_DIR` is set in `.deploy.conf` and falls back to
`<project>/backups` when the configured path is not writable.

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
  "version": "1.0.0",
  "environment": "production"
}
```

`version` comes from `package.json` through `APP_VERSION`, so it is a reliable
way to confirm *which* build is actually running. `environment` reflects
`NODE_ENV`.

The endpoint is unauthenticated by design — `deploy.sh` calls it to verify the
service started correctly, before any token is in play.

---

## 6. Manual Updates

If you prefer not to use `deploy.sh`:

```bash
# 1. Switch to directory
cd /www/wwwroot/cachy.app

# 2. Get latest code
git pull

# 3. Rebuild
npm ci --legacy-peer-deps  # npm ci, not npm install — reproducible installs
npm run build

# 4. Restart the process — NOT optional, see below
# In aaPanel: Website -> Node project -> cachy-prod -> Restart
```

### Why step 4 is not optional: 404s on JS and CSS after a build

If the page breaks after `npm run build`, with the browser reporting 404s for
asset files, the cause is almost always a skipped restart.

The running Node process still serves the **old** HTML from memory, and that HTML
references the old hashed asset filenames. `npm run build` has already replaced
those files on disk with new ones under new names. So the browser asks for assets
that no longer exist, and every one of them 404s.

Restarting the process is the fix. `deploy.sh` does it for you — and does it in
the right order, swapping the build in only after it succeeds.

---

## 7. Environment Variables

Create a `.env` file in the root directory. `.env.example` is the full reference — copy it and fill it in:

```bash
cp .env.example .env
```

```env
APP_ACCESS_TOKEN=<openssl rand -hex 32>
PORT=3001
ORIGIN=https://cachy.app
NODE_ENV=production
```

> ⚠️ **`APP_ACCESS_TOKEN` is required, not optional.** Authentication fails closed: without it, all 17 guarded API routes answer 401 and the deployed app cannot reach its own backend. Set it on the server **before** deploying, and enter the same value in the running app under **Settings → Connections → App Access Token**. See [ADR-0002](docs/adr/0002-api-authentication-fails-closed.md).

_Note: `ORIGIN` is important behind a reverse proxy — SvelteKit uses it to resolve `event.url` and to pass its cross-origin check on form submissions._

---

## 8. Troubleshooting

### Deployment Fails

1. **Check logs:**

   ```bash
   tail -f /var/log/cachy/deploy_YYYYMMDD.log
   ```

2. **A previous run left work behind:**

   ```bash
   ls -d .deploy_work build_old_*   # shadow build dir and superseded builds
   ```

   `deploy.sh` removes `.deploy_work` itself on both success and build failure.
   If it is still there, the run was interrupted — it is safe to delete.

   > A concurrency lock prevents this: a second `./deploy.sh` refuses to start
   > while another is running. It is a `flock` on `.deploy.lock`, held for as
   > long as any process still has it open — including the background build, so
   > a killed script does not free the lock while its npm build is still writing
   > into `.deploy_work`.

3. **Build fails:**
   - The full build log path is printed on failure — `logs/build_<timestamp>.log`
   - The build runs in `.deploy_work`, so a failure leaves the live deployment untouched
   - Try manually: `npm ci --legacy-peer-deps && npm run build`

### Health Check Fails

1. **Service not starting:**
   - Check aaPanel Node project status
   - Verify port is not in use: `lsof -i :3001`
   - Check service logs in aaPanel
   - **Verify `STABLE_START_COMMAND` / `BETA_START_COMMAND` in `.deploy.conf` point at a script that actually
     exists.** aaPanel names the vhost start script after the Node project's name (e.g. `cachyapp.sh`), not
     after a fixed `prod`/`dev` convention — confirm with `ls /www/server/nodejs/vhost/scripts/`. This is a
     common failure after a server move: the project gets recreated under a new name in aaPanel, but
     `.deploy.conf` still points at the old script path. The command then exits immediately (exit 127) and
     the health check waits its full timeout for a process that was never started — with `deploy.sh`'s
     start-command logging (see above), this now shows up as `bash: .../<name>.sh: No such file or
     directory` in `logs/start_*.log` instead of failing silently.

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
