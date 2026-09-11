---
id: FEAT-0397
title: Configure notification delivery channels (Email, Discord, Telegram)
type: feature
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0389]
size: M
estimate: 5
---

# FEAT-0397 — Configure notification delivery channels

## Problem

Cachy announces alerts on two built-in channels: in-app toast and browser notification. A trader
with Cachy tabbed away gets neither reliably. Bitunix solves this with user-configurable external
channels: Email, Discord, and Telegram. The trader chooses which channels fire and how to verify
they work.

## Proposal

A new settings section in the alert panel (or Settings > Automation) where traders configure
external notification delivery. Three channels, independent of each other, optional to set up.

**Email:**
- SMTP server (host, port, TLS) OR external service key (SendGrid, Mailgun, Resend)
- Sender address
- Recipient address(es)
- Test button: send a test alert to verify the configuration
- Credentials stored encrypted in Class A (localStorage, never transmitted)

**Discord:**
- Webhook URL (from a Discord server's channel settings)
- Message format options (minimal, detailed, with embed)
- Test button: post a test message to the webhook
- Webhook URL stored encrypted in localStorage

**Telegram:**
- Bot token (from Telegram BotFather)
- Chat ID (or list of recipient IDs, pre-fetched via the bot)
- Test button: send a test message
- Bot token stored encrypted in localStorage

**Shared behaviors:**
- Each channel has an on/off toggle in the trigger-method selector (FEAT-0393)
- Validation on save: test connectivity before storing credentials
- Failed channel: if an alert fires but delivery fails, log the reason in the UI (not silent)
- No retries on transient failures — the alert fired, delivery tried; manual resend is the user's choice

Class A throughout: credentials never leave the device. Email is sent directly or via a public
API key (the trader owns the key). Discord and Telegram tokens are user-issued and never exposed
to Cachy's server.

## Acceptance criteria

- [ ] Email delivery works with at least one SMTP provider (e.g., Gmail, Proton Mail)
- [ ] SMTP credentials (host, port, user, password) are encrypted at rest and decrypted only on send
- [ ] Discord webhook URL is stored encrypted; test button posts a message and reports success/failure
- [ ] Telegram bot token is stored encrypted; test button sends a message; chat ID list is cached after first fetch
- [ ] All three channels are optional; an alert can fire with zero external channels configured
- [ ] A failed delivery attempt logs the reason and does not crash the alert evaluation loop
- [ ] Settings UI lists all three channels with on/off toggles and credential fields
- [ ] "Test" button for each channel does not send a real alert, only a test notification

## Out of scope

- Retry logic for failed deliveries
- Queuing mechanism for offline alerts (send when reconnected)
- Rate limiting per channel (first iteration: send every alert to all enabled channels)
- Attachments or rich formatting (first iteration: plain text messages)
- Authentication UI helpers (e.g., OAuth flow for Discord) — user provides the token/URL directly

## Found while sequencing M4 (2026-09-11)

Three parts of the proposal above cannot be built as written in a browser-only,
Local-First app. They are not reasons to drop the item; they are the decisions it
has to make before it starts.

- **A browser cannot speak SMTP.** SMTP is a raw TCP protocol and there is no socket
  API in a page. "SMTP server (host, port, TLS)" is not implementable client-side at
  all — only the API-key path (Resend, Mailgun, SendGrid) works, where the trader owns
  the key and the request is an ordinary HTTPS call. The acceptance criterion "Email
  delivery works with at least one SMTP provider (e.g., Gmail, Proton Mail)" therefore
  cannot be met by the described mechanism and needs rewriting to name a provider API.

- **Discord and Telegram hit CORS from a page.** Discord webhooks accept a cross-origin
  `POST`; Telegram's Bot API does not do so reliably. Routing Telegram through a proxy
  makes the proxy see the bot token, which turns a Class A credential into something
  that leaves the device — an
  [`ADR-0001`](../../adr/0001-local-first-boundary.md) question, not an implementation
  detail. Decide the proxy question in this item or drop Telegram from the first
  iteration.

- **"Encrypted in localStorage" is obfuscation without a user secret.** If the app can
  decrypt the credential unattended in order to send an alert, the key is stored beside
  the ciphertext and any script with same-origin access reads both. Either the trader
  supplies a passphrase (and alerts cannot fire while the app is locked), or the field
  is honestly labelled as stored in plaintext-equivalent form. Shipping the word
  "encrypted" over the first design is the failure mode: it is the point where the
  Local-First claim in the docs stops matching the code.

Sequencing: this item comes after
[`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md), which owns the
trigger-method selector these toggles live in. Building the toggles first means
building them twice.

## Links

- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the panel that houses channel configuration
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — trigger method selector (which channels fire)
- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — sound channel (separate, in-app only)
- Bitunix configuration screenshot (Email, Discord, Telegram, Sound examples)
- ADR-0001 — Class A data must never leave the device
