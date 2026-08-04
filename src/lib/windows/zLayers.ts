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
 * Single source of truth for the ordering of floating-surface z-index layers.
 * See ADR-0006 and FEAT-0041 (docs/adr/, docs/backlog/features/).
 *
 * The numeric values here must match the `--z-*` custom properties in
 * src/themes.css exactly — zLayers.test.ts asserts that. CSS cannot import
 * from a TS module, so the two are kept in sync by convention plus that test,
 * not by a build step.
 *
 * WindowManager.svelte.ts's own zIndex counter starts at Z_LAYERS.window and
 * grows per focus event, normalizing back to that base once it approaches
 * MAX_SAFE_WINDOW_Z_INDEX. Every layer above `window` sits far enough past
 * that ceiling that the counter's growth can never cross into it.
 */
export const Z_LAYERS = {
    window: 11000,
    windowDock: 1_010_000,
    windowMax: 1_020_000,
    modal: 1_030_000,
    toast: 1_040_000,
    fx: 1_050_000,
} as const;

/** Must stay below Z_LAYERS.windowDock. See WindowManager.svelte.ts's own MAX_SAFE_Z_INDEX. */
export const MAX_SAFE_WINDOW_Z_INDEX = 1_000_000;
