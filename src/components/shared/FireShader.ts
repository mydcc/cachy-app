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
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM
float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    float freq = 1.0; 
    for (int i = 0; i < 3; i++) { 
        f += w * snoise(p * freq);
        p *= 2.0;
        w *= 0.5;
    }
    return f;
}

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
