# Installing Cachy

This guide is for **running** Cachy on your own machine or server. Both the
Community and the Pro edition are self-hosted, so you are your own operator —
there is no Cachy account and no Cachy server holding your data.

If you want to work *on* Cachy rather than run it, see the development setup in
[`README.md`](../README.md). If you are setting up a permanent instance behind a
reverse proxy, [`DEPLOYMENT.md`](../DEPLOYMENT.md) covers that in detail.

---

## 1. Prerequisites

- **Node.js v20 or newer** and npm. (`.node-version` pins 20.18.3 for tooling.)
- **A Rust toolchain is optional.** The build script rebuilds the technical
  indicator module when Rust is available and otherwise falls back to the
  pre-compiled binary committed in `static/wasm/`, so a plain install works out
  of the box.

---

## 2. Get the code

```bash
git clone https://github.com/mydcc/cachy-app.git
cd cachy-app
npm ci
```

`npm ci` rather than `npm install` — it installs exactly the versions in
`package-lock.json`.

---

## 3. Create your configuration (optional)

```bash
cp .env.example .env
```

`.env.example` is the full reference for every setting; it is kept in step with
the code by a test, so nothing the app reads is missing from it. **Nothing in it
is required to run Cachy** — the file exists for optional knobs:

- `PORT` — listen port (default `3000` for the plain build)
- `ORIGIN` — the public URL, needed for correct CSRF/form handling behind a proxy
- `ADDRESS_HEADER` / `XFF_DEPTH` — make rate limiting see real client IPs behind a reverse proxy
- `LOG_STREAM_KEY` — protects the debug log stream endpoint

API authentication needs no configuration: the app mints its own access token
automatically (see [ADR-0002](adr/0002-api-authentication-fails-closed.md)).
There is no deployment-wide secret to generate, keep, or leak.

---

## 4. Start Cachy

```bash
npm run build
node build/index.js
```

Cachy is now at `http://localhost:3000`.

If you created a `.env`, start with
`node --env-file=.env build/index.js` instead — the server does **not** read
`.env` on its own, so `PORT` or `ORIGIN` would never reach it otherwise.

> **Why not `npm start`?** It runs `node server.js` (compression +
> security headers) without `--env-file`, which has the same limitation —
> use `node --env-file=.env server.js` to combine your `.env` with those
> extras. (`--env-file` needs Node 20 or newer, which Cachy requires anyway.)

> If you change anything in `.env` later, **restart the process**. The running
> server reads its configuration once, at startup.

---

## 5. First steps in the app

Open Cachy — that's all the setup there is. On its first request to a protected
API route, the app obtains a self-issued access token from your own server
(`POST /api/auth/token`) and stores it in your browser. You can see (and
regenerate) it under **Settings → Connections → Access Token**; normally you
never need to touch it.

Once you are in, add your exchange API keys under the same tab and start using
the calculator, live balance and position sync.

---

## 6. Troubleshooting: every API call returns 401

The symptom is a working-looking app where the balance never loads, positions
stay empty, and the browser console shows `401 (Unauthorized)` for
`/api/balance`, `/api/account`, `/api/positions` and `/api/orders`.

Authentication fails closed by design (see
[ADR-0002](adr/0002-api-authentication-fails-closed.md)): routes guarded by
`checkClientToken` refuse any request whose token was not issued by this very
server process. The error message is deliberately **identical**
(`Invalid or missing client access token`) for every cause, so an unauthenticated
caller learns nothing about your setup.

Work through them in order.

### a) A stale token after a server restart

Tokens live in the server process's memory, so **restarting the server
invalidates every issued token**. The app expects this: when a request fails
with 401, it automatically mints a fresh token and retries once. If the retry
also failed (e.g. the server came up moments later), simply reload the page.

### b) The token in the browser was cleared

Check **Settings → Connections**: the field should show an access token. If it
is empty or you suspect it is out of sync, click **Create access token** — the
app replaces its stored token with a freshly issued one.

### c) You are rate-limited, not unauthorized

Rate limits answer with **429**, not 401: each token may make 300 requests per
minute, all tokens of one IP together 600 per minute, and token issuance itself
is capped at 20 per hour per IP. Behind a reverse proxy without
`ADDRESS_HEADER`/`XFF_DEPTH` configured, every visitor shares one issuance
bucket — see `.env.example` and [`DEPLOYMENT.md`](../DEPLOYMENT.md) for the fix.

### d) Test the server on its own

Bypassing the browser entirely, mint a token and use it right away:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/token | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -i -X POST http://localhost:3000/api/balance \
  -H "Content-Type: application/json" \
  -H "x-app-access-token: $TOKEN" \
  -d '{"exchange":"bitunix","apiKey":"x","apiSecret":"x"}'
```

Anything other than 401 — including an error from the exchange about the dummy
credentials — means the server side is correct and the problem is in the
browser.

---

## Where your data lives

Everything you enter — journal, settings, exchange API keys, presets, notes, and
the client access token — stays in your browser's local storage and is never
sent to a Cachy server. Credentials are encrypted at rest. See
[ADR-0001](adr/0001-local-first-boundary.md) for the exact boundary.

Because nothing is stored server-side, **backups are your responsibility**:
Settings → System → Create Backup, optionally password-protected.
