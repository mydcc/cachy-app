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

~~**"The gate refuses an order whose target account differs from the displayed
one, with a test."**~~ **Withdrawn — see the correction below.** The original
audit read `accountFingerprint`, saw that it derives from the API key itself,
and concluded that two accounts on one venue already produce different
fingerprints. That much is true. It is also not the question.

~~**"Switching clears cached account state rather than blending it."**~~
**Half true.** `appEffects.svelte.ts:19-24` does force
`connectionManager.switchProvider(..., { force: true })` when the credential
string changes. But its own comment says what it does not do: it
"deliberately fingerprints only the credentials of the active venue, not
`activeAccountId`", and defers the account switch to this item. And a
reconnect is not a clearing — whether `accountState` is emptied rather than
reconnected-around is still owed, along with the test.

## Correction — 2026-09-03

The "already satisfied" line above was wrong, and it was wrong in the
direction that costs money. Recording why, because the mistake is instructive:
**the audit checked the comparison and never checked the selection.**

### The gate cannot see a wrong account, because both sides ask the same question

`accountForExchange` (`src/stores/settings/accounts.ts:142-147`) resolves a
venue, not an account:

```ts
accounts?.find((account) => account.exchange === exchange)
```

First match wins. `activeAccountId` is persisted, migrated and repaired by
FEAT-0333 — and **no production code reads it to select credentials.** Every
credential read in the app goes through `keysForExchange(accounts, venue)`.

Which means the gate's two sides are not two derivations:

| | expression |
|---|---|
| pass — `tradeService.ts:601-604` | `keysForExchange(settingsState.accounts, settingsState.apiProvider)` |
| transmit — `tradeService.ts:223-234` | `keysForExchange(settingsState.accounts, settingsState.apiProvider)` |

Character for character the same call. It is a **re-read**, not a second
derivation, and FEAT-0011 sets its own bar against exactly that
(`orderGate.ts:27-31`): *"A check that reads the same variable the payload was
built from proves nothing — the value has to be derived a second way."* Size
and price honour that bar. The account does not.

The re-read still has value: it catches a *temporal* change, where the user
edits keys or flips venue between the click and the send. That is worth
keeping. It is simply not the check the acceptance criterion asks for.

### The failure this item ships if nothing changes

The moment a second Bitunix account exists and is made active:

1. The UI shows account B active (`activeAccountId === "B"`).
2. `displayedAccount()` resolves the venue → **account A's key** → fingerprint of A.
3. `signedRequest` makes the same call → **account A's key** in `X-Api-Key`.
4. `assertGatePass` compares A against A. **No refusal.**

The order executes on account A while the screen says B. That is this item's
own Proposal — "unrecoverable and entirely silent" — arrived at by shipping
the feature without touching the selector. It is a defect *created by* this
item, not inherited, which is why it belongs here and not in a bug.

### What that makes the actual work

1. **Selection must resolve `activeAccountId`**, not the venue. This is the
   whole item; everything else follows.
2. **The gate needs a genuinely second derivation of the account** — an
   account *id* carried in `DisplayedState` from the UI's own active-account
   indicator, compared in `assertGatePass` against the id the transport
   resolved. Two roots, not one expression read twice.
3. **The reconnect must key on the account**, and clearing must be shown to be
   clearing.

Test coverage is also thinner than "twelve references" suggested:
`orderGate.test.ts` has one positive round-trip, **two** negative account tests
(`:759-769` provider changed, `:771-781` key changed) — both driven by
hand-mutating the `TransportContext`, never by store state — and four unit
tests of `accountFingerprint` itself. **No test exercises two accounts on one
venue.**

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
