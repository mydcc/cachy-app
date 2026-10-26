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
 * FEAT-0685 — the frame's text-size control has to reach the content.
 *
 * `WindowFrame` has always applied a px `font-size` to `.window-content`, but
 * the app's type scale is the Tailwind token scale (v4 emits
 * `font-size: var(--text-sm)`), so a px size on the wrapper does not touch it:
 * the control would appear and do nothing for the prose. The frame therefore
 * also publishes `--text-scale`, the size relative to the window default, which
 * the tokens in `themes.css` multiply by. This pins both halves.
 *
 * The window used here opts into the control the same way the readers and the
 * Academy do; whether the Academy *opts in* is pinned separately in
 * `WindowRegistry.test.ts`.
 *
 * BUG-0710 — header controls raise their window: pressing one must reach the
 * frame's focus handler, and keyboard activation must do the same. Escape is
 * the one key the control group does not swallow.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowFrame from "./WindowFrame.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import { settingsState } from "../../../stores/settings.svelte";
import { DEFAULT_WINDOW_FONT_SIZE } from "../../../lib/constants";
import EmptyStub from "../../../tests/helpers/EmptyStub.svelte";

/** A window that opts into the font-size control, as the readers and the Academy do. */
class ProbeWindow extends WindowBase {
    constructor() {
        super({ title: "Probe", windowType: "guide" });
        /*
         * Set on the instance rather than inherited from a window type: the
         * constructor copies only a fixed list of options (`allowFontSize` is not
         * in it), so relying on `windowType` would make this test's precondition
         * another window's config, and its failure message would name that other
         * window.
         */
        this.allowFontSize = true;
    }

    get component() {
        return EmptyStub;
    }
}

