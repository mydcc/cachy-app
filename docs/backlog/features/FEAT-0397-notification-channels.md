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

## Links

- [`FEAT-0389`](FEAT-0389-super-alert-panel.md) — the panel that houses channel configuration
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — trigger method selector (which channels fire)
- [`FEAT-0392`](FEAT-0392-notification-sound-channel.md) — sound channel (separate, in-app only)
- Bitunix configuration screenshot (Email, Discord, Telegram, Sound examples)
- ADR-0001 — Class A data must never leave the device
