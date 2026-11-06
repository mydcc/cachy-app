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

/*
 * FEAT-0743 — pure helpers for user-defined window rules.
 *
 * Deliberately free of stores, runes and the registry: the loader sanitizes
 * stored payloads, the settings UI lists the selectable types, and
 * `WindowBase` applies a rule. Keeping the type allow-list here instead of
 * deriving it from the registry makes "which types may have a rule" a product
 * statement that is testable without instantiating windows.
 */

import { normalizeSymbol as canonicalSymbol } from "../../utils/symbolUtils";
import type { WindowType } from "./types";
import type {
  WindowRule,
  WindowRuleMatch,
  WindowRuleType,
} from "../../stores/settings/settingsTypes";

/**
 * Window types a rule may target, ordered by how often the layout is worth
 * remembering (the first entry is what "Add rule" preselects).
 *
 * Excludes `modal`, `dialog` and `symbolpicker`: they are short-lived,
 * centre-fixed surfaces with no layout worth restoring. `window` is excluded
 * too — it is the base class's default type, but no implementation is ever
 * constructed with it, so a rule there could never match.
 *
 * The reader class (`guide`, `changelog`, `privacy`, `whitepaper`) is also
 * excluded. They are navigation destinations with no resize handle and no
 * visible maximize control, centred by default and full-screen on mobile —
 * not surfaces a user arranges a workspace around.
 *
 * `settings` is excluded too: it hosts this editor and dismisses itself on
 * blur. A rule could still place, resize or maximize it through the same
 * programmatic path as any window, but the editor is not a workspace the user
 * is arranging, and keep-above is meaningless for a window that closes on
 * blur. The market-news reader is an `iframe` window as well, so it is covered
 * by the paragraph below rather than by a type of its own.
 *
 * `iframe` and `channel` are excluded for a different reason: the picker can
 * only name a *type*, and neither type has an identity a user recognises.
 * Article readers are `iframe` windows with a generated id and the shared
 * `news_article` snapshot key, so one rule would silently cover every article;
 * channel windows are 16:9 content surfaces opened by a specific button, whose
 * ids are developer-supplied. "Embedded page" and "Channel" are internal
 * labels, not something a user would pick out of a layout menu.
 */
export const WINDOW_RULE_TYPES: readonly WindowRuleType[] = Object.freeze([
  "journal",
  "chart",
  "academy",
  "assistant",
  "alertpanel",
  "controlcenter",
]);

/**
 * Upper bound on a stored rule width/height. Mirrors the snapshot cap in
 * `WindowBase` (which imports this value) so a hand-edited size cannot create
 * a window that the viewport clamp has to fight. Positions are not bounded —
 * any finite coordinate is valid, the clamp brings it back on screen.
 */
export const MAX_RULE_DIMENSION = 100_000;

/**
 * The geometry/flag patch a rule applies on open. Only the fields the rule
 * sets are present, so the caller keeps the restored snapshot value for the
 * rest.
 */
export interface WindowRulePatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isMaximized?: boolean;
  isKeepAbove?: boolean;
}

/** True when `type` may carry a rule in this slice. */
export function isRuleTarget(type: WindowType): type is WindowRuleType {
  return (WINDOW_RULE_TYPES as readonly WindowType[]).includes(type);
}

/**
 * Window types whose rules may be narrowed to a single instance (FEAT-0769).
 *
 * Only `chart`: its instances are told apart by the symbol they were
 * constructed with, which is also the identity a trader thinks in. The
 * remaining rule targets are either single-instance or have no per-instance
 * identity a user could name — the types that carried an instance key a user
 * cannot read (`iframe`, `channel`) are not rule targets at all.
 */
export const SYMBOL_SCOPED_RULE_TYPES: readonly WindowRuleType[] =
  Object.freeze(["chart"]);

/**
 * Canonical rule symbol, used for both storage and matching.
 *
 * This is the exchange layer's normalisation, not a local `trim().toUpperCase()`:
 * charts are constructed with canonical symbols ("BTC" arrives as "BTCUSDT",
 * "BTCUSDT.P" as "BTCUSDT"), so a rule stored in the typed form would be saved,
 * shown, and then silently never match.
 *
 * The provider argument is retained by `normalizeSymbol` but no longer
 * consulted (BUG-0599), so the value here has no venue-specific effect. A
 * non-string collapses to "": the value can come from a hand-edited snapshot,
 * not only from the editor.
 */
export function normalizeRuleSymbol(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  // Length is checked before canonicalisation: the exchange layer expands a
  // short ticker ("B" -> "BUSDT"), which would turn a one-character typo into a
  // rule that looks real. A single character is never a contract.
  if (trimmed.length < 2) return "";
  return canonicalSymbol(trimmed, "bitunix");
}

