---
id: BUG-0560
title: Credential cards show green without private-account verification
type: bug
status: done
assignee: opencode
branch: fix/bug-0560
shipped: unreleased
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
---


# BUG-0560 — Credential cards show green without private-account verification

## Symptom

Any nonempty key/secret can make an account card appear configured and green even when the exchange rejects it. Public market connectivity is presented separately, and the order surface can appear enabled before private account state is known.

## Evidence

**Derived.** `src/components/settings/AccountCard.svelte:58-65` defines configured state solely from nonempty key, secret, and optional passphrase, then renders that predicate as a green status dot at `:93-103`. `src/components/shared/ConnectionStatus.svelte:22-55` reflects public market WebSocket state, not private account authentication or account-read health. `src/components/results/PlaceOrderPanel.svelte:171-178` enables the order button from calculator/metadata state without requiring verified private-account state.

## Cause

Credential presence, public connectivity, and private account verification are represented as if they were one connection state.

## Fix

Use a tri-state/private-account lifecycle: unconfigured, verifying, verified, rejected, and stale. Verify with a least-privilege signed account read, track freshness, distinguish public market connectivity from private account connectivity, and block live entry while private state is unknown or stale. Paper mode must remain credential-free.

## What shipped

The signal already existed and was almost unreadable. `PositionsSidebar` keeps
a local `errorAccount` from its `/api/account` read and shows it in
`AccountSummary` — a real private-account answer that the settings card, the
order panel and any trader with the sidebars hidden could not see. So the fix
promotes that answer to account-scoped shared state rather than building a
second, parallel mechanism.

