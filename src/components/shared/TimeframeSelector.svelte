<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { normalizeTimeframeInput } from "../../utils/utils";
    import { fade, scale } from "svelte/transition";
    import { quintOut } from "svelte/easing";

    export let selected: string[] = [];
    export let options: string[] = [];
    export let placeholder = "Add timeframe...";
    export let maxItems = 4;

    const dispatch = createEventDispatcher();
    let inputValue = "";
    let inputElement: HTMLInputElement;
    let showDropdown = false;
    let filteredOptions: string[] = [];

    $: filteredOptions = options.filter(
        (opt) =>
            !selected.includes(opt) &&
            opt.toLowerCase().includes(inputValue.toLowerCase())
    );

    function addTimeframe(val: string) {
        const normalized = normalizeTimeframeInput(val);
        if (!normalized) return;

        if (selected.includes(normalized)) {
            inputValue = "";
            return;
        }

        if (selected.length >= maxItems) {
            // Optional: Shake animation or alert?
            // For now just don't add
            return;
        }

        selected = [...selected, normalized];
        inputValue = "";
        dispatch("change", selected);
    }

    function removeTimeframe(index: number) {
        selected = selected.filter((_, i) => i !== index);
        dispatch("change", selected);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            if (inputValue) {
                addTimeframe(inputValue);
            } else if (filteredOptions.length > 0) {
                // If input is empty but dropdown is open (unlikely with filter logic, but maybe if options match empty string?)
                // actually if input is empty, filter shows all.
                // If user hits enter with empty input, maybe don't add first option?
                // Let's only add if they typed something OR selected explicitly.
            }
        } else if (
            e.key === "Backspace" &&
            inputValue === "" &&
            selected.length > 0
        ) {
            removeTimeframe(selected.length - 1);
        }
    }

    function handleOptionClick(opt: string) {
        addTimeframe(opt);
        inputElement.focus();
    }

    function handleInputFocus() {
        showDropdown = true;
    }

    function handleInputBlur() {
        // Small delay to allow click on dropdown items
        setTimeout(() => {
            showDropdown = false;
        }, 200);
    }
</script>

<div class="flex flex-col relative">
    <div
        class="flex flex-wrap gap-2 p-2 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] min-h-[42px] focus-within:ring-1 focus-within:ring-[var(--accent-color)] items-center"
    >
        {#each selected as tf, i (tf)}
            <div
                class="flex items-center gap-1 bg-[var(--bg-tertiary)] border border-[var(--border-color)] px-2 py-1 rounded text-xs font-bold text-[var(--accent-color)]"
                in:scale={{ duration: 200, easing: quintOut }}
                out:scale={{ duration: 150, easing: quintOut }}
            >
                <span>{tf}</span>
                <button
                    type="button"
                    class="hover:text-[var(--text-primary)] focus:outline-none ml-1"
                    on:click={() => removeTimeframe(i)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
        {/each}

        {#if selected.length < maxItems}
            <input
                bind:this={inputElement}
                type="text"
                class="flex-1 bg-transparent border-none outline-none text-sm min-w-[60px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                {placeholder}
                bind:value={inputValue}
                on:keydown={handleKeydown}
                on:focus={handleInputFocus}
                on:blur={handleInputBlur}
            />
        {/if}
    </div>

    {#if showDropdown && filteredOptions.length > 0 && selected.length < maxItems}
        <div
            class="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded shadow-lg max-h-40 overflow-y-auto z-50 custom-scrollbar"
            transition:fade={{ duration: 100 }}
        >
            {#each filteredOptions as opt}
                <button
                    class="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    on:click={() => handleOptionClick(opt)}
                >
                    {opt}
                </button>
            {/each}
        </div>
    {/if}

    {#if selected.length >= maxItems}
        <div class="text-[10px] text-[var(--text-tertiary)] mt-1 px-1">
            Max {maxItems} timeframes selected.
        </div>
    {/if}
</div>

<style>
    /* Ensure custom scrollbar matches app theme if global styles don't cover isolated components automatically */
    /* (Assuming standard tailwind classes cover it or global css does) */
</style>
