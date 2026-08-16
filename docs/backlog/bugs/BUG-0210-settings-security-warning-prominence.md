---
id: BUG-0210
title: Security Warning in settings is too prominent and misplaced
type: bug
status: ready
priority: P3
milestone: none
editions: [community]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0210 — Security Warning in settings is too prominent and misplaced

## Symptom

The Security Warning displayed when encrypted secrets fail to decrypt (`decryptionFailures > 0`) is shown as a massive block-level alert banner at the top of the Settings content area across all tabs. This is visually overwhelming, disruptive to the layout, and lacks actionable context on which specific keys or tabs are affected.

## Evidence

*Demonstrated* — Opening the Settings modal when `decryptionFailures > 0` shows a prominent `bg-danger-paired` alert box across every settings tab, regardless of whether that tab configures any sensitive keys.

## Cause

BUG-0053 introduced `decryptionFailures` detection and placed a global, high-prominence alert box directly in `SettingsContent.svelte` above the tab router instead of contextual, informative guidance where the affected keys actually reside.

## Fix

- Remove the global alert block from `SettingsContent.svelte`.
- Display contextual, informative warning notices within the relevant tabs (e.g. `ConnectionsTab` for exchange keys and `AiTab` for AI provider keys) when decryption fails or keys could not be loaded from storage.
- Provide clear context explaining *why* it happened (browser storage/device key loss or reset), *what* failed (saved keys could not be decrypted), and *what to do* (re-enter and save the key to restore connection).
- Ensure styling uses a subtle, informative warning layout rather than a massive layout-breaking box.

## Acceptance criteria

- [ ] Global alert box in `SettingsContent.svelte` is removed.
- [ ] Contextual, informative warnings are placed in the relevant settings tabs (`ConnectionsTab`, `AiTab`) when decryption failures occur.
- [ ] The warning copy clearly explains what happened (decryption failed due to device storage reset) and what action to take (re-entering the key).
- [ ] In tabs without sensitive keys (e.g., Visuals, System, Trading), no unnecessary security alert is rendered.

## Out of scope

- Changes to the underlying encryption, decryption, or key derivation logic (`cryptoService`, `SecretsLoader`).
- Auto-recovery or syncing of lost keys (keys must be re-entered by the user).
- Changes to other modal windows.

## Links

- Issue: #1963
- Related: `BUG-0053-device-key-loss-orphans-secrets.md`
