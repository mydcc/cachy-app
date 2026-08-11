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

export enum DuckState {
    IDLE = "IDLE",
    EATING = "EATING",
    CELEBRATING = "CELEBRATING",
    SAD = "SAD",
    SLEEPING = "SLEEPING",
    PETTING = "PETTING",
}

/** Priorität: höherer Wert = hat Vorrang */
export const DUCK_STATE_PRIORITY: Record<DuckState, number> = {
    [DuckState.CELEBRATING]: 5,
    [DuckState.EATING]: 4,
    [DuckState.SAD]: 3,
    [DuckState.PETTING]: 2,
    [DuckState.SLEEPING]: 1,
    [DuckState.IDLE]: 0,
};

export interface DuckDaoState {
    xp: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    lastActiveDate: string; // ISO-Datum, "YYYY-MM-DD"
    totalFeeds: number;
    achievements: string[];
}

export type DuckTriggerEvent =
    | { type: "feed"; amount: number }
    | { type: "trade_win"; pnl: number }
    | { type: "trade_loss"; pnl: number }
    | { type: "daily_login" }
    | { type: "academy_complete"; lessonId: string }
    | { type: "pet" };

export interface Achievement {
    id: string;
    name: string;
    description: string;
    condition: (state: DuckDaoState) => boolean;
}
