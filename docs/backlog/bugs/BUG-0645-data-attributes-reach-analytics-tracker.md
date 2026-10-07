---
id: BUG-0645
title: data-* attributes survive sanitizeHtml and GlobalTracker forwards data-track-* to analytics
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

Found while reviewing PR #3926 (BUG-0638). Not fixed there on purpose: that
item is about test coverage and puts sanitizer policy changes out of scope.

## Symptom

`src/lib/utils/sanitizer.ts` sets no `ALLOW_DATA_ATTR`, so DOMPurify's default
applies and `data-*` attributes survive sanitization.

That is inert for XSS — no browser executes anything from a data attribute.
It is **not** inert for this codebase:

`src/components/shared/GlobalTracker.svelte` registers a document-wide click
listener, walks up from `event.target` (up to 15 levels), and for any element
carrying `data-track-id` does:

```ts
const id = target.dataset.trackId;
const contextStr = target.dataset.trackContext;
if (contextStr) { try { context = JSON.parse(contextStr); } catch { /* silent */ } }
trackInteraction(id, "click", context);
```

So attacker-supplied `data-track-id` and `data-track-context` reaching one of
the two `{@html}` sinks that go through `sanitizeHtml` would produce fake
analytics events with an attacker-chosen event id and arbitrary JSON payload.

## Reachability

Both current call sites of `sanitizeHtml`:

- `DisclaimerModal.svelte` — `sanitizeHtml($_("legal.disclaimerBody"))`, the
  app's own i18n string. Trusted; not reachable.
- `DialogView.svelte` — `sanitizeHtml(win.message)`, the window manager's
  dialog message. **Not yet traced to a source.** If any dialog message can
  carry untrusted text, this is live.

So the exposure is currently unproven, which is why this is filed rather than
fixed. It should not stay unproven indefinitely.

## Impact if live

Analytics poisoning, not code execution and not data exfiltration: events
carry an attacker-chosen id and JSON context to our own tracker. Realistic
harms are corrupted funnel metrics and a way to smuggle arbitrary structured
data into event payloads that something downstream might trust.

## Options

1. **Trace `win.message` first.** If no untrusted text can reach it, this is a
   hardening note, not a vulnerability — and the honest outcome is to record
   that rather than change policy.
2. **Tighten the sanitizer** with `ALLOW_DATA_ATTR: false`, or add
   `FORBID_ATTR: ['data-track-id', 'data-track-context']`. Narrower than
   option 1's blast radius: it only removes attributes that this app's own
   tracker reads, so app-authored `data-*` usage elsewhere would keep working.
3. **Scope the tracker** — have it ignore nodes inside sanitized regions, or
   check a marker attribute. More invasive, and it changes analytics
   behaviour, so it needs a decision on whether app-authored `data-track-*`
   inside dialogs is intentional.

Option 2 is the smallest change that removes the surface regardless of how
option 1 resolves, but it is a policy change and belongs in its own review.

## Evidence

- `grep -rn "dataset\.|getAttribute(['\"]data-" src` → three hits; two are in
  `GlobalTracker.svelte`, the third is a comment in `CandleChartView.svelte`
- the retention itself is pinned by a test in PR #3926, which is why it is
  now documented rather than silent

## Out of scope

Changing what the sanitizer permits in general, and auditing
`trackInteraction` payloads for unrelated reasons.