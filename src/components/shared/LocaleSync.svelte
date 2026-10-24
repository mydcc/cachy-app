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
  BUG-0708 — the effective locale depends on two inputs: the chosen UI locale
  and the "technical terms in English" flag. `i18n.ts` only re-evaluated it
  when the locale store changed, so flipping the flag left the screen on the
  old dictionary until the next startup. Track the flag here, where a rune
  effect is available, and re-run the same mapping the locale subscription
  uses. The sequence token inside `updateEffectiveLocale` keeps rapid toggles
  race-safe.
-->
<script lang="ts">
  import { settingsState } from "../../stores/settings.svelte";
  import { updateEffectiveLocale } from "../../locales/i18n";

  $effect(() => {
    // Read the flag so this effect subscribes to it; the function also reads
    // it synchronously, but the explicit read documents the dependency.
    settingsState.forceEnglishTechnicalTerms;
    void updateEffectiveLocale();
  });
</script>
