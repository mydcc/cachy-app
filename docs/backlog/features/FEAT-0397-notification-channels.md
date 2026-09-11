---
id: FEAT-0397
title: Configure notification delivery channels (Email, Discord, Telegram)
type: feature
status: done
assignee: mydcc
branch: worktree-feat-0392-0397-a48a54
resolved_at: 2026-09-11
priority: P2
milestone: M4
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0018
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

Three criteria were rewritten during the build rather than ticked as written,
because they described mechanisms that do not exist in a browser. The originals
are kept below so the change is auditable.

- [x] E-mail delivery works through a provider HTTPS API — **Mailgun**
      (`/v3/<domain>/messages`, the trader's own key as basic auth)
- [x] Credentials are stored in `localStorage` **without** encryption, and the
      settings UI says so in both locales, with the reason and the safer habit
      (revocable tokens, not on a shared device)
- [x] Discord webhook URL is validated against a pinned host allowlist; the test
      button posts a message and reports success or the provider's own reason
- [x] Telegram bot token is sent to Telegram and nowhere else — no proxy; the
      test button sends a message; the chat list is fetched via `getUpdates` and
      cached, because Telegram drops an update once it has been read
- [x] All three channels are optional; an alert fires with zero configured
- [x] A failed delivery logs the reason, renders it per channel in the settings
      UI, and cannot escape as an exception into the evaluation loop
- [x] Settings UI lists all three channels with on/off toggles and credential
      fields; a channel that fails validation cannot be switched on at all
- [x] "Test" sends only a test notification, marked as a test in the delivery log

Original wording, superseded:

- ~~Email delivery works with at least one SMTP provider (e.g., Gmail, Proton Mail)~~
- ~~SMTP credentials (host, port, user, password) are encrypted at rest and decrypted only on send~~
- ~~Discord webhook URL is stored encrypted~~ / ~~Telegram bot token is stored encrypted~~

### Not met, and why

- **Per-rule channel selection via the trigger-method selector.** The proposal
  puts each channel's toggle in [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md)'s
  selector. It is global-per-category here instead, on the same policy matrix as
  in-app, browser and sound. Two reasons: `TriggerMethod` in
  `src/lib/rules/types.ts` mirrors a Rust enum, so extending it is a migration
  with its own blast radius; and the firing sink does not yet honour
  `trigger_methods` at all — a rule's stored methods are written and never read.
  Wiring external channels into a field nothing reads would have shipped a
  second silently-dead toggle. Deferred to its own item, recorded in ADR-0018.

- **Live end-to-end delivery on a real account.** The CORS behaviour of all five
  candidate endpoints was verified against the live services, and the request
  shape, auth header and failure mapping are covered by unit tests — but no
  message has been sent through a real Mailgun, Discord or Telegram account from
  this branch. The "Test" button is the trader's own verification step and the
  first thing to press after merge.

## Out of scope

- Retry logic for failed deliveries
- Queuing mechanism for offline alerts (send when reconnected)
- Rate limiting per channel (first iteration: send every alert to all enabled channels)
- Attachments or rich formatting (first iteration: plain text messages)
- Authentication UI helpers (e.g., OAuth flow for Discord) — user provides the token/URL directly

## Found while sequencing M4 (2026-09-11), and how each was decided

Three parts of the proposal above could not be built as written in a browser-only,
Local-First app. Each was measured rather than guessed at — a cross-origin
preflight against every candidate endpoint with `Origin: https://cachy.app`:

| Endpoint | `Access-Control-Allow-Origin` | Callable from a page |
|---|---|---|
| `api.telegram.org` | `*` | yes |
| `discord.com/api/webhooks` | origin reflected | yes |
| `api.mailgun.net/v3/…/messages` | `*`, `POST` + `Authorization` | yes |
| `api.resend.com` | none | no |
| `api.sendgrid.com` | only `sendgrid.api-docs.io` | no |

- **A browser cannot speak SMTP** — no socket API, so the original criterion
  described a mechanism that does not exist here. **Decided:** Mailgun's HTTPS
  API. Resend and SendGrid are out because neither answers a browser at all.

- **Telegram does not need a proxy.** The claim that its Bot API refuses
  cross-origin requests turned out to be wrong for the current API: it answers
  with `Access-Control-Allow-Origin: *`. **Decided:** call it directly, which
  also settles the ADR-0001 question in the safest direction — the bot token
  reaches Telegram and nothing else. The no-proxy rule is now binding for any
  future channel, in ADR-0018.

- **"Encrypted in localStorage" was obfuscation.** **Decided:** store the
  credentials as they are and say so, because the honest alternative — a
  passphrase — means alarms cannot fire while the app is locked, which is the one
  thing an alarm may not do. Calling these credentials "encrypted" anywhere in
  code, UI or docs is now forbidden by ADR-0018 unless a real user secret is
  added.

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
