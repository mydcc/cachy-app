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

// Type definition for Ammo (partial)
declare const Ammo: any;

export class StressLogic {
    private world: any = null;
    private physicsBodies: any[] = [];
    private clock = new THREE.Clock();
    private isLoaded = false;
    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    async init() {
        if (this.isLoaded) return;

        // Lazy Load Ammo
        if (typeof (window as any).Ammo !== 'function' && typeof (window as any).btDefaultCollisionConfiguration === 'undefined') {
            try {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = '/ammo/ammo.wasm.js';
                    script.onload = () => resolve();
                    script.onerror = (e) => reject(e);
                    document.head.appendChild(script);
                });

                if (typeof (window as any).Ammo === 'function') {
                    const AmmoFactory = (window as any).Ammo;
                    const ammoInstance = await AmmoFactory({
                        locateFile: (path: string) => {
                            if (path.endsWith('.wasm')) return '/ammo/ammo.wasm.wasm';
                            return path;
                        }
                    });
                    (window as any).Ammo = ammoInstance;
                }
            } catch (e) {
                console.error("Failed to load Ammo.js", e);
                return;
            }
        } else if (typeof (window as any).Ammo === 'function') {
            const AmmoFactory = (window as any).Ammo;
            const ammoInstance = await AmmoFactory({
                locateFile: (path: string) => {
                    if (path.endsWith('.wasm')) return '/ammo/ammo.wasm.wasm';
                    return path;
                }
            });
            (window as any).Ammo = ammoInstance;
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

    private createRigidBody(threeObject: THREE.Object3D, physicsShape: any, mass: number, pos: THREE.Vector3) {
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

    public smashWindow(rect: DOMRect, impulsePoint?: THREE.Vector3) {
        if (!this.world || !this.isLoaded) return;

        // Convert DOM Rect to 3D roughly
        // NOTE: This assumes we are projecting to Z=0 or similar plane in FXOverlay
        // We need the camera from FXOverlay to do this accurately, 
        // OR we just spawn generic shards in front of the camera based on screen coords.
        // Let's assume we pass in the `camera` and `screen` dims context or helper.
        // For now, simpler: Create generic shards at a "World Position" we calculate.

        // Placeholder for fracture logic:
        // accurate fracture is complex. We will spawn pre-fractured or simple geometric shards.
        const numShards = 25;
        const width = rect.width / 100; // Arbitrary scaling for 3D
        const height = rect.height / 100;

        // Voronoi-like generation is hard without library. 
        // We use random tetrahedrons for "glass" feel.
        const material = new THREE.MeshStandardMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.8,
            roughness: 0.1,
            metalness: 0.9,
            side: THREE.DoubleSide
        });

        // Calculate center in 3D (passed in or estimated?)
        // Let's assume the caller gives us the 3D center.
        // If not, we rely on FXOverlay projection logic.
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
