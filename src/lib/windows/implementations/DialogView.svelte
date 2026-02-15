<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { _ } from "../../../locales/i18n";
    import { windowManager } from "../WindowManager.svelte";
    import type { DialogWindow } from "./DialogWindow.svelte";
    import { sanitizeHtml } from "$lib/utils/sanitizer";
    import { trackClick } from "../../../lib/actions";

    interface Props {
        window: DialogWindow;
    }

    let { window: win }: Props = $props();

    let inputValue = $state(untrack(() => win.defaultValue || ""));
    let inputElement = $state<HTMLInputElement | null>(null);

    // Setze Fokus programmatisch (A11y-konform)
    $effect(() => {
        inputElement?.focus();
    });

    function handleConfirm(result: boolean | string) {
        win.closeWith(result);
        windowManager.close(win.id);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            if (win.type === "prompt") {
                handleConfirm(inputValue);
            } else {
                handleConfirm(true);
            }
        }
        if (e.key === "Escape") {
            handleConfirm(false);
        }
    }
</script>

<div
    class="dialog-content p-6 flex flex-col h-full"
    onkeydown={handleKeydown}
    role="presentation"
>
    <div class="message prose dark:prose-invert mb-6 text-base leading-relaxed">
        {@html sanitizeHtml(win.message)}
    </div>

    {#if win.type === "prompt"}
        <div class="mb-6">
            <input
                type="text"
                class="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] focus:border-[var(--accent-color)] outline-none transition-colors"
                placeholder={$_("dashboard.customModal.promptPlaceholder")}
                bind:value={inputValue}
                bind:this={inputElement}
            />
        </div>
    {/if}

    <div class="mt-auto flex justify-end gap-3">
        {#if win.type === "confirm"}
            <button
                class="px-5 py-2.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] font-semibold transition-colors"
                onclick={() => handleConfirm(false)}
                use:trackClick={{
                    category: "Dialog",
                    action: "Click",
                    name: "Cancel",
                }}
            >
                {$_("dashboard.customModal.noButton")}
            </button>
            <button
                class="px-5 py-2.5 rounded-lg bg-[var(--btn-danger-bg)] hover:bg-[var(--btn-danger-hover-bg)] text-[var(--btn-danger-text)] font-semibold shadow-lg shadow-red-900/20 transition-all hover:scale-105"
                onclick={() => handleConfirm(true)}
                use:trackClick={{
                    category: "Dialog",
                    action: "Click",
                    name: "Confirm",
                }}
            >
                {$_("dashboard.customModal.yesButton")}
            </button>
        {:else if win.type === "prompt"}
            <button
                class="px-5 py-2.5 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] border border-[var(--border-color)] font-semibold transition-colors"
                onclick={() => handleConfirm(false)}
            >
                {$_("common.cancel")}
            </button>
            <button
                class="px-5 py-2.5 rounded-lg bg-[var(--accent-color)] hover:opacity-90 text-[var(--btn-accent-text)] font-semibold shadow-lg shadow-[var(--accent-color)]/20 transition-all hover:scale-105"
                onclick={() => handleConfirm(inputValue)}
            >
                {$_("dashboard.customModal.okButton")}
            </button>
        {:else}
            <!-- Alert -->
            <button
                class="px-6 py-2.5 rounded-lg bg-[var(--accent-color)] hover:opacity-90 text-[var(--btn-accent-text)] font-semibold shadow-lg shadow-[var(--accent-color)]/20 transition-all hover:scale-105 w-full sm:w-auto"
                onclick={() => handleConfirm(true)}
                use:trackClick={{
                    category: "Dialog",
                    action: "Click",
                    name: "OK",
                }}
            >
                {$_("dashboard.customModal.okButton")}
            </button>
        {/if}
    </div>
</div>
