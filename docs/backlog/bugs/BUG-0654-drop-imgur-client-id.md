---
id: BUG-0654
title: The imgurClientId setting has no consumer and has never had one
type: bug
status: in-progress
assignee: opencode
branch: fix/drop-dead-settings-fields
priority: P3
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
---

# BUG-0654 — The imgurClientId setting has no consumer and has never had one

## Symptom

A settings field, a type, a translation key and an export scrub, for a feature
that does not exist. Nothing reads it, so nothing can show it, so the scrub on
export protects nothing.

## Evidence

**Derived, then confirmed by exhaustive search.**

Every reference to the name in the repository, excluding its own tests:

| site | what |
|---|---|
| `src/stores/settings/settingsTypes.ts` | `imgurClientId?: string` on `Settings` |
| `src/stores/settings.svelte.ts` | the `$state` field, its merge step, its `toJSON()` entry |
| `src/services/backupService.ts` | `parsed.imgurClientId = ""` on export |
| `src/locales/locales/{de,en}.json` | `"imgurClientId": "Imgur Client ID"` |
| `src/locales/schema.d.ts` | the generated key type |

No service, no component, no API call. `git log --all -S "imgurClientId" --
"*.svelte"` returns commits that only touched the type and the locale files —
never a binding. There is no imgur integration to have lost a binding.

The field is also **not** in `SENSITIVE_KEYS` (`src/stores/settings/secretsLoader.ts`),
which lists `imgbbApiKey` among the credentials to blank. `imgurClientId` was
blanked by a separate hand-written line, so it was classified as sensitive once,
manually, with no inventory behind it.

The similarly named `imgbbApiKey` **is** live — bound in
`src/components/settings/tabs/ConnectionsTab.svelte`, read by
`src/components/shared/JournalContent.svelte`, and listed in `SENSITIVE_KEYS`.
The two names are one letter apart in meaning and none in code.

## Cause

A setting that was declared for a planned integration and never wired. The
declaration alone is cheap and invisible: the field has no default, so it never
appeared in a diff of behaviour, and `backupService` blanked it on the assumption
that anything it touched might be sensitive — which is what kept it looking
maintained.

## Fix

Remove the field and everything that exists only to carry it: the `Settings`
member, the `$state` declaration, the merge step, the `toJSON()` entry, and the
translation in both locales. Regenerate `src/locales/schema.d.ts`.

**The export scrub stays.** This is the one part that looked removable and is
not. `getBackupPayload()` serialises the **raw `localStorage` string** via
`getValidatedData(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY)` — not `toJSON()`. A
profile written before the field is removed still carries the key in storage,
and without the scrub that value would land in an unencrypted backup in
cleartext. Removing the scrub was tried and reverted: it turns
`backupService.test.ts` red with `expected 'imgur-client-id' to be ''`.

A stored blob carrying the key is otherwise harmless — `load()` deep-merges the
parsed object over the defaults and no code reads the key.

## Acceptance criteria

- [x] The field, its type, its `$state` declaration, its merge step and its
      `toJSON()` entry are gone
- [x] The translation is gone from both locales and `schema.d.ts` is regenerated
- [x] The export scrub **remains**, with a comment saying why
- [x] `SENSITIVE_KEYS` unchanged — `imgbbApiKey` is a different, live field
- [x] `backupService.test.ts` still green, with the legacy key stripped
- [x] The persistence contract guard no longer needs an entry for this key
- [ ] Settings, backup and i18n suites pass (final run)

## Links

- `src/services/backupService.ts` — the export scrub being removed
- `src/stores/settings/secretsLoader.ts` — `SENSITIVE_KEYS`, which never had it
- BUG-0652 — made the declared key set checkable, which is how this surfaced