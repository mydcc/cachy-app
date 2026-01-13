<script lang="ts">
    import HotkeySettings from "../HotkeySettings.svelte";
    import type { HotkeyMode } from "../../../stores/settingsStore";

    export let hotkeyMode: HotkeyMode;
</script>

<div class="flex flex-col h-full" role="tabpanel" id="tab-hotkeys">
    {#if hotkeyMode !== "custom"}
        <div
            class="flex flex-col items-center justify-center h-full p-6 text-center text-[var(--text-secondary)]"
        >
            <p class="mb-4">You are currently using a preset Hotkey Mode.</p>
            <button
                class="px-4 py-2 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded font-bold text-sm"
                on:click={() => (hotkeyMode = "custom")}
            >
                Switch to Custom Mode to Edit
            </button>
        </div>
    {:else}
        <HotkeySettings />
    {/if}
</div>
