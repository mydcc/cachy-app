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
        uniform float uSentiment;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;
        uniform vec3 uAtmosphere;

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewPosition);
            float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
            
            vec2 gridUv = vUv * 4.0;
            vec2 grid = abs(fract(gridUv - 0.5) - 0.5) / fwidth(gridUv);
            float gridLine = 1.0 - smoothstep(0.0, 0.05, min(grid.x, grid.y));
            
            float scanline = sin(vUv.y * 50.0 + uTime * 3.0) * 0.1 + 0.9;
            float scanner = smoothstep(0.45, 0.5, sin(vUv.y * 2.0 - uTime * 0.5)) * 
                          (1.0 - smoothstep(0.5, 0.55, sin(vUv.y * 2.0 - uTime * 0.5)));
            
            // Sentiment Color Shift
            vec3 atmosColor = uAtmosphere;
            if (uSentiment > 0.1) {
                atmosColor = mix(atmosColor, uColorUp, uSentiment * 0.5);
            } else if (uSentiment < -0.1) {
                atmosColor = mix(atmosColor, uColorDown, abs(uSentiment) * 0.5);
            }

            vec3 finalColor = vInstanceColor * (0.6 + fresnel * 0.4);
            finalColor += atmosColor * (gridLine * 0.5 + scanner * 2.0);
            finalColor *= scanline;
            
            gl_FragColor = vec4(finalColor, 0.7 + scanner * 0.3);
        }
    `;

    public init(): void {
        const { gridWidth, gridLength } = this.context.settings;
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uSentiment: { value: 0.0 },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff00) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff0000) },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x000000) }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.cityMesh = new THREE.InstancedMesh(geometry, material, gridWidth * gridLength);
        this.cityMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        
        // Initialize instances
        let k = 0;
        for (let i = 0; i < gridWidth; i++) {
            for (let j = 0; j < gridLength; j++) {
                this.dummyObj.position.set((i / gridWidth - 0.5) * gridWidth * 2.5, 0, (j / gridLength - 0.5) * gridLength * 2.5);
                this.dummyObj.scale.set(1.5, 0.1, 1.5);
                this.dummyObj.updateMatrix();
                this.cityMesh.setMatrixAt(k, this.dummyObj.matrix);
                this.cityMesh.setColorAt(k, new THREE.Color(0x2d3436));
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
        const colorUp = this.context.colorUp || new THREE.Color(0x00ff00);
        const colorDown = this.context.colorDown || new THREE.Color(0xff0000);

        for (const [idx, data] of this.buildings) {
            data.height += (data.targetHeight - data.height) * 0.1;
            data.targetHeight *= 0.98; // Decay
            
            if (data.height < 0.15) {
                this.buildings.delete(idx);
                data.height = 0.1;
            }

            const i = Math.floor(idx / length);
            const j = idx % length;
            this.dummyObj.position.set((i / width - 0.5) * width * 2.5, data.height / 2, (j / length - 0.5) * length * 2.5);
            this.dummyObj.scale.set(1.5, data.height, 1.5);
            this.dummyObj.updateMatrix();
            this.cityMesh.setMatrixAt(idx, this.dummyObj.matrix);
            
            this._tempColor.set(0x2d3436).lerp(data.targetHeight > 5 ? colorUp : colorDown, Math.min(data.height / 20, 1));
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
        
        const data = this.buildings.get(idx) || { height: 0.1, targetHeight: 0.1 };
        data.targetHeight += Math.log10(tradeValue + 1) * 2.0 * volScale;
        data.targetHeight = Math.min(data.targetHeight, 50.0);
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

    public dispose() {
        super.dispose();
        if (this.cityMesh) {
            this.cityMesh.geometry.dispose();
            (this.cityMesh.material as THREE.Material).dispose();
        }
    }
}
