# Status & Risiko-Bericht (Status & Risk Report)

**Datum:** 20.02.2026
**Autor:** Jules (Senior Lead Developer & Systems Architect)
**Status:** DRAFT

Dieser Bericht fasst die Ergebnisse der Tiefenanalyse des `cachy-app` Repositories zusammen. Der Fokus lag auf Datenintegrität, Sicherheit und Stabilität für den professionellen Handelseinsatz.

---

## 🔴 KRITISCH (CRITICAL)
*Risiken für finanzielle Verluste, Abstürze oder Sicherheitslücken.*

1.  **Potenzieller Präzisionsverlust in `BitunixWs` ("Fast Path")**:
    *   **Fundort:** `src/services/bitunixWs.ts` (Fast Path für Ticker/Price).
    *   **Beschreibung:** Im "Fast Path" wird `typeof data.lastPrice === 'number'` geprüft und dann zu String gecastet. Wenn die API einen `number`-Typ sendet, ist die Präzision bereits durch den nativen JSON-Parser (float64) verloren gegangen, bevor dieser Code erreicht wird.
    *   **Mitigation:** `src/utils/safeJson.ts` (Regex-Replacement) wird verwendet, was das Risiko für *sehr große* Zahlen (>= 14 Stellen, z.B. Order IDs) mindert. Für Preise (Float) besteht weiterhin das Risiko von Rundungsfehlern (z.B. `0.00000001` -> `1e-8`), die downstream Probleme verursachen könnten, wenn UI oder Rechner Strings erwarten.
    *   **Empfehlung:** Strict Mode für API-Parsing erzwingen oder `safeJsonParse` verifizieren, dass es auch Floats als Strings erhält.

2.  **Unsichere Typ-Assertions (Data Integrity)**:
    *   **Fundort:** `src/services/bitunixWs.ts`, `handleMessage`.
    *   **Beschreibung:** Verwendung von `(validatedMessage.data as any).ip` umgeht die Typsicherheit. Wenn sich die API-Struktur ändert, schlägt dies zur Laufzeit fehl statt bei der Validierung.
    *   **Empfehlung:** Zod-Schema für `data`-Payload strikt definieren und nutzen.

3.  **GC Thrashing ("Memory Churn") in `MarketManager`**:
    *   **Fundort:** `src/stores/market.svelte.ts`, Methode `updateSymbolKlines`.
    *   **Beschreibung:** Bei jedem Kline-Update (auch via WebSocket) werden neue `Float64Array`-Instanzen erstellt (`rebuildBuffers`, `appendBuffers`). Dies erzeugt bei hoher Frequenz (viele Symbole, schnelle Updates) massiven Druck auf den Garbage Collector, was zu "Stuttering" im UI führen kann.
    *   **Empfehlung:** Ring-Buffer oder vorallokierte Arrays mit manueller Cursor-Verwaltung (Pool-Pattern) implementieren.

4.  **Test-Flakiness bei LRU-Eviction**:
    *   **Fundort:** `src/services/incrementalCache.ts` / Tests.
    *   **Beschreibung:** Die LRU-Logik nutzt `Date.now()` (Millisekunden). Bei sehr schneller Ausführung (Unit Tests) haben mehrere Einträge denselben Timestamp, was die Eviction unvorhersehbar macht (FIFO statt LRU).
    *   **Empfehlung:** `performance.now()` oder monotonen Zähler für `lastAccessed` verwenden.

---

## 🟡 WARNUNG (WARNING)
*Performance-Probleme, UX-Mängel oder fehlende Internationalisierung.*

1.  **Eingabevalidierung Edge-Case**:
    *   **Fundort:** `src/components/inputs/PortfolioInputs.svelte`.
    *   **Beschreibung:** Wenn `validateInput` einen leeren String zurückgibt (z.B. bei Löschen des Inputs), wird dieser direkt in den `tradeState` geschrieben. Services, die `Decimal` erwarten, könnten bei `new Decimal("")` werfen.
    *   **Empfehlung:** Leere Strings im State explizit behandeln oder zu `0` / `null` normalisieren.

2.  **Fehlende Abhängigkeiten in Testumgebung**:
    *   **Beschreibung:** Viele Tests (`npm test` / `bun test`) schlagen fehl, weil Module wie `decimal.js` oder `@sveltejs/kit` in der Testumgebung nicht aufgelöst werden können. Dies erschwert CI/CD.
    *   **Empfehlung:** `vitest` Konfiguration prüfen und sicherstellen, dass Aliases (`$lib`, `$app`) korrekt gemockt sind.

3.  **Default DOMPurify Konfiguration**:
    *   **Fundort:** `src/utils/markdownUtils.ts`.
    *   **Beschreibung:** Es wird die Standard-Konfiguration von DOMPurify verwendet. Für eine Hochsicherheits-App sollten aggressive Tags (z.B. `iframe`, `object`) explizit verboten werden, falls sie nicht benötigt werden.

4.  **Unbounded Map Growth Risiko**:
    *   **Fundort:** `src/services/bitunixWs.ts`, `throttleMap`.
    *   **Beschreibung:** Es gibt eine Bereinigung (`size > 1000`), aber theoretisch könnten bei einem Angriff mit rotierenden Symbolen Speicherlecks entstehen. (Niedriges Risiko dank Limit).

---

## 🔵 REFACTOR (Technical Debt)
*Wartbarkeit und Code-Qualität.*

1.  **Code-Duplikation in `mdaService` / `MarketWatcher`**:
    *   Die Normalisierungslogik für Ticker/Klines ist teilweise verstreut. Eine Zentralisierung in `mappers.ts` wäre sauberer.

2.  **Komplexe `shouldFetchNews` Logik**:
    *   `src/services/newsService.ts`: Die Bedingung ist schwer lesbar und fehleranfällig. Extraktion in kleinere Helfer-Funktionen empfohlen.

---

## ✅ POSITIVE BEFUNDE (Status Quo)

*   **Sicherheit:** `src/utils/safeJson.ts` schützt effektiv vor Integer-Überläufen bei IDs. `src/lib/server/logger.ts` maskiert sensible Daten.
*   **Architektur:** "Hybrid Architecture" in `MarketWatcher` (WS + Polling Fallback) ist robust implementiert.
*   **Standards:** Konsequente Nutzung von `Decimal.js` für Berechnungen im `TradeService`.
*   **Frontend:** Nutzung von `Svelte 5 Runes` (`$state`, `$derived`) ist modern und performant.

---

**Nächste Schritte:** Siehe "Step 2: Action Plan" im Chat.
