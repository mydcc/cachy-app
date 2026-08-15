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
import { DuckState } from "./types";
import { animateCape } from "./DuckAccessories";
import type { DuckAccessories } from "./DuckAccessories";

export interface DuckMeshRefs {
    group: THREE.Group;
    head: THREE.Mesh;
    leftWing: THREE.Mesh;
    rightWing: THREE.Mesh;
    sleepEyes: THREE.Group;
    accessories: DuckAccessories;
}

/**
 * Wendet den passenden Animations-Frame für den aktuellen Zustand an.
 * Gibt zurück, ob der Zustand abgelaufen ist (Timer <= 0).
 */
export function applyStateAnimation(
    state: DuckState,
    refs: DuckMeshRefs,
    time: number,
    dt: number,
    stateTimer: number
): boolean {
    if (refs.accessories.cape.visible) {
        animateCape(refs.accessories.cape, time);
    }
    void dt;

    switch (state) {
        case DuckState.IDLE:
            applyIdle(refs, time);
            return false;

        case DuckState.EATING:
            applyEating(refs, time);
            return stateTimer <= 0;

        case DuckState.CELEBRATING:
            applyCelebrating(refs, time);
            return stateTimer <= 0;

        case DuckState.SAD:
            applySad(refs, time);
            return stateTimer <= 0;

        case DuckState.SLEEPING:
            applySleeping(refs, time);
            return false; // läuft bis zum nächsten Event

        case DuckState.PETTING:
            applyPetting(refs, time);
            return stateTimer <= 0;

        default:
            return false;
    }
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────

function applyIdle(refs: DuckMeshRefs, time: number): void {
    // sanftes Auf/Ab und leichte Rotation — wird in DuckLogic.update() auf group gesetzt
    refs.head.position.y = 0.6;
    refs.head.rotation.x = 0;
    refs.leftWing.rotation.z = 0.2 + Math.sin(time * 1.5) * 0.05;
    refs.rightWing.rotation.z = -0.2 - Math.sin(time * 1.5) * 0.05;
    refs.sleepEyes.visible = false;
}

// ─── EATING ───────────────────────────────────────────────────────────────────

function applyEating(refs: DuckMeshRefs, time: number): void {
    refs.head.position.y = 0.6 + Math.sin(time * 25) * 0.1;
    refs.head.rotation.x = Math.sin(time * 25) * 0.2;
    refs.leftWing.rotation.z = 0.2 + Math.sin(time * 40) * 0.7;
    refs.rightWing.rotation.z = -0.2 - Math.sin(time * 40) * 0.7;
    refs.sleepEyes.visible = false;
}

// ─── CELEBRATING ──────────────────────────────────────────────────────────────

function applyCelebrating(refs: DuckMeshRefs, time: number): void {
    // Spin-Effekt wird in DuckLogic.update() auf group.rotation.y gesetzt
    refs.head.position.y = 0.6;
    refs.head.rotation.x = 0;
    refs.leftWing.rotation.z = 0.2 + Math.sin(time * 20) * 1.0;
    refs.rightWing.rotation.z = -0.2 - Math.sin(time * 20) * 1.0;
    refs.sleepEyes.visible = false;
}

// ─── SAD ──────────────────────────────────────────────────────────────────────

function applySad(refs: DuckMeshRefs, time: number): void {
    // Kopf gesenkt, Flügel hängen
    refs.head.position.y = 0.4;
    refs.head.rotation.x = 0.4; // vorgebeugt
    refs.leftWing.rotation.z = 0.8 + Math.sin(time * 0.8) * 0.05;
    refs.rightWing.rotation.z = -0.8 - Math.sin(time * 0.8) * 0.05;
    refs.sleepEyes.visible = false;
}

// ─── SLEEPING ─────────────────────────────────────────────────────────────────

function applySleeping(refs: DuckMeshRefs, time: number): void {
    // Sehr langsames Auf/Ab, Schlaf-Augen einblenden
    refs.head.position.y = 0.55 + Math.sin(time * 0.4) * 0.03;
    refs.head.rotation.x = 0.15; // leicht geneigt
    refs.leftWing.rotation.z = 0.6;
    refs.rightWing.rotation.z = -0.6;
    refs.sleepEyes.visible = true;
}

// ─── PETTING ──────────────────────────────────────────────────────────────────

function applyPetting(refs: DuckMeshRefs, time: number): void {
    refs.head.position.y = 0.6 + Math.abs(Math.sin(time * 12)) * 0.12;
    refs.head.rotation.x = 0;
    refs.leftWing.rotation.z = 0.2 + Math.sin(time * 20) * 0.9;
    refs.rightWing.rotation.z = -0.2 - Math.sin(time * 20) * 0.9;
    refs.sleepEyes.visible = false;
}

/**
 * Setzt alle Referenzen auf den IDLE-Zustand zurück.
 */
export function resetToIdle(refs: DuckMeshRefs): void {
    refs.head.position.y = 0.6;
    refs.head.rotation.x = 0;
    refs.leftWing.rotation.z = 0.2;
    refs.rightWing.rotation.z = -0.2;
    refs.sleepEyes.visible = false;
}
