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

<script lang="ts">
    import { onMount } from "svelte";
    import * as THREE from "three";
    import { browser } from "$app/environment";
    import { settingsState } from "../../stores/settings.svelte";
    import { marketState } from "../../stores/market.svelte";
    import { tradeState } from "../../stores/trade.svelte";
    import { activeExchange } from "../../services/exchange";

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let material: THREE.ShaderMaterial;
    let geometry: THREE.PlaneGeometry;
    let mesh: THREE.Mesh;

    let requestStartLoop: (() => void) | null = null;
    let requestStopLoop: (() => void) | null = null;

    const isEnabled = $derived(settingsState.enableAmbientTopline);
    const currentMode = $derived(settingsState.ambientToplineMode);
    const currentIntensity = $derived(settingsState.ambientToplineIntensity);
    const enableBursts = $derived(settingsState.ambientToplineBursts);

    const intensityConfig = $derived.by(() => {
        switch (currentIntensity) {
            case "subtle":
                return { coreExp: 90.0, corePower: 1.5, emissionRate: 14.0, emissionPower: 0.45, height: 16 };
            case "vibrant":
                return { coreExp: 22.0, corePower: 2.8, emissionRate: 4.5, emissionPower: 1.35, height: 32 };
            case "standard":
            default:
                return { coreExp: 42.0, corePower: 2.2, emissionRate: 8.0, emissionPower: 0.85, height: 24 };
        }
    });

    // Dynamic Real-time Market Sentiment (-1.0 Bearish to +1.0 Bullish) & Trade Activity
    let sentiment = $state(0);
    let tradeActivity = $state(0);
    const tradeHistory: string[] = [];
    const maxHistory = 40;

    // Baseline from 24h market momentum across favorite symbols
    const tickerMomentum = $derived.by(() => {
        const items = Object.values(marketState.data);
        if (items.length === 0) return 0;
        let up = 0;
        let total = 0;
        for (const item of items) {
            if (item.priceChangePercent != null) {
                total++;
                if (item.priceChangePercent.gt(0)) up++;
            }
        }
        return total > 0 ? (up / total) * 2 - 1 : 0;
    });

    // Risk / Account Health Sentiment
    const riskSentiment = $derived.by(() => {
        const riskNum = parseFloat(tradeState.riskPercentage || "1.0");
        if (isNaN(riskNum) || riskNum <= 1.5) return 1.0;
        if (riskNum <= 2.5) return 0.2;
        if (riskNum <= 4.0) return -0.4;
        return -1.0;
    });

    const effectiveSentiment = $derived.by(() => {
        switch (currentMode) {
            case "market_momentum":
                return tickerMomentum;
            case "risk_health":
                return riskSentiment;
            case "symbol_orderflow":
            default:
                return sentiment || tickerMomentum;
        }
    });

    // Subscribe to live trades for micro-momentum & bursts
    interface RawTradeEvent {
        s?: string;
        side?: string;
    }

    function onTrade(trade: RawTradeEvent) {
        const side = trade.s || trade.side;
        if (!side) return;
        tradeHistory.push(side.toLowerCase());
        if (tradeHistory.length > maxHistory) tradeHistory.shift();
        const buys = tradeHistory.filter((s) => s === "buy").length;
        const liveMomentum = (buys / tradeHistory.length) * 2 - 1;
        sentiment = sentiment * 0.85 + (liveMomentum * 0.7 + tickerMomentum * 0.3) * 0.15;
        if (enableBursts) {
            tradeActivity = Math.min(tradeActivity + 0.35, 1.0);
        }
    }

    $effect(() => {
        if (!browser || !isEnabled) return;
        const currentSymbol = tradeState.symbol || "BTCUSDT";
        const cleanup = activeExchange().marketData.subscribeTrades(currentSymbol, onTrade);
        return () => cleanup();
    });

    // Resolve theme colors dynamically from CSS variables (Strictly no hardcoded hex)
    function resolveThemeColor(varName: string, fallback: string = "#ff8800"): THREE.Color {
        if (!browser || typeof document === "undefined") return new THREE.Color(fallback);
        try {
            const tempDiv = document.createElement("div");
            tempDiv.style.color = `var(${varName}, ${fallback})`;
            document.body.appendChild(tempDiv);
            const computed = getComputedStyle(tempDiv).color;
            document.body.removeChild(tempDiv);
            return new THREE.Color(computed || fallback);
        } catch {
            return new THREE.Color(fallback);
        }
    }

    // Wake-up or pause render loop reactively
    $effect(() => {
        if (isEnabled && typeof document !== "undefined" && !document.hidden) {
            requestStartLoop?.();
        } else {
            requestStopLoop?.();
        }
    });

    // Dynamically update canvas height on intensity change
    $effect(() => {
        if (!renderer || !isEnabled) return;
        const h = intensityConfig.height;
        renderer.setSize(window.innerWidth, h);
    });

    onMount(() => {
        if (!browser) return;

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        camera.position.z = 1;

        try {
            renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: false,
                stencil: false,
                depth: false,
                powerPreference: "low-power",
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(window.innerWidth, intensityConfig.height);
            renderer.setClearColor(0x000000, 0);

            const canvas = renderer.domElement;
            canvas.style.position = "absolute";
            canvas.style.top = "0";
            canvas.style.left = "0";
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            canvas.style.pointerEvents = "none";
            canvas.style.background = "transparent";

            container.appendChild(canvas);
        } catch (e) {
            console.error("[AmbientTopline] Failed to initialize WebGL renderer", e);
            return;
        }

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform float uSentiment;
            uniform float uTradeActivity;
            uniform float uCoreExp;
            uniform float uCorePower;
            uniform float uEmissionRate;
            uniform float uEmissionPower;
            uniform vec3 uColorBullish;
            uniform vec3 uColorBearish;
            uniform vec3 uColorNeutral;
            varying vec2 vUv;

            void main() {
                // Distance from top edge (0.0 at top border, 1.0 at bottom of aura)
                float dist = clamp(1.0 - vUv.y, 0.0, 1.0);

                // 1. Satter, leuchtender Laser Core (direkt bündig am oberen Rand)
                float core = exp(-dist * dist * uCoreExp) * uCorePower;

                // 2. Weite, volumetrische Inverse-Square Emission nach unten
                float emission = (1.0 / (dist * uEmissionRate + 1.0)) * uEmissionPower;
                float totalIntensity = core + emission;

                // 3. Trade Photon Wave flow (moves left-to-right for bullish, right-to-left for bearish)
                float flowDir = uSentiment >= 0.0 ? -1.0 : 1.0;
                float speed = (1.5 + abs(uSentiment) * 1.5 + uTradeActivity * 3.5) * flowDir;
                float photonWave = sin(vUv.x * 24.0 + uTime * speed) * 0.15 + 0.85;

                // 4. Subtle Breathing Cycle
                float breath = sin(uTime * 1.8) * 0.10 + 0.90;

                // 5. Sentiment Color Interpolation (from theme CSS variables)
                vec3 baseColor;
                if (uSentiment >= 0.0) {
                    baseColor = mix(uColorNeutral, uColorBullish, smoothstep(0.0, 0.7, uSentiment));
                } else {
                    baseColor = mix(uColorNeutral, uColorBearish, smoothstep(0.0, 0.7, -uSentiment));
                }

                // Brilliant white core in center of filament
                vec3 hotCore = mix(baseColor, vec3(1.0, 1.0, 1.0), 0.75);
                vec3 finalRGB = mix(baseColor, hotCore, clamp(core, 0.0, 1.0)) * photonWave * breath;

                // Additive Alpha with Activity Burst boost
                float alpha = clamp(totalIntensity * photonWave * breath * (0.85 + uTradeActivity * 0.35), 0.0, 1.0);

                gl_FragColor = vec4(finalRGB, alpha);
            }
        `;

        geometry = new THREE.PlaneGeometry(2, 2);
        material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uSentiment: { value: 0 },
                uTradeActivity: { value: 0 },
                uCoreExp: { value: intensityConfig.coreExp },
                uCorePower: { value: intensityConfig.corePower },
                uEmissionRate: { value: intensityConfig.emissionRate },
                uEmissionPower: { value: intensityConfig.emissionPower },
                uColorBullish: { value: resolveThemeColor("--success-color", "#22c55e") },
                uColorBearish: { value: resolveThemeColor("--danger-color", "#ef4444") },
                uColorNeutral: { value: resolveThemeColor("--accent-color", "#ff8800") },
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });

        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        const clock = new THREE.Clock();
        let frameId: number | null = null;
        let isLoopRunning = false;
        let lastThemeUpdate = 0;

        const stopLoop = () => {
            if (!isLoopRunning) return;
            isLoopRunning = false;
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            if (renderer) {
                renderer.clear();
            }
        };

        const startLoop = () => {
            if (isLoopRunning || !renderer || !browser) return;
            if (document.hidden || !isEnabled) return;
            isLoopRunning = true;
            frameId = requestAnimationFrame(animate);
        };

        const animate = () => {
            if (!isLoopRunning || !renderer) return;

            if (document.hidden || !isEnabled) {
                stopLoop();
                return;
            }

            frameId = requestAnimationFrame(animate);

            const now = performance.now();
            if (now - lastThemeUpdate > 1000) {
                material.uniforms.uColorBullish.value = resolveThemeColor("--success-color", "#22c55e");
                material.uniforms.uColorBearish.value = resolveThemeColor("--danger-color", "#ef4444");
                material.uniforms.uColorNeutral.value = resolveThemeColor("--accent-color", "#ff8800");
                lastThemeUpdate = now;
            }

            tradeActivity = enableBursts ? tradeActivity * 0.94 : 0;

            material.uniforms.uTime.value = clock.getElapsedTime();
            material.uniforms.uSentiment.value = effectiveSentiment;
            material.uniforms.uTradeActivity.value = tradeActivity;
            material.uniforms.uCoreExp.value = intensityConfig.coreExp;
            material.uniforms.uCorePower.value = intensityConfig.corePower;
            material.uniforms.uEmissionRate.value = intensityConfig.emissionRate;
            material.uniforms.uEmissionPower.value = intensityConfig.emissionPower;

            renderer.render(scene, camera);
        };

        requestStartLoop = startLoop;
        requestStopLoop = stopLoop;

        if (isEnabled && !document.hidden) {
            startLoop();
        }

        const handleVisibilityChange = () => {
            if (document.hidden) {
                stopLoop();
            } else if (isEnabled) {
                startLoop();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        const handleResize = () => {
            if (!renderer) return;
            renderer.setSize(window.innerWidth, intensityConfig.height);
        };
        window.addEventListener("resize", handleResize);

        return () => {
            requestStartLoop = null;
            requestStopLoop = null;
            stopLoop();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("resize", handleResize);
            if (renderer) {
                renderer.dispose();
                renderer.forceContextLoss();
            }
            geometry.dispose();
            material.dispose();
        };
    });
</script>

<div
    bind:this={container}
    class="ambient-topline-container"
    class:hidden={!isEnabled}
    style:height="{intensityConfig.height}px"
    aria-hidden="true"
></div>

<style>
    .ambient-topline-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw;
        height: 24px;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
        background: transparent !important;
    }

    .hidden {
        display: none !important;
    }
</style>
