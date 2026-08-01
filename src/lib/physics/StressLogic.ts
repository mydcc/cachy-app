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

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';

// Ammo.js is a Bullet Physics WASM build loaded dynamically at runtime
// (see init()), not an npm dependency — there is no official or
// community TypeScript package for it. These interfaces declare only
// the narrow subset of its API this file actually calls, not the full
// Bullet Physics surface.
interface AmmoVector3 {
    x(): number;
    y(): number;
    z(): number;
}

interface AmmoQuaternion {
    x(): number;
    y(): number;
    z(): number;
    w(): number;
}

interface AmmoTransform {
    setIdentity(): void;
    setOrigin(origin: AmmoVector3): void;
    getOrigin(): AmmoVector3;
    getRotation(): AmmoQuaternion;
}

interface AmmoCollisionShape {
    addPoint(point: AmmoVector3): void;
    calculateLocalInertia(mass: number, inertia: AmmoVector3): void;
}

interface AmmoMotionState {
    getWorldTransform(transform: AmmoTransform): void;
}

interface AmmoRigidBody {
    userData: { mesh: THREE.Object3D };
    setLinearVelocity(velocity: AmmoVector3): void;
    setAngularVelocity(velocity: AmmoVector3): void;
    getMotionState(): AmmoMotionState | null;
}

interface AmmoWorld {
    setGravity(gravity: AmmoVector3): void;
    stepSimulation(deltaTime: number, maxSubSteps: number): void;
    addRigidBody(body: AmmoRigidBody): void;
    removeRigidBody(body: AmmoRigidBody): void;
}

interface AmmoNamespace {
    btVector3: new (x: number, y: number, z: number) => AmmoVector3;
    btTransform: new () => AmmoTransform;
    btDefaultCollisionConfiguration: new () => unknown;
    btCollisionDispatcher: new (config: unknown) => unknown;
    btDbvtBroadphase: new () => unknown;
    btSequentialImpulseConstraintSolver: new () => unknown;
    btDiscreteDynamicsWorld: new (
        dispatcher: unknown,
        broadphase: unknown,
        solver: unknown,
        config: unknown,
    ) => AmmoWorld;
    btConvexHullShape: new () => AmmoCollisionShape;
    btDefaultMotionState: new (transform: AmmoTransform) => AmmoMotionState;
    btRigidBodyConstructionInfo: new (
        mass: number,
        motionState: AmmoMotionState,
        shape: AmmoCollisionShape,
        localInertia: AmmoVector3,
    ) => unknown;
    btRigidBody: new (info: unknown) => AmmoRigidBody;
}

// window.Ammo cycles through three shapes while init() lazy-loads the
// WASM module: absent, the factory function (right after the script
// tag loads), then the resolved namespace (once the factory settles).
type AmmoWindow = Window & {
    Ammo?: AmmoNamespace | ((opts: { locateFile: (path: string) => string }) => Promise<AmmoNamespace>);
};

declare const Ammo: AmmoNamespace;

