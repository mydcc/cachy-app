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
<!--
  FEAT-0608: no SettingsGrid. The rows in this tab are full-width fields and
  lists; a column grid would only add empty tracks.
-->

<!--
  FEAT-0396 → FEAT-0749 — the Automation tab, narrowed to the account bots
  trade into and the bounds they trade under.

  The bots themselves moved to the alert control center, where the rules that
  produce them already live: a bot is a promoted alert, and seeing the alert
  and the bot in two different surfaces is what made FEAT-0749 necessary. What
  stays here is what a bot *inherits* — the paper account and the risk limits —
  because those are settings of the account, not of any single rule.

  This tab therefore links to the control center instead of copying the list.
-->

<script lang="ts">
    import Button from "../../shared/Button.svelte";
    import { _ } from "../../../locales/i18n";
    import { ENTRY_POINTS } from "../../../lib/navigation/entry-points";
    import { openEntry } from "../../../lib/navigation/open-entry";
    import PaperTradingSettings from "../PaperTradingSettings.svelte";
    import RiskLimitsSettings from "../RiskLimitsSettings.svelte";

    /**
     * Opens the desk through the registry entry rather than by constructing the
     * window here: one opener, so the rail badge is cleared and the singleton
     * rule holds no matter which surface asked for it.
     */
    function openControlCenter() {
        const entry = ENTRY_POINTS.find((candidate) => candidate.id === "alerts");
        // Same contract as `openEntry`: a missing registration is a wiring bug,
        // not a reason to leave the button quietly doing nothing.
        if (!entry) throw new Error("the alerts entry is missing from the registry");
        openEntry(entry);
    }
</script>

<div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.title")}
        </h2>
        <p class="text-sm text-[var(--text-secondary)] max-w-2xl">
            {$_("settings.automation.botsMoved")}
        </p>
        <div>
            <Button variant="ghost" size="sm" onClick={openControlCenter}>
                {$_("settings.automation.openBots")}
            </Button>
        </div>
    </header>

    <!-- The account these bots trade into, and the bounds it trades under.
         Reused rather than mirrored: a second copy of either would be a second
         place a trader could set a limit that the first one does not know
         about. -->
    <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.account")}
        </h3>
        <PaperTradingSettings />
        <RiskLimitsSettings />
    </section>
</div>
