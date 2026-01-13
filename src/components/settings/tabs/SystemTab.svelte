<script lang="ts">
    import { _ } from "../../../locales/i18n";

    export let isPro: boolean;
    export let onBackup: () => void;
    export let onRestore: (e: Event) => void;
    export let onReset: () => void;
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-system">
    <div
        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
    >
        <h4 class="text-sm font-bold">CachyLog Debug</h4>
        <p class="text-xs text-[var(--text-secondary)] mb-2">
            Trigger a test log on the server to verify browser console logging
            (CL: prefix).
        </p>
        <button
            class="btn btn-secondary text-sm w-full"
            on:click={() => fetch("/api/test-log", { method: "POST" })}
        >
            Trigger Server Log
        </button>
    </div>
    <div
        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
    >
        <h4 class="text-sm font-bold">
            {$_("settings.backup")}
        </h4>
        <p class="text-xs text-[var(--text-secondary)] mb-2">
            Save all your settings, presets, and journal entries to a file.
        </p>
        <button
            class="btn btn-secondary text-sm w-full"
            on:click={onBackup}
            disabled={!isPro}
        >
            {$_("app.backupButtonAriaLabel")}
            {!isPro ? "(Pro only)" : ""}
        </button>
    </div>
    <div
        class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
    >
        <h4 class="text-sm font-bold">
            {$_("settings.restore")}
        </h4>
        <p class="text-xs text-[var(--text-secondary)] mb-2">
            Overwrite current data with a backup file.
        </p>
        <label
            class="btn btn-secondary text-sm w-full cursor-pointer text-center"
        >
            {$_("app.restoreButtonAriaLabel")}
            <input
                id="restore-file"
                name="restoreFile"
                type="file"
                accept=".json"
                class="hidden"
                on:change={onRestore}
            />
        </label>
    </div>
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <button
            class="text-xs text-[var(--danger-color)] hover:underline"
            on:click={onReset}
        >
            {$_("settings.reset")}
        </button>
    </div>
</div>
