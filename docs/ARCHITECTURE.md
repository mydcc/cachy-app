# Architecture

Where things are and what they are for. Written from the tree as it stands on
2026-08-01; it replaces `module-overview.md`, which described the layout before
the folder refactor and pointed at files that no longer exist.

If this document and the code disagree, the code is right and this is a bug —
say so in the backlog rather than working around it.

- **Rules for changing any of this:** [`../CLAUDE.md`](../CLAUDE.md)
- **Boundaries that are not negotiable:** [`adr/`](adr/README.md)

---

## Shape

A SvelteKit application (Svelte 5, runes only) with a small server side. The
server exists for two reasons and no others: proxying exchange and AI requests
that cannot be made from the browser, and serving the app. It holds no user
data — see [ADR-0001](adr/0001-local-first-boundary.md).

```
browser                                      server (SvelteKit node adapter)
├─ components/   UI                          └─ routes/api/   proxy routes only
├─ stores/       rune state                       ├─ exchange: klines, tickers,
├─ services/     logic, I/O, calculation          │   orders, positions, balance,
├─ lib/          calculator core, windows          │   account, tpsl, sync/*
├─ workers/      off-main-thread compute          ├─ ai: openai, gemini, anthropic
└─ localStorage  ALL user data (Class A)          └─ external: cmc, news, rss

                    optional, off by default
                    └─ SpacetimeDB (server/spacetimedb/) — Global Chat only
```

---

## Directories

### `src/lib/` — the core that everything else serves

- **`calculator.ts`** — position size, risk, leverage, fees, multi-target
  take-profit, performance statistics. The oldest and most load-bearing file in
  the repository. Covered by `calculator.test.ts`,
  `calculator_charts.test.ts`, `calculator_duration.test.ts` and
  `whitepaper-claims.test.ts` — the last one asserts that the numbers published
  in the whitepaper are what the code actually produces.
- **`calculators/`** — `core.ts`, `stats.ts`, `charts.ts`, `aggregator.ts`:
  the pieces `calculator.ts` composes.
- **`windows/`** — the floating-window system. `WindowBase.svelte.ts` is the
  abstract base for ~15 window types, `WindowManager` and `WindowRegistry`
  orchestrate them, and `implementations/` holds the concrete windows (chart,
  chat, assistant, markdown, dialog, symbol picker, iframe).
- **`spacetimedb/`** — generated client bindings. **Never hand-edited**; see
  [`server/CLAUDE.md`](../server/CLAUDE.md).
- **`server/`** — code that runs server-side only: `logger.ts` (with key
  redaction), `appAuth.ts`.
- **`physics/`, `pets/`** — the 3D/visual layer.
- `presets.ts`, `constants.ts`, `version.ts`, `chartSetup.ts`, `actions.ts`.

### `src/stores/` — Svelte 5 rune state

One store per topic, tests beside them. `*.svelte.ts` because they use runes.

`trade`, `results`, `market`, `account`, `journal`, `settings`, `preset`,
`notes`, `favorites`, `analysis`, `indicator`, `news`, `ai`, `chat`, `modal`,
`ui`, `effects`, `quiz`, `fireStore`, `floatingWindows`.

`settings.svelte.ts` is the sensitive one: it holds `SENSITIVE_KEYS`, the
credentials encrypted with the user's master password.

### `src/services/` — logic and I/O

The largest directory, ~50 modules with tests alongside. The groups that matter:

| Group | Modules | Note |
| --- | --- | --- |
| **Exchange** | `bitunixWs.ts`, `bitgetWs.ts`, `tradeService.ts`, `syncService.ts`, `apiService.ts`, `connectionManager.ts` | Two parallel implementations. [FEAT-0016](backlog/features/FEAT-0016-exchange-adapter-interface.md) replaces this with one adapter interface |
| **Order state** | `omsService.ts`, `rmsService.ts` | Order and risk management |
| **Calculation** | `calculatorService.ts`, `calculationStrategy.ts`, `tradeCalculator.svelte.ts` | Orchestrates `lib/calculator.ts` |
| **Technicals** | `technicalsService.ts`, `wasmCalculator.ts`, `webGpuCalculator.ts`, `activeTechnicalsManager.svelte.ts` | Three engines behind one service: WASM, WebGPU, JS |
| **Analysis** | `marketWatcher.ts`, `marketAnalyst.ts`, `patternDetection.ts`, `chartPatterns.ts`, `candlestickPatterns.ts`, `mdaService.ts`, `smc/` | |
| **Data** | `storageService.ts`, `dbService.ts`, `backupService.ts`, `csvService.ts`, `serializationService.ts`, `dataRepairService.ts` | `localStorage` and IndexedDB |
| **External** | `newsService.ts`, `cmcService.ts`, `rssParserService.ts`, `imgbbService.ts`, `discordService.ts` | |
| **Cloud** | `cloudService.ts` | The **only** SpacetimeDB client. Optional, off by default |
| **Security** | `cryptoService.ts` | Web Crypto, AES-GCM, PBKDF2 |