/** A window type that never opted in. */
class PlainWindow extends WindowBase {
    constructor() {
        super({ title: "Plain", windowType: "window" });
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: Record<string, unknown> | null = null;

function mountFrame(win: WindowBase = new ProbeWindow()): {
    content: () => HTMLElement;
    win: WindowBase;
} {
    host = document.createElement("div");
    document.body.appendChild(host);

    component = mount(WindowFrame, { target: host, props: { window: win } }) as never;
    flushSync();

    const content = () => {
        const element = host?.querySelector<HTMLElement>(".window-content");
        if (!element) throw new Error("the frame rendered no content element");
        return element;
    };
    content();
    return { content, win };
}

beforeEach(() => {
    // The frame persists geometry under the window's own key. A fresh window
    // must not inherit the previous case's pinned snapshot, or the pin-restore
    // assertions become order-dependent.
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
    if (component) unmount(component as never);
    component = null;
    host?.remove();
    host = null;
});

describe("FEAT-0685 — the text-size control reaches the window content", () => {
    it("publishes the plain size and the scale factor the type tokens read", () => {
        const { content, win } = mountFrame();

        // At the default size the factor is exactly 1: nothing moves until the
        // trader steps it.
        expect(content().style.fontSize).toBe(`${DEFAULT_WINDOW_FONT_SIZE}px`);
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");

        // One step up: the plain size grows for text that inherits, and the
        // factor grows with it for text sized by the type scale.
        win.setFontSize(DEFAULT_WINDOW_FONT_SIZE + 1);
        flushSync();

        expect(content().style.fontSize).toBe(`${DEFAULT_WINDOW_FONT_SIZE + 1}px`);
        expect(content().style.getPropertyValue("--text-scale")).toBe(
            String((DEFAULT_WINDOW_FONT_SIZE + 1) / DEFAULT_WINDOW_FONT_SIZE),
        );
    });

    it("clamps the size the same way the control does", () => {
        const { content, win } = mountFrame();

        win.setFontSize(4);
        flushSync();
        expect(content().style.fontSize).toBe("8px");

        win.setFontSize(99);
        flushSync();
        expect(content().style.fontSize).toBe("32px");
    });

    it("renders the two buttons for a window that opted in, and steps by one", () => {
        const { win } = mountFrame();
        const button = (label: string) =>
            host?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) ?? null;

        const increase = button(lookup("windows.aria.increaseFont"));
        expect(increase, "the window rendered no A+ button").not.toBeNull();
        expect(button(lookup("windows.aria.decreaseFont"))).not.toBeNull();

        const before = win.fontSize;
        increase!.click();
        flushSync();

        expect(win.fontSize).toBe(before + 1);
    });

    it("renders no control for a window that never opted in", () => {
        // The flag is the only reason the buttons exist, so an opted-out window
        // must render none — and must not scale, whatever its stored size says.
        const { content } = mountFrame(new PlainWindow());

        expect(host?.querySelector(`[aria-label="${lookup("windows.aria.increaseFont")}"]`)).toBeNull();
        expect(host?.querySelector(`[aria-label="${lookup("windows.aria.decreaseFont")}"]`)).toBeNull();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");
    });

    it("publishes a usable factor even for a size the setter would never allow", () => {
        const { content, win } = mountFrame();

        // A legacy or hand-edited store can hold anything. `NaN` is the dangerous
        // one: it is *set*, so the tokens' `var(…, 1)` fallback cannot rescue
        // them and every sized element in the window would lose its size.
        win.fontSize = Number.NaN;
        flushSync();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");

        win.fontSize = 0;
        flushSync();
        expect(content().style.getPropertyValue("--text-scale")).toBe("1");
    });
});

describe("BUG-0710 — a header control raises its window", () => {
    it("brings the window to front when a header control is pressed", () => {
        const win = new ProbeWindow();
        const action = vi.fn();
        win.headerControls = [{ label: "5m", active: true, action }];
        mountFrame(win);

        const control = host?.querySelector<HTMLButtonElement>(".header-ctrl-btn");
        const frame = host?.querySelector<HTMLElement>(".window-frame");
        expect(control, "the frame rendered no header control").not.toBeNull();
        expect(frame, "the frame rendered no window element").not.toBeNull();

        const bringToFront = vi.spyOn(windowManager, "bringToFront");
        control!.dispatchEvent(
            new Event("pointerdown", { bubbles: true, cancelable: true }),
        );
        flushSync();

        // Pressing a control is a press inside the window, not a special case:
        // the frame's own focus handler has to see it.
        expect(bringToFront).toHaveBeenCalledWith(win.id);
        expect(action).not.toHaveBeenCalled();
        // ... and the header's drag guard still keeps the control from
        // starting a window drag.
        expect(frame!.classList.contains("dragging")).toBe(false);

        // bringToFront() sets isFocused; the click guard must not raise twice.
        win.isFocused = true;
        control!.click();
        flushSync();
        expect(action).toHaveBeenCalledTimes(1);
        expect(bringToFront).toHaveBeenCalledTimes(1);
    });

    it("brings the window to front on keyboard activation", () => {
        const win = new ProbeWindow();
        const action = vi.fn();
        win.headerControls = [{ label: "5m", active: true, action }];
        mountFrame(win);

        const control = host?.querySelector<HTMLButtonElement>(".header-ctrl-btn");
        expect(control, "the frame rendered no header control").not.toBeNull();

        const bringToFront = vi.spyOn(windowManager, "bringToFront");
        win.isFocused = false;
        control!.focus();
        control!.click();
        flushSync();

        // Tab/Enter produces no pointerdown, so the click handler owns the
        // raise for the keyboard path.
        expect(bringToFront).toHaveBeenCalledWith(win.id);
        expect(action).toHaveBeenCalledTimes(1);
    });

    it("lets Escape through but keeps other keys inside the control group", () => {
        const win = new ProbeWindow();
        win.headerControls = [{ label: "5m", active: true, action: vi.fn() }];
        mountFrame(win);

        const control = host?.querySelector<HTMLButtonElement>(".header-ctrl-btn");
        expect(control, "the frame rendered no header control").not.toBeNull();
        control!.focus();

        const reachedWindow = vi.fn();
        window.addEventListener("keydown", reachedWindow);

        control!.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true,
                cancelable: true,
            }),
        );
        expect(reachedWindow).toHaveBeenCalledTimes(1);

        control!.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "a",
                bubbles: true,
                cancelable: true,
            }),
        );
        expect(reachedWindow).toHaveBeenCalledTimes(1);

        window.removeEventListener("keydown", reachedWindow);
    });

    it("still starts a drag from the header background", () => {
        mountFrame();
        const frame = host?.querySelector<HTMLElement>(".window-frame");
        const header = host?.querySelector<HTMLElement>(".window-header");
        expect(frame, "the frame rendered no window element").not.toBeNull();
        expect(header, "the frame rendered no header").not.toBeNull();

        header!.dispatchEvent(
            new PointerEvent("pointerdown", {
                pointerId: 1,
                clientX: 100,
                clientY: 100,
                bubbles: true,
                cancelable: true,
            }),
        );
        flushSync();
        expect(frame!.classList.contains("dragging")).toBe(true);

        header!.dispatchEvent(
            new PointerEvent("pointerup", { pointerId: 1, bubbles: true }),
        );
        flushSync();
        expect(frame!.classList.contains("dragging")).toBe(false);
    });
});

