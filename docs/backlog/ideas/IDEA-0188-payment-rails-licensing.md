---
id: IDEA-0188
title: Payment rails that issue entitlements — BTCPayServer, Stripe, or token-gated
type: idea
status: idea
priority: P3
milestone: M6
editions: [pro, private]
area: extensions
data_class: none
adr: required
depends_on: [FEAT-0187, FEAT-0032]
start_date: 2026-08-13
target_date: 2027-06-30
size: S
estimate: 2
---


# IDEA-0188 — Payment rails that issue entitlements — BTCPayServer, Stripe, or token-gated

## The thought

Once [`FEAT-0187`](../features/FEAT-0187-edition-entitlement-switch.md) exists,
"selling a licence" reduces to "a payment flow that ends with the buyer holding
a signed entitlement token". The payment system therefore never needs to be
inside Cachy at all — it is an external issuer, and the app only ever sees the
token. Three candidate rails, not mutually exclusive:

- **BTCPayServer** (self-hosted, Bitcoin) — matches the project's posture:
  no payment processor holding customer data, the operator controls the rail.
- **Stripe** — the fiat on-ramp for buyers who will never touch Bitcoin.
- **Token-gated entitlement (NFT)** — ownership of a chain asset *is* the
  licence; the app verifies a wallet signature locally instead of a
  Cachy-issued token. Transferable licences fall out for free; so do
  chain-dependency and UX costs. Worth a spike, not a commitment.

Hard constraints that survive any choice:

- **The app never phones home to validate.** Verification stays offline
  (FEAT-0187's contract); the rail only issues.
- **No customer identity on Cachy infrastructure** beyond what the chosen rail
  itself requires — an ADR-0004 question, hence `adr: required`.
- **Nothing sold is capability removed from the core** (`VISION.md`, "How it
  pays for itself" — the list of what may be sold lives there and only there).

## Direction decided

2026-08-13 (`docs/TODO.md` item 26): **BTCPayServer first.** Stripe remains a
possible later fiat on-ramp; token-gating remains a spike. The build start
stays M6 — this settles the direction, not the schedule.

## Why it is parked

Deliberately no priority: nothing sellable exists before M6
([`FEAT-0032`](../features/FEAT-0032-plugin-contract.md)), and designing a
payment flow before the thing it pays for is how the flow ends up dictating
the architecture. Recorded now so the entitlement design in FEAT-0187 keeps
the issuer abstract instead of baking one rail in.

## Links

- [`FEAT-0187`](../features/FEAT-0187-edition-entitlement-switch.md)
- [`FEAT-0032`](../features/FEAT-0032-plugin-contract.md)
- [`docs/VISION.md`](../../VISION.md) — "How it pays for itself"
- `docs/TODO.md` item 26
