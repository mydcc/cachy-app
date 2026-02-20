# Status- & Risikoanalysebericht (Cachy App)

**Datum:** 2026-05-24
**Rolle:** Lead Architect
**Status:** Institutional Grade Assessment

## Übersicht
Die Codebasis weist einen hohen Reifegrad auf ("Institutional Grade"). Defensive Programmierpraktiken, strikte Typisierung und Ressourcenmanagement sind in den Kernkomponenten weitgehend implementiert. Es wurden keine kritischen Sicherheitslücken oder logischen Fehler gefunden, die einen unmittelbaren Finanzverlust verursachen würden.

---

## 🔴 CRITICAL (Kritische Risiken)
*Aktuell wurden keine unmittelbaren kritischen Fehler identifiziert.*

**Anmerkung:** Die Architektur verlässt sich stark auf `safeJsonParse` in `src/utils/safeJson.ts`. Sollte diese Funktion fehlerhaft sein, besteht ein systemweites Risiko für Datenkorruption (Präzisionsverlust). Die aktuelle Implementierung (manuelles Scannen nach Zahlen >= 15 Zeichen) erscheint jedoch robust.

---

## 🟡 WARNING (Warnungen & Risiken)

### 1. Unvollständige Lokalisierung (I18n)
*   **Fundort:** `src/locales/locales/de.json`
*   **Problem:** Der Abschnitt `bitunixErrors` enthält englische Fehlermeldungen (z.B. `"20003": "Insufficient balance"`), obwohl der Key existiert.
*   **Auswirkung:** Deutsche Nutzer erhalten englische Fehlermeldungen, was das Vertrauen in die Plattform mindert ("Broken State").
*   **Empfehlung:** Übersetzung aller Werte in `de.json` vervollständigen.

### 2. WebSocket Präzision (Bitget)
*   **Fundort:** `src/services/bitgetWs.ts`
*   **Problem:** Im Gegensatz zu `bitunixWs.ts`, welcher eine Regex-Vorverarbeitung nutzt, verlässt sich `bitgetWs.ts` ausschließlich auf `safeJsonParse`.
*   **Risiko:** Sollte Bitget Zahlen senden, die *kürzer* als 15 Zeichen sind, aber dennoch eine höhere Präzision als native JavaScript-Floats erfordern (unwahrscheinlich, aber theoretisch möglich bei sehr kleinen Beträgen), könnte es zu Rundungsfehlern kommen.
*   **Empfehlung:** Implementierung des Regex-Pre-Processors auch für Bitget (analog zu `bitunixWs.ts`), um maximale Sicherheit zu gewährleisten.

### 3. API-Endpunkt Konsistenz
*   **Fundort:** `src/routes/api/sync/+server.ts`
*   **Problem:** Verwendet `await request.json()` statt `safeJsonParse(await request.text())`.
*   **Risiko:** Bei einem leeren Body oder malformiertem JSON stürzt der Parser ab (wird zwar durch `try/catch` gefangen, aber die Fehlermeldung ist generisch). Zudem besteht hier kein Schutz vor Präzisionsverlust bei großen Zahlen im Request-Body.
*   **Empfehlung:** Umstellung auf `safeJsonParse`.

---

## 🔵 REFACTOR (Technische Schulden & Optimierung)

### 1. Ressourcen-Management (Subscriptions)
*   **Fundort:** `src/stores/market.svelte.ts`
*   **Beobachtung:** Die `subscribe`-Methode erstellt für jeden Aufruf einen neuen `$effect.root`. Das ist technisch korrekt für Svelte 5, erfordert aber Disziplin vom Aufrufer (unsubscribe muss zwingend gerufen werden).
*   **Empfehlung:** Dokumentation oder Wrapper, um "Dangling Subscriptions" sicher zu verhindern.

### 2. CSP (Content Security Policy)
*   **Fundort:** `svelte.config.js`
*   **Beobachtung:** `style-src` erlaubt `'unsafe-inline'`. Dies ist für viele UI-Frameworks notwendig, stellt aber ein minimales XSS-Risiko dar. `script-src` ist jedoch sicher konfiguriert.
*   **Empfehlung:** Beibehalten, aber überwachen.

---

## Zusammenfassung
Die Anwendung ist in einem sehr guten Zustand. Die Kernlogik für Trading (`tradeService`, `marketWatcher`) ist exzellent gegen Präzisionsverlust und Race-Conditions abgesichert. Die identifizierten Punkte betreffen hauptsächlich die User Experience (Übersetzung) und eine noch striktere Konsistenz im Backend.

**Empfohlene nächste Schritte (Phase 2):**
1.  **I18n Fix:** `de.json` vervollständigen.
2.  **API Hardening:** `api/sync` auf `safeJsonParse` umstellen.
3.  **Bitget WS Hardening:** Regex-Parser portieren.
