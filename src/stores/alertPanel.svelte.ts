/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0389 — the Super-Alert panel's draft state.
 *
 * The shell owns one draft `RuleDocument`; every builder tab (FEAT-0028,
 * FEAT-0030, FEAT-0390, FEAT-0391, FEAT-0394) edits that same document rather
 * than keeping a private form model it converts on arm. Two reasons this is a
 * store and not component state:
 *
 * 1. The plain-language sentence and the arm button read the *document*, so
 *    what a trader reads is what the core will be handed — not a projection of
 *    a form that may have drifted from it.
 * 2. Tabs are code-split (they mount and unmount as the trader switches), so
 *    component-local state would silently discard half a built rule on a tab
 *    change.
 *
 * Class A (ADR-0001, ADR-0012 decision 6): a draft rule is strategy. It stays
 * in memory on the device and is never sent anywhere — not to telemetry, not
 * to a crash report.
 */

import {
  isRuleRefusedError,
  RuleCoreUnavailableError,
  ruleSchema,
} from "../lib/rules/ruleSchema";
import type {
  Condition,
  EvaluationMode,
  PriceField,
  PriceSource,
  RuleDocument,
  RuleRefusal,
  TimeframeString,
} from "../lib/rules/types";
import { untrack } from "svelte";

import {
  conditionMembers,
  slotIndices,
  slotOf,
  type BuilderSlot,
} from "../lib/alerts/conditionSlots";
import { templateDocument, type AlertTemplate } from "../lib/alerts/templateLibrary";
import { readRuleStore } from "../services/alertEngine/armRule";
import { readDrawingAnchorLedger } from "../services/alertEngine/drawingAnchors";
import { logger } from "../services/logger";
import { generateId } from "../utils/utils";

/** Tabs in strip order; `manage` stays last. */
export const ALERT_PANEL_TABS = [
  "templates",
  "combo",
  "price",
  "indicators",
  "candlesticks",
  "drawing",
  "manage",
] as const;

/**
 * The tabs a trader can reach without a seeded drawing — FEAT-0752.
 *
 * The drawing tab exists only for a draft the chart handed over: without a
 * drawing there is nothing in it to show, and a builder that opens onto an
 * empty "drawing" would be a dead tab.
 */
export const DEFAULT_ALERT_PANEL_TABS = ALERT_PANEL_TABS.filter(
  (tab) => tab !== "drawing",
);

export type AlertPanelTab = (typeof ALERT_PANEL_TABS)[number];

/**
 * A draft handed to the panel from outside it — a right-click on the chart, an
 * action on an indicator card (FEAT-0395), or the bell on a selected drawing
 * (FEAT-0752).
 *
 * `condition` may be `null`: an entry point that knows the symbol and the tab
 * but not yet a usable condition still opens the panel on the right builder
 * rather than making the trader find it.
 */
export interface AlertPanelSeed {
  symbol: string;
  tab: AlertPanelTab;
  condition: Condition | null;
  /** The anchor the condition was built on. Defaults to a fresh draft's. */
  timeframe?: TimeframeString;
  /**
   * FEAT-0752 — the drawing this draft arms, when the seed came from the chart.
   *
   * The drawing itself is not a `Condition`: it is an anchor in the drawing
   * store that the evaluator re-reads every candle. The draft carries a
   * snapshot of its level so the panel has a complete document to render, and
   * the arm press rebuilds the rule from the live drawing.
   */
  drawing?: { id: string; symbol: string };
}

/** What `loadForEdit()` found (FEAT-0542). */
export type LoadForEditOutcome = "loaded" | "missing" | "bot" | "unreadable";

/**
 * The evaluation anchor a fresh draft starts on.
 *
 * Exported because an entry point outside the panel (FEAT-0395) has to name
 * the same anchor in the condition it seeds — two spellings of "the default"
 * is how a condition ends up on a different timeframe than the rule that
 * carries it.
 */
export const DEFAULT_RULE_TIMEFRAME: TimeframeString = "1h";

/**
 * A blank draft: notify-only, no order attached.
 *
 * `notify` rather than `send` is the safe default and is deliberate — a
 * consequence that submits an order must be something a trader chose, never
 * something they failed to change (ADR-0012 decision 5).
 */
