import * as THREE from 'three';
import { GalaxyEngine } from './engines/GalaxyEngine';
import { StarDustEngine } from './engines/StarDustEngine';
import type { EngineContext } from './engines/BaseEngine';

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let galaxyEngine: GalaxyEngine;
let starDustEngine: StarDustEngine;
let settings: any;
let isInitialized = false;

// Color state
let colors = {
    inside: new THREE.Color(),
    out1: new THREE.Color(),
    out2: new THREE.Color(),
    out3: new THREE.Color(),
    blending: THREE.AdditiveBlending,
    cutoff: 0.2
};

self.onmessage = (e: MessageEvent) => {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            init(data);
            break;
        case 'resize':
            resize(data);
            break;
        case 'updateSettings':
            updateSettings(data);
            break;
        case 'updateColors':
            updateColors(data);
            break;
        case 'generate':
            if (galaxyEngine) galaxyEngine.generate();
            break;
    }
};

function init(data: any) {
    const { canvas, width, height, pixelRatio, settings: initSettings } = data;
    settings = initSettings;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    const { camPos } = settings;
    camera.position.set(camPos?.x ?? 0, camPos?.y ?? 2, camPos?.z ?? 5);
    
    if (settings.autoCenter !== false) {
        camera.lookAt(0, 0, 0);
    }

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "default"
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    const context: EngineContext = {
        scene,
        camera,
        renderer,
        settings
    };

    galaxyEngine = new GalaxyEngine(context);
    starDustEngine = new StarDustEngine(context);

    galaxyEngine.init();
    starDustEngine.init();

    isInitialized = true;
    requestAnimationFrame(animate);
}

function animate(time: number) {
    if (!isInitialized) return;
    requestAnimationFrame(animate);

    const t = time * 0.001;
    galaxyEngine?.update(t, 0.016);
    starDustEngine?.update(t, 0.016);

    renderer.render(scene, camera);
}

function resize(data: any) {
    const { width, height, pixelRatio } = data;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(pixelRatio);
}

function updateSettings(data: any) {
    settings = data.settings;
    if (galaxyEngine) galaxyEngine.updateSettings(settings);
    if (camera && settings.camPos) {
        camera.position.set(settings.camPos.x, settings.camPos.y, settings.camPos.z);
        if (settings.autoCenter !== false) {
            camera.lookAt(0, 0, 0);
        }
    }
}

function updateColors(data: any) {
    const { inside, out1, out2, out3, blending, cutoff } = data;
    colors.inside.set(inside);
    colors.out1.set(out1);
    colors.out2.set(out2);
    colors.out3.set(out3);
    colors.blending = blending;
    colors.cutoff = cutoff;

    if (galaxyEngine) {
        galaxyEngine.updateColors(colors.inside, colors.out1, colors.out2, colors.out3, colors.blending, colors.cutoff);
    }
    
    // StarDust gets the inside core color but at very low opacity
    if (starDustEngine) {
        starDustEngine.updateColor(colors.inside);
    }
}
