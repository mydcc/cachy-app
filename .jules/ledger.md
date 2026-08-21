# Ledger Journal

## Coverage

| Date | Subsystem | Findings Filed | Notes |
| --- | --- | --- | --- |
| 2026-08-12 | Store lifecycles (`src/stores/`) | BUG-0078, BUG-0079 | BUG-0078: missing HMR disposal for store `$effect.root` auto-saves. BUG-0079: legacy `subscribe()` leaks timers and has race conditions. |
| 2026-08-12 | Exchange ingestion (`bitgetWs.ts`) | BUG-0080 | BitgetWS decimal initializations crash WebSocket processing loop due to unvalidated inputs. |
| 2026-08-21 | Exchange ingestion (`bitgetWs.ts`) | BUG-0080 (Duplicate) | Clean audit. BUG-0080 already covers the bitgetWs decimal crash. bitunixWs uses safe types for decimal construction. |
