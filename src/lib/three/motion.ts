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
 * Reduced-motion resolution for the WebGL layer.
 *
 * The OS `prefers-reduced-motion` signal is the default; a manual user
 * override can force motion on or off regardless of the OS. When motion is
 * reduced, the renderers draw a single static frame and stop their loop
 * instead of animating — it keeps the art direction without the movement or
 * the battery cost.
 */

export type ReduceMotionPreference = "system" | "reduce" | "full";

export const REDUCE_MOTION_VALUES: readonly ReduceMotionPreference[] = [
  "system",
  "reduce",
  "full",
];

const PRESET_QUERY = "(prefers-reduced-motion: reduce)";

interface MediaQueryLike {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
}

/** The OS-level preference. Safe on the server (returns false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(PRESET_QUERY).matches;
}

/**
 * Combine the user preference with the OS signal. `reduce`/`full` are explicit
 * overrides; `system` follows the OS.
 */
export function resolveReducedMotion(
  preference: ReduceMotionPreference,
  systemPrefers: boolean = prefersReducedMotion(),
): boolean {
  if (preference === "reduce") return true;
  if (preference === "full") return false;
  return systemPrefers;
}

/**
 * Observe OS preference changes. Returns an unsubscribe function; a no-op when
 * `matchMedia` is unavailable.
 */
export function subscribeReducedMotion(
  callback: (reduced: boolean) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(PRESET_QUERY) as unknown as MediaQueryLike;
  const handler = (event: { matches: boolean }) => callback(event.matches);

  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener?.("change", handler);
  }
  if (typeof mql.addListener === "function") {
    mql.addListener(handler);
    return () => mql.removeListener?.(handler);
  }
  return () => {};
}

/** Coerce a persisted/unknown value to a known preference. */
export function normalizeReduceMotion(value: unknown): ReduceMotionPreference {
  return REDUCE_MOTION_VALUES.includes(value as ReduceMotionPreference)
    ? (value as ReduceMotionPreference)
    : "system";
}
