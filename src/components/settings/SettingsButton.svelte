<script lang="ts">
  import { uiStore } from "../../stores/uiStore";
  import { _ } from "svelte-i18n";
</script>

<button
  class="btn-icon-accent"
  onclick={() => uiStore.toggleSettingsModal(true)}
  aria-label={$_("settings.title")}
  title={$_("settings.title")}
>
  <svg viewBox="0 0 16 16" fill="currentColor" class="w-6 h-6">
    <path
      d="M 6.25,1 6.1,2.84 A 5.5,5.5 0 0 0 4.49,3.77 L 2.81,2.98 1.06,6.02 2.58,7.07 A 5.5,5.5 0 0 0 2.5,8 5.5,5.5 0 0 0 2.58,8.93 L 1.06,9.98 2.81,13.02 4.48,12.23 A 5.5,5.5 0 0 0 6.1,13.15 L 6.25,15 H 9.75 L 9.9,13.16 A 5.5,5.5 0 0 0 11.51,12.23 L 13.19,13.02 14.94,9.98 13.42,8.93 A 5.5,5.5 0 0 0 13.5,8 5.5,5.5 0 0 0 13.42,7.07 L 14.94,6.02 13.19,2.98 11.52,3.77 A 5.5,5.5 0 0 0 9.9,2.85 L 9.75,1 Z M 8,6 A 2,2 0 0 1 10,8 2,2 0 0 1 8,10 2,2 0 0 1 6,8 2,2 0 0 1 8,6 Z"
    />
  </svg>
</button>
