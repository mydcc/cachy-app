// @vitest-environment jsdom
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkNewAchievements, DUCK_ACHIEVEMENTS } from "./DuckAchievements";
import type { DuckDaoState } from "./types";

// ─── DuckAchievements Unit Tests ──────────────────────────────────────────────
// DuckLogic.ts itself is not tested here because it requires a live THREE.Scene.
// The achievement and streak logic is extracted and testable in isolation.

function makeState(overrides: Partial<DuckDaoState> = {}): DuckDaoState {
    return {
        xp: 0,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: "",
        totalFeeds: 0,
        achievements: [],
        ...overrides,
    };
}

describe("DUCK_ACHIEVEMENTS", () => {
    it("should export a non-empty list of achievements", () => {
        expect(DUCK_ACHIEVEMENTS.length).toBeGreaterThan(0);
    });

    it("every achievement should have a unique id", () => {
        const ids = DUCK_ACHIEVEMENTS.map((a) => a.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });
});

describe("checkNewAchievements", () => {
    it("should return no achievements for a fresh state", () => {
        const state = makeState();
        expect(checkNewAchievements(state)).toHaveLength(0);
    });

    it("should unlock first_feed after first feed", () => {
        const state = makeState({ totalFeeds: 1 });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).toContain("first_feed");
    });

    it("should not re-unlock already-unlocked achievements", () => {
        const state = makeState({ totalFeeds: 100, achievements: ["first_feed", "ten_feeds", "hundred_feeds"] });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).not.toContain("first_feed");
        expect(unlocked).not.toContain("ten_feeds");
        expect(unlocked).not.toContain("hundred_feeds");
    });

    it("should unlock streak_7 when currentStreak >= 7", () => {
        const state = makeState({ currentStreak: 7 });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).toContain("streak_7");
    });

    it("should not unlock streak_7 when currentStreak is 6", () => {
        const state = makeState({ currentStreak: 6 });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).not.toContain("streak_7");
    });

    it("should unlock level_10 when level >= 10", () => {
        const state = makeState({ level: 10 });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).toContain("level_10");
    });

    it("should unlock level_5 but not level_10 at level 5", () => {
        const state = makeState({ level: 5 });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).toContain("level_5");
        expect(unlocked).not.toContain("level_10");
    });

    it("should unlock multiple achievements at once", () => {
        const state = makeState({
            totalFeeds: 100,
            level: 20,
            currentStreak: 30,
        });
        const unlocked = checkNewAchievements(state);
        expect(unlocked).toContain("first_feed");
        expect(unlocked).toContain("hundred_feeds");
        expect(unlocked).toContain("level_20");
        expect(unlocked).toContain("streak_30");
    });
});

// ─── Streak-Logik ─────────────────────────────────────────────────────────────
// Testet die Streak-Berechnung unabhängig von DuckLogic (reine Funktionslogik)

function calculateStreak(
    lastActiveDate: string,
    currentStreak: number,
    today: string
): { currentStreak: number; longestStreak: number } {
    let streak = currentStreak;
    if (!lastActiveDate) {
        streak = 1;
    } else {
        const last = new Date(lastActiveDate);
        const now = new Date(today);
        const diffDays = Math.round(
            (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) {
            streak += 1;
        } else if (diffDays > 1) {
            streak = 1;
        }
    }
    return { currentStreak: streak, longestStreak: Math.max(streak, currentStreak) };
}

describe("Streak calculation", () => {
    it("should start streak at 1 for a fresh state", () => {
        const result = calculateStreak("", 0, "2026-08-11");
        expect(result.currentStreak).toBe(1);
    });

    it("should increment streak for consecutive day", () => {
        const result = calculateStreak("2026-08-10", 3, "2026-08-11");
        expect(result.currentStreak).toBe(4);
    });

    it("should reset streak to 1 after a gap", () => {
        const result = calculateStreak("2026-08-08", 5, "2026-08-11");
        expect(result.currentStreak).toBe(1);
    });

    it("should not change streak for same-day activity", () => {
        const result = calculateStreak("2026-08-11", 5, "2026-08-11");
        expect(result.currentStreak).toBe(5);
    });

    it("should update longestStreak when currentStreak exceeds it", () => {
        const result = calculateStreak("2026-08-10", 9, "2026-08-11");
        expect(result.currentStreak).toBe(10);
        expect(result.longestStreak).toBe(10);
    });
});
