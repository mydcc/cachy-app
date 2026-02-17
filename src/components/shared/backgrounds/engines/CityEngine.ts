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

export class CityEngine extends BaseEngine {
    private cityMesh: THREE.InstancedMesh | null = null;
    private buildings = new Map<number, { height: number, targetHeight: number }>();
    private dummyObj = new THREE.Object3D();
    private _tempColor = new THREE.Color();

    private vertexShader = `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vInstanceColor;

        void main() {
            vUv = uv;
            vInstanceColor = instanceColor;
            vNormal = normalize(normalMatrix * (instanceMatrix * vec4(normal, 0.0)).xyz);
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            vec4 mvPosition = modelViewMatrix * worldPosition;
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    private fragmentShader = `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vInstanceColor;
        uniform float uTime;

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            
            // Simple lighting to give cubes some shape without being "overly fancy"
            float diff = max(dot(normal, vec3(0.5, 1.0, 0.5)), 0.0);
            float ambient = 0.4;
            
            vec3 finalColor = vInstanceColor * (ambient + diff * 0.6);
            
            // Add a very subtle rim light to keep it crisp
            float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 3.0);
            finalColor += vInstanceColor * fresnel * 0.5;

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `;

    public init(): void {
        const { gridWidth, gridLength } = this.context.settings;
        const width = gridWidth || 80;
        const length = gridLength || 160;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: false,
            depthWrite: true,
            blending: THREE.NormalBlending
        });

        this.cityMesh = new THREE.InstancedMesh(geometry, material, width * length);
        this.cityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        const baseColor = this.context.currentAtmosphere 
            ? this.context.currentAtmosphere.clone().multiplyScalar(0.2) 
            : new THREE.Color(0x050a0f);

        // Initialize instances
        let k = 0;
        const spacing = (this.context.settings.spread || 1.0) * 2.5;
        const baseSize = (this.context.settings.size || 0.08) * 18.0;
        
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                this.dummyObj.position.set((i - width * 0.5) * spacing, 0, (j - length * 0.5) * spacing);
                this.dummyObj.scale.set(baseSize, 0.1, baseSize); // Use size setting
                this.dummyObj.updateMatrix();
                this.cityMesh.setMatrixAt(k, this.dummyObj.matrix);
                this.cityMesh.setColorAt(k, baseColor);
                k++;
            }
        }
        this.container.add(this.cityMesh);
        this.isInitialized = true;
    }

    public update(time: number, delta: number): void {
        if (!this.cityMesh) return;

        const s = this.context.settings;
        const width = s.gridWidth || 80;
        const length = s.gridLength || 160;
        const colorUp = this.context.colorUp || new THREE.Color(0x00ff88);
        const colorDown = this.context.colorDown || new THREE.Color(0xff4444);
        
        const baseColor = this.context.currentAtmosphere 
            ? this.context.currentAtmosphere.clone().multiplyScalar(0.2) 
            : new THREE.Color(0x050a0f);

        for (const [idx, data] of this.buildings) {
            const tradeType = (data as any).type === 'buy' ? 1 : -1;
            data.height += (data.targetHeight - data.height) * 0.15; // Snappy growth
            data.targetHeight *= 0.98; // Decay
            
            const i = Math.floor(idx / length);
            const j = idx % length;
            const spacing = (s.spread || 1.0) * 2.5;
            const baseSize = (s.size || 0.08) * 18.0;

            // Cleanup check
            if (data.height < 0.1 && data.targetHeight < 0.1) {
                this.dummyObj.position.set((i - width * 0.5) * spacing, 0, (j - length * 0.5) * spacing);
                this.dummyObj.scale.set(baseSize, 0.1, baseSize);
                this.dummyObj.updateMatrix();
                this.cityMesh.setMatrixAt(idx, this.dummyObj.matrix);
                this.cityMesh.setColorAt(idx, baseColor);
                this.buildings.delete(idx);
                continue;
            }

            this.dummyObj.position.set((i - width * 0.5) * spacing, data.height / 2, (j - length * 0.5) * spacing);
            this.dummyObj.scale.set(baseSize, data.height, baseSize);
            this.dummyObj.updateMatrix();
            this.cityMesh.setMatrixAt(idx, this.dummyObj.matrix);
            
            // Use binary choice for color + small lerp for intensity to match neon look
            const targetCol = data.targetHeight > 0 ? (tradeType > 0 ? colorUp : colorDown) : baseColor;
            this._tempColor.copy(baseColor).lerp(targetCol, Math.min(data.height / 2, 1.0));
            this.cityMesh.setColorAt(idx, this._tempColor);
        }
        
        this.cityMesh.instanceMatrix.needsUpdate = true;
        if (this.cityMesh.instanceColor) this.cityMesh.instanceColor.needsUpdate = true;
        (this.cityMesh.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    }

    public onTrade(trade: { type: 'buy' | 'sell', price: number, amount: number }): void {
        const s = this.context.settings;
        const width = s.gridWidth || 80;
        const length = s.gridLength || 160;
        const tradeValue = trade.price * trade.amount;
        const volScale = s.volumeScale || 1.0;
        
        const rx = Math.floor(Math.random() * width);
        const rz = Math.floor(Math.random() * length);
        const idx = rx * length + rz;
        
        // Ensure we handle existing buildings correctly
        const data = this.buildings.get(idx) || { height: 0.1, targetHeight: 0.1, type: trade.type };
        data.targetHeight += Math.log10(tradeValue + 1) * 3.0 * volScale;
        data.targetHeight = Math.min(data.targetHeight, 50.0);
        (data as any).type = trade.type; // Store last trade type for color
        this.buildings.set(idx, data);
    }

    public updateThemeColors(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void {
        this.context.colorUp = colorUp;
        this.context.colorDown = colorDown;
        this.context.currentAtmosphere = atmosphere;
        if (this.cityMesh && (this.cityMesh.material as THREE.ShaderMaterial).uniforms) {
            const mat = this.cityMesh.material as THREE.ShaderMaterial;
            mat.uniforms.uColorUp.value = colorUp;
            mat.uniforms.uColorDown.value = colorDown;
            mat.uniforms.uAtmosphere.value = atmosphere;
        }
    }

    public updateSettings(newSettings: any): void {
        if (this.shouldReinit(newSettings)) {
            if (this.cityMesh) {
                this.cityMesh.geometry.dispose();
                (this.cityMesh.material as THREE.Material).dispose();
                this.cityMesh = null;
                this.buildings.clear();
                this.isInitialized = false;
            }
            this.reset();
            this.context.settings = newSettings;
            this.init();
        } else {
            this.context.settings = newSettings;
        }
    }

    public dispose() {
        super.dispose();
        if (this.cityMesh) {
            this.cityMesh.geometry.dispose();
            (this.cityMesh.material as THREE.Material).dispose();
            this.cityMesh = null;
            this.buildings.clear();
            this.isInitialized = false;
        }
    }
}
