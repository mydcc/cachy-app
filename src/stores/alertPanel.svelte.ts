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
  RuleDocument,
  RuleRefusal,
  TimeframeString,
} from "../lib/rules/types";
import { logger } from "../services/logger";
import { generateId } from "../utils/utils";

/**
 * Tabs in strip order. `manage` is last and is the only one that exists today;
 * the builders land into this same list as their own items ship.
 */
export const ALERT_PANEL_TABS = [
  "templates",
  "combo",
  "price",
  "indicators",
  "candlesticks",
  "manage",
] as const;

export type AlertPanelTab = (typeof ALERT_PANEL_TABS)[number];

/** The evaluation anchor a fresh draft starts on. */
const DEFAULT_TIMEFRAME: TimeframeString = "1h";

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
    trigger_timeframe: DEFAULT_TIMEFRAME,
    conditions: { kind: "group", op: "all", of: [] },
    action: { consequence_level: "notify" },
    enabled: true,
    provenance: { source: "human", created_at_ms: Date.now() },
  };
}

class AlertPanelStore {
  /** Which builder is on screen. Drives the lazy import in the shell. */
  activeTab = $state<AlertPanelTab>("manage");

  /** The rule under construction. Every tab writes into this one document. */
  draft = $state<RuleDocument>(blankDraft("BTCUSDT"));

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

  /** Starts a fresh draft, e.g. when the panel opens on a new symbol. */
  reset(symbol: string) {
    this.draft = blankDraft(symbol);
    this.refusals = [];
    this.hasValidated = false;
    this.coreUnavailable = false;
  }

  setSymbol(symbol: string) {
    this.draft.symbol = symbol;
  }

  setTimeframe(timeframe: TimeframeString) {
    this.draft.trigger_timeframe = timeframe;
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
