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

/**
 * Market-driven clone of `GalaxyEngine`.
 *
 * This is deliberately a COPY, not a subclass, of the standalone Galaxy 3D
 * background (`GalaxyEngine.ts` + `galaxy.worker.ts`). The two effects must be
 * able to drift apart: this one grows extra geometry attributes, extra uniforms
 * and market logic in its shaders, while the standalone galaxy stays a purely
 * decorative background whose look must never change because a trading feature
 * was tuned. Editing one must not be able to break the other.
 *
 * With a silent market (no trades, sentiment 0, activity 0) every market term
 * below evaluates to zero and this renders the same picture as `GalaxyEngine`.
 */

import * as THREE from 'three';
import { BaseEngine } from './BaseEngine';
import { clamp01, scaleToRange, PriceRangeTracker } from './volumeScale';

/** Shockwave slots alive at once. Must match `MAX_PULSES` in the shader. */
const MAX_PULSES = 8;

/** A barely visible trade still deserves a ripple; a whale must not blow up the disc. */
const MIN_PULSE_STRENGTH = 0.15;
const MAX_PULSE_STRENGTH = 1.0;

/**
 * How long a shockwave stays visible, in seconds.
 *
 * Shared by both radial modes on purpose: a pulse's lifetime should be a
 * property of the effect, not a side effect of how far it happens to travel.
 * The shader derives its speed from this and the travel span below.
 */
const PULSE_DURATION_S = 2.2;

/**
 * Travel span, in radius ratios, when the disc is a price axis. Short, so the
 * wave stays near the price that produced it — the position is the message.
 */
const PULSE_TRAVEL_PRICE = 0.35;

/**
 * Travel span when every wave starts at the core and radius means nothing.
 * Slightly past the rim (1.0), so the wave leaves the disc rather than
 * stopping on it.
 */
const PULSE_TRAVEL_CORE = 1.6;

/**
 * Usable band for a wave's birth radius, as a fraction of the disc.
 *
 * The exact centre and rim are excluded so a wave born at either end of the
 * price range still has disc left to sweep across. Without this, a sustained
 * trend — where every new trade is by definition the top of its own recent
 * range — would fire wave after wave from the rim straight off the edge, and
 * the galaxy would fall silent exactly when the market is loudest.
 */
const PULSE_RADIUS_MIN = 0.12;
const PULSE_RADIUS_MAX = 0.78;

/** Where a trade's shockwave is born and which way it sweeps. */
export interface PulseGeometry {
	/** Radius ratio (0 = core, 1 = rim) the wave starts at. */
	startRadius: number;
	/** +1 sweeps outward (rising price), -1 sweeps inward. */
	direction: number;
}

/**
 * Places a trade's shockwave on the disc.
 *
 * With the price axis on, the disc's radius *is* the price scale: a wave is
 * born at the trade's position in the recent range, and buys sweep outward
 * while sells sweep inward — so buying pressure visibly pushes up the scale.
 * With it off this reproduces the plain effect: every wave starts at the core
 * and sweeps outward regardless of side.
 */
export function pulseGeometry(
	normalizedPrice: number,
	isBuy: boolean,
	priceAxis: boolean
): PulseGeometry {
	if (!priceAxis) return { startRadius: 0, direction: 1 };
	const t = clamp01(normalizedPrice);
	return {
		startRadius: PULSE_RADIUS_MIN + t * (PULSE_RADIUS_MAX - PULSE_RADIUS_MIN),
		direction: isBuy ? 1 : -1
	};
}

/**
 * How many ATRs the price axis spans on each side of the last price, whenever an
 * ATR is available.
 *
 * Without this the axis spans only the recent trade window — seconds of prints —
 * while ATR measures 14 candles. On a 15m timeframe that is 3.5 hours, so the
 * ATR envelope is normally far wider than the window, and both ±1 ATR rings
 * would clamp to the ends of the disc and mark nothing. Widening the axis gives
 * it an absolute, market-defined unit instead of a self-referential one.
 *
 * Two, not one: the rings sit at one ATR either side of the LAST price, while
 * the axis is anchored to the middle of the recent range. Two ATRs of span lets
 * the price wander a full ATR away from that centre with both rings still on
 * the disc. Beyond that they do clamp — which reads correctly as "price is
 * further from its recent centre than a whole ATR".
 */
