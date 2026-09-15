/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Schema validation for AI-issued trade actions — BUG-0474.
 *
 * `actionSchema.ts` is the wire contract shown to the model; this module
 * enforces it on the way back in. `parseActions` casts whatever JSON the
 * model emits, and `parseAiValue` maps unparseable garbage to Decimal(0),
 * so without this step a `setLeverage: "high"` would silently become "0".
 * Every action returning null here is dropped with a `logger.warn` before
 * it can reach `executeAction`, on both the regex path and the tool-buffer
 * path (they converge before the permission filter).
 *
 * This module is deliberately dependency-free and mirrors `actionPolicy.ts`:
 * validation answers "is this shape sane", the policy answers "may it run".
 * A non-catalog action (e.g. `setSymbol`) can therefore pass validation and
 * still be refused by the permission filter — each layer warns on its own.
 *
 * Pure and dependency-free, so the validator is testable without a store or
 * a network. The output type is structurally identical to `AiAction`, so it
 * flows into `filterPermittedActions` and `executeAction` unchanged.
 */

export interface ValidatedAiAction {
  action: string;
  value?: string | number | boolean;
  index?: number;
  percent?: number | string;
  atrMultiplier?: number | string;
  tags?: string[];
}

/**
 * Every action name the `execute_trade_actions` tool declares. The permission
 * catalog in `actionPolicy.ts` is a strict subset of this enum.
 */
const SCHEMA_ACTIONS: ReadonlySet<string> = new Set([
  "setSymbol",
  "setEntryPrice",
  "setStopLoss",
  "setTakeProfit",
  "addTakeProfit",
  "removeTakeProfit",
  "setTradeType",
  "setRisk",
  "setLeverage",
  "setAtrMultiplier",
  "setAtrMode",
  "setAtrTimeframe",
  "setAnalysisTimeframe",
  "setAutoPrice",
  "setAccountSize",
  "setUseAtrSl",
  "resetSetup",
  "setNotes",
  "setTags",
]);

/** `setSymbol` may only carry an uppercase alphanumeric pair code. */
const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;

/** Plain decimal after separator normalization (no hex, no whitespace). */
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/** Short free-text mode/timeframe names the schema advertises. */
const MAX_SHORT_TEXT = 32;

/** `setNotes` mirrors the truncation bound in `executeAction`. */
const MAX_NOTES = 500;

/** `setTags` mirrors the slice bound in `executeAction`. */
const MAX_TAGS = 10;

/**
 * Normalize thousand/decimal separators the same way `parseAiValue` does, so
 * the validator accepts what the parser understands ("1,200.50", "50,5")
 * and rejects what it would silently turn into 0 ("high", true, arrays).
 * Returns null when the input is not numeric at all.
 */
function toFiniteNumber(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  let str = value.trim();
  if (str === "" || /[^0-9.,+\-eE]/.test(str.replace(/[kKmM]$/, ""))) {
    return null;
  }
  // A single k/m suffix only scales the magnitude, which validation ignores.
  str = str.replace(/[kKmM]$/, "").trim();
  if (str === "") return null;

  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  if (hasComma && hasDot) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      str = str.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = str.split(",");
    if (parts.length > 2) {
      str = str.replace(/,/g, "");
    } else {
      const [head, tail] = parts;
      str = head === "0" || tail.length !== 3 ? `${head}.${tail}` : `${head}${tail}`;
    }
  } else if (hasDot && str.split(".").length > 2) {
    str = str.replace(/\./g, "");
  }

  if (!DECIMAL_PATTERN.test(str)) return null;
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Finite number-like, excluding booleans/arrays/objects (never coerce). */
function isNumberLike(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  return toFiniteNumber(value) !== null;
}

function asPrice(value: unknown): string | number | null {
  if (!isNumberLike(value)) return null;
  const n = toFiniteNumber(value);
  return n !== null && n > 0 ? (value as string | number) : null;
}

function asIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function asPercent(value: unknown): number | string | null {
  if (!isNumberLike(value)) return null;
  const n = toFiniteNumber(value);
  return n !== null && n >= 0 && n <= 100 ? (value as number | string) : null;
}

