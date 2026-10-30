# ADR-0018: A trader may point an announcement at a service they own, and Cachy must say what that costs

- **Status:** Accepted
- **Date:** 2026-09-11
- **Deciders:** mydcc
- **Amended:** 2026-10-28 — per-rule selection of the three local channels shipped
  (BUG-0750); per-rule *external* selection remains deferred, so the egress
  reasoning below is unchanged for `email`, `discord` and `telegram`.
- **Amended:** 2026-10-30 — per-rule selection now covers the external channels
  too (FEAT-0748). The policy remains the ceiling for *external* egress: a rule
  can only narrow delivery to a channel that is configured and switched on. A
  local tick still outranks the category default (BUG-0750), except in a
  category switched off entirely. A test send goes through the same service and
  is labelled as a test.

## Context

[`ADR-0001`](0001-local-first-boundary.md) puts alert content and the settings
around it in Class A: it never leaves the device. FEAT-0397 asks for the opposite
— e-mail, Discord and Telegram delivery — because the two built-in channels do
not reach a trader whose browser is tabbed away, and that is the situation an
alarm exists for.

The item was written before anyone checked what a browser can actually do, and
three of its parts turned out not to be buildable as described. The facts, from a
cross-origin preflight against each endpoint with `Origin: https://cachy.app`:

| Endpoint | `Access-Control-Allow-Origin` | Callable from a page |
|---|---|---|
| `api.telegram.org` | `*` | yes |
| `discord.com/api/webhooks` | origin reflected | yes |
| `api.mailgun.net/v3/…/messages` | `*`, `POST` + `Authorization` | yes |
| `api.resend.com` | none | no |
| `api.sendgrid.com` | only `sendgrid.api-docs.io` | no |

SMTP is not in the table because it cannot be: SMTP is a raw TCP protocol and a
page has no socket API. The item's acceptance criterion "Email delivery works
with at least one SMTP provider (e.g., Gmail, Proton Mail)" describes a mechanism
that does not exist in this runtime.

The third open question was storage. The item asked for credentials "stored
encrypted in Class A". An app that must decrypt a credential unattended — which
is exactly what firing an alarm at 03:00 requires — keeps the key beside the
ciphertext, and any script with same-origin access reads both. Encryption there
buys nothing except the word.

## Decision

1. **A trader may direct an announcement off this device, to a service they hold
   the credentials for.** This is a per-channel, per-category, opt-in, default-off
   choice on the same policy matrix as in-app, browser and sound
   ([`notificationPolicy.ts`](../../src/lib/notificationPolicy.ts)). It is not a
   change to ADR-0001's classification: the content is still Class A, and Cachy
   still never receives it. What changes is that Class A gains an explicit,
   user-initiated egress, the same shape as ADR-0001's existing exception for
   exchange credentials.

2. **The request goes direct, never through a proxy of ours.** Each channel calls
   its own provider from the page. A proxy would see the bot token or the Mailgun
   key, which would turn a Class A credential into something that passes through
   infrastructure Cachy controls — and that is the line ADR-0001 draws. A channel
   whose provider does not accept a cross-origin request is therefore not shipped
   rather than proxied.

3. **E-mail is Mailgun's HTTPS API.** SMTP is dropped, and Resend and SendGrid
   are dropped, for the reasons in the table above. The trader supplies their own
   Mailgun domain and key.

4. **Credentials are stored as they are, and the UI says so.** No encryption, no
   claim of encryption. The settings screen states, in both locales, that the
   credentials sit unencrypted in browser storage, why encrypting them here would
   be obfuscation, and what the trader should do instead — use revocable tokens,
   and not set this up on a device that is not theirs.

5. **A delivery result is reported, never swallowed.** `notify()` stays
   synchronous and does not list external channels among the channels it
   delivered on, because a `fetch` cannot be truthfully reported by a function
   that has already returned. The outcome — success, or a reason — lands in
   `externalDeliveryLog` and is rendered per channel in the settings UI.

6. **A rule may narrow external delivery, never widen it.** `trigger_methods`
   may name `email`, `discord` or `telegram` (FEAT-0748), and delivery then
   uses the intersection of the rule's choice, the category policy and the
   channel's own switch. A rule that names a channel the policy does not want,
   or one that is not configured, delivers nothing on it: the specific choice
   ranks above the category default only within the ceiling the trader set in
   Settings. Selecting no external method means "the policy decides", which is
   how every rule authored before the field existed behaves. The field stays
   hash-excluded, so no journal linkage migrates.
   A wanted channel that is not active is recorded in `externalDeliveryLog`
   (`paused` or `notConfigured`) instead of being skipped silently — BUG-0753.

