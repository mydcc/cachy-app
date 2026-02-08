import * as THREE from 'three';
import { BaseEngine, type EngineContext } from './BaseEngine';

export class GalaxyEngine extends BaseEngine {
    private galaxyPoints: THREE.Points | null = null;
    private galaxyGeometry: THREE.BufferGeometry | null = null;
    private galaxyMaterial: THREE.ShaderMaterial | null = null;

    // Color Lerping
    private targetColors = {
        inside: new THREE.Color(),
        out1: new THREE.Color(),
        out2: new THREE.Color(),
        out3: new THREE.Color()
    };
    private currentColors = {
        inside: new THREE.Color(),
        out1: new THREE.Color(),
        out2: new THREE.Color(),
        out3: new THREE.Color()
    };
    private lerpAlpha = 0.05;

    public init(): void {
        this.generate();
        this.isInitialized = true;
    }

    public generate(): void {
        const s = this.context.settings;
        const {
            particleCount,
            particleSize,
            radius,
            branches,
            spin,
            randomness,
            randomnessPower,
            concentrationPower,
            rotationSpeed,
        } = s;

        if (this.galaxyPoints) {
            this.galaxyGeometry?.dispose();
            this.galaxyMaterial?.dispose();
            this.container.remove(this.galaxyPoints);
        }

        const positions = new Float32Array(particleCount * 3);
        const randoms = new Float32Array(particleCount * 3);
        const scales = new Float32Array(particleCount);
        const colorMixs = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            randoms[i3] = (Math.random() - 0.5) * 2 * randomness;
            randoms[i3 + 1] = (Math.random() - 0.5) * 2 * randomness;
            randoms[i3 + 2] = (Math.random() - 0.5) * 2 * randomness;
            scales[i] = Math.random();
            positions[i3] = positions[i3 + 1] = positions[i3 + 2] = 0;
            colorMixs[i] = Math.random();
        }

