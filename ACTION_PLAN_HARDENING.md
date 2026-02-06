# Maßnahmenplan: Systemhärtung & Refactoring (Phase 2)

**Datum:** 26.05.2026
**Autor:** Senior Lead Developer (Jules)
**Status:** In Planung
**Basis:** [ANALYSIS_REPORT_SYSTEMATIC.md](./ANALYSIS_REPORT_SYSTEMATIC.md)

Dieser Plan definiert die konkreten Arbeitspakete zur Umsetzung der "Institutional Grade" Härtung.

---

## 🚀 Priorität 1: Data Integrity & Critical Fixes

Das primäre Ziel ist der Schutz vor finanziellen Fehlern durch Präzisionsverluste oder Logikfehler.

### Task 1.1: TradeService Erweiterung (TP/SL)
- **Ziel:** Zentralisierung der TP/SL-Logik, um Duplizierung und unsichere `fetch`-Aufrufe zu vermeiden.
- **Datei:** `src/services/tradeService.ts`
- **Aktionen:**
  - Implementierung von `modifyTpSlOrder(params)`.
  - Nutzung von `serializePayload` für Decimal-Handling.
  - Nutzung von `signedRequest` für Authentifizierung und `safeJsonParse`.

### Task 1.2: Refactoring `TpSlEditModal`
- **Ziel:** Entfernung von direkten API-Calls und Nutzung des neuen Service.
- **Datei:** `src/components/shared/TpSlEditModal.svelte`
- **Aktionen:**
  - Ersetzen von `fetch("/api/tpsl")` durch `tradeService.modifyTpSlOrder(...)`.
  - Entfernen der lokalen API-Key-Logik (wird vom Service übernommen).

---

## ⚠️ Priorität 2: UI/UX & Internationalisierung (I18n)

Verbesserung der Nutzererfahrung und Wartbarkeit durch Entfernung hardcodierter Strings.

### Task 2.1: Lokalisierung `TpSlEditModal`
- **Ziel:** Vollständige Übersetzung des Modals.
- **Dateien:** `src/locales/locales/en.json`, `src/components/shared/TpSlEditModal.svelte`
- **Keys:**
  - `tpsl.edit.title` ("Edit Take Profit" / "Edit Stop Loss")
  - `tpsl.edit.triggerPrice` ("Trigger Price")
  - `tpsl.edit.amount` ("Amount (Qty)")
  - `tpsl.edit.save` ("Save")
  - `tpsl.edit.cancel` ("Cancel")
  - `tpsl.edit.saving` ("Saving...")

### Task 2.2: Lokalisierung `PerformanceMonitor`
- **Ziel:** Übersetzung der Performance-Tipps und Statusanzeigen.
- **Dateien:** `src/components/shared/PerformanceMonitor.svelte`, `src/locales/locales/en.json`
- **Aktionen:** Identifikation und Extraktion aller statischen Texte.

---

## 🛡️ Priorität 3: Resource Management & Monitoring (Ongoing)

### Task 3.1: WebSocket Monitoring
- **Ziel:** Überwachung der "Fast Path" Logik in `bitunixWs.ts`.
- **Aktion:** Keine Code-Änderung, aber aktives Review der Logs im Betrieb ("CRITICAL PRECISION LOSS").

---

## 🧪 Verifizierung

Jeder Schritt wird durch folgende Maßnahmen geprüft:
1. **Build Check:** `npm run build` muss fehlerfrei durchlaufen.
2. **Type Check:** `npm run check` darf keine Fehler melden.
3. **Funktionstest:** Manuelle oder Unit-Test-Simulation der TP/SL-Änderung.