describe("FEAT-0616 — magnetic edge snapping", () => {
    it("previews an edge, cancels when leaving it, and pins on release", () => {
        const oldWidth = window.innerWidth;
        const oldHeight = window.innerHeight;
        Object.defineProperty(window, "innerWidth", {
            value: 1024,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 768,
            configurable: true,
        });

        try {
            const { win } = mountFrame();
            win.isPinned = false;
            win.pinSide = "none";
            win.x = 100;
            win.y = 100;
            win.width = 640;
            win.height = 480;
            flushSync();

            const header = host!.querySelector<HTMLElement>(".window-header");
            expect(header).not.toBeNull();
            header!.dispatchEvent(
                new PointerEvent("pointerdown", {
                    pointerId: 1,
                    clientX: 500,
                    clientY: 100,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            flushSync();

            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 10,
                    clientY: 100,
                    bubbles: true,
                }),
            );
            flushSync();

            const preview =
                host!.querySelector<HTMLElement>(".snap-preview");
            expect(preview).not.toBeNull();
            expect(preview!.style.width).toBe("512px");
            expect(preview!.style.height).toBe("768px");

            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 500,
                    clientY: 100,
                    bubbles: true,
                }),
            );
            flushSync();
            expect(host!.querySelector(".snap-preview")).toBeNull();

            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 10,
                    clientY: 100,
                    bubbles: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointerup", {
                    pointerId: 1,
                    clientX: 10,
                    clientY: 100,
                    bubbles: true,
                }),
            );
            flushSync();

            expect(host!.querySelector(".snap-preview")).toBeNull();
            expect(win.isPinned).toBe(true);
            expect(win.pinSide).toBe("left");
            expect(win.x).toBe(0);
            expect(win.y).toBe(0);
            expect(win.width).toBe(512);
            expect(win.height).toBe(768);
        } finally {
            Object.defineProperty(window, "innerWidth", {
                value: oldWidth,
                configurable: true,
            });
            Object.defineProperty(window, "innerHeight", {
                value: oldHeight,
                configurable: true,
            });
        }
    });

    it("offers the same snap actions from the keyboard", () => {
        const { win } = mountFrame();
        const frame = host!.querySelector<HTMLElement>(".window-frame");
        expect(frame).not.toBeNull();
        expect(frame!.getAttribute("aria-keyshortcuts")).toContain(
            "Alt+ArrowRight",
        );

        win.isFocused = true;
        flushSync();
        window.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowRight",
                altKey: true,
                bubbles: true,
                cancelable: true,
            }),
        );
        flushSync();

        expect(win.isPinned).toBe(true);
        expect(win.pinSide).toBe("right");
        expect(win.x).toBe(window.innerWidth / 2);
    });

    it("detaches a pinned window on the first drag movement", () => {
        const oldWidth = window.innerWidth;
        const oldHeight = window.innerHeight;
        Object.defineProperty(window, "innerWidth", {
            value: 1024,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 768,
            configurable: true,
        });

        try {
            const { win } = mountFrame();
            win.x = 120;
            win.y = 90;
            win.width = 600;
            win.height = 480;
            win.snapToSide("left");
            flushSync();

            expect(win.isPinned).toBe(true);
            expect(win.width).toBe(512);

            const header = host!.querySelector<HTMLElement>(".window-header");
            expect(header).not.toBeNull();

            header!.dispatchEvent(
                new PointerEvent("pointerdown", {
                    pointerId: 1,
                    clientX: 200,
                    clientY: 50,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 400,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            flushSync();

            expect(win.isPinned).toBe(false);
            // The drag keeps the tiled width and follows the pointer; it does
            // not jump back to the pre-snap rectangle.
            expect(win.x).toBe(200);
            expect(win.width).toBe(512);

            header!.dispatchEvent(
                new PointerEvent("pointerup", {
                    pointerId: 1,
                    clientX: 400,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            flushSync();

            expect(win.isPinned).toBe(false);
        } finally {
            Object.defineProperty(window, "innerWidth", {
                value: oldWidth,
                configurable: true,
            });
            Object.defineProperty(window, "innerHeight", {
                value: oldHeight,
                configurable: true,
            });
        }
    });

    it("keeps a pinned window pinned on a click without movement", () => {
        const { win } = mountFrame();
        win.snapToSide("left");
        flushSync();

        const header = host!.querySelector<HTMLElement>(".window-header");
        header!.dispatchEvent(
            new PointerEvent("pointerdown", {
                pointerId: 1,
                clientX: 200,
                clientY: 50,
                bubbles: true,
                cancelable: true,
            }),
        );
        header!.dispatchEvent(
            new PointerEvent("pointerup", {
                pointerId: 1,
                clientX: 200,
                clientY: 50,
                bubbles: true,
            }),
        );
        flushSync();

        expect(win.isPinned).toBe(true);
    });

    it.each([
        [3, true, 0],
        [4, true, 0],
        [5, false, 5],
    ])(
        "detaches only beyond the 4 px threshold (%i px)",
        (dx, staysPinned, expectedX) => {
            const oldWidth = window.innerWidth;
            const oldHeight = window.innerHeight;
            Object.defineProperty(window, "innerWidth", {
                value: 1024,
                configurable: true,
            });
            Object.defineProperty(window, "innerHeight", {
                value: 768,
                configurable: true,
            });

            try {
                const { win } = mountFrame();
                win.snapToSide("left");
                flushSync();
                expect(win.width).toBe(512);

                const header =
                    host!.querySelector<HTMLElement>(".window-header");
                header!.dispatchEvent(
                    new PointerEvent("pointerdown", {
                        pointerId: 1,
                        clientX: 200,
                        clientY: 50,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                header!.dispatchEvent(
                    new PointerEvent("pointermove", {
                        pointerId: 1,
                        clientX: 200 + dx,
                        clientY: 50,
                        bubbles: true,
                    }),
                );
                flushSync();

                expect(win.isPinned).toBe(staysPinned);
                expect(win.x).toBe(expectedX);

                header!.dispatchEvent(
                    new PointerEvent("pointerup", {
                        pointerId: 1,
                        clientX: 200 + dx,
                        clientY: 50,
                        bubbles: true,
                    }),
                );
                flushSync();
            } finally {
                Object.defineProperty(window, "innerWidth", {
                    value: oldWidth,
                    configurable: true,
                });
                Object.defineProperty(window, "innerHeight", {
                    value: oldHeight,
                    configurable: true,
                });
            }
        },
    );

    it("keeps the pin when pointercancel arrives before the threshold", () => {
        const { win } = mountFrame();
        win.snapToSide("left");
        flushSync();

        const header = host!.querySelector<HTMLElement>(".window-header");
        header!.dispatchEvent(
            new PointerEvent("pointerdown", {
                pointerId: 1,
                clientX: 200,
                clientY: 50,
                bubbles: true,
                cancelable: true,
            }),
        );
        header!.dispatchEvent(
            new PointerEvent("pointermove", {
                pointerId: 1,
                clientX: 203,
                clientY: 50,
                bubbles: true,
            }),
        );
        header!.dispatchEvent(
            new PointerEvent("pointercancel", {
                pointerId: 1,
                clientX: 203,
                clientY: 50,
                bubbles: true,
            }),
        );
        flushSync();

        expect(win.isPinned).toBe(true);
        expect(host!.querySelector(".dragging")).toBeNull();
    });

    it("keeps a detach when pointercancel arrives after the threshold", () => {
        const oldWidth = window.innerWidth;
        const oldHeight = window.innerHeight;
        Object.defineProperty(window, "innerWidth", {
            value: 1024,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 768,
            configurable: true,
        });

        try {
            const { win } = mountFrame();
            win.snapToSide("left");
            flushSync();

            const header = host!.querySelector<HTMLElement>(".window-header");
            header!.dispatchEvent(
                new PointerEvent("pointerdown", {
                    pointerId: 1,
                    clientX: 200,
                    clientY: 50,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointercancel", {
                    pointerId: 1,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            flushSync();

            expect(win.isPinned).toBe(false);
            expect(win.x).toBe(6);
            expect(host!.querySelector(".dragging")).toBeNull();
        } finally {
            Object.defineProperty(window, "innerWidth", {
                value: oldWidth,
                configurable: true,
            });
            Object.defineProperty(window, "innerHeight", {
                value: oldHeight,
                configurable: true,
            });
        }
    });

    it("offers a pin toggle while pinned and restores the floating geometry", () => {
        const { win } = mountFrame();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        flushSync();

        const frame = host!.querySelector<HTMLElement>(".window-frame");
        const unpin = host!.querySelector<HTMLButtonElement>(
            `[aria-label="${lookup("windows.aria.unpin")}"]`,
        );
        expect(unpin, "the pinned window rendered no unpin control").not.toBeNull();

        unpin!.click();
        flushSync();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
        // The control stays mounted as the pin action; removing it between
        // the two clicks of a double-click would hand the second click to a
        // neighbour control.
        expect(frame!.style.left).toBe("120px");
        expect(frame!.style.width).toBe("600px");
        const pin = host!.querySelector<HTMLButtonElement>(
            `[aria-label="${lookup("windows.aria.pin")}"]`,
        );
        expect(pin, "the unpinned window lost its pin control").not.toBeNull();

        pin!.click();
        flushSync();
        expect(win.isPinned).toBe(true);

        // The second click of a double-click must not toggle a third time.
        pin!.dispatchEvent(
            new MouseEvent("click", { bubbles: true, detail: 2 }),
        );
        pin!.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, detail: 2 }),
        );
        flushSync();
        expect(win.isPinned).toBe(true);
        expect(win.isMaximized).toBe(false);
    });

    it("does not start a drag when the pin control is pressed", () => {
        const { win } = mountFrame();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        flushSync();

        const pin = host!.querySelector<HTMLButtonElement>(
            `[aria-label="${lookup("windows.aria.unpin")}"]`,
        );
        expect(pin).not.toBeNull();
        const frame = host!.querySelector<HTMLElement>(".window-frame");

        pin!.dispatchEvent(
            new PointerEvent("pointerdown", {
                pointerId: 1,
                clientX: 20,
                clientY: 50,
                bubbles: true,
                cancelable: true,
            }),
        );
        pin!.dispatchEvent(
            new PointerEvent("pointermove", {
                pointerId: 1,
                clientX: 220,
                clientY: 50,
                bubbles: true,
            }),
        );
        flushSync();

        expect(win.isPinned).toBe(true);
        expect(win.x).toBe(0);
        expect(frame!.classList.contains("dragging")).toBe(false);
    });

    it("suppresses the double-click that follows a drag that moved the window", () => {
        const oldWidth = window.innerWidth;
        const oldHeight = window.innerHeight;
        Object.defineProperty(window, "innerWidth", {
            value: 1024,
            configurable: true,
        });
        Object.defineProperty(window, "innerHeight", {
            value: 768,
            configurable: true,
        });

        try {
            const { win } = mountFrame();
            win.snapToSide("left");
            flushSync();

            const header = host!.querySelector<HTMLElement>(".window-header");
            header!.dispatchEvent(
                new PointerEvent("pointerdown", {
                    pointerId: 1,
                    clientX: 200,
                    clientY: 50,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointermove", {
                    pointerId: 1,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointerup", {
                    pointerId: 1,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            flushSync();

            expect(win.isPinned).toBe(false);
            expect(win.x).toBe(6);

            header!.dispatchEvent(
                new PointerEvent("pointerdown", {
                    pointerId: 2,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            header!.dispatchEvent(
                new PointerEvent("pointerup", {
                    pointerId: 2,
                    clientX: 206,
                    clientY: 50,
                    bubbles: true,
                }),
            );
            header!.dispatchEvent(
                new MouseEvent("dblclick", {
                    bubbles: true,
                    cancelable: true,
                }),
            );
            flushSync();

            expect(win.isPinned).toBe(false);
            expect(win.isMaximized).toBe(false);
            expect(win.x).toBe(6);
        } finally {
            Object.defineProperty(window, "innerWidth", {
                value: oldWidth,
                configurable: true,
            });
            Object.defineProperty(window, "innerHeight", {
                value: oldHeight,
                configurable: true,
            });
        }
    });

    it("unpins on double-click in the title area too", () => {
        const { win } = mountFrame();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        flushSync();

        const title = host!.querySelector<HTMLElement>(".header-content");
        title!.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
        );
        flushSync();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.width).toBe(600);
    });

    it("still maximizes an unpinned window on double-click", () => {
        const { win } = mountFrame();
        const header = host!.querySelector<HTMLElement>(".window-header");
        header!.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
        );
        flushSync();

        expect(win.isPinned).toBe(false);
        expect(win.isMaximized).toBe(true);
    });

    it("renders the persisted pin state and unpins from the restored snapshot", () => {
        localStorage.setItem(
            "cachy_win_guide",
            JSON.stringify({
                x: 0,
                y: 0,
                width: 512,
                height: 768,
                isMaximized: false,
                isMinimized: false,
                isPinned: true,
                pinSide: "left",
                pinRestore: { x: 120, y: 90, width: 600, height: 480 },
                opacity: 1,
                fontSize: 14,
                zoomLevel: 1,
                showPriceInTitle: false,
                symbol: "",
            }),
        );

        const { win } = mountFrame();
        expect(win.isPinned).toBe(true);

        const unpin = host!.querySelector<HTMLButtonElement>(
            `[aria-label="${lookup("windows.aria.unpin")}"]`,
        );
        expect(unpin).not.toBeNull();
        unpin!.click();
        flushSync();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.y).toBe(90);
        expect(win.width).toBe(600);
        expect(win.height).toBe(480);
    });

    it("hides the pin control while the window is minimized", () => {
        const { win } = mountFrame();
        win.snapToSide("left");
        win.isMinimized = true;
        flushSync();

        expect(
            host!.querySelector(`[aria-label="${lookup("windows.aria.unpin")}"]`),
        ).toBeNull();
    });

    it("keeps a pinned non-draggable window releasable from the header", () => {
        const { win } = mountFrame();
        win.isDraggable = false;
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        flushSync();

        const header = host!.querySelector<HTMLElement>(".window-header");
        header!.dispatchEvent(
            new PointerEvent("pointerdown", {
                pointerId: 1,
                clientX: 200,
                clientY: 50,
                bubbles: true,
                cancelable: true,
            }),
        );
        header!.dispatchEvent(
            new PointerEvent("pointermove", {
                pointerId: 1,
                clientX: 400,
                clientY: 50,
                bubbles: true,
            }),
        );
        flushSync();
        expect(win.isPinned).toBe(true);

        header!.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
        );
        flushSync();
        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
    });

    it("unpins on double-click while pinned", () => {
        const { win } = mountFrame();
        win.x = 120;
        win.y = 90;
        win.width = 600;
        win.height = 480;
        win.snapToSide("left");
        flushSync();

        const header = host!.querySelector<HTMLElement>(".window-header");
        header!.dispatchEvent(
            new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
        );
        flushSync();

        expect(win.isPinned).toBe(false);
        expect(win.x).toBe(120);
        expect(win.width).toBe(600);
    });
});

describe("FEAT-0545 — the feed control follows the duck master switch", () => {
    it("hides the feed button while the companion is off", () => {
        const previous = settingsState.showDuck;
        try {
            const win = new ProbeWindow();
            win.allowFeedDuck = true;
            settingsState.showDuck = false;
            mountFrame(win);

            const feed = () =>
                host!.querySelector(
                    'button[aria-label="Feed Duck (Profit)"]',
                );

            expect(feed()).toBeNull();

            settingsState.showDuck = true;
            flushSync();
            expect(win.allowFeedDuck).toBe(true);
            expect(settingsState.showDuck).toBe(true);
            expect(feed()).not.toBeNull();
        } finally {
            settingsState.showDuck = previous;
        }
    });
});

describe("FEAT-0737 — the frame is a focus target for the window switcher", () => {
    it("exposes the window id and is programmatically focusable", () => {
        const { content, win } = mountFrame();
        const frame = content().closest<HTMLElement>(".window-frame");

        expect(frame).not.toBeNull();
        expect(frame?.dataset.windowId).toBe(win.id);
        expect(frame?.tabIndex).toBe(-1);
    });
});
