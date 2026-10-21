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
                <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
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
                <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
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
                <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
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
                <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
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

        <!-- Window docking -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.dockingTitle")}
            </h4>
            <label class="toggle-card mb-4 gap-3">
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-sm font-medium">{$_("settings.dockingCentered")}</span>
                    <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.dockingCenteredDesc")}</span>
                </div>
                <Toggle
                    id="docking-centered"
                    bind:checked={settingsState.enableDockingCentered}
                />
            </label>
            <div class="field-group">
                <label for="docking-position">{$_("settings.dockingPosition")}</label>
                <select id="docking-position" bind:value={settingsState.dockingPosition} class="input-field w-full">
                    <option value="top">{$_("settings.dockingTop")}</option>
                    <option value="bottom">{$_("settings.dockingBottom")}</option>
                </select>
                <p class="text-[10px] text-[var(--text-secondary)]">{$_("settings.dockingPositionDesc")}</p>
            </div>
        </div>
    </SettingsGrid>
</section>

<style>
    /* Svelte scoped styles do not cross component boundaries: this shape is
       restated here (same values as the other settings tabs) instead of
       relying on the former VisualsTab shell. */
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        cursor: pointer;
    }
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
    }
</style>
