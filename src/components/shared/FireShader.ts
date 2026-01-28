export const fireVertexShader = `
varying vec2 vUv;
varying float vReflect;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const fireFragmentShader = `
uniform float uTime;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uAspectRatio; // Width / Height

varying vec2 vUv;

// Simplex Noise (standard implementation)
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
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

void main() {
    // Distance from center (0.5, 0.5)
    // We want the fire to be on the edges.
    // Normalized distance from center vector
    vec2 center = vec2(0.5);
    // Adjust for aspect ratio to have even thickness
    vec2 distVec = max(abs(vUv - center) * vec2(uAspectRatio, 1.0), abs(vUv - center));
    
    // Rectangular distance field (Box SDF approximation)
    float dX = abs(vUv.x - 0.5) * 2.0;
    float dY = abs(vUv.y - 0.5) * 2.0;
    
    // We only want edges.
    // Calculate distance to edge
    float edgeDist = max(dX, dY);
    
    // Threshold for the border
    // If edgeDist > 0.8 it starts burning
    if (edgeDist < 0.85) discard;

    // Noise generation
    float noiseScale = 10.0;
    float noiseTime = uTime * 2.5;
    
    // Displace UVs with noise for the flame shape
    float n = snoise(vUv * noiseScale - vec2(0.0, noiseTime));
    
    // Calculate alpha/intensity based on edge proximity + noise
    float strength = (edgeDist - 0.85) * (1.0 / 0.15); // Normalize 0..1 at edge
    
    // Add turbulence
    strength += n * 0.3;
    
    // Apply intensity
    strength *= uIntensity;

    // Hard cutoff or soft glow?
    float alpha = smoothstep(0.1, 0.8, strength);
    
    // Color mixing (Core -> Outer)
    vec3 color = mix(vec3(1.0, 0.1, 0.0), uColor, strength); // Red to User Color
    color += vec3(1.0, 0.8, 0.5) * step(0.8, strength); // White hot core

    gl_FragColor = vec4(color, alpha);
}
`;
