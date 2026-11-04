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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { APP_VERSION } from "../lib/version";

/** The only window field telemetry is allowed to read. */
export interface TelemetryWindow {
  windowType: string;
}

export interface TelemetryViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

/**
 * Dimensions attached to every telemetry event.
 *
 * Class A data never belongs here: ADR-0001 forbids settings, journal,
 * presets, notes and API keys in telemetry, not just in server storage
 * (BUG-0778). The parameter types carry only what may be sent, so a caller
 * cannot pass a symbol-bearing window id or a settings value by accident.
 */
export function buildTelemetryContext(
  windows: ReadonlyArray<TelemetryWindow>,
  viewport: TelemetryViewport,
): Record<string, string | number> {
  return {
    app_modals: windows.map((w) => w.windowType).join(","),
    app_viewport: `${viewport.width}x${viewport.height}`,
    app_zoom: viewport.devicePixelRatio,
    app_version: APP_VERSION,
  };
}
