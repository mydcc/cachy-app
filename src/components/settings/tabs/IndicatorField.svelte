<script lang="ts">
    import { settingsState } from "../../../stores/settings.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";

    interface Props {
        label: string;
        id: string;
        value: any;
        type?: string;
        min?: number;
        max?: number;
        step?: number;
        alwaysEnabled?: boolean;
    }

    let {
        label,
        id,
        value = $bindable(),
        type = "number",
        min,
        max,
        step,
        alwaysEnabled = false,
    }: Props = $props();
</script>

<div class="flex flex-col gap-1 flex-1">
    <label for={id} class="text-xs text-[var(--text-secondary)]">
        {label}
    </label>
    <input
        {id}
        {type}
        bind:value
        {min}
        {max}
        {step}
        class="input-field rounded settings-number-input text-xs w-full"
        use:enhancedInput={{ min, max }}
    />
</div>
