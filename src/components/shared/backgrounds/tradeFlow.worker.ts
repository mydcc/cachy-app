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

const colorUp = new THREE.Color(0x00ff88);
const colorDown = new THREE.Color(0xff4444);
const colorBg = new THREE.Color(0x000000);

let targetSentiment = 0;
let currentSentiment = 0;

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
        case 'updateColors':
            updateColors(data.colorUp, data.colorDown, data.background);
            break;
        case 'onTrade':
            onTrade(data);
            break;
        case 'switchMode':
            switchMode(data.mode);
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

    updateCamera();
    switchMode(settings.flowMode);
    
    requestAnimationFrame(animate);
}

function animate(time: number) {
    const now = time * 0.001;
    
    // Smoothing Sentiment
    currentSentiment = currentSentiment + (targetSentiment - currentSentiment) * 0.02;

    if (activeEngine) {
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
