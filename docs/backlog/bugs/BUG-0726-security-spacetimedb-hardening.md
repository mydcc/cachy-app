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

> **State note.** Fixed on `fix/security-spacetimedb-hardening` (worktree
> `.worktrees/sec-audit-2`, PR pending). All seven findings are addressed as
> far as the module model allows:
>
> 1. **Client-only auth** is inherent: SpacetimeDB issues an identity to every
>    connection. Documented in `docs/GLOBAL-CHAT.md` §8 and at
>    `clientConnected`; the global cap is the abuse mitigation.
> 2. **Identity-rotation bypass** — a global cap of 60 messages/minute lives in
>    a reserved `__global__` row of the existing `sender_activity` table (no
>    schema change). Per-sender and global decisions are evaluated before
>    either counter is written.
> 3. **Empty/whitespace** — `sanitizeMessageText` trims, strips C0/C1 and
>    U+2028/U+2029, and rejects an empty result in the reducer;
>    `cloudService.sendMessage` refuses locally too.
> 4. **Stored XSS** — text interpolation only, with a comment at the render
>    site and `src/tests/security/chat_rendering.test.ts` pinning the chat-log
>    block against an HTML directive.
> 5. **`cloudEnabled`** — `connect()` refuses while the opt-in switch is off,
>    even for a direct caller.
> 6. **Transport** — `https://` required for remote hosts, `http://` only for
>    loopback; shared `cloudHost.ts` enforces it in the service and the settings
>    tab warns before Connect.
> 7. **Scheduled reducer** — documented as public; it only deletes rows past
>    the retention window, so an early call is a no-op.
>
> Residual: server-side authentication is impossible in the current module
> model; the global cap reduces flooding but is not access control. The reducer
> change needs a module republish, not a schema migration.
>
> Verification: 52 tests across the reducer, host policy, cloud service and
> chat rendering; `tsc --noEmit` clean; ESLint clean; translation check passes;
> `npm run backlog:check` — 613 items valid.

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
