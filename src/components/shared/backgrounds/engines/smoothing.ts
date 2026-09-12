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
 */

/**
 * Framerate-independent exponential smoothing for the dynamic atmosphere.
 *
 * A fixed per-frame factor (`value += (target - value) * 0.02`) is tied to the
 * refresh rate: the same scene settles twice as fast on a 120 Hz display as on
 * a 60 Hz one. Deriving the factor from the real frame delta keeps the feel
 * identical everywhere.
 *
 * Visual math on plain numbers, like `volumeScale.ts`; not for financial code.
 */

/**
 * Blend factor this frame for an exponential approach with time constant `tau`
 * (seconds): `value += (target - value) * smoothingAlpha(dt, tau)`.
 *
 * Mathematically `1 - exp(-dt / tau)`, so two half-sized steps reach exactly the
 * same state as one full step.
 */
export function smoothingAlpha(dt: number, tau: number): number {
	if (!Number.isFinite(dt) || dt <= 0) return 0;
	if (!Number.isFinite(tau) || tau <= 0) return 0;
	return 1 - Math.exp(-dt / tau);
}

/**
 * Time constants (seconds). Each was derived from the old per-frame factor at
 * 60 Hz (`tau = -dt / ln(1 - factor)`), so the default feel is unchanged on the
 * display the values were tuned on.
 */
export const TAU_SIGNAL = 0.825; // mood + activity + atmosphere colour + fog
export const TAU_NEBULA = 0.547; // sky opacity / colour
export const TAU_GYRO = 0.325; // gyroscope follow
export const TAU_NEBULA_FADE = 0.325; // sky fade-out when the atmosphere is off
