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
 * WebGL context-loss handling for the renderers.
 *
 * Three.js already installs its own `webglcontextlost/restored` listeners and
 * calls `preventDefault()` so the context can come back. What it does not do
 * is tell the owner: the surrounding requestAnimationFrame loop keeps
 * scheduling frames (and running engine update code) against a dead context.
 * This helper surfaces the transition so the caller can stop, and resume.
 */

export interface ContextRecoveryHandlers {
  /** The GPU context was lost; pause rendering. */
  onLost?: (event: Event) => void;
  /** The GPU context was restored; re-render/resume. */
  onRestored?: () => void;
}

/**
 * Attach context-loss listeners to a canvas (HTML or Offscreen). Returns a
 * detach function.
 */
export function attachContextRecovery(
  canvas: EventTarget,
  handlers: ContextRecoveryHandlers = {},
): () => void {
  const handleLost = (event: Event) => {
    // Opt in to restoration; three does this too, and a second call is a no-op.
    event.preventDefault?.();
    handlers.onLost?.(event);
  };
  const handleRestored = () => handlers.onRestored?.();

  canvas.addEventListener("webglcontextlost", handleLost);
  canvas.addEventListener("webglcontextrestored", handleRestored);

  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost);
    canvas.removeEventListener("webglcontextrestored", handleRestored);
  };
}
