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
import { GalaxyFlowEngine, galaxyCameraWorldPosition } from './engines/GalaxyFlowEngine';
import { type BaseEngine, type EngineContext } from './engines/BaseEngine';
import { VolumeNormalizer, marketHeat, clamp01 } from './engines/volumeScale';
import { smoothingAlpha, TAU_SIGNAL, TAU_NEBULA, TAU_GYRO, TAU_NEBULA_FADE } from './engines/smoothing';
import { pickVolatility, pickMood } from './indicatorSignal';
import type { VolatilitySource, MoodSource } from './indicatorSignal';

// Camera/mode fields this worker itself reads; each engine also reads its
// own settings (gridWidth, spread, size, ...) via BaseEngine's generic
// `settings: any` context field, which this passes through unchanged.
interface FlowSettings {
    flowMode?: string;
    /** Galaxy-mode tunables; the camera fields are read here, the engine reads the rest. */
    galaxyFlow?: {
        autoCenter?: boolean;
        camPos?: { x: number; y: number; z: number };
        enableGyroscope?: boolean;
        galaxyRot?: { x: number; y: number; z: number };
        [key: string]: unknown;
    };
    /** Overall reaction strength of the dynamic atmosphere. 1 = tuned default. */
    atmosphereIntensity?: number;
    /** Reaction-speed multiplier; scales the smoothing time constants and sky drift. */
    atmosphereSpeed?: number;
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
    /**
     * Whether the active theme is a light one. The atmosphere sky switches to
     * normal blending on light themes (additive washes out to white there).
     */
    light?: boolean;
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

// The standalone galaxy frames a radius-5 disc from `camPos` (default z=5).
// This scene is 12x larger (radius default 60), so the same camPos is scaled by
// this factor: both galaxies share identical camera settings and framing, while
// the tuned world proportions (particle size, pulse travel) stay untouched.
const GALAXY_CAMERA_SCALE = 12;
const GALAXY_FOV = 50;
const GRID_FOV = 60;

// Device-orientation offset in camPos units, smoothed like the standalone
// galaxy's worker does. Applied only in galaxy mode.
let targetGyroOffset = { x: 0, y: 0 };
let currentGyroOffset = { x: 0, y: 0 };

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

// Atmosphere sky: a large, world-anchored dome drawn behind everything. The
// procedural clouds are sampled from the fragment's direction, so rotating the
// view (or the dome, which the galaxy rotation drives) pans the field, and
// moving the camera shifts it with real parallax. The point sprites this
// replaces only reacted to camera distance.
let sky: THREE.Mesh | null = null;
let skyMaterial: THREE.ShaderMaterial | null = null;
let isLightTheme = false;
// Well inside the camera's far plane (1000); depthTest is off, so the radius
// only controls how much parallax the dome shows.
const SKY_RADIUS = 300;

const skyVertexShader = `
    varying vec3 vDir;
    void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const skyFragmentShader = `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    uniform float uTime;
    uniform float uDrift;
    varying vec3 vDir;

    float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z);
    }
    float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 3; i++) {
            v += a * noise(p);
            p *= 2.03;
            a *= 0.5;
        }
        return v;
    }
    void main() {
        vec3 p = vDir * 1.8 + vec3(uTime * uDrift * 0.02, uTime * uDrift * 0.013, -uTime * uDrift * 0.017);
        float n = fbm(p);
        n = smoothstep(0.30, 0.85, n);
        vec3 col = mix(uColorA, uColorB, n);
        gl_FragColor = vec4(col, n * uOpacity);
    }
