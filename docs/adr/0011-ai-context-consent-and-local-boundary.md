# ADR-0011: AI context consent and local-first egress boundary

- **Status:** Accepted
- **Date:** 2026-08-23
- **Deciders:** @mydcc

## Context

[`ADR-0001`](0001-local-first-boundary.md) established Cachy's Local-First data classes:
- **Class A (never leaves the device):** Journal entries, settings, private notes, API keys and secrets, presets, and trade drafts.
- **Class B (optional server features under explicit conditions):** Features that may send minimal data under strict opt-in consent.

During the identity and security audit on 2026-08-23 ([`BUG-0282`](../backlog/bugs/BUG-0282-ai-context-leaves-device-without-consent.md)), an unconsented data egress was identified in the AI assistant feature (`src/stores/ai.svelte.ts`):
1. Up to 50 journal entries (`recentHistory`), portfolio stats (`winrate`, `totalPnl`, `accountSize`), open positions, and current `tradeSetup` were automatically collected and attached to system prompts sent to third-party cloud AI providers (OpenAI, Google Gemini, Anthropic, OpenRouter) via `/api/ai/*` proxies.
2. The `aiConfirmActions` setting governed *actions executed by the AI*, not *data egress*.
3. When configured to use the local Ollama provider, a failure in the browser's direct connection to `http://localhost:11434` silently fell back to proxying the request through `/api/ai/ollama` on the server, violating the fail-closed expectation of local execution.

## Decision

1. **Default-Off for Class A AI Context Sharing:**
   - By default (`aiShareTradeContext = false`), NO Class A data (journal entries, portfolio stats, account size, open positions, live trade setup) is included in AI prompts.
   - When context sharing is disabled, only public market data (current price, 24h stats, public technicals/indicators, news headlines, CoinMarketCap data) and the user's explicit chat input are sent.

2. **Explicit, Granular, and Revocable Opt-In Consent:**
   - The user must explicitly toggle `aiShareTradeContext` (e.g. in AI Settings and side panel) to permit Class A trade context transmission.
   - The consent UI explicitly identifies the recipient (the selected AI provider).
   - Revoking consent immediately stops all Class A context egress for subsequent requests.

3. **Ollama / Local Provider Fails Closed:**
   - If the direct client-side fetch to Ollama (`localhost` or configured base URL) fails, the AI manager MUST fail closed and display an error message.
   - It MUST NEVER silently fall back to a server-side proxy endpoint.

## Consequences

### Positive
- Strict adherence to ADR-0001 data classification: Class A data never leaves the device without explicit, informed user consent.
- Users who choose local inference (Ollama) have guaranteed local containment.
- Users who use cloud AI models have transparent control over what personal trading information is shared.

### Negative / Trade-offs
- Without consent enabled, AI responses will be based only on market-wide data and user chat input, requiring users to explicitly enable context sharing if they want personalized journal/portfolio analysis.

## References
- [`ADR-0001: Local-First boundary and optional server features`](0001-local-first-boundary.md)
- [`BUG-0282: AI assistant sends journal, portfolio and trade setup to servers without explicit consent`](../backlog/bugs/BUG-0282-ai-context-leaves-device-without-consent.md)