function blankDraft(symbol: string): RuleDocument {
  return {
    schema_version: ruleSchema.isReady() ? ruleSchema.schemaVersion() : 1,
    id: generateId(),
    name: "",
    symbol,
    trigger_timeframe: DEFAULT_RULE_TIMEFRAME,
    conditions: { kind: "group", op: "all", of: [] },
    action: { consequence_level: "notify" },
    enabled: true,
    provenance: { source: "human", created_at_ms: Date.now() },
    // FEAT-0393 lifecycle. `once` is written rather than left to the core's
    // default so the footer has something to render and the draft is a complete
    // document from the first frame. The other three are absent-means-default:
    // no channels means the notification policy decides, and a rule with no
    // expiry and no note simply has neither.
    frequency: "once",
    trigger_methods: [],
  };
}

class AlertPanelStore {
  /** Which builder is on screen. Drives the lazy import in the shell. */
  activeTab = $state<AlertPanelTab>("manage");

  /**
   * FEAT-0752 — the drawing the open draft arms, when the chart seeded one.
   *
   * Side state rather than a document field: the rule's condition is an
   * ordinary price compare, and the binding to the line lives in the drawing
   * anchor ledger. The panel needs to know which drawing it is about so it can
   * rebuild the rule at arm time and show the level read-only.
   */
  drawingDraft = $state<{ id: string; symbol: string } | null>(null);

  /**
   * True when the open draft came from a stored rule that was disarmed
   * (FEAT-0542) — in practice, a one-shot rule that has fired.
   *
   * Re-arming must forget that rule's fire state, not just rewrite the
   * document: the core's `once` frequency refuses to announce again while
   * `fired_count` is non-zero, so an "armed" toast over a spent counter is
   * the BUG-0382 shape. The flag is set by `loadForEdit`, consumed by the
   * shell after a successful arm, and cleared by `reset()`.
   */
  rearmedFromDisarmed = $state(false);

  /**
   * True while the draft came from a stored rule (FEAT-0542/0543).
   *
   * The footer is shared by every builder, so its heading has to distinguish
   * the two cases honestly: a fresh draft is a new alert, a loaded one is an
   * alert being edited. `reset()` clears it, and `loadForEdit()` sets it.
   */
  isEditing = $state(false);

  /** The rule under construction. Every tab writes into this one document. */
  draft = $state<RuleDocument>(blankDraft("BTCUSDT"));

  /**
   * Which OHLC value of a candle new conditions read, chosen in the panel
   * header. Panel state rather than document state: it is a default the
   * builders apply, and each condition carries its own copy once written.
   */
  priceField = $state<PriceField>("close");

  /**
   * Which price series new conditions read (FEAT-0390).
   *
   * Kept beside `priceField` and not inside the draft for the same reason —
   * and separate *from* it because the two answer different questions: `close`
   * versus `high` is which number in the candle, `last` versus `mark` is which
   * candle series it came from.
   */
  priceSeries = $state<PriceSource>("last");

  /**
   * What the core refused, from the last `validate()`. Empty means either
   * "accepted" or "not validated yet" — `hasValidated` separates those, so
   * the panel does not open showing an accusatory green tick.
   */
  refusals = $state<RuleRefusal[]>([]);
  hasValidated = $state(false);

  /**
   * True when the core could not be asked at all. Kept apart from
   * `refusals` on purpose: "we could not check your rule" and "your rule is
   * wrong" are different things to tell a trader, and merging them sends
   * them hunting a bug in a strategy that is fine.
   */
  coreUnavailable = $state(false);

  /**
   * True while a seed from outside the panel is waiting to be honoured.
   *
   * The shell resets the draft on mount, and an entry point necessarily seeds
   * *before* the panel exists — so without this flag the mount would blank
   * exactly the draft the trader just asked for. A boolean rather than an
   * ordering assumption: the panel says "I am opening" and the store answers
   * "then keep what you were given".
   */
  private seedPending = false;

  /**
   * Whether the panel is mounted right now.
   *
   * `seedPending` only means something across a mount: a seed that lands while
   * the panel is already open is applied to the live draft, and leaving the
   * flag set would make the next open resurrect that draft instead of starting
   * blank — with the drawing binding still attached.
   */
  private panelMounted = false;

  /**
   * Opens the panel with a draft an entry point outside it already filled in
   * (FEAT-0395).
   *
   * The seed writes the *document*, plus — since FEAT-0752 — the drawing
   * binding, which is not document content but names the line the rule has to
   * be rebuilt from. That is the whole contract of this store: what the footer
   * sentence reads back and what the core is handed are the same object,
   * whether a trader typed it or clicked it on the chart. Every other builder
   * tab needs no seeding channel of its own — it hydrates from the document it
   * was handed.
   */
  seed({ symbol, tab, condition, timeframe, drawing }: AlertPanelSeed) {
    this.reset(symbol);
    if (timeframe) this.setTimeframe(timeframe);
    this.setSingleCondition(condition);
    this.drawingDraft = drawing ?? null;
    this.activeTab = tab;
    // A seed has to survive only the mount that follows it. Landing one while
    // the panel is open applies it live; `seedPending` must not stay set, or
    // the next open would keep this draft instead of starting blank.
    this.seedPending = !this.panelMounted;
  }

