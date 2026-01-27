<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { uiState } from "../../stores/ui.svelte";
    import { trackCustomEvent } from "../../services/trackingService";
    import { onMount } from "svelte";

    // SHA-256 Hash of the cheat code (not stored in plaintext)
    const CHEAT_CODE_HASH =
        "6c7de706af22343c9919ce5addec8b8341cfbcf82e5854f30fa98a3990bbc556";
    const CHEAT_CODE_LENGTH = 9;

    let typedBuffer = $state("");

    async function hashString(input: string): Promise<string> {
        const encoded = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }

    async function checkCheatCode(buffer: string): Promise<boolean> {
        if (buffer.length < CHEAT_CODE_LENGTH) return false;
        const candidate = buffer.slice(-CHEAT_CODE_LENGTH);
        const hash = await hashString(candidate);
        return hash === CHEAT_CODE_HASH;
    }

    onMount(() => {
        const handleGlobalKeydown = async (e: KeyboardEvent) => {
            // Don't capture when typing in inputs/textareas
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            if (e.key.length !== 1) return;

            typedBuffer += e.key.toUpperCase();
            if (typedBuffer.length > 20) {
                typedBuffer = typedBuffer.slice(-20);
            }

            const isMatch = await checkCheatCode(typedBuffer);
            if (isMatch) {
                // Toggle the entire license
                settingsState.isProLicenseActive =
                    !settingsState.isProLicenseActive;
                typedBuffer = ""; // Reset buffer after match

                trackCustomEvent(
                    "Security",
                    "CheatCode",
                    settingsState.isProLicenseActive ? "Unlocked" : "Locked",
                );

                // If license is deactivated, also deactivate Pro feature to be consistent
                if (!settingsState.isProLicenseActive) {
                    settingsState.isPro = false;
                }
            }
        };

        window.addEventListener("keydown", handleGlobalKeydown);
        return () => window.removeEventListener("keydown", handleGlobalKeydown);
    });

    function handleToggle(event: Event) {
        if (!settingsState.isProLicenseActive) {
            event.preventDefault();
            return;
        }

        const input = event.target as HTMLInputElement;
        settingsState.isPro = input.checked;
        trackCustomEvent(
            "ProStatus",
            "Toggle",
            settingsState.isPro ? "Activated" : "Deactivated", // trackCustomEvent
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
        disabled={!settingsState.isProLicenseActive}
    />
</div>

<style>
    .checkbox-wrapper-25 {
        display: inline-flex;
        align-items: center;
    }

    /* Specimen scaled to 12px height (approx 0.48x) */
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
            7.2px 0; /* Scaled 15px * 0.48 */
        border-radius: 12px;
        box-shadow:
            inset 0 0.5px 2px hsla(0, 0%, 0%, 0.5),
            inset 0 0 5px hsla(0, 0%, 0%, 0.5),
            0 0 0 0.5px hsla(0, 0%, 0%, 0.1),
            0 -0.5px 1px 1px hsla(0, 0%, 0%, 0.25),
            0 1px 1px 1px hsla(0, 0%, 100%, 0.1);
        cursor: pointer;
        height: 12px;
        padding-right: 12px;
        width: 36px;
        -webkit-appearance: none;
        appearance: none;
        -webkit-transition: 0.25s;
        transition: 0.25s;
        border: none;
        outline: none;
        position: relative;
        box-sizing: border-box;
    }

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
        border-radius: 12px;
        box-shadow:
            inset 0 0.5px 0.5px 0.5px hsla(0, 0%, 100%, 1),
            inset 0 -0.5px 0.5px 0.5px hsla(0, 0%, 0%, 0.25),
            0 0.5px 1.5px 0.5px hsla(0, 0%, 0%, 0.5),
            0 0 1px hsla(0, 0%, 0%, 0.25);
        content: "";
        display: block;
        height: 12px;
        width: 24px;
        position: absolute;
        left: 0;
        top: 0;
        transition: transform 0.25s;
    }

    .checkbox-wrapper-25 input[type="checkbox"]:checked {
        background-position:
            0 0,
            16.8px 0; /* Scaled 35px * 0.48 */
        padding-left: 12px;
        padding-right: 0;
    }

    .checkbox-wrapper-25 input[type="checkbox"]:checked:after {
        transform: translateX(12px);
    }

    .checkbox-wrapper-25 input[type="checkbox"]:disabled {
        cursor: default;
        filter: grayscale(1) opacity(0.3);
    }

    .checkbox-wrapper-25 input[type="checkbox"]:focus {
        outline: none;
    }
</style>
