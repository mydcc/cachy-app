<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  ModalFrame (FEAT-0044) -- adapter that opens a ModalFrameWindow on the
  shared WindowManager/WindowFrame stack instead of rendering its own
  standalone overlay. Renders no markup of its own: WindowContainer renders
  the actual WindowFrame elsewhere in the DOM tree, and Svelte Snippets can
  be invoked from there regardless of where they were declared, so
  `children`/`headerExtra` still work exactly as callers already use them.

  Both current callers (MarketDashboardModal, TpSlEditModal -- Academy moved
  to its own AcademyWindow in FEAT-0045) mount this component only while
  their own `{#if}` guard is true and always pass `isOpen={true}` -- so
  mounting is effectively the open action and unmounting is the close
  action, both handled by the same $effect below. `isOpen` is still honored
  as a reactive prop for robustness.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import type { Snippet } from "svelte";
    import { windowManager } from "../../lib/windows/WindowManager.svelte";
    import { ModalFrameWindow } from "../../lib/windows/implementations/ModalFrameWindow.svelte";
    import { settingsState } from "../../stores/settings.svelte";

    interface Props {
        isOpen?: boolean;
        title?: string;
        extraClasses?: string;
        alignment?: "center" | "top";
        /** Dim the UI behind the window (default true). */
        showBackdrop?: boolean;
        /** Initial window size in px (defaults: WindowBase 640x480). The
         *  value is read once at window creation, like alignment/extraClasses. */
        width?: number;
        height?: number;
        onclose?: () => void;
        children?: Snippet;
        headerExtra?: Snippet;
        bodyClass?: string;
    }

    let {
        isOpen = false,
        title = "",
        extraClasses = "",
        alignment = "center",
        showBackdrop = true,
        width = undefined,
        height = undefined,
        onclose,
        children,
        headerExtra,
        bodyClass = "",
    }: Props = $props();

    let instance: ModalFrameWindow | null = $state(null);

    // Creates/destroys the backing window in step with `isOpen`. Everything
    // besides `title` is only read once at creation time (untracked) --
    // none of the real callers change extraClasses/alignment/bodyClass
    // after opening, so reacting to them would be unobserved complexity.
    // untrack() around instance/windowManager.open() below is deliberate,
    // not just style: windowManager.open() -> bringToFront() reads the
    // shared windowManager._windows $state array internally, and without
    // untrack that read gets recorded as a dependency of *this* effect.
    // Every subsequent window-list mutation anywhere in the app (including
    // this window's own registration write moments earlier) then
    // reschedules this effect, which tears down and recreates the window
    // it just created -- an immediate open/close loop that only showed up
    // as "the window never appears" a few renders later once Playwright
    // observed it (FEAT-0044 regression, caught before merge).
    $effect(() => {
        if (!isOpen) return;

        const win = untrack(() => {
            const w = new ModalFrameWindow({
                title,
                alignment,
                showBackdrop,
                width,
                height,
                extraClasses,
                bodyClass,
                children,
                headerExtra,
                onclose,
            });
            instance = w;
            windowManager.open(w);
            return w;
        });

        return () => {
            windowManager.close(win.id);
            instance = null;
        };
    });

    // Title is the one caller-visible value that legitimately changes while
    // open: MarketDashboardModal's and TpSlEditModal's titles come from
    // `$_(...)` and change with the active locale.
    $effect(() => {
        if (instance) {
            instance.title = title;
        }
    });

    // `burnModals` was the only reachable branch of the old title-matching
    // burn config -- journal/settings/guide all route through their own
    // window types now and never render through ModalFrame (see BUG-0051).
    // Kept in sync for the lifetime of the window since it's a global
    // setting the user can toggle while a modal is open.
    $effect(() => {
        if (instance) {
            instance.enableBurningBorders = settingsState.burnModals;
        }
    });
</script>
