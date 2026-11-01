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
 * `WindowBase` applies a rule. Keeping the type list here (instead of
 * deriving it from the registry) makes "which types may have a rule" a
 * product statement that is testable without instantiating windows.
 */

import type { WindowType } from "./types";
import type { WindowRule } from "../../stores/settings/settingsTypes";

/**
 * Window types a rule may target.
 *
 * Excludes `modal`, `dialog` and `symbolpicker`: they are short-lived,
 * centre-fixed surfaces with no layout to remember, and the item lists them
 * as out of scope. `window` stays in because it is the generic fallback the
 * registry hands out for custom windows.
 */
export const WINDOW_RULE_TYPES: readonly WindowType[] = Object.freeze([
  "window",
  "chart",
  "news",
  "settings",
  "chatbox",
  "journal",
  "academy",
  "assistant",
  "channel",
  "alertpanel",
  "controlcenter",
  "iframe",
  "guide",
  "changelog",
  "privacy",
  "whitepaper",
]);

/** Upper bound on a stored geometry value; same spirit as the snapshot cap. */
const MAX_RULE_DIMENSION = 100_000;

/**
 * The geometry/flag patch a rule applies on open. Unset fields are absent, so
 * the caller can keep the restored snapshot value for them.
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
export function isRuleTarget(type: WindowType): boolean {
  return WINDOW_RULE_TYPES.includes(type);
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
 * Validates one stored rule. Returns `null` for anything that could not have
 * been written by the UI: an unknown type, a non-object, a non-finite
 * geometry value or an out-of-range dimension.
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
    windowType: windowType as WindowType,
    enabled: raw.enabled !== false,
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
 * Load-path sanitizer: keeps the first valid rule per window type, so a
 * hand-edited or duplicated payload cannot create two rules fighting over
 * one window. Order is preserved.
 */
export function sanitizeWindowRules(value: unknown): WindowRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<WindowType>();
  const rules: WindowRule[] = [];
  for (const entry of value) {
    const rule = sanitizeWindowRule(entry);
    if (!rule || seen.has(rule.windowType)) continue;
    seen.add(rule.windowType);
    rules.push(rule);
  }
  return rules;
}

/**
 * The patch a matching rule contributes on open.
 *
 * A maximized rule wins over its own geometry (the item's acceptance
 * criterion). `isKeepAbove` is dropped for close-on-blur windows: keeping
 * such a window above everything contradicts the dismissal rule that closes
 * it on the next click.
 */
export function windowRulePatch(
  rule: WindowRule | undefined,
  closeOnBlur: boolean,
): WindowRulePatch {
  if (!rule) return {};
  const patch: WindowRulePatch = {};
  if (rule.isMaximized !== undefined) {
    patch.isMaximized = rule.isMaximized;
  }
  if (rule.x !== undefined) patch.x = rule.x;
  if (rule.y !== undefined) patch.y = rule.y;
  if (rule.width !== undefined) patch.width = rule.width;
  if (rule.height !== undefined) patch.height = rule.height;
  if (!closeOnBlur && rule.isKeepAbove !== undefined) {
    patch.isKeepAbove = rule.isKeepAbove;
  }
  return patch;
}
