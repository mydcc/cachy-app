# Deployment Guide for aaPanel (Node.js)

This guide walks you through installing **Cachy** on a server running **aaPanel**. Since the app uses server-side functions (API proxies), it is deployed as a Node.js application.

## Prerequisites

*   A server with **aaPanel** installed.
*   **Node.js Version Manager** (installed via aaPanel App Store). Recommended: Node v18 or v20.
*   Domains pointing to the server IP (e.g., `cachy.app` and `dev.cachy.app`).

---

## 1. Strategy: Staging & Production

It is recommended to run two separate environments:

1.  **Staging (`dev.cachy.app`):**
    *   For testing new features.
    *   Updated manually or automatically on every push to the `dev` branch.
    *   Runs on a dedicated port (e.g., 3001).

2.  **Production (`cachy.app`):**
    *   The stable version for end-users.
    *   Updated only after staging has been successfully tested (push to `main`).
    *   Runs on a dedicated port (e.g., 3000).

---

## 2. Setup in aaPanel

The following steps apply to both environments (just adjust directory names).

### Step 1: Upload Files
1.  Go to **Files** in aaPanel.
2.  Create the folder `/www/wwwroot/cachy.app` (for Production) or `/www/wwwroot/dev.cachy.app` (for Staging).
3.  Upload the project files or clone the repo directly in the terminal:
    ```bash
    cd /www/wwwroot/cachy.app
    git clone https://github.com/pheinze/cachy-app.git .
    ```

### Step 2: Install Dependencies & Build
1.  Open the terminal in aaPanel or via SSH.
2.  Navigate to the directory:
    ```bash
    cd /www/wwwroot/cachy.app
    ```
3.  Install packages and create the build:
    ```bash
    npm install
    npm run build
    ```
    *This creates the `build/` folder containing the startable server application.*

### Step 3: Create Node Project (Website > Node project)
1.  Go to **Website** -> **Node project** in the aaPanel menu.
2.  Click on **Add Node project**.
3.  Fill in the fields:
    *   **Path:** `/www/wwwroot/cachy.app`
    *   **Name:** `cachy-prod` (or `cachy-dev`)
    *   **Run Command:** Select `Custom Command` and enter: `node build/index.js`
        *(By default, aaPanel often looks for `app.js` or `index.js`, but SvelteKit is located in `build/index.js`)*
    *   **Port:** `3000` (for Production) or `3001` (for Staging). *Ensure the port is open in the firewall or used internally.*
    *   **Node Version:** v18 or higher.
4.  Click **Submit**.

### Step 4: Domain Mapping & SSL
1.  After creating, click on **Mapping** (or "Domain" depending on version) in the Node projects list.
2.  Add your domain (e.g., `cachy.app`).
3.  Go to the **SSL** tab and apply for a free "Let's Encrypt" certificate. Enable "Force HTTPS".

---

## 3. Applying Updates (Deployment Workflow)

When you have made changes, update the instance as follows:

**Manually via Terminal:**
```bash
# 1. Switch to directory
cd /www/wwwroot/cachy.app

# 2. Get latest code
git pull

# 3. Rebuild (IMPORTANT!)
npm install  # If dependencies changed
npm run build

# 4. Restart process (via aaPanel GUI or command)
# In aaPanel: Website -> Node project -> cachy-prod -> Restart
```

---

## 4. Environment Variables (Optional)

If you need to change configurations (like ports or API secrets), you can create a `.env` file in the root directory:

```env
PORT=3000
ORIGIN=https://cachy.app
```
*Note: `ORIGIN` is important for SvelteKit Form Actions to avoid CSRF errors.*

---

## Port Summary (Example)

| Environment | Path | Port | Domain |
| :--- | :--- | :--- | :--- |
| **Production** | `/www/wwwroot/cachy.app` | `3000` | `cachy.app` |
| **Staging** | `/www/wwwroot/dev.cachy.app` | `3001` | `dev.cachy.app` |
