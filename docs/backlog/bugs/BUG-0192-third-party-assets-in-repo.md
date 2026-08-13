---
id: BUG-0192
title: Third-party content and temporary planning assets are tracked in the public repository
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
estimate: 1
size: XS
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

## Acceptance criteria

- [ ] All 32 screenshots reviewed; result recorded in this item
- [ ] The repository root contains no third-party media or saved web pages
- [ ] The reference screenshots remain reachable from
      [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md)
- [ ] `.gitignore` covers temporary planning-asset patterns
- [ ] The maintainer's keep/remove decision for each path is recorded in
      `docs/TODO.md` item 27

## Links

- `docs/TODO.md` item 27
- [`IDEA-0191`](../ideas/IDEA-0191-trade-panel-reference-audit.md)
