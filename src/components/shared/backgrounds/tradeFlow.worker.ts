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

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let activeEngine: BaseEngine | null = null;
let settings: any;

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

function init(canvas: OffscreenCanvas, width: number, height: number, pixelRatio: number, initialSettings: any) {
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

function updateSentimentUniforms() {
    scene.traverse((obj) => {
        if ((obj as any).material && (obj as any).material.uniforms && (obj as any).material.uniforms.uSentiment) {
            (obj as any).material.uniforms.uSentiment.value = currentSentiment;
        }
    });
}

function resize(width: number, height: number) {
    if (!camera || !renderer) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

function updateSettings(newSettings: any) {
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

function switchMode(mode: string) {
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

function onTrade(data: any) {
    if (data.sentiment !== undefined) {
        targetSentiment = data.sentiment;
    }
    activeEngine?.onTrade?.(data.trade);
}