const ATR_AXIS_SPAN = 2.0;

/**
 * Position of a price on the axis, in `0..1`.
 *
 * The axis is the union of two ranges: the recent trade window, which reacts
 * fast, and the ATR envelope, which gives it a stable scale. Taking the union
 * rather than replacing one with the other means a burst of trades wider than
 * the ATR still fits on screen, and a quiet market still shows its ATR bands.
 */
export function priceAxisPosition(
	price: number,
	window: { low: number; high: number },
	lastPrice: number | null,
	atrAbs: number | null,
	atrSpan: number = ATR_AXIS_SPAN
): number {
	const hasWindow = window && window.high > window.low;
	let low = hasWindow ? window.low : Number.NaN;
	let high = hasWindow ? window.high : Number.NaN;

	// The envelope is centred on the SMOOTHED MIDDLE of the recent range, never
	// on the last trade. Anchoring to the last print would re-centre the axis on
	// every trade, so every new trade would land mid-axis by construction — the
	// axis would erase the very position it exists to show. The last price is
	// only a fallback for the moment before the window has anchors of its own.
	const anchor = hasWindow ? (window.low + window.high) / 2 : lastPrice;

	if (anchor != null && atrAbs != null && atrAbs > 0 && atrSpan > 0) {
		const envelopeLow = anchor - atrSpan * atrAbs;
		const envelopeHigh = anchor + atrSpan * atrAbs;
		low = Number.isNaN(low) ? envelopeLow : Math.min(low, envelopeLow);
		high = Number.isNaN(high) ? envelopeHigh : Math.max(high, envelopeHigh);
	}

	// Nothing to measure against yet: mid-axis is the only honest answer.
	if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return 0.5;
	return clamp01((price - low) / (high - low));
}

/**
 * World radius on the disc for a position on the price axis.
 *
 * This MUST mirror the vertex shader, which places a particle at
 * `pow(radiusRatio, uConcentrationPower) * uRadius`. A reference ring drawn at
 * a plain linear radius would sit next to the particles it claims to mark, and
 * a price reference that is off by the concentration curve is worse than none.
 */
export function priceAxisWorldRadius(
	normalizedPrice: number,
	concentrationPower: number,
	galaxyRadius: number
): number {
	const t = clamp01(normalizedPrice);
	const ratio = PULSE_RADIUS_MIN + t * (PULSE_RADIUS_MAX - PULSE_RADIUS_MIN);
	const power = Number.isFinite(concentrationPower) && concentrationPower > 0 ? concentrationPower : 1;
	const radius = Number.isFinite(galaxyRadius) && galaxyRadius > 0 ? galaxyRadius : 0;
	return Math.pow(ratio, power) * radius;
}

/**
 * How far a wave travels before it has fully faded. The two modes differ
 * because only one of them uses radius to carry information: a price-axis wave
 * that swept the whole disc would smear the very position it is there to show,
 * and — worse — a trade near the rim would get a far shorter visible life than
 * one near the core, biasing perception by price level.
 */
export function pulseTravelSpan(priceAxis: boolean): number {
	return priceAxis ? PULSE_TRAVEL_PRICE : PULSE_TRAVEL_CORE;
}

/** Galaxy tunables this engine reads off `context.settings.galaxyFlow`. */
export interface GalaxyFlowConfig {
	particleCount: number;
	particleSize: number;
	radius: number;
	branches: number;
	spin: number;
	randomness: number;
	randomnessPower: number;
	concentrationPower: number;
	rotationSpeed: number;
	galaxyRot: { x: number; y: number; z: number };
	autoCenter: boolean;
	/** Scales every trade shockwave. 0 = galaxy ignores trades entirely. */
	marketReactivity: number;
	/** How strongly rolling buy/sell sentiment tints the arms. */
	sentimentTint: number;
	/** How much market heat speeds the galaxy up. */
	activityRotation: number;
	/**
	 * Turns the disc's radius into a price axis: a trade's shockwave is born at
	 * its position in the recent price range instead of always at the core.
	 */
	priceAxis: boolean;
	/**
	 * Draws reference rings at the last price and at ±1 ATR around it, so the
	 * price axis can be read rather than merely sensed. Requires `priceAxis`.
	 */
	atrBands: boolean;
}

