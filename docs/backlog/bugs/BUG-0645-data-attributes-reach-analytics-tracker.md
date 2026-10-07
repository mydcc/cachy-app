---
id: BUG-0645
title: data-* attributes survive sanitizeHtml and GlobalTracker forwards data-track-* to analytics
type: bug
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
assignee: opencode
---

Branch: `fix/bug-0645-data-track-attrs`

Found while reviewing PR #3926 (BUG-0638). The test written there pins that
`data-*` survives `sanitizeHtml`, which is what turned this from a hunch into
a question worth answering.

## Symptom

`src/lib/utils/sanitizer.ts` sets no `ALLOW_DATA_ATTR`, so DOMPurify's default
applies and `data-*` attributes survive sanitization.

Inert for XSS — no browser executes anything from a data attribute. **Not**
inert for this codebase: `src/components/shared/GlobalTracker.svelte`
registers a document-wide click listener, walks up from `event.target` (up to
15 levels), and for any element carrying `data-track-id` does:

```ts
const id = target.dataset.trackId;
const contextStr = target.dataset.trackContext;
if (contextStr) { try { context = JSON.parse(contextStr); } catch { /* silent */ } }
trackInteraction(id, "click", context);
```

Attacker-supplied `data-track-id` / `data-track-context` reaching a `{@html}`
sink that goes through `sanitizeHtml` therefore produce fake analytics events
with an attacker-chosen event id and arbitrary JSON context.

## Reachability: confirmed, self-XSS only

19 `modalState.show()` call sites across 9 files. Three interpolate:

| Site | Interpolates | Source |
| --- | --- | --- |
| `src/services/app.ts:370` | `count` | a number — harmless |
| `src/components/settings/AccountList.svelte:116` | `account.name` | free text the user typed (line 140 is an editable input) |
| `src/components/results/PlaceOrderPanel.svelte:507` | `facts.symbol`, TP/SL text | `tradeState.symbol` — typed by the user, or picked from exchange symbol lists |

No external feed reaches a dialog message:

- `importFromCSV` imports journal entries only and interpolates a count.
- `src/lib/presets.ts` has no file import/export API at all — presets are
  localStorage only (`loadPresets` / `savePreset` / `deletePreset`).
- There is no account import path.

So an attacker would have to get the user to paste markup into their own
symbol field or their own account alias. That is self-XSS.

## Impact

Analytics injection, not code execution and not exfiltration. `sanitizeHtml`
still strips `script`, `on*`, `style` and `javascript:` URLs — proven by the
mutation runs recorded in BUG-0638. The realistic harms are corrupted funnel
metrics and a way to smuggle structured data into event payloads something
downstream might trust.

## Why the root-cause fix was rejected

The obvious alternative is to stop rendering dialog messages as HTML: switch
`DialogView.svelte` from `{@html sanitizeHtml(win.message)}` to escaped
interpolation, and the whole class disappears without a sanitizer change.

Checked rather than assumed, and it does not hold up. One message legitimately
uses markup:

```
orderEntry.confirm.message:
  {side} {qty} {symbol} als {type}-Order.<br>Take-Profit: {takeProfit}<br>Stop: …
```

Escaped rendering would drop those line breaks and print `<br>` literally. That
is a visible regression, and converting the message to newlines plus
`white-space: pre-line` is a real refactor with its own review. Worth doing on
its own merits, not smuggled in here.

## Fix

Narrow, in `sanitizeHtml`:

```js
FORBID_ATTR: ["data-track-id", "data-track-context", "data-track-ignore"],
```

One line. The `<br>` line breaks keep working, and the three attributes that
the app's own tracker consumes document-wide stop surviving sanitization.
Nothing legitimate needs them in sanitized content — the two `{@html}` call
sites are the legal disclaimer (the app's own i18n string, 1072 characters,
verified to contain no `data-track-*`) and dialog messages (i18n text plus
interpolated values). App-authored tracking attributes are set as literal
Svelte template attributes and never pass through here.

`FORBID_ATTR` is the right lever rather than `ALLOW_DATA_ATTR: false`:
DOMPurify checks `FORBID_ATTR` first, so the three attributes go while every
other `data-*` attribute is untouched. A test pins that distinction.

### `data-track-ignore` is the third one, and the worst

The first pass of this item named only `track-id` and `track-context` and
understood the exposure as injection only. Both halves were incomplete.
`GlobalTracker.svelte:33` also checks `target.dataset?.trackIgnore`, and it
tests `!== undefined` — so `data-track-ignore=""` is enough. That is an
attacker-controlled **opt-out**, not an injection: the goal is to *silence*
tracking, which is the opposite of what the other two enable.

It is also currently unused — grep finds the read in `GlobalTracker.svelte`
and no setter anywhere in the repo. Forbidding it costs nothing and closes a
vector that goes live the moment anyone wires up an opt-out.

## Acceptance criteria

- [x] reachability traced end to end, documented above
- [x] all three tracker-consumed attributes in `FORBID_ATTR`
- [x] a test pins that they do not survive
- [x] a test pins that unrelated `data-*` attributes **do** survive, so the
      guard cannot silently widen into a blanket ban
- [x] mutation proof: removing `FORBID_ATTR` reddens exactly the tracker test
      and leaves the other 14 green
- [x] `<br>` in `orderEntry.confirm.message` still renders, pinned by a test
- [x] both `{@html}` sinks' component tests green
- [ ] `npm test` green — CI

## Out of scope

Migrating `DialogView` to escaped rendering, and auditing `trackInteraction`
payloads for unrelated reasons.