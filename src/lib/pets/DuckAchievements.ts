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

import type { Achievement, DuckDaoState } from "./types";

export const DUCK_ACHIEVEMENTS: Achievement[] = [
    {
        id: "first_feed",
        name: "Erstes Brot",
        description: "Die Ente zum ersten Mal gefüttert.",
        condition: (s: DuckDaoState) => s.totalFeeds >= 1,
    },
    {
        id: "ten_feeds",
        name: "Stammgast",
        description: "Die Ente 10-mal gefüttert.",
        condition: (s: DuckDaoState) => s.totalFeeds >= 10,
    },
    {
        id: "hundred_feeds",
        name: "Bäckermeister",
        description: "Die Ente 100-mal gefüttert.",
        condition: (s: DuckDaoState) => s.totalFeeds >= 100,
    },
    {
        id: "streak_3",
        name: "Routiniert",
        description: "3 Tage in Folge aktiv.",
        condition: (s: DuckDaoState) => s.currentStreak >= 3,
    },
    {
        id: "streak_7",
        name: "Wochenstreaker",
        description: "7 Tage in Folge aktiv.",
        condition: (s: DuckDaoState) => s.currentStreak >= 7,
    },
    {
        id: "streak_30",
        name: "Eiserne Disziplin",
        description: "30 Tage in Folge aktiv.",
        condition: (s: DuckDaoState) => s.currentStreak >= 30,
    },
    {
        id: "level_5",
        name: "Stilbewusst",
        description: "Level 5 erreicht — die Ente trägt jetzt einen Hut.",
        condition: (s: DuckDaoState) => s.level >= 5,
    },
    {
        id: "level_10",
        name: "Duck Master",
        description: "Level 10 erreicht — die Krone sitzt.",
        condition: (s: DuckDaoState) => s.level >= 10,
    },
    {
        id: "level_20",
        name: "Legendary Quacker",
        description: "Level 20 erreicht — das Cape weht.",
        condition: (s: DuckDaoState) => s.level >= 20,
    },
];

/**
 * Gibt die IDs aller Achievements zurück, die neu freigeschaltet wurden
 * (d.h. Bedingung erfüllt, aber noch nicht in state.achievements).
 */
export function checkNewAchievements(state: DuckDaoState): string[] {
    const newlyUnlocked: string[] = [];
    for (const achievement of DUCK_ACHIEVEMENTS) {
        if (!state.achievements.includes(achievement.id) && achievement.condition(state)) {
            newlyUnlocked.push(achievement.id);
        }
    }
    return newlyUnlocked;
}
