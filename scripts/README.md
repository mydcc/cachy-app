# scripts/

Twenty-odd scripts accumulated here over two months without an index, so it was
not possible to tell by looking which ones run on their own and which are
one-off tools someone wrote for an afternoon. That is the distinction this file
records — roadmap item 24.

Everything below was verified against `package.json`, `.github/workflows/` and
`deploy.sh`, not inferred from filenames.

---

## Wired into automation

These run without anyone asking. Breaking one breaks a build, a deploy or a CI
check.

| Script | Triggered by | What it does |
| --- | --- | --- |
| `build_wasm.sh` | `npm run dev`, `npm run build` | Rebuilds the `technicals-wasm` indicator module. Skips the build and uses the committed binary in `static/wasm/` when no Rust toolchain is present, so a plain `npm install && npm run dev` works. |
| `lint-i18n.js` | `.github/workflows/audit.yml` | Scans TypeScript and Svelte for hardcoded UI strings that belong in an i18n key. |
| `audit_translations.py` | `.github/workflows/translation-check.yml` | Audits translation keys — missing, orphaned, inconsistent. |
| `check_translations.sh` | `.github/workflows/translation-check.yml` | Shell wrapper that drives the translation checks from the project root. |
| `verify_translations.py` | `.github/workflows/translation-check.yml` | Verifies `de.json` and `en.json` agree on their key set. |
| `discord-notify.sh` | `deploy.sh` (sourced) | Deployment notifications. Silent no-op without `DISCORD_WEBHOOK_URL`; run it directly with `test` to check a webhook. |

## Run by hand, and worth keeping

Real tools with a clear job. None of them run on their own.

| Script | Run it when | How |
| --- | --- | --- |
| `generate-i18n-types.js` | After adding or removing an i18n key — regenerates `src/locales/schema.d.ts`, without which `npm run check` rejects the new key. | `node scripts/generate-i18n-types.js` |
| `validate-i18n.js` | Checking that every `en.json` key exists in `de.json` before opening a pull request. | `node scripts/validate-i18n.js` |
| `ensure_agpl_headers.py` | After adding source files — the project puts an AGPL header on every one. | `python3 scripts/ensure_agpl_headers.py` |
| `detect_leaks.cjs` | Hunting timer leaks — scans `src/` for `$effect` blocks that call `setInterval` without a matching `clearInterval` in a returned cleanup. Timers only; it does not check listeners or subscriptions. | `node scripts/detect_leaks.cjs` |
| `inspect_wasm.mjs` | The WASM module behaves unexpectedly — prints the exports of `static/wasm/technicals_wasm.wasm`. | `node scripts/inspect_wasm.mjs` |
| `profile_worker_cdp.js` | Profiling worker performance against a running dev server, over the Chrome DevTools Protocol. Needs puppeteer. | `node scripts/profile_worker_cdp.js [url]` |
| `reproduce_ws.js` | Reproducing a Bitunix WebSocket problem outside the app, against `wss://fapi.bitunix.com`. | `node scripts/reproduce_ws.js` |
| `update_i18n.py` | Bulk-editing both locale files at once. Read it before running — it rewrites `en.json` and `de.json` in place. | `python3 scripts/update_i18n.py` |

## Superseded — kept, not wired

| Script | Status |
| --- | --- |
| `pre-commit.sh`, `husky-pre-commit.sh` | Two git pre-commit hooks for translation checks. **Neither is installed**: there is no `.husky/` directory and husky is not a dependency. The checks they run now happen in `.github/workflows/translation-check.yml`, which no one can skip with `--no-verify`. Kept because installing a hook is a local choice — `pre-commit.sh` documents its own installation in its header. |
| `render_build.sh` | A build script for Render.com. The project deploys via `deploy.sh` to aaPanel; nothing references this. Kept in case the hosting question reopens. |
| `verify_technicals_frontend.py` | A Playwright-driven check of the technicals panel, predating `tests/e2e/`. Not wired into any suite. |

## Subdirectories

| Directory | Contents |
| --- | --- |
| `brain/` | A separate Python project — `train.py`, `export.py`, `requirements.txt` and its own README. Not part of the app build. |
| `pine/` | 18 TradingView Pine Script indicator sources (ADX, MACD, Ichimoku, SuperTrend, …). Reference material for the indicator implementations in `src/utils/indicators.ts`, not executable here. |
| `maintenance/` | Four one-shot patch scripts (`fix_left_panel.py`, `fix_registry_journal.py`, `fix_window_container.py`, `patch_news_final_clean.js`) written to perform a specific refactor once. They are **not idempotent** and are not meant to be run again — they are kept as a record of what was changed. Do not run one to find out what it does. |

---

## Also outside this directory

- **`verification/`** — `verify_market_overview.py`, `verify_picker.py`,
  `verify_presenter.ts` plus two reference screenshots. Manual visual checks
  from before the e2e suite existed; not wired into anything.
- **`plans/`** — two design documents, `plan_proposal.md` and
  `settings-ui-optimization-20260228.md`. Historical planning notes, not
  instructions to follow.

## Adding a script here

State in a comment at the top what it does and whether anything runs it
automatically, then add a row above. A script nobody can classify at a glance is
how this directory got to twenty files.
