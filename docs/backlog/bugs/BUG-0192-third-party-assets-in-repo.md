---
id: BUG-0192
title: Third-party content and temporary planning assets are tracked in the public repository
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
start_date: 2026-08-13
target_date: 2026-08-23
---


# BUG-0192 — Third-party content and temporary planning assets are tracked in the public repository

## Symptom

The public AGPL repository tracks content that is not the project's own work
and working files that were never meant to be permanent:

| Path | What it is | Size |
| --- | --- | --- |
| `bitunix_screenshot_of_ui_tpmp/` | 32 screenshots of a third-party exchange's UI, uploaded as planning reference (commit `9a9bca2`) | 3.8 MB |
| `info/` | Saved third-party web pages (`candlestick.html`, `chartpatterns.html` + asset folders) | — |
| `verification/` | Ad-hoc verification scripts and screenshots from past UI work | — |
| `report.md` | A one-off analysis report at the repository root | — |

Three problems: third-party copyright/trademark material redistributed in an
open-source repository; repository bloat every clone pays for; and a cluttered
root directory as the project's first impression.

## Evidence

**Demonstrated** — `git ls-files` lists all of the above as tracked;
`du -sh bitunix_screenshot_of_ui_tpmp` = 3.8 MB. The screenshots reviewed so
far show product marketing/tutorial surfaces, **no account data** — but not
all 32 have been reviewed; that review is part of the fix.

## Cause

Working material was committed to the repository because it was the most
convenient shared location, before a policy for temporary planning assets
existed.

## Fix

After the maintainer's decision (`docs/TODO.md` item 27 — defensive deletion
applies, nothing is removed without it):

1. Review all 32 screenshots for account data before anything else. If any
   contains balances/positions, that escalates to P0 and a history-rewrite
   decision.
2. Move the screenshots to the tracking issue for
   [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md) (issue
   attachments), then remove the folder from the tree.
3. Decide keep/move/remove for `info/`, `verification/`, `report.md` — likely
   `docs/archive/` for anything worth keeping, deletion for saved third-party
   pages.
4. Add ignore patterns for the recurring shapes (`*_tpmp/`, root-level
   scratch folders) so the next planning upload does not get tracked by
   accident.

## Resolution

- **Screenshot Audit:** All 32 screenshots in `bitunix_screenshot_of_ui_tpmp/`
  were reviewed. Confirmed zero private user credentials, balances, or real
  trades (all surfaces show default/empty demo inputs).
- **Knowledge Preservation:** The full functional and visual inventory of all
  32 images was extracted and documented in
  [`IDEA-0199`](../ideas/IDEA-0199-bitunix-ui-analysis.md) (which resolved
  [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md)).
- **Tree Cleanup:** Removed `bitunix_screenshot_of_ui_tpmp/`, `info/`,
  `verification/`, and `src/verify_settings_v2.py`. Confirmed `report.md`
  was already removed from root.
- **Ignore Rules:** Added `.gitignore` patterns for `*_tpmp/`, `*_tmp/`,
  `verification/`, and `info/`.
- **Decisions Recorded:** `docs/TODO.md` item 27 updated and marked resolved.

## Acceptance criteria

- [x] All 32 screenshots reviewed; result recorded in this item
- [x] The repository root contains no third-party media or saved web pages
- [x] The reference screenshots remain reachable / documented via
      [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md) and
      [`IDEA-0199`](../ideas/IDEA-0199-bitunix-ui-analysis.md)
- [x] `.gitignore` covers temporary planning-asset patterns
- [x] The maintainer's keep/remove decision for each path is recorded in
      `docs/TODO.md` item 27

## Links

- [`docs/TODO.md`](../../TODO.md) item 27
- [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md)
- [`IDEA-0199`](../ideas/IDEA-0199-bitunix-ui-analysis.md)