/**
 * Accepted rule-symbol shape, checked *after* canonicalisation. Deliberately a
 * form check, not a lookup: a rule on a symbol that is not a current favourite
 * (or was delisted since) must survive a reload — it is a statement of intent,
 * not a reference.
 *
 * A canonicalisation that leaves something chart symbols never carry (e.g.
 * "BTC.USDT") passes this check and simply never matches. That is intended:
 * the rule keeps its meaning until such a symbol appears.
 */
export const RULE_SYMBOL_PATTERN = /^[A-Z0-9._-]{2,30}$/;

/** True when `type` may carry an instance-scoped rule. */
export function supportsSymbolScope(type: WindowRuleType): boolean {
  return SYMBOL_SCOPED_RULE_TYPES.includes(type);
}

/**
 * Scope part of a rule's identity: `""` for a type-wide rule, `symbol:BTCUSDT`
 * for a scoped one. Only `ruleKey` consumes it, which is what keeps the two
 * scopes of one type from colliding in the dedupe map and in the UI's list key.
 */
export function ruleScopeKey(rule: WindowRule): string {
  return rule.match ? `${rule.match.kind}:${rule.match.value}` : "";
}

/** Stable identity of a rule across the whole list: type plus scope. */
export function ruleKey(rule: WindowRule): string {
  return `${rule.windowType}|${ruleScopeKey(rule)}`;
}

/**
 * True when the list already holds a rule for `symbol` *of the same window
 * type*, ignoring the one whose key is `exceptKey` (the rule being renamed).
 * The editor refuses a duplicate instead of merging two rules that would
 * collide on the same instance. The type is part of the question because a
 * symbol is only unique within its type — the dedupe key has always been
 * type plus scope, so this helper must not be stricter than the key.
 */
export function hasSymbolRule(
  rules: readonly WindowRule[] | undefined,
  type: WindowRuleType,
  symbol: string,
  exceptKey?: string,
): boolean {
  const wanted = normalizeRuleSymbol(symbol);
  if (!wanted) return false;
  return (rules ?? []).some(
    (rule) =>
      rule.windowType === type &&
      rule.match?.kind === "symbol" &&
      rule.match.value === wanted &&
      ruleKey(rule) !== exceptKey,
  );
}

/** The instance context a rule is matched against; `symbol` is "" when unset. */
export interface WindowRuleInstance {
  symbol?: string;
}

/**
 * The rule that applies to `type` (and `instance`), or `undefined`.
 *
 * A scoped rule wins over the type-wide one for the instance it names, and
 * only *enabled* rules compete — disabling the specific rule is how you fall
 * back to the type-wide one, so the filter runs before the match.
 */
export function findWindowRule(
  rules: readonly WindowRule[] | undefined,
  type: WindowType,
  instance?: WindowRuleInstance,
): WindowRule | undefined {
  const candidates = (rules ?? []).filter(
    (rule) => rule.enabled && rule.windowType === type,
  );
  if (candidates.length === 0) return undefined;

  const symbol = normalizeRuleSymbol(instance?.symbol);
  if (symbol) {
    const specific = candidates.find(
      (rule) => rule.match?.kind === "symbol" && rule.match.value === symbol,
    );
    if (specific) return specific;
  }
  return candidates.find((rule) => !rule.match);
}

/**
 * FEAT-0770 — true when `rule` targets one concrete live window: the same
 * window type, and for a scoped rule the same symbol.
 *
 * A type-wide rule matches every instance of its type. That is deliberate:
 * pressing "Apply now" on that card is an explicit statement about the window
 * in front of the user, not the automatic precedence `findWindowRule` applies
 * on open (where a scoped rule wins over the type-wide one).
 */
export function ruleTargetsInstance(
  rule: WindowRule,
  type: WindowType,
  symbol?: string,
): boolean {
  if (rule.windowType !== type) return false;
  if (!rule.match) return true;
  if (rule.match.kind !== "symbol") return false;
  return rule.match.value === normalizeRuleSymbol(symbol);
}

/**
 * Validates a stored scope. Returns `undefined` when the rule is type-wide,
 * `null` when the entry cannot be trusted.
 */
function parseMatch(
  value: unknown,
  windowType: WindowRuleType,
): WindowRuleMatch | null | undefined {
  if (value === undefined) return undefined;
  // A scope on a type that cannot have one is not "harmless extra data": it
  // would silently mean "every instance" after the scope is dropped. Reject
  // the rule instead, so the container never quietly widens.
  if (!supportsSymbolScope(windowType)) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  if (raw.kind !== "symbol" || typeof raw.value !== "string") return null;
  const symbol = normalizeRuleSymbol(raw.value);
  if (!RULE_SYMBOL_PATTERN.test(symbol)) return null;
  return { kind: "symbol", value: symbol };
}

