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
        nameKey: "duck.achievements.first_feed_name",
        descriptionKey: "duck.achievements.first_feed_desc",
        condition: (s: DuckDaoState) => s.totalFeeds >= 1,
    },
    {
        id: "ten_feeds",
        nameKey: "duck.achievements.ten_feeds_name",
        descriptionKey: "duck.achievements.ten_feeds_desc",
        condition: (s: DuckDaoState) => s.totalFeeds >= 10,
    },
    {
        id: "hundred_feeds",
        nameKey: "duck.achievements.hundred_feeds_name",
        descriptionKey: "duck.achievements.hundred_feeds_desc",
        condition: (s: DuckDaoState) => s.totalFeeds >= 100,
    },
    {
        id: "streak_3",
        nameKey: "duck.achievements.streak_3_name",
        descriptionKey: "duck.achievements.streak_3_desc",
        condition: (s: DuckDaoState) => s.currentStreak >= 3,
    },
    {
        id: "streak_7",
        nameKey: "duck.achievements.streak_7_name",
        descriptionKey: "duck.achievements.streak_7_desc",
        condition: (s: DuckDaoState) => s.currentStreak >= 7,
    },
    {
        id: "streak_30",
        nameKey: "duck.achievements.streak_30_name",
        descriptionKey: "duck.achievements.streak_30_desc",
        condition: (s: DuckDaoState) => s.currentStreak >= 30,
    },
    {
        id: "level_5",
        nameKey: "duck.achievements.level_5_name",
        descriptionKey: "duck.achievements.level_5_desc",
        condition: (s: DuckDaoState) => s.level >= 5,
    },
    {
        id: "level_10",
        nameKey: "duck.achievements.level_10_name",
        descriptionKey: "duck.achievements.level_10_desc",
        condition: (s: DuckDaoState) => s.level >= 10,
    },
    {
        id: "level_20",
        nameKey: "duck.achievements.level_20_name",
        descriptionKey: "duck.achievements.level_20_desc",
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
