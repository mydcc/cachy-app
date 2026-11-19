# Manual trade form vs. bot — the protection parity matrix

Every protection the manual trade form offers must have a bot equivalent —
shipped, planned with the backlog item that will ship it, or not applicable
by design with the reason stated. This matrix is
that agreement, and `scripts/bot-parity.test.ts` guards it: the test fails
when a protection row is deleted, when a manual protection is listed
without its bot counterpart, or when a "planned" claim carries no FEAT item,
so parity
cannot silently erode while features ship on one path only
([FEAT-0811](backlog/features/FEAT-0811-superbot-editor-for-exit-conditions.md),
§4; delivered by
[FEAT-0826](backlog/features/FEAT-0826-overhaul-the-public-documentation-for-the-bot-era.md)).

This document compares protections, not vocabulary. What a bot *is* — and
where the trigger-order metaphor ends: a waiting bot behaves like a resting
conditional entry, but is not an order — is defined in exactly one place,
[`alert-system.md`](alert-system.md#bot-vs-order-where-the-trigger-order-metaphor-ends)
("Bot vs. order"). Ownership (a bot owning the position it opens,
[ADR-0026](adr/0026-a-bot-owns-the-position-it-opens.md)), recurrence (a
firing policy with limits,
[FEAT-0822](backlog/features/FEAT-0822-bot-firing-policy-and-guards.md)) and
versioning (changing a running strategy without losing the track record) are
deliverables of the bot epic
([FEAT-0805](backlog/features/FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md))
— planned, and none of them shipped behavior today.

## The one-path rule

There is one execution path, not two. A bot's order enters through the same
gate as a manual click — `tradeService.placeOrder` → `OrderGate` — by
decision 5 of
[ADR-0012](adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md)
and per
[ADR-0020](adr/0020-automation-envelope-promotion-and-simulate-bots.md);
`src/services/alertEngine/botOrders.ts` re-implements none of the
gate-level checks below — its one own refusal (`no-stop`) enforces the
envelope's mandatory stop before anything is sent, which is why the Auto
stop-loss row credits `submitBotOrder` rather than the gate. The
gate-level protections therefore apply to both columns by construction —
the matrix records them anyway, because a reader should not have to read
the code to know a bot cannot bypass them.

A bot today trades the paper account (`simulate`). Live sending is not part
of the epic — it stays behind
[M9](MILESTONES.md#m9--autonomous-execution) and its own decision.

## The matrix

| Manual trade form protection | In the manual form | Bot equivalent | Status |
| --- | --- | --- | --- |
| Auto stop-loss | A stop is attached to every entry — the form offers an ATR-derived suggestion, and the gate refuses an order whose stop disagrees with the displayed state ([FEAT-0011](backlog/features/FEAT-0011-preflight-order-verification.md)). | The envelope makes the stop mandatory: a bot without one is refused before anything is sent (`no-stop` in `submitBotOrder`), and the position is sized against exactly that stop distance. | Shipped |
| Auto take-profit | Take-profit is attached at entry — one or multiple targets, per the exchange's capability. | Exits and take-profit become checkable data in the strategy document and execute through the same gate, exposure-reducing only; the bot editor authors the target distance beside the stop. | Shipped ([FEAT-0809](backlog/features/FEAT-0809-rule-exit-conditions-in-the-strategy-document.md), [FEAT-0810](backlog/features/FEAT-0810-execute-bot-exits-through-the-order-gate.md), [FEAT-0811](backlog/features/FEAT-0811-superbot-editor-for-exit-conditions.md)) |
| Size basis | Risk-first sizing: the trader states the risk, the size follows from the stop distance, and the gate re-derives the size from the payload and refuses a mismatch. | `size_basis: percent_risk` — the bot states the share of equity to risk and is sized against its stop distance; the same gate re-derivation runs against the payload it actually sends. | Shipped |
| Precision limits | The gate enforces the venue's quantity step size, price tick, volume limits and a size tolerance against the displayed market state. | Identical, because it is the same gate: the bot's order is checked against the same step, tick and volume rules. | Shipped |
| Pre-flight verification | Every order is recomputed from the displayed state before transport — symbol, side, size, entry, stop, leverage ([FEAT-0011](backlog/features/FEAT-0011-preflight-order-verification.md)). | Same recomputation, same displayed state: a bot's submission is verified exactly as a manual one is. | Shipped |
| Hard risk limits & kill switch | Max position size, max leverage, max loss per trade and per day, max concurrent positions, enforced at the execution boundary; the kill switch blocks all outgoing order traffic ([FEAT-0013](backlog/features/FEAT-0013-risk-limits-and-kill-switch.md)). | Same boundary, no bypass: the limits and the kill switch stop a bot's submission exactly as they stop a manual click. | Shipped |
| Confirmation before acting | The per-action confirmation policy does not gate order placement — its wired actions are flash-close and order modification, not the entry itself. | Not applicable by design: a confirmation prompt cannot reach a bot. Nothing between "the conditions hold" and "the order is submitted" waits for a person, so the bot's safety comes from arming plus the gate ([ADR-0020](adr/0020-automation-envelope-promotion-and-simulate-bots.md)), never from a prompt. | Not applicable by design |

## Keeping it true

- The guard test parses the table above: a deleted protection row, a row
  without a bot equivalent, or a "planned" claim without its FEAT item,
  fails the suite.
- A new manual protection lands with its row and its bot cell in the same
  PR — that is the workflow the test enforces.
- The bot editor's documentation
  ([FEAT-0811](backlog/features/FEAT-0811-superbot-editor-for-exit-conditions.md))
  links this matrix when it ships.
