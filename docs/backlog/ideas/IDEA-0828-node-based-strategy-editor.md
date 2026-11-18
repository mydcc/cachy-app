---
id: IDEA-0828
title: A node-based strategy editor as a second view over the rule document
type: idea
status: idea
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: ADR-0012
depends_on: []
size: XL
estimate: 34
---

# IDEA-0828 — A node-based strategy editor as a second view

## Problem

The sentence builder (FEAT-0813) reads rules as prose; some traders think in
graphs — indicators as nodes, operators combining them, exits as terminal
nodes, everything editable spatially on a blank sheet. Node editors are the
established mental model for visual automation in other domains.

The product owner proposed this as a *later, separate* idea that must not
load down the current epic (2026-11-18) — and asked for it to be recorded
with its boundaries drawn, not as an open-ended "visual programming" promise.

## The three hard boundaries (what makes it safe rather than a trap)

1. **A view, never a second engine.** The graph must always compile to the
   *same validated `RuleDocument`* the sentence builder produces. Anything a
   user cannot express as the document does not become a node. Two
   representations, one truth, one evaluator (ADR-0012).
2. **No code nodes.** Extensibility means new *primitives* (indicator,
   operand, pattern) added in the Rust core; the node palette derives
   automatically from the indicator catalogue. Executable user code stays
   forbidden.
3. **Compilation timing stays open on purpose** (owner decision, 2026-11-18):
   validate in real time on every edit *or* on save — both options remain
   valid until implementation; errors anchor to the offending node either
   way, like the sentence builder anchors to fields.

## Architecture consequence for today

The workshop keeps its editor **swappable**: the sentence builder is a layer
over the document, so a node editor can dock later as a second view without
touching the engine or the schema. That swap-friendliness is the only thing
this idea asks of the current epic.

## Links

- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`FEAT-0805`](../features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0813`](../features/FEAT-0813-condition-builder-v2-more-conditions-and-nested-groups.md)
- [`FEAT-0818`](../features/FEAT-0818-curated-literature-strategy-templates.md)
