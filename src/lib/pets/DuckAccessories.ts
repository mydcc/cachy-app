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

import * as THREE from "three";

export interface DuckAccessories {
    glasses: THREE.Group;
    hat: THREE.Group;
    crown: THREE.Group;
    cape: THREE.Group;
}

/**
 * Erstellt alle visuellen Accessoires der Ente.
 * Alle Gruppen sind initial unsichtbar (visible = false).
 * Sie werden relativ zum übergebenen head- oder duckGroup-Objekt positioniert.
 */
export function createAccessories(
    head: THREE.Object3D,
    duckGroup: THREE.Group
): DuckAccessories {
    const glasses = createGlasses(head);
    const hat = createHat(head);
    const crown = createCrown(head);
    const cape = createCape(duckGroup);

    return { glasses, hat, crown, cape };
}

// ─── Sonnenbrille (Level 2) ───────────────────────────────────────────────────

function createGlasses(head: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    const lensMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.9,
    });
    const lensGeom = new THREE.BoxGeometry(0.15, 0.1, 0.05);

    const leftLens = new THREE.Mesh(lensGeom, lensMat);
    leftLens.position.set(-0.15, 0, 0);
    group.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeom, lensMat);
    rightLens.position.set(0.15, 0, 0);
    group.add(rightLens);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), lensMat);
    group.add(bridge);

    group.position.set(0, 0.15, 0.35);
    group.visible = false;
    head.add(group);
    return group;
}

// ─── Zylinderhut (Level 5) ───────────────────────────────────────────────────

function createHat(head: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    const hatMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.0,
    });
    const brimMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.9,
        metalness: 0.0,
    });

    // Zylinder (Korpus)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 24), hatMat);
    barrel.position.y = 0.14;
    group.add(barrel);

    // Krempe
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.04, 24), brimMat);
    brim.position.y = 0.0;
    group.add(brim);

    group.position.set(0, 0.42, 0);
    group.visible = false;
    head.add(group);
    return group;
}

// ─── Krone (Level 10) ────────────────────────────────────────────────────────

function createCrown(head: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        roughness: 0.1,
        metalness: 0.95,
    });

    // Krone-Ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 24), goldMat);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // 5 Zacken
    const spikeCount = 5;
    for (let i = 0; i < spikeCount; i++) {
        const angle = (i / spikeCount) * Math.PI * 2;
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.045, 0.15, 6),
            goldMat
        );
        spike.position.set(
            Math.sin(angle) * 0.19,
            0.075,
            Math.cos(angle) * 0.19
        );
        group.add(spike);
    }

    group.position.set(0, 0.44, 0);
    group.visible = false;
    head.add(group);
    return group;
}

// ─── Cape / Königsmantel (Level 20) ──────────────────────────────────────────

function createCape(duckGroup: THREE.Group): THREE.Group {
    const group = new THREE.Group();
    const capeMat = new THREE.MeshStandardMaterial({
        color: 0x6a0dad, // Königliches Purpur / Violett
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });
    const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        roughness: 0.2,
        metalness: 0.9,
    });
    const rubyMat = new THREE.MeshStandardMaterial({
        color: 0xd50000,
        roughness: 0.1,
        metalness: 0.3,
    });

    // Hauptmantel (umhüllt Rücken & Flanken, sichtbar von allen Seiten)
    const geom = new THREE.CylinderGeometry(
        0.54,
        0.74,
        0.9,
        24,
        8,
        true,
        Math.PI * 0.35,
        Math.PI * 1.3
    );
    geom.userData.origPositions = geom.attributes.position.clone();

    const capeMesh = new THREE.Mesh(geom, capeMat);
    capeMesh.name = "cape_mesh";
    capeMesh.position.set(0, -0.05, -0.05);
    capeMesh.rotation.x = -0.15; // leicht nach hinten geweht
    group.add(capeMesh);

    // Goldener Kragen / Halskette
    const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.44, 0.025, 8, 24, Math.PI * 1.5),
        goldMat
    );
    collar.position.set(0, 0.42, 0.12);
    collar.rotation.x = Math.PI / 3;
    collar.rotation.z = -Math.PI / 4;
    group.add(collar);

    // Rubin-Brosche am Hals
    const brooch = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06, 0),
        rubyMat
    );
    brooch.position.set(0, 0.44, 0.42);
    group.add(brooch);

    group.position.set(0, 0, 0);
    group.visible = false;
    duckGroup.add(group);
    return group;
}

/**
 * Animiert das Cape wellenartig. Wird pro Frame in update() aufgerufen,
 * wenn das Cape sichtbar ist.
 */
export function animateCape(cape: THREE.Group, time: number): void {
    const mesh = cape.getObjectByName("cape_mesh") as THREE.Mesh | undefined;
    if (!mesh) return;

    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.attributes.position;
    const orig = geom.userData.origPositions as THREE.BufferAttribute | undefined;
    if (!orig) return;

    for (let i = 0; i < pos.count; i++) {
        const origX = orig.getX(i);
        const origY = orig.getY(i);
        const origZ = orig.getZ(i);

        // Wehen im unteren Bereich des Mantels (origY < 0.1)
        if (origY < 0.1) {
            const factor = Math.abs(origY - 0.1) / 0.8;
            const wave = Math.sin(time * 3 + origX * 4 + origY * 2) * 0.06 * factor;
            pos.setZ(i, origZ - wave);
            pos.setX(i, origX + Math.sin(time * 2 + origY * 3) * 0.02 * factor);
        } else {
            pos.setXYZ(i, origX, origY, origZ);
        }
    }
    pos.needsUpdate = true;
}
