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

## 3. Create your configuration

```bash
cp .env.example .env
```

`.env.example` is the full reference for every setting; it is kept in step with
the code by a test, so nothing the app reads is missing from it. Only one entry
is **required**.

### Generate the app access token

`APP_ACCESS_TOKEN` is a shared secret between your browser and your own Cachy
server. It is not an exchange API key and not a password — it exists so that
nobody but you can use your server's API routes.

Generate one:

```bash
openssl rand -hex 32
```

No OpenSSL (typical on Windows)? Node is already a prerequisite:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `.env`:

```env
APP_ACCESS_TOKEN=<the value you just generated>
```

> **Keep this value.** You need the exact same string again in step 5.

---

## 4. Start Cachy

```bash
npm run build
node --env-file=.env build/index.js
```

Cachy is now at `http://localhost:3000`.

> **Why not `npm start`?** It runs `node build/index.js` without
> `--env-file`, and the server does **not** read `.env` on its own — so your
> token would never reach it and every API call would answer 401. Use the
> command above, or export the variables some other way before starting.
> `--env-file` needs Node 20 or newer, which Cachy requires anyway.

To use a different port, set `PORT` in `.env` (`PORT=3001`) — it is picked up
with the rest of the file.

> If you change anything in `.env` later, **restart the process**. The running
> server reads its configuration once, at startup.

---

## 5. Enter the token in the app — do not skip this

Open Cachy and go to **Settings → Connections → App Access Token** and paste the
**same value** you put in `.env`.

This is the second half of the same secret. The server rejects every request
that does not carry it, so leaving this field empty leaves you with an app that
loads and looks healthy while nothing that touches your account works.

Once it is set you can add your exchange API keys under the same tab and start
using the calculator, live balance and position sync.

---

## 6. Troubleshooting: every API call returns 401

The symptom is a working-looking app where the balance never loads, positions
stay empty, and the browser console shows `401 (Unauthorized)` for
`/api/balance`, `/api/account`, `/api/positions` and `/api/orders`.

Authentication fails closed by design (see
[ADR-0002](adr/0002-api-authentication-fails-closed.md)): if the token is missing
or wrong, the request is refused. The error message is deliberately **identical**
for every cause, so that an unauthenticated caller learns nothing about your
setup — which also means it cannot tell *you* which of the following it is.

Work through them in order.

### a) The token is not in the app's settings

By far the most common cause: `.env` is set, step 5 was skipped. Check
**Settings → Connections → App Access Token**.

Note that this field can take a few seconds to populate after a page load — it
is decrypted from your browser's local storage in the background. Give it a
moment before concluding it is empty.

### b) The server never received your `.env`

**`.env` sitting in the project folder does not mean the server read it.** The
Node server does not parse `.env` files on its own; something has to load the
values into the process environment.

`npm start` does **not** do this, and neither do most hosting panels' generated
start commands. Load the file explicitly:

```bash
node --env-file=.env build/index.js
```

If a panel manages the process for you, put that command in its "start command"
field rather than editing the generated script — panels tend to regenerate those
and silently drop your change.

To confirm what the running process actually has:

```bash
# Linux/macOS — replace <PID> with the Cachy process id
cat /proc/<PID>/environ | tr '\0' '\n' | grep APP_ACCESS_TOKEN
```

The server also says so in its own log on every rejected request:

```
APP_ACCESS_TOKEN is not configured. Denying all authenticated API requests.
```

If that line appears, the problem is here and not in your browser.

### c) The two values differ

A trailing space or a partial copy is enough. Clear the settings field and paste
the value again, freshly copied from `.env`.

To test the server on its own, bypassing the browser entirely:

```bash
curl -i -X POST http://localhost:3000/api/balance \
  -H "Content-Type: application/json" \
  -H "x-app-access-token: <your token>" \
  -d '{"exchange":"bitunix","apiKey":"x","apiSecret":"x"}'
```

Anything other than 401 — including an error from the exchange about the dummy
credentials — means the server side is correct and the problem is in the browser.

---

## Where your data lives

Everything you enter — journal, settings, exchange API keys, presets, notes, and
this token — stays in your browser's local storage and is never sent to a Cachy
server. Credentials are encrypted at rest. See
[ADR-0001](adr/0001-local-first-boundary.md) for the exact boundary.

Because nothing is stored server-side, **backups are your responsibility**:
Settings → System → Create Backup, optionally password-protected.
