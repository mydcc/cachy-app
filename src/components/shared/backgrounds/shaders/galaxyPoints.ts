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
 * Shared GLSL for the two galaxy point-sprite shaders.
 *
 * `GalaxyEngine` (standalone 3D background) and `GalaxyFlowEngine` (the
 * trade-flow galaxy) compute the same orbital star positions; the flow engine
 * adds trade shockwaves and sentiment tinting on top. These constants hold the
 * identical declarations and position/colour math so the two cannot drift.
 */

/** Uniforms, attributes and varyings both galaxy point shaders declare. */
export const GALAXY_ORBIT_UNIFORMS = `
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

attribute vec3 aRandom;
attribute float aScale;
attribute float aColorMix;
attribute float aIndex;

varying float vRadiusRatio;
varying vec3 vOutsideColor;

#define PI 3.14159265359
`;

/**
 * Orbital position and outside-colour helpers. `spinPhase` is the caller's
 * time term — `uTime * uRotationSpeed` for the standalone engine, the
 * externally driven `uRotationPhase` for the trade-flow galaxy.
 */
export const GALAXY_ORBIT_FUNCTIONS = `
vec3 galaxyOrbitPosition(float particleId, float spinPhase, out float radiusRatio) {
    radiusRatio = fract(particleId / uParticleCount);
    float radius = pow(radiusRatio, uConcentrationPower) * uRadius;

    float branchId = floor(mod(particleId, uBranches));
    float branchAngle = branchId * (2.0 * PI / uBranches);
    float angle = branchAngle + radius * uSpinSpeed + spinPhase;

    vec3 particlePosition = vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
    vec3 randomOffset = pow(abs(aRandom), vec3(uRandomnessPower)) * sign(aRandom) * radiusRatio;
    return particlePosition + randomOffset;
}

vec3 galaxyOutsideColor(float colorMix) {
    vec3 c = uColorOutside;
    if (colorMix > 0.66) c = uColorOutside3;
    else if (colorMix > 0.33) c = uColorOutside2;
    return c;
}
`;
