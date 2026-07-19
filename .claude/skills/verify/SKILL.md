---
name: verify
description: Verifiziert Code-Änderungen mit Beweis — führt svelte-check und die betroffenen Vitest-Tests aus und meldet das Ergebnis ehrlich. Nach jeder Änderung an Svelte/TS-Dateien verwenden, oder wenn der User /verify aufruft.
---

# Verify — Evidential Verification

Ziel: Keine Änderung wird als „fertig" gemeldet ohne Beleg. Ablauf:

## 1. Geänderte Dateien ermitteln

```bash
git status --short && git diff --stat
```

## 2. Typprüfung (immer)

```bash
npm run check
```

Bei Fehlern: **stoppen**, Fehler analysieren („Fehler X entsteht durch Y"), beheben, erneut prüfen. Nicht raten.

## 3. Betroffene Unit-Tests

- Zu jeder geänderten Datei die zugehörigen Tests suchen: gleiche Basis mit `.test.ts` daneben (z. B. `src/stores/market.svelte.ts` → `src/stores/market.test.ts`, oft auch Varianten wie `market_limits.test.ts`).
- Gezielt ausführen: `npx vitest run <testdateien>`
- Bei Änderungen an zentralen Dateien (`calculator.ts`, `apiService.ts`, `bitunixWs.ts`, Stores mit vielen Abhängigkeiten) oder wenn unklar ist, was betroffen ist: kompletten Lauf `npm test`.
- Geänderte Logik ohne existierenden Test: kurz abwägen, ob ein Test ergänzt werden sollte, und das im Bericht erwähnen.

## 4. E2E (nur bei UI-Flow-Änderungen)

Wenn ein Nutzer-Flow geändert wurde (Formulare, Navigation, Journal, Rechner-Bedienung):

```bash
npm run test:e2e
```

## 5. Bericht (Deutsch)

Kurz und ehrlich:

- Welche Prüfungen liefen, mit Ergebnis (bestanden/fehlgeschlagen, Anzahl Tests).
- Fehlschläge wörtlich zitieren — niemals beschönigen oder verschweigen.
- Abschlusssatz nur, wenn alles grün ist, z. B.: „Verifiziert via svelte-check + 14 Vitest-Tests, alle bestanden."
