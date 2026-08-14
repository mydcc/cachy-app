---
id: BUG-0185
title: Competitor platform names appear in user-facing and planning documentation
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-09-04
---

# BUG-0185 — Competitor platform names appear in user-facing and planning documentation

## Symptom

Documentation shipped with the app and documentation in `docs/` name a
competing charting platform directly. The project's documentation policy is
that no third-party platform is named in any document — every public document
is read by prospective users and evaluators, and comparative name-dropping
positions Cachy relative to a competitor instead of on its own terms.

## Evidence

**Demonstrated** — `grep -rni tradingview` across the repository. The
documentation occurrences:

| File | Line | Context |
| --- | --- | --- |
| `src/lib/assets/content/whitepaper.de.md` | 190 | "exakte Übereinstimmung mit TradingView" |
| `src/lib/assets/content/whitepaper.en.md` | 193 | "exact alignment with TradingView" |
| `src/lib/assets/content/changelog.en.md` | 66 | "exact alignment with TradingView" |
| `docs/VISION.md` | 35 | "the same way TradingView is" |
| `docs/TODO.md` | 841, 847 | item 22's resolution text |
| `scripts/README.md` | 58 | "18 TradingView Pine Script indicator sources" |

Not documentation, listed for completeness and **excluded from this fix**
(each needs a product decision, not a wording pass — see Open questions):

- `src/locales/locales/{en,de}.json` — `"tradingViewChart"`, `"tradingView"`
  UI strings labelling a real outbound link.
- `src/components/shared/MarketOverview.svelte:359` — builds a
  `tradingview.com` chart URL (the feature those strings label).
- `src/components/settings/tabs/TradingTab.svelte:307` — setting for that link.
- `src/hooks.server.ts:121`, `technicals-wasm/src/lib.rs:435` — code comments.

## Cause

The texts were written when the platform was the explicit benchmark; the
no-competitor-names policy came later and no sweep was ever done.

## Fix

Reword each documentation occurrence neutrally — "industry-standard reference
implementations", "the leading charting platforms", "professional charting
tools" — without weakening the factual claim (indicator parity with reference
implementations is the substance; the brand name is not). German and English
whitepaper must stay in sync. Do not touch the excluded code/UI occurrences.

## Acceptance criteria

- [x] `grep -ri tradingview docs/ src/lib/assets/content/ scripts/README.md`
      returns no hits (outside this bug ticket)
- [x] The reworded sentences still state indicator parity as a fact, in both
      languages
- [x] No other document content changed (wording pass only)

## Open questions

- **The outbound chart link.** The UI feature that opens a symbol on the
  competitor's chart is a product decision: keep it (then naming the
  destination in its label is factual, not promotional), or remove it. Not
  decided here.
- **Pine Script attribution in `scripts/README.md`.** The reference sources
  genuinely come from that platform's script ecosystem; removing the name
  weakens provenance. Reword to "publicly available Pine Script sources" or
  keep for attribution honesty — pick one during the fix.

## Links

- [`IDEA-0186`](../ideas/IDEA-0186-docs-as-public-surface.md) — the broader
  documentation-quality audit this is one instance of