/**
 * Validates one stored rule. Returns `null` when the entry as a whole cannot
 * be a rule: not an object, an unknown/unsupported window type, or a scope that
 * does not survive `parseMatch`. A single bad geometry field does not reject
 * the rule — that field is dropped and the remaining actions stay usable.
 */
export function sanitizeWindowRule(value: unknown): WindowRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const windowType = raw.windowType;
  if (typeof windowType !== "string" || !isRuleTarget(windowType as WindowType)) {
    return null;
  }
  const type = windowType as WindowRuleType;

  const match = parseMatch(raw.match, type);
  if (match === null) return null;

  const finite = (candidate: unknown, positive: boolean): number | undefined => {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      return undefined;
    }
    if (positive && (candidate <= 0 || candidate > MAX_RULE_DIMENSION)) {
      return undefined;
    }
    return candidate;
  };

  const rule: WindowRule = {
    windowType: type,
    // Fail closed, like the keep-above snapshot: only a literal `true` arms a
    // rule, so a hand-edited or truncated payload cannot move a window.
    enabled: raw.enabled === true,
  };
  if (match) rule.match = match;

  const x = finite(raw.x, false);
  const y = finite(raw.y, false);
  const width = finite(raw.width, true);
  const height = finite(raw.height, true);
  if (x !== undefined) rule.x = x;
  if (y !== undefined) rule.y = y;
  if (width !== undefined) rule.width = width;
  if (height !== undefined) rule.height = height;
  if (typeof raw.isMaximized === "boolean") rule.isMaximized = raw.isMaximized;
  if (typeof raw.isKeepAbove === "boolean") rule.isKeepAbove = raw.isKeepAbove;

  return rule;
}

/** What the load sanitizer kept, and which window types it had to discard. */
export interface WindowRuleInspection {
  rules: WindowRule[];
  /**
   * Stored `windowType` values the target list no longer accepts, unique and
   * in first-seen order. Only a *type* is reported: an entry rejected for its
   * shape was never a rule the picker could have produced, and naming it would
   * blame the user for a hand-edited payload.
   */
  droppedTypes: string[];
  /**
   * How many entries were discarded for that reason. `droppedTypes` is
   * deduplicated for the message; two rules of one type are still two rules.
   */
  droppedCount: number;
}

/**
 * Load-path sanitizer with a report. Keeps one rule per window type *and
 * scope*, preferring an enabled entry over a disabled duplicate so a stale
 * copy cannot silently disable the instance. Order follows the first
 * appearance of each key.
 */
export function inspectWindowRules(value: unknown): WindowRuleInspection {
  if (!Array.isArray(value)) {
    return { rules: [], droppedTypes: [], droppedCount: 0 };
  }
  const byKey = new Map<string, WindowRule>();
  const droppedTypes: string[] = [];
  let droppedCount = 0;
  for (const entry of value) {
    const rule = sanitizeWindowRule(entry);
    if (!rule) {
      const rawType =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>).windowType
          : undefined;
      if (typeof rawType === "string" && !isRuleTarget(rawType as WindowType)) {
        droppedCount += 1;
        if (!droppedTypes.includes(rawType)) droppedTypes.push(rawType);
      }
      continue;
    }
    const key = ruleKey(rule);
    const existing = byKey.get(key);
    if (!existing || (!existing.enabled && rule.enabled)) {
      byKey.set(key, rule);
    }
  }
  return { rules: [...byKey.values()], droppedTypes, droppedCount };
}

/**
 * The surviving rules, without the report.
 *
 * Kept as the list-only entry point: the load path uses `inspectWindowRules`
 * so it can report what it discarded, but a caller that only needs the rules
 * should not have to destructure a report.
 */
export function sanitizeWindowRules(value: unknown): WindowRule[] {
  return inspectWindowRules(value).rules;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The patch a matching rule contributes on open.
 *
 * Only finite numbers survive: a cleared number input or a hand-edited
 * `null` must read as "not set", never as a coordinate.
 *
 * Precedence (maximize over geometry) lives in `WindowBase`, which also
 * ignores `isKeepAbove` for close-on-blur targets — this function only drops
 * the flag when the caller already knows the target closes on blur.
 */
export function windowRulePatch(
  rule: WindowRule | undefined,
  closeOnBlur: boolean,
): WindowRulePatch {
  if (!rule) return {};
  const patch: WindowRulePatch = {};
  if (isFiniteNumber(rule.x)) patch.x = rule.x;
  if (isFiniteNumber(rule.y)) patch.y = rule.y;
  if (isFiniteNumber(rule.width)) patch.width = rule.width;
  if (isFiniteNumber(rule.height)) patch.height = rule.height;
  if (typeof rule.isMaximized === "boolean") {
    patch.isMaximized = rule.isMaximized;
  }
  if (!closeOnBlur && typeof rule.isKeepAbove === "boolean") {
    patch.isKeepAbove = rule.isKeepAbove;
  }
  return patch;
}
