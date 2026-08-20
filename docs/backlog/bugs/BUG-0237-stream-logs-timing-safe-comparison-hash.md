---
id: BUG-0237
title: Stream logs authentication leaks secret length before timing-safe comparison
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
start_date: 2026-08-18
size: XS
estimate: 1
---


# BUG-0237 — Stream logs authentication leaks secret length before timing-safe comparison

## Symptom

An attacker probing `/api/stream-logs` can determine the exact length in bytes of the server's `LOG_STREAM_KEY` environment secret by measuring response status changes before the constant-time buffer comparison.

## Evidence

**Derived** from code inspection.

In `src/routes/api/stream-logs/+server.ts`, lines 42-49:
```typescript
const secretBuffer = Buffer.from(secret);
const tokenBuffer = Buffer.from(token || '');

// timingSafeEqual throws if lengths differ, so we must check length first.
// Although checking length leaks length information, it's generally considered acceptable for API keys.
if (secretBuffer.length !== tokenBuffer.length || !crypto.timingSafeEqual(secretBuffer, tokenBuffer)) {
  return new Response("Unauthorized", { status: 401 });
}
```

In `src/lib/server/auth.ts`, this was resolved properly by hashing both tokens with SHA-256 before comparison:
```typescript
const serverHash = crypto.createHash("sha256").update(serverToken).digest();
const clientHash = crypto.createHash("sha256").update(clientToken).digest();
if (!crypto.timingSafeEqual(clientHash, serverHash)) { ... }
```
Because SHA-256 digests are always 32 bytes, `timingSafeEqual` runs unconditionally without length pre-checking, completely eliminating the length oracle.

## Cause

The stream logs route implemented direct buffer length comparison as a prerequisite for `timingSafeEqual`, which leaks length information.

## Fix

Update `src/routes/api/stream-logs/+server.ts` to compute SHA-256 digests of `secret` and `token` and compare the 32-byte digests via `crypto.timingSafeEqual`, matching `src/lib/server/auth.ts`.

## Acceptance criteria

- [ ] `GET /api/stream-logs` compares token hashes instead of raw buffer lengths.
- [ ] Valid tokens authorize successfully; invalid tokens of any length are rejected uniformly with HTTP 401.

## Links

- `src/routes/api/stream-logs/+server.ts`
- `src/lib/server/auth.ts`