  /**
   * What the shell calls when it mounts: a fresh draft on `symbol`, unless a
   * seed is waiting — in which case the seed stands and is consumed, so the
   * next open without one starts blank again.
   */
  openFor(symbol: string) {
    this.panelMounted = true;
    if (this.seedPending) {
      this.seedPending = false;
      return;
    }
    this.reset(symbol);
  }

  /**
   * The panel unmounted. The next open starts from a fresh draft.
   *
   * Without this, a seed that arrived while the panel was open would leave
   * `panelMounted` true forever and the store would treat every later seed as
   * "live", even though nothing is on screen to apply it to.
   */
  closePanel() {
    this.panelMounted = false;
  }

  /** Starts a fresh draft, e.g. when the panel opens on a new symbol. */
  reset(symbol: string) {
    this.draft = blankDraft(symbol);
    this.drawingDraft = null;
    this.rearmedFromDisarmed = false;
    this.isEditing = false;
    this.priceField = "close";
    this.priceSeries = "last";
    this.refusals = [];
    this.hasValidated = false;
    this.coreUnavailable = false;
  }

  /**
   * Replace the draft's conditions with the single one a *seed* produced.
   *
   * Only for paths that own the whole draft: an entry point outside the panel
   * (FEAT-0395) seeds straight after `reset()`, so there is nothing else in the
   * group to lose. A builder tab must never call this — it would throw away
   * another tab's work on mount (BUG-0443). Builders call
   * `setSlotCondition()`.
   *
   * Wrapped in an `all` group rather than assigned to `conditions` directly:
   * the shape stays the one the Combo tab (FEAT-0030) extends, so moving from
   * one condition to several is adding a member rather than rewriting the tree.
   */
  setSingleCondition(condition: Condition | null) {
    this.draft.conditions = {
      kind: "group",
      op: "all",
      of: condition ? [condition] : [],
    };
  }

  /**
   * Write what one builder produced into that builder's own slot (BUG-0443).
   *
   * Replaces the slot's existing member in place, appends when the slot is
   * empty, and removes it when `condition` is `null`. Three consequences, each
   * load-bearing:
   *
   * - Another tab's condition is never touched, so switching tabs cannot
   *   discard a rule the trader is still building.
   * - Replacing in place rather than removing and appending keeps the group's
   *   order stable, so the plain-language sentence does not reshuffle itself
   *   while the trader types.
   * - `null` still empties this slot, which is what disables the arm button
   *   when a trader clears their own condition. A deliberate clear is not a
   *   wipe, and the arm button must keep reading the difference.
   */
  setSlotCondition(slot: BuilderSlot, condition: Condition | null) {
    if (condition && slotOf(condition) !== slot) {
      // Not fatal: the write still lands, and the panel stays up. But a builder
      // emitting a shape its own slot does not claim means `slotOf` and that
      // builder disagree, and the next tab switch will drop the condition.
      logger.error(
        "alerts",
        `builder slot "${slot}" produced a condition it does not own; see slotOf()`,
      );
    }

    // `untrack` because this read is bookkeeping, not a subscription. Builders
    // call this from a write-through `$effect`, so a tracked read of the group
    // they are about to write would make that effect depend on its own output
    // and loop until Svelte gives up (`effect_update_depth_exceeded`). The
    // effect should depend on the form fields it reads and nothing else; every
    // *reader* of `draft.conditions` — the sentence, the arm button — still
    // updates, because untracking affects this read, not the write.
    const members = untrack(() => [...conditionMembers(this.draft.conditions)]);
    const claimed = slotIndices({ kind: "group", op: "all", of: members }, slot);

    // An ambiguous slot is not this builder's to write. More than one member
    // claiming it means a combo (FEAT-0030) that a single-condition builder
    // cannot represent; it hydrated blank for exactly that reason, so letting
    // its mount-time write land would drop a leg the trader still has.
    if (claimed.length > 1) return;

    const at = claimed.length === 1 ? claimed[0] : -1;

    if (condition === null) {
      if (at === -1) return;
      members.splice(at, 1);
    } else if (at === -1) {
      members.push(condition);
    } else {
      members[at] = condition;
    }

    this.draft.conditions = { kind: "group", op: "all", of: members };
  }

