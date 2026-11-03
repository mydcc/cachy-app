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
 * Shared scaffolding for component tests that stand in the dictionary.
 *
 * `message` resolves a dotted key against `en.json` and throws on a missing
 * key — a typo has to fail the test instead of rendering `undefined`. The
 * module shape samples its dictionary per translation, so a test can point it
 * at another locale (e.g. `de.json`) without re-mocking anything.
 */

import { readable } from "svelte/store";
import { vi } from "vitest";

import en from "../../locales/locales/en.json";

export type Dictionary = Record<string, unknown>;

export function messageFrom(
    key: string,
    dictionary: Dictionary = en,
): string {
    const value = key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Dictionary | undefined)?.[part],
            dictionary,
        );
    if (typeof value !== "string") {
        throw new Error(`missing i18n key: ${key}`);
    }
    return value;
}

/** `en.json` copy for a dotted key — the default of these tests. */
export function message(key: string): string {
    return messageFrom(key, en);
}

/**
 * `en.json` copy with simple `{name}` placeholders substituted. A missing
 * value throws rather than rendering `{name}`: the real store ignores a flat
 * object, and a test that reproduces that silence is the failure mode this
 * harness exists to catch. ICU messages (`, plural,`) are returned untouched —
 * assert those through the real store instead
 * (`src/locales/i18n.plural.component.test.ts`).
 */
export function translate(
    key: string,
    values?: Record<string, unknown>,
): string {
    return translateFrom(key, en, values);
}

export function translateFrom(
    key: string,
    dictionary: Dictionary = en,
    values?: Record<string, unknown>,
): string {
    const template = messageFrom(key, dictionary);
    if (!values) return template;
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
        if (!(name in values)) {
            throw new Error(`${key}: no value for {${name}}`);
        }
        return String(values[name]);
    });
}

/**
 * The shape a `vi.mock("…/locales/i18n", …)` factory returns. Only the three
 * exports the mounted window stack reads are provided, in the svelte-i18n
 * signature `(key, { values })`. `getDictionary` is sampled per translation,
 * so a test that swaps its dictionary sees the new copy on the next call.
 */
export function i18nModule(getDictionary: () => Dictionary = () => en) {
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, unknown> }) =>
                translateFrom(key, getDictionary(), options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
}