### `src/components/` — UI

`inputs/` (trade parameters), `results/` (calculation output), `layout/`,
`settings/` (nine tabs: AI, Cloud, Connections, System, Trading, Visuals, plus
indicator configuration), `shared/`.

### `src/routes/`

- **`[[lang]]/`** — the app, with optional language prefix. German and English;
  new UI text goes in **both** `src/locales/locales/{de,en}.json`.
  `(seo)/` holds academy, changelog, guide, privacy and whitepaper pages.
- **`api/`** — server routes. Exchange proxies (`klines`, `tickers`, `orders`,
  `positions`, `balance`, `account`, `tpsl`, `sync/*`), AI proxies
  (`ai/{openai,gemini,anthropic}`, `sentiment`), external data
  (`external/cmc`, `external/news`, `rss-fetch`), plus `health` and
  `stream-logs`.

  All of them authenticate — [ADR-0002](adr/0002-api-authentication-fails-closed.md)
  makes that fail closed. Exchange responses are read through
  `readExchangeJson` rather than `response.json()`, because `JSON.parse` rounds
  19-digit order IDs; `src/routes/api/sync/orders/security.test.ts` guards it.

### `src/workers/`, `technicals-wasm/`

`technicals.worker.ts` and `aggregator.worker.ts` keep indicator computation off
the main thread. `technicals-wasm/` is the Rust/WASM indicator module, built by
`scripts/build_wasm.sh`, which `npm run dev` and `npm run build` run first.

### `src/types/`

Zod schemas and TypeScript types. `apiSchemas.ts`, `orderSchemas.ts`,
`accountSchemas.ts`, `newsSchemas.ts`, plus per-exchange types and validation
(`bitunix.ts`/`bitunixValidation.ts`, `bitget.ts`/`bitgetValidation.ts`).

Exchange payloads are validated at the boundary. Where a schema and a handler
disagree, that is a bug rather than a style question — see
[BUG-0001](backlog/bugs/BUG-0001-bitget-ws-field-mismatch.md).

### `server/spacetimedb/`

The optional server module. One table of user data — `global_message` with
`sender`, `text`, `sent_at` — plus a scheduled retention sweep. Its own rules
live in [`server/CLAUDE.md`](../server/CLAUDE.md); generated bindings are never
hand-edited.

---

## Data, and where it is allowed to be

The single most important thing to understand before changing anything.

| Class | What | Where it may live |
| --- | --- | --- |
| **A** | Journal, settings, credentials, presets, notes, trade drafts | `localStorage` only. Never on a Cachy-operated server — not as telemetry, not in a crash report, not in a debug log |
| **B** | Currently only Global Chat message content | A Cachy-operated server, under four conditions: opt-in and off by default, authenticated, minimal, non-essential |
| **C** | Public market data and derived analysis | Anywhere — but never joined to a user identity |

[ADR-0001](adr/0001-local-first-boundary.md) defines A and B.
[ADR-0004](adr/0004-spacetimedb-data-scope.md) adds C and the
user-operated-instance distinction. [ADR-0003](adr/0003-edition-boundary.md)
forbids core code from importing the server client at all.

The one exception, and it is narrow: API keys travel through the proxy routes as
the credential of a **user-initiated** exchange request. That is not persistence
and it does not go to a Cachy data store.

---

## Rules with teeth

Each of these is enforced by something, not just written down.

| Rule | Enforced by |
| --- | --- |
| Svelte 5 runes only — no `export let`, `$:`, `createEventDispatcher`, `<slot>` | Review, `npm run check` |
| `decimal.js` for every price, amount and balance | Review. Native `number` here is a rounding error waiting to become a loss |
| No hardcoded colours — CSS variables only, paired classes from `themes.css` | 20+ themes break visibly otherwise |
| Every `$effect` registering a listener returns a cleanup | `scripts/detect_leaks.cjs` checks timer cleanup specifically |
| No `any`, no unused vars | ESLint, both at `error`, backlog at zero |
| New UI text exists in German **and** English | `scripts/lint-i18n.js` in CI |
| Every env var read is in `.env.example` | `src/tests/env_documentation.test.ts` |
| Backlog front matter is valid and the index is current | `npm run backlog:check` |

---

## Verifying a change

```bash
npm run check                  # svelte-check — after every change
npm test                       # full unit suite
npx vitest run <path>          # one file
npm run test:e2e               # Playwright
npm run test:perf              # wall-clock/heap tests, deliberately outside the gate
```

The `/verify` skill runs the relevant subset and reports honestly. Per
`CLAUDE.md`: verification, not assertion — a change is done when a test proves
it, not when it compiles.

`npm run test:perf` is separate on purpose: those tests compare wall-clock
measurements and a single GC pause moves them more than a real regression
would. The reasoning is in
[`archive/engineering-log-2026-h1.md`](archive/engineering-log-2026-h1.md),
item 18.
