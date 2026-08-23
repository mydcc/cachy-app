# Fix: Device-Key-Verlust sichtbar machen (Decryption failed / Sentiment 401)

## Kontext (Diagnose)

- API-Keys liegen AES-GCM-verschlüsselt im localStorage (`encryptedSecrets`), der Entschlüsselungs-Key (nicht-extrahierbarer CryptoKey) in **IndexedDB**.
- IndexedDB des Users hat den Key verloren (Eviction/partielles Clear) → jeder Decrypt failt mit `OperationError` → alle SENSITIVE_KEYS leer → `/api/sentiment` geht mit leerem Key raus → 401.
- Canary `_deviceKeyCanary` existiert im Datenmodell, wird aber **nie ausgewertet**.
- Vorhanden, aber unzureichend: generischer Banner bei `decryptionFailures > 0` in AiTab + ConnectionsTab.

## Änderungen

### 1. `src/stores/settings/secretsLoader.ts`
Neue Methode nach `applyApiKeys`:

```ts
async isDeviceKeyLost(encryptedSecrets): Promise<boolean>
```
- Canary-Blob `_deviceKeyCanary` suchen; ohne Canary → `false` (Legacy-Daten, kein Fehlalarm)
- Mit Canary: `getDeviceKey()` + `cryptoService.decrypt(canary, deviceKey)`; Fehler → `true`

### 2. `src/stores/settings.svelte.ts`
- Neues Feld neben `decryptionFailures` (~Zeile 870):
  `deviceKeyLost = $state(false);` mit Doc-Kommentar (Unterschied zu decryptionFailures)
- In `load()`, Obfuscation-Zweig (`if (!this.isEncrypted)`):
  - Parallel zum decryptSecrets-Task: `isDeviceKeyLost(this.encryptedSecrets).then(lost => this.deviceKeyLost = lost)`
  - Im `.then((failures) => …)` von decryptSecrets: `if (failures === 0) this.deviceKeyLost = false;`

### 3. UI – Banner in AiTab + ConnectionsTab erweitern
Bedingung `{#if settingsState.decryptionFailures > 0 || settingsState.deviceKeyLost}`; Titel/Text:
```svelte
{settingsState.deviceKeyLost ? $_("settings.deviceKeyLostTitle") : $_("settings.decryptionWarningTitle")}
{settingsState.deviceKeyLost ? $_("settings.deviceKeyLostDesc") : $_("settings.decryptionWarningMessage")}
```
Keine Inline-Fallbacks bei den neuen Keys. Struktur/Klassen des bestehenden Blocks (warning-color, bg-secondary) unverändert übernehmen.

### 4. i18n
Keys unter `"settings"` (nahe `decryptionWarning*`, beide Dateien + schema.d.ts):
- `de.deviceKeyLostTitle`: „Verschlüsselte Schlüssel nicht lesbar"
- `de.deviceKeyLostDesc`: „Der Geräteschlüssel wurde vom Browser entfernt. Bitte alle API-Schlüssel neu eingeben, um sie wieder zu verschlüsseln."
- `en.deviceKeyLostTitle`: "Encrypted keys unreadable"
- `en.deviceKeyLostDesc`: "The browser lost the device key. Please re-enter all API keys so they can be re-encrypted."

### 5. Tests

**Neu `src/stores/settings/secretsLoader.test.ts`** (Mock-Stil aus settings.load.test.ts):
1. Canary fehlt → `isDeviceKeyLost === false`
2. Canary-Decrypt rejectet → `true`
3. Canary-Decrypt resolved → `false`

**Erweitern `src/stores/settings.load.test.ts`:**
4. `decrypt` rejected + Canary vorhanden → nach `await settingsState.secretsReady` gilt `settingsState.deviceKeyLost === true`

## Verifikation

- `npx vitest run src/stores/settings/secretsLoader.test.ts src/stores/settings.load.test.ts src/stores/settings.security.test.ts`
- `npm run check`
- Commit `fix(settings): surface device key loss with actionable warning`, Push, PR gegen develop

## Out of Scope
- Kein Auto-Löschen der unlesbaren Blobs
- Kein Reset-Button (separat entschieden)
- Bitget-Pfad des Klines-Proxys bleibt ohne Retry
