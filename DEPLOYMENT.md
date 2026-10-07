# Deployment Guide for aaPanel (Node.js)

This guide walks you through installing **Cachy** on a server running **aaPanel**. Since the app uses server-side functions (API proxies), it is deployed as a Node.js application.

It is the single deployment guide for the project — the former `DEPLOY.md` was
merged into it (roadmap item 10), because two guides drifted apart and disagreed
about how to invoke `deploy.sh`.

## Prerequisites

- A server with **aaPanel** installed.
- **Node.js Version Manager** (installed via aaPanel App Store). Required: Node v22.19 or newer (matches `engines` in `package.json`).
- Domains pointing to the server IP (e.g., `cachy.app` and `dev.cachy.app`).
- **`START_COMMAND` must not contain a redundant `sudo -u www` if `deploy.sh` itself already runs as
  `www`.** There are two valid ways to run `deploy.sh`, and the right `START_COMMAND` depends on which one
  you use — mixing them up is a real failure mode, not a hypothetical one (it cost a multi-hour investigation
  on a production instance):

  1. **`deploy.sh` runs as an unprivileged operator user** (e.g. via SSH as a personal account), and needs
     to elevate to `www` to start the app:
     ```
     STABLE_START_COMMAND="sudo -u www bash /www/server/nodejs/vhost/scripts/cachyapp.sh"
     ```
     This requires a passwordless sudo rule for that operator user, because `deploy.sh` runs
     `START_COMMAND` non-interactively in the background — no TTY is attached, so `sudo` cannot prompt for
     a password even if one would normally be accepted:
     ```bash
     sudo visudo -f /etc/sudoers.d/cachy-deploy
     ```
     ```
     <operator-user> ALL=(www) NOPASSWD: ALL
     ```
     Also check for `Defaults use_pty` in `/etc/sudoers` — it forces every `sudo` invocation to allocate a
     pseudo-terminal, which is unreliable from a backgrounded, non-interactive job like this one and can
     deny the command even with a correct `NOPASSWD` rule. If present, add a scoped exception:
     `Defaults:<operator-user> !use_pty`.

  2. **`deploy.sh` runs as `www` itself** (e.g. via aaPanel's own "run as site user" button, or
     `sudo -u www bash deploy.sh`) — the common case when the project directory is owned by `www` and an
     unprivileged user can't write to it directly. Here `START_COMMAND` must be plain, with **no** `sudo`
     prefix at all:
     ```
     STABLE_START_COMMAND="bash /www/server/nodejs/vhost/scripts/cachyapp.sh"
     ```
     `www` sudo-ing to `www` is not a no-op — it's a privilege escalation with no rule granting it, so it
     is denied. Because `deploy.sh` swallowed `START_COMMAND`'s output for a long time (fixed below), this
     failure mode looked identical to "the app is just slow to start": the health check burned its full
     90s wait every time, and the real cause (`sudo: I'm sorry www. I'm afraid I can't do that`) was
     invisible until the start-command logging below was added.

  Check which case applies by checking who owns the project directory (`ls -ld` on it) and how you
  actually invoke `deploy.sh` — don't assume based on which user you SSH in as.

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

The following steps apply to both environments (directory names per environment).

### Step 1: Upload Files

1. Create the folder `/www/wwwroot/cachy.app` (for Production) or `/www/wwwroot/dev.cachy.app` (for Staging) under **Files** in aaPanel.
2. Upload the project files or clone the repo directly in the terminal:

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

1. Create a Node project under **Website → Node project**:
2. Fill in the fields:
    - **Path:** `/www/wwwroot/cachy.app`
    - **Name:** `cachy-prod` (or `cachy-dev`)
    - **Run Command:** Select `Custom Command` and enter:
      `node --env-file=.env server.js` — the Express wrapper that applies
      compression and security headers. The `--env-file` flag is not optional in
      practice: Node does **not** read `.env` on its own, so a bare
      `node server.js` (or `node build/index.js`) silently runs without
      `NODE_ENV`, `ADDRESS_HEADER` or `XFF_DEPTH` from §7 (`ORIGIN` is consumed
      at build time instead — see §7) — which is
      why `/api/health` then reports `"environment":"development"` on a
      production box. It defaults `PORT` to 3001 instead of adapter-node's 3000,
      for hosts where 3000 is already taken.
    - **Port:** `3001` (default for Production). _Ensure the port is open in the firewall or used internally._
    - **Node Version:** v22.19 or higher (matches `engines` in `package.json`).
