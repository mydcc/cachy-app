<script lang="ts">
  import { icons } from "../../lib/constants";

  interface Props {
    activePreset: string;
    presets?: { id: string; label: string; icon?: string }[];
    onselect?: (id: string) => void;
  }

  let {
    activePreset,
    presets = [
      { id: "performance", label: "Performance", icon: icons.chart },
      { id: "quality", label: "Qualität", icon: icons.check },
      { id: "direction", label: "Richtung", icon: icons.exchange },
      { id: "discipline", label: "Disziplin", icon: icons.lockClosed },
      { id: "costs", label: "Kosten", icon: icons.settings },
    ],
    onselect,
  }: Props = $props();
</script>

<div
  class="flex flex-wrap gap-2 mb-4 border-b border-[var(--border-color)] pb-2"
>
  {#each presets as preset}
    <button
      class="flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors
            {activePreset === preset.id
        ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border-b-2 border-[var(--accent-color)] font-bold'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'}"
      onclick={() => onselect?.(preset.id)}
    >
      {#if preset.icon}
        {@html preset.icon}
      {/if}
      <span>{preset.label}</span>
    </button>
  {/each}
</div>
