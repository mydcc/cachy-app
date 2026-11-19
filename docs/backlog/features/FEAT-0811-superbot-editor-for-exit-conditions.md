---
id: FEAT-0811
title: The bot editor — exits, firing policy, limits and direct creation
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: [FEAT-0809, FEAT-0822, FEAT-0823]
assignee: opencode
branch: feature/feat-0811-bot-editor
parent: FEAT-0805
size: L
estimate: 8
---

# FEAT-0811 — The bot editor: exits, firing policy, limits and direct creation

## Problem

`BotIntentEditor` edits side, size basis, size and the stop distance. Three
gaps follow from the owner review (2026-11-18):

1. Once FEAT-0809 adds `exits` and `take_profit`, a trader has no way to
   author them — the document would be readable but not writable, the state
   `veto` has been in.
2. The firing policy and limits (FEAT-0822) and the confirmation-candle
   trigger mode (FEAT-0823) need a home in the same editor — "every rule the
   system applies must be something the user can set".
3. A bot is only reachable through the promotion detour from an alert.
   Trader type C ("I want to trade a strategy directly") has no path; the
   goal — *any bot the trader wants* — demands direct creation.

## Proposal

**1. Direct creation.** The editor opens from "create bot" in the workshop
without any prior alert; promotion from an alert stays as a shortcut that
pre-fills the form. The editor is the same surface either way — one concept,
no stages.

**2. Exit section** built from the same condition components as the entry:

- One row per exit: condition sentence, `close all` / `close partial` and the
  fraction, remove.
- A take-profit control (distance from entry, mirroring the stop) if
  FEAT-0809 ships the field; otherwise an exit condition on the profit
  percentage.
- Side-aware wording: a long's exit says "close when RSI is above 70"; a
  short's says "close when RSI is below 30". The condition itself is not
  rewritten — only labels and example text follow the position side.
- Refusals from the core anchor to the row and field that caused them, the
  way `BotIntentEditor` already anchors size and stop refusals.
- A read-back sentence for the whole exit set, in both locales.
- Hidden/disabled for `notify` documents, which cannot hold exits.

**3. "Firing & limits" section** (fields from FEAT-0822, trigger mode from
FEAT-0823): firing policy, max positions, entries per day, budget cap, and
the immediate-vs-confirmation trigger mode — each with its default stated
plainly ("fires once per candle — the safe default").

**4. Parity with the manual frontend.** The bot respects everything the
manual path respects: every protection the manual trade form offers (auto
stop-loss, auto take-profit, size basis and precision limits) is available
here, mapped 1:1. A parity matrix in the docs (FEAT-0826) lists manual
capability against bot capability; a test keeps them in sync so a new manual
protection cannot ship without its bot equivalent.

## Acceptance criteria

- [x] A bot can be created directly from the workshop with no prior alert —
      symbol, entry conditions, action, size, stop — and saved as an unarmed
      draft; promotion remains a pre-fill, never the only path.
      *"From the workshop" is answered at the epic level: the workshop window
      is 0805 structure work, so the control center (BotsTab) is the interim
      host — the spec's own open question records that. The create flow:
      `createBotDraft` (in promoteAlert.ts, the creation domain's
      mass-neutral home) always writes `enabled: false` — the unarmed draft —
      and promotion is untouched below it. Pinned: BotEditor create cases +
      BotsTab's create-mode case (no alert read, no promote called).*
- [x] A bot can be authored with zero, one or more exit rules; the document
      round-trips through save and reload.
      *BotExitsEditor rows add/remove freely; the store round-trip is pinned
      in botCreation.test.ts (full-set round-trip) and the edit path's
      save-through-validate+armRule case.*
- [x] A partial exit requires a fraction; the field is validated before save
      and the core refusal is anchored to it.
      *Two layers, both pinned: the pre-save check (editor.fractionRequired,
      anchored to the row's fraction input) and the core's own refusal
      (`exits[N].fraction` → the same input, with the {field}-substituted
      message).*
- [x] Firing policy, limits and trigger mode are settable, hashed with the
      document, and shown back in the read-back sentence.
      *All five 0822 fields plus 0823's entry_trigger; the read-back composes
      policy, every set limit and the trigger label (BotFiringEditor's
      readback, pinned). Hashing is the documents' own property (pinned since
      0822/0823) — the editor writes the fields, the hash follows.*
- [x] The parity matrix exists in the docs and a test fails when a manual
      protection gains no bot equivalent.
      *Delivered by FEAT-0826 (docs/bot-parity.md +
      scripts/bot-parity.test.ts); this item flips the take-profit row — the
      one row its own delivery makes honest — from Planned to Shipped
      (0809 document + 0810 execution + 0811 authoring). Guard green.*
- [x] The side-aware labels differ for long and short and are covered by a
      component test in both locales.
      *Exits section title and the take-profit wording are side-aware; both
      locales asserted in BotEditor.component.test (en and de bundles).*
- [x] Every control is keyboard reachable and labelled; the exit list has a
      readable sentence.
      *Native form controls (select/input/button) with label/aria wiring —
      keyboard reachability is the platform's; refusal anchoring carries
      aria-invalid + aria-describedby to the row's own fields. Each exit row
      renders its live sentence via renderExitConditionSentence, pinned.*
- [x] Removing the last exit leaves a valid document with no `exits` key
      (not an empty array).
      *publish() maps an empty row set to `onexits(undefined)` and the save
      deletes the key — pinned: `"exits" in doc === false`.*
- [x] A `notify` rule cannot be given an exit from this editor.
      *The editor only mounts on simulate documents: create always builds
      simulate, and the per-bot edit path's beginEdit guard excludes
      notify rules. A notify rule never reaches the exits section.*

## Out of scope

- Executing the exits (FEAT-0810).
- The workshop window itself (FEAT-0805 structure work).
- A visual strategy builder or chart-drawn exits.
- Trailing/break-even presets; they are conditions, not separate controls.
- Migrating existing bots; they simply have no exits until edited.

## Decided questions

- **2026-11-19 (shipped with this item):** The editor's interim home is the
  **control center's BotsTab** — the workshop window is FEAT-0805's structure
  work, and the spec's own proposal records the workshop as the eventual home.
  This item ships the editor; where it mounts is a one-line host change when
  the workshop lands.

## Open questions

- Whether the editor's home is the control center or the workshop window.
  ~~Proposal: the workshop (its reason to exist), with the control center
  linking into it.~~ Interim answer recorded above: BotsTab hosts until the
  workshop window exists.
- The take-profit control offers both, decided with the owner (2026-11-18):
  the distance field and exit-condition rows, `unrealised_pnl_percent`
  included ([`TODO.md`](../../TODO.md#32--take-profit-and-exit-semantics)).

## Links

- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0809`](FEAT-0809-rule-exit-conditions-in-the-strategy-document.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- [`FEAT-0822`](FEAT-0822-bot-firing-policy-and-guards.md)
- [`FEAT-0823`](FEAT-0823-confirmation-candle-as-an-entry-trigger-mode.md)
- [`FEAT-0826`](FEAT-0826-overhaul-the-public-documentation-for-the-bot-era.md) — the parity matrix lives in [`docs/bot-parity.md`](../../bot-parity.md).
- Code: `src/components/alerts/bots/BotEditor.svelte` (the single editor —
  create and edit; absorbed and superseded the earlier intent-only editor),
  `src/components/alerts/tabs/*`
