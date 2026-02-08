import * as THREE from 'three';
import { BaseEngine, type EngineContext } from './BaseEngine';

export class BlockEngine extends BaseEngine {
    private blockMesh: THREE.InstancedMesh | null = null;
    private fibonacciPlanes: THREE.Group | null = null;
    private priceSpine: THREE.Mesh | null = null;
    
    private readonly MAX_BLOCK_POINTS = 5000;
    private blockPrices = new Float32Array(this.MAX_BLOCK_POINTS);
    private blockTimestamps = new Float32Array(this.MAX_BLOCK_POINTS);
    private blockX = new Float32Array(this.MAX_BLOCK_POINTS);
    private blockZ = new Float32Array(this.MAX_BLOCK_POINTS);
    private blockRot = new Float32Array(this.MAX_BLOCK_POINTS);
    private blockScales = new Float32Array(this.MAX_BLOCK_POINTS);
    private nextBlockIdx = 0;
    
    private smoothMin = 0;
    private smoothMax = 100;
    
    private readonly fibLevels = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    private dummyObj = new THREE.Object3D();

    private vertexShader = `
        varying vec3 vColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vAge;
        attribute float aAge;

        void main() {
            vColor = instanceColor;
            vUv = uv;
            vAge = aAge;
            vNormal = normalize(normalMatrix * (instanceMatrix * vec4(normal, 0.0)).xyz);
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            vec4 mvPosition = modelViewMatrix * worldPosition;
            vViewPosition = -mvPosition.xyz;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    private fragmentShader = `
        varying vec3 vColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vAge;
        uniform float uTime;
        uniform float uEnhanced;

        void main() {
            vec2 centeredUv = vUv * 2.0 - 1.0;
            float dist = max(abs(centeredUv.x), abs(centeredUv.y));
            
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 1.5);
            
            // Enhanced Emissive Glow
            float glow = 0.0;
            if (uEnhanced > 0.5) {
                glow = pow(fresnel, 2.0) * 2.0;
                float pulse = 0.8 + 0.2 * sin(uTime * 4.0);
                glow *= pulse;
            }

            vec2 gridUv = vUv * 5.0;
            vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
            float gridLine = 1.0 - smoothstep(0.0, 0.08, min(grid.x, grid.y));
            float scanline = sin(vUv.y * 100.0 + uTime * 5.0) * 0.1 + 0.9;
            
            vec3 finalColor = vColor;
            finalColor += vColor * (fresnel * 2.0 + glow);
            finalColor *= (0.8 + gridLine * 0.4);
            finalColor *= scanline;
            
            // Additive Hologram Edges
            finalColor += vec3(0.5, 0.5, 0.5) * gridLine * fresnel * (1.0 + glow);
            
