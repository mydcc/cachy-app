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
import { type BaseEngine, type EngineContext } from './engines/BaseEngine';
import { VolumeNormalizer } from './engines/volumeScale';

// Camera/mode fields this worker itself reads; each engine also reads its
// own settings (gridWidth, spread, size, ...) via BaseEngine's generic
// `settings: any` context field, which this passes through unchanged.
interface FlowSettings {
    flowMode?: string;
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
            updateColors(data.colorUp, data.colorDown, data.background);
            break;
        case 'onTrade':
            onTrade(data);
            break;
        case 'switchMode':
            switchMode(data.mode);
            break;
        case 'resetVolume':
            // Symbol changed: drop the old symbol's notionals from the
            // calibration window so sizes re-learn for the new market.
            volumeNormalizer.reset();
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

function animate(time: number) {
    const now = time * 0.001;
    
    // Smoothing Sentiment
    currentSentiment = currentSentiment + (targetSentiment - currentSentiment) * 0.02;

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

        // Ambient light: shift color + intensity with sentiment
        if (ambientLight) {
            const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
            ambientLight.color.copy(colorBg).lerp(sentimentColor, sentimentAbs * 0.4);
            ambientLight.intensity = 0.3 + sentimentAbs * 0.5;
        }

        // Directional light: stronger with stronger sentiment
        if (dirLight) {
            const sentimentColor = currentSentiment > 0 ? colorUp : colorDown;
            dirLight.color.copy(sentimentColor);
            dirLight.intensity = 0.1 + sentimentAbs * 0.6;
        }

        // Nebula: fade in with sentiment, color follows market mood
        if (nebulaMaterial) {
            nebulaMaterial.uniforms.uTime.value = now;
            const targetOpacity = Math.min(sentimentAbs * 2.0, 1.0);
            const curOp = nebulaMaterial.uniforms.uOpacity.value as number;
            nebulaMaterial.uniforms.uOpacity.value = curOp + (targetOpacity - curOp) * 0.03;
            const nebulaColor = currentSentiment > 0 ? colorUp : colorDown;
            (nebulaMaterial.uniforms.uColor.value as THREE.Color).lerp(nebulaColor, 0.02);
        }

        // Fog: denser with stronger sentiment for dramatic depth
        const baseDensity = 0.008;
        const sentimentDensity = baseDensity + sentimentAbs * 0.015;
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
        activeEngine.update(now, 0.016);
        updateSentimentUniforms();
    }
    
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

interface ObjectWithSentimentUniform {
    material?: { uniforms?: { uSentiment?: { value: number } } };
}

function updateSentimentUniforms() {
    scene.traverse((obj) => {
        const uniforms = (obj as unknown as ObjectWithSentimentUniform).material?.uniforms;
        if (uniforms?.uSentiment) {
            uniforms.uSentiment.value = currentSentiment;
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
    camera.rotation.set(settings.cameraRotationX || -0.5, settings.cameraRotationY || 0, settings.cameraRotationZ || 0);
    camera.updateProjectionMatrix();
}

function updateColors(up: string, down: string, bg: string) {
    colorUp.set(up);
    colorDown.set(down);
    colorBg.set(bg);

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
    }

    if (activeEngine) activeEngine.init();
}

function onTrade(data: TradeEventData) {
    if (data.sentiment !== undefined) {
        targetSentiment = data.sentiment;
    }
    activeEngine?.onTrade?.(data.trade);
}
