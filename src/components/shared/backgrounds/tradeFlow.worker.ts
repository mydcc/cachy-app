/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as THREE from 'three';
import { EqualizerEngine } from './engines/EqualizerEngine';
import { CityEngine } from './engines/CityEngine';
import { RaindropsEngine } from './engines/RaindropsEngine';
import { SonarEngine } from './engines/SonarEngine';
import { BlockEngine } from './engines/BlockEngine';
import { GalaxyFlowEngine } from './engines/GalaxyFlowEngine';
import { type BaseEngine, type EngineContext } from './engines/BaseEngine';
import { VolumeNormalizer, marketHeat, clamp01 } from './engines/volumeScale';
import { pickVolatility, pickMood } from './indicatorSignal';
import type { VolatilitySource, MoodSource } from './indicatorSignal';

// Camera/mode fields this worker itself reads; each engine also reads its
// own settings (gridWidth, spread, size, ...) via BaseEngine's generic
// `settings: any` context field, which this passes through unchanged.
interface FlowSettings {
    flowMode?: string;
    /** Galaxy-mode tunables; only `autoCenter` is read here, the engine reads the rest. */
    galaxyFlow?: { autoCenter?: boolean; [key: string]: unknown };
    volatilitySource?: VolatilitySource;
    moodSource?: MoodSource;
    cameraPositionX?: number;
    cameraHeight?: number;
    cameraDistance?: number;
    cameraRotationX?: number;
    cameraRotationY?: number;
    cameraRotationZ?: number;
    [key: string]: unknown;
}

interface TradeEventData {
    sentiment?: number;
    trade: { type: 'buy' | 'sell'; price: number; amount: number };
}

interface ColorMessageData {
    colorUp: string;
    colorDown: string;
    background: string;
    /** Star palette for the galaxy mode; absent for every other mode. */
    galaxy?: {
        inside: string;
        out1: string;
        out2: string;
        out3: string;
        blending: THREE.Blending;
        cutoff: number;
    };
}

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let activeEngine: BaseEngine | null = null;
let settings: FlowSettings;

// One shared calibration window for whichever engine is active. Lives here so
// a symbol change resets it exactly once via the 'resetVolume' message.
const volumeNormalizer = new VolumeNormalizer();

let colorUp = new THREE.Color(0x00ff88);
let colorDown = new THREE.Color(0xff4444);
let colorBg = new THREE.Color(0x0a0e27);
let targetSentiment = 0;
let currentSentiment = 0;
let currentAtmosphereColor = new THREE.Color(0x0a0e27);
let targetAtmosphereColor = new THREE.Color(0x0a0e27);

// Market-activity tracking for the dynamic atmosphere. Logs recent trades so
// fog / nebula / light intensity can reflect trade RATE + notional VOLUME +
// PRICE VOLATILITY, not just the buy/sell sentiment ratio.
interface TradeLogEntry { t: number; notional: number; }
// Ring buffer (fixed capacity, no per-frame shift()) so the activity window
// stays O(1)-amortized even under sustained high-frequency synthetic ticks.
const TRADE_LOG_CAP = 512;
const tradeLogBuf: (TradeLogEntry | null)[] = new Array(TRADE_LOG_CAP).fill(null);
let tradeLogHead = 0;
let tradeLogCount = 0;

function pushTradeLog(t: number, notional: number) {
	if (tradeLogCount < TRADE_LOG_CAP) {
		tradeLogBuf[(tradeLogHead + tradeLogCount) % TRADE_LOG_CAP] = { t, notional };
		tradeLogCount++;
	} else {
		tradeLogBuf[tradeLogHead] = { t, notional };
		tradeLogHead = (tradeLogHead + 1) % TRADE_LOG_CAP;
	}
}
const tradePriceBuf: number[] = [];
const tradePriceBufMax = 100;
let currentActivity = 0;
const ACTIVITY_WINDOW_MS = 2000;

// Latest indicator readings, pushed from the main thread. Null means "not
// available", which every consumer below treats as "fall back", never as zero —
// a missing indicator must not read as a dead-flat market.
let indicatorVolatilityRel: number | null = null;
let indicatorRsi: number | null = null;