export class StressLogic {
    private world: AmmoWorld | null = null;
    private physicsBodies: AmmoRigidBody[] = [];
    private clock = new THREE.Clock();
    private isLoaded = false;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    private static async resolveAmmoFactory(win: AmmoWindow): Promise<void> {
        const factory = win.Ammo;
        if (typeof factory !== 'function') return;
        const ammoInstance = await factory({
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) return '/ammo/ammo.wasm.wasm';
                return path;
            }
        });
        win.Ammo = ammoInstance;
    }

    async init() {
        if (this.isLoaded) return;

        const win = window as AmmoWindow;

        // Lazy Load Ammo
        if (typeof win.Ammo !== 'function' && typeof (window as unknown as { btDefaultCollisionConfiguration?: unknown }).btDefaultCollisionConfiguration === 'undefined') {
            try {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = '/ammo/ammo.wasm.js';
                    script.onload = () => resolve();
                    script.onerror = (e) => reject(e);
                    document.head.appendChild(script);
                });

                await StressLogic.resolveAmmoFactory(win);
            } catch (e) {
                console.error("Failed to load Ammo.js", e);
                throw e;
            }
        } else if (typeof win.Ammo === 'function') {
            await StressLogic.resolveAmmoFactory(win);
        }

        this.setupPhysicsWorld();
        this.isLoaded = true;
    }

    private setupPhysicsWorld() {
        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const broadphase = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();
        this.world = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
        this.world.setGravity(new Ammo.btVector3(0, -9.8, 0));
    }

    private createConvexHullPhysicsShape(coords: Float32Array) {
        const shape = new Ammo.btConvexHullShape();
        for (let i = 0, il = coords.length; i < il; i += 3) {
            const tempVec = new Ammo.btVector3(coords[i], coords[i + 1], coords[i + 2]);
            shape.addPoint(tempVec);
        }
        return shape;
    }

    private createRigidBody(threeObject: THREE.Object3D, physicsShape: AmmoCollisionShape, mass: number, pos: THREE.Vector3) {
        if (!this.world) return null;

        const startTransform = new Ammo.btTransform();
        startTransform.setIdentity();
        const origin = new Ammo.btVector3(pos.x, pos.y, pos.z);
        startTransform.setOrigin(origin);

        const localInertia = new Ammo.btVector3(0, 0, 0);
        physicsShape.calculateLocalInertia(mass, localInertia);

        const myMotionState = new Ammo.btDefaultMotionState(startTransform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, myMotionState, physicsShape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);

        threeObject.userData.physicsBody = body;
        body.userData = { mesh: threeObject }; // Link back

        this.scene.add(threeObject);
        this.world.addRigidBody(body);
        this.physicsBodies.push(body);
        return body;
    }

    // New signature to accept 3D center
    public spawnShardsAt(center: THREE.Vector3, width: number, height: number) {
        if (!this.world) return;

        const material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x112244,
            transparent: true,
            opacity: 0.9,
            roughness: 0.0,
            metalness: 1.0,
            flatShading: true
        });

        for (let i = 0; i < 30; i++) {
            // Random Shard Geometry
            const geom = new ConvexGeometry([
                new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
                new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
                new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
                new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5),
            ]);
            geom.scale(width / 3, height / 3, 0.5); // flatten slightly

            const mesh = new THREE.Mesh(geom, material);
            mesh.position.copy(center);
            mesh.position.x += (Math.random() - 0.5) * width;
            mesh.position.y += (Math.random() - 0.5) * height;

            const body = this.createRigidBody(mesh, this.createConvexHullPhysicsShape(geom.getAttribute('position').array as Float32Array), 1.0, mesh.position);
            if (!body) continue;

            // Explosive Force
            const force = new Ammo.btVector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random()) * 5);
            body.setLinearVelocity(force);
            body.setAngularVelocity(new Ammo.btVector3(Math.random() * 10, Math.random() * 10, Math.random() * 10));
        }
    }

    public update(dt: number) {
        if (!this.world) return;
        this.world.stepSimulation(dt, 10);

        const tempTrans = new Ammo.btTransform();

        for (let i = 0; i < this.physicsBodies.length; i++) {
            const body = this.physicsBodies[i];
            const mesh = body.userData.mesh;
            const ms = body.getMotionState();
            if (ms) {
                ms.getWorldTransform(tempTrans);
                const p = tempTrans.getOrigin();
                const q = tempTrans.getRotation();
                mesh.position.set(p.x(), p.y(), p.z());
                mesh.quaternion.set(q.x(), q.y(), q.z(), q.w());

                // Cleanup if too low
                if (mesh.position.y < -30) {
                    this.world.removeRigidBody(body);
                    this.scene.remove(mesh);
                    this.physicsBodies.splice(i, 1);
                    i--;
                }
            }
        }
    }
}
