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
 * FEAT-0679 — the market structure reference content.
 *
 * The four sections render as plain text nodes, so every key under
 * `academy.structure` must resolve to a non-empty string in both languages.
 * Non-vacuity as elsewhere: an empty namespace must fail, not agree with
 * nothing, and DE/EN are checked side by side so a one-language gap fails.
 */

import { describe, expect, it } from "vitest";

import de from "../../locales/locales/de.json";
import en from "../../locales/locales/en.json";

type Bundle = Record<string, unknown>;

const LOCALES: readonly (readonly [string, Bundle])[] = [
    ["en", en as Bundle],
    ["de", de as Bundle],
];

const SECTIONS = ["s1", "s2", "s3", "s4"] as const;

function nonEmpty(bundle: Bundle, dotted: string): string {
    const value = dotted
        .split(".")
        .reduce<unknown>((node, part) => (node as Bundle | undefined)?.[part], bundle);
    expect(typeof value, dotted).toBe("string");
    expect((value as string).trim().length, dotted).toBeGreaterThan(0);
    return value as string;
}

describe("market structure content", () => {
    it("carries a title and an open-lesson label", () => {
        expect(SECTIONS.length).toBeGreaterThan(0);
        for (const [, bundle] of LOCALES) {
            nonEmpty(bundle, `academy.structure.title`);
            nonEmpty(bundle, `academy.structure.openLesson`);
        }
    });

    it("carries all four sections with title and body, in both languages", () => {
        for (const [, bundle] of LOCALES) {
            for (const section of SECTIONS) {
                nonEmpty(bundle, `academy.structure.${section}.title`);
                nonEmpty(bundle, `academy.structure.${section}.body`);
            }
        }
    });

    it("labels every legend entry of the structure diagram, in both languages", () => {
        for (const [, bundle] of LOCALES) {
            for (const key of ["legendSwings", "legendBos", "legendChoch", "legendZone"]) {
                nonEmpty(bundle, `academy.structure.s2.${key}`);
            }
        }
    });
});
