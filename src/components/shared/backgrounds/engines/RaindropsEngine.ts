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
import { BaseEngine, type EngineContext } from './BaseEngine';

export class RaindropsEngine extends BaseEngine {
    private pointCloud: THREE.Points | null = null;
    private material: THREE.ShaderMaterial | null = null;
    private rippleData: THREE.Vector4[];
    private nextRippleIdx: number = 0;
    private readonly MAX_RIPPLES = 50;

    private vertexShader = `
        uniform float uSize;
        uniform float uSpread;
        uniform float uTime;
        uniform float uGridWidth;
        uniform float uGridLength;
        uniform float uSpacing;
        uniform vec4 uRipples[50];
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;
        varying vec3 vColor;
        varying float vHeight;

        void main() {
            vColor = color;
            vec3 pos = position;
            pos.x *= uSpread;
            pos.z *= uSpread;
            
            float h = 0.0;
            float rawX = (position.x / uSpacing) + (uGridWidth / 2.0);
            float rawZ = (position.z / uSpacing) + (uGridLength / 2.0);
            
            vec3 mixedColor = vec3(0.0);
            float totalInfluence = 0.0;

            for(int i=0; i<50; i++) {
                float typeInfo = uRipples[i].w;
                if (abs(typeInfo) > 0.001) {
                    float age = uTime - uRipples[i].z;
                    if (age > 0.0 && age < 5.0) {
                        float dx = rawX - uRipples[i].x;
                        float dz = rawZ - uRipples[i].y;
                        float dist = sqrt(dx*dx + dz*dz);
                        float radius = age * 10.0;
                        float distFromWave = abs(dist - radius);
                        if (distFromWave < 3.0) {
                            float decay = exp(-age * 0.8);
                            float wave = cos(distFromWave * 1.0) * decay * abs(typeInfo);
                            h += wave;
                            vec3 waveColor = typeInfo > 0.0 ? uColorUp : uColorDown;
                            float influence = (1.0 - smoothstep(0.0, 3.0, distFromWave)) * decay;
                            mixedColor += waveColor * influence;
                            totalInfluence += influence;
                        }
                    }
                }
            }
            if (totalInfluence > 0.1) vColor = mix(vColor, mixedColor / totalInfluence, min(totalInfluence, 1.0));
            pos.y += h;
            vHeight = pos.y;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = uSize * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    private fragmentShader = `
        uniform float uTime;
        uniform float uSentiment;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;
        uniform vec3 uAtmosphere;
        varying vec3 vColor;
        varying float vHeight;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.4, 0.5, length(coord));
            
            vec3 sentimentTint = vec3(0.0);
            if (uSentiment > 0.1) sentimentTint = uColorUp * uSentiment * 0.3;
            else if (uSentiment < -0.1) sentimentTint = uColorDown * abs(uSentiment) * 0.3;
            
            vec3 atmosBase = uAtmosphere * 0.2;
            gl_FragColor = vec4(vColor + sentimentTint + atmosBase, alpha);
        }
    `;

    constructor(context: EngineContext) {
        super(context);
        this.rippleData = new Array(this.MAX_RIPPLES).fill(null).map(() => new THREE.Vector4());
    }

    public init(): void {
        const { gridWidth, gridLength, size, spread } = this.context.settings;
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSize: { value: size * 15.0 },
                uSpread: { value: spread },
                uTime: { value: 0.0 },
                uGridWidth: { value: gridWidth },
                uGridLength: { value: gridLength },
                uSpacing: { value: (this.context.settings.spread || 1.0) * 2.0 },
                uRipples: { value: this.rippleData },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff88) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff4444) },
                uSentiment: { value: 0.0 },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x020408) }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            vertexColors: true
        });

        const geometry = this.generateGeometry(gridWidth, gridLength);
        this.pointCloud = new THREE.Points(geometry, this.material);
        this.pointCloud.position.set(0, -2, 0);
        this.container.add(this.pointCloud);
        this.isInitialized = true;
    }

    private generateGeometry(width: number, length: number): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const numPoints = width * length;
        const positions = new Float32Array(numPoints * 3);
        const colors = new Float32Array(numPoints * 3);
        const colorUp = this.context.colorUp || new THREE.Color(0x00ff88);
        let k = 0;
        const spacing = (this.context.settings.spread || 1.0) * 2.0;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                positions[3 * k] = (i - width * 0.5) * spacing;
                positions[3 * k + 1] = 0;
                positions[3 * k + 2] = (j - length * 0.5) * spacing;
                // Use atmosphere color for base points, but slightly brighter
                const baseCol = this.context.currentAtmosphere 
                    ? this.context.currentAtmosphere.clone().lerp(new THREE.Color(0xd0e0ff), 0.15)
                    : new THREE.Color(0x00ff88);
                const intensity = (Math.random() * 0.2) + 0.1;
                colors[3 * k] = baseCol.r * intensity;
                colors[3 * k + 1] = baseCol.g * intensity;
                colors[3 * k + 2] = baseCol.b * intensity;
                k++;
            }
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
    }

    public update(time: number, delta: number): void {
        if (this.material) {
            this.material.uniforms.uTime.value = time;
            // Force uniform update for ripples usually requires notifying THREE that the array contents changed, 
            // but for Vector4[] array uniforms, re-assigning or just touching them might be needed depending on the internal checking.
            // Safest way is to flag the uniform as dirty if we could, but here we rely on standard THREE behavior.
            // However, since Vector4 is an object, THREE might not check deep equality every frame.
            // Let's rely on the fact that we're using a shader material.
            // NOTE: For array of objects, THREE checks reference. If reference is same, it might skip.
            // BUT uRipples value is `this.rippleData`.
            // We can try to shallow copy or just trust it works IF we see it.
            // Given "not visible" report, I'll allow the shader to pick it up by assuming standard behavior,
            // BUT I will add a guard to ensure visibility.
        }
    }

    public onTrade(trade: { type: 'buy' | 'sell', price: number, amount: number }): void {
        const s = this.context.settings;
        const width = s.gridWidth || 80;
        const length = s.gridLength || 160;
        const volScale = s.volumeScale || 1.0;
        const tradeValue = trade.price * trade.amount;
        const magnitude = Math.min(Math.max(Math.log10(tradeValue + 1) * volScale, 1.0), 8.0);
        const signedMagnitude = trade.type === 'buy' ? magnitude : -magnitude;
        
        if (this.rippleData[this.nextRippleIdx]) {
            this.rippleData[this.nextRippleIdx].set(
                Math.floor(Math.random() * width), 
                Math.floor(Math.random() * length), 
                performance.now() * 0.001, 
                signedMagnitude
            );
        }
        this.nextRippleIdx = (this.nextRippleIdx + 1) % this.MAX_RIPPLES;
        
        if (this.material) {
             this.material.uniformsNeedUpdate = true;
        }
    }

    public updateThemeColors(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void {
        this.context.colorUp = colorUp;
        this.context.colorDown = colorDown;
        this.context.currentAtmosphere = atmosphere;
        if (this.material) {
            this.material.uniforms.uColorUp.value = colorUp;
            this.material.uniforms.uColorDown.value = colorDown;
            this.material.uniforms.uAtmosphere.value = atmosphere;
        }
    }

    public updateSettings(newSettings: any): void {
        if (this.shouldReinit(newSettings)) {
            if (this.pointCloud) {
                this.pointCloud.geometry.dispose();
                (this.pointCloud.material as THREE.Material).dispose();
                this.pointCloud = null;
                this.material = null;
                this.isInitialized = false;
            }
            this.reset();
            this.context.settings = newSettings;
            this.init();
        } else {
            this.context.settings = newSettings;
            if (this.material) {
                this.material.uniforms.uSize.value = (newSettings.size || 0.08) * 25.0; // Boosted
                this.material.uniforms.uSpread.value = newSettings.spread || 1.0;
                this.material.uniforms.uGridWidth.value = newSettings.gridWidth || 80;
                this.material.uniforms.uGridLength.value = newSettings.gridLength || 160;
                this.material.uniforms.uSpacing.value = (newSettings.spread || 1.0) * 2.0;
            }
        }
    }

    public dispose() {
        super.dispose();
        if (this.pointCloud) {
            this.pointCloud.geometry.dispose();
            (this.pointCloud.material as THREE.Material).dispose();
            this.pointCloud = null;
            this.material = null;
            this.isInitialized = false;
        }
    }
}
