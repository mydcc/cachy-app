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

  interface Props {
    currentLanguage: string;
    currentTheme: string;
    feePreference: "maker" | "taker";
    forceEnglishTechnicalTerms: boolean;
    isPro: boolean;
    themes: Array<{ value: string; label: string }>;
    fontFamily: string;
  }

  let {
    currentLanguage = $bindable(),
    currentTheme = $bindable(),
    feePreference = $bindable(),
    forceEnglishTechnicalTerms = $bindable(),
    isPro,
    themes,
    fontFamily = $bindable(),
  }: Props = $props();

  const fonts = [
    { value: "Inter", label: "Inter" },
    { value: "IBM Plex Sans", label: "IBM Plex Sans" },
    { value: "JetBrains Mono", label: "JetBrains Mono" },
    { value: "Roboto Mono", label: "Roboto Mono" },
    { value: "Source Sans 3", label: "Source Sans 3" },
  ];
</script>

<div
  class="flex flex-col gap-4"
  role="tabpanel"
  id="tab-general"
  aria-labelledby="tab-general-label"
>
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <label
        for="settings-language"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >{$_("settings.language")}</label
      >
      <select
        id="settings-language"
        name="language"
        bind:value={currentLanguage}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label
        for="settings-theme"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >{$_("settings.theme")}</label
      >
      <select
        id="settings-theme"
        name="theme"
        bind:value={currentTheme}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        {#each themes as theme, index}
          <option value={theme.value} disabled={!isPro && index >= 5}
            >{theme.label}
            {!isPro && index >= 5 ? "(Pro)" : ""}</option
          >
        {/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label
        for="settings-font"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >Schriftart</label
      >
      <select
        id="settings-font"
        name="fontFamily"
        bind:value={fontFamily}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        {#each fonts as font}
          <option value={font.value}>{font.label}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if currentLanguage === "de"}
    <label class="flex items-center gap-2 cursor-pointer mt-1">
      <input
        type="checkbox"
        bind:checked={forceEnglishTechnicalTerms}
        class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded border-[var(--border-color)] bg-[var(--bg-secondary)]"
      />
      <span class="text-sm text-[var(--text-primary)]"
        >Fachbegriffe auf Englisch (Entry, TP, etc.)</span
      >
    </label>
  {/if}

  <div class="flex flex-col gap-1 mt-2">
    <span class="text-sm font-medium">{$_("settings.feePreference")}</span>
    <div class="flex gap-2">
      <label
        class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
      >
        <input
          id="fee-maker"
          name="feePreference"
          type="radio"
          bind:group={feePreference}
          value="maker"
          class="accent-[var(--accent-color)]"
        />
        <span class="text-sm">Maker</span>
      </label>
      <label
        class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
      >
        <input
          id="fee-taker"
          name="feePreference"
          type="radio"
          bind:group={feePreference}
          value="taker"
          class="accent-[var(--accent-color)]"
        />
        <span class="text-sm">Taker</span>
      </label>
    </div>
    <p class="text-xs text-[var(--text-secondary)]">
      {$_("settings.feePreferenceDesc")}
    </p>
  </div>
</div>
