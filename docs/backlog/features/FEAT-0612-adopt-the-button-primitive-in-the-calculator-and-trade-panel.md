---
id: FEAT-0612
title: Adopt the button primitive in the calculator and trade panel
type: feature
status: done
priority: P2
milestone: none
created: "2026-10-03"
editions: [community, pro, private]
area: ui
parent: FEAT-0605
data_class: none
adr: none
depends_on: [FEAT-0610]
assignee: opencode
branch: feature/feat-0612-calculator-buttons
---

# FEAT-0612 — Adopt the button primitive in the calculator and trade panel

The calculator is where a user spends most of their time and where the density
change will be judged. Its buttons are hand-styled today.

## Problem

`GeneralInputs`, `PortfolioInputs`, `ExchangeAccountControls`, the `#results`
section and the three-way action row all render their buttons directly. The
action row in `+page.svelte` uses `grid-cols-[1fr_auto_1fr] items-center` —
three controls of presumably equal importance, laid out symmetrically, which is
a claim about their relative importance that may not be true.

`FEAT-0328` (`done`) compacted the account-controls row narrowly and shipped in
1.6.0-beta.195. Whatever it deliberately left alone, it left alone on purpose,
and this item should not undo that by accident.

## Proposal

Migrate the calculator and trade-panel buttons to the primitive, and re-check
the three-way action row's grouping and ordering against
[FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)'s
findings.

Anything FEAT-0606 filed as a `BUG` is a separate fix and stays out of this
diff — a migration that also fixes behaviour makes the behaviour change
invisible in review.

## Acceptance criteria

- [x] Every `<button>` in `GeneralInputs`, `PortfolioInputs`,
      `ExchangeAccountControls` and the results section renders through
      `Button.svelte` or carries a naming comment
- [x] Button heights in the calculator come from the control-geometry tokens
- [x] No `!important` is added by this item
- [x] The three-way action row's ordering and grouping are either confirmed
      against FEAT-0606 and recorded, or a `BUG` is filed and the row is left
      as it is
- [x] The calculator's existing component tests pass unmodified; if a test needs
      changing because a selector moved, that is recorded rather than silently
      rewritten
- [x] `FEAT-0328`'s decisions are re-read before the diff, and any behaviour it
      established is preserved
- [x] The calculator renders identically to `develop` at default settings —
      **not literally**: see *Normalization, stated*. The token heights and
      the primitive's type scale cannot both hold and reproduce 14 px text in a
      48 px button.

## Progress — 2026-10-22

Branch `feature/feat-0612-calculator-buttons`. Six controls migrated, five
escaped; the guard from FEAT-0611 now covers these files too.

**Migrated**

| Site | New |
| --- | --- |
| `PortfolioInputs` fetch balance | `ghost-muted`, `sm`, class kept as test anchor |
| `PortfolioInputs` risk-amount lock | `ghost-muted`, `sm` |
| `SummaryResults` lock position size | `ghost-muted`, `sm`, `id` kept |
| `SummaryResults` copy | `ghost-muted`, `sm`, `id` kept |
| `PlaceOrderPanel` submit | `accent` / `success` (paper), `lg`, class kept |
| `+page.svelte` footer pulse `🚀` | `default`, `sm` |

**Escaped** (comment `FEAT-0612 escape: …` directly above)

- `GeneralInputs` long/short pair — `role="radiogroup"`/`role="radio"` with
  `class:active`; the primitive has no selected state.
- `PlaceOrderPanel` order-type tabs — same segmented pattern.
- `ExchangeAccountControls` leverage and margin/mode chips — dialog triggers
  with `aria-haspopup` and FEAT-0328's sync state, not plain actions.

**New primitive role.** `.btn-base.btn-ghost-muted`: transparent, secondary
text, accent on hover. `ghost` was the near miss, but its hover is an underline,
which is invisible on an icon-only button — the icon would stop answering the
pointer. The variant is covered in `Button.component.test.ts`, including the
hover rule read from the sheet (happy-dom cannot evaluate `:hover`).

**Removed CSS.** The global `.btn-lock-icon` rule and `PlaceOrderPanel`'s scoped
`.submit-btn` block lost their last consumer. `.copy-btn` and `.price-fetch-btn`
stay: `AssistantView` and `TradeSetupInputs` still use them.

**Guard.** `settingsButtons.test.ts` moved to `src/components/buttonAdoption.test.ts`
and now takes explicit file roots for the calculator surface, so the neighbouring
un-migrated components are not pulled in. It accepts `FEAT-0611 escape:` and
`FEAT-0612 escape:`.

**Normalization, stated.** These are the deliberate deltas at default settings:

