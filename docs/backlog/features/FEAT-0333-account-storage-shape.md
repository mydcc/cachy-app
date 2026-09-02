---
id: FEAT-0333
title: Store credentials as a list of named accounts, without changing behaviour
type: feature
status: done
shipped: 1.6.0-beta.207
assignee: claude
branch: feat/feat-0333-account-storage-shape
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0016]
estimate: 5
size: M
start_date: 2026-09-02
target_date: 2026-11-16
---

# FEAT-0333 — Store credentials as a list of named accounts, without changing behaviour

## Problem

A trader cannot run two accounts on one exchange, and the reason is not the
user interface. It is the stored shape, which has exactly one slot per venue:

```ts
apiKeys: { bitunix: ApiKeys; bitget: ApiKeys };
encryptedApiKeys?: { bitunix?: EncryptedBlob; bitget?: EncryptedBlob };
```

Everything [`FEAT-0026`](FEAT-0026-multi-account.md) wants to build sits on top
of that shape. Its [audit](FEAT-0026-multi-account.md#audit--2026-09-02) found
the runtime already account-aware — the gate distinguishes two accounts on one
venue today — so this is the one genuinely missing piece, and also the only
part that can lose a credential.

## Proposal

Convert both shapes to a list of named accounts, each carrying its exchange,
and **change nothing a user can see.** The migration creates exactly one
account per venue, named after it. No second account, no switch, no new UI —
those are [`FEAT-0026`](FEAT-0026-multi-account.md).

This is split out from that item precisely so it can be reviewed alone. A
migration that drops a credential locks a trader out of an exchange; one that
mis-assigns it places orders on the wrong account, which FEAT-0026's own
Proposal calls "unrecoverable and entirely silent". That failure mode deserves
a pull request that contains nothing else to look at.

The readers the audit counted — 13 production files, including both WebSocket
services, `syncService`, `entitlement`, `secretsLoader` and `backupService` —
resolve through **one accessor** that returns the active account for a venue,
rather than each learning the new shape. The diff stays mechanical and the next
item has one place to make "active" mean something.

### Three paths that must keep working

1. **`localStorage`** — `encryptedApiKeys.bitunix` / `.bitget`, encrypted under
   the master password. Each blob keeps its own ciphertext; migration rewrites
   the index around it, never the encryption, so no master-password prompt is
   needed to migrate.
2. **Startup decryption** — `secretsLoader.ts` reads the new shape, and the old
   one for as long as an unmigrated profile can exist.
3. **Backups** — `backupService.ts` validates the `apiKeys` structure on
   restore. A backup written before the change must still restore after it,
   **and** a backup written after must be refused with a named error by a build
   that predates the change, rather than restoring a subset of it. That means a
   version field in the payload, not a shape sniff.

Names are derived from the venue at migration time. Renaming arrives with the
UI in FEAT-0026; inventing a naming dialog here would be the behaviour change
this item exists to avoid.

## Acceptance criteria

- [x] `apiKeys` and `encryptedApiKeys` are a list of named accounts, each
      carrying its exchange
- [x] Credentials written by the pre-change build decrypt after migration —
      `settings.security.test.ts` keeps its fixtures in the *old* shape, so
      those tests now drive the migration end to end through the store
- [x] The migration is idempotent — running it twice leaves one account per
      venue, with a test
- [x] No path drops or re-assigns a credential: tests assert venue → key
      identity across migration, startup decryption and restore
- [x] A backup taken before the change restores after it
- [x] A payload written by a **newer** build is refused whole rather than
      partially restored — `CREDENTIAL_SCHEMA_VERSION`, see the amendment below
- [x] The readers index through one accessor rather than by provider
- [x] Behaviour is unchanged: no new UI, no switch, exactly one account per
      venue after migration
- [x] No new user-facing string — the refusal reuses the existing whole-restore
      rejection, which already names the section and applies no changes

## Amendment — 2026-09-02, during implementation

Two criteria as written could not be met as written, and both are worth
recording rather than quietly reinterpreting.

**"Refused by a build expecting the old shape."** Not achievable: a shipped
build cannot be taught anything by a later change. Its validator does have a
hook that could be provoked into rejecting — writing `apiKeys` as an array —
but that is a trick a later maintainer removes as junk, precisely because
nothing explains it. What ships instead is `CREDENTIAL_SCHEMA_VERSION`, which
lets *this* and every future build refuse a payload it does not understand.
An older build restoring a version-2 backup gets no credentials and the user
re-enters them; nothing is lost at the exchange. That is the residue, and it
is the part a forward-only change cannot fix.

**"German and English strings for the restore-refusal error."** No new string
is needed: `validateSettings` returning false already routes into the existing
whole-restore rejection, which names the section and states that no changes
were applied. Adding a second message would have been a string written to
satisfy a checklist. That existing message is itself hardcoded English rather
than translated — a pre-existing gap, filed as [`BUG-0354`](../bugs/BUG-0354-backup-rejection-message-untranslated.md).

## Out of scope

- **A second account on any venue**, the switch, the confirmation and the
  active-account UI — all [`FEAT-0026`](FEAT-0026-multi-account.md).
- **Re-encrypting credentials.** The blobs are carried over as they are.
- **Renaming an account.** Migration names it after its venue; editing comes
  with the UI.

## Open questions

None blocking. The naming question is answered above deliberately, so this item
can reach `ready` without waiting on a UI decision.

## Links

- [`FEAT-0026`](FEAT-0026-multi-account.md) — the feature half, blocked on this
- `src/stores/settings.svelte.ts` — `SENSITIVE_KEYS`, encryption
- `src/stores/settings/secretsLoader.ts` — startup decryption
- `src/services/backupService.ts` — restore-side structure check
- `src/services/appEffects.svelte.ts` — the existing key-change reconnect