            float alpha = (0.4 + fresnel * 0.4 + glow * 0.2);
            if (vAge > 0.8) alpha *= (1.0 - (vAge - 0.8) / 0.2);
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    public init(): void {
        const slabGeo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
        const slabMat = new THREE.ShaderMaterial({
            uniforms: { 
                uTime: { value: 0.0 },
                uEnhanced: { value: this.context.settings.showEnhancedVisuals ? 1.0 : 0.0 }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        this.blockMesh = new THREE.InstancedMesh(slabGeo, slabMat, this.MAX_BLOCK_POINTS);
        this.blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.blockMesh.geometry.setAttribute('aAge', new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_BLOCK_POINTS), 1));
        
        for (let i = 0; i < this.MAX_BLOCK_POINTS; i++) {
            this.dummyObj.position.set(0, -9999, 0);
            this.dummyObj.updateMatrix();
            this.blockMesh.setMatrixAt(i, this.dummyObj.matrix);
            this.blockMesh.setColorAt(i, new THREE.Color(0x000000));
        }
        this.container.add(this.blockMesh);

        const accentColor = (this.context.colorUp || new THREE.Color(0x00ff88)).clone().lerp(new THREE.Color(0xffffff), 0.5);

        const spineGeo = new THREE.CylinderGeometry(0.2, 0.2, 100, 32);
        const spineMat = new THREE.MeshBasicMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        this.priceSpine = new THREE.Mesh(spineGeo, spineMat);
        this.container.add(this.priceSpine);

        this.fibonacciPlanes = new THREE.Group();
        const planeGeo = new THREE.PlaneGeometry(1, 1);
        const planeMat = new THREE.MeshBasicMaterial({
            color: accentColor,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.fibLevels.forEach(level => {
            const plane = new THREE.Mesh(planeGeo, planeMat.clone());
            plane.rotation.x = -Math.PI / 2;
            plane.userData = { ratio: level };
            this.fibonacciPlanes!.add(plane);
        });
        this.container.add(this.fibonacciPlanes);

        this.isInitialized = true;
    }

    public update(time: number, delta: number): void {
        if (!this.blockMesh || !this.fibonacciPlanes || !this.priceSpine) return;

        const now = performance.now() * 0.001;
        const s = this.context.settings;
        const duration = s.persistenceDuration || 60;
        
        const rot = time * 0.05;
        this.blockMesh.rotation.y = rot;
        this.priceSpine.rotation.y = rot;
        this.fibonacciPlanes.rotation.y = rot;

        let activeMin = Infinity;
        let activeMax = -Infinity;
        
        for (let i = 0; i < this.MAX_BLOCK_POINTS; i++) {
            const rawPrice = this.blockPrices[i];
            const age = now - this.blockTimestamps[i];
            if (rawPrice > 0 && age < duration) {
                if (rawPrice < activeMin) activeMin = rawPrice;
                if (rawPrice > activeMax) activeMax = rawPrice;
            }
        }
        
        if (activeMin === Infinity) {
            activeMin = this.smoothMin || 0;
            activeMax = this.smoothMax || 100;
        }

        let range = activeMax - activeMin;
        if (range < 0.1) range = 0.1;
        activeMin -= range * 0.05;
        activeMax += range * 0.05;

        this.smoothMin = this.smoothMin + (activeMin - this.smoothMin) * 0.05;
        this.smoothMax = this.smoothMax + (activeMax - this.smoothMax) * 0.05;

        const worldHeight = 60.0;
        const heightScale = worldHeight / (this.smoothMax - this.smoothMin);
        const sizeBase = (s.size || 0.08) * 20.0;
        const slabH = sizeBase * 0.15;
        const ageAttr = this.blockMesh.geometry.getAttribute('aAge') as THREE.BufferAttribute;

        for (let i = 0; i < this.MAX_BLOCK_POINTS; i++) {
            const rawPrice = this.blockPrices[i];
            const age = now - this.blockTimestamps[i];
            if (rawPrice > 0 && age < duration) {
                const targetY = (rawPrice - this.smoothMin) * heightScale - (worldHeight / 2.0);
                const lifePercent = age / duration;
                let currentScale = this.blockScales[i];
                if (lifePercent > 0.8) currentScale *= (1.0 - lifePercent) / 0.2;
                
                this.dummyObj.position.set(this.blockX[i], targetY, this.blockZ[i]);
                this.dummyObj.rotation.y = this.blockRot[i];
                const slabW = sizeBase * currentScale;
                this.dummyObj.scale.set(slabW, slabH, slabW);
                this.dummyObj.updateMatrix();
                this.blockMesh.setMatrixAt(i, this.dummyObj.matrix);
                if (ageAttr) ageAttr.setX(i, lifePercent);
            } else if (rawPrice > 0) {
                this.dummyObj.position.set(0, -9999, 0);
                this.dummyObj.updateMatrix();
                this.blockMesh.setMatrixAt(i, this.dummyObj.matrix);
                this.blockPrices[i] = 0;
                if (ageAttr) ageAttr.setX(i, 0);
            }
        }
        this.blockMesh.instanceMatrix.needsUpdate = true;
        if (ageAttr) ageAttr.needsUpdate = true;

        const foundationW = (s.gridWidth || 80) * 0.6;
        const foundationD = (s.gridLength || 160) * 0.6;
        this.fibonacciPlanes.children.forEach(child => {
            const plane = child as THREE.Mesh;
            const ratio = plane.userData.ratio;
            const targetY = (ratio * worldHeight) - (worldHeight / 2.0);
            plane.position.y = targetY;
            plane.scale.set(foundationW, foundationD, 1.0);
            (plane.material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(time * 2.5 + ratio * 5.0) * 0.02;
        });

        this.priceSpine.scale.y = worldHeight / 100.0;
        
        const mat = this.blockMesh.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = time;
        mat.uniforms.uEnhanced.value = s.showEnhancedVisuals ? 1.0 : 0.0;
    }

    public onTrade(trade: { type: 'buy' | 'sell', price: number, amount: number }): void {
        const idx = this.nextBlockIdx;
        const s = this.context.settings;
        const boundX = (s.gridWidth || 80) * 0.5;
        const boundZ = (s.gridLength || 160) * 0.5;
        
        const x = (Math.random() - 0.5) * boundX * 1.5;
        const z = (Math.random() - 0.5) * boundZ * 1.5;
        
        this.blockPrices[idx] = trade.price;
        this.blockTimestamps[idx] = performance.now() * 0.001;
        this.blockX[idx] = x;
        this.blockZ[idx] = z;
        this.blockRot[idx] = Math.atan2(z, x);
        this.blockScales[idx] = Math.max(Math.pow(trade.amount, 0.4) * (s.volumeScale || 1.0), 1.0);
        
        const color = trade.type === 'buy' 
            ? (this.context.colorUp || new THREE.Color(0x00ff00)) 
            : (this.context.colorDown || new THREE.Color(0xff0000));
            
        this.blockMesh!.setColorAt(idx, color);
        if (this.blockMesh!.instanceColor) this.blockMesh!.instanceColor.needsUpdate = true;
        
        this.nextBlockIdx = (this.nextBlockIdx + 1) % this.MAX_BLOCK_POINTS;
    }

    public updateThemeColors(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void {
        this.context.colorUp = colorUp;
        this.context.colorDown = colorDown;
        this.context.currentAtmosphere = atmosphere;
        
        if (this.priceSpine) {
            (this.priceSpine.material as THREE.MeshBasicMaterial).color.copy(colorUp).lerp(new THREE.Color(0xffffff), 0.5);
        }
        
        if (this.fibonacciPlanes) {
            this.fibonacciPlanes.children.forEach(child => {
                const mesh = child as THREE.Mesh;
                (mesh.material as THREE.MeshBasicMaterial).color.copy(colorUp).lerp(new THREE.Color(0xffffff), 0.5);
            });
        }
    }

    public dispose() {
        super.dispose();
        if (this.blockMesh) {
            this.blockMesh.geometry.dispose();
            (this.blockMesh.material as THREE.Material).dispose();
        }
        if (this.priceSpine) {
            this.priceSpine.geometry.dispose();
            (this.priceSpine.material as THREE.Material).dispose();
        }
        if (this.fibonacciPlanes) {
            this.fibonacciPlanes.children.forEach(child => {
                const mesh = child as THREE.Mesh;
                mesh.geometry.dispose();
                (mesh.material as THREE.Material).dispose();
            });
        }
    }
}