/**
 * Fallbacks for a settings object that predates this mode. The authoritative
 * defaults live in `settings.svelte.ts`; these only keep the worker from
 * rendering a black screen if an old persisted profile arrives without them.
 */
export const GALAXY_FLOW_FALLBACK: GalaxyFlowConfig = {
	particleCount: 20000,
	particleSize: 6.0,
	radius: 60,
	branches: 3,
	spin: 1.0,
	randomness: 1.0,
	randomnessPower: 3.0,
	concentrationPower: 1.5,
	rotationSpeed: 0.1,
	galaxyRot: { x: 0, y: 0, z: 0 },
	autoCenter: true,
	marketReactivity: 1.0,
	sentimentTint: 0.35,
	activityRotation: 1.0,
	priceAxis: true,
	atrBands: true
};

/**
 * Maps one trade onto the amplitude of its shockwave.
 *
 * Split out as a pure function because it is the whole market-to-visual
 * contract of this mode and the only part of it that is testable without a
 * GPU. `normalized` comes from the shared {@link VolumeNormalizer}, so "big"
 * always means big *for the symbol currently streaming*, never a hardcoded
 * dollar threshold.
 */
export function tradePulseStrength(
	normalized: number,
	volumeScale: number,
	reactivity: number
): number {
	const scaled = scaleToRange(normalized, MIN_PULSE_STRENGTH, MAX_PULSE_STRENGTH, volumeScale);
	const react = Number.isFinite(reactivity) && reactivity > 0 ? reactivity : 0;
	return clamp01(scaled * react);
}

/**
 * Effective rotation speed for a given market heat. Kept pure for the same
 * reason as {@link tradePulseStrength}: it is a market mapping, not drawing.
 */
export function activityRotationSpeed(
	baseSpeed: number,
	activity: number,
	activityRotation: number
): number {
	const base = Number.isFinite(baseSpeed) ? baseSpeed : 0;
	const boost = Number.isFinite(activityRotation) && activityRotation > 0 ? activityRotation : 0;
	return base * (1 + clamp01(activity) * boost);
}

export class GalaxyFlowEngine extends BaseEngine {
	private galaxyPoints: THREE.Points | null = null;
	private galaxyGeometry: THREE.BufferGeometry | null = null;
	private galaxyMaterial: THREE.ShaderMaterial | null = null;

	/**
	 * Flat vec4 array, one slot per live shockwave:
	 *   x = start time (seconds, engine clock)
	 *   y = SIGNED strength — positive for a buy, negative for a sell, and
	 *       exactly 0 for a free slot, so the sign carries the side and the
	 *       magnitude doubles as the liveness flag
	 *   z = travel direction (+1 outward, -1 inward)
	 *   w = start radius (0 = core, 1 = rim)
	 */
	private pulses = new Float32Array(MAX_PULSES * 4);
	private nextPulseIdx = 0;

	/**
	 * Recent price range, used to place a trade on the radial price axis.
	 * Per-engine rather than on the shared context: the standalone galaxy worker
	 * builds an `EngineContext` too, and adding a required field there would
	 * force a change on the effect this mode was cloned to leave alone.
	 */
	private priceRange = new PriceRangeTracker();

	/**
	 * ATR as a fraction of price, pushed by the worker; null while no indicator
	 * is available. Paired with the last traded price it becomes an absolute
	 * band width in quote currency, which is what the price axis needs.
	 */
	private atrRel: number | null = null;
	private lastPrice: number | null = null;

	/** Reference rings: [-1 ATR, last price, +1 ATR]. Built once, then scaled. */
	private bandGroup: THREE.Group | null = null;
	private bands: THREE.LineLoop[] = [];

	/**
	 * Rotation is accumulated as a phase instead of `uTime * speed` (which is
	 * what the standalone galaxy does). Market activity changes the speed every
	 * frame, and multiplying a growing clock by a changing speed makes the whole
	 * disc jump backwards and forwards. Integrating the speed cannot jump.
	 */
	private rotationPhase = 0;
	private lastTime: number | null = null;
	private currentActivity = 0;

	/** Star palette, lerped like the standalone galaxy does. */
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
	/**
	 * The palette arrives one message after the engine is built. Without this
	 * flag the first update would *lerp* from the uninitialised white toward the
	 * theme colour, so every mode switch would start with a second of white
	 * stars. Subsequent theme changes still cross-fade.
	 */
	private hasPalette = false;