3. Submit the form.

### Step 4: Domain Mapping & SSL

1. Under **Mapping** (or "Domain" depending on version) in the Node projects list, add your domain (e.g., `cachy.app`).
2. Apply for a free "Let's Encrypt" certificate and enable "Force HTTPS" (SSL tab).

### Step 5: Reverse proxy headers (required behind nginx)

aaPanel's nginx sits in front of the Node process. Its `location /` already sets
`Host`, `X-Real-IP` and `X-Forwarded-For`, but it misses two headers that both
matter:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;   # without it the app sees http
    proxy_set_header X-Forwarded-Host $host;      # preserves the public host
    # ... rest of aaPanel's location block ...
}
```

- **`X-Forwarded-Proto`** tells the app the request arrived over HTTPS. Without
  it, `event.url` resolves to `http://…`, which breaks redirects and the
  cross-origin check on form submissions — the same reason `ORIGIN` exists (§7).
- **`X-Forwarded-Host`** preserves the host the browser used.

**`add_header` is not inherited by locations.** Nginx drops every `add_header`
declared at the `server` level for a `location` that declares its own. A
`location /` carrying `add_header X-Cache …` (as generated by aaPanel) therefore loses server-level
security headers. You must explicitly place all security headers inside the `location /` block (or include a shared headers file) and add
`always` so they also apply to error responses. Without `always`, Nginx omits the
headers on error responses (4xx/5xx), which is enough to fail the header check on
an otherwise healthy site:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://s.cachy.app blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://s.cachy.app; media-src 'self' blob: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-src 'self' https://space.cachy.app https://s.cachy.app https: blob: data:; frame-ancestors 'self'; connect-src 'self' https: https://s.cachy.app https://chat.cachy.app wss://chat.cachy.app https://*.cachy.app wss://*.cachy.app wss://fapi.bitunix.com wss://stream.bitunix.com wss://ws.bitget.com https://api.imgbb.com https://discord.com https://api.telegram.org https://api.mailgun.net https://generativelanguage.googleapis.com https://api.openai.com" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
add_header Permissions-Policy "camera=(self \"https://space.cachy.app\"), microphone=(self \"https://space.cachy.app\"), xr-spatial-tracking=(self \"https://space.cachy.app\" *), display-capture=(self \"https://space.cachy.app\"), fullscreen=*, autoplay=*, accelerometer=*, gyroscope=*, clipboard-write=*, encrypted-media=*, picture-in-picture=*, web-share=*, geolocation=*" always;
```

**Compression at the Nginx layer.** `server.js` already compresses on its own side
(`compression({ level: 6 })`, plus the precompressed `.br`/`.gz` siblings
adapter-node emits for each asset). Nginx does not re-compress a response that
already carries `Content-Encoding`, so this block is about the case where the
Node layer is not the one serving — see
[Production Monitor Reports…](#production-monitor-reports-missing-security-headers-or-low-performance-score).

Brotli first for text assets, since the build already emits `.br` variants;
keep the gzip block as the fallback for clients that do not send
`Accept-Encoding: br`:

```nginx
brotli on;
brotli_comp_level 6;
brotli_min_length 1024;
brotli_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

