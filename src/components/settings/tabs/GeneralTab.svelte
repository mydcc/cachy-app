<script lang="ts">
  import { _ } from "../../../locales/i18n";

  interface Props {
    currentLanguage: string;
    currentTheme: string;
    feePreference: "maker" | "taker";
    isPro: boolean;
    themes: Array<{ value: string; label: string }>;
  }

  let {
    currentLanguage = $bindable(),
    currentTheme = $bindable(),
    feePreference = $bindable(),
    isPro,
    themes
  }: Props = $props();
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
  </div>
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