	/** Structural fields that force a geometry rebuild when they change. */
	private builtWith = { particleCount: -1, randomness: Number.NaN };

	public init(): void {
		this.generate();
		this.buildBands();
		this.isInitialized = true;
	}

	/**
	 * Three unit-radius rings, later scaled to the prices they mark. Line loops
	 * rather than thin ring meshes on purpose: a scaled mesh scales its own
	 * thickness too, which would draw the +1 ATR ring fatter than the -1 ATR one
	 * and make a symmetric band look asymmetric. A line keeps one screen pixel
	 * either way.
	 */
	private buildBands(): void {
		const SEGMENTS = 128;
		const points: THREE.Vector3[] = [];
		for (let i = 0; i < SEGMENTS; i++) {
			const a = (i / SEGMENTS) * Math.PI * 2;
			// Built directly in the XZ plane, the same plane the disc lives in.
			points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
		}
		const geometry = new THREE.BufferGeometry().setFromPoints(points);

		this.bandGroup = new THREE.Group();
		this.bandGroup.visible = false;
		// Order: [-1 ATR, last price, +1 ATR]. The middle ring is dimmest — it
		// anchors the pair without competing with the bands it sits between.
		const opacities = [0.3, 0.16, 0.3];
		for (let i = 0; i < 3; i++) {
			const material = new THREE.LineBasicMaterial({
				transparent: true,
				opacity: opacities[i],
				depthWrite: false,
				blending: THREE.AdditiveBlending
			});
			const loop = new THREE.LineLoop(geometry, material);
			this.bands.push(loop);
			this.bandGroup.add(loop);
		}
		this.container.add(this.bandGroup);
	}

	/**
	 * Places the rings at the last price and ±1 ATR around it.
	 *
	 * The prices run through the very same normaliser and radius curve the
	 * shockwaves use, so a ring and a wave born at the same price land on the
	 * same circle. Because the axis spans 1.5 ATR either side of the last price,
	 * the ±1 ATR rings always sit well inside the disc rather than clamping to
	 * its ends.
	 */
	private updateBands(s: GalaxyFlowConfig): void {
		if (!this.bandGroup) return;

		const active = s.priceAxis && s.atrBands && this.atrRel != null && this.lastPrice != null;
		this.bandGroup.visible = active;
		if (!active) return;

		const atrAbs = (this.atrRel as number) * (this.lastPrice as number);
		const prices = [
			(this.lastPrice as number) - atrAbs,
			this.lastPrice as number,
			(this.lastPrice as number) + atrAbs
		];

		for (let i = 0; i < this.bands.length; i++) {
			const worldRadius = priceAxisWorldRadius(
				this.axisPosition(prices[i]),
				s.concentrationPower,
				s.radius
			);
			this.bands[i].scale.set(worldRadius, 1, worldRadius);
		}

		// Low band toward the sell colour, high band toward the buy colour, so
		// the rings carry the same up/down language as everything else.
		const down = this.context.colorDown ?? new THREE.Color(0xff4444);
		const up = this.context.colorUp ?? new THREE.Color(0x00ff88);
		const mid = this.context.currentAtmosphere ?? new THREE.Color(0xffffff);
		(this.bands[0].material as THREE.LineBasicMaterial).color.copy(down);
		(this.bands[1].material as THREE.LineBasicMaterial).color.copy(mid).lerp(new THREE.Color(0xffffff), 0.6);
		(this.bands[2].material as THREE.LineBasicMaterial).color.copy(up);
	}

	private config(): GalaxyFlowConfig {
		const raw = (this.context.settings?.galaxyFlow ?? {}) as Partial<GalaxyFlowConfig>;
		return { ...GALAXY_FLOW_FALLBACK, ...raw };
	}

