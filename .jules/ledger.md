# Ledger Journal

## Coverage

| Date | Subsystem | Findings Filed | Notes |
| --- | --- | --- | --- |
| 2024-10-XX | Store lifecycles (`src/stores/`) | BUG-0078, BUG-0079 | BUG-0078: missing HMR disposal for store `$effect.root` auto-saves. BUG-0079: legacy `subscribe()` leaks timers and has race conditions. |
| 2024-10-XX | Exchange ingestion (`bitgetWs.ts`) | BUG-0080 | BitgetWS decimal initializations crash WebSocket processing loop due to unvalidated inputs. |
