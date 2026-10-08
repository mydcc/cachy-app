---
id: BUG-0657
title: Load contract cannot see a core/display section swap or a dropped secrets assignment
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
assignee: opencode
---

# BUG-0657 — Load contract cannot see a core/display section swap or a dropped secrets assignment

Follow-up to the FEAT-0342 review swarm (H1, H2). Both halves of the load
path that the schema does not own are unpinned: the section routing into the
apply drivers, and the secrets assignments in `load()`.

## Symptom

Two silent regressions stay green:

1. Swapping the section arguments of the apply drivers (`loadSchemaEntries("core")`
   vs `("display")` in `settings.svelte.ts:1558/1564`) reloads every section
   from defaults. The contract test still passes.
2. Deleting the `isEncrypted` / encrypted-blob assignments in `load()`
   (`settings.svelte.ts:1369-1373`) loads an encrypted profile as
   unencrypted. The contract test still passes.

Neither is a live defect today — both are guard holes over Class-A data
(Settings, credentials-adjacent flags).

## Evidence

**Derived**, verified against `develop` (`8af24c67b`):

- *Section swap.* `loadContract.test.ts` ("wires each apply driver to its
  schema section") matches `/loadSchemaEntries\(\s*\)/` after `stripNonCode`
  removes the string literals — the test's own comment admits the section
  argument is invisible and section routing is "pinned by the schema test",
  which only checks the table, not the call sites. Both drivers collapse to
  the same assertion.
- *Secrets assignment.* `isEncrypted`, `encryptedAccountKeys`,
  `encryptedSecrets`, `encryptedProviderConfigs` all carry `load: null`
  (`persistenceSchema.ts:110-112,145`) and are not in `LOAD_BODY_KEYS`
  (`:261-265`), so the "assigns every other declared key" assertion never
  sees them. `NOT_A_PLAIN_ASSIGNMENT` is pinned empty, closing the last
  back door. The existing `settings.security.test.ts` / `storage_hardening`
  tests pin encrypt/unlock/restore *behaviour*, not the contract — they do
  not fail if the schema keeps claiming full coverage while `load()` drops
  a line.

## Cause

The schema contract covers the table, not the wiring: neither the section
arguments at the two call sites nor the `load: null` keys' actual assignment
in `load()` are asserted anywhere.

## Fix

- Pin the section identity per driver *before* the strip (or add a runtime
  round-trip with a sentinel core key plus a sentinel display key).
- Pull the secrets assignments into the contract: a second secrets key list
  next to `LOAD_BODY_KEYS`, or an explicit test that a stored encrypted
  profile still loads encrypted — and document whichever keys stay
  deliberately out of contract with an owner test.

What to leave alone: the `load: null` design itself and the secrets-loader
behaviour. This item adds pins, not new load semantics.

## Acceptance criteria

- [x] A test fails when the `loadSchemaEntries` section arguments of the two apply drivers are swapped (`routes each apply driver to its own section` — proven red by swap)
- [x] A test fails when the `isEncrypted` / encrypted-blob assignment in `load()` is removed (`assigns the encryption flag and blobs` — proven red per key; covers `isEncrypted`, `isLocked`, `encryptedAccountKeys`, `encryptedProviderConfigs`, `encryptedSecrets`. Note the pin proves the lines exist, not that the conditional `encryptedSecrets` line fires)
- [x] Both tests pass with the fix; `loadContract`, `persistenceContract`, `settings.security`, `storage_hardening` suites stay green

## Links

- FEAT-0342 (origin of the schema; H1/H2 in the review swarm)
- `src/stores/settings.loadContract.test.ts`, `src/stores/settings/persistenceSchema.ts`, `src/stores/settings.svelte.ts`
