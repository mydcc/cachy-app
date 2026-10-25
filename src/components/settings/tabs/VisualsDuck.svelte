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
    import { resetDuckProgress } from "../../../lib/pets/duckState";
    import { toastService } from "../../../services/toastService.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import Button from "../../shared/Button.svelte";

    function handleReset() {
        if (!confirm($_("settings.visuals.duck.resetConfirm"))) return;
        resetDuckProgress();
        toastService.success($_("settings.visuals.duck.resetDone"));
    }
</script>

<section class="settings-section animate-fade-in">
    <div class="flex flex-col">
        <h3 class="text-sm font-bold text-[var(--text-primary)]">
            {$_("settings.visuals.duck.title")}
        </h3>
        <p class="text-xs text-[var(--text-secondary)] mt-1">
            {$_("settings.visuals.duck.description")}
        </p>
    </div>

    <!-- Master switch: off means frozen, not merely hidden. -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <label class="toggle-card">
            <div class="flex flex-col">
                <span class="text-sm font-medium">
                    {$_("settings.visuals.duck.show")}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                    {$_("settings.visuals.duck.showDesc")}
                </span>
            </div>
            <Toggle
                id="duck-show-toggle"
                bind:checked={settingsState.showDuck}
            />
        </label>
    </div>

    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <label class="toggle-card">
            <div class="flex flex-col">
                <span class="text-sm font-medium">
                    {$_("settings.visuals.duck.notifications")}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                    {$_("settings.visuals.duck.notificationsDesc")}
                </span>
            </div>
            <Toggle
                id="duck-notifications-toggle"
                bind:checked={settingsState.duckNotifications}
                disabled={!settingsState.showDuck}
            />
        </label>
    </div>

    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <label class="toggle-card">
            <div class="flex flex-col">
                <span class="text-sm font-medium">
                    {$_("settings.visuals.duck.reactToTrades")}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                    {$_("settings.visuals.duck.reactToTradesDesc")}
                </span>
            </div>
            <Toggle
                id="duck-trades-toggle"
                bind:checked={settingsState.duckReactToTrades}
                disabled={!settingsState.showDuck}
            />
        </label>
    </div>

    <!-- Scoped reset: only the duck key, unlike the Danger Zone wipe. -->
    <div class="mt-4 pt-4 border-t border-[var(--border-color)]">
        <div
            class="p-4 border border-[var(--border-color)] bg-[var(--bg-secondary)] rounded-lg flex items-center justify-between gap-4"
        >
            <div>
                <div class="font-bold text-sm">
                    {$_("settings.visuals.duck.reset")}
                </div>
                <div class="text-[10px] text-[var(--text-secondary)] mt-1">
                    {$_("settings.visuals.duck.resetDesc")}
                </div>
            </div>
            <Button
                id="duck-reset-button"
                variant="danger"
                size="sm"
                onClick={handleReset}
            >
                {$_("settings.visuals.duck.reset")}
            </Button>
        </div>
    </div>
</section>
