---
id: FEAT-0678
title: Explain the selected indicator against live data when a provider is connected
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0011
depends_on: [FEAT-0677]
assignee: opencode
branch: feature/feat-0678-academy-live-explanation
---

# FEAT-0678 — Explain the selected indicator against live data when a provider is connected

## Problem

FEAT-0677 writes what an indicator *claims*. That is written once and never changes,
and it is the same for every symbol and every market condition. The question a trader
actually asks at the chart is different: *what is this indicator saying about
<symbol> right now?*

Answering it needs an explanation written at read time, from the live values in front
of the user. Cachy already has an AI surface that does exactly this shape of work for
the assistant panel. The gap is that the Academy cannot reach it.

**This item needs no new ADR.** [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md)
already decides the boundary this feature crosses, and this item applies it rather
than reopening it. Specifically:

- Consent is governed by the existing `aiShareTradeContext` toggle. **This item adds
  no new consent switch**, because ADR-0011 already settles what the toggle means and
  a second, narrower one would be a way around it.
- With sharing off, ADR-0011 already permits public market data — current price, 24h
  stats, public technicals and indicators — plus the user's own input to be sent.
  Indicator values and a symbol are in that permitted set. So the baseline feature
  needs **no opt-in at all**.
- Class A stays where it is. No journal entry, portfolio statistic, account size,
  open position or trade setup may reach a provider through an Academy path.
- Local inference fails closed. A failed direct connection to Ollama shows an error;
  it never silently falls back to the server proxy.

## Proposal

In the lesson view from FEAT-0677, alongside the static text, an on-demand control
that asks the user's *configured* provider what the indicator is currently saying
about the *currently selected* symbol, and streams the answer in.

**Route through the existing manager.** `src/stores/ai.svelte.ts` is the AI surface
ADR-0011 governs. The provider call itself is being split out of `sendMessage`
(`src/stores/ai.svelte.ts:327`) into `src/lib/ai/completion.ts` so that the chat and
the Academy share one request path instead of two. Around that seam: the request
builder in `src/lib/ai/directRequest.ts` (`buildDirectRequest`, line 246), the stream
adapter in `src/lib/ai/streamAdapters.ts` (`parseStreamChunk`, line 86), provider
config in `src/stores/settings/aiProviders.ts` (`ProviderConfig`, line 58;
`AiApiFlavor`, line 41; `resolveActiveProvider`, line 591) and endpoint resolution in
`src/lib/server/aiEndpoint.ts` (`resolveProviderEndpoint`, line 47). Credentials are
encrypted on the device; the browser talks to the provider directly unless the relay is
enabled. The Academy adds a consumer. It does not add a provider stack, and it must
not have its own request path — a second path is exactly how ADR-0011's invariant
would stop holding.

**What is sent.** Symbol, timeframe, indicator id and parameters, and the recent
indicator values. That is it. **What is never sent:** journal, portfolio, account
size, open positions, trade setup, presets, API keys, settings. The static lesson text
is not sent either — it is already on the device.

**The one real design difference from the chat panel.** In the assistant the user
types a question and the reply is an answer to it. In a lesson nobody asked; the
explanation arrives unprompted. So the control is **per-lesson, explicit, and not
automatic** — no call on page open, no call on tab switch, no prefetch. The user asks
by pressing, and the reply is visibly attributed to the provider that produced it.

**No provider connected is a normal state, not an error.** The control is simply
absent or disabled with a short line pointing at Settings. Nothing about the Academy
depends on a provider existing.

## State

**Done.** The control sits under the live chart in every lesson and asks nothing
until it is pressed.

Shipped:

- `src/lib/ai/completion.ts` — target resolution and the stream transport,
  extracted from `sendMessage`; writes no store state, so the chat and the
  lesson cannot overwrite each other's error or streaming flag.
- `src/stores/ai.svelte.ts` — `sendMessage` delegates to it; `askOnce()` is the
  transcript-free entry, and `providerStatus()` names the recipient.
- `src/lib/academy/liveExplanation.ts` — the egress allowlist as two pure
  functions. Symbol, timeframe, indicator, parameters, the last 50 values and a
  timestamp; nothing else can be added without failing its test.
- `src/lib/academy/useLiveExplanation.svelte.ts` — one answer at a time, abort
  on leave, cancellation never shown as an error.
- `src/components/shared/LiveExplanation.svelte` — button, provider name,
  streamed text, frozen header, disabled state without a provider.
- `src/components/shared/IndicatorLessonChart.svelte` — reports the series it
  actually drew, so the answer describes the values on screen.

Proven by `liveExplanation.test.ts`, `useLiveExplanation.test.ts`,
`ai.askOnce.test.ts`, `academyEgress.test.ts`,
`LiveExplanation.component.test.ts`, `IndicatorLessonsView.component.test.ts`,
`IndicatorLessonChart.readout.component.test.ts`, plus the unchanged
`aiEgressConsent.test.ts` and `ai.providerFailures.test.ts`.

## Design decisions

Settled before implementation, so the code follows from them rather than the other
way round.

