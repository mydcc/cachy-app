import * as THREE from 'three';
import { BaseEngine, type EngineContext } from './BaseEngine';

export class SonarEngine extends BaseEngine {
    private pointCloud: THREE.Points | null = null;
    private material: THREE.ShaderMaterial | null = null;
    private sonarData: Float32Array;
    private nextSonarIdx: number = 0;
    private readonly MAX_SONAR_BLIPS = 50;

    private vertexShader = `
        uniform float uSize;
        uniform float uTime;
        uniform float uGridWidth;
        uniform float uGridLength;
        uniform vec4 uSonarBlips[50];
        uniform vec3 uAtmosphere;
        varying vec3 vColor;
        varying float vHeight;
        varying float vExtra;

        void main() {
            vec3 pos = position;
            float rawX = (position.x / 2.0) + (uGridWidth / 2.0);
            float rawZ = (position.z / 2.0) + (uGridLength / 2.0);
            float h = 0.0;
            float maxInt = 0.0;
            float isActive = 0.0;

            for(int i=0; i<50; i++) {
                float intensity = uSonarBlips[i].w;
                if (abs(intensity) > 0.001) {
                    float dx = rawX - uSonarBlips[i].x;
                    float dz = rawZ - uSonarBlips[i].y;
                    float dist = sqrt(dx*dx + dz*dz);
                    float widthFactor = 0.5 + abs(intensity) * 0.1;
                    float hill = exp(-(dist*dist) / (2.0 * widthFactor * widthFactor)) * abs(intensity) * 3.0;
                    if (hill > 0.1) {
                        h += hill;
                        float blipAngle = atan(uSonarBlips[i].y - uGridLength/2.0, uSonarBlips[i].x - uGridWidth/2.0);
                        if (blipAngle < 0.0) blipAngle += 6.28318;
                        float angleDiff = uSonarAngle - blipAngle;
                        if (angleDiff < 0.0) angleDiff += 6.28318;
                        float fade = exp(-angleDiff * 2.0);
                        float visibility = 0.1 + fade * 0.9;
                        if (abs(intensity * visibility) > abs(maxInt)) {
                            maxInt = intensity;
                            isActive = visibility;
                        }
                    }
                }
            }
            vColor = abs(maxInt) > 0.001 ? (maxInt > 0.0 ? uColorUp : uColorDown) : uAtmosphere;
            vExtra = abs(maxInt) > 0.001 ? isActive : 0.0;
            pos.y += h;
            vHeight = pos.y;
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = uSize * 2.0 * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    private fragmentShader = `
        varying vec3 vColor;
        varying float vExtra;
        uniform float uSentiment;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            
            float alpha = vExtra > 0.05 ? (0.6 + smoothstep(0.1, 1.0, vExtra) * 0.4) : 0.2;
            vec3 color = vExtra > 0.05 ? mix(vColor, vec3(1.0), vExtra * 0.5) : vColor * 0.3;
            
            // Subtle Sentiment Tint to Background
            if (vExtra < 0.05) {
                if (uSentiment > 0.1) color = mix(color, uColorUp, uSentiment * 0.2);
                else if (uSentiment < -0.1) color = mix(color, uColorDown, abs(uSentiment) * 0.2);
            }
            
            gl_FragColor = vec4(color, alpha);
        }
    `;

    constructor(context: EngineContext) {
        super(context);
        this.sonarData = new Float32Array(this.MAX_SONAR_BLIPS * 4);
    }

    public init(): void {
        const { gridWidth, gridLength, size } = this.context.settings;
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSize: { value: size * 15.0 },
                uTime: { value: 0.0 },
                uGridWidth: { value: gridWidth },
                uGridLength: { value: gridLength },
                uSonarBlips: { value: this.sonarData },
                uSonarAngle: { value: 0.0 },
                uSentiment: { value: 0.0 },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff00) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff0000) },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x000000) }
            },
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            transparent: true,
            vertexColors: false
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
        let k = 0;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                positions[3 * k] = (i / width - 0.5) * width * 2.0;
                positions[3 * k + 1] = 0;
                positions[3 * k + 2] = (j / length - 0.5) * length * 2.0;
                const baseCol = this.context.currentAtmosphere || new THREE.Color(0x1a2533);
                colors[3 * k] = baseCol.r * 0.5;
                colors[3 * k + 1] = baseCol.g * 0.5;
                colors[3 * k + 2] = baseCol.b * 0.5;
                k++;
            }
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geometry;
    }

    public update(time: number, delta: number): void {
        if (!this.material) return;
        const s = this.context.settings;
        const sweepSpeed = (s.speed || 1.0) * 0.5;
        this.material.uniforms.uSonarAngle.value = (time * sweepSpeed) % (Math.PI * 2);
        this.material.uniforms.uTime.value = time;
    }

    public onTrade(trade: { type: 'buy' | 'sell', price: number, amount: number }): void {
        const s = this.context.settings;
        const width = s.gridWidth || 80;
        const length = s.gridLength || 160;
        const volScale = s.volumeScale || 1.0;
        const tradeValue = trade.price * trade.amount;
        const absIntensity = Math.min(1.0 + Math.log10(tradeValue + 1) * 0.5 * volScale, 5.0);
        const signedIntensity = trade.type === 'buy' ? absIntensity : -absIntensity;
        const ptr = this.nextSonarIdx * 4;
        this.sonarData[ptr] = Math.floor(Math.random() * width);
        this.sonarData[ptr + 1] = Math.floor(Math.random() * length);
        this.sonarData[ptr + 2] = performance.now() * 0.001;
        this.sonarData[ptr + 3] = signedIntensity;
        this.nextSonarIdx = (this.nextSonarIdx + 1) % this.MAX_SONAR_BLIPS;
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
