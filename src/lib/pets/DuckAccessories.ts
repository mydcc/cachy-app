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
 * Sie werden relativ zum übergebenen head-/body-Objekt positioniert.
 */
export function createAccessories(
    head: THREE.Object3D,
    body: THREE.Object3D
): DuckAccessories {
    const glasses = createGlasses(head);
    const hat = createHat(head);
    const crown = createCrown(head);
    const cape = createCape(body);

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

// ─── Cape (Level 20) ─────────────────────────────────────────────────────────

function createCape(body: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    const capeMat = new THREE.MeshStandardMaterial({
        color: 0x6a0dad, // Lila — passt zu keiner Theme-Farbe, aber harmonisch auf Gelb
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
    });

    // Einfaches Cape als PlaneGeometry — wird im update() animiert
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.55, 4, 4), capeMat);
    plane.name = "cape_plane";
    // Aufhängepunkt oben an der Schulter, Cape hängt nach hinten/unten
    plane.position.set(0, 0, -0.25);
    plane.rotation.x = 0.3;
    group.add(plane);

    group.position.set(0, 0.15, 0);
    group.visible = false;
    body.add(group);
    return group;
}

/**
 * Animiert das Cape wellenartig. Wird pro Frame in update() aufgerufen,
 * wenn das Cape sichtbar ist.
 */
export function animateCape(cape: THREE.Group, time: number): void {
    const plane = cape.getObjectByName("cape_plane") as THREE.Mesh | undefined;
    if (!plane) return;

    const pos = (plane.geometry as THREE.PlaneGeometry).attributes.position;
    const originalY: number[] = [];

    // Vertizes in den unteren 2/3 des Capes bewegen (obere Reihe = Befestigung)
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        // Nur untere Hälfte animieren (y < 0)
        if (y < 0) {
            const x = pos.getX(i);
            const wave = Math.sin(time * 3 + x * 4) * 0.04 + Math.sin(time * 2) * 0.02;
            pos.setZ(i, wave);
        }
        originalY.push(y);
    }
    pos.needsUpdate = true;
}