1. **One request path, two consumers.** `resolveChatTarget` and `streamCompletion`
   move out of `sendMessage` into `src/lib/ai/completion.ts`. The module writes no
   store state — no `error`, no `isStreaming` — because the chat and the lesson must
   not overwrite each other's streaming status. Errors are thrown; the caller
   decides how to show them.
2. **A narrow context, not `gatherContext()`.** `src/lib/academy/liveExplanation.ts`
   builds the payload from what the lesson already holds (catalogue entry, effective
   parameters, the series the chart drew) and from nothing else. Being pure, it makes
   acceptance criteria 3 and 4 properties of a function rather than of a caller.
3. **A prompt of its own.** `buildSystemPromptParts` is a risk analyst with an action
   schema; reusing it would produce a trade opinion instead of an explanation. The
   Academy request therefore carries no `tools`, so a lesson can never change the
   trade form.
4. **Answer lifetime.** The reply is frozen: symbol, timeframe and timestamp live in
   its header, and leaving the lesson discards it. A screenshot taken later cannot be
   mistaken for a current statement.
5. **Window.** The last 50 values per declared line, `null` preserved where the
   engine is indeterminate (warmup is not zero — see FEAT-0677).
6. **Cancel on leave.** A running request is aborted when the user leaves the lesson
   or switches symbol. An abort is not an error: no error surface, no message, the
   control returns to idle. Partial text is discarded, never shown.

## Acceptance criteria

- [x] The live-explanation request goes through `src/stores/ai.svelte.ts` and the
      existing `src/lib/ai/` request path. No new provider client, endpoint
      resolution or credential handling exists in the Academy.
- [x] `src/tests/ai/aiEgressConsent.test.ts` (BUG-0282) still passes unchanged, and a
      test is added that asserts an Academy-initiated request carries no Class A
      field under either consent state.
- [x] With `aiShareTradeContext` at its default, an Academy request contains symbol,
      timeframe, indicator id, parameters and indicator values, and nothing else.
- [x] With `aiShareTradeContext` enabled, an Academy request is byte-identical to the
      default case. This feature gains nothing from the consent being on, and a
      diff here is a defect.
- [x] No request is issued on lesson open, on tab switch, or on symbol change. A test
      asserts zero requests until the control is pressed.
- [x] A failed direct connection to a local provider surfaces an error and issues no
      request to a server proxy. ADR-0011's fail-closed rule holds on this path.
- [x] The UI names the provider that will receive the request, at the point of the
      control, before it is pressed.
- [x] With no provider configured, the Academy renders and teaches in full. A test
      opens every lesson with the AI store empty and asserts the lesson's own text
      is present, and that no request is issued.
- [x] The reply renders as streamed text, and the surrounding lesson is unaffected
      while it arrives.
- [x] The exchange of symbol and indicator values is not logged to telemetry, crash
      reporting or debug output.

## Out of scope

- **Proactive or scheduled AI statements.** "A divergence just appeared" is an alert,
  and alerts already exist through the template library. It is not the Academy's job.
- **AI-generated baseline lesson text.** Baseline prose is hand-written and reviewed
  (FEAT-0677). Generating it at build time is a separate decision about a separate
  pipeline, and it is not needed for this item to be worth doing.
- **Sending the static lesson text to the provider.** It is already on the device.
- **Any chat, history or follow-up conversation.** This is a single question with a
  single streamed answer.
- **A new settings toggle, a new consent dialog, or a per-provider allowlist.**
- **Retrieval over a body of reference material.** Out of scope for this item; it
  would change what leaves the device and under what consent.

## Open questions

All three are answered; see "Design decisions" above.

- **Regenerate on symbol change?** No. Only an explicit press asks. A symbol switch
  discards the answer and aborts a running request (decision 6), because either
  would otherwise put an unrequested egress behind a symbol change.
- **How much history?** Fifty values per declared line (decision 5).
- **What happens when the market moves?** The answer is frozen with symbol, timeframe
  and timestamp in its header and is discarded on leaving the lesson (decision 4).

## Links

- `src/stores/ai.svelte.ts` — the AI surface this must reuse
- `src/lib/ai/completion.ts` — **new**: the shared request path
- `src/lib/ai/directRequest.ts` — request builder
- `src/lib/ai/streamAdapters.ts` — stream parsing
- `src/stores/settings/aiProviders.ts` — provider config and `resolveActiveProvider`
- `src/lib/academy/liveExplanation.ts` — **new**: the narrow payload and its prompt
- `src/components/shared/IndicatorLessonsView.svelte` — where the control mounts
- `docs/adr/0011-ai-context-consent-and-local-boundary.md` — **the decision this applies**
- `docs/adr/0019-multi-provider-registry-and-credential-transit.md` — provider registry
- `docs/adr/0001-local-first-boundary.md` — data classes
- `docs/adr/0004-spacetimedb-data-scope.md` — why the symbol itself is user data
- `src/tests/ai/aiEgressConsent.test.ts` — the invariant that must keep passing
- `BUG-0282` — the egress bug ADR-0011 was written for
- FEAT-0677 — the lesson view this attaches to