gzip on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_proxied any;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
```

**Prefer TLS 1.2 and newer.** Leave `TLSv1.1` out of `ssl_protocols`; it is
deprecated and known-weak.

---

## 3. Automated Deployment (`deploy.sh`)

There is **one** script, and it defaults to production:

```bash
./deploy.sh            # production — cachy.app, branch main, port 3001
./deploy.sh --beta     # staging    — dev.cachy.app, branch develop, port 3002
./deploy.sh --ci       # same as above, but deploys a CI-built artifact (see below)
./deploy.sh --beta --ci
```

`--beta` selects the staging environment and `--ci` switches the build step from
"compile on this host" to "download the artifact GitHub Actions already built".
Both can be combined. Any other argument is ignored and the script deploys
**production**. Before doing so it prints the target environment, offers to
switch you to the required branch, and asks for an explicit `y` — so a mistyped
argument is caught, but do not rely on that: read the banner.

### Deploying a CI-built artifact (`--ci`)

Small servers can run out of memory compiling this app — `npm ci` plus the WASM
and Vite builds peaked past 8 GB on the staging box and the kernel OOM-killed
the build (`Killed` in the deploy log, with the build log showing the compile
had actually finished). The fix is to stop compiling on the server entirely:

1. `.github/workflows/deploy-build.yml` builds the artifact in GitHub Actions on
   every push to `develop`/`main` and publishes it as `cachy-build.tar.gz` on a
   per-branch moving release tag (`deploy-beta` for `develop`, `deploy-stable`
   for `main`). The download URL is fixed.
2. `./deploy.sh --beta --ci` then downloads that URL, extracts the artifact
   (`build/`, `server.js`, `server-headers.js`) into the shadow directory,
   refreshes production dependencies with `npm ci --omit=dev` (cheap on memory,
   unlike a full build), and runs the same backup → swap → restart →
   health-check sequence as a local deploy. The wrapper files travel with the
   artifact because `build/index.js` is rewritten to delegate to `server.js`,
   so `node build` resolves them on hosts without a full checkout.

Everything else — concurrency lock, backup, atomic swap, graceful shutdown,
health check — is shared with the local-build path. A failed download aborts
before the live deployment is touched, exactly like a failed local build.

The URL is `https://github.com/<CI_REPO>/releases/download/<tag>/cachy-build.tar.gz`
with `<CI_REPO>` and the tags coming from `.deploy.conf` (defaults
`mydcc/cachy-app`, `deploy-stable`, `deploy-beta` — existing configs need no
edits). If the workflow has not run yet for the pushed commit, the download
fails fast and the deploy reports a build failure.

**Rolling back a bad CI build.** Before the moving tag is overwritten, the
workflow preserves the current artifact as `<tag>-previous`
(`deploy-beta-previous` / `deploy-stable-previous`). To redeploy the last
known-good build after a bad deploy, point the config at the preserved tag and
re-run the same deploy — no rebuild needed:

```bash
# .deploy.conf
CI_ARTIFACT_TAG_BETA="deploy-beta-previous"

./deploy.sh --beta --ci
```

The preserved tag is replaced on the next successful build, so only the most
recent previous artifact is kept.

> ⚠️ `--ci` still runs `git pull` first and refreshes `node_modules` with
> `npm ci --omit=dev` at the project root. After a failed deploy, a subsequent
> local build (`./deploy.sh` without `--ci`) re-installs the dev dependencies
> automatically.

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
> one finds no config, generates a template copy with placeholder start
> commands, tells you to check `.deploy.conf`, and **aborts immediately**
> before touching the lock, the build or the running app. Nothing is deployed
> and nothing is rolled back — but the deploy still doesn't happen until you
> restore the file, and the failure is one run removed from its cause, which
> is what makes it worth calling out.
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
- ✅ Pinned script execution — re-executes itself from a private snapshot before doing anything else, so the mid-run `git pull` cannot rewrite the code that is still running (see "What the script does")
- ✅ Automatic backup (last 5 deployments kept, configurable via `MAX_BACKUPS`)
- ✅ Single previous build (`build_previous`, removed after success unless `KEEP_PREVIOUS=1`) — no timestamped `build_old_*` pile; legacy piles are deleted on the next deploy
- ✅ Log rotation (newest `MAX_BUILD_LOGS=20` build/start logs kept, `deploy_*.log` older than `LOG_RETENTION_DAYS=14` days deleted)
- ✅ Disk-space guard (`MIN_FREE_MB=1024`) — aborts before backup/build when the disk is nearly full
- ✅ Atomic build in a shadow directory — a failed build never touches the live one
- ✅ Graceful service shutdown (SIGTERM → SIGKILL)
- ✅ Build artifact validation
- ✅ Dependency refresh before the swap (`npm ci --omit=dev`, local builds) — the live tree cannot run a build against a different framework version than it was compiled with
- ✅ Health check against `/api/health`
- ✅ Auto-rollback on failure
- ✅ Optional Discord notifications

### What the script does

