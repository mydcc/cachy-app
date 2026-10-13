# ADR-0025: Academy lesson fields are four prose keys, placement is a catalogue property

- **Status:** Proposed
- **Date:** 2026-10-13
- **Deciders:** repo owner

## Context

FEAT-0677 specifies a lesson as six layered fields: `whatItMeasures`,
`howToRead`, `failureModes`, `confirmation`, `params`, `chartOverlay`
(`docs/backlog/features/FEAT-0677-academy-indicators-category.md`, lines
78–85). The prose for all twenty-three indicators is written and merged (#4051
for trend and volatility, #4053 for oscillators and volume), carrying four keys.

The item's `chartOverlay` ships under the name `placement`. The rename is
deliberate: half the values are panes rather than overlays, and a name that says
"overlay" would be wrong for fourteen of the twenty-three entries. Everywhere
below and in the code, the field is `placement`.

The two specified-but-absent fields are not an oversight, and the reason differs
between them.

**`params` already exists and is not prose.** `indicatorCatalogue.ts` holds
`params: readonly CatalogueParam[]` per entry — name, kind, default — and
`paramKey(param)` resolves to `dashboard.alerts.indicators.param.*`, which
already carries all seventeen parameter names in both locales. A second copy
under `academy.indicators.*` would duplicate a fact that has an owner, and the
duplication rule in `AGENTS.md` applies to locale keys as much as to documents.

**The placement field cannot be derived, and must therefore be stored on the
catalogue.** The tempting derivation — placement follows from the output
`dimension` — is false, and three catalogue entries disprove it: `ema`, `atr`,
`ao` and `momentum` each declare exactly one `price` output, yet `ema` is
overlaid on the price while the other three sit on a separate axis. Likewise
`super_trend`, `parabolic_sar`, `ichimoku` and `bollinger` all declare multiple
`price` outputs and all four are overlaid, while `macd`, which also declares
three, is not. Counting outputs and dimensions reproduces 12 of the 19 cards
that state a placement and fails on the other 7.

There is no hidden signal to recover either. `dimension` exists in this codebase
for exactly one purpose: operand compatibility. `dimensionOf` and
`compatibleIndicators` exist so the alert builder never offers a pairing the core
would refuse with `operand_dimension_mismatch`
(`src/components/alerts/tabs/IndicatorsTab.svelte`, lines 23–27). Nothing in the
repo reads `dimension` for drawing, and there is no overlay field anywhere in
`src/`.

So placement is a property of the indicator, not of its values. That is not a
gap in the design — it is the design: whether a band belongs on the price or in
its own pane is a rendering decision about the indicator, and a trader reading
the lesson needs it stated, not recomputed.

**The four prose fields are the ones with no other home.** They are reviewed
text, and `failureModes` is the field the category exists for
(`docs/academy/README.md`: "Why `failureModes` is the load-bearing field").
Their names are load-bearing too: `TranslationKey` is derived from the English
dictionary, so renaming one after the tab ships costs a change to every locale,
every call site and every test that names the key.

On naming: `whatItMeasures`, `howToRead` and `failureModes` are kept as
specified. `confirmation` is kept rather than renamed to `pairsWith` — the cards
head that section "Pairs with", but the value carries the setup the indicator
becomes, and `confirmation` names that more precisely than a preposition does.

## Decision

An Academy lesson is exactly four localisation keys under
`academy.indicators.<indicatorId>`:

| Key | Carries |
|---|---|
| `whatItMeasures` | what the indicator computes, two or three sentences |
| `howToRead` | the readings that mean something |
| `failureModes` | the conditions under which a reading is worthless |
| `confirmation` | what it pairs with to become a setup |

Neither `params` nor the placement field is a localisation key.

`params` is read from `INDICATOR_CATALOGUE.params` through `paramKey`, and
placement becomes a **typed property on the catalogue entry** — shipped as
`placement: "price" | "pane"` — beside `dimension`. Not prose, and not
duplicated into the lesson. The catalogue is the single source; the renderer
reads it; the cards stay the reviewable statement of the same fact.

Both locales carry the same key set under `academy.indicators.*`, and every
indicator in `REGISTRY_CATALOGUE` has all four in both. `check_translations.sh`
fails the build when one is missing from either side.

## Consequences

### What this enables

The lesson prose has a fixed, reviewable shape that the cards map onto one to
one, and implementing the tab needs no schema decision. Renaming a field now
costs a mechanical change to two locale files; after the tab ships it costs a
change to every call site and every test naming the key. Stating placement in the
catalogue rather than inferring it stops the next person from re-deriving a rule
that does not exist.

### What this costs

The four names are a contract. A lesson field that a future card needs — a
worked example, a timeframe caveat — is not a new key but a new sentence inside
one of the four, because the renderer only knows four. That is intended rather
than accidental: FEAT-0677's open question about whether `failureModes` may
carry a conditional example was answered prose-only, and a four-field shape is
what makes "prose-only" enforceable instead of aspirational.

The `placement` property is catalogue work that did not exist before this
decision — one property per entry, mirrored from the cards' `On the chart`
lines. It is
small, but it is a change to the file the alert builder reads, not to content.