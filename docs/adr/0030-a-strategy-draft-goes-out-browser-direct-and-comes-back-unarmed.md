# ADR-0030: A strategy draft goes out browser-direct under its own consent, and comes back unarmed

- **Status:** Accepted
- **Date:** 2026-11-21
- **Deciders:** @mydcc

## Context

[`FEAT-0817`](../backlog/features/FEAT-0817-ai-assisted-rule-authoring.md) wants a
model to translate a prose description of a setup into a draft `RuleDocument`.
The item has been `specced` and unimplementable since it was written, because one
question blocks it: the trader's prose, the symbol and the timeframes are Class A
strategy data, and sending them to a model that does not run on the device is
egress that [`ADR-0001`](0001-local-first-boundary.md) does not cover.
[`TODO.md` §33](../TODO.md#33--ai-assisted-rule-authoring-scope-and-egress) carried
the choice; this ADR closes it.

Four facts constrain the answer, and the first two narrow it a long way:

1. **The data model already exists.** `AuthoringSource { Human, Model }` and
   `Provenance { source, created_at_ms, model }` ship in the core
   (`technicals-wasm/src/rule/document.rs:63-80`), and the doc comment there
   names [`ADR-0012`](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
   decision 4 as the reason. `Provenance.model` is documented as Class A that
   never leaves the device. Nothing in this ADR invents a provenance concept; it
   decides what may fill it.

2. **The transport question is mostly already decided.**
   [`ADR-0019`](0019-multi-provider-registry-and-credential-transit.md) turned AI
   providers into a registry (`ProviderConfig`,
   [`aiProviders.ts:58`](../../src/stores/settings/aiProviders.ts)) whose default
   transport is browser-direct ([`directRequest.ts`](../../src/lib/ai/directRequest.ts)),
   with a per-provider, default-off server relay as the only sanctioned
   exception, and loopback entries (Ollama, OmniRoute — `isLoopbackBaseUrl`,
   `aiProviders.ts:414`) always browser-direct. So "hosted model or local model"
   is not a product fork: both are registry entries the trader configures. What
   is genuinely undecided is *what payload* may travel and *under which
   consent*.

3. **The existing consent switch covers a different payload.**
   `aiShareTradeContext` ([`settings.svelte.ts:530`](../../src/stores/settings.svelte.ts))
   governs journal entries, portfolio stats, account size, open positions and the
   live trade setup, per [`ADR-0011`](0011-ai-context-consent-and-local-boundary.md)
   decision 1. It was written for a chat assistant reading the trader's history.
   Authoring sends something ADR-0011 never weighed: the trader's *intent* — the
   strategy they are about to run — and receives a document back.

4. **ADR-0012 already forbids the dangerous use and anticipated this one.**
   Decision 4: the model proposes, the engine decides, the gate executes; its
   output is inert until a human arms it. Decision 6: a rule sent to a model for
   critique is context sharing under ADR-0011, "default off, explicit, per
   request". Decision 8: what improves over time is a local register, not a
   model.

The fact that argues against this decision: every hosted option, however direct,
means a third party receives the trader's strategy before they trade it, and
that party may log it. A local-only feature would not have that property. The
decision below accepts the risk, prices it, and refuses to make it invisible.

## Decision

**1. The draft request goes browser-direct to a provider the trader configured.
Cachy operates no model and is never the recipient.**
Authoring reuses the ADR-0019 registry and the ADR-0019 direct transport. There
is no Cachy-hosted authoring endpoint, no shipped default provider, and no
provider Cachy pays for — the same shape as
[`ADR-0018`](0018-user-directed-egress-of-class-a-announcements.md) decision 2.
A trader who wants zero egress points the feature at a loopback entry — **where
the page's connection policy lets it reach one; the hosted build does not, see
the Amendment below.** That is a configuration, not a second code path, and the
feature must not behave differently for it beyond what the endpoint itself
implies.

**2. The server relay of ADR-0019 is refused for authoring, and the refusal is
readable.**
The relay exists so a *credential* can reach a provider that will not answer a
cross-origin request; its cost is a credential hop through Cachy
infrastructure. Routing strategy prose through that hop would make Cachy a
recipient of Class A strategy, which is the line ADR-0001 draws and ADR-0018
decision 2 restates. So authoring fails closed on a relay-only provider, with a
message naming why, in the shape of ADR-0011 decision 3 — never a silent
fallback.

**3. Authoring egress has its own consent, default off and revocable, and it
neither implies nor is implied by `aiShareTradeContext`.**
A new setting (`aiRuleAuthoringEgress`) gates the feature. The consent UI names
the recipient — the resolved registry entry's label and base URL — and states
what the request contains. Two switches, because they admit two different
payloads in two different directions: consenting to share a journal must not
quietly consent to sending a strategy, and vice versa. Revoking stops egress
for every subsequent request.

**4. The authoring prompt is a closed list, and the list is shown before the
first request.**
May travel: the trader's prose, the symbol, the trigger timeframe, and the
machine-readable description of the condition language itself (operand names,
operators, enum values, limits) — the latter is Cachy's schema, not the
trader's data. May not travel, with both switches on: journal entries, account
size, balances, open positions, other rules, any `id` or document hash, any
credential, and the registry's other entries. ADR-0011's gate is unchanged by
this ADR: the authoring switch does not admit Class A *context* into an
authoring prompt.

**5. The model may propose conditions, veto and exits. It may not propose the
stop, and it may not arm anything.**
The stop stays the trader's, required before arming
([`ADR-0020`](0020-automation-envelope-promotion-and-simulate-bots.md) decision
6: an order without a stop is not a bot order). A draft is saved
`enabled: false`, and saving is not arming — two actions, never one. The model
may not set `enabled`, `id`, `created_at_ms`, or any field that decides
lifecycle. `external_feed` stays legal only in `veto` (ADR-0012 decision 7); the
core refuses it elsewhere and authoring does not pre-empt that refusal, it
surfaces it.

**6. Every draft is validated by the core, field by field, and an unmappable
request is answered with "not expressible".**
The draft goes through `ruleSchema.validate`
([`ruleSchema.ts`](../../src/lib/rules/ruleSchema.ts)) before it is shown, and
refusals are rendered per field next to the read-back sentence. A draft is never
silently repaired to make it validate, and a prose request the language cannot
express yields a stated reason and no document — a plausible-looking document
for an inexpressible request is the worst available outcome, because it reads as
an answer.

**7. `provenance.source: "model"` records; it never authorises. Lineage is
carried by `derived_from_hash`, and promotion deliberately does not inherit the
model.**
`provenance` is excluded from the content hash (`EXCLUDED_FROM_HASH`,
`document.rs:889`), and per ADR-0020 an unhashed field may not gate a decision:
no code path may widen or narrow what a rule is permitted to do because a model
drafted it, and nothing may treat a model-drafted draft as pre-validated. How
far the field travels is already settled in the core, and this ADR adopts that
behaviour rather than changing it:

- **Duplication keeps it.** `duplicateRule`
  ([`ruleActions.ts:167`](../../src/services/alertEngine/ruleActions.ts)) spreads
  the source's provenance and overrides only `created_at_ms` and
  `derived_from_hash`, so a copy of a model-drafted rule is still
  model-attributed.
- **Promotion resets it to `Human` and drops `model`.** `RuleDocument::promote`
  (`document.rs:745-783`) does this on purpose — a human clicked promote, and
  crediting a model with a document it never saw would corrupt the register of
  ADR-0012 decision 8. The lineage is not lost: the promoted bot's
  `derived_from_hash` names the draft it descends from, so "this bot came from a
  model-authored alert" is answerable in one hop. Pinned by
  `a_promoted_bot_starts_disarmed_and_credits_no_model` (`document.rs:1369`).

FEAT-0817's third acceptance criterion asked for the opposite — `source: "model"`
surviving promotion — and is corrected in that item by this decision.

**8. The model stays out of the evaluation loop by construction, not by
discipline.**
It is reached through a port called only from the authoring surface, the way
FEAT-0816 wired feeds without the engine importing a provider. `src/lib/rules/`
and the alert engine must not import the authoring client, and the architecture
ratchet (`scripts/arch-cycles.mjs`, `scripts/arch-baseline-guard.mjs`) is what
proves it. There is no "ask the model whether this should fire" path and no
confidence number anywhere near the gate.

## Consequences

### What this enables

- FEAT-0817 becomes buildable: the blocking question has an answer, and the
  answer needs no new transport, no new credential path and no new provenance
  field.
- A trader who will not send strategy text anywhere can still get the feature
  by pointing it at a loopback entry, without Cachy shipping or maintaining a
  heavy local client — but not in the hosted build (see the Amendment).
- The egress is legible: one switch, one named recipient, one enumerable
  payload, revocable, and separate from the chat assistant's consent.

### What this costs

- A second consent switch next to `aiShareTradeContext` is more UI and more
  explaining, and two switches can be misread as one. The alternative — one
  switch for both payloads — is worse, but this is the real price.
- Refusing the relay means a trader whose only reachable provider needs the
  relay cannot use authoring at all. They must configure a CORS-capable
  provider or a loopback one. That is a feature that visibly does not work for
  some valid setups.
- The honest hosted answer is still egress. A provider may log the prose. Cachy
  can say so and can keep the payload minimal; it cannot promise what the
  recipient does.
- Forbidding the stop means the model cannot deliver a complete armable bot. The
  trader always finishes the document by hand — which is the point, and it is
  also friction.

### What is now forbidden

- A Cachy-operated model endpoint, a shipped default provider key, or any
  authoring request that reaches a Cachy server — including through the ADR-0019
  relay.
- Gating authoring on `aiShareTradeContext`, or letting either switch imply the
  other; and shipping the feature with either consent defaulting to on.
- Putting journal entries, balances, account size, open positions, other rules,
  document hashes or credentials into an authoring prompt, under any consent
  combination.
- A model-supplied `stop`, `enabled: true`, `id` or `created_at_ms`; a save
  action that also arms; and any decision — validation, limits, promotion,
  consequence level — that reads `provenance.source`.
- Changing `promote` to carry `source: model` or `model` forward in order to
  satisfy an authoring requirement. The register counts who acted; lineage is
  `derived_from_hash`.
- An import of the authoring client from `src/lib/rules/` or the alert engine, a
  model call on the evaluation path, and a confidence score that gates a
  trigger or an order.
- Repairing an invalid draft silently, or returning a document for a request the
  condition language cannot express.
- Reading `aiRuleAuthoringEgress` as consent for anything but drafting. This ADR
  covers the first of [`IDEA-0829`](../backlog/ideas/IDEA-0829-ai-agent-bot-authoring-and-audit.md)'s
  four proposals. A pre-arm audit sends an existing document rather than a
  description of one, and track-record analysis sends journal data — which is
  ADR-0011's switch, not this one. Each needs its own decision before it ships.

## Amendment 2026-11-22 — decision 1: loopback is not available in the hosted build

[`BUG-0835`](../backlog/bugs/BUG-0835-ai-egress-cannot-reach-loopback-and-follows-redirects.md)
found that decision 1 reads as if a loopback entry works everywhere. It does
not. The owner decided on 2026-11-22 that the hosted build does not reach
loopback, and that the failure names the connection policy as its cause.

**What changes in decision 1.** The zero-egress configuration is not available
in the hosted build. `connect-src` in
[`cspDirectives.ts`](../../src/config/cspDirectives.ts) has no `http:` source
and Cachy does not widen it for this: a wider policy would apply to every
script the page loads, and it would still not make the feature work, because
Chrome gates a public page's loopback access behind its own permission and
expects the local server to answer the preflight (reported by vendor sources,
not read from Chrome's guide). The request fails before it leaves the browser,
and the message says so; it does not suggest the relay, which authoring refuses
on purpose (decision 2).

**What was probed (2026-11-22).**

- A page served from `http://127.0.0.1:18434` with the header generated from
  `cspDirectives` reached no other loopback port: `fetch` to
  `http://127.0.0.1:18435` was refused with a `connect-src` violation. The same
  page served without a CSP header reached the server (which answered with open
  CORS). So the policy is the blocker, and a page that itself sits on a local
  address is no exception while it carries this policy.
- The four built-in remote endpoints answered an unauthenticated `POST` with an
  empty JSON body directly (OpenRouter 401, OpenAI 401, Gemini 403, Anthropic
  401), none with a 3xx, so refusing redirects breaks none of them.

**What was not probed, so it is not claimed.** Whether the dev server or a
self-hosted instance emits the same header (the probe used the directives, not a
running instance); and an HTTPS page reaching loopback in a real Chrome with the
permission granted. Until that is checked, "works anywhere else" is unknown, not
yes.

**Consequence for the alternatives below.** "Local model only" was rejected
partly because "a local entry is available to anyone who wants one". In the
hosted build that is no longer true, which strengthens the case for the consent
switch rather than for mandating local models: with no loopback option there,
the hosted trader's only zero-egress choice is not to use authoring.

Every browser-direct fetch that carries a credential or a draft (the chat and
authoring transport, both its direct and its local branch, and the direct model
listing) now refuses a redirect instead of following it, and names the
recipient the trader configured.

## Alternatives considered

- **Local model only (require Ollama or an equivalent).** No egress at all, and
  it was the honest-looking option. Rejected: ADR-0019 already makes a local
  entry available to anyone who wants one, so mandating it buys no privacy that
  consent does not buy, while making the feature unavailable to the majority who
  will not run a model locally — and turning Cachy into the maintainer of a heavy
  client it does not otherwise need.
- **Reuse `aiShareTradeContext` as the single AI-egress consent.** Fewer
  switches, one mental model. Rejected: it would mean a trader who enabled
  journal sharing for chat analysis has, without being asked, also consented to
  sending every strategy they draft — and a trader who wants authoring would
  have to admit their journal to get it.
- **A Cachy-operated authoring endpoint** (one key, one prompt template, no
  per-trader provider setup). Much better onboarding. Rejected: it makes Cachy
  the recipient of Class A strategy data, which ADR-0001 forbids and ADR-0018
  decision 2 already refused for a strictly smaller payload.
- **Allow the ADR-0019 relay under an extra explicit opt-in.** Consistent with
  how ADR-0019 handles a provider that refuses CORS. Rejected for now: the
  relay's sanctioned purpose is a credential hop, and widening it to carry
  strategy prose is a different decision with a different blast radius. If a
  trader population genuinely needs it, that is an amendment to this ADR, argued
  on its own.
- **Let the model propose the stop too**, so a draft is complete. Rejected:
  ADR-0020 decision 6 makes the stop the field that bounds risk, and a
  risk-bounding number supplied by a model and confirmed by a tired human is the
  one place where "it looked plausible" costs money.

## References

- [`ADR-0001: Local-First boundary`](0001-local-first-boundary.md)
- [`ADR-0011: AI context consent and local-first egress`](0011-ai-context-consent-and-local-boundary.md)
- [`ADR-0012: A strategy is checkable data`](0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
- [`ADR-0018: User-directed egress of Class A announcements`](0018-user-directed-egress-of-class-a-announcements.md)
- [`ADR-0019: User-managed AI providers and credential transit`](0019-multi-provider-registry-and-credential-transit.md)
- [`ADR-0020: Promotion derives a bot`](0020-automation-envelope-promotion-and-simulate-bots.md)
- [`FEAT-0817`](../backlog/features/FEAT-0817-ai-assisted-rule-authoring.md),
  [`TODO.md` §33](../TODO.md#33--ai-assisted-rule-authoring-scope-and-egress)
- [`IDEA-0829`](../backlog/ideas/IDEA-0829-ai-agent-bot-authoring-and-audit.md)
  — the wider agent proposal this ADR covers one quarter of
- `technicals-wasm/src/rule/document.rs`, `src/lib/rules/ruleSchema.ts`,
  `src/stores/settings/aiProviders.ts`, `src/lib/ai/directRequest.ts`