1. **Pin the executing script** - copies itself into a private snapshot in `$TMPDIR` and re-executes that copy, so the whole run is bound to the code as it was at start (see "Why the script runs from a snapshot" below)
2. **Take the concurrency lock** - a second run refuses to start while one is in progress
3. **Check branch and working tree** - offers to switch branch and to stash changes
4. **Confirm** - production mode requires an explicit `y`
5. **Pull latest code** - `git reset --hard HEAD && git pull`
6. **Create backup** - full build + package-lock.json + Git commit
7. **Build in a shadow directory** - copies the tree to `.deploy_work`, runs `npm ci --legacy-peer-deps && npm run build` there. **A failed build aborts without touching the running deployment.**
8. **Validate build** - checks that `build/index.js` exists
9. **Refresh production dependencies** (local build only) - `npm ci --omit=dev` at the project root, before the swap. The shadow build compiles against its own fresh `npm ci`, but the swap replaces only `build/` — without this the live tree keeps whatever `node_modules` it had, so the server can be built against one framework version and executed against another. `--ci` skips it: that path already refreshed deps while fetching the artifact. **A failed install aborts before the swap.**
10. **Swap** - `chown www:www`, `chmod 755`, move the old `build/` aside as `build_previous` (fixed name, so nothing accumulates), move the new one in. Timestamped `build_old_*` leftovers from older versions are deleted once on the next deploy.
11. **Graceful restart** - SIGTERM, then SIGKILL after a grace period, then `START_COMMAND` from `.deploy.conf`.
    Its output is captured to `logs/start_<timestamp>.log` rather than discarded, and an immediate exit of the
    start command (e.g. a bad path) is flagged before the health check even begins.
12. **Health check** - verify the service responds at `/api/health`
13. **Auto-rollback** - restore `build_previous` and restart when the health check fails; the previous build is deleted only after the health check passes (unless `KEEP_PREVIOUS=1`)

### Why the script runs from a snapshot

Step 5 pulls new code, and one of the files it rewrites is `deploy.sh` itself —
while bash is still reading that very file. Bash reads scripts lazily and tracks
only a **byte offset**, so as soon as the file changes size, every following line
is read from the wrong position. Sections get skipped entirely, or the same
section runs twice.

This is not theoretical. On **2026-10-06** the dependency-refresh fix from #3892
was pulled in mid-run; its block never executed, so the deploy shipped against
stale `node_modules` and failed its health check — with no error pointing at the
real cause.

So the script copies itself to `$TMPDIR/cachy-deploy.XXXXXXXX` and `exec`s the
copy, which pins the content for the entire run. `SCRIPT_DIR` is carried over
explicitly, because `BASH_SOURCE` now points into the snapshot and would
otherwise redefine it. Three things follow, and they matter when you read a log
or check on a running deploy:

- **`ps` shows the snapshot, not `deploy.sh`.** A running deploy appears as
  `bash /tmp/cachy-deploy.XXXXXXXX` (or under `$TMPDIR` if that is set). Looking
  for `deploy.sh` in `ps` finds nothing, which reads as "no deploy is running"
  when one very much is. See the concurrency-lock entry in Troubleshooting.
- **A change pulled in mid-run reaches the build but not the run's own logic.**
  Step 5 onwards genuinely build the newly pulled code; the deploy *script*
  stays on whatever was pinned at start. So a fix to `deploy.sh` itself takes
  effect only from the run *after* the one that pulled it.
- **Snapshot files are cleaned up on exit** via an `EXIT` trap. A run killed with
  SIGKILL leaves its ~30 KB file behind; that is harmless and safe to delete.

The snapshot is **best effort**: if it cannot be written (no space in `$TMPDIR`,
a restrictive `TMPDIR`), the deploy continues unprotected rather than being
blocked by the protection. If you need to know which happened, check for the
snapshot process above before assuming pinning was active. On that path there is
no snapshot file, and the cleanup trap is a no-op — it never touches anything
outside `$TMPDIR`.

### Manual rollback

The script rolls back on its own when the health check fails. To do it by hand:

```bash
# Backups are grouped by mode name — "stable" and "beta", not the domain
ls -la /backups/cachy/stable/
ls -la /backups/cachy/beta/

# With KEEP_PREVIOUS=1 the build the last deployment replaced is still on disk:
ls -d /www/wwwroot/cachy.app/build_previous
```

Restore by moving `build_previous` (if kept) or the wanted `build/` directory
from `BACKUP_DIR` back into place and restarting the Node project. `BACKUP_DIR` is set in `.deploy.conf` and falls back to
`<project>/backups` when the configured path is not writable.

---

## 4. Discord Notifications (Optional)

The deployment scripts support Discord webhook notifications for deployment events.

### Setup

1. **Create Discord Webhook** (Server Settings → Integrations → Webhooks) and copy its URL.

