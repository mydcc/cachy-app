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
 * FEAT-0389 — a rule document written out as a sentence a trader can read.
 *
 * This is the half of the Super-Alert panel that decides whether the builder
 * is trusted or guessed at: a trader arms an alarm from what the sentence
 * says, not from the shape of the form above it. So the renderer is a pure
 * function of the document — never of the form state — and it is exercised by
 * tests in both locales rather than eyeballed once.
 *
 * Composition rather than one giant key per rule shape: a rule nests
 * arbitrarily (`group` inside `group`), so no finite set of full-sentence
 * strings can cover it. Each fragment is its own `rules.sentence.*` key and
 * the locales decide how fragments join. Class A throughout — the sentence is
 * built on the device from a document that never leaves it (ADR-0001).
 */

import type {
  AccountFieldName,
  CompareOp,
  Condition,
  CrossDirection,
  IndicatorRef,
  LogicOp,
  Operand,
  PriceField,
  PriceSource,
  RuleDocument,
  TimeframeString,
} from "./types";

/**
 * The subset of the i18n contract this module needs. Taking a function rather
 * than importing the store keeps the renderer testable without mounting
 * anything, and keeps it usable from a Svelte `$derived` where the store value
 * has already been unwrapped.
 */
export type SentenceTranslator = (
  key: string,
  values?: Record<string, unknown>,
) => string;

/** Longest first, so `gte` never matches the `gt` key by prefix. */
const COMPARE_KEYS: Record<CompareOp, string> = {
  lt: "rules.sentence.op.lt",
  lte: "rules.sentence.op.lte",
  gt: "rules.sentence.op.gt",
  gte: "rules.sentence.op.gte",
  eq: "rules.sentence.op.eq",
  neq: "rules.sentence.op.neq",
};

const CROSS_KEYS: Record<CrossDirection, string> = {
  above: "rules.sentence.cross.above",
  below: "rules.sentence.cross.below",
  any: "rules.sentence.cross.any",
};

const JOIN_KEYS: Record<LogicOp, string> = {
  all: "rules.sentence.join.all",
  any: "rules.sentence.join.any",
  none: "rules.sentence.join.none",
};

const ACCOUNT_KEYS: Record<AccountFieldName, string> = {
  position_size: "rules.sentence.account.position_size",
  unrealised_pnl: "rules.sentence.account.unrealised_pnl",
  unrealised_pnl_percent: "rules.sentence.account.unrealised_pnl_percent",
  exposure: "rules.sentence.account.exposure",
  available_balance: "rules.sentence.account.available_balance",
};

/**
 * `rsi` + `{ length: 14 }` -> `RSI(14)`.
 *
 * Parameters are rendered in the document's own key order rather than sorted:
 * the order a builder wrote them in is the order a trader recognises
 * (`MACD(12,26,9)`, never `MACD(9,12,26)`). Sorting here would silently
 * reorder a familiar signature into an unfamiliar one.
 */
export function formatIndicator(ref: IndicatorRef): string {
  const params = Object.values(ref.params).map((v) => String(v));
  const head =
    params.length > 0
      ? `${ref.id.toUpperCase()}(${params.join(",")})`
      : ref.id.toUpperCase();
  return ref.output && ref.output !== "value" ? `${head}.${ref.output}` : head;
}

/**
 * The price a condition reads, with its series named only when it is not the
 * default. A suffix rather than a separate set of fragments, the way
 * `onTimeframe` already works: a trader reading "the close" is reading the last
 * price, and spelling that out on every leaf would add noise to the common case
 * while burying the uncommon one.
 */
function priceName(
  field: PriceField,
  source: PriceSource | undefined,
  t: SentenceTranslator,
): string {
  const name = t(`rules.sentence.price.${field}`);
  return source === "mark" ? `${name}${t("rules.sentence.markSuffix")}` : name;
}

/**
 * `inPercentContext` makes a bare constant render as `5%` rather than `5`.
 *
 * Without it "the change in the close over the last 3 closes is at least 5"
 * reads as a price, which is the one misreading a percentage rule cannot
 * afford. The flag is set by the condition, which is the only level that can
 * see both operands at once.
 */
function formatOperand(
  operand: Operand,
  t: SentenceTranslator,
  inPercentContext = false,
): string {
  switch (operand.kind) {
    case "price":
      return priceName(operand.field, operand.source, t);
    case "indicator":
      return formatIndicator(operand.indicator);
    case "constant":
      return inPercentContext
        ? t("rules.sentence.percentValue", { value: operand.value })
        : operand.value;
    case "percent_change":
      return t(
        operand.lookback === 1
          ? "rules.sentence.percentChangeOne"
          : "rules.sentence.percentChange",
        {
          price: priceName(operand.field, operand.source, t),
          lookback: operand.lookback,
        },
      );
  }
}