7. **`trigger_methods` grows in place; the schema version stays 2, and the
   downgrade limit is stated rather than papered over.** An older build parses
   a document before it reaches `check_readable`, so a method it does not know
   (`telegram`) fails as a parse refusal — not the specific
   `UnsupportedSchemaVersion`. Bumping the version would not make that message
   better: the parse still happens first, and it would make every newly written
   document unreadable by a v2 build even when it names only local methods. The
   accepted rule is therefore: the current build tolerates unknown *strings*
   on the read path (`channelSelection` drops them), the core accepts every
   method it ships, and a build older than the method reports a schema mismatch
   rather than silently dropping a channel. `cargo test` pins the six wire
   names; adding a seventh is a deliberate act with this cost attached.

## Consequences

### What this enables

- An alarm reaches a trader who is not looking at Cachy, which is the failure
  FEAT-0392 and FEAT-0397 were both written against.
- The three channels stay independent: zero configured channels is a valid state,
  and an alert fires normally with none of them set up.
- The validation gate means a channel cannot be switched on before it could send,
  so the toggle never reads "on" over a channel that delivers nothing.

### What this costs

- **A real privacy step down, stated plainly.** A trader who enables Discord has
  told Discord which symbols they watch and when those levels were touched. That
  is Class C data beside a user identity, which
  [`ADR-0004`](0004-spacetimedb-data-scope.md) forbids Cachy from doing — and the
  trader is now allowed to do it to themselves, knowingly. The opt-in, the
  default-off, and the warning text are the whole of the protection.
- **A credential on disk in plaintext-equivalent form.** An XSS hole in Cachy
  becomes a bot-token disclosure. The mitigation is the existing CSP and iframe
  protection, plus the advice to use revocable tokens — not a second layer that
  would only look like one.
- **Mailgun is a single point of support.** If Mailgun changes its CORS policy,
  the e-mail channel stops working and there is no second provider to fall back
  to, because no second provider answers a browser at all.
- **No retries, so a transient network failure loses that message.** Deliberate:
  a price alert delivered ninety seconds late describes a market that has moved.
  The log says it failed.

### What is now forbidden

- Routing any external channel through a Cachy-operated proxy, relay or edge
  function. A channel that needs one is not shipped.
- Describing these credentials as "encrypted", "secured" or "protected" in code,
  comments, UI copy or docs, unless a user-supplied passphrase is actually added —
  in which case this ADR is superseded, not quietly reinterpreted.
- Sending anything to an external channel that the policy did not ask for, and
  sending on a channel that fails validation at send time. Both are re-checked in
  `externalDelivery.ts` rather than trusted from the UI.
- Writing a credential, or any part of one, into a log line. Failure logs name
  the channel and the reason only.
- Persisting the delivery log. It is in memory by design: a durable record of
  which symbols were alerted on, stored next to the credentials, is a cost with
  no matching benefit.

## Alternatives considered

- **Proxy Telegram through a Cachy endpoint.** Rejected: the proxy would see the
  bot token. The preflight check made this moot — Telegram answers the page
  directly — but the rule stands for any future channel that does not.
- **A passphrase-encrypted credential vault.** Rejected for this iteration: the
  app must be able to send while the trader is asleep, and a vault that is
  unlocked whenever alarms are armed is the unencrypted case with extra steps.
  Worth revisiting only alongside a "fire only while the app is open and
  unlocked" mode the trader chooses explicitly.
- **A Cachy-operated mail relay, so no API key is needed.** Rejected: it would
  put the alert content, and the recipient address, on our infrastructure. That is
  a Class B feature and would need its own ADR and its own consent flow.
- **Drop e-mail entirely and ship only Discord and Telegram.** Rejected once the
  preflight showed Mailgun is callable. Worth reconsidering if Mailgun closes
  that door, because the alternative is not another provider — it is a proxy,
  which decision 2 forbids.
- **Per-rule channel selection via `trigger_methods`.** Resolved for the three
  local channels by
  [`BUG-0750`](../backlog/bugs/BUG-0750-per-alert-trigger-methods-never-reach-delivery.md):
  a rule decides in-app, browser and sound for itself. Per-rule *external*
  selection stays deferred, not rejected — `TriggerMethod` mirrors a Rust enum,
  and extending it to `email | discord | telegram` is its own item
  ([`FEAT-0748`](../backlog/features/FEAT-0748-per-alert-delivery-channels-and-test-announcement.md))
  with the decision 1 reasoning above applied to it.
