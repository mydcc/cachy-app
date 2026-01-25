# Status- & Risiko-Bericht

Datum: 2026-05-21
Reviewer: Jules (Senior Lead Developer)
Scope: Systematische Wartung & Hardening

## 🔴 CRITICAL (Sofortiger Handlungsbedarf)

### 1. Gefährliche "Close All" Logik
- **Datei:** `src/services/tradeService.ts`
- **Problem:** Die Methode `closePosition` verwendet `new Decimal(999999)` als Default-Menge.
- **Risiko:** Bei High-Supply Token (z.B. SHIB, PEPE) führt dies zu unvollständigen Schließungen. User bleiben exponiert.
- **Empfehlung:** Ersetzen durch `Number.MAX_SAFE_INTEGER` oder Implementierung eines expliziten "Close All" Flags/Logik.

### 2. Latentes Memory Leak Risiko
- **Datei:** `src/stores/market.svelte.ts`
- **Problem:** `metricsHistory` wird im (derzeit auskommentierten) `snapshotMetrics` Code ohne Größenbeschränkung befüllt.
- **Risiko:** Zukünftige Aktivierung führt zu Absturz.
- **Empfehlung:** Array-Größe (Slice) erzwingen (Ring Buffer Pattern).

## 🟡 WARNING (Stabilität & UX)

### 1. Fehlende Lokalisierung (i18n)
- **Problem:** Hardcoded Strings in `NewsSentimentPanel.svelte`, `CloudTab.svelte`, `GeneralInputs.svelte`.
- **Risiko:** Inkonsistente UX.

### 2. Heuristische Timestamp-Erkennung
- **Datei:** `src/utils/utils.ts`
- **Problem:** `parseTimestamp` nutzt `< 10 Mrd` Grenzwert für Sekunden-Erkennung.
- **Risiko:** Edge-Cases bei fehlerhaften API-Daten.

### 3. WebSocket "Fast Path" Validierung
- **Datei:** `src/services/bitunixWs.ts`
- **Problem:** Direkter Property-Zugriff ohne Optional Chaining im High-Frequency Pfad.
- **Risiko:** Runtime-Crash bei malformed Dataframes.

## 🔵 REFACTOR (Technische Schuld)

1. **Redundante Validierungslogik:** `tradeService.ts` vs `api/orders/+server.ts`.
2. **Error Swallowing:** `marketAnalyst.ts` fängt Fehler stumm ab.