/** Whether either side of a condition is a percentage, so constants get a `%`. */
function isPercentComparison(left: Operand, right: Operand): boolean {
  return left.kind === "percent_change" || right.kind === "percent_change";
}

/**
 * A condition names its own timeframe only when it differs from the anchor.
 * Repeating "on the 4h close" against every leaf of a four-condition combo
 * makes the sentence unreadable, and a trader reading a rule anchored to 4h
 * already knows the default.
 */
function timeframeSuffix(
  timeframe: TimeframeString,
  anchor: TimeframeString,
  t: SentenceTranslator,
): string {
  return timeframe === anchor
    ? ""
    : t("rules.sentence.onTimeframe", { timeframe });
}

function formatCondition(
  condition: Condition,
  anchor: TimeframeString,
  t: SentenceTranslator,
): string {
  switch (condition.kind) {
    case "compare": {
      const percent = isPercentComparison(condition.left, condition.right);
      return t("rules.sentence.compare", {
        left: formatOperand(condition.left, t, percent),
        op: t(COMPARE_KEYS[condition.op]),
        right: formatOperand(condition.right, t, percent),
        timeframe: timeframeSuffix(condition.timeframe, anchor, t),
      });
    }
    case "cross": {
      const percent = isPercentComparison(condition.left, condition.right);
      return t("rules.sentence.crossing", {
        left: formatOperand(condition.left, t, percent),
        direction: t(CROSS_KEYS[condition.direction]),
        right: formatOperand(condition.right, t, percent),
        timeframe: timeframeSuffix(condition.timeframe, anchor, t),
      });
    }
    case "position":
      return t(
        condition.open
          ? "rules.sentence.position.open"
          : "rules.sentence.position.flat",
        { side: t(`rules.sentence.side.${condition.side}`) },
      );
    case "account":
      return t("rules.sentence.compare", {
        left: t(ACCOUNT_KEYS[condition.field]),
        op: t(COMPARE_KEYS[condition.op]),
        right: condition.value,
        timeframe: "",
      });
    case "external_feed":
      return t("rules.sentence.compare", {
        left: condition.feed,
        op: t(COMPARE_KEYS[condition.op]),
        right: condition.value,
        timeframe: "",
      });
    case "group":
      return formatGroup(condition.op, condition.of, anchor, t);
  }
}

function formatGroup(
  op: LogicOp,
  of: Condition[],
  anchor: TimeframeString,
  t: SentenceTranslator,
): string {
  if (of.length === 0) return t("rules.sentence.empty");
  const parts = of.map((child) => {
    const rendered = formatCondition(child, anchor, t);
    // Only a nested group is parenthesised. A leaf never needs it, and
    // wrapping every leaf turns a two-condition combo into noise.
    return child.kind === "group" ? `(${rendered})` : rendered;
  });
  if (parts.length === 1) {
    return op === "none"
      ? t("rules.sentence.negate", { condition: parts[0] })
      : parts[0];
  }
  const joiner = ` ${t(JOIN_KEYS[op])} `;
  const joined = parts.join(joiner);
  return op === "none"
    ? t("rules.sentence.negate", { condition: joined })
    : joined;
}

function formatLead(document: RuleDocument, t: SentenceTranslator): string {
  const { action } = document;
  if (action.consequence_level === "send" && action.order) {
    return t("rules.sentence.lead.send", {
      side: t(`rules.sentence.orderSide.${action.order.side}`),
      size: action.order.size,
      basis: t(`rules.sentence.basis.${action.order.size_basis}`),
    });
  }
  return t(`rules.sentence.lead.${action.consequence_level}`);
}

/**
 * The whole rule as one sentence, in the caller's active locale.
 *
 * Never throws: the panel renders this on every keystroke of a half-built
 * document, and a builder that blanks its own explanation the moment a field
 * is empty is worse than one that reads a little awkwardly. Structural gaps
 * come out as the `rules.sentence.empty` fragment instead.
 */
export function renderRuleSentence(
  document: RuleDocument,
  t: SentenceTranslator,
): string {
  const anchor = document.trigger_timeframe;
  const condition = formatCondition(document.conditions, anchor, t);
  const sentence = t("rules.sentence.frame", {
    lead: formatLead(document, t),
    timeframe: anchor,
    condition,
  });
  if (!document.veto) return sentence;
  return `${sentence} ${t("rules.sentence.unless", {
    condition: formatCondition(document.veto, anchor, t),
  })}`;
}
