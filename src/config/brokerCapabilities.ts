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

export const BROKER_CAPABILITIES: Record<string, { nativeTimeframes: string[] }> = {
    // Bitunix Native Timeframes (from API docs or experimentation)
    bitunix: {
        nativeTimeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    },
    // Future placeholders
    bitget: {
        nativeTimeframes: ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]
    },
    binance: {
        nativeTimeframes: ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]
    }
};
