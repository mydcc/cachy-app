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
 * Permission policy for AI-issued trade actions — BUG-0472.
 *
 * `actionSchema.ts` is the wire contract shown to the model; this module is
 * the curated subset the app is willing to execute. Anything outside the
 * catalog (symbol switch, setup reset, account size, timeframe/view switches)
 * is dropped before it can reach `executeAction`, and every catalog action
 * except the note/tag pair always asks the user before writing to
 * `tradeState`, regardless of the `aiConfirmActions` toggle.
 *
 * Pure and dependency-free, so the policy is testable without a store or a
 * network.
 */

export type AiActionGroup = "setup" | "risk" | "notes";

export interface AiActionCatalogEntry {
  id: string;
  group: AiActionGroup;
}

/**
 * The only actions the assistant may ever request, grouped for the settings
 * dropdown. `actionSchema.ts` still advertises more names to the model; the
 * ones missing here are refused outright.
 */
export const AI_ACTION_CATALOG: readonly AiActionCatalogEntry[] = [
  { id: "setEntryPrice", group: "setup" },
  { id: "setStopLoss", group: "setup" },
  { id: "setTakeProfit", group: "setup" },
  { id: "addTakeProfit", group: "setup" },
  { id: "setTradeType", group: "setup" },
  { id: "setAtrMultiplier", group: "setup" },
  { id: "setUseAtrSl", group: "setup" },
  { id: "removeTakeProfit", group: "risk" },
  { id: "setRisk", group: "risk" },
  { id: "setLeverage", group: "risk" },
  { id: "setNotes", group: "notes" },
  { id: "setTags", group: "notes" },
];

/** The group order the settings dropdown renders. */
export const AI_ACTION_GROUPS: readonly AiActionGroup[] = [
  "setup",
  "risk",
  "notes",
];

/**
 * Actions that never touch the trade setup or the risk posture. They follow
 * the `aiConfirmActions` toggle; everything else asks unconditionally.
 */
const BENIGN_ACTIONS: ReadonlySet<string> = new Set(["setNotes", "setTags"]);

const CATALOG_IDS: ReadonlySet<string> = new Set(
  AI_ACTION_CATALOG.map((entry) => entry.id),
);

/**
 * Default permission set: the trade-setup and note actions are allowed, the
 * risk-posture group is off until the user opts in.
 */
export const AI_ALLOWED_ACTIONS_DEFAULT: readonly string[] =
  AI_ACTION_CATALOG.filter((entry) => entry.group !== "risk").map(
    (entry) => entry.id,
  );

export function isKnownAiAction(action: string): boolean {
  return CATALOG_IDS.has(action);
}

/**
 * True when executing this action must be confirmed by the user even if the
 * global `aiConfirmActions` toggle is off. Every catalog action qualifies
 * except the benign note/tag pair.
 */
export function requiresConfirmation(action: string): boolean {
  return CATALOG_IDS.has(action) && !BENIGN_ACTIONS.has(action);
}

/** True when any action in the batch needs an unconditional confirmation. */
export function shouldForceConfirm(
  actions: readonly { action: string }[],
): boolean {
  return actions.some((action) => requiresConfirmation(action.action));
}

export interface ActionFilterResult<T extends { action: string }> {
  permitted: T[];
  blocked: T[];
}

/**
 * Keep only the actions that are both known and enabled by the user. Unknown
 * actions (never offered by the catalog) and user-disabled actions are
 * returned in `blocked`, so the caller can warn and surface them.
 */
export function filterPermittedActions<T extends { action: string }>(
  actions: readonly T[],
  allowed: readonly string[],
): ActionFilterResult<T> {
  const allowedSet = new Set(allowed);
  const permitted: T[] = [];
  const blocked: T[] = [];
  for (const action of actions) {
    if (isKnownAiAction(action.action) && allowedSet.has(action.action)) {
      permitted.push(action);
    } else {
      blocked.push(action);
    }
  }
  return { permitted, blocked };
}

/**
 * Boundary validation for stored settings: an absent or non-array value falls
 * back to the default set, unknown ids are dropped, duplicates collapse, and
 * the result follows catalog order so it is deterministic.
 */
export function sanitizeAllowedActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [...AI_ALLOWED_ACTIONS_DEFAULT];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && isKnownAiAction(entry)) {
      seen.add(entry);
    }
  }
  return AI_ACTION_CATALOG.filter((entry) => seen.has(entry.id)).map(
    (entry) => entry.id,
  );
}
