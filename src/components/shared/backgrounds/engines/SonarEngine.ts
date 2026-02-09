import * as THREE from 'three';
import { BaseEngine, type EngineContext } from './BaseEngine';

// Fixed import typo
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
        uniform float uSpacing;
        uniform vec4 uSonarBlips[50];
        uniform float uSonarAngle;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;
        uniform vec3 uAtmosphere;
        varying vec3 vColor;
        varying float vHeight;
        varying float vExtra;
        varying float vScannerFade;

        void main() {
            vec3 pos = position;
            float rawX = (position.x / uSpacing) + (uGridWidth / 2.0);
            float rawZ = (position.z / uSpacing) + (uGridLength / 2.0);
            float h = 0.0;
            float maxInt = 0.0;
            float isActive = 0.0;
            
            // Initialize varying
            vScannerFade = 0.0;
            
            // 1. Radar Sweep logic (independent of trades)
            float fragAngle = atan(position.z, position.x);
            if (fragAngle < 0.0) fragAngle += 6.28318;
            
            float angleDiff = uSonarAngle - fragAngle;
            if (angleDiff < 0.0) angleDiff += 6.28318;
            
            // Sweep fade calculation: WIDER sweep (approx 90 degrees of glow)
            vScannerFade = max(0.0, 1.0 - angleDiff / 1.57); // 1.57 rad = 90 deg

            // 2. Trade Blips loop
            for(int i=0; i<50; i++) {
                float intensity = uSonarBlips[i].w;
                float tradeTime = uSonarBlips[i].z;
                float age = uTime - tradeTime;
                
                // Decay logic: trades fade over 5 seconds
                float decay = max(0.0, 1.0 - age / 5.0);
                float activeIntensity = intensity * decay;
                
                if (abs(activeIntensity) > 0.001) {
                    float dx = rawX - uSonarBlips[i].x;
                    float dz = rawZ - uSonarBlips[i].y;
                    float dist = sqrt(dx*dx + dz*dz);
                    float widthFactor = 0.5 + abs(activeIntensity) * 0.1;
                    float hill = exp(-(dist*dist) / (2.0 * widthFactor * widthFactor)) * abs(activeIntensity) * 3.0;
                    
                    if (hill > 0.1) {
                        h += hill;
                        if (abs(activeIntensity) > abs(maxInt)) {
                            maxInt = activeIntensity;
                            isActive = 1.0;
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
        varying float vScannerFade;
        uniform float uSentiment;
        uniform vec3 uColorUp;
        uniform vec3 uColorDown;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            if (length(coord) > 0.5) discard;
            
            // Scanner sweep line effect - WIDENED and boosted
            float sweepGlow = pow(vScannerFade, 2.0); // Sharpen the leading edge but keep tail
            
            // Boost visibility: higher base alpha for scan grid
            float alpha = vExtra > 0.01 ? (0.8 + vExtra * 0.2) : (0.1 + sweepGlow * 0.7);
            
            // Color logic: active trades use theme colors, scanline uses uColorUp
            vec3 color = vExtra > 0.01 ? vColor : (vColor * 0.5 + uColorUp * sweepGlow * 1.5);
            if (vExtra > 0.01 && abs(uSentiment) < 0.1) color = mix(color, vec3(1.0), 0.5); // Add brightness to neutral blips
            
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
                uSpacing: { value: (this.context.settings.spread || 1.0) * 2.0 },
                uSonarBlips: { value: this.sonarData },
                uSonarAngle: { value: 0.0 },
                uSentiment: { value: 0.0 },
                uColorUp: { value: this.context.colorUp || new THREE.Color(0x00ff88) },
                uColorDown: { value: this.context.colorDown || new THREE.Color(0xff4444) },
                uAtmosphere: { value: this.context.currentAtmosphere || new THREE.Color(0x000205) }
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
        const spacing = (this.context.settings.spread || 1.0) * 2.0;
        for (let i = 0; i < width; i++) {
            for (let j = 0; j < length; j++) {
                positions[3 * k] = (i - width * 0.5) * spacing;
                positions[3 * k + 1] = 0;
                positions[3 * k + 2] = (j - length * 0.5) * spacing;
                const baseCol = this.context.currentAtmosphere 
                    ? this.context.currentAtmosphere.clone().lerp(this.context.colorUp || new THREE.Color(0xffffff), 0.1)
                    : new THREE.Color(0x0a0c10);
                colors[3 * k] = baseCol.r;
                colors[3 * k + 1] = baseCol.g;
                colors[3 * k + 2] = baseCol.b;
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
        // Float32Array uniforms must be explicitly re-assigned or flagged to update
        this.material.uniforms.uSonarBlips.value = this.sonarData;
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
