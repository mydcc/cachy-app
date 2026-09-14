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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0346 — QuizButton starts the quiz and reflects whether one is active.
 * The active state is a visual promise: it must only light up from the store,
 * never from local state.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return { _: r((key: string) => lookup(key) ?? key), locale: r("en"), setLocale: vi.fn() };
});

const quizMock = vi.hoisted(() => ({ isQuizActive: false, startQuiz: vi.fn() }));
vi.mock("../../stores/quiz.svelte", () => ({ quizState: quizMock }));

vi.mock("../../actions/tracking", () => ({ trackClick: () => ({ destroy() {} }) }));

import QuizButton from "./QuizButton.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    quizMock.isQuizActive = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(QuizButton, { target: host }) as never;
    flushSync();
}

function button(): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>("button");
    if (!el) throw new Error("button not rendered");
    return el;
}

describe("FEAT-0346 — QuizButton starts the quiz and shows its state", () => {
    it("starts the quiz through the store", () => {
        render();

        button().click();

        expect(quizMock.startQuiz).toHaveBeenCalledTimes(1);
    });

    it("is not marked active while no quiz is running", () => {
        render();

        expect(button().classList.contains("active")).toBe(false);
    });

    it("is marked active while a quiz is running", () => {
        quizMock.isQuizActive = true;
        render();

        expect(button().classList.contains("active")).toBe(true);
    });

    it("is named for screen readers", () => {
        render();

        expect(button().getAttribute("aria-label")).toBe(lookup("common.aria.startQuiz"));
    });
});
