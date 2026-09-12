/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { GLSL_SNOISE2 } from "./backgrounds/shaders/noise";

export const fireVertexShader = `
varying vec2 vUv;
varying vec2 vSize;
varying vec3 vColor;
varying float vMode;

attribute float aMode;

void main() {
    vUv = uv;
    vColor = instanceColor;
    vMode = aMode;
    
    // Extract scale from instanceMatrix (columns 0 and 1)
    float scaleX = length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z));
    float scaleY = length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z));
    
    vSize = vec2(scaleX, scaleY);
    
    // Apply instance transformation
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export const fireFragmentShader = `
uniform float uTime;
uniform float uIntensity;
uniform float uThickness; 
uniform float uSpeed;
uniform float uTurbulence;
uniform float uScale; // New: 1.1 = 10% padding
uniform vec2 uResolution;

varying vec2 vUv;
varying vec2 vSize;
varying vec3 vColor;
varying float vMode;

// --- FAST NOISE FUNCTIONS ---
${GLSL_SNOISE2}

// Signed Distance Function for a Rounded Box
float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
    r.xy = (p.x > 0.0) ? r.xy : r.zw;
    r.x  = (p.y > 0.0) ? r.x  : r.y;
    vec2 q = abs(p) - b + r.x;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

void main() {
    // --- COMMON GEOMETRY SETUP ---
    vec2 p = vUv - 0.5; 
    vec2 realSize = vSize / uScale; 
    vec2 halfSize = realSize * 0.5; 
    vec2 pixelPos = p * vSize; 
    float radius = 16.0;
    
    // SDF Calculation
    float dist = sdRoundedBox(pixelPos, halfSize, vec4(radius));
    
    // Optimization
    if (dist < -1.0) discard;

    // Margin for fade out
    float margin = (vSize.x - realSize.x) * 0.5;
    float normalizedPos = clamp(dist / margin, 0.0, 1.0);

    // --- MODE SWITCH ---
    // vMode 0 = Fire (Interactive/Theme Color)
    // vMode 1 = Glow (Neon Pulse)
    // vMode 3 = Classic Fire (Original Orange/Yellow)
    
    vec3 finalColor = vec3(0.0);
    float alpha = 0.0;
    
    int mode = int(vMode + 0.5);
    
    if (mode == 1) {
        // --- GLOW MODE ---
        float pulse = 0.8 + 0.4 * sin(uTime * 2.0 * uSpeed);
        float glowShape = 1.0 - smoothstep(0.0, 1.0, normalizedPos);
        glowShape = pow(glowShape, 2.0); 
        
        vec3 colBase = vColor;
        vec3 colHot = mix(vColor, vec3(1.0), 0.5); 
        
        finalColor = mix(colBase, colHot, glowShape * 0.5);
        finalColor *= pulse * uIntensity;
        alpha = glowShape * 0.8; 
        alpha *= smoothstep(1.0, 0.8, normalizedPos);
        
    } else {
        // --- RADIATING FIRE (Modes 0 and 3) ---
        vec2 noiseUV = pixelPos * (0.02 + uTurbulence * 0.01);
        float n1 = fbm(noiseUV + uTime * uSpeed * 0.5);
        float n2 = fbm(noiseUV * 2.0 - uTime * uSpeed * 0.3);
        float noise = (n1 * 0.7 + n2 * 0.3);
        
        float distortedDist = dist - noise * 15.0 * uIntensity;
        float innerGlow = smoothstep(-5.0, 5.0, -distortedDist);
        float outerGlow = smoothstep(margin * 0.8, -5.0, distortedDist);
        
        float emission = outerGlow * 1.2;
        emission += innerGlow * 0.3; 
        
        // Color Selection
        vec3 baseColor = vColor;
        if (mode == 3) {
            baseColor = vec4(1.0, 0.53, 0.0, 1.0).rgb; // Classic Orange
        }

        vec3 targetCore = vec3(1.0, 1.0, 1.0); // Default to white core
        if (mode == 3) {
             targetCore = vec3(1.0, 0.9, 0.5); // Classic yellow core
        }
        
        vec3 colCore = mix(baseColor, targetCore, 0.4); 
        vec3 colEdge = baseColor;
        vec3 colSmoke = baseColor * 0.3;
        
        finalColor = mix(colSmoke, colEdge, emission);
        finalColor = mix(finalColor, colCore, pow(outerGlow, 4.0));
        finalColor *= (0.5 + uIntensity);
        
        alpha = emission * smoothstep(1.0, 0.7, normalizedPos);
        alpha = clamp(alpha, 0.0, 1.0);
    }

    gl_FragColor = vec4(finalColor, alpha);
}
`;
