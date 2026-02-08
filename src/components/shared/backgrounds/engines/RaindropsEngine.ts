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
            float rawX = (position.x / 2.0) + (uGridWidth / 2.0);
            float rawZ = (position.z / 2.0) + (uGridLength / 2.0);
            
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
            gl_Position = projectionMatrix * viewPosition;
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
                uRipples: { value: this.rippleData },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff00) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff0000) },
                uSentiment: { value: 0.0 },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x000000) }
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
        const colorUp = this.context.colorUp || new THREE.Color(0x00ff00);
        let k = 0;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                positions[3 * k] = (i / width - 0.5) * width * 2.0;
                positions[3 * k + 1] = 0;
                positions[3 * k + 2] = (j / length - 0.5) * length * 2.0;
                const baseCol = this.context.currentAtmosphere || new THREE.Color(0x00ff88);
                const intensity = (Math.random() * 0.1) + 0.1;
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
        if (this.material) this.material.uniforms.uTime.value = time;
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