function asShortText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_SHORT_TEXT ? value : null;
}

function asTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  const tags: string[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    ) {
      return null;
    }
    tags.push(String(entry));
  }
  return tags;
}

/**
 * Validate one parsed model action against the declared tool schema.
 * Returns a sanitized copy carrying only known fields, or null when the
 * action must be dropped (unknown name, wrong value type, out-of-shape
 * index/percent, hostile symbol). Never throws.
 */
export function validateAiAction(input: unknown): ValidatedAiAction | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.action !== "string" || !SCHEMA_ACTIONS.has(record.action)) {
    return null;
  }

  const { action, value, index, percent, atrMultiplier, tags } = record;

  switch (action) {
    case "setEntryPrice":
    case "setStopLoss": {
      const price = asPrice(value);
      return price === null ? null : { action, value: price };
    }
    case "setTakeProfit": {
      const idx = asIndex(index);
      if (idx === null) return null;
      const out: ValidatedAiAction = { action, index: idx };
      if (value !== undefined) {
        const price = asPrice(value);
        if (price === null) return null;
        out.value = price;
      }
      if (percent !== undefined) {
        const pct = asPercent(percent);
        if (pct === null) return null;
        out.percent = pct;
      }
      // An index-only action is a no-op: drop it instead of queueing noise.
      if (out.value === undefined && out.percent === undefined) return null;
      return out;
    }
    case "addTakeProfit": {
      const price = asPrice(value);
      if (price === null) return null;
      const out: ValidatedAiAction = { action, value: price };
      if (percent !== undefined) {
        const pct = asPercent(percent);
        if (pct === null) return null;
        out.percent = pct;
      }
      return out;
    }
    case "removeTakeProfit": {
      const idx = asIndex(index);
      return idx === null ? null : { action, index: idx };
    }
    case "setTradeType":
      return value === "long" || value === "short" ? { action, value } : null;
    case "setRisk": {
      if (!isNumberLike(value)) return null;
      const n = toFiniteNumber(value);
      return n !== null && n >= 0 && n <= 100
        ? { action, value: value as string | number }
        : null;
    }
    case "setLeverage": {
      if (!isNumberLike(value)) return null;
      const n = toFiniteNumber(value);
      return n !== null && n > 0 ? { action, value: value as string | number } : null;
    }
    case "setAtrMultiplier": {
      const out: ValidatedAiAction = { action };
      if (value !== undefined) {
        if (!isNumberLike(value) || (toFiniteNumber(value) ?? 0) <= 0) return null;
        out.value = value as string | number;
      }
      if (atrMultiplier !== undefined) {
        if (!isNumberLike(atrMultiplier) || (toFiniteNumber(atrMultiplier) ?? 0) <= 0) {
          return null;
        }
        out.atrMultiplier = atrMultiplier as string | number;
      }
      if (out.value === undefined && out.atrMultiplier === undefined) return null;
      return out;
    }
    case "setAtrMode":
    case "setAtrTimeframe":
    case "setAnalysisTimeframe": {
      const text = asShortText(value);
      return text === null ? null : { action, value: text };
    }
    case "setAutoPrice":
    case "setUseAtrSl":
      return typeof value === "boolean" ? { action, value } : null;
    case "setAccountSize": {
      if (!isNumberLike(value)) return null;
      const n = toFiniteNumber(value);
      return n !== null && n > 0 ? { action, value: value as string | number } : null;
    }
    case "setSymbol":
      return typeof value === "string" && SYMBOL_PATTERN.test(value)
        ? { action, value }
        : null;
    case "resetSetup":
      return { action };
    case "setNotes":
      return typeof value === "string" && value.length <= MAX_NOTES
        ? { action, value }
        : null;
    case "setTags": {
      // `executeAction` accepts either spelling; normalize to `tags`.
      const list = Array.isArray(tags) ? asTags(tags) : asTags(value);
      return list === null ? null : { action, tags: list };
    }
    default:
      return null;
  }
}