function relativePriceVolatility(): number {
  if (tradePriceBuf.length < 2) return 0;
  const mean = tradePriceBuf.reduce((a, b) => a + b, 0) / tradePriceBuf.length;
  if (mean === 0) return 0;
  let variance = 0;
  for (const p of tradePriceBuf) variance += (p - mean) * (p - mean);
  variance /= tradePriceBuf.length;
  return Math.sqrt(variance) / mean;
}

function computeActivity(nowMs: number): number {
	const cutoff = nowMs - ACTIVITY_WINDOW_MS;
	// Drop expired entries from the front of the ring (amortized O(1)).
	while (tradeLogCount > 0 && (tradeLogBuf[tradeLogHead] as TradeLogEntry).t < cutoff) {
		tradeLogBuf[tradeLogHead] = null;
		tradeLogHead = (tradeLogHead + 1) % TRADE_LOG_CAP;
		tradeLogCount--;
	}
	let volume = 0;
	for (let i = 0; i < tradeLogCount; i++) {
		const e = tradeLogBuf[(tradeLogHead + i) % TRADE_LOG_CAP] as TradeLogEntry;
		volume += e.notional;
	}
	// The real ATR (relative to price) is exactly the `volatilityRel` marketHeat
	// wants, so the indicator drops straight into the slot the trade-derived
	// estimate used to fill.
	const volatilityRel = pickVolatility(
		indicatorVolatilityRel,
		relativePriceVolatility(),
		(settings?.volatilitySource as VolatilitySource) || 'trades'
	);
	return marketHeat({ rate: tradeLogCount, volume, volatilityRel });
}

// Atmosphere lighting
let ambientLight: THREE.AmbientLight | null = null;
let dirLight: THREE.DirectionalLight | null = null;

// Atmosphere nebula particles
let nebulaPoints: THREE.Points | null = null;
let nebulaMaterial: THREE.ShaderMaterial | null = null;
const NEBULA_COUNT = 120;

const nebulaVertexShader = `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime;
    varying float vAlpha;
    void main() {
        vec3 pos = position;
        pos.x += sin(uTime * 0.05 + aPhase * 6.28) * 8.0;
        pos.y += cos(uTime * 0.03 + aPhase * 3.14) * 4.0;
        pos.z += sin(uTime * 0.04 + aPhase * 4.71) * 6.0;
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = aSize * (600.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
        vAlpha = smoothstep(800.0, 100.0, -mvPos.z);
    }
`;

const nebulaFragmentShader = `
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vAlpha;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float alpha = (1.0 - smoothstep(0.0, 0.5, d)) * vAlpha * uOpacity;
        gl_FragColor = vec4(uColor, alpha * 0.35);
    }
`;

function initAtmosphere() {
    ambientLight = new THREE.AmbientLight(0x111111, 0.3);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0x222222, 0.2);
    dirLight.position.set(0, 50, -30);
    scene.add(dirLight);

    const positions = new Float32Array(NEBULA_COUNT * 3);
    const sizes = new Float32Array(NEBULA_COUNT);
    const phases = new Float32Array(NEBULA_COUNT);
    for (let i = 0; i < NEBULA_COUNT; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 40 + Math.random() * 120;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = (Math.random() - 0.3) * 60;
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 40;
        sizes[i] = 15 + Math.random() * 40;
        phases[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    nebulaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(0x222233) },
            uOpacity: { value: 0.0 },
        },
        vertexShader: nebulaVertexShader,
        fragmentShader: nebulaFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    nebulaPoints = new THREE.Points(geo, nebulaMaterial);
    nebulaPoints.renderOrder = -1;
    scene.add(nebulaPoints);
}

