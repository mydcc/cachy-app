// @vitest-environment jsdom
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

import { beforeEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import { DuckLogic } from "./DuckLogic";
import { DUCK_STATE_STORAGE_KEY } from "./duckState";

const TODAY = new Date().toISOString().slice(0, 10);

describe("DuckLogic — resume after the master switch", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("keeps stored XP, level and achievements across destroy/recreate", () => {
        localStorage.setItem(
            DUCK_STATE_STORAGE_KEY,
            JSON.stringify({
                xp: 120,
                level: 3,
                currentStreak: 2,
                longestStreak: 2,
                lastActiveDate: TODAY,
                totalFeeds: 4,
                achievements: ["first_feed"],
                onboardingCompleted: false,
            }),
        );

        const first = new DuckLogic(new THREE.Scene());
        expect(first.getXp()).toBe(120);
        expect(first.getLevel()).toBe(3);

        first.destroy();

        // destroy() must not write defaults over the stored progress.
        expect(
            JSON.parse(localStorage.getItem(DUCK_STATE_STORAGE_KEY) ?? "{}")
                .xp,
        ).toBe(120);

        const resumed = new DuckLogic(new THREE.Scene());
        expect(resumed.getXp()).toBe(120);
        expect(resumed.getLevel()).toBe(3);
        expect(resumed.hasCompletedOnboarding()).toBe(false);
    });
});
