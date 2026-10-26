---
id: BUG-0726
title: Security: SpacetimeDB global chat hardening (auth, rate limits, input validation)
type: bug
status: done
assignee: opencode
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: B
adr: ADR-0004
depends_on: []
---

# BUG-0726 — Security: SpacetimeDB global chat hardening

> **State note.** The first pass merged as PR #4370
> (`fix/security-spacetimedb-hardening`); the follow-up branch
> `fix/security-chat-followup-v2` closes the remaining review gaps. All seven
> findings are addressed as far as the module model allows:
>
> 1. **Client-only auth** is inherent: SpacetimeDB issues an identity to every
>    connection. Documented in `docs/GLOBAL-CHAT.md` §8 and at
>    `clientConnected`; the global cap is the abuse mitigation.
> 2. **Identity-rotation bypass** — a global cap of 180 messages per fixed
>    60-second window lives in a reserved `__global__` row of the existing
>    `sender_activity` table (no schema change). Per-sender and global decisions
>    are evaluated before either counter is written.
> 3. **Empty/whitespace** — `sanitizeMessageText` removes formatting marks
>    (bidi controls, tag characters, variation selectors and zero-width
>    characters other than ZWJ/ZWNJ), turns a zero-width space into a word
>    break, and replaces controls, line separators and the listed blank glyphs
>    (braille blank, Hangul fillers, Egyptian blanks, bare emoji modifiers)
>    with spaces. A result with no visible character is rejected;
>    `cloudService.sendMessage` mirrors the sanitizer before the text leaves
>    the device.
> 4. **Stored XSS** — text interpolation only, with a comment at the render
>    site and `src/tests/security/chat_rendering.test.ts` pinning both chat
>    renderers against an HTML directive and `innerHTML`.
> 5. **`cloudEnabled`** — `connect()`, `sendMessage()` and
>    `deleteMyMessages()` refuse while the opt-in switch is off; turning it off
>    closes a live connection from both the chat store and the settings tab.
> 6. **Transport** — `https://` (or `wss://`) required for remote hosts,
>    `http://` only for loopback (`localhost`, `127.0.0.0/8`, `[::1]`); shared
>    `cloudHost.ts` enforces it in the service and the settings tab warns before
>    Connect.
> 7. **Scheduled reducer** — documented as public; a `__cleanup__` marker limits
>    a client-invoked run to one scan per hour, and it only deletes rows past
>    the retention window. The first run after a fresh module still scans the
>    tables.
>
> Review round: the first pass added `disconnect()`, the stronger sanitizer,
> the cleanup throttle and the wider renderer guard. A second pass added the
> settings-tab disconnect path, an identity-only connection log, the
> builder-not-called ordering assertion and a client/server sanitizer parity
> test. A third pass closed the follow-up review: formatting marks are removed
> wholesale (except ZWJ/ZWNJ), the remaining blank glyphs are covered, a late
> `onConnect` after opt-out or a superseded handshake is closed instead of
> resurrecting the socket, and the connect path refuses a parallel handshake.
> Host warnings map the actual reason and expose it via `aria-describedby`; an
> oversized raw payload is rejected before the sanitizer runs; tests assert
> that a rejection consumes neither counter and that erasure leaves the
> aggregate rows.
>
> Residual: server-side authentication is impossible in the current module
> model; the 180-per-fixed-minute global cap reduces flooding but a determined
> client can occupy it by rotating identities or erasing its own per-sender
> row (availability trade-off, documented). The first cleanup run after a fresh
> module still performs a full scan, and `delete_my_messages` is an unthrottled
> full scan that any client can call. The reducer change needs a module
> republish, not a schema migration.
>
> Verification: 103 targeted Vitest tests (reducer, host policy, cloud service,
> chat store, chat rendering and the CloudTab component); root `tsc --noEmit`
> clean; ESLint on every changed file; translation check passes;
> `npm run backlog:check` — 613 items valid. The module's own
> `tsc -p server/spacetimedb` runs in CI (the root tsconfig does not include the
> module).

## Symptom

Multiple findings in the SpacetimeDB global chat subsystem:

1. **Client-only authentication**: SpacetimeDB assigns identity to any connection. The "authenticated, no anonymous access" condition (ADR-0001) is enforced only by the client. A malicious client can connect directly and read/write global chat.

2. **Rate limit bypass via identity rotation**: Per-sender rate limit (5/10s) is bypassed by minting multiple identities.

3. **Empty/whitespace messages accepted**: No validation rejects empty messages.

4. **Stored XSS latent risk**: Message text stored verbatim; future `{@html}` rendering would introduce XSS.

5. **No client-side access control**: `cloudService` does not check `cloudEnabled` before connecting.

6. **Host user-configurable without transport validation**: Free-form host can be plain HTTP, leaking token.

7. **Scheduled cleanup reducer client-callable**: Any connected client can invoke `delete_expired_messages`.

## Evidence

**Demonstrated** for items 3, 5, 6; **derived** for items 1, 2, 4, 7. Fingerprints: `spacetimedb:auth:clientOnlyGate`, `spacetimedb:rateLimit:identityRotationBypass`, `spacetimedb:message:emptyAccepted`

## Fix

1. Document as inherent SpacetimeDB limitation; add global message caps and abuse controls.
2. Add global (not per-sender) message cap per time window.
3. Reject empty/whitespace messages: `if (text.trim().length === 0) throw`.
4. Keep text interpolation in all renderers; add lint guard; strip control chars server-side.
5. Gate `connect()` on `settingsState.cloudEnabled`.
6. Warn on non-localhost HTTP host; prefer HTTPS enforcement in UI.
7. Document scheduled reducers are public; accept as-is.

## Acceptance criteria

- [x] Empty/whitespace messages rejected
- [x] Global message cap added alongside per-sender limit
- [x] `connect()` gated on `cloudEnabled`
- [x] UI warns on non-localhost HTTP host
- [x] Code comments/lint guard on chat rendering
- [x] Documentation updated for inherent limitations
- [x] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
