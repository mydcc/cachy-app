# Umsetzungsplan (Hardening)

## Phase 1: Critical Fixes (Schutz vor Kapitalverlust)

1. **Fix "Close All" Limit**
   - [ ] `src/services/tradeService.ts`: Erhöhe Limit von `999999` auf `1e14` (oder Safe Integer).
   - [ ] Add Unit Test.

2. **Memory Leak Prävention**
   - [ ] `src/stores/market.svelte.ts`: Implementiere Capping für `metricsHistory`.

## Phase 2: System Hardening

3. **WebSocket Absicherung**
   - [ ] `src/services/bitunixWs.ts`: Add Safe Guards (`?.`) im Fast Path.

4. **Logging**
   - [ ] `src/services/marketAnalyst.ts`: Error Logging hinzufügen.

## Phase 3: UI/UX & i18n

5. **Lokalisierung**
   - [ ] `NewsSentimentPanel.svelte`: Strings extrahieren & übersetzen.