`;

function initAtmosphere() {
    ambientLight = new THREE.AmbientLight(0x111111, 0.3);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0x222222, 0.2);
    dirLight.position.set(0, 50, -30);
    scene.add(dirLight);

    const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColorA: { value: new THREE.Color(0x0a0e27) },
            uColorB: { value: new THREE.Color(0x222233) },
            uOpacity: { value: 0.0 },
            uTime: { value: 0 },
            uDrift: { value: 1.0 },
        },
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        transparent: true,
        // depthWrite off (a backdrop must not occlude), depthTest ON so opaque
        // scene geometry drawn before it correctly hides the dome behind it.
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    sky = new THREE.Mesh(skyGeo, skyMaterial);
    // Rendered before every other transparent object (the engines' particles),
    // so the dome always sits behind them.
    sky.renderOrder = -2;
    sky.frustumCulled = false;
    scene.add(sky);
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
        case 'gyro':
            handleGyro(data);
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

    // Framerate-independent smoothing. `atmosphereSpeed` scales every time
    // constant, so the reaction pace is one control instead of a magic number.
    const rawIntensity = typeof settings.atmosphereIntensity === 'number' ? settings.atmosphereIntensity : 1;
    const atmoIntensity = Math.min(2, Math.max(0, rawIntensity));
    const rawSpeed = typeof settings.atmosphereSpeed === 'number' ? settings.atmosphereSpeed : 1;
    const atmoSpeed = Math.min(3, Math.max(0.1, rawSpeed));
    const alphaSignal = smoothingAlpha(dt, TAU_SIGNAL / atmoSpeed);
    const alphaSky = smoothingAlpha(dt, TAU_NEBULA / atmoSpeed);

    // Smoothed gyroscope follow, same feel as the standalone galaxy. Only the
    // galaxy reads camPos, so every other mode skips the per-frame camera work.
    if (settings.flowMode === 'galaxy') {
        const alphaGyro = smoothingAlpha(dt, TAU_GYRO / atmoSpeed);
        currentGyroOffset.x += (targetGyroOffset.x - currentGyroOffset.x) * alphaGyro;
        currentGyroOffset.y += (targetGyroOffset.y - currentGyroOffset.y) * alphaGyro;
        applyGalaxyCamera();
    }

    // Smoothing the mood. Which signal it chases is the user's choice; both are
    // in the same -1..+1 space, so everything downstream is unchanged.
    const moodTarget = pickMood(
        targetSentiment,
        indicatorRsi,
        (settings?.moodSource as MoodSource) || 'sentiment'
    );
    currentSentiment += (moodTarget - currentSentiment) * alphaSignal;

    // Smoothing market activity (rate + volume + volatility)
    const activity = computeActivity(time);
    currentActivity += (activity - currentActivity) * alphaSignal;

    const atmoEnabled = settings.enableAtmosphere;
    const sentimentAbs = Math.abs(currentSentiment);

    // === Dynamic Atmosphere ===
    if (atmoEnabled) {
      // Background color: subtle tint toward sentiment
      if (currentSentiment > 0.05) {
        targetAtmosphereColor.copy(colorBg).lerp(colorUp, Math.min(1, currentSentiment * 0.12 * atmoIntensity));
      } else if (currentSentiment < -0.05) {
        targetAtmosphereColor.copy(colorBg).lerp(colorDown, Math.min(1, sentimentAbs * 0.12 * atmoIntensity));
      } else {
        targetAtmosphereColor.copy(colorBg);
      }

      // Ambient light: shift color + intensity with sentiment AND activity
      if (ambientLight) {
        const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
        ambientLight.color.copy(colorBg).lerp(sentimentColor, Math.min(1, sentimentAbs * 0.4 * atmoIntensity));
        ambientLight.intensity = 0.3 + (sentimentAbs * 0.5 + currentActivity * 0.4) * atmoIntensity;
      }

      // Directional light: stronger with stronger sentiment AND activity
      if (dirLight) {
        const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
        dirLight.color.copy(sentimentColor);
        dirLight.intensity = 0.1 + (sentimentAbs * 0.6 + currentActivity * 0.5) * atmoIntensity;
      }

      // Sky: fade in with sentiment / activity, color follows market mood
      if (skyMaterial) {
        skyMaterial.uniforms.uTime.value = now;
        skyMaterial.uniforms.uDrift.value = atmoSpeed;
        const targetOpacity = clamp01(Math.max(sentimentAbs * 2.0, currentActivity * 1.5) * atmoIntensity);
        const curOp = skyMaterial.uniforms.uOpacity.value as number;
        skyMaterial.uniforms.uOpacity.value = curOp + (targetOpacity - curOp) * alphaSky;
        const nebulaColor = currentSentiment > 0 ? colorUp : colorDown;
        (skyMaterial.uniforms.uColorB.value as THREE.Color).lerp(nebulaColor, alphaSky);
        (skyMaterial.uniforms.uColorA.value as THREE.Color).copy(colorBg);
      }

      // Fog: denser with stronger sentiment / activity for dramatic depth
      const baseDensity = 0.008;
      const sentimentDensity = baseDensity + (sentimentAbs * 0.015 + currentActivity * 0.02) * atmoIntensity;
      if (!scene.fog) {
        scene.fog = new THREE.FogExp2(currentAtmosphereColor.getHex(), sentimentDensity);
      } else {
        const fog = scene.fog as THREE.FogExp2;
        fog.density += (sentimentDensity - fog.density) * alphaSignal;
        fog.color.copy(currentAtmosphereColor);
      }
    } else {
        targetAtmosphereColor.copy(colorBg);
        // Reset atmosphere elements when disabled
        if (ambientLight) { ambientLight.intensity = 0.15; ambientLight.color.set(0x111111); }
        if (dirLight) { dirLight.intensity = 0.1; dirLight.color.set(0x222222); }
        if (skyMaterial) {
            skyMaterial.uniforms.uTime.value = now;
            const curOp = skyMaterial.uniforms.uOpacity.value as number;
            // Exponential decay, so the fade is framerate-independent too.
            skyMaterial.uniforms.uOpacity.value = curOp * Math.exp(-dt / TAU_NEBULA_FADE);
        }
        if (scene.fog) {
            const fog = scene.fog as THREE.FogExp2;
            fog.density += (0.005 - fog.density) * alphaSignal;
            fog.color.copy(colorBg);
        }
    }

    currentAtmosphereColor.lerp(targetAtmosphereColor, alphaSignal);
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

    const galaxy = settings.flowMode === 'galaxy';
    // Match the standalone galaxy's field of view so both backgrounds frame the
    // scene identically; grid modes keep their wider view.
    camera.fov = galaxy ? GALAXY_FOV : GRID_FOV;

    // Rotate the sky with the galaxy's disc, so the atmosphere turns with it
    // instead of staying frozen while the stars spin. Grid modes stay upright.
    if (sky) {
        const rot = galaxy ? settings.galaxyFlow?.galaxyRot : undefined;
        sky.rotation.set(
            (rot?.x ?? 0) * Math.PI / 180,
            (rot?.y ?? 0) * Math.PI / 180,
            (rot?.z ?? 0) * Math.PI / 180
        );
    }

    if (galaxy) {
        applyGalaxyCamera();
        camera.updateProjectionMatrix();
        return;
    }

    camera.position.set(settings.cameraPositionX || 0, settings.cameraHeight || 20, settings.cameraDistance || 40);

    // The VisualsTab rotation sliders are labelled in degrees and send their raw
    // values, so convert here. Nullish (not falsy) so a deliberate 0 - the
    // default - is honoured instead of hiding a pitch.
    camera.rotation.set(
        (settings.cameraRotationX ?? 0) * Math.PI / 180,
        (settings.cameraRotationY ?? 0) * Math.PI / 180,
        (settings.cameraRotationZ ?? 0) * Math.PI / 180
    );
    camera.updateProjectionMatrix();
}

/**
 * Places the camera for the galaxy mode from the same `camPos` the standalone
 * galaxy uses, scaled into this larger world, plus the smoothed gyroscope
 * offset. `autoCenter` aims it at the core; otherwise it keeps a neutral
 * orientation — matching the standalone galaxy, which has no camera rotation of
 * its own (`galaxyRot` turns the disc instead).
 */
function applyGalaxyCamera(): void {
    if (!camera) return;
    const camPos = settings.galaxyFlow?.camPos ?? { x: 0, y: 2, z: 5 };
    const pos = galaxyCameraWorldPosition(camPos, currentGyroOffset, GALAXY_CAMERA_SCALE);
    camera.position.set(pos.x, pos.y, pos.z);
    if (settings.galaxyFlow?.autoCenter !== false) {
        camera.lookAt(0, 0, 0);
    } else {
        camera.rotation.set(0, 0, 0);
    }
}

/** Mirrors the standalone galaxy's driver: tilt maps to a bounded, scaled offset. */
function handleGyro(data: { alpha: number; beta: number; gamma: number }): void {
    const maxAngle = 45;
    const gx = Math.max(-maxAngle, Math.min(maxAngle, data.gamma)) / maxAngle;
    // Assumes the phone is held at roughly 45 degrees.
    const gy = Math.max(-maxAngle, Math.min(maxAngle, data.beta - 45)) / maxAngle;
    targetGyroOffset.x = gx * 2.0;
    targetGyroOffset.y = -gy * 2.0;
}

/**
 * A value three can parse as a colour: non-empty and not a CSS gradient, which
 * `Color.set` cannot read. Guards the silent-failure case in {@link updateColors}.
 * `rgb()`/`hsl()`/hex/named colours are all valid and pass.
 */
function isPlainColor(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && !/gradient\(/i.test(value);
}

function updateColors(data: ColorMessageData) {
    colorUp.set(data.colorUp);
    colorDown.set(data.colorDown);
    // three logs and *keeps the previous colour* for an unparseable string (a
    // CSS gradient among them), which would silently leave the last theme's
    // background in place — the light theme's, after switching to a dark one.
    // Fall back to black rather than retain it.
    colorBg.set(isPlainColor(data.background) ? data.background : "#000000");

    // The atmosphere sky switches blending with the theme: additive clouds wash
    // out to white on a light background, exactly like the galaxy stars would.
    if (typeof data.light === "boolean") {
        isLightTheme = data.light;
        if (skyMaterial) {
            const blending = isLightTheme ? THREE.NormalBlending : THREE.AdditiveBlending;
            if (skyMaterial.blending !== blending) {
                skyMaterial.blending = blending;
                skyMaterial.needsUpdate = true;
            }
        }
    }

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
