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
  A themeable replacement for a native `<select>`: the opened popup of a
  native select is drawn by the OS/browser, so its hover highlight can never
  follow the theme. This renders a button trigger plus a listbox popup in
  theme variables only. Focus stays on the trigger; the open option is
  exposed via aria-activedescendant.
-->

<script lang="ts">
    export interface SelectDropdownOption {
        value: string;
        label: string;
    }

    interface Props {
        /** Applied to the trigger button (query surface, label association). */
        id: string;
        /** Accessible name of the control. */
        label: string;
        /** Currently selected value. */
        value: string;
        options: readonly SelectDropdownOption[];
        onSelect: (value: string) => void;
    }

    let { id, label, value, options, onSelect }: Props = $props();

    let open = $state(false);
    let activeIndex = $state(-1);
    let trigger: HTMLButtonElement | undefined = $state();
    let wrapper: HTMLDivElement | undefined = $state();

    let selectedLabel = $derived(
        options.find((option) => option.value === value)?.label ?? value,
    );
    let activeId = $derived(
        open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined,
    );

    function openPopup(): void {
        open = true;
        const selected = options.findIndex((option) => option.value === value);
        activeIndex = selected >= 0 ? selected : 0;
    }

    function closePopup(refocus = false): void {
        open = false;
        activeIndex = -1;
        if (refocus) trigger?.focus();
    }

    function choose(optionValue: string): void {
        onSelect(optionValue);
        closePopup();
    }

    function moveActive(delta: number): void {
        if (options.length === 0) return;
        if (!open) {
            openPopup();
            return;
        }
        activeIndex = (activeIndex + delta + options.length) % options.length;
        document
            .getElementById(`${id}-opt-${activeIndex}`)
            ?.scrollIntoView({ block: "nearest" });
    }

    function handleTriggerKeydown(event: KeyboardEvent): void {
        switch (event.key) {
            case "ArrowDown":
            case "ArrowUp":
                event.preventDefault();
                moveActive(event.key === "ArrowDown" ? 1 : -1);
                break;
            case "Enter":
            case " ":
                event.preventDefault();
                if (open && activeIndex >= 0 && options[activeIndex]) {
                    choose(options[activeIndex].value);
                } else {
                    openPopup();
                }
                break;
            case "Escape":
                if (open) {
                    event.preventDefault();
                    closePopup(true);
                }
                break;
            case "Home":
                if (open) {
                    event.preventDefault();
                    activeIndex = 0;
                }
                break;
            case "End":
                if (open) {
                    event.preventDefault();
                    activeIndex = options.length - 1;
                }
                break;
        }
    }

    function handleClickOutside(event: MouseEvent): void {
        if (open && wrapper && !wrapper.contains(event.target as Node)) {
            closePopup();
        }
    }

    function handleFocusOut(event: FocusEvent): void {
        if (open && wrapper && !wrapper.contains(event.relatedTarget as Node | null)) {
            closePopup();
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<div bind:this={wrapper} class="relative w-full" onfocusout={handleFocusOut}>
    <button
        type="button"
        bind:this={trigger}
        {id}
        aria-label={label}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="{id}-list"
        aria-activedescendant={activeId}
        class="input-field w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-tertiary)] border border-[var(--input-border-color)] outline-none text-[var(--text-primary)] cursor-pointer hover:bg-[var(--bg-secondary)] transition-all flex items-center justify-between gap-2"
        onclick={() => (open ? closePopup() : openPopup())}
        onkeydown={handleTriggerKeydown}
    >
        <span class="truncate">{selectedLabel}</span>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            class="w-3 h-3 flex-shrink-0 text-[var(--text-secondary)] transition-transform {open
                ? 'rotate-180'
                : ''}"
        >
            <path
                fill-rule="evenodd"
                d="M8 11.5a.75.75 0 0 1-.53-.22l-4-4a.75.75 0 0 1 1.06-1.06L8 9.69l3.47-3.47a.75.75 0 0 1 1.06 1.06l-4 4a.75.75 0 0 1-.53.22z"
                clip-rule="evenodd"
            />
        </svg>
    </button>

    {#if open}
        <ul
            id="{id}-list"
            role="listbox"
            aria-label={label}
            class="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto custom-scrollbar bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md p-1 shadow-xl"
        >
            {#each options as option, index (option.value)}
                <!-- Keyboard lives on the trigger (focus never enters the
                     list, like a native select): these mouse-only handlers
                     intentionally have no key counterpart. -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <li
                    id="{id}-opt-{index}"
                    role="option"
                    aria-selected={option.value === value}
                    data-value={option.value}
                    class="px-3 py-2 rounded-md text-xs cursor-pointer transition-colors {option.value ===
                    value
                        ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] font-medium'
                        : index === activeIndex
                          ? 'bg-[var(--nav-hover-bg)] text-[var(--accent-color)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--accent-color)]'}"
                    onmouseenter={() => (activeIndex = index)}
                    onclick={() => choose(option.value)}
                >
                    {option.label}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
</style>