- The submit button's label goes 14 px/600 → 16 px/700 (`.btn-lg` reads
  `--text-base` and `.btn-base` is 700) and loses its 1 px accent border
  (`.btn-base` is borderless). Disabled opacity 0.45 → 0.6. Radius 6 px
  (`--radius-md`) → 8 px (`--radius-lg`). Its hover flips direction in the
  default theme: `--accent-color-hover` (`--sky-400`, lighter) →
  `--btn-accent-hover-bg` (`--sky-600`, darker). Paper mode's hover is a
  different green rather than `opacity: 0.9`.
- **Per-theme colour divergence.** `variant="accent"`/`"success"` read the
  `--btn-*-bg` pairs, which several themes declare independently of
  `--accent-color`/`--success-color`: the live CTA shifts in `github-dark`
  (`#58a6ff` → `#238636`), `github-light` (`#0969da` → `#1a7f37`) and `VIP`
  (paper `--lime-300` → `--green-500`); `gruvbox-dark` paper moves shade. In
  `theme-matrix` the new pair put the paper label at **3.73:1**, so this item
  also sets `--btn-success-text: var(--matrix-base)` there — black on the
  theme's bright green, the same 15.4:1 the old rule had. The remaining
  divergence is filed as BUG-0728, not fixed here.
- The icon buttons gain a 34 px hit area (they were 16 px glyphs with no
  padding), dim to 0.6 when disabled (they had no disabled style) and their
  copy/fetch hover goes `--success-color` → `--accent-color`. Rest colour is
  unchanged (`--text-secondary`).
- The pulse button is 34 px instead of 36, its rocket renders at 14 px rather
  than 16 (`.btn-base`'s `font-size` is unlayered and beats the `text-base`
  utility — the same cascade fact that produced `.btn-mono`), its scale hover
  is no longer animated (the primitive names its transition properties), and it
  no longer carries `btn-secondary-action` — `variant="default"` is the same
  colour pair.
- `tracking-[0.03em]` replaces `tracking-wider` (0.05em) on the submit label, to
  keep the old letter-spacing.
- `.copy-btn` and `.price-fetch-btn` survive for `AssistantView` and
  `TradeSetupInputs`, and they also still apply their right padding (8 px left /
  4 px right) and colour-only transition to the two migrated icon buttons. The
  variant wins every colour conflict; the asymmetry is intended for now.

**AC4 — the three-way action row.** Confirmed against FEAT-0606: §8.1 of
`docs/backlog/assets/FEAT-0605/ui-zustandsaufnahme.md` lists the row's controls
(`Language DE/EN`, Quiz, Iframe toggle and channels,
Guide/Changelog/Privacy/Whitepaper, plus the `🚀`) and files no finding about
ordering or grouping; §8.7 does not list them as cross-surface. The
`grid-cols-[1fr_auto_1fr]` split — locale left, utility centre, power right —
stays as it is. No BUG filed.

**AC5 — tests unmodified.** The ten `PlaceOrderPanel.*` component suites, plus
`PortfolioInputs`, `SummaryResults`, the two `GeneralInputs` suites and
`ExchangeAccountControls`, pass without a selector change: the old class names
remain as anchor classes on the migrated buttons, each with a comment saying so.
Only `Button.component.test.ts` grew a case.

**AC6 — FEAT-0328.** Re-read before the diff. Its compact one-row shape and the
two dialog chips are untouched (escaped, not migrated); the leverage/margin
sync feedback lives in those chips and is not affected.

**Guard scope.** `+page.svelte` is not in the guard even though its `🚀` moved:
the five raw buttons that remain there are FEAT-0610 and FEAT-0613 leftovers,
and escaping them here would claim coverage this item does not own. Recorded so
the next item adds it deliberately.

Audit §5 re-counted: **296** raw `<button>` across 89 files (368 before
FEAT-0610, 302 after FEAT-0611).

## Out of scope

- The calculation logic itself. Nothing here may change what a number is or how
      it is computed.
- `decimal.js` usage.
- The input fields. This item is buttons; inputs are FEAT-0609 and FEAT-0614.
- The window layout around the calculator.

## Open questions

- Does the three-way action row's symmetric layout reflect intent, or is it
  left over? FEAT-0606 is the item that answers this; this item should not
  guess.

## Links

- Evidence: [`assets/FEAT-0605/ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md) §1 and §5
- [FEAT-0328](FEAT-0328-compact-account-controls-and-fee-display.md)
- [FEAT-0606](FEAT-0606-button-placement-visibility-and-dependency-audit.md)
- [FEAT-0610](FEAT-0610-extend-and-adopt-the-button-primitive.md)
