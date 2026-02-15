<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import * as THREE from "three";
    import { effectsState } from "../../stores/effects.svelte";
    import { StressLogic } from "../../lib/physics/StressLogic";
    import { DuckLogic } from "../../lib/pets/DuckLogic";

    let container: HTMLDivElement;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let animationId: number | null = null;
    let clock = new THREE.Clock();
    let stressLogic: StressLogic | null = null;
    let duckLogic: DuckLogic | null = null;

    let progress = 0;
    let isFlying = false;
    let startPos = new THREE.Vector3();
    let targetPos = new THREE.Vector3(0, 0, 5);
    let velocity = new THREE.Vector3();
    let gravity = -9.8;
    let usePhysics = false;

    // --- Meshes ---
    let orbMesh: THREE.Mesh | null = null;
    let boltLine: THREE.Line | null = null;
    let coinMesh: THREE.Mesh | null = null;
    let matrixPoints: THREE.Points | null = null;
    let shards: THREE.Mesh[] = [];
    const SHARD_COUNT = 15;

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
    const boltSegments = 20;
    const boltGeometry = new THREE.BufferGeometry();
    const boltPositions = new Float32Array(boltSegments * 3);
    boltGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(boltPositions, 3),
    );

    const boltMaterial = new THREE.LineBasicMaterial({
        color: 0x00ffff,
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
        (boltLine.material as THREE.LineBasicMaterial).color.setHSL(
            0.5 + Math.random() * 0.2,
            1,
            0.5 + Math.random() * 0.5,
        );
    }

    // --- 3. CRYPTO COIN ---
    function createCoinTexture() {
        if (!browser) return new THREE.Texture();
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "#FFD700";
            ctx.fillRect(0, 0, 128, 128);
            ctx.strokeStyle = "#B8860B";
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(64, 64, 55, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#B8860B";
            ctx.font = "bold 80px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("₿", 64, 64);
        }
        return new THREE.CanvasTexture(canvas);
    }

    const coinMaterial = new THREE.MeshBasicMaterial({
        map: createCoinTexture(),
        color: 0xffffff,
        transparent: true,
    });

    function createCoin() {
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 32);
        geometry.rotateX(Math.PI / 2);
        coinMesh = new THREE.Mesh(geometry, coinMaterial);
        coinMesh.visible = false;
        scene?.add(coinMesh);
    }

    // --- 4. DATA STREAM ---
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

    // --- 5. SHARDS (Explosion) ---
    function createShards() {
        const geom = new THREE.TetrahedronGeometry(0.2);
        for (let i = 0; i < SHARD_COUNT; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00ff9d,
                transparent: true,
                opacity: 0.8,
            });
            const shard = new THREE.Mesh(geom, mat);
            shard.visible = false;
            shard.userData = { vel: new THREE.Vector3() };
            shards.push(shard);
            scene?.add(shard);
        }
    }

    function triggerShards(pos: THREE.Vector3) {
        shards.forEach((shard) => {
            shard.position.copy(pos);
            shard.visible = true;
            (shard.material as THREE.MeshBasicMaterial).opacity = 1.0;
            shard.userData.vel.set(
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 10,
            );
            setTimeout(() => (shard.visible = false), 1500);
        });
    }

    function updateShards(dt: number) {
        shards.forEach((shard) => {
            if (!shard.visible) return;
            shard.position.addScaledVector(shard.userData.vel, dt);
            shard.rotation.x += dt * 5;
            shard.rotation.y += dt * 3;
            (shard.material as THREE.MeshBasicMaterial).opacity -= dt * 0.7;
        });
    }

    // --- PHYSICS & LOGIC ---

    function checkWindowImpact(obj: THREE.Object3D) {
        if (!camera || !browser) return;
        const pos2D = obj.position.clone().project(camera);
        const screenX = ((pos2D.x + 1) * window.innerWidth) / 2;
        const screenY = ((-pos2D.y + 1) * window.innerHeight) / 2;

        const elements = document.querySelectorAll(
            ".window-frame, .glass-panel",
        );
        elements.forEach((el) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dist = Math.sqrt(
                Math.pow(screenX - centerX, 2) + Math.pow(screenY - centerY, 2),
            );

            if (dist < 180) {
                const intensity = (1 - dist / 180) * 12;
                (el as HTMLElement).style.transform =
                    `translate(${(Math.random() - 0.5) * intensity}px, ${(Math.random() - 0.5) * intensity}px) scale(${1 + intensity * 0.001})`;
                setTimeout(() => {
                    (el as HTMLElement).style.transform = "";
                }, 60);
            }
        });
    }

    function getActiveObject() {
        if (activeEffect === "orb") return orbMesh;
        if (activeEffect === "bolt") return boltLine;
        if (activeEffect === "coin") return coinMesh;
        if (activeEffect === "matrix") return matrixPoints;
        return null;
    }

    function finishAnimation() {
        isFlying = false;
        const obj = getActiveObject();
        if (obj && (activeEffect === "coin" || activeEffect === "orb")) {
            triggerShards(obj.position);
        }
        if (orbMesh) orbMesh.visible = false;
        if (boltLine) boltLine.visible = false;
        if (coinMesh) coinMesh.visible = false;
        if (matrixPoints) matrixPoints.visible = false;
    }

    function launch(rect: DOMRect) {
        if (!camera) return;
        const x = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
        const y = -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;
        const vec = new THREE.Vector3(x, y, 0);
        vec.unproject(camera);
        const dir = vec.sub(camera.position).normalize();
        const distance = (0 - camera.position.z) / dir.z;
        const start = camera.position.clone().add(dir.multiplyScalar(distance));
        startPos.copy(start);
        targetPos.set(0, 0, camera.position.z - 2);

        const effects: ("orb" | "bolt" | "coin" | "matrix")[] = [
            "orb",
            "bolt",
            "coin",
            "matrix",
        ];
        activeEffect = effects[Math.floor(Math.random() * effects.length)];

        const obj = getActiveObject();
        if (obj) {
            obj.position.copy(startPos);
            obj.scale.set(0.1, 0.1, 0.1);
            obj.visible = true;
            if (activeEffect === "coin")
                obj.rotation.set(
                    Math.random() * Math.PI,
                    Math.random() * Math.PI,
                    0,
                );
        }

        progress = 0;
        isFlying = true;
        usePhysics = activeEffect === "coin" || activeEffect === "orb";
        if (usePhysics) {
            velocity.copy(targetPos).sub(startPos).multiplyScalar(1.2);
            velocity.y += 6;
        }
    }

    $effect(() => {
        if (effectsState.projectileOrigin) {
            launch(effectsState.projectileOrigin);
            effectsState.consumeProjectileEvent();
            if (!animationId) {
                clock.start();
                animationId = requestAnimationFrame(animate);
            }
        }
    });

    $effect(() => {
        if (effectsState.smashTarget && camera && stressLogic) {
            const { rect, id } = effectsState.smashTarget;
            const x =
                ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
            const y =
                -((rect.top + rect.height / 2) / window.innerHeight) * 2 + 1;
            const vec = new THREE.Vector3(x, y, 0);
            vec.unproject(camera);
            const dir = vec.sub(camera.position).normalize();
            const distance = (0 - camera.position.z) / dir.z;
            const center = camera.position
                .clone()
                .add(dir.multiplyScalar(distance));
            const worldWidth = (rect.width / window.innerWidth) * 40;
            const worldHeight = (rect.height / window.innerHeight) * 30;

            stressLogic.spawnShardsAt(center, worldWidth, worldHeight);

            if (!animationId) {
                clock.start();
                animationId = requestAnimationFrame(animate);
            }
            effectsState.consumeSmashEvent();
        }
    });

    $effect(() => {
        if (effectsState.feedEvent && duckLogic) {
            duckLogic.feed(effectsState.feedEvent.amount);
            effectsState.consumeFeedEvent();

            if (!animationId) {
                clock.start();
                animationId = requestAnimationFrame(animate);
            }
        }
    });

    function animate() {
        if (!renderer || !scene || !camera) return;

        const anyShardVisible = shards.some((s) => s.visible);
        let duckActive = !!duckLogic;

        if (
            !isFlying &&
            !anyShardVisible &&
            (!stressLogic || !stressLogic["physicsBodies"]?.length) &&
            !duckActive
        ) {
            animationId = null;
            return;
        }

        const dt = Math.min(clock.getDelta(), 0.1);
        const elapsed = clock.getElapsedTime();

        orbMaterial.uniforms.uTime.value = elapsed;
        updateShards(dt);
        if (stressLogic) stressLogic.update(dt);
        if (duckLogic) duckLogic.update(dt);

        if (isFlying) {
            progress += dt * 1.3;
            if (progress >= 1.0) finishAnimation();

            const obj = getActiveObject();
            if (obj) {
                if (usePhysics) {
                    velocity.y += gravity * dt * 0.6;
                    obj.position.addScaledVector(velocity, dt);
                    if (obj.position.y < -6 && velocity.y < 0) {
                        velocity.y *= -0.5;
                        obj.position.y = -6;
                    }
                    obj.position.z += (targetPos.z - obj.position.z) * dt * 2.5;
                } else {
                    obj.position.lerpVectors(
                        startPos,
                        targetPos,
                        Math.pow(progress, 3),
                    );
                }
                const scale = 0.5 + progress * 4.5;
                obj.scale.set(scale, scale, scale);
                checkWindowImpact(obj);

                if (activeEffect === "bolt") updateBolt(elapsed);
                if (activeEffect === "coin") {
                    obj.rotation.x += dt * 12;
                    obj.rotation.y += dt * 7;
                }
                if (activeEffect === "matrix") obj.rotation.z -= dt * 2.5;
            }
        }

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
    }

    onMount(() => {
        if (!browser || !container) return;
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

        createOrb();
        createBolt();
        createCoin();
        createMatrix();
        // Create Shards
        createShards();

        // --- Lighting ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        // Init Physics
        stressLogic = new StressLogic(scene);
        stressLogic.init().then(() => {
            if (import.meta.env.DEV) console.debug("Ammo Physics Loaded");
        });

        // Init Duck
        duckLogic = new DuckLogic(scene);
        duckLogic.init();

        // Start animation loop to show duck idle
        if (!animationId) {
            clock.start();
            animationId = requestAnimationFrame(animate);
        }

        window.addEventListener("resize", onWindowResize);
        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            window.removeEventListener("resize", onWindowResize);
            renderer?.dispose();
        };
    });

    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
</script>

<div
    bind:this={container}
    class="fixed inset-0 pointer-events-none z-[99999]"
    style="mix-blend-mode: screen;"
></div>
