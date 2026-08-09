<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { settingsState } from "../../stores/settings.svelte";
    import { browser } from "$app/environment";
    import { tradeState } from "../../stores/trade.svelte";
    import { bitunixWs } from "../../services/bitunixWs";

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

    // --- Real-time Sentiment ---
    let tradeHistory: string[] = [];
    const tradeHistorySize = 50;
    let sentiment = $state(0); // -1 to 1

    interface RawTradeEvent {
        s?: string;
        side?: string;
    }

    function onTrade(trade: RawTradeEvent) {
        const side = trade.s || trade.side;
        if (!side) return;
        
        tradeHistory.push(side);
        if (tradeHistory.length > tradeHistorySize) {
            tradeHistory.shift();
        }
        
        const buys = tradeHistory.filter(s => s === 'buy' || s === 'BUY').length;
        sentiment = (buys / tradeHistory.length) * 2 - 1;
    }

    $effect(() => {
        if (!browser) return;
        const currentSymbol = tradeState.symbol || "BTCUSDT";
        const cleanup = bitunixWs.subscribeTrade(currentSymbol, onTrade);
        return () => cleanup();
    });

    // Compute dynamic color based on sentiment
    const sentimentColor = $derived(
        sentiment > 0.3 ? "var(--color-up)" :
        sentiment < -0.3 ? "var(--color-down)" :
        "var(--accent-color)"
    );
</script>

<div class="animation-wrapper" style="--sentiment-color: {sentimentColor}; --duration-mult: {intensityMultiplier};">
    {#if settingsState.backgroundAnimationPreset === "gradient"}
        <div class="animation-gradient"></div>
    {:else if settingsState.backgroundAnimationPreset === "particles"}
        <div class="animation-particles">
            {#each Array.from({ length: particleCount }, (_, i) => i) as i}
                <div class="particle" style="--delay: {i * 0.5}s; --x: {Math.random() * 100}%"></div>
            {/each}
        </div>
    {:else if settingsState.backgroundAnimationPreset === "breathing"}
        <!-- Replaced with Pulse -->
        <div class="animation-pulse"></div>
    {:else if settingsState.backgroundAnimationPreset === "waves"}
        <!-- Replaced with Multi-Layer Waves -->
        <div class="animation-waves">
            <div class="wave wave1"></div>
            <div class="wave wave2"></div>
            <div class="wave wave3"></div>
        </div>
    {:else if settingsState.backgroundAnimationPreset === "aurora"}
        <div class="animation-aurora"></div>
    {/if}
</div>

<style>
    .animation-wrapper {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        transition: --sentiment-color 0.5s ease;
    }

    /* GRADIENT */
    .animation-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(
            270deg,
            var(--bg-primary),
            var(--sentiment-color),
            var(--bg-secondary)
        );
        background-size: 600% 600%;
        animation: gradientShift calc(15s * var(--duration-mult)) ease infinite;
    }
    @keyframes gradientShift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
    }

    /* PARTICLES */
    .animation-particles {
        position: relative;
        width: 100%;
        height: 100%;
    }
    .particle {
        position: absolute;
        width: 4px;
        height: 4px;
        background: var(--sentiment-color);
        box-shadow: 0 0 10px var(--sentiment-color);
        opacity: 0.4;
        border-radius: 50%;
        left: var(--x);
        animation: float calc(15s * var(--duration-mult)) var(--delay) infinite linear;
    }
    @keyframes float {
        0%, 100% { transform: translateY(100vh); opacity: 0; }
        10%, 90% { opacity: 0.6; }
        50% { transform: translateY(0); opacity: 1; }
    }

    /* PULSE (replaces Breathing) */
    .animation-pulse {
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at 50% 50%,
            var(--sentiment-color) 0%,
            transparent 60%
        );
        animation: pulse calc(4s * var(--duration-mult)) ease-in-out infinite;
        opacity: 0.15;
    }
    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 0.1; }
        50% { transform: scale(1.3); opacity: 0.25; }
    }

    /* WAVES (replaces old SVG waves) */
    .animation-waves {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }
    .wave {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 200%;
        height: 100px;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120' preserveAspectRatio='none'%3E%3Cpath d='M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V120H0Z' fill='%23ffffff'/%3E%3C/svg%3E") repeat-x;
        background-size: 50% 100%;
        opacity: 0.05;
        animation: waveMove linear infinite;
    }
    .wave1 {
        height: 150px;
        opacity: 0.03;
        animation-duration: calc(15s * var(--duration-mult));
    }
    .wave2 {
        height: 100px;
        opacity: 0.05;
        animation-duration: calc(10s * var(--duration-mult));
        animation-direction: reverse;
    }
    .wave3 {
        height: 70px;
        opacity: 0.15;
        background-color: transparent;
        -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120' preserveAspectRatio='none'%3E%3Cpath d='M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V120H0Z' fill='%23ffffff'/%3E%3C/svg%3E");
        -webkit-mask-size: 50% 100%;
        mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 120' preserveAspectRatio='none'%3E%3Cpath d='M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V0H0V120H0Z' fill='%23ffffff'/%3E%3C/svg%3E");
        mask-size: 50% 100%;
        background: var(--sentiment-color);
        background-image: none;
        animation-duration: calc(8s * var(--duration-mult));
    }
    @keyframes waveMove {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
    }

    /* AURORA */
    .animation-aurora {
        width: 100%;
        height: 100%;
        background:
            radial-gradient(ellipse at 20% 50%, var(--sentiment-color) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, var(--bg-secondary) 0%, transparent 60%),
            radial-gradient(ellipse at 50% 20%, var(--accent-color) 0%, transparent 50%);
        background-size: 200% 200%;
        opacity: 0.35;
        animation: auroraShift calc(20s * var(--duration-mult)) ease infinite;
        mix-blend-mode: screen;
    }
    @keyframes auroraShift {
        0%, 100% { background-position: 0% 0%, 100% 100%, 0% 100%; }
        50% { background-position: 100% 100%, 0% 0%, 100% 0%; }
    }
</style>
