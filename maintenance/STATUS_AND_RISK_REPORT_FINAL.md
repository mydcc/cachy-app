# Status & Risiko-Bericht (Status & Risk Report)

**Datum:** 20.02.2026
**Autor:** Jules (Senior Lead Developer & Systems Architect)
**Status:** FINAL (Forensic Audit Completed)

Dieser Bericht fasst die Ergebnisse der Tiefenanalyse des `cachy-app` Repositories zusammen. Der Fokus lag auf Datenintegrität, Sicherheit und Stabilität für den professionellen Handelseinsatz.

---

## 🔴 KRITISCH (CRITICAL)
*Risiken für finanzielle Verluste, Abstürze oder Sicherheitslücken.*

1.  **Präzisionsverlust in `BitunixWs` ("Fast Path")**:
    *   **Fundort:** `src/services/bitunixWs.ts` (Methoden `handleMessage` -> Fast Path Block).
    *   **Beschreibung:** Im "Fast Path" wird versucht, `number`-Werte manuell zu Strings zu casten (`String(data.ip)`). Da `JSON.parse` (via `safeJsonParse`) jedoch bereits *vor* diesem Block lief, wurden Fließkommazahlen (Floats) bereits in native JavaScript-Numbers konvertiert. Dies führt zu unwiderruflichem Präzisionsverlust bei Preisen (z.B. `0.00000001` -> `1e-8` oder Rundungsfehlern).
    *   **Risiko:** Finanzielle Berechnungen könnten auf ungenauen Werten basieren.
    *   **Lösung:** Der Fast Path muss entweder *vor* dem Parsing ansetzen (komplex) oder strikt `Decimal` verwenden und akzeptieren, dass die native `JSON.parse` bereits gerundet hat (Warnung loggen). Besser: `safeJsonParse` so konfigurieren, dass es *alle* Zahlen als Strings liefert, oder den Fast Path entfernen, wenn er Sicherheit gefährdet.

2.  **GC Thrashing ("Memory Churn") in `MarketManager`**:
    *   **Fundort:** `src/stores/market.svelte.ts` (`rebuildBuffers`, `appendBuffers`).
    *   **Beschreibung:** Bei jedem Kline-Update, das die Array-Größe ändert (neue Kerze), werden komplett neue `Float64Array`-Instanzen allozierter. Dies geschieht mit $O(N)$ oder teils $O(N^2)$ Verhalten bei Batch-Updates.
    *   **Risiko:** Hohe Garbage-Collection-Last führt zu UI-Rucklern ("Stuttering") und erhöhtem Speicherverbrauch im Browser, was bei High-Frequency-Trading inakzeptabel ist.
    *   **Lösung:** Implementierung eines "Pooled Buffer"-Systems oder "Capacity"-basierten Ansatzes (Array verdoppeln statt exakt wachsen lassen).

---

## 🟡 WARNUNG (WARNING)
*Performance-Probleme, UX-Mängel oder fehlende Internationalisierung.*

1.  **Validierungslücke bei leerem Input (Crash-Gefahr)**:
    *   **Fundort:** `src/components/inputs/PortfolioInputs.svelte`.
    *   **Beschreibung:** Die Funktion `validateInput` gibt bei leerem Input einen leeren String `""` zurück, der direkt in den `tradeState` geschrieben wird. Wenn `TradeService` versucht, `new Decimal("")` zu instanziieren, wirft `decimal.js` einen Fehler.
    *   **Lösung:** Leere Inputs müssen im State entweder als `null` oder `0` (mit Warnung) behandelt werden, oder der Service muss `""` abfangen.

2.  **Fehlende I18n-Keys**:
    *   **Fundort:** `src/components/inputs/PortfolioInputs.svelte`.
    *   **Fehlende Keys:**
        *   `settings.errors.invalidApiKey`
        *   `settings.errors.ipNotAllowed`
        *   `settings.errors.invalidSignature`
        *   `settings.errors.timestampError`
    *   **Risiko:** Benutzer sehen leere Fehlerboxen oder Fallback-Strings ("settings.errors...") bei API-Problemen.

3.  **Potenzieller Absturz in `NewsService`**:
    *   **Fundort:** `src/services/newsService.ts` (`generateNewsId`).
    *   **Beschreibung:** `encodeURIComponent(item.url + item.title)` verlässt sich darauf, dass `title` und `url` Strings sind. Bei API-Änderungen (null/undefined) könnte dies werfen oder "undefinedundefined" als ID erzeugen.

---

## 🔵 REFACTOR (Technical Debt)
*Wartbarkeit und Code-Qualität.*

1.  **Komplexe `shouldFetchNews` Logik**:
    *   Die Bedingung ist schwer lesbar und fehleranfällig.

2.  **Harter Cast in `BitunixWs`**:
    *   `src/services/bitunixWs.ts` nutzt `(validatedMessage.data as any).ip`. Dies umgeht Typescript und sollte durch Zod-Schema-Validierung ersetzt werden.

---

## ✅ STATUS QUO (Positive Befunde)

*   **TradeService:** Nutzt konsequent `Decimal.js` für Berechnungen.
*   **Architektur:** Stores nutzen Svelte 5 Runes korrekt.
*   **Sicherheit:** `safeJsonParse` wird global genutzt (schützt vor Integer-Overflows bei IDs).

---

**Empfohlene nächste Schritte:**
Siehe "Implementation Plan" (Step 2).