	public generate(): void {
		const s = this.config();
		const particleCount = Math.max(1, Math.floor(s.particleCount));
		const travel = pulseTravelSpan(s.priceAxis);

		if (this.galaxyPoints) {
			this.galaxyGeometry?.dispose();
			this.galaxyMaterial?.dispose();
			this.container.remove(this.galaxyPoints);
		}

		const positions = new Float32Array(particleCount * 3);
		const randoms = new Float32Array(particleCount * 3);
		const scales = new Float32Array(particleCount);
		const colorMixs = new Float32Array(particleCount);
		const indices = new Float32Array(particleCount);

		for (let i = 0; i < particleCount; i++) {
			const i3 = i * 3;
			randoms[i3] = (Math.random() - 0.5) * 2 * s.randomness;
			randoms[i3 + 1] = (Math.random() - 0.5) * 2 * s.randomness;
			randoms[i3 + 2] = (Math.random() - 0.5) * 2 * s.randomness;
			scales[i] = Math.random();
			positions[i3] = positions[i3 + 1] = positions[i3 + 2] = 0;
			colorMixs[i] = Math.random();
			indices[i] = i;
		}

		this.galaxyGeometry = new THREE.BufferGeometry();
		this.galaxyGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.galaxyGeometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3));
		this.galaxyGeometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
		this.galaxyGeometry.setAttribute('aColorMix', new THREE.BufferAttribute(colorMixs, 1));
		this.galaxyGeometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

		this.galaxyMaterial = new THREE.ShaderMaterial({
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			vertexColors: true,
			uniforms: {
				uTime: { value: 0 },
				uRotationPhase: { value: this.rotationPhase },
				uSize: { value: s.particleSize },
				uPixelRatio: { value: this.context.renderer.getPixelRatio() },
				uColorInside: { value: this.currentColors.inside },
				uColorOutside: { value: this.currentColors.out1 },
				uColorOutside2: { value: this.currentColors.out2 },
				uColorOutside3: { value: this.currentColors.out3 },
				uRadius: { value: s.radius },
				uBranches: { value: s.branches },
				uSpinSpeed: { value: s.spin },
				uRandomnessPower: { value: s.randomnessPower },
				uConcentrationPower: { value: s.concentrationPower },
				uAlphaCutoff: { value: 0.2 },
				uParticleCount: { value: particleCount },

				// --- market channel ---
				// uSentiment is fed for free by tradeFlow.worker.ts, which walks
				// the scene each frame and fills this uniform on any material
				// that declares it.
				uSentiment: { value: 0 },
				uSentimentTint: { value: s.sentimentTint },
				uColorUp: { value: (this.context.colorUp ?? new THREE.Color(0x00ff88)).clone() },
				uColorDown: { value: (this.context.colorDown ?? new THREE.Color(0xff4444)).clone() },
				uPulses: { value: this.pulses },
				uPulseTravel: { value: travel },
				// Derived, not tuned: both modes are given the same wave lifetime,
				// so the speed follows from how far that mode's wave travels.
				uPulseSpeed: { value: travel / PULSE_DURATION_S },
				uPulseWidth: { value: 0.11 },
				uPulseLift: { value: s.radius * 0.12 }
			},
			vertexShader: `
                precision mediump float;
                uniform float uTime;
                uniform float uRotationPhase;
                uniform float uSize;
                uniform float uPixelRatio;
                uniform float uRadius;
                uniform float uBranches;
                uniform float uSpinSpeed;
                uniform float uRandomnessPower;
                uniform float uConcentrationPower;
                uniform float uParticleCount;
                uniform vec3 uColorOutside;
                uniform vec3 uColorOutside2;
                uniform vec3 uColorOutside3;

                uniform float uSentiment;
                uniform float uSentimentTint;
                uniform vec3 uColorUp;
                uniform vec3 uColorDown;
                uniform vec4 uPulses[${MAX_PULSES}];
                uniform float uPulseTravel;
                uniform float uPulseSpeed;
                uniform float uPulseWidth;
                uniform float uPulseLift;

                attribute vec3 aRandom;
                attribute float aScale;
                attribute float aColorMix;
                attribute float aIndex;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;
                varying float vPulseSigned;
                varying float vPulseAbs;

                #define PI 3.14159265359
                #define MAX_PULSES ${MAX_PULSES}

                void main() {
                    float particleId = aIndex;
                    float radiusRatio = fract(particleId / uParticleCount);
                    float radius = pow(radiusRatio, uConcentrationPower) * uRadius;

                    float branchId = floor(mod(particleId, uBranches));
                    float branchAngle = branchId * (2.0 * PI / uBranches);
                    float spinAngle = radius * uSpinSpeed + uRotationPhase;
                    float angle = branchAngle + spinAngle;

                    vec3 particlePosition = vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
                    vec3 randomOffset = pow(abs(aRandom), vec3(uRandomnessPower)) * sign(aRandom) * radiusRatio;
                    particlePosition += randomOffset;

                    // --- trade shockwaves ---
                    // Each live trade is a ring born at its own price radius.
                    // A buy lifts the particles it passes and sweeps outward
                    // (up the price scale); a sell presses down and sweeps in.
                    float pulseSigned = 0.0;
                    float pulseAbs = 0.0;
                    for (int i = 0; i < MAX_PULSES; i++) {
                        vec4 p = uPulses[i];
                        float strength = abs(p.y);
                        if (strength <= 0.0) continue;
                        float age = uTime - p.x;
                        if (age < 0.0) continue;
                        float travelled = age * uPulseSpeed;
                        if (travelled > uPulseTravel) continue;
                        float front = p.w + travelled * p.z;
                        float d = radiusRatio - front;
                        float band = exp(-(d * d) / (uPulseWidth * uPulseWidth));
                        float decay = 1.0 - clamp(travelled / uPulseTravel, 0.0, 1.0);
                        float influence = band * decay * strength;
                        pulseSigned += influence * sign(p.y);
                        pulseAbs += influence;
                    }
                    pulseAbs = min(pulseAbs, 1.5);

                    particlePosition.y += pulseSigned * uPulseLift;

                    vec4 modelPosition = modelMatrix * vec4(particlePosition, 1.0);
                    vec4 viewPosition = viewMatrix * modelPosition;
                    gl_Position = projectionMatrix * viewPosition;

                    gl_PointSize = uSize * aScale * uPixelRatio * 100.0;
                    gl_PointSize *= (1.0 + pulseAbs * 1.5);
                    gl_PointSize *= (1.0 / -viewPosition.z);

                    vRadiusRatio = radiusRatio;
                    vOutsideColor = uColorOutside;
                    if (aColorMix > 0.66) vOutsideColor = uColorOutside3;
                    else if (aColorMix > 0.33) vOutsideColor = uColorOutside2;

                    vec3 sentimentColor = uSentiment >= 0.0 ? uColorUp : uColorDown;
                    vOutsideColor = mix(vOutsideColor, sentimentColor, abs(uSentiment) * uSentimentTint);

                    vPulseSigned = pulseSigned;
                    vPulseAbs = pulseAbs;
                }
            `,
			fragmentShader: `
                precision mediump float;
                uniform vec3 uColorInside;
                uniform float uAlphaCutoff;
                uniform vec3 uColorUp;
                uniform vec3 uColorDown;

                varying float vRadiusRatio;
                varying vec3 vOutsideColor;
                varying float vPulseSigned;
                varying float vPulseAbs;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float distanceToCenter = length(uv);
                    if (distanceToCenter > 0.5) discard;

                    float mixStrength = (1.0 - vRadiusRatio) * (1.0 - vRadiusRatio);
                    vec3 color = mix(vOutsideColor, uColorInside, mixStrength);

                    vec3 tradeColor = vPulseSigned >= 0.0 ? uColorUp : uColorDown;
                    color = mix(color, tradeColor, clamp(vPulseAbs, 0.0, 1.0));

                    float alpha = 0.1 / distanceToCenter - uAlphaCutoff;
                    alpha = clamp(alpha, 0.0, 1.0);
                    alpha = clamp(alpha * (1.0 + vPulseAbs), 0.0, 1.0);
                    if (alpha < 0.01) discard;

                    gl_FragColor = vec4(color, alpha);
                }
            `
		});

		this.galaxyPoints = new THREE.Points(this.galaxyGeometry, this.galaxyMaterial);
		this.applyRotation(s);
		this.container.add(this.galaxyPoints);

		this.builtWith = { particleCount, randomness: s.randomness };
	}

	public update(time: number): void {
		if (!this.galaxyMaterial) return;

		const s = this.config();
		const dt = this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
		this.lastTime = time;

		this.rotationPhase +=
			dt * activityRotationSpeed(s.rotationSpeed, this.currentActivity, s.activityRotation);

		this.galaxyMaterial.uniforms.uTime.value = time;
		this.galaxyMaterial.uniforms.uRotationPhase.value = this.rotationPhase;

		this.updateBands(s);

		this.expirePulses(time);

		this.currentColors.inside.lerp(this.targetColors.inside, this.lerpAlpha);
		this.currentColors.out1.lerp(this.targetColors.out1, this.lerpAlpha);
		this.currentColors.out2.lerp(this.targetColors.out2, this.lerpAlpha);
		this.currentColors.out3.lerp(this.targetColors.out3, this.lerpAlpha);
	}

	/**
	 * Where a price sits on the axis right now. The single source of truth for
	 * both the shockwaves and the reference rings — if these two ever disagreed,
	 * a ring would mark a price the waves do not land on.
	 */
	private axisPosition(price: number): number {
		const atrAbs = this.atrRel != null && this.lastPrice != null ? this.atrRel * this.lastPrice : null;
		return priceAxisPosition(price, this.priceRange.getRange(), this.lastPrice, atrAbs);
	}

	/**
	 * Frees slots whose wave has left the disc. Without this the ring buffer
	 * would keep evaluating dead pulses in the shader loop forever.
	 */
	private expirePulses(time: number): void {
		if (!this.galaxyMaterial) return;
		const speed = this.galaxyMaterial.uniforms.uPulseSpeed.value as number;
		const travel = this.galaxyMaterial.uniforms.uPulseTravel.value as number;
		for (let i = 0; i < MAX_PULSES; i++) {
			const base = i * 4;
			// Strength 0 is the free-slot marker (see the `pulses` field docs).
			if (this.pulses[base + 1] === 0) continue;
			if ((time - this.pulses[base]) * speed > travel) {
				this.pulses[base + 1] = 0;
			}
		}
	}

	public onTrade(trade: { type: 'buy' | 'sell'; price: number; amount: number }): void {
		if (!trade || !this.galaxyMaterial) return;
		const s = this.config();
		const volScale = (this.context.settings?.volumeScale as number) || 1.0;

		const normalized = this.context.volumeNormalizer.push(trade.price, trade.amount);
		const strength = tradePulseStrength(normalized, volScale, s.marketReactivity);

		// Fed before the early return on purpose: the price window has to keep
		// tracking the market even while waves are suppressed, otherwise turning
		// reactivity back up would start from a cold, wrong price scale.
		// Feed the window first, then read the combined axis, so this trade is
		// already part of the range it is positioned against.
		this.priceRange.push(trade.price);
		if (Number.isFinite(trade.price) && trade.price > 0) this.lastPrice = trade.price;
		const pricePos = this.axisPosition(trade.price);
		if (strength <= 0) return;

		const isBuy = trade.type === 'buy';
		const geo = pulseGeometry(pricePos, isBuy, s.priceAxis);

		const base = this.nextPulseIdx * 4;
		this.pulses[base] = this.galaxyMaterial.uniforms.uTime.value as number;
		this.pulses[base + 1] = isBuy ? strength : -strength;
		this.pulses[base + 2] = geo.direction;
		this.pulses[base + 3] = geo.startRadius;
		this.nextPulseIdx = (this.nextPulseIdx + 1) % MAX_PULSES;
	}

	/**
	 * The symbol changed. The previous market's price range says nothing about
	 * the new one, and waves still in flight are positioned on a scale that no
	 * longer exists — so both are dropped rather than left to mislead.
	 */
	public onSymbolChange(): void {
		this.priceRange.reset();
		this.atrRel = null;
		this.lastPrice = null;
		this.pulses.fill(0);
		this.nextPulseIdx = 0;
	}

	/**
	 * Latest indicator readings. Only ATR is used here — it turns the price axis
	 * from a relative scale into one with an absolute, market-defined unit.
	 */
	public onIndicators(signal: { volatilityRel: number | null }): void {
		this.atrRel =
			signal && typeof signal.volatilityRel === 'number' && Number.isFinite(signal.volatilityRel)
				? signal.volatilityRel
				: null;
	}

	/** Market heat (rate + notional + volatility), pushed by the worker each frame. */
	public onMarketActivity(activity: number): void {
		this.currentActivity = clamp01(activity);
	}

	// `any` matches BaseEngine.context.settings' own declared type — every
	// sibling engine's updateSettings() does the same.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public updateSettings(settings: any): void {
		super.updateSettings(settings);
		const s = this.config();

		// Particle count and randomness are baked into the buffers, so they
		// cannot be changed by touching a uniform.
		if (
			Math.floor(s.particleCount) !== this.builtWith.particleCount ||
			s.randomness !== this.builtWith.randomness
		) {
			this.generate();
			return;
		}

		if (!this.galaxyMaterial) return;
		const u = this.galaxyMaterial.uniforms;
		u.uSize.value = s.particleSize;
		u.uRadius.value = s.radius;
		u.uBranches.value = s.branches;
		u.uSpinSpeed.value = s.spin;
		u.uRandomnessPower.value = s.randomnessPower;
		u.uConcentrationPower.value = s.concentrationPower;
		u.uSentimentTint.value = s.sentimentTint;
		u.uPulseLift.value = s.radius * 0.12;

		// Toggling the price axis changes both how far a wave travels and how
		// fast. Waves already in flight were placed under the old rule, so they
		// are dropped rather than allowed to jump to a new position mid-sweep.
		const travel = pulseTravelSpan(s.priceAxis);
		if (u.uPulseTravel.value !== travel) {
			u.uPulseTravel.value = travel;
			u.uPulseSpeed.value = travel / PULSE_DURATION_S;
			this.pulses.fill(0);
			this.nextPulseIdx = 0;
		}

		this.applyRotation(s);
	}

	private applyRotation(s: GalaxyFlowConfig): void {
		if (!s.galaxyRot) return;
		const x = s.galaxyRot.x * (Math.PI / 180);
		const y = s.galaxyRot.y * (Math.PI / 180);
		const z = s.galaxyRot.z * (Math.PI / 180);
		this.galaxyPoints?.rotation.set(x, y, z);
		// The rings mark positions on the disc, so they have to tilt with it —
		// a reference that stays flat while the disc turns marks nothing.
		this.bandGroup?.rotation.set(x, y, z);
	}

	/**
	 * Buy/sell colours, shared with every other Trade Flow mode. The atmosphere
	 * colour is ignored on purpose: this material is additively blended against
	 * the scene background, which the worker already tints.
	 */
	public updateThemeColors(colorUp: THREE.Color, colorDown: THREE.Color, atmosphere: THREE.Color): void {
		this.context.colorUp = colorUp;
		this.context.colorDown = colorDown;
		this.context.currentAtmosphere = atmosphere;
		if (!this.galaxyMaterial) return;
		(this.galaxyMaterial.uniforms.uColorUp.value as THREE.Color).copy(colorUp);
		(this.galaxyMaterial.uniforms.uColorDown.value as THREE.Color).copy(colorDown);
	}

	/**
	 * Star palette + blending, resolved from the same `--galaxy-*` theme
	 * variables the standalone background uses, so both galaxies stay recognisably
	 * the same object across all 20+ themes.
	 */
	public updateGalaxyPalette(
		inside: THREE.ColorRepresentation,
		out1: THREE.ColorRepresentation,
		out2: THREE.ColorRepresentation,
		out3: THREE.ColorRepresentation,
		blending: THREE.Blending,
		cutoff: number
	): void {
		this.targetColors.inside.set(inside);
		this.targetColors.out1.set(out1);
		this.targetColors.out2.set(out2);
		this.targetColors.out3.set(out3);

		if (!this.hasPalette) {
			this.currentColors.inside.copy(this.targetColors.inside);
			this.currentColors.out1.copy(this.targetColors.out1);
			this.currentColors.out2.copy(this.targetColors.out2);
			this.currentColors.out3.copy(this.targetColors.out3);
			this.hasPalette = true;
		}

		if (!this.galaxyMaterial) return;
		this.galaxyMaterial.uniforms.uAlphaCutoff.value = cutoff;
		if (this.galaxyMaterial.blending !== blending) {
			this.galaxyMaterial.blending = blending;
			this.galaxyMaterial.needsUpdate = true;
		}
	}

	public dispose() {
		super.dispose();
		for (const band of this.bands) (band.material as THREE.Material).dispose();
		// One geometry is shared by all three rings, so disposing it once is enough.
		if (this.bands.length) this.bands[0].geometry.dispose();
		this.bands = [];
		this.bandGroup = null;
		if (this.galaxyPoints) {
			this.galaxyGeometry?.dispose();
			this.galaxyMaterial?.dispose();
		}
		this.galaxyPoints = null;
		this.galaxyGeometry = null;
		this.galaxyMaterial = null;
	}
}
