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

/**
 * FEAT-0733 -- the header's journal destination.
 *
 * The header renders the same registry entry twice: a plain mobile button in
 * the title row and the accent `Button` in the action cluster. Both ids matter
 * beyond the layout: the onboarding tour targets them, so a migration that
 * swaps them for one responsive control would silently break the tour.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../locales/locales/en.json";
import HeaderJournalButton from "./HeaderJournalButton.svelte";
import { uiState } from "../../stores/ui.svelte";
import { windowManager } from "../../lib/windows/WindowManager.svelte";
import { ModalWindow } from "../../lib/windows/implementations/ModalWindow.svelte";
import EmptyStub from "../../tests/helpers/EmptyStub.svelte";
import { ENTRY_POINTS } from "../../lib/navigation/entry-points";

const dictionary = en as Record<string, unknown>;

function getNestedTranslation(path: string): string {
  let current: unknown = dictionary;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

vi.mock("../../locales/i18n", () => {
  const translate = (key: string) => getNestedTranslation(key);
  return {
    _: {
      subscribe: (fn: (val: typeof translate) => void) => {
        fn(translate);
        return () => {};
      },
    },
  };
});

const journalEntry = ENTRY_POINTS.find((entry) => entry.id === "journal")!;

describe("FEAT-0733: HeaderJournalButton", () => {
  let target: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;

  function render(variant: "mobile" | "desktop") {
    component = mount(HeaderJournalButton, {
      target,
      props: { entry: journalEntry, variant },
    });
    flushSync();
    return target;
  }

  function openJournalWindow() {
    windowManager.open(
      new ModalWindow(EmptyStub, "Journal", {
        id: "journal",
        windowType: "journal",
      }),
    );
    return windowManager.windows.find((win) => win.windowType === "journal")!;
  }

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);
    windowManager.close("journal");
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    target.remove();
    windowManager.close("journal");
    vi.restoreAllMocks();
  });

  it("renders the mobile variant with the registry labels", () => {
    const el = render("mobile");
    const button = el.querySelector<HTMLButtonElement>("#journal-toggle-btn");

    expect(button).not.toBeNull();
    expect(button!.textContent?.trim()).toBe(
      getNestedTranslation("app.journalButton"),
    );
    expect(button!.title).toBe(
      getNestedTranslation("app.journalButtonTitle"),
    );
    expect(button!.className).toContain("md:hidden");
    expect(el.querySelector("#view-journal-btn-desktop")).toBeNull();
  });

  it("renders the desktop variant with the registry labels", () => {
    const el = render("desktop");
    const button = el.querySelector<HTMLButtonElement>(
      "#view-journal-btn-desktop",
    );

    expect(button).not.toBeNull();
    expect(button!.textContent?.trim()).toBe(
      getNestedTranslation("app.journalButton"),
    );
    expect(button!.title).toBe(
      getNestedTranslation("app.journalButtonTitle"),
    );
    expect(button!.getAttribute("aria-label")).toBe(
      getNestedTranslation("app.journalButton"),
    );
    expect(el.querySelector("#journal-toggle-btn")).toBeNull();
  });

  it("rejects a non-journal entry instead of duplicating the ids", () => {
    const settingsEntry = ENTRY_POINTS.find((entry) => entry.id === "settings")!;

    expect(() =>
      mount(HeaderJournalButton, {
        target,
        props: { entry: settingsEntry, variant: "mobile" },
      }),
    ).toThrow(/journal entry only/);
  });

  it("opens the journal from the mobile variant", () => {
    const open = vi
      .spyOn(uiState, "toggleJournalModal")
      .mockImplementation(async () => {});
    const el = render("mobile");

    el.querySelector<HTMLButtonElement>("#journal-toggle-btn")!.click();

    expect(open).toHaveBeenCalledWith(true);
  });

  it("restores a minimized journal from the desktop variant", () => {
    const journal = openJournalWindow();
    journal.isMinimized = true;
    const el = render("desktop");

    el.querySelector<HTMLButtonElement>("#view-journal-btn-desktop")!.click();

    expect(journal.isMinimized).toBe(false);
    expect(windowManager.windows.find((win) => win.id === "journal")).toBe(
      journal,
    );
  });
});