  /**
   * Replace the draft's conditions with the several a combo builder produced
   * (FEAT-0030).
   *
   * Takes the whole group rather than a list plus an operator so that the one
   * shape the document uses stays the one the builder hands over. A builder
   * with no usable rows passes `null`, which empties the group for the same
   * reason `setSingleCondition` does: an armed rule that can never fire is
   * worse than a disabled arm button.
   */
  setConditionGroup(group: Condition | null) {
    this.draft.conditions =
      group && group.kind === "group" ? group : { kind: "group", op: "all", of: [] };
  }

  /**
   * Replace the draft with a template and open it in the Combo tab for editing
   * (FEAT-0391).
   *
   * Starts from a fresh draft on the current symbol, so nothing from the rule
   * the trader abandoned -- a veto, a note, an expiry -- rides along into what
   * reads as the template. The Combo tab rather than arming: a template is a
   * starting point, and the trader sees every value before it can fire.
   *
   * `name` is the template's name in the trader's language. Not hashed, so
   * two traders loading the same template in German and English still hold
   * the same strategy.
   */
  loadTemplate(template: AlertTemplate, name: string) {
    this.reset(this.draft.symbol);
    this.draft = templateDocument(
      template,
      $state.snapshot(this.draft) as RuleDocument,
      name,
    );
    this.activeTab = "combo";
  }

  /**
   * Loads the stored rule `ruleId` into the draft (FEAT-0542).
   *
   * `id` is kept, so arming writes the same rule back — `armRule` replaces by
   * id — rather than leaving a duplicate beside it. The draft also carries the
   * stored `provenance`; the drawing arm path keeps it too (FEAT-0542).
   *
   * The tab follows the condition's own shape (`slotOf`): a builder that
   * cannot render a condition would hydrate blank, and its mount-time write
   * would delete the leg. More than one leg, or a shape no single builder
   * claims, opens Combo — it either renders the legs or locks itself
   * read-only, and the footer still edits the lifecycle either way.
   *
   * A drawing-bound rule has no condition slot. Its binding lives in the
   * anchor ledger, so it opens the Drawing tab with `drawingDraft` set,
   * exactly as the chart's bell does. When that ledger cannot be read,
   * editing is refused: the rule might be drawing-bound, and showing it as a
   * fixed price alert would let a trader edit a threshold the evaluator
   * overwrites from the line.
   *
   * Called from Manage, while the panel is mounted; `seedPending` is left
   * alone on purpose. An entry point that ever calls this while the panel is
   * closed would need the same treatment `seed()` gives its draft.
   *
   * Returns what it found so Manage can say why nothing opened.
   */
  loadForEdit(ruleId: string): LoadForEditOutcome {
    let stored: RuleDocument[];
    try {
      stored = readRuleStore();
    } catch (e) {
      logger.error("alerts", "stored rules could not be read for editing", e);
      return "unreadable";
    }

    const rule = stored.find((candidate) => candidate?.id === ruleId);
    if (!rule) return "missing";
    // Any level other than `notify` is not this panel's to edit. Bots
    // (`simulate`) are the current case; `send` is the next one, and loading
    // it as a notification draft would silently strip its order intent.
    const level = rule.action?.consequence_level;
    if (level !== undefined && level !== "notify") return "bot";

    const anchors = readDrawingAnchorLedger();
    if (!anchors.present) return "unreadable";
    const anchor = anchors.ledger[ruleId];

    const draft = structuredClone(rule);

    // `alarmRows` tolerates a malformed entry so the trader can see and delete
    // it. Loading one into the shell would dereference `conditions.kind` in a
    // `$derived` and take the panel down; refuse before touching any state.
    const conditions = draft.conditions as { kind?: unknown } | null | undefined;
    if (
      !conditions ||
      typeof conditions !== "object" ||
      typeof conditions.kind !== "string"
    ) {
      return "unreadable";
    }

    // A migrated legacy alert may predate `action`. A draft without one
    // cannot be validated by the core, and `notify` is what such a rule was.
    if (!draft.action) {
      draft.action = { consequence_level: "notify" };
    }
    // A one-shot rule is disarmed when it fires (`enabled: false`); a
    // repeating rule stays enabled. The draft sets `true` in either case,
    // because pressing Arm means armed — carrying `false` would write a rule
    // nothing evaluates.
    draft.enabled = true;
    // A drawing rule is rebuilt on the line's market; keep the header on the
    // ledger's symbol so a drifted document cannot show another market.
    if (anchor) draft.symbol = anchor.symbol;

    this.draft = draft;
    this.drawingDraft = anchor
      ? { id: anchor.drawingId, symbol: anchor.symbol }
      : null;
    // Only a stored `false` means the firing path disarmed it. An absent
    // `enabled` is the legacy default and not evidence of a spent rule.
    this.rearmedFromDisarmed = rule.enabled === false;
    this.isEditing = true;
    this.priceField = "close";
    this.priceSeries = "last";
    this.refusals = [];
    this.hasValidated = false;
    this.coreUnavailable = false;
    this.activeTab = anchor ? "drawing" : this.tabForConditions(draft);
    return "loaded";
  }

