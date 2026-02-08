import * as THREE from 'three';
import { BaseEngine, type EngineContext } from './BaseEngine';

export class EqualizerEngine extends BaseEngine {
    private pointCloud: THREE.Points | null = null;
    private material: THREE.ShaderMaterial | null = null;
    private activeSplashes = new Map<number, { amount: number, expiresAt: number, colorValue: number }[]>();
    
    private vertexShader = `
        uniform float uSize;
        uniform float uSpread;
        attribute float amplitude;
        varying vec3 vColor;
        varying float vHeight;

        void main() {
            vColor = color;
            vec3 pos = position;
            pos.x *= uSpread;
            pos.z *= uSpread;
            float h = amplitude * 5.0;
            pos.y += h;
            vHeight = pos.y;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = uSize * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    private fragmentShader = `
        uniform vec3 uAtmosphere;
        uniform float uTime;
        uniform float uSentiment;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;
        varying vec3 vColor;
        varying float vHeight;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            float alpha = 1.0 - smoothstep(0.4, 0.5, length(coord));
            
            float sentimentIntensity = abs(uSentiment);
            float pulse = 1.0 + sin(uTime * (2.0 + sentimentIntensity * 4.0)) * 0.3 * sentimentIntensity;
            
            vec3 atmos = vec3(0.0);
            if (uSentiment > 0.05) {
                float hFactor = smoothstep(-2.0, 15.0, vHeight);
                atmos = uColorUp * sentimentIntensity * hFactor * 0.6;
            } else if (uSentiment < -0.05) {
                float hFactor = 1.0 - smoothstep(-2.0, 8.0, vHeight);
                atmos = uColorDown * sentimentIntensity * hFactor * 0.6;
            }
            
            vec3 finalColor = vColor + atmos * pulse + uAtmosphere * 0.1;
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    public init(): void {
        const { gridWidth, gridLength, size, spread } = this.context.settings;
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSize: { value: size * 15.0 },
                uSpread: { value: spread },
                uTime: { value: 0.0 },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x000000) },
                uSentiment: { value: 0.0 },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff00) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff0000) }
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
        const amplitudes = new Float32Array(numPoints);
        const colorUp = this.context.colorUp || new THREE.Color(0x00ff00);

        let k = 0;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                positions[3 * k] = (i / width - 0.5) * width * 2.0;
                positions[3 * k + 1] = 0;
                positions[3 * k + 2] = (j / length - 0.5) * length * 2.0;
                const intensity = (Math.random() * 0.1) + 0.1;
                colors[3 * k] = colorUp.r * intensity;
                colors[3 * k + 1] = colorUp.g * intensity;
                colors[3 * k + 2] = colorUp.b * intensity;
                amplitudes[k] = 0.0;
                k++;
            }
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('amplitude', new THREE.BufferAttribute(amplitudes, 1));
        return geometry;
    }

    public update(time: number, delta: number): void {
        if (!this.pointCloud || !this.material) return;

        const attr = this.pointCloud.geometry.getAttribute('amplitude') as THREE.BufferAttribute;
        let needsUpdate = false;

        for (const [idx, splashes] of this.activeSplashes) {
            const validSplashes = splashes.filter(sp => sp.expiresAt > time);
            if (validSplashes.length < splashes.length) {
                if (validSplashes.length === 0) {
                    this.activeSplashes.delete(idx);
                    attr.setX(idx, 0);
                } else {
                    this.activeSplashes.set(idx, validSplashes);
                }
                needsUpdate = true;
            }

            if (validSplashes.length > 0) {
                let total = 0;
                for (const sp of validSplashes) total += sp.amount;
                attr.setX(idx, Math.min(total, 15.0));
                needsUpdate = true;
            }
        }

        if (needsUpdate) attr.needsUpdate = true;
        this.material.uniforms.uTime.value = time;
    }

    public onTrade(trade: { type: 'buy' | 'sell', price: number, amount: number }): void {
        const s = this.context.settings;
        const width = s.gridWidth || 80;
        const length = s.gridLength || 160;
        const tradeValue = trade.price * trade.amount;
        const volScale = s.volumeScale || 1.0;
        let intensity = Math.min(volScale * (0.5 + Math.log10(tradeValue + 1)), 5.0);
        const splashCount = Math.max(1, Math.floor(Math.log10(tradeValue + 1) * 3));
        const now = performance.now() * 0.001;
        const expiresAt = now + (s.persistenceDuration || 60);

        for (let k = 0; k < splashCount; k++) {
            const rx = Math.floor(Math.random() * width);
            const rz = Math.floor(Math.random() * length);
            const idx = rx * length + rz;

            if (idx < (width * length)) {
                const current = this.activeSplashes.get(idx) || [];
                current.push({ amount: intensity, expiresAt, colorValue: trade.type === 'buy' ? 1 : 0 });
                this.activeSplashes.set(idx, current);

                if (this.pointCloud) {
                    const color = trade.type === 'buy' 
                        ? (this.context.colorUp || new THREE.Color(0x00ff00)) 
                        : (this.context.colorDown || new THREE.Color(0xff0000));
                    const attrColor = this.pointCloud.geometry.getAttribute('color') as THREE.BufferAttribute;
                    const attrAmp = this.pointCloud.geometry.getAttribute('amplitude') as THREE.BufferAttribute;
                    attrColor.setXYZ(idx, color.r, color.g, color.b);
                    attrColor.needsUpdate = true;
                    let total = 0;
                    for (const sp of current) total += sp.amount;
                    attrAmp.setX(idx, Math.min(total, 15.0));
                    attrAmp.needsUpdate = true;
                }
            }
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

    public dispose() {
        super.dispose();
        if (this.pointCloud) {
            this.pointCloud.geometry.dispose();
            (this.pointCloud.material as THREE.Material).dispose();
        }
    }
}