self.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'init':
            init(data.canvas, data.width, data.height, data.pixelRatio, data.settings);
            break;
        case 'resize':
            resize(data.width, data.height);
            break;
        case 'updateSettings':
            updateSettings(data.settings);
            break;
        case 'updateLightSettings':
            updateLightSettings(data);
            break;
        case 'updateColors':
            updateColors(data);
            break;
        case 'onTrade':
            onTrade(data);
            break;
        case 'indicator':
            indicatorVolatilityRel = typeof data?.volatilityRel === 'number' ? data.volatilityRel : null;
            indicatorRsi = typeof data?.rsi === 'number' ? data.rsi : null;
            // Engines that draw against a raw indicator (the galaxy's ATR bands)
            // need the value itself, not the blended heat.
            activeEngine?.onIndicators?.({ volatilityRel: indicatorVolatilityRel, rsi: indicatorRsi });
            break;
        case 'resetVolume':
            // Symbol changed: drop the old symbol's notionals from the
            // calibration window so sizes re-learn for the new market.
            volumeNormalizer.reset();
            // ...and forget the old market's activity signature.
			tradeLogHead = 0;
			tradeLogCount = 0;
            tradePriceBuf.length = 0;
            currentActivity = 0;
            // Engines with their own per-market calibration (the galaxy's price
            // axis) drop theirs too — a BTC price window would clamp every ETH
            // trade to one end of the scale.
            activeEngine?.onSymbolChange?.();
            // The previous symbol's ATR and RSI say nothing about the new one,
            // and the replacements arrive one calculation later.
            indicatorVolatilityRel = null;
            indicatorRsi = null;
            activeEngine?.onIndicators?.({ volatilityRel: null, rsi: null });
            break;
    }
};

function init(canvas: OffscreenCanvas, width: number, height: number, pixelRatio: number, initialSettings: FlowSettings) {
    settings = initialSettings;
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: pixelRatio < 2,
        alpha: true,
        powerPreference: "high-performance"
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    initAtmosphere();
    updateCamera();
    switchMode(settings.flowMode);
    
    requestAnimationFrame(animate);
}

let lastFrameTime = 0;

