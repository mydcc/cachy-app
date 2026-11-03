// @vitest-environment happy-dom
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

/**
 * The CSV import confirmation promised a choice its message could not make:
 * `Import {count} trades?` rendered "Import 1 trades?". The copy is an ICU
 * plural now, and this pins both categories in both languages through the real
 * dictionary — the mocked component tests cannot see a formatting change.
 *
 * Runs in the `components` project for the DOM and the i18n setup its
 * `updateEffectiveLocale` needs; it mounts nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { locale as svelteLocale } from "svelte-i18n";

import { _, i18nReady, setLocale, updateEffectiveLocale } from "./i18n";

async function useLocale(value: "en" | "de"): Promise<void> {
    setLocale(value);
    await updateEffectiveLocale(false);
    await vi.waitFor(() => expect(get(svelteLocale)).toBe(value), {
        timeout: 3_000,
    });
}

beforeEach(async () => {
    await i18nReady;
    await useLocale("en");
});

afterEach(async () => {
    await useLocale("en");
});

describe("modals.import.message plural", () => {
    it("names a single imported trade in the singular (en)", () => {
        const t = get(_);

        expect(t("modals.import.message", { values: { count: 1 } })).toBe(
            "Import 1 trade?",
        );
        expect(t("modals.import.message", { values: { count: 2 } })).toBe(
            "Import 2 trades?",
        );
    });

    it("keeps the German categories as well", async () => {
        await useLocale("de");
        const t = get(_);

        expect(t("modals.import.message", { values: { count: 1 } })).toBe(
            "1 Trade importieren?",
        );
        expect(t("modals.import.message", { values: { count: 2 } })).toBe(
            "2 Trades importieren?",
        );
    });
});
