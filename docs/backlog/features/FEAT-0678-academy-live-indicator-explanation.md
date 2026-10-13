---
id: FEAT-0678
title: Explain the selected indicator against live data when a provider is connected
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: ADR-0011
depends_on: [FEAT-0677]
# assignee:            # required while status: in-progress (who is working this)
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
ADR-0011 governs, with the request path in `src/lib/ai/directRequest.ts`
(`buildOpenAiChat`, line 110), the stream adapter in `src/lib/ai/streamAdapters.ts`
(`parseOpenAiChat`, line 121), provider config in `src/stores/settings/aiProviders.ts`
(`ProviderConfig`, line 58; `AiApiFlavor`, line 41) and endpoint resolution in
`src/lib/server/aiEndpoint.ts` (`resolveProviderEndpoint`, line 26). Credentials are
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

## Acceptance criteria

- [ ] The live-explanation request goes through `src/stores/ai.svelte.ts` and the
      existing `src/lib/ai/` request path. No new provider client, endpoint
      resolution or credential handling exists in the Academy.
- [ ] `src/tests/ai/aiEgressConsent.test.ts` (BUG-0282) still passes unchanged, and a
      test is added that asserts an Academy-initiated request carries no Class A
      field under either consent state.
- [ ] With `aiShareTradeContext` at its default, an Academy request contains symbol,
      timeframe, indicator id, parameters and indicator values, and nothing else.
- [ ] With `aiShareTradeContext` enabled, an Academy request is unchanged from the
      default case. This feature gains nothing from the consent being on, and a
      diff here is a defect.
- [ ] No request is issued on lesson open, on tab switch, or on symbol change. A test
      asserts zero requests until the control is pressed.
- [ ] A failed direct connection to a local provider surfaces an error and issues no
      request to a server proxy. ADR-0011's fail-closed rule holds on this path.
- [ ] The UI names the provider that will receive the request, at the point of the
      control, before it is pressed.
- [ ] With no provider configured, the Academy renders and teaches in full. A test
      opens every tab and asserts content is present with the AI store empty.
- [ ] The reply renders as streamed text, and the surrounding lesson is unaffected
      while it arrives.
- [ ] The exchange of symbol and indicator values is not logged to telemetry, crash
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

- Should the explanation be regenerated when the user changes symbol inside the lesson,
  or only on an explicit press? Explicit press is the default here; auto-regeneration
  would put an unrequested egress behind a symbol switch.
- How much recent history is worth sending? Fifty candles is enough to describe a
  slope and cheap to send, but the answer's usefulness past that is unproven.
- What happens to the answer when the market moves? A live explanation is stale the
  moment it lands. It may need the symbol, timeframe and timestamp printed on it, so
  a screenshot taken later is not mistaken for current.

## Links

- `src/stores/ai.svelte.ts` — the AI surface this must reuse
- `src/lib/ai/directRequest.ts` — request path
- `src/lib/ai/streamAdapters.ts` — stream parsing
- `src/stores/settings/aiProviders.ts` — provider config
- `docs/adr/0011-ai-context-consent-and-local-boundary.md` — **the decision this applies**
- `docs/adr/0019-multi-provider-registry-and-credential-transit.md` — provider registry
- `docs/adr/0001-local-first-boundary.md` — data classes
- `docs/adr/0004-spacetimedb-data-scope.md` — why the symbol itself is user data
- `src/tests/ai/aiEgressConsent.test.ts` — the invariant that must keep passing
- `BUG-0282` — the egress bug ADR-0011 was written for
- FEAT-0677 — the lesson view this attaches to