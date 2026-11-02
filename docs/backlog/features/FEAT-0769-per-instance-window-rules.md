---
id: FEAT-0769
title: Scope a window rule to one chart symbol
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0743]
assignee: opencode
branch: feature/feat-0769-per-instance-window-rules
---

# FEAT-0769 — Scope a window rule to one chart symbol

## Problem

FEAT-0743 shipped layout rules per window *type*. For every type with a single
instance that is exactly right. For charts it is not: a chart rule applies to
**every** chart, so a trader who opens BTCUSDT and ETHUSDT side by side gets
both windows on the same rectangle, one exactly on top of the other. The
feature that exists to save layout work creates it instead, and the first
thing a user does after enabling a chart rule is close and re-open a chart to
find out why.

This is the one gap FEAT-0743 left open on purpose — its *Out of scope* then
read "per-instance rules for charts/news"; this item closes the chart half and
that bullet now points here.

## Proposal

A rule may carry a scope: `match: { kind: "symbol", value: "BTCUSDT" }`. A
rule without a scope keeps today's meaning (every instance of its type).

- **Matching.** For a chart opened with symbol *S*, a rule scoped to *S* wins;
  otherwise the type-wide rule applies; otherwise the snapshot does.
- **Only `chart` may carry a scope.** Its instances are told apart by the
  symbol, which is also the identity a trader thinks in. The other
  multi-instance types have no per-instance identity a rule could name: `news`
  is the singleton market-news window, article readers are `iframe` windows with
  a generated id and one shared `news_article` snapshot key, and `channel` ids
  are developer-supplied. (`news`, `iframe` and `channel` have since left the
  rule-target list entirely; the chart scope is the only one left.)
- **Identity is the opened symbol.** `WindowBase` captures the constructor
  symbol before `restoreState()` can rewrite `symbol` from a snapshot, so a
  stale or hand-edited snapshot cannot select a different rule.
- **Validation is by shape, not by lookup.** A rule on a symbol that is not a
  current favourite (or was delisted since) survives a reload: it is a
  statement of intent, not a reference.
- **UI.** With `chart` selected in the add row, an optional symbol field
  appears (free text, `datalist` from `favoriteSymbols`). Empty means the
  type-wide chart rule. A scoped rule's card shows its symbol in the heading
  (`Chart · BTCUSDT`) and lets the symbol be corrected in place; a duplicate or
  malformed symbol is refused and the field snaps back, so what is shown is
  what is stored.

## Acceptance criteria

- [x] `WindowRule` gains an optional `match`; rules without one keep applying
      to every instance of their type, so stored FEAT-0743 payloads load
      unchanged.
- [x] A rule scoped to a chart's symbol wins over the type-wide chart rule for
      that chart, and the type-wide rule still applies to every other chart.
- [x] A chart whose symbol has no scoped rule keeps its snapshot even when
      another symbol has one.
- [x] Disabling a scoped rule falls back to the type-wide rule; only enabled
      rules compete.
- [x] The symbol is normalised (trimmed, upper-cased) on write and on match, so
      `btcusdt` and `BTCUSDT` are the same instance.
- [x] Matching uses the symbol the window was **opened** with, not one a
      snapshot restores.
- [x] The load path rejects a whole rule whose scope sits on a type that cannot
      have one, and rejects an empty, over-long or malformed symbol — it never
      strips the scope and widens the rule to the whole type.
- [x] A type may hold one type-wide rule plus one rule per symbol; duplicates of
      the same scope coalesce on load, enabled winning.
- [x] The editor offers the symbol field only for `chart`, refuses a duplicate or
      malformed symbol with an inline message, and keeps `chart` selectable after
      a chart rule exists.
- [x] Two chart rules render with distinct DOM ids, so their inputs do not
      collide.

## Out of scope

- **URL- or channel-keyed scopes.** Deliberately deferred (see Decisions); the
  `kind` discriminator is what keeps them additive later.
- **"Apply now" for open windows.** A rule still affects the next open only.
  Live application needs a public `WindowBase` method plus a re-stack for
  keep-above and a clamp against the current viewport — a different risk type,
  tracked separately as FEAT-0770.
- **Cascade offsets.** Two different symbols under one type-wide rule still
  overlap. Whoever wants them apart writes one rule per symbol.
- **A scope picker on the card.** The add row owns the scope; converting an
  existing type-wide rule to a scoped one means removing and re-adding it. A
  select on the card would have to represent "scoped, but no symbol yet", which
  is not a state the model has.

## Decisions

- **Only charts, only symbols.** URLs are once-per-article, so a rule on one is
  a bookmark, not a layout; channel ids are developer-facing. Modelling the
  scope as `WindowRuleMatch { kind }` keeps `url`/`channel` additive.
- **Free text with suggestions, not a restricted list.** Rules are Class A and
  local; requiring a current favourite would silently make a delisted symbol
  unruly.
- **Coexistence of type-wide and scoped rules, specific wins.** Per type *and*
  scope at most one rule; the two scopes are independent so a user keeps a
  working default and refines it per symbol.
- **The add row owns the scope.** No invalid intermediate state, no half
  persisted rule.
- **Form validation only** (`^[A-Z0-9._-]{2,30}$`). Existence is a market-data
  question that the rule layer must not ask.

## State

Implemented on `feature/feat-0769-per-instance-window-rules`. `WindowRule`
`match`, `findWindowRule(rules, type, { symbol })`, scope-aware sanitizer and
dedupe in `src/lib/windows/windowRules.ts`, the `ruleMatchSymbol` capture in
`WindowBase`, and the scope row in `VisualsLayout.svelte`.
