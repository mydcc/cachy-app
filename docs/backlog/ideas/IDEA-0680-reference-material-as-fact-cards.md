---
id: IDEA-0680
title: Turn reference material into reviewed fact cards
type: idea
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: experiment
data_class: none
adr: none
depends_on: []
start_date: 2026-10-13
size: M
estimate: 3
---

# IDEA-0680 — Turn reference material into reviewed fact cards

## State

Specced, not done. The pipeline ran and its output merged in #4045:
extraction happened outside the repository, and `docs/academy/` holds the 20
cards it was meant to produce, carrying no source reference.

Step three of the shape below — human review — has not happened, and this item
names that step as the product quality rather than a formality. Marking it done
would claim a read that nobody performed, so it is specced. The review is the
gate on writing the lesson texts, which is FEAT-0677's work rather than this
item's; nothing here blocks that gate being closed.

## The thought

The Academy categories FEAT-0677 and FEAT-0679 need written content, and writing
twenty-three indicator lessons plus structure material by hand is a large amount of
careful prose in two languages. There is reference material on hand that could ground
it, and grounding it would make the lessons better sourced than anything written from
memory.

## The shape being proposed, and the alternative that was rejected

```
reference material (local, outside the repository, never committed)
  → one offline extraction pass
  → src/lib/academy/knowledge/*.ts   fact cards: concept + summary + note
  → human review and rewrite
  → DE/EN lesson text is written from the cards
```

The cards are the artifact. The material is not. Each card records a concept and a
summary, written so that it stands on its own without naming where the idea came
from. The review happens outside the repository, against the material itself; the
card that lands here is the reviewed result, not a pointer to something unchecked.

**Rejected: a local RAG index over the material.** Embeddings in the browser,
encrypted alongside the credentials, retrieving passages at read time. It is
technically reachable — WebGPU is already in use for indicator calculation — but it
costs browser resources for content that does not change, makes lesson text
non-deterministic, adds a latency step to opening a lesson, and puts third-party
text on the device in a form that cannot be reviewed.

The cards are also the better starting point if RAG is wanted later: a reviewed
corpus is already chunked, already attributed and already correct, so retrieval over
it is a much smaller step than building one.

## Why this is recorded as an idea and not planned

Unreviewed generated summaries in a financial product are a liability. The review
step is the product quality here, not a formality, and it has to be someone's actual
time.

The review happens **outside the repository**, against the extracted material where
it sits alongside the original files. That is what lets a card carry no source
reference and still be trustworthy: the person who signs a card off has read the
material, and the card is the checked result rather than a pointer to something
unchecked. A card that reaches this repository has already been through that.

Extraction itself is settled: both PDF and EPUB formats extract cleanly, and the
result is greppable. That part is no longer an open risk.

## The boundary it must not cross

No third-party text enters the repository. What enters is our own summary, written in
our own words. That keeps the repository free of third-party content and keeps the
review honest, since a card is a claim someone stands behind rather than a passage
someone pasted.

Nor do the repo's own documents reference where the material came from. Coverage
notes, source titles and per-source measurements live outside the repository with the
material itself, where they inform the writing without becoming part of the project's
public record.

If this ever moves toward the RAG variant, the text would live encrypted on the
device, never in the repository and never sent anywhere — and that would need its own
ADR, because it puts third-party material at rest on the user's device.

## Links

- FEAT-0677 — the indicator lessons that need content first
- FEAT-0678 — the live-explanation feature; cards must never be sent to a provider
- FEAT-0679 — market structure content
- [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md) — the consent
  and egress boundary any corpus work stays inside
- [`ADR-0001`](../../adr/0001-local-first-boundary.md) — data classes