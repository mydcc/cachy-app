---
id: FEAT-0026
title: Support several exchange accounts with an unmistakable active one
type: feature
status: in-progress
assignee: claude
branch: feat/feat-0026-multi-account
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0016, FEAT-0333]
estimate: 3
size: M
target_date: 2026-12-21
start_date: 2026-11-17
---


# FEAT-0026 — Support several exchange accounts with an unmistakable active one

## Problem

One set of credentials at a time. Traders who separate strategies across
sub-accounts, or run one exchange for perpetuals and another for spot, cannot.

## Proposal

Several named accounts, each with its own credentials and exchange, switchable.

**This is a safety feature wearing a convenience feature's clothes.** The
failure mode is placing a trade on the wrong account, which is unrecoverable and
entirely silent. So:

- the active account is unmistakable wherever an order can be placed — not only
  in a header
- switching accounts is an action with a confirmation by default
      ([`FEAT-0024`](FEAT-0024-confirmation-policy.md))
- the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate verifies the
  target account against the displayed one, which is already in its checked set
- positions, orders and balances are never mixed across accounts in a view
  without labelling

Credentials remain Class A, one encrypted entry per account under the existing
master-password scheme.

**The storage shape is no longer part of this item.** Converting `apiKeys` and
`encryptedApiKeys` to a named-account list, with its migration and its restore
path, is [`FEAT-0333`](FEAT-0333-account-storage-shape.md) and lands first,
changing nothing a user can see. What remains here is the feature: the second
account, the switch, the confirmation, and making the active one unmistakable.

## Acceptance criteria

- [ ] Several accounts can be configured, named and switched
- [ ] Each account's credentials are encrypted independently — the shape and
      its migration are [`FEAT-0333`](FEAT-0333-account-storage-shape.md); this
      item only adds the second account to it
- [ ] The active account is visible on every order-placing surface
- [ ] The verification gate refuses an order whose target account differs from
      the displayed one, with a test
- [ ] No view shows data from two accounts without labelling
- [ ] Switching clears cached account state rather than blending it, with a test
- [ ] German and English strings

## Audit — 2026-09-02

Sized `S`/2 when specced. That is wrong by a wide margin, and the reason is
worth recording rather than just corrected: the *runtime* is already
account-aware, and only the *storage* is not. The two look alike from a
distance.

### Already satisfied

**"The gate refuses an order whose target account differs from the displayed
one, with a test."** Done, and it works for several accounts on one venue
today. `accountFingerprint(apiKey)` derives the fingerprint from the API key
itself — `abcd…wxyz` — so two accounts on the same exchange already produce
different values. `orderGate.ts` compares the pass's fingerprint against the
transmit-time one and refuses with `mismatch("account", …)`; `orderGate.test.ts`
carries twelve references to it.

**"Switching clears cached account state rather than blending it."** The
mechanism exists and fires on the right event. `appEffects.svelte.ts` tracks
`lastKeys` alongside `lastProvider` and forces
`connectionManager.switchProvider(..., { force: true })` when *either* changes —
a key change is a key change whether it came from switching venue or switching
account. What is missing is the test the criterion asks for, and a check that
`accountState` itself is cleared rather than only the socket reconnected.

### The actual work

`apiKeys` is venue-indexed, one account per exchange:

```ts
apiKeys: { bitunix: ApiKeys; bitget: ApiKeys };
encryptedApiKeys?: { bitunix?: EncryptedBlob; bitget?: EncryptedBlob };
```

Both shapes have to become a list of named accounts, each carrying its own
exchange. That is the item, and everything else follows from it:

- **13 production files read `apiKeys`** — including both WebSocket services,
  `syncService`, `entitlement`, `secretsLoader` and `backupService`. Most index
  it by provider and would index by active account instead.
- **The active account has to be visible on every order-placing surface**, which
  is new UI rather than a rename: today the venue is shown, and one venue meant
  one account.
- **Switching gets a confirmation.** `account-switch` is already in
  FEAT-0024's catalogue, defaulted on and ungated — the toggle exists and
  nothing consults it, exactly as `margin-mode-change` did before FEAT-0020.

### The migration question, unanswered

This is the part that makes it `L` rather than `M`, and it should be settled
before code is written. Existing users have credentials in the old shape in
three places, and all three have to keep working:

1. `encryptedApiKeys.bitunix` / `.bitget` in `localStorage`, encrypted under the
   master password.
2. `secretsLoader.ts`, which decrypts them at startup.
3. **Backups taken before the change.** `backupService.ts` validates the
   `apiKeys` structure on restore, so a backup written today must still restore
   after the shape changes — and a backup written after must not silently lose
   accounts when restored by an older build.

A migration that drops a credential leaves a trader locked out of an exchange;
one that mis-assigns it places orders on the wrong account, which this item's
own Proposal calls "unrecoverable and entirely silent". Neither is acceptable
as a discovery made during implementation.

### The split, carried out — 2026-09-02

Done rather than suggested. The storage half is
[`FEAT-0333`](FEAT-0333-account-storage-shape.md): it converts the shape, brings
its own migration and restore path, keeps exactly one account per venue and
changes no behaviour, so it can be reviewed against real encrypted blobs with
nothing else in the diff. This item keeps the feature half and now depends on
it.

The `8` did not shrink, it moved: `5` to the shape change, `3` to what is left
here. Bundled, the risky half would have been reviewed alongside the visible
half, and the visible half is the one a reviewer's eye goes to.

## Links

- `src/stores/settings.svelte.ts` — `SENSITIVE_KEYS`, encryption
- `src/stores/account.svelte.ts`
- `src/stores/settings/secretsLoader.ts` — startup decryption
- `src/services/backupService.ts` — restore-side structure check
- `src/services/appEffects.svelte.ts` — the existing key-change reconnect
- [`FEAT-0333`](FEAT-0333-account-storage-shape.md) — the storage shape, first
- [`FEAT-0024`](FEAT-0024-confirmation-policy.md) — `account-switch` awaits wiring
