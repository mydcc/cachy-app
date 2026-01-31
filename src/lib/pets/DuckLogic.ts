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

/*
 * Copyright (C) 2026 MYDCT
 */

import * as THREE from "three";
import { browser } from "$app/environment";

export class DuckLogic {
    private scene: THREE.Scene;
    private group: THREE.Group;
    private head: THREE.Mesh | null = null;
    private beak: THREE.Mesh | null = null;
    private body: THREE.Mesh | null = null;
    private leftWing: THREE.Mesh | null = null;
    private rightWing: THREE.Mesh | null = null;
    private glasses: THREE.Group | null = null;

    private state: "IDLE" | "EATING" | "CELEBRATING" = "IDLE";
    private animationTime = 0;
    private eatTimer = 0;

    // State Persistence
    private xp = 0;
    private level = 1;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.scale.set(1.5, 1.5, 1.5);
        // Position: Bottom Left corner, next to the chat button area
        this.group.position.set(-8.5, -6.5, 0);
        this.group.rotation.y = 1.0; // Face inwards towards the center
        this.loadState();
    }

    private loadState() {
        if (!browser) return;
        const stored = localStorage.getItem("duck_dao_state");
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.xp = data.xp || 0;
                this.level = Math.floor(this.xp / 100) + 1;
            } catch (e) {
                console.error("Failed to load duck state", e);
            }
        }
    }

    private saveState() {
        if (!browser) return;
        localStorage.setItem("duck_dao_state", JSON.stringify({ xp: this.xp, level: this.level }));
    }

    public init() {
        console.log("DuckLogic: Initializing 🦆");
        this.createDuckGeometry();
        this.scene.add(this.group);
        this.updateAppearance();
    }

    private createDuckGeometry() {
        // Materials
        const yellowMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.4,
            metalness: 0.1
        });
        const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff8c00 });
        const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        // Body
        this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), yellowMat);
        this.body.scale.set(1, 0.8, 1);
        this.group.add(this.body);

        // Head
        this.head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 32), yellowMat);
        this.head.position.set(0, 0.6, 0.3);
        this.group.add(this.head);

        // Beak
        this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 32), orangeMat);
        this.beak.rotation.x = -Math.PI / 2;
        this.beak.position.set(0, 0, 0.35); // Relative to head is better, but adding to head group is easier
        this.head.add(this.beak);

        // Eyes
        const eyeGeom = new THREE.SphereGeometry(0.05, 16, 16);
        const leftEye = new THREE.Mesh(eyeGeom, blackMat);
        leftEye.position.set(-0.15, 0.1, 0.3);
        this.head.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeom, blackMat);
        rightEye.position.set(0.15, 0.1, 0.3);
        this.head.add(rightEye);

        // Wings
        const wingGeom = new THREE.SphereGeometry(0.3, 32, 16);
        this.leftWing = new THREE.Mesh(wingGeom, yellowMat);
        this.leftWing.scale.set(0.2, 1, 0.5);
        this.leftWing.position.set(-0.55, 0.1, 0);
        this.leftWing.rotation.z = 0.2;
        this.group.add(this.leftWing);

        this.rightWing = new THREE.Mesh(wingGeom, yellowMat);
        this.rightWing.scale.set(0.2, 1, 0.5);
        this.rightWing.position.set(0.55, 0.1, 0);
        this.rightWing.rotation.z = -0.2;
        this.group.add(this.rightWing);

        // Sunglasses (Hidden by default, shown at level 2)
        this.glasses = new THREE.Group();
        const lensGeom = new THREE.BoxGeometry(0.15, 0.1, 0.05);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });

        const leftLens = new THREE.Mesh(lensGeom, lensMat);
        leftLens.position.set(-0.15, 0, 0);
        this.glasses.add(leftLens);

        const rightLens = new THREE.Mesh(lensGeom, lensMat);
        rightLens.position.set(0.15, 0, 0);
        this.glasses.add(rightLens);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), lensMat);
        this.glasses.add(bridge);

        this.glasses.position.set(0, 0.65, 0.65);
        this.glasses.visible = false;
        this.group.add(this.glasses); // Attach to group or head? Head is better if animated.
        this.head.add(this.glasses); // Re-parent to head
        this.glasses.position.set(0, 0.15, 0.35); // Adjust relative to head
    }

    private updateAppearance() {
        if (this.level >= 2 && this.glasses) {
            this.glasses.visible = true;
        }
    }

    public feed(amount: number) {
        this.xp += amount;
        const oldLevel = this.level;
        this.level = Math.floor(this.xp / 5) + 1; // Fast leveling for MVP (5 feeds = lvl 2)

        if (this.level > oldLevel) {
            this.state = "CELEBRATING";
            this.animationTime = 0;
            this.updateAppearance();
            console.log("Duck leveled up!", this.level);
        } else {
            this.state = "EATING";
            this.eatTimer = 1.0; // 1 second eat animation
        }

        this.saveState();
    }

    public update(dt: number) {
        this.animationTime += dt;

        // Idle floating
        this.group.position.y = -6.5 + Math.sin(this.animationTime * 2) * 0.1;

        // Rotation to face slightly to the right/center
        this.group.rotation.y = 1.0 + Math.sin(this.animationTime * 0.5) * 0.1;

        if (this.state === "EATING") {
            this.eatTimer -= dt;
            if (this.eatTimer <= 0) {
                this.state = "IDLE";
                if (this.head) this.head.position.y = 0.6; // Reset
            } else {
                // Bob head more intensely
                if (this.head) {
                    this.head.position.y = 0.6 + Math.sin(this.animationTime * 25) * 0.1;
                    this.head.rotation.x = Math.sin(this.animationTime * 25) * 0.2;
                }
                // Flap wings faster
                if (this.leftWing) this.leftWing.rotation.z = 0.2 + Math.sin(this.animationTime * 40) * 0.7;
                if (this.rightWing) this.rightWing.rotation.z = -0.2 - Math.sin(this.animationTime * 40) * 0.7;
            }
        } else if (this.state === "CELEBRATING") {
            // Spin jump
            this.group.rotation.y += dt * 10;
            this.group.position.y += Math.sin(this.animationTime * 10) * 0.5;

            if (this.animationTime > 2.0) {
                this.state = "IDLE";
            }
        }
    }

    public getGroup() {
        return this.group;
    }
}
