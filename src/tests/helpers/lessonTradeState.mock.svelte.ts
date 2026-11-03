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

/*
 * Test-only reactive stand-in for the app-wide trade store (FEAT-0678).
 *
 * A plain object literal would make the control's reset `$effect`
 * unobservable: the effect reads `tradeState.symbol`, and only a rune can
 * notify it of a change. This helper exists so a component test can move the
 * symbol the way the real store does, and the reset path is exercised instead
 * of assumed.
 */

export const lessonTradeState = $state({ symbol: "BTCUSDT" });
