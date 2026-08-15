---
id: FEAT-0200
title: Encrypt API keys and other secrets at rest in localStorage
type: feature
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: ADR-0001
depends_on: []
---

# FEAT-0200 — Encrypt API keys and other secrets at rest in localStorage

## Problem

Per ADR-0001, Class A data (exchange API keys/secrets, AI-provider keys such
as OpenAI/Gemini/Anthropic/OpenRouter, ImgBB/News/CMC keys) is stored
exclusively in `localStorage` and never sent to a server — that part is
correct and intentional. What ADR-0001 does not settle is *how* it is stored
there: today it is plain cleartext (`StorageHelper.safeSave`,
`src/utils/storageHelper.ts`), flagged by CodeQL as
`js/clear-text-storage-of-sensitive-data` (alerts #31, #32, dismissed as
"by design, tracked separately" pointing at this item).

Cleartext-in-localStorage is a real, non-hypothetical exposure for a
money-touching app: a malicious/compromised browser extension can read
localStorage directly, disk/forensic access to the browser profile recovers
the keys in plain, and a support screen-share or accidentally-shared
localStorage dump leaks them outright. None of this requires an XSS bug in
Cachy itself.

## Proposal

Encrypt secret fields with WebCrypto before they reach `localStorage.setItem`,
decrypt only at the point of use (building a signed exchange request, calling
an AI provider). The encryption key must not itself be recoverable from a
plain localStorage/disk read — e.g. derived from a session PIN/passphrase the
user enters once per session (non-extractable `CryptoKey`, kept in memory
only), rather than a key that is itself stored next to the ciphertext.

This raises the bar against the threats above (extension scraping, disk
forensics, accidental dumps) without pretending to defend against XSS inside
Cachy's own page — no purely client-side scheme can, since the decrypting
code and the attacker's injected code would run with the same privileges.
That ceiling is worth stating explicitly so this item isn't scoped to solve
an unsolvable problem.

## Acceptance criteria

- [ ] Exchange API keys/secrets and AI-provider keys are encrypted before
      `localStorage.setItem` and decrypted only where used.
- [ ] The decryption key is not recoverable from a static read of
      localStorage alone (derived from an in-memory-only session secret).
- [ ] Existing plaintext entries from earlier versions are migrated
      (encrypted in place) rather than silently discarded — see
      `docs/backlog/bugs/BUG-0182-epic-decimal-migration-rust.md` and its
      siblings for the project's precedent on not discarding user data
      across a schema change.
- [ ] `npm run check` and the full test suite pass.

## Out of scope

- Defending against XSS within Cachy's own page — not achievable client-side,
  see Proposal.
- Moving secrets off-device or through a server — would violate ADR-0001's
  Class A boundary.
- A native OS-keychain integration (Electron/Tauri) — worth revisiting if
  Cachy ever ships as a desktop wrapper, not applicable to the current
  browser-only build.

## Open questions

- Session-PIN UX: prompt once per browser session, or time out after
  inactivity? Affects how often a trader has to re-enter it mid-session.
- Whether to encrypt only the known secret fields (API keys) or all of
  Class A data — journal/notes are also Class A per ADR-0001 but are not
  flagged by CodeQL here since they aren't obviously "sensitive" to a
  static analyzer; worth a human judgment call on scope.

## Links

- `docs/adr/0001-local-first-boundary.md`
- `src/utils/storageHelper.ts`
- CodeQL alerts #31, #32 (dismissed, tracked here)