- `src/stores/accountVerification.svelte.ts` — per-account record
  (`unconfigured` / `verifying` / `verified` / `rejected` / `stale`), the
  venue's error code, and a `failure` discriminator that keeps "the exchange
  refused these credentials" apart from "the exchange never answered" and from
  "this response was not readable" (a `success: true` envelope with no payload
  is our parsing problem, not the trader's key). A thrown error is not a venue
  code and does not become one: it goes to the log at the catch site, and the
  record has no field for it — a field nothing reads is a field someone
  eventually renders. A verdict is bound to a
  `credentialFingerprint` of the three credential fields, so an edit returns the
  account to `stale` before anything refetches. `stale` is also derived from a
  five-minute freshness window, so no verdict stays green by sitting still.
- The fingerprint is snapshotted **when the request is built** and carried into
  the verdict, never read back afterwards. The settings card binds its inputs
  with `bind:value`, so the key object mutates in place under a read in flight;
  a verdict fingerprinted after the response would belong to the key now in the
  input rather than the key the venue judged — which is the bug this item is
  about, one level down. Both readers (`verifyAccount`, the sidebar) snapshot
  the same three strings they sign.
- Reads are ordered by a monotonic sequence number, not by wall clock. A verdict
  is only superseded by one from a read that *started later* — a settle-time
  comparison dropped the newer verdict whenever an older read happened to land
  first.
- An in-flight read is claimed by sequence number, not counted. The sidebar's
  read and the fallback read can overlap, so a flag would let whichever finished
  first free the claim while the other was still out; a plain count breaks the
  other way, because `invalidateAll` empties the list on a session rotation and a
  release arriving afterwards — from a read belonging to the session that just
  left — would take the *new* read's claim down with it. Each release removes its
  own entry and nothing else.
- `stale` needs a live clock to be reachable at all. Freshness compared against
  `Date.now()` was arithmetically right and practically dead: `Date.now()` is
  no reactive dependency, so the derived never re-ran and a green dot outlived
  its window for as long as the tab stayed open. `PlaceOrderPanel`, mounted
  unconditionally by the app shell, now holds a 30-second `startClock()` tick
  that moves one number — no request, no venue, no verdict.
- A refused or unreachable account is not re-read in a loop. `ensureCurrent`
  only short-circuits on `verified`, and the effects that call it read the
  credential fields to stay reactive, so a `RETRY_FLOOR_MS` window holds off a
  *repeat*. A freshly pasted key is not a repeat and is read immediately —
  otherwise a rotation would sit unverified for the rest of the window.
- `PositionsSidebar` records the verdict of the read it already performs
  (`readIssued` + `recordSuccess` / `recordFailure`, released in a `finally` so
  a coalesced or superseded read cannot wedge the account). One snapshot of the
  three credential strings serves both the claim and the signed request, so the
  in-flight state and the verdict can never describe two different key sets. It resolves its
  subject through the store's own `subjectFor` rather than from
  `activeAccountId` directly: those two can disagree, and a verdict filed under
  an id that does not own the keys is one nothing can find again. Its
  credential guard is the same `hasCompleteCredentials` the transports use, so a
  Bitget set without a passphrase stops asking rather than being told no.
- `verifyAccount()` is the fallback read for the two cases where no report is
  coming: the sidebars are hidden (`PositionsSidebar` renders only under
  `showSidebars`) or the trader never opens the positions panel. Same signed
  `/api/account` path, the account's own credentials, no order placed. It drops
  its own verdict if the session rotated or a newer read already landed.
- `AccountCard` shows green only for `verified`; `verifying` and `stale` are
  amber, `rejected` is red, and every state carries an accessible name. Only
  `verifying` pulses: a pulse promises that waiting will answer the question,
  which is true of a read in flight and false of an expired verdict.
- `PlaceOrderPanel` disables live entry unless the account is `verified`, and
  says why. That includes `unconfigured`, which a first cut waved through on the
  argument that "no credential" cannot coexist with a live balance — it can,
  because `accountState` keeps its balance hydrated after the key fields are
  cleared and the sidebar is what hydrates it. An account nobody has read is
  exactly the "unknown" AC4 names. The two situations get different sentences:
  a trader with no key is told to add one, not that a check is running.
  `rejected` stays open on purpose — the gate has the venue's own refusal, which
  names the actual problem better than this panel could. Paper mode is exempt
  throughout (AC5).
- The message branches on `credentialPresence`, not on the status. `unconfigured`
  also covers a complete credential set that nobody has read yet — the ordinary
  state before a first read, and the state of every account for a moment after a
  session rotation — and telling *those* traders they have no credentials would
  be the one sentence that is wrong exactly when it is most likely to be read.
  Presence is a separate question and is asked separately.
- A venue that could not be reached wears the connection colour, not the
  rejection one. The label had made that distinction and the dot had not, so a
  network blip drew the same red as a refused key and contradicted the words
  beside it. Amber is a connection state; red is an accusation. `PlaceOrderPanel` is mounted unconditionally by the app
  shell, so its `ensureCurrent()` effect is the app-lifecycle trigger — no
  polling timer.
- `resetAccountSession` invalidates every verdict, so switching accounts and
  back does not find the previous account's green dot waiting.

Two boundaries, both deliberate: paper mode never consults the store (AC5), and
a `rejected` credential is left to the gate, which can name the venue's own
reason where the panel could only say "unverified".

## Acceptance criteria

- [x] Bogus nonempty credentials never produce a verified green state.
- [x] Verification is account-specific and key edits return the state to stale/unverified.
- [x] Public WebSocket connected plus private account failed displays both states accurately.
- [x] Live order entry is disabled or clearly blocked while private account state is unknown or stale. Includes `unconfigured`: an account with no verdict and an account with no credential are both unknown.
- [x] Paper mode does not require exchange credentials.
- [x] Tests cover unconfigured, verifying, verified, rejected, stale, and edit transitions.

## Out of scope

- Credential storage encryption and device-key loss covered by BUG-0053.
- Public market WebSocket connection status.
- New authentication protocols.

## Links

- `src/components/settings/AccountCard.svelte:58-65`
- `src/components/settings/AccountCard.svelte:93-103`
- `src/components/shared/ConnectionStatus.svelte:22-55`
- `src/components/results/PlaceOrderPanel.svelte:171-178`
- `src/stores/accountVerification.svelte.ts` — the verdict store
- `src/services/accountSession.svelte.ts` — verdict invalidation on rotation
- Existing coverage: BUG-0059; it fixed swallowed account-fetch errors but not a trustworthy credential verification state.
