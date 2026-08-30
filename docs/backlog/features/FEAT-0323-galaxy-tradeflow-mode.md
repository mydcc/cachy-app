---
id: FEAT-0323
title: Add a market-driven Galaxy mode to the Trade Flow background
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: none
branch: none
shipped: PR #2391 (develop 2026-08-29, follow-ups 134dc4a4 c662c197)
---

# FEAT-0323 — Add a market-driven Galaxy mode to the Trade Flow background

## Problem

The Galaxy 3D background (`ThreeBackground.svelte` → `galaxy.worker.ts`) is the
most striking visual the app has, but it is purely decorative: it never sees a
trade. The Trade Flow background is the opposite — every mode reacts to live
trades, but none of them looks like the galaxy.

A user who wants the galaxy has to give up market feedback, and a user who wants
market feedback has to give up the galaxy.

## Proposal

Clone the galaxy into the Trade Flow engine roster as a sixth mode, wired to the
same live trade feed as every other Trade Flow mode. The standalone Galaxy 3D
background stays exactly as it is — same file, same worker, same settings — so
nothing about the existing effect changes.

Market wiring (all on top of the unchanged base look, so a quiet market renders
the galaxy the way the standalone one does):

- **The disc's radius is a price axis.** A trade's shockwave is born where that
  trade sits in the recent price range — near the core at the bottom of the
  range, near the rim at the top — and buys sweep outward while sells sweep
  inward, so buying pressure visibly pushes up the scale. Buys also lift the
  particles they pass and tint them with `--color-up`; sells press down and tint
  with `--color-down`. The axis is a toggle (`priceAxis`, default on); off
  reproduces the plain burst from the core.
- **Price position comes from a shared normaliser**, `PriceRangeTracker` in
  `volumeScale.ts`, alongside the volume one. Linear, not logarithmic — prices
  do not span orders of magnitude within a symbol the way notionals do — and
  percentile-anchored so one bad print cannot pin the scale.
- **Shockwave amplitude** comes from the shared `VolumeNormalizer`, so a whale
  trade is visibly bigger than noise on any symbol, exactly like the other modes.
- **Market sentiment** (rolling buy/sell ratio, already computed by the worker)
  tints the whole galaxy.
- **Market activity** (rate + notional + volatility, the existing `marketHeat`)
  speeds up the galaxy's rotation.

Settings: the full set of Galaxy 3D tunables is duplicated into
`tradeFlowSettings.galaxyFlow` — independent from `galaxySettings`, so tuning one
never touches the other — plus three new market knobs (`marketReactivity`,
`sentimentTint`, `activityRotation`).

## Acceptance criteria

- [ ] `flowMode: "galaxy"` renders a galaxy in the Trade Flow background.
- [ ] The standalone Galaxy 3D background is byte-for-byte unchanged in
      behaviour: `galaxy.worker.ts`, `GalaxyEngine.ts` and `galaxySettings` are
      not modified.
- [ ] Changing a Galaxy 3D setting does not change the Trade Flow galaxy, and
      vice versa.
- [ ] A buy trade produces a visibly different shockwave (direction and colour)
      than a sell trade.
- [ ] Trade amplitude is normalised through the shared `VolumeNormalizer`, so a
      symbol change resets the calibration via the existing `resetVolume`.
- [ ] With the price axis on, a high-priced trade's wave is born further out
      than a low-priced one's, and the price window is reset on symbol change
      so a BTC range never positions an ETH trade.
- [ ] Every wave stays visible on the disc regardless of where in the price
      range it was born — a sustained rally must not silence the effect.
- [ ] Galaxy-only settings appear in the Visuals tab only while the mode is
      `galaxy`; grid-layout settings are hidden in that mode.
- [ ] New UI strings exist in both `de.json` and `en.json`.
- [ ] `npm run check` is clean and the new engine's pure mapping has unit tests.

## Out of scope

- Porting `StarDustEngine` into the Trade Flow scene. The Trade Flow scene has
  its own nebula/fog atmosphere that fills the same role, and star dust sits at
  radius 10–40 with size 0.1 — invisible at Trade Flow camera distances.
- Any change to the standalone Galaxy 3D effect, including "while we are here"
  improvements to `GalaxyEngine`.
- Order-book depth or candle data in the galaxy. This item wires the trade feed
  only, the same feed every other Trade Flow mode uses.

## Open questions

- The default world scale (`radius: 60`, `particleSize: 6`) is tuned for the
  default Trade Flow camera (height 80, distance 120). A user with a very close
  custom camera will want to drop the radius. Whether that deserves an
  auto-fit button is deliberately left open.

## Links

- `src/components/shared/backgrounds/engines/GalaxyFlowEngine.ts` (new)
- `src/components/shared/backgrounds/engines/GalaxyEngine.ts` (the original, untouched)
- `src/components/shared/backgrounds/tradeFlow.worker.ts`
- `src/components/shared/backgrounds/engines/volumeScale.ts`