        this.galaxyGeometry = new THREE.BufferGeometry();
        this.galaxyGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        this.galaxyGeometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 3));
        this.galaxyGeometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
        this.galaxyGeometry.setAttribute("aColorMix", new THREE.BufferAttribute(colorMixs, 1));

        this.galaxyMaterial = new THREE.ShaderMaterial({
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: particleSize },
                uPixelRatio: { value: this.context.renderer.getPixelRatio() },
                uColorInside: { value: this.currentColors.inside },
                uColorOutside: { value: this.currentColors.out1 },
                uColorOutside2: { value: this.currentColors.out2 },
                uColorOutside3: { value: this.currentColors.out3 },
                uRadius: { value: radius },
                uBranches: { value: branches },
                uSpinSpeed: { value: spin },
                uRandomnessPower: { value: randomnessPower },
                uConcentrationPower: { value: concentrationPower },
                uRotationSpeed: { value: rotationSpeed },
                uAlphaCutoff: { value: 0.2 },
                uParticleCount: { value: particleCount }
            },
            vertexShader: `
                precision mediump float;
                uniform float uTime;
                uniform float uSize;
                uniform float uPixelRatio;
                uniform float uRadius;
                uniform float uBranches;
                uniform float uSpinSpeed;
                uniform float uRandomnessPower;
                uniform float uConcentrationPower;
                uniform float uRotationSpeed;
                uniform float uParticleCount;
                uniform vec3 uColorOutside;
                uniform vec3 uColorOutside2;
                uniform vec3 uColorOutside3;

                attribute vec3 aRandom;
                attribute float aScale;
                attribute float aColorMix;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;

                #define PI 3.14159265359

                void main() {
                    float particleId = float(gl_VertexID);
                    float radiusRatio = fract(particleId / uParticleCount);
                    float radius = pow(radiusRatio, uConcentrationPower) * uRadius;

                    float branchId = floor(mod(particleId, uBranches));
                    float branchAngle = branchId * (2.0 * PI / uBranches);
                    float spinAngle = radius * uSpinSpeed + uTime * uRotationSpeed;
                    float angle = branchAngle + spinAngle;

                    vec3 particlePosition = vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
                    vec3 randomOffset = pow(abs(aRandom), vec3(uRandomnessPower)) * sign(aRandom) * radiusRatio;
                    particlePosition += randomOffset;

                    vec4 modelPosition = modelMatrix * vec4(particlePosition, 1.0);
                    vec4 viewPosition = viewMatrix * modelPosition;
                    gl_Position = projectionMatrix * viewPosition;

                    gl_PointSize = uSize * aScale * uPixelRatio * 100.0;
                    gl_PointSize *= (1.0 / -viewPosition.z);

                    vRadiusRatio = radiusRatio;
                    vOutsideColor = uColorOutside;
                    if (aColorMix > 0.66) vOutsideColor = uColorOutside3;
                    else if (aColorMix > 0.33) vOutsideColor = uColorOutside2;
                }
            `,
            fragmentShader: `
                precision mediump float;
                uniform vec3 uColorInside;
                uniform float uAlphaCutoff;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    float mixStrength = (1.0 - vRadiusRatio) * (1.0 - vRadiusRatio);
                    vec3 color = mix(vOutsideColor, uColorInside, mixStrength);

                    float alpha = 0.1 / distanceToCenter - uAlphaCutoff;
                    alpha = clamp(alpha, 0.0, 1.0);
                    if (alpha < 0.01) discard;

                    gl_FragColor = vec4(color, alpha);
                }
            `,
        });

        this.galaxyPoints = new THREE.Points(this.galaxyGeometry, this.galaxyMaterial);
        this.container.add(this.galaxyPoints);
    }

    public update(time: number, delta: number): void {
        if (!this.galaxyMaterial) return;
        this.galaxyMaterial.uniforms.uTime.value = time;

        // Smooth color transition
        this.currentColors.inside.lerp(this.targetColors.inside, this.lerpAlpha);
        this.currentColors.out1.lerp(this.targetColors.out1, this.lerpAlpha);
        this.currentColors.out2.lerp(this.targetColors.out2, this.lerpAlpha);
        this.currentColors.out3.lerp(this.targetColors.out3, this.lerpAlpha);
    }

    public updateSettings(settings: any): void {
        super.updateSettings(settings);
        if (this.galaxyMaterial) {
            const s = this.context.settings;
            this.galaxyMaterial.uniforms.uSize.value = s.particleSize;
            this.galaxyMaterial.uniforms.uRadius.value = s.radius;
            this.galaxyMaterial.uniforms.uBranches.value = s.branches;
            this.galaxyMaterial.uniforms.uSpinSpeed.value = s.spin;
            this.galaxyMaterial.uniforms.uRandomnessPower.value = s.randomnessPower;
            this.galaxyMaterial.uniforms.uConcentrationPower.value = s.concentrationPower;
            this.galaxyMaterial.uniforms.uRotationSpeed.value = s.rotationSpeed;

            if (this.galaxyPoints && s.galaxyRot) {
                this.galaxyPoints.rotation.set(
                    s.galaxyRot.x * (Math.PI / 180),
                    s.galaxyRot.y * (Math.PI / 180),
                    s.galaxyRot.z * (Math.PI / 180)
                );
            }
        }
    }

    public updateColors(inside: THREE.Color, out1: THREE.Color, out2: THREE.Color, out3: THREE.Color, blending: number, cutoff: number) {
        this.targetColors.inside.copy(inside);
        this.targetColors.out1.copy(out1);
        this.targetColors.out2.copy(out2);
        this.targetColors.out3.copy(out3);

        if (this.galaxyMaterial) {
            this.galaxyMaterial.uniforms.uAlphaCutoff.value = cutoff;
            const blendingValue = blending as THREE.Blending;
            if (this.galaxyMaterial.blending !== blendingValue) {
                this.galaxyMaterial.blending = blendingValue;
                this.galaxyMaterial.needsUpdate = true;
            }
        }
    }

    public dispose() {
        super.dispose();
        if (this.galaxyPoints) {
            this.galaxyGeometry?.dispose();
            this.galaxyMaterial?.dispose();
        }
    }
}
