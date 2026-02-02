# Systematische Wartung & Hardening - Status Report (V8)

**Datum:** 2026-05-22 (Updated)
**Auditor:** Jules (Senior Lead Developer)
**Scope:** Gesamtes Repository (Fokus: `src/services`, `src/stores`, `src/components`)

## 1. Executive Summary

Die Codebasis befindet sich in einem **sehr soliden Zustand** ("High Quality"). Kritische Finanz-Logik ist durchgängig mit `Decimal.js` typisiert, und API-Antworten werden sicher geparst (`safeJsonParse`), um Präzisionsverluste bei großen Zahlen (IDs, High-Precision Floats) zu verhindern. Es wurden Mechanismen für "Defensive Programming" implementiert (z.B. Request Deduplication, Zombie Pruning, Input Validation).

Dennoch wurden im Rahmen der Tiefenanalyse einige spezifische Schwachstellen identifiziert, die unter bestimmten Randbedingungen (Exchange API Änderungen, High-Frequency Trading) zu Problemen führen können.

## 2. Findings

### 🔴 CRITICAL (Risiko von Dateninkonsistenz oder Logikfehlern)

1.  **Riskante Heuristik bei `nextFundingTime` (`src/stores/market.svelte.ts`)**
    *   **Beschreibung:** In `applyUpdate` wird eine "magische" Heuristik verwendet, um Sekunden in Millisekunden umzurechnen: `if (nft > 0 && nft < 10000000000) { nft *= 1000; }`.
    *   **Risiko:** Sollte die Exchange das Format ändern oder ein Timestamp zufällig in diesen Bereich fallen (z.B. durch einen Bug in der API), wird das Datum falsch interpretiert (Faktor 1000 Fehler). Dies führt zu falscher Anzeige im UI oder Fehlern in der Funding-Berechnung.
    *   **Empfehlung:** Strikte Validierung oder explizites Parsing basierend auf der API-Dokumentation, statt "raten".

2.  **Redundanter/Später Präzisions-Check (`src/services/bitunixWs.ts`)**
    *   **Beschreibung:** Im `order` Channel wird geprüft: `if (item.orderId > 9007199254740991)`. Da `item` hier bereits ein JavaScript-Objekt ist, ist die Präzision (falls es eine Number ist) **bereits verloren**, bevor dieser Check greift. `safeJsonParse` sollte dies upstream verhindern und einen String liefern.
    *   **Risiko:** Der Check suggeriert Sicherheit, die an dieser Stelle nicht mehr existiert. Wenn `safeJsonParse` versagt oder umgangen wird, ist die OrderID bereits korrupt.
    *   **Empfehlung:** Validierung muss sicherstellen, dass IDs *immer* Strings sind, *bevor* sie als Number interpretiert werden können. Der Check sollte `typeof item.orderId === 'string'` erzwingen.

### 🟡 WARNING (Performance & Wartbarkeit)

3.  **Performance Overhead in `applySymbolKlines` (`src/stores/market.svelte.ts`)**
    *   **Beschreibung:** Die Methode sortiert (`klines.sort`) und dedupliziert das Array bei *jedem* Aufruf.
    *   **Impact:** Bei WebSocket-Updates kommt meist nur *eine* neue Candle (oder ein Update der aktuellen). Ein `sort` auf ein Array der Länge 1 (oder das gesamte History-Array) ist unnötiger CPU-Overhead im "Hot Path".
    *   **Empfehlung:** Optimierung für den "Single Update" Fall (Append-Only), Sortierung nur bei Bulk-Load.

4.  **"Fast Path" Bypass der Validierung (`src/services/bitunixWs.ts`)**
    *   **Beschreibung:** Für `price`, `ticker`, `depth` wird Zod-Validierung aus Performance-Gründen übersprungen.
    *   **Impact:** Performance ist exzellent, aber Änderungen an der API-Struktur der Exchange könnten zu Laufzeitfehlern führen, da keine Schema-Prüfung stattfindet.
    *   **Empfehlung:** Beibehalten (da "High Frequency"), aber mit expliziten Kommentaren und evtl. "Sampling"-Validierung (z.B. jede 1000. Nachricht validieren) absichern.

5.  **Inkonsistente `lastPrice` Updates (`src/services/bitunixWs.ts`)**
    *   **Beschreibung:** Der `price` Channel aktualisiert `lastPrice` im Store *nicht* (auskommentiert: `// lastPrice: normalized.lastPrice, // [HYBRID FIX] Disabled`).
    *   **Impact:** Das UI verlässt sich auf den `ticker` Channel für Preis-Updates. Wenn `ticker` langsamer ist als `price`, "laggt" der angezeigte Preis.
    *   **Empfehlung:** Prüfen, ob `price` Channel verlässliche Daten liefert und ggf. wieder aktivieren.

### 🔵 REFACTOR (Technische Schuld)

6.  **Code-Duplizierung: Timeframe Mapping**
    *   **Beschreibung:** Die Logik zur Umwandlung von Timeframes (z.B. "1h" -> "60min") ist hardcodiert in `MarketWatcher` und `BitunixWebSocketService`.
    *   **Empfehlung:** Zentralisierung in `src/utils/timeframeUtils.ts` oder Ähnliches.

7.  **Manuelle Serialisierung in `TradeService`**
    *   **Beschreibung:** `serializePayload` nutzt eine eigene rekursive Schleife zur Umwandlung von `Decimal` in Strings.
    *   **Empfehlung:** Nutzung einer Standard-Utility oder `JSON.stringify` mit Replacer-Funktion (wobei `Decimal` oft `.toJSON()` hat, aber hier strikte Kontrolle gewünscht ist). Kann vereinfacht werden.

## 3. Datenintegrität & Security Audit

*   **Decimal.js:** Wird konsequent für Preise, Mengen, Volumen und PnL genutzt. ✅
*   **Input Validierung:** UI-Komponenten (`TradeSetupInputs`, `PortfolioInputs`) nutzen restriktive Input-Handler (`numberInput`), die ungültige Zeichen verhindern. ✅
*   **i18n:** Die geprüften Komponenten nutzen konsequent `$_('key')`. Keine Hardcoded Strings in der Business-Logik gefunden (außer in Logs, was okay ist). ✅
*   **Error Handling:** Services fangen Fehler ab und loggen sie sauber via `logger`. Kritische Fehler werden im UI angezeigt (z.B. `uiState.showError`). ✅

## 4. Fazit

Die Plattform ist bereits sehr nah am "Institutional Grade". Die identifizierten "Critical" Findings sind eher Edge-Cases als fundamentale Designfehler. Die Architektur (Worker, Store-Buffer, Deduplication) ist hoch performant ausgelegt.

**Nächste Schritte:** Umsetzung des Aktionsplans (Phase 2) zur Behebung der genannten Punkte.
