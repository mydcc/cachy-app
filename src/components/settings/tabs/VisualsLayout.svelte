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

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";
</script>

<section class="settings-section animate-fade-in">
    <SettingsGrid gap="gap-4">
        <!-- News Open Behavior -->
        <div class="toggle-card flex-col items-start gap-2 col-span-full">
            <div class="flex justify-between items-center w-full">
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-sm font-medium">{$_("settings.newsOpenBehavior")}</span>
                    <span class="text-xs text-[var(--text-secondary)]">{$_("settings.newsOpenBehaviorDesc")}</span>
                </div>
            </div>
            <SettingsGrid gap="gap-2">
                <button
                    type="button"
                    class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                    class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "smart"}
                    class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "smart"}
                    class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "smart"}
                    class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "smart"}
                    onclick={() => settingsState.newsOpenBehavior = "smart"}
                >
                    <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorSmart")}</span>
                    {#if settingsState.newsOpenBehavior === "smart"}
                        <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                    {/if}
                </button>
                <button
                    type="button"
                    class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                    class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "reader"}
                    class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "reader"}
                    class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "reader"}
                    class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "reader"}
                    onclick={() => settingsState.newsOpenBehavior = "reader"}
                >
                    <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorReader")}</span>
                    {#if settingsState.newsOpenBehavior === "reader"}
                        <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                    {/if}
                </button>
                <button
                    type="button"
                    class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                    class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "new_tab"}
                    class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "new_tab"}
                    class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "new_tab"}
                    class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "new_tab"}
                    onclick={() => settingsState.newsOpenBehavior = "new_tab"}
                >
                    <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorNewTab")}</span>
                    {#if settingsState.newsOpenBehavior === "new_tab"}
                        <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                    {/if}
                </button>
                <button
                    type="button"
                    class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                    class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "window"}
                    class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "window"}
                    class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "window"}
                    class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "window"}
                    onclick={() => settingsState.newsOpenBehavior = "window"}
                >
                    <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorWindow")}</span>
                    {#if settingsState.newsOpenBehavior === "window"}
                        <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                    {/if}
                </button>
            </SettingsGrid>
        </div>

        <label class="toggle-card gap-3">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium"
                    >{$_("settings.showSidebars")}</span
                >
                <span
                    class="text-[10px] text-[var(--text-secondary)]"
                    >{$_("settings.sidePanelDesc")}</span
                >
            </div>
            <Toggle bind:checked={settingsState.showSidebars} />
        </label>

        <label class="toggle-card gap-3">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium"
                    >{$_("settings.enableSidePanel")}</span
                >
                <span
                    class="text-[10px] text-[var(--text-secondary)]"
                    >{$_("settings.workspace.aiAssistant")} / {$_(
                        "settings.workspace.privateNotes",
                    )} / {$_("settings.workspace.marketChat")}</span
                >
            </div>
            <Toggle
                checked={uiState.showAssistant}
                onchange={(e) =>
                    uiState.toggleAssistant((e.currentTarget as HTMLInputElement).checked)}
            />
        </label>
    </SettingsGrid>
</section>
