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

import type { WindowType } from "./types";
import type {
  WindowRule,
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
 */
export const WINDOW_RULE_TYPES: readonly WindowRuleType[] = Object.freeze([
  "journal",
  "chart",
  "academy",
  "assistant",
  "settings",
  "news",
  "alertpanel",
  "controlcenter",
  "channel",
  "iframe",
  "chatbox",
  "guide",
  "changelog",
  "privacy",
  "whitepaper",
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
 * The enabled rule for `type`, or `undefined`. At most one exists; an
 * overlapping payload is normalized by `sanitizeWindowRules` on load, so
 * first-match is deterministic here too.
 */
export function findWindowRule(
  rules: readonly WindowRule[] | undefined,
  type: WindowType,
): WindowRule | undefined {
  return rules?.find((rule) => rule.enabled && rule.windowType === type);
}

/**
 * Validates one stored rule. Returns `null` when the entry as a whole cannot
 * be a rule: not an object, or an unknown/unsupported window type. A single
 * bad geometry field does not reject the rule — that field is dropped and the
 * remaining actions stay usable.
 */
export function sanitizeWindowRule(value: unknown): WindowRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const windowType = raw.windowType;
  if (typeof windowType !== "string" || !isRuleTarget(windowType as WindowType)) {
    return null;
  }

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
    windowType: windowType as WindowRuleType,
    // Fail closed, like the keep-above snapshot: only a literal `true` arms a
    // rule, so a hand-edited or truncated payload cannot move a window.
    enabled: raw.enabled === true,
  };

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

/**
 * Load-path sanitizer. Keeps one rule per window type, preferring an enabled
 * entry over a disabled duplicate so a stale copy cannot silently disable the
 * type. Order follows the first appearance of each type.
 */
export function sanitizeWindowRules(value: unknown): WindowRule[] {
  if (!Array.isArray(value)) return [];
  const byType = new Map<WindowRuleType, WindowRule>();
  for (const entry of value) {
    const rule = sanitizeWindowRule(entry);
    if (!rule) continue;
    const existing = byType.get(rule.windowType);
    if (!existing || (!existing.enabled && rule.enabled)) {
      byType.set(rule.windowType, rule);
    }
  }
  return [...byType.values()];
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
