---
id: BUG-0726
title: Security: SpacetimeDB global chat hardening (auth, rate limits, input validation)
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: B
adr: ADR-0004
depends_on: []
---

# BUG-0726 — Security: SpacetimeDB global chat hardening

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

- [ ] Empty/whitespace messages rejected
- [ ] Global message cap added alongside per-sender limit
- [ ] `connect()` gated on `cloudEnabled`
- [ ] UI warns on non-localhost HTTP host
- [ ] Code comments/lint guard on chat rendering
- [ ] Documentation updated for inherent limitations
- [ ] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
