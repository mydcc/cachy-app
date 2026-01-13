# Deployment Instructions

## Why am I seeing 404 errors after deployment?

If you see a broken page or 404 errors for JS/CSS files after running `npm run build`, it is because the running Node.js server is still serving the **old** version of the application from memory, while the old asset files on the disk have been replaced by the **new** build.

The browser tries to load the old assets (requested by the old HTML served by the process), but they no longer exist on the disk.

## Correct Deployment Procedure

To update the application correctly, you must **restart** the server process immediately after building.

### Using the Helper Script

We have included a `deploy.sh` script to automate this.

**For Production:**

```bash
./deploy.sh cachy-app
```

**For Staging:**

```bash
./deploy.sh devcachyapp
```

### Manual Steps

If you prefer to do it manually:

1.  Pull changes: `git pull`
2.  Install deps: `npm install`
3.  Build: `npm run build`
4.  **Restart PM2:** `pm2 restart cachy-app` (or your specific process name)
