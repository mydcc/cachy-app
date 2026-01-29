<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as THREE from "three";
    import { effectsState } from "../../stores/effects.svelte";

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let animationId: number | null = null;

    // --- Projectile State ---
    let progress = 0;
    let isFlying = false;
    let startPos = new THREE.Vector3();
    let targetPos = new THREE.Vector3(0, 0, 5);

    // We hold one mesh for each type, and toggle visibility
    let orbMesh: THREE.Mesh | null = null;
    let boltLine: THREE.Line | null = null;
    let coinMesh: THREE.Mesh | null = null;
    let matrixPoints: THREE.Points | null = null;

    let activeEffect: "orb" | "bolt" | "coin" | "matrix" = "orb";

    // --- 1. QUANTUM PULSE (Orb) ---
    const orbMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColorCore: { value: new THREE.Color("#00ff9d") },
            uColorGlow: { value: new THREE.Color("#00aaff") },
            uIntensity: { value: 1.5 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
              vNormal = normalize(normalMatrix * normal);
              vPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
      `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uColorCore;
          uniform vec3 uColorGlow;
          uniform float uIntensity;
          varying vec3 vNormal;
          void main() {
              float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
              float pulse = sin(uTime * 10.0) * 0.1 + 0.9;
              vec3 color = mix(uColorCore, uColorGlow, fresnel);
              float alpha = (fresnel + 0.2) * uIntensity * pulse;
              gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
          }
      `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    function createOrb() {
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        orbMesh = new THREE.Mesh(geometry, orbMaterial);
        orbMesh.visible = false;
        scene?.add(orbMesh);
    }

    // --- 2. NEURAL SPARK (Lightning) ---
    // A jittery line
    const boltSegments = 20;
    const boltGeometry = new THREE.BufferGeometry();
    // Initialize positions
    const boltPositions = new Float32Array(boltSegments * 3);
    boltGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(boltPositions, 3),
    );

    const boltMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        linewidth: 3, // Note: minimal effect in standard WebGL, but good enough with bloom (simulated)
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
    });

    function createBolt() {
        boltLine = new THREE.Line(boltGeometry, boltMaterial);
        boltLine.visible = false;
        scene?.add(boltLine);
    }

    function updateBolt(t: number) {
        // Create a jagged line from (0,0,0) to random points?
        // Actually, let's treat the bolt as the projectile itself.
        // Or maybe the bolt trails behind?
        // Let's make the projectile LOOK like a ball of lightning.
        // Randomize vertices in a sphere radius
        if (!boltLine) return;

        const positions = boltLine.geometry.attributes.position
            .array as Float32Array;
        for (let i = 0; i < boltSegments; i++) {
            const r = 0.4;
            positions[i * 3] = (Math.random() - 0.5) * r;
            positions[i * 3 + 1] = (Math.random() - 0.5) * r;
            positions[i * 3 + 2] = (Math.random() - 0.5) * r;
        }
        boltLine.geometry.attributes.position.needsUpdate = true;

        // Flash color
        const hue = (t * 5) % 1;
        (boltLine.material as THREE.LineBasicMaterial).color.setHSL(
            0.5 + Math.random() * 0.2,
            1,
            0.5 + Math.random() * 0.5,
        );
    }

    // --- 3. CRYPTO COIN (Holo-Flip) ---
    // Cylinder with texture
    function createCoinTexture() {
        if (!browser) return new THREE.Texture();
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            // B for Bitcoin-ish symbol
            ctx.fillStyle = "#FFD700"; // Gold bg
            ctx.fillRect(0, 0, 128, 128);
            ctx.strokeStyle = "#B8860B";
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(64, 64, 55, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#B8860B"; // Darker gold text
            ctx.font = "bold 80px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("₿", 64, 64);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    const coinMaterial = new THREE.MeshBasicMaterial({
        map: createCoinTexture(),
        color: 0xffffff,
        transparent: true,
    });

    // Edge material (gold)
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });

    function createCoin() {
        // Cylinder: RadiusTop, RadiusBottom, Height, Segments
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
        // Rotate geometry so flat side faces Z?
        geometry.rotateX(Math.PI / 2);

        // Multi-material support? CylinderGeometry groups: 0:side, 1:top, 2:bottom
        // But MeshBasicMaterial doesn't support array in simple setup easily without groups
        // Let's just use one material for now, or just colored

        coinMesh = new THREE.Mesh(geometry, coinMaterial);
        coinMesh.visible = false;
        scene?.add(coinMesh);
    }

    // --- 4. DATA STREAM (Matrix) ---
    // Particles falling/trailing?
    // Let's make a cluster of 0s and 1s
    function createMatrixTexture() {
        if (!browser) return new THREE.Texture();
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 48px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            // Randomly draw 0 or 1? We can't change texture per particle easily without atlas.
            // Let's just draw "1 0" logic
            ctx.fillText("10", 32, 32);
        }
        return new THREE.CanvasTexture(canvas);
    }

    const matrixMaterial = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 0.5,
        map: createMatrixTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    function createMatrix() {
        const count = 20;
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = Math.random() - 0.5;
            pos[i * 3 + 1] = Math.random() - 0.5;
            pos[i * 3 + 2] = Math.random() - 0.5;
        }
        geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        matrixPoints = new THREE.Points(geom, matrixMaterial);
        matrixPoints.visible = false;
        scene?.add(matrixPoints);
    }

    // --- LOGIC ---

    function launch(rect: DOMRect) {
        if (!camera) return;

        // 1. Determine Start Position
        const x = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
        const y = -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;

        const vec = new THREE.Vector3(x, y, 0);
        vec.unproject(camera);
        const dir = vec.sub(camera.position).normalize();
        // Start at Z=0 (visually close to UI plane)
        const distance = (0 - camera.position.z) / dir.z;
        const start = camera.position.clone().add(dir.multiplyScalar(distance));
        startPos.copy(start);

        // 2. Determine Target (Right at camera "face")
        targetPos.set(0, 0, camera.position.z - 2);

        // 3. Randomize Effect
        const effects: ("orb" | "bolt" | "coin" | "matrix")[] = [
            "orb",
            "bolt",
            "coin",
            "matrix",
        ];
        activeEffect = effects[Math.floor(Math.random() * effects.length)];

        // Hide all first
        if (orbMesh) orbMesh.visible = false;
        if (boltLine) boltLine.visible = false;
        if (coinMesh) coinMesh.visible = false;
        if (matrixPoints) matrixPoints.visible = false;

        // Activate chosen
        let obj: THREE.Object3D | null = null;
        if (activeEffect === "orb") obj = orbMesh;
        if (activeEffect === "bolt") obj = boltLine;
        if (activeEffect === "coin") obj = coinMesh;
        if (activeEffect === "matrix") obj = matrixPoints;

        if (obj) {
            obj.position.copy(startPos);
            obj.scale.set(0.1, 0.1, 0.1);
            obj.visible = true;
            // Apply random rotation for coin start
            if (activeEffect === "coin") {
                obj.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    0,
                );
            }
        }

        progress = 0;
        isFlying = true;
    }

    $effect(() => {
        if (effectsState.projectileOrigin) {
            launch(effectsState.projectileOrigin);
            effectsState.consumeProjectileEvent();
        }
    });

    onMount(() => {
        if (!browser || !container) return;

        // SCENE SETUP
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            100,
        );
        camera.position.z = 20;

        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.style.pointerEvents = "none";
        container.appendChild(renderer.domElement);

        // CREATE OBJECTS
        createOrb();
        createBolt();
        createCoin();
        createMatrix();

        const clock = new THREE.Clock();

        function animate() {
            if (!renderer || !scene || !camera) return;
            const dt = clock.getDelta();
            const elapsed = clock.getElapsedTime();

            // Shader updates
            orbMaterial.uniforms.uTime.value = elapsed;

            // Active Animation
            if (isFlying) {
                progress += dt * 1.5;

                if (progress >= 1) {
                    progress = 1;
                    isFlying = false;
                    // Hide everything
                    if (orbMesh) orbMesh.visible = false;
                    if (boltLine) boltLine.visible = false;
                    if (coinMesh) coinMesh.visible = false;
                    if (matrixPoints) matrixPoints.visible = false;
                }

                const t = progress * progress * progress; // Ease In Cubic

                // Identify active object
                let obj: THREE.Object3D | null = null;
                if (activeEffect === "orb") obj = orbMesh;
                if (activeEffect === "bolt") obj = boltLine;
                if (activeEffect === "coin") obj = coinMesh;
                if (activeEffect === "matrix") obj = matrixPoints;

                if (obj) {
                    // Move
                    obj.position.lerpVectors(startPos, targetPos, t);

                    // Scale
                    const scale = 0.5 + t * 4.0;
                    obj.scale.set(scale, scale, scale);

                    // Specific Updates
                    if (activeEffect === "bolt") {
                        updateBolt(elapsed);
                    }
                    if (activeEffect === "coin") {
                        // Spin rapidly
                        obj.rotation.x += dt * 10;
                        obj.rotation.y += dt * 5;
                    }
                    if (activeEffect === "matrix") {
                        // Rotate whole cloud
                        obj.rotation.z -= dt * 2;
                    }
                }
            }

            renderer.render(scene, camera);
            animationId = requestAnimationFrame(animate);
        }
        animate();

        function onWindowResize() {
            if (!camera || !renderer) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener("resize", onWindowResize);

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            window.removeEventListener("resize", onWindowResize);
            renderer?.dispose();
            // Clean up geometries/materials if needed
        };
    });
</script>

<div
    bind:this={container}
    class="fixed inset-0 pointer-events-none z-[99999]"
    style="mix-blend-mode: screen;"
></div>
