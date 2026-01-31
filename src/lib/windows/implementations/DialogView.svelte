<script lang="ts">
    import { untrack } from "svelte";
    import { _ } from "../../../locales/i18n";
    import { windowManager } from "../WindowManager.svelte";
    import type { DialogWindow } from "./DialogWindow.svelte";
    import { sanitizeHtml } from "../../../utils/sanitizer";
    import { trackClick } from "../../../lib/actions";

    interface Props {
        window: DialogWindow;
    }

    let { window: win }: Props = $props();

    let inputValue = $state(untrack(() => win.defaultValue) || "");

    function handleConfirm(result: boolean | string) {
        win.closeWith(result);
        windowManager.close(win.id);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
             if (win.type === 'prompt') {
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

<div class="dialog-content p-6 flex flex-col h-full" onkeydown={handleKeydown} role="presentation">
    <div class="message prose dark:prose-invert mb-6 text-base leading-relaxed">
        {@html sanitizeHtml(win.message)}
    </div>

    {#if win.type === "prompt"}
        <div class="mb-6">
            <!-- svelte-ignore a11y_autofocus -->
            <input
                type="text"
                class="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] focus:border-[var(--accent-color)] outline-none transition-colors"
                placeholder={$_("dashboard.customModal.promptPlaceholder")}
                bind:value={inputValue}
                autofocus
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