function animate(time: number) {
    const now = time * 0.001;
    // Real frame delta, clamped so a tab switch or GC pause cannot make
    // engines jump. Replaces the old fixed 0.016, which tied animation speed
    // to the display's refresh rate (2x fast on 120 Hz).
    const dt = Math.min(now - lastFrameTime || 0.016, 0.1);
    lastFrameTime = now;
    
    // Smoothing the mood. Which signal it chases is the user's choice; both are
    // in the same -1..+1 space, so everything downstream is unchanged.
    const moodTarget = pickMood(
        targetSentiment,
        indicatorRsi,
        (settings?.moodSource as MoodSource) || 'sentiment'
    );
    currentSentiment = currentSentiment + (moodTarget - currentSentiment) * 0.02;

    // Smoothing market activity (rate + volume + volatility)
    const activity = computeActivity(time);
    currentActivity = currentActivity + (activity - currentActivity) * 0.02;

    const atmoEnabled = settings.enableAtmosphere;
    const sentimentAbs = Math.abs(currentSentiment);

    // === Dynamic Atmosphere ===
    if (atmoEnabled) {
      // Background color: subtle tint toward sentiment
      if (currentSentiment > 0.05) {
        targetAtmosphereColor.copy(colorBg).lerp(colorUp, currentSentiment * 0.12);
      } else if (currentSentiment < -0.05) {
        targetAtmosphereColor.copy(colorBg).lerp(colorDown, sentimentAbs * 0.12);
      } else {
        targetAtmosphereColor.copy(colorBg);
      }

      // Ambient light: shift color + intensity with sentiment AND activity
      if (ambientLight) {
        const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
        ambientLight.color.copy(colorBg).lerp(sentimentColor, sentimentAbs * 0.4);
        ambientLight.intensity = 0.3 + sentimentAbs * 0.5 + currentActivity * 0.4;
      }

      // Directional light: stronger with stronger sentiment AND activity
      if (dirLight) {
        const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
        dirLight.color.copy(sentimentColor);
        dirLight.intensity = 0.1 + sentimentAbs * 0.6 + currentActivity * 0.5;
      }

      // Nebula: fade in with sentiment / activity, color follows market mood
      if (nebulaMaterial) {
        nebulaMaterial.uniforms.uTime.value = now;
        const targetOpacity = clamp01(Math.max(sentimentAbs * 2.0, currentActivity * 1.5));
        const curOp = nebulaMaterial.uniforms.uOpacity.value as number;
        nebulaMaterial.uniforms.uOpacity.value = curOp + (targetOpacity - curOp) * 0.03;
        const nebulaColor = currentSentiment > 0 ? colorUp : colorDown;
        (nebulaMaterial.uniforms.uColor.value as THREE.Color).lerp(nebulaColor, 0.02);
      }

      // Fog: denser with stronger sentiment / activity for dramatic depth
      const baseDensity = 0.008;
      const sentimentDensity = baseDensity + sentimentAbs * 0.015 + currentActivity * 0.02;
      if (!scene.fog) {
        scene.fog = new THREE.FogExp2(currentAtmosphereColor.getHex(), sentimentDensity);
      } else {
        const fog = scene.fog as THREE.FogExp2;
        fog.density += (sentimentDensity - fog.density) * 0.02;
        fog.color.copy(currentAtmosphereColor);
      }
    } else {
        targetAtmosphereColor.copy(colorBg);
        // Reset atmosphere elements when disabled
        if (ambientLight) { ambientLight.intensity = 0.15; ambientLight.color.set(0x111111); }
        if (dirLight) { dirLight.intensity = 0.1; dirLight.color.set(0x222222); }
        if (nebulaMaterial) {
            nebulaMaterial.uniforms.uTime.value = now;
            const curOp = nebulaMaterial.uniforms.uOpacity.value as number;
            nebulaMaterial.uniforms.uOpacity.value = curOp * 0.95; // fade out
        }
        if (scene.fog) {
            const fog = scene.fog as THREE.FogExp2;
            fog.density += (0.005 - fog.density) * 0.02;
            fog.color.copy(colorBg);
        }
    }

    currentAtmosphereColor.lerp(targetAtmosphereColor, 0.02);
    scene.background = currentAtmosphereColor;

    if (activeEngine) {
        activeEngine.context.currentAtmosphere = currentAtmosphereColor;
        // Continuous market heat, for engines that drive motion from it rather
        // than from individual trades.
        activeEngine.onMarketActivity?.(currentActivity);
        try {
            activeEngine.update(now, dt);
        } catch (err) {
            console.error('[TradeFlow] engine update error', err);
        }
        updateSentimentUniforms();
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

interface ObjectWithSentimentUniform {
    material?: { uniforms?: { uSentiment?: { value: number } } };
}

function updateSentimentUniforms() {
    // Uniform references are cached after each engine build (see
    // collectSentimentUniforms) so the per-frame update avoids a scene.traverse.
    for (const uniform of sentimentUniforms) {
        uniform.value = currentSentiment;
    }
}

let sentimentUniforms: { value: number }[] = [];

function collectSentimentUniforms() {
    sentimentUniforms = [];
    scene.traverse((obj) => {
        const uniforms = (obj as unknown as ObjectWithSentimentUniform).material?.uniforms;
        if (uniforms?.uSentiment) {
            sentimentUniforms.push(uniforms.uSentiment);
        }
    });
}

function resize(width: number, height: number) {
    if (!camera || !renderer) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

function updateSettings(newSettings: FlowSettings) {
    const prevMode = settings ? settings.flowMode : null;
    settings = newSettings;
    updateCamera();
    
    if (prevMode && newSettings.flowMode !== prevMode) {
        switchMode(newSettings.flowMode);
    } else if (activeEngine) {
        activeEngine.updateSettings(settings);
    }
}

function updateLightSettings(data: Record<string, unknown>) {
    // Merge lightweight fields into settings without triggering engine reinit
    Object.assign(settings, data);
    updateCamera();
    // Update engine context settings reference so engines read fresh values
    if (activeEngine) {
        activeEngine.context.settings = settings;
    }
}

function updateCamera() {
    if (!camera) return;
    camera.position.set(settings.cameraPositionX || 0, settings.cameraHeight || 20, settings.cameraDistance || 40);

    // Grid modes lay their content out in front of a fixed-rotation camera. The
    // galaxy instead sits at the origin, so it aims the camera at itself — the
    // same `autoCenter` behaviour the standalone Galaxy 3D background has, which
    // is what keeps the position sliders usable there (a raw rotation would let
    // the user push the galaxy out of frame with one slider).
    if (settings.flowMode === 'galaxy' && settings.galaxyFlow?.autoCenter !== false) {
        camera.lookAt(0, 0, 0);
    } else {
        // The VisualsTab rotation sliders are labelled in degrees (-180..180)
        // and send their raw values, so convert here. Nullish (not falsy) so a
        // deliberate 0 - the default - is honoured instead of hiding a pitch.
        camera.rotation.set(
            (settings.cameraRotationX ?? 0) * Math.PI / 180,
            (settings.cameraRotationY ?? 0) * Math.PI / 180,
            (settings.cameraRotationZ ?? 0) * Math.PI / 180
        );
    }
    camera.updateProjectionMatrix();
}

function updateColors(data: ColorMessageData) {
    colorUp.set(data.colorUp);
    colorDown.set(data.colorDown);
    colorBg.set(data.background);

    // Galaxy mode additionally carries the theme's star palette, resolved from
    // the same `--galaxy-*` variables the standalone background reads, so both
    // galaxies stay the same object across all themes. Every other mode simply
    // has no use for these fields.
    if (activeEngine instanceof GalaxyFlowEngine && data.galaxy) {
        const g = data.galaxy;
        activeEngine.updateGalaxyPalette(g.inside, g.out1, g.out2, g.out3, g.blending, g.cutoff);
    }

    if (activeEngine) {
        activeEngine.context.colorUp = colorUp;
        activeEngine.context.colorDown = colorDown;
        activeEngine.context.currentAtmosphere = colorBg;
        
        // Notify engine of color change
        if (activeEngine.updateThemeColors) {
            activeEngine.updateThemeColors(colorUp, colorDown, colorBg);
        }
    }
}

function switchMode(mode: string | undefined) {
    if (activeEngine) {
        activeEngine.dispose();
        activeEngine = null;
    }

    const context: EngineContext = {
        scene,
        camera,
        renderer,
        settings,
        volumeNormalizer,
        colorUp,
        colorDown,
        currentAtmosphere: colorBg
    };

    switch (mode) {
        case 'equalizer': activeEngine = new EqualizerEngine(context); break;
        case 'city': activeEngine = new CityEngine(context); break;
        case 'raindrops': activeEngine = new RaindropsEngine(context); break;
        case 'sonar': activeEngine = new SonarEngine(context); break;
        case 'block': activeEngine = new BlockEngine(context); break;
        case 'galaxy': activeEngine = new GalaxyFlowEngine(context); break;
    }

    // The galaxy is centred on the origin and aims the camera at itself, so a
    // mode switch has to re-run the camera setup rather than keep the grid
    // modes' fixed rotation.
    updateCamera();

    if (activeEngine) {
        activeEngine.init();
        // A newly built engine has missed every indicator message so far; hand it
        // the current readings rather than making it wait for the next one.
        activeEngine.onIndicators?.({ volatilityRel: indicatorVolatilityRel, rsi: indicatorRsi });
    }
    // New engine, new meshes: refresh the cached sentiment uniform references.
    collectSentimentUniforms();
}

function onTrade(data: TradeEventData) {
    try {
        if (data.sentiment !== undefined) {
            targetSentiment = data.sentiment;
        }
        const trade = data.trade;
        if (trade) {
            const notional = (trade.price || 0) * (trade.amount || 0);
			if (Number.isFinite(notional)) {
				pushTradeLog(performance.now(), notional);
			}
            if (Number.isFinite(trade.price) && trade.price > 0) {
                tradePriceBuf.push(trade.price);
                if (tradePriceBuf.length > tradePriceBufMax) tradePriceBuf.shift();
            }
        }
        activeEngine?.onTrade?.(trade);
    } catch (err) {
        console.error('[TradeFlow] onTrade error', err);
    }
}