2. **Configure Environment Variables:**

   The script reads a single webhook URL, used for both environments. Add it
   to your shell profile (`~/.bashrc` or `~/.profile`):

   ```bash
   export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK"
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

If `DISCORD_WEBHOOK_URL` is not set, the scripts run normally — notifications are skipped.

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
npm ci  # npm ci, not npm install — reproducible installs
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
PORT=3001
HOST=127.0.0.1
ORIGIN=https://cachy.app
NODE_ENV=production
ADDRESS_HEADER=X-Forwarded-For
XFF_DEPTH=1
```

> ⚠️ **`.env` is never read automatically.** Node only loads it when the start
> command passes `--env-file=.env` (see §2 Step 3). A process started as a bare
> `node server.js` runs with none of the values above — including `NODE_ENV`,
> which is why `/api/health` then reports `"environment":"development"` on a
> production box.

> API authentication needs no secret: routes are guarded by self-issued client
> tokens that the app obtains from your own server automatically
> (`POST /api/auth/token`, rate-limited — see
> [ADR-0002's BUG-0052 amendment](docs/adr/0002-api-authentication-fails-closed.md)).
> There is no deployment-wide token to configure or leak.

_Note: `ORIGIN` is important behind a reverse proxy — SvelteKit uses it to resolve `event.url` and to pass its cross-origin check on form submissions. Since SvelteKit 3 it is consumed at **build** time, not by the running server: `vite.config.ts` passes it to SvelteKit as `paths.origin`. Vite does not put `.env` files into `process.env`, so the config reads it via `loadEnv()` — which works because the §6 shadow build copies the tree (including `.env`) into `.deploy_work` before `npm run build` runs. If `.env` is missing at build time, the origin falls back to the request's Host header instead of the pinned value, so a directly reachable instance could spoof it; keep `.env` present for builds, or export `ORIGIN` in the environment._

> ⚠️ **`ADDRESS_HEADER`/`XFF_DEPTH` matter as soon as any per-IP rate limit is
> in play** (`/api/auth/token`, `checkClientToken` — see
> [ADR-0002's BUG-0052 amendment](docs/adr/0002-api-authentication-fails-closed.md)).
> This deployment shape (aaPanel's nginx in front of the Node process) is a
> reverse proxy, so without these set, `event.getClientAddress()` returns
> nginx's own address for every request — every visitor shares one rate-limit
> bucket instead of getting their own. Only set these because the Node process
> here is *not* directly reachable from the internet on its own `PORT` —
> otherwise a caller could forge the header and spoof any IP, bypassing every
> per-IP limit.
>
> The bundled server binds every interface unless `HOST` is set. Behind this
> proxy shape, set `HOST=127.0.0.1` (see the sample above) so the app is
> reachable only through nginx — or block the app `PORT` in the firewall.
> Confirm from an external host that `http://<server-ip>:<PORT>/api/health` is
> refused **before** enabling `ADDRESS_HEADER`; otherwise a caller can forge the
> header and spoof any IP.

---

## 8. Troubleshooting

### Deployment Fails

1. **Check logs:**

   ```bash
   tail -f /var/log/cachy/deploy_YYYYMMDD.log
   ```

2. **A previous run left work behind:**

    ```bash
    ls -d .deploy_work build_previous   # shadow build dir and superseded build
    ```

   `deploy.sh` removes `.deploy_work` itself on both success and build failure.
   If it is still there, the run was interrupted — it is safe to delete.

   > A concurrency lock prevents this: a second `./deploy.sh` refuses to start
   > while another is running. It is a `flock` on `.deploy.lock`, held for as
   > long as any process still has it open — including the background build, so
   > a killed script does not free the lock while its npm build is still writing
   > into `.deploy_work`.

   The script's own snapshot lives outside the project, in
   `$TMPDIR/cachy-deploy.XXXXXXXX`, and is removed by an `EXIT` trap. A run
   killed with `SIGKILL` cannot run its trap, so one ~30 KB file may remain:

   ```bash
   ls -l "${TMPDIR:-/tmp}"/cachy-deploy.* 2>/dev/null
   ```

   Only remove files whose name matches that pattern *and* that no process is
   currently running — confirm with
   `ps aux | grep -E 'deploy\.sh|cachy-deploy\.'`.

3. **Build fails:**
   - The full build log path is printed on failure — `logs/build_<timestamp>.log`
   - The build runs in `.deploy_work`, so a failure leaves the live deployment untouched
   - Try manually: `npm ci --legacy-peer-deps && npm run build`

4. **`❌ Dependency install FAILED!`** — the pre-swap `npm ci --omit=dev` at the
   project root failed, so the deploy aborted before the swap and the running
   deployment was never touched. The reason is in the same build log
   (`logs/build_<timestamp>.log`). Fix the install (usually a lockfile/`package.json`
   mismatch after a dependency bump), then re-run. This is the failure #3892's
   refresh step exists to surface early rather than as a health-check timeout: a
   live tree left on old `node_modules` fails at runtime, not at install time.

5. **A change you just merged appears to have done nothing** — the log shows the
   deploy pulling in the commit, the build succeeds, and the old behavior is
   still in effect. Historically this meant bash had re-read a grown `deploy.sh`
   from a stale byte offset and silently skipped the block that contained the
   fix; that specific cause is fixed by pinning the script at start (see "Why
   the script runs from a snapshot"). If you still hit it:

   - Confirm the pinned copy is in use: a running deploy must show up as
     `bash /tmp/cachy-deploy.XXXXXXXX` under `ps`. If it shows `./deploy.sh`
     directly, the snapshot was not taken — check that `$TMPDIR` is writable.
   - Remember that the deploy *script* is pinned at start, while the *build* is
     not. A fix to `deploy.sh` therefore never affects the run that pulled it;
     run the deploy a second time.

6. **`fatal: detected dubious ownership in repository`:**
   - Git refuses to run `git` commands in a working tree owned by a different user than the one running
     them (a security check, not a `deploy.sh` bug). Common on aaPanel when the repo was cloned as `root`
     (or created by the panel) but `deploy.sh` is run as another shell user.
   - Fix once per user/directory:
     ```bash
     git config --global --add safe.directory /www/wwwroot/cachy.app
     git config --global --add safe.directory /www/wwwroot/dev.cachy.app
     ```
   - If this comes up, also double-check that the user running `deploy.sh` actually owns (or can write to)
     the project directory — the same mismatch can later make `rsync`/`mv`/`chown` in the build-swap step
     fail too.

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
   - **`sudo: I'm sorry <user>. I'm afraid I can't do that` (or a plain password prompt) in
     `logs/start_*.log`:** three possible causes, roughly in order of likelihood:
     1. **`START_COMMAND` has `sudo -u www` but `deploy.sh` is already running as `www`.** `www` sudo-ing
        to itself is a privilege escalation nothing grants, so it's always denied — see the
        `START_COMMAND` note in Prerequisites above for how to tell which of the two invocation patterns
        applies and fix the command accordingly. This was the actual cause the one time this was chased
        down in production; the other two below turned out to be red herrings that first time, but are
        worth ruling out too.
     2. **Missing `NOPASSWD` sudoers rule** for the user actually invoking `sudo` (only relevant for the
        "unprivileged operator user" pattern in Prerequisites). `deploy.sh` runs `START_CMD` in the
        background with no TTY, so `sudo` cannot prompt; without `NOPASSWD` it fails immediately every
        time — even though the exact same command typed interactively can appear to "just work", because a
        recently cached `sudo` credential (the ticket from an earlier password entry, valid for several
        minutes) papers over the missing rule until it expires. Rule out that false positive before
        trusting a manual test: run `sudo -k` (drop the cached ticket) right before
        `sudo -n -u www bash <script> < /dev/null`, and only trust an exit code of `0` under those
        conditions.
     3. **`Defaults use_pty`** in `/etc/sudoers` (`grep -rn use_pty /etc/sudoers /etc/sudoers.d/`) forcing
        pty allocation, which is unreliable for a backgrounded job with no controlling terminal. A quick
        interactive `sudo -u www id` can succeed while the exact same command run from within a
        non-interactively-executed script still fails — test through an actual script file
        (`bash /path/to/test.sh`, not typed at the prompt) to reproduce this faithfully. Fix: a scoped
        `Defaults:<user> !use_pty`.

2. **Endpoint not responding:**
   - Verify service is running: `curl http://localhost:3001/api/health`
   - Check if build/index.js exists
   - Restart manually via aaPanel

3. **`❌ Another deployment is already running` right after a deploy that just succeeded:** the
   concurrency-lock file descriptor (fd 200, see "Concurrency lock" in section 3) leaked into the Node
   server process itself and is now held open for as long as that process runs — i.e. until its next
   restart, not until some other deploy finishes. `deploy.sh` closes that fd for `START_CMD` now, so a
   run started from an already-fixed checkout won't reproduce this — but that run still needs to get
   past the very `flock -n 200` check this is blocking, so the current stuck lock needs breaking by hand
   once:
   ```bash
   rm .deploy.lock
   ```
   Safe here specifically because the cause is understood (a live app process, not a second deploy
   genuinely mid-run) — check with `ps aux | grep -E 'deploy\.sh|cachy-deploy\.'` first if there's any
   doubt. Both patterns are needed: a deploy running from its pinned snapshot appears as
   `bash /tmp/cachy-deploy.XXXXXXXX` and would be missed by a `deploy.sh`-only search, which then reads
   as "nothing is running" when something is. Note that a deploy which *pulled* the fd fix mid-run is
   still running the pre-fix code (see "Why the script runs from a snapshot"), so it can leak the
   descriptor once more; the next run is the first that is safe.

### Production Monitor Reports Missing Security Headers or Low Performance Score

If `./scripts/jules/monitor-production.sh` or the daily automated production monitor reports missing security headers (e.g., `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) or a Lighthouse performance score below the threshold the monitor was configured with (`PERF_THRESHOLD`, 70 by default):

Start by telling the two reports apart. They have **different** causes, and the Nginx config is only ever the fix for one of them.

```bash
curl -sI -H 'Accept-Encoding: gzip, br' https://<your-domain>/ | grep -iE 'content-encoding|strict-transport|content-security-policy'
```

- A `content-encoding` value means the response is compressed — a low score then has nothing to do with compression, see item 3.
- No `content-encoding` means responses go out uncompressed. Check item 2 first: if the Node process is not `server.js`, nothing downstream will compress.
- `strict-transport-security` or `content-security-policy` missing on a compressed response means item 1.

1. **Missing Security Headers behind Nginx / aaPanel:**
   - **Root Cause:** If an `add_header` directive is defined inside a `location /` block (e.g., aaPanel's auto-generated `add_header X-Cache ...`), Nginx drops every `add_header` declared at the parent `server` level for that location. This affects only headers **Nginx itself adds** — upstream headers are passed through unless `proxy_hide_header` removes them.
   - **Check which case you are in:** Cachy sets these headers itself, in `server-headers.js::applySecurityHeaders`, so if they are missing from the response the app is very likely not the one serving (item 2) or the Nginx `location /` overrides them. The inheritance rule is the cause only when the headers were configured in Nginx at all.
   - **Fix:** Place all required security headers inside the `location /` block in the Nginx site configuration, each with the `always` flag so headers apply to error responses as well. The full block lives in [Step 5: Reverse proxy headers](#step-5-reverse-proxy-headers-required-behind-nginx) — fix it there rather than in a second copy that can drift.

2. **Node Process Running Polka / Bare adapter-node:**
   - Confirm that aaPanel's Node project Run Command is set to `node --env-file=.env server.js` (or `node build/index.js`, which delegates to `server.js` via `scripts/postbuild.mjs`). A bare unpatched `node build/index.js` (or any direct adapter-node entry) skips Express compression **and** the security header middleware. This single check explains both symptoms above: missing headers and a low score.

3. **Lighthouse Performance Score Below Threshold:**
   - **Root Cause:** `server.js` already compresses on its own side — `compression({ level: 6 })` plus the precompressed `.br`/`.gz` siblings adapter-node emits per asset. Nginx does not re-compress a response that already carries `Content-Encoding`. With the correct Run Command in place the payloads are therefore already compressed, and enabling compression in Nginx changes nothing. Uncompressed responses in production almost always point back to item 2, not to a missing `gzip on`.
   - **If the `curl` above showed no `content-encoding`:** the Node layer is not serving (item 2), or Nginx strips the upstream encoding. Enabling compression at the Nginx layer is then a safety net, not the primary fix:
     ```nginx
     brotli on;
     brotli_comp_level 6;
     brotli_min_length 1024;
     brotli_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

     gzip on;
     gzip_comp_level 6;
     gzip_min_length 1024;
     gzip_proxied any;
     gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;
     ```
     Reload afterwards with `nginx -s reload`.
   - **If responses are already compressed:** compression is not the bottleneck. Transfer size drives LCP and Total Byte Weight far more than FCP, which is dominated by the HTML and the render-blocking CSS. Look at the heaviest assets on the critical path, and check the startup log — a `No precompressed assets found` warning means every asset is re-compressed per request.

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
