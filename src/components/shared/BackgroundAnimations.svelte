<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";

    const intensityMultiplier = $derived(
        settingsState.backgroundAnimationIntensity === "low"
            ? 1.5
            : settingsState.backgroundAnimationIntensity === "high"
              ? 0.75
              : 1,
    );

    const particleCount = $derived(
        settingsState.backgroundAnimationIntensity === "low"
            ? 20
            : settingsState.backgroundAnimationIntensity === "high"
              ? 50
              : 35,
    );
</script>

{#if settingsState.backgroundAnimationPreset === "gradient"}
    <div
        class="animation-gradient"
        style="--duration: {15 * intensityMultiplier}s"
    ></div>
{:else if settingsState.backgroundAnimationPreset === "particles"}
    <div class="animation-particles">
        {#each Array(particleCount) as _, i}
            <div
                class="particle"
                style="--delay: {i * 0.5}s; --x: {Math.random() * 100}%"
            ></div>
        {/each}
    </div>
{:else if settingsState.backgroundAnimationPreset === "breathing"}
    <div
        class="animation-breathing"
        style="--duration: {8 * intensityMultiplier}s"
    ></div>
{:else if settingsState.backgroundAnimationPreset === "waves"}
    <div
        class="animation-waves"
        style="--duration: {12 * intensityMultiplier}s"
    ></div>
{:else if settingsState.backgroundAnimationPreset === "aurora"}
    <div
        class="animation-aurora"
        style="--duration: {20 * intensityMultiplier}s"
    ></div>
{/if}

<style>
    .animation-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(
            270deg,
            var(--bg-primary),
            var(--bg-secondary),
            var(--accent-color)
        );
        background-size: 600% 600%;
        animation: gradientShift var(--duration) ease infinite;
    }

    @keyframes gradientShift {
        0%,
        100% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
    }

    .animation-particles {
        position: relative;
        width: 100%;
        height: 100%;
    }

    .particle {
        position: absolute;
        width: 3px;
        height: 3px;
        background: var(--text-primary);
        opacity: 0.3;
        border-radius: 50%;
        left: var(--x);
        animation: float 15s var(--delay) infinite linear;
    }

    @keyframes float {
        0%,
        100% {
            transform: translateY(100vh);
            opacity: 0;
        }
        10%,
        90% {
            opacity: 0.6;
        }
        50% {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .animation-breathing {
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 50%,
            transparent 0%,
            var(--black-transparent) 100%
        );
        animation: breathe var(--duration) ease-in-out infinite;
    }

    @keyframes breathe {
        0%,
        100% {
            transform: scale(1);
            opacity: 0.5;
        }
        50% {
            transform: scale(1.15);
            opacity: 0.8;
        }
    }

    .animation-waves {
        width: 100%;
        height: 100%;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120'%3E%3Cpath d='M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V27.35A600.21,600.21,0,0,0,321.39,56.44Z' fill='rgba(255,255,255,0.1)'/%3E%3C/svg%3E");
        background-size: 200% 100%;
        animation: waveMove var(--duration) linear infinite;
    }

    @keyframes waveMove {
        0% {
            background-position: 0 0;
        }
        100% {
            background-position: 200% 0;
        }
    }

    .animation-aurora {
        width: 100%;
        height: 100%;
        background:
            linear-gradient(45deg, rgba(255, 0, 150, 0.3), transparent 70%),
            linear-gradient(-45deg, rgba(0, 255, 255, 0.3), transparent 70%),
            linear-gradient(135deg, rgba(0, 150, 255, 0.3), transparent 70%);
        background-size: 200% 200%;
        animation: auroraShift var(--duration) ease infinite;
        mix-blend-mode: screen;
    }

    @keyframes auroraShift {
        0%,
        100% {
            background-position:
                0% 0%,
                100% 100%,
                0% 100%;
        }
        50% {
            background-position:
                100% 100%,
                0% 0%,
                100% 0%;
        }
    }
</style>