  /** The builder that owns the loaded condition, or Combo when none does. */
  private tabForConditions(rule: RuleDocument): AlertPanelTab {
    const members = conditionMembers(rule.conditions);
    if (members.length === 1) {
      const member = members[0];
      // Every single-condition builder rewrites its leg with the rule's
      // timeframe. A stored leg anchored elsewhere would be moved by that
      // mount-time write, so Combo locks the document instead of changing it.
      if ("timeframe" in member && member.timeframe !== rule.trigger_timeframe) {
        return "combo";
      }
      const slot = slotOf(member);
      if (slot) return slot;
    }
    return "combo";
  }

  setSymbol(symbol: string) {
    this.draft.symbol = symbol;
  }

  setTimeframe(timeframe: TimeframeString) {
    this.draft.trigger_timeframe = timeframe;
  }

  /**
   * FEAT-0477 — the evaluation mode, with `close` stored as the *absence* of
   * the field rather than as the string `"close"`.
   *
   * The core omits `EvaluationMode::Close` from the canonical form so that every
   * document written before the field existed keeps its content hash. Writing
   * `"close"` here would still hash identically — the core drops it on the way
   * in — but it would start persisting a default that was never persisted
   * before, so a stored document would stop being byte-identical to the one
   * this panel wrote yesterday. Mirroring the serialisation rule in the setter
   * keeps the two in step without anyone having to remember the asymmetry.
   */
  setEvaluationMode(mode: EvaluationMode) {
    this.draft.evaluation_mode = mode === "close" ? undefined : mode;
  }

  /**
   * Asks the core whether the draft is acceptable and records what it said.
   *
   * Returns the accepted document, or `null`. Never throws: the panel calls
   * this on every edit to keep field-level refusals live, and a validator
   * that throws into a `$derived` would take the whole panel down over a
   * half-typed threshold.
   */
  validateDraft(): RuleDocument | null {
    this.hasValidated = true;
    try {
      const accepted = ruleSchema.validate(
        $state.snapshot(this.draft) as RuleDocument,
      );
      this.refusals = [];
      this.coreUnavailable = false;
      return accepted;
    } catch (e) {
      if (isRuleRefusedError(e)) {
        this.refusals = e.refusals;
        this.coreUnavailable = false;
        return null;
      }
      if (e instanceof RuleCoreUnavailableError) {
        this.refusals = [];
        this.coreUnavailable = true;
        return null;
      }
      // Anything else is a genuine failure. Not dressed up as a refusal
      // — see `toRefusedError` in ruleSchema.ts for the same rule.
      logger.error("alerts", "rule validation failed unexpectedly", e);
      this.refusals = [];
      this.coreUnavailable = true;
      return null;
    }
  }
}

export const alertPanelState = new AlertPanelStore();

/**
 * The refusals that belong against one field of the form.
 *
 * Prefix-matched on dotted path segments, not substring-matched: the core
 * names `conditions.of.0.left`, and the Combo tab renders a control for
 * `conditions`. Segment-wise matching lets a parent control show what its
 * children were refused for without `condition` also swallowing
 * `conditions_extra`, which a naive `startsWith` would.
 */
export function refusalsForField(
  refusals: readonly RuleRefusal[],
  field: string,
): RuleRefusal[] {
  return refusals.filter(
    (r) => r.field === field || r.field.startsWith(`${field}.`),
  );
}

/**
 * Refusals no rendered control claimed, so the panel can still show them.
 *
 * Without this a refusal against a field the shell has no input for — one of
 * the builder tabs that has not shipped yet — would be swallowed, and the arm
 * button would refuse with nothing on screen explaining why. Silence in front
 * of a refused rule is the BUG-0382 shape: stored, never fires, no warning.
 */
export function unclaimedRefusals(
  refusals: readonly RuleRefusal[],
  claimedFields: readonly string[],
): RuleRefusal[] {
  return refusals.filter(
    (r) =>
      !claimedFields.some((f) => r.field === f || r.field.startsWith(`${f}.`)),
  );
}
