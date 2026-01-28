export const fireVertexShader = `
varying vec2 vUv;
varying vec2 vSize;
varying vec3 vColor;

void main() {
    vUv = uv;
    vColor = instanceColor;
    
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
uniform float uThickness; // New uniform for controlling border width

varying vec2 vUv;
varying vec2 vSize;
varying vec3 vColor;

// Simplex Noise
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
    // Pixel Distance to edge
    vec2 pixelDist = abs(vUv - 0.5) * vSize;
    vec2 distToEdge = vSize * 0.5 - pixelDist;
    float minDist = min(distToEdge.x, distToEdge.y);
    
    // Use uniform thickness, default around 15.0 to 25.0
    float borderWidth = uThickness;
    
    // Discard inner area 
    if (minDist > borderWidth) discard;

    // Noise for lick of flames
    // Reduced frequency slightly for more "wispy" look
    float n = snoise(vUv * 5.0 - vec2(0.0, uTime * 2.0));
    
    // Calculate strength based on distance to edge 
    float strength = clamp(1.0 - (minDist / borderWidth), 0.0, 1.0);
    
    // Add noise to the edge boundary
    strength = pow(strength, 0.5);
    strength += n * 0.5 * (1.0 - minDist/borderWidth);
    
    strength *= uIntensity;

    // Softer alpha edge
    float alpha = smoothstep(0.0, 0.6, strength);
    
    // Fire palette influenced by instance color
    vec3 colorCore = vec3(1.0, 0.95, 0.8); // White hot center
    vec3 colorMid = vColor;                // Instance color tint
    vec3 colorOuter = vColor * 0.5;        // Darker tint
    
    // More bias towards colorMid for subtler look
    vec3 finalColor = mix(colorOuter, colorMid, strength);
    finalColor = mix(finalColor, colorCore, pow(strength, 6.0)); // Sharper core, less white

    gl_FragColor = vec4(finalColor, alpha);
}
`;
