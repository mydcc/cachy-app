<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { modalState } from "../../stores/modal.svelte";
    import { _ } from "../../locales/i18n";
    import { trackCustomEvent } from "../../services/trackingService";

    const CHEAT_CODE = "VIPTÜMPEL";

    async function handleToggle(event: MouseEvent) {
        event.preventDefault();
        const target = event.target as HTMLInputElement;

        // If currently PRO (checked), we are turning it OFF
        if (settingsState.isPro) {
            settingsState.isPro = false;
            trackCustomEvent("ProStatus", "Toggle", "Deactivated");
            return;
        }

        // If currently NOT PRO, we are trying to turn it ON
        const input = await modalState.show(
            $_("app.proRequiredTitle") || "Pro Status Locked",
            $_("app.enterCheatCode") || "Please enter the activation code:",
            "prompt",
        );

        if (input === CHEAT_CODE) {
            settingsState.isPro = true;
            trackCustomEvent("ProStatus", "Toggle", "Activated");
            uiState.showFeedback("save"); // Assuming this exists or generic feedback
        } else if (input) {
            modalState.show(
                $_("app.error") || "Error",
                $_("app.invalidCode") || "Invalid activation code.",
                "alert",
            );
        }
    }

    // Helper to access uiState for feedback if possible, or we just rely on the toggle visual
    import { uiState } from "../../stores/ui.svelte";
</script>

<div class="pro-toggle-container">
    <label class="switch">
        <input
            type="checkbox"
            checked={settingsState.isPro}
            onclick={handleToggle}
        />
        <span class="slider"></span>
    </label>
    <span class="label-text">{settingsState.isPro ? "PRO" : "FREE"}</span>
</div>

<style>
    .pro-toggle-container {
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: var(--font-family, sans-serif);
    }

    .label-text {
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--text-primary);
        min-width: 40px;
    }

    /* The switch - the box around the slider */
    .switch {
        font-size: 17px;
        position: relative;
        display: inline-block;
        width: 3.5em;
        height: 2em;
    }

    /* Hide default HTML checkbox */
    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    /* The slider */
    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--input-bg, #2c3e50);
        border: 1px solid var(--border-color, #4a5568);
        transition: 0.4s;
        border-radius: 30px;
        box-shadow: inset 2px 5px 10px rgba(0, 0, 0, 0.3);
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 1.4em;
        width: 1.4em;
        left: 0.3em;
        bottom: 0.25em;
        background-color: var(--text-secondary, #a0aec0);
        transition: 0.4s;
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }

    input:checked + .slider {
        background-color: var(--btn-accent-bg, #17c964);
        border-color: var(--btn-accent-bg, #17c964);
    }

    input:checked + .slider:before {
        transform: translateX(1.5em);
        background-color: #fff;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
    }

    /* Hover effects */
    .slider:hover {
        border-color: var(--text-secondary);
    }

    input:checked + .slider:hover {
        box-shadow: 0 0 15px var(--btn-accent-bg, #17c964);
    }
</style>
