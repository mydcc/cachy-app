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

export class StarDustEngine extends BaseEngine {
    private starDustPoints: THREE.Points | null = null;
    private starDustGeometry: THREE.BufferGeometry | null = null;
    private starDustMaterial: THREE.PointsMaterial | null = null;

    public init(): void {
        this.generate();
        this.isInitialized = true;
    }

    public generate(): void {
        if (this.starDustPoints) {
            this.starDustGeometry?.dispose();
            this.starDustMaterial?.dispose();
            this.container.remove(this.starDustPoints);
        }

        const count = 3000;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const radius = 10 + Math.random() * 40;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i3 + 2] = radius * Math.cos(phi);

            sizes[i] = Math.random() * 2;
        }

        this.starDustGeometry = new THREE.BufferGeometry();
        this.starDustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        this.starDustMaterial = new THREE.PointsMaterial({
            size: 0.1,
            color: "#ffffff",
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.starDustPoints = new THREE.Points(this.starDustGeometry, this.starDustMaterial);
        this.container.add(this.starDustPoints);
    }

    public update(time: number, delta: number): void {
        // StarDust implementation
    }
    
    public updateColor(color: THREE.Color) {
        if (this.starDustMaterial) {
            this.starDustMaterial.color.copy(color);
        }
    }

    public dispose() {
        super.dispose();
        if (this.starDustPoints) {
            this.starDustGeometry?.dispose();
            this.starDustMaterial?.dispose();
        }
    }
}
