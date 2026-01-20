<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { uiState } from "../../stores/ui.svelte";
    import { trackCustomEvent } from "../../services/trackingService";
    import { onMount } from "svelte";

    const CHEAT_CODE = "VIPTÜMPEL";
    let typedBuffer = $state("");
    let isUnlocked = $state(false);

    onMount(() => {
        // If already Pro, it stays unlocked for this session
        if (settingsState.isPro) {
            isUnlocked = true;
        }

        const handleGlobalKeydown = (e: KeyboardEvent) => {
            // Basic safeguard for focus on inputs
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            ) {
                // If it's a text input, we might not want to capture cheatcodes
                // OR we do. User said "egal wo oder wann".
            }

            if (e.key.length !== 1) return;

            typedBuffer += e.key.toUpperCase();
            if (typedBuffer.length > 20) {
                typedBuffer = typedBuffer.slice(-20);
            }

            if (typedBuffer.endsWith(CHEAT_CODE)) {
                isUnlocked = true;
                trackCustomEvent("Security", "CheatCode", "Unlocked");
            }
        };

        window.addEventListener("keydown", handleGlobalKeydown);
        return () => window.removeEventListener("keydown", handleGlobalKeydown);
    });

    function handleToggle(event: Event) {
        if (!isUnlocked) {
            event.preventDefault();
            return;
        }

        // settingsState.isPro is updated here
        const input = event.target as HTMLInputElement;
        settingsState.isPro = input.checked;
        trackCustomEvent(
            "ProStatus",
            "Toggle",
            settingsState.isPro ? "Activated" : "Deactivated",
        );

        if (settingsState.isPro) {
            uiState.showFeedback("save");
        }
    }
</script>

<div class="checkbox-wrapper-25">
    <input
        type="checkbox"
        checked={settingsState.isPro}
        onchange={handleToggle}
        disabled={!isUnlocked}
    />
</div>

<style>
    .checkbox-wrapper-25 {
        display: inline-flex;
        align-items: center;
    }

    .checkbox-wrapper-25 input[type="checkbox"] {
        background-image:
            -webkit-linear-gradient(
                hsla(0, 0%, 0%, 0.1),
                hsla(0, 0%, 100%, 0.1)
            ),
            -webkit-linear-gradient(
                    left,
                    var(--danger-color, #f66) 50%,
                    var(--btn-accent-bg, #6cf) 50%
                );
        background-image:
            linear-gradient(hsla(0, 0%, 0%, 0.1), hsla(0, 0%, 100%, 0.1)),
            linear-gradient(
                to right,
                var(--danger-color, #f66) 50%,
                var(--btn-accent-bg, #6cf) 50%
            );
        background-size:
            100% 100%,
            200% 100%;
        background-position:
            0 0,
            15px 0;
        border-radius: 25px;
        box-shadow:
            inset 0 1px 4px hsla(0, 0%, 0%, 0.5),
            inset 0 0 10px hsla(0, 0%, 0%, 0.5),
            0 0 0 1px hsla(0, 0%, 0%, 0.1),
            0 -1px 2px 2px hsla(0, 0%, 0%, 0.25),
            0 2px 2px 2px hsla(0, 0%, 100%, 0.15); /* Subtle bottom glow */
        cursor: pointer;
        height: 25px;
        padding-right: 25px;
        width: 75px;
        -webkit-appearance: none;
        appearance: none;
        -webkit-transition: 0.25s;
        transition: 0.25s;
        border: none;
        outline: none;
        position: relative;
        box-sizing: border-box; /* Crucial for padding/width math */
    }

    /* The actual slider "knob" using :after */
    .checkbox-wrapper-25 input[type="checkbox"]:after {
        background-color: #eee;
        background-image: -webkit-linear-gradient(
            hsla(0, 0%, 100%, 0.1),
            hsla(0, 0%, 0%, 0.1)
        );
        background-image: linear-gradient(
            hsla(0, 0%, 100%, 0.1),
            hsla(0, 0%, 0%, 0.1)
        );
        border-radius: 25px;
        box-shadow:
            inset 0 1px 1px 1px hsla(0, 0%, 100%, 1),
            inset 0 -1px 1px 1px hsla(0, 0%, 0%, 0.25),
            0 1px 3px 1px hsla(0, 0%, 0%, 0.5),
            0 0 2px hsla(0, 0%, 0%, 0.25);
        content: "";
        display: block;
        height: 25px;
        width: 50px;
        transition: transform 0.25s linear;
    }

    /* Checked State */
    .checkbox-wrapper-25 input[type="checkbox"]:checked {
        background-position:
            0 0,
            35px 0;
        padding-left: 25px;
        padding-right: 0;
    }

    /* Locked / Disabled State */
    .checkbox-wrapper-25 input[type="checkbox"]:disabled {
        cursor: default;
        filter: grayscale(1) opacity(0.5);
    }

    /* Dezent: remove focused ring */
    .checkbox-wrapper-25 input[type="checkbox"]:focus {
        outline: none;
    }
</style>
