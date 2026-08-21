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
import { browser } from "$app/environment";
import { DuckState, DUCK_STATE_PRIORITY } from "./types";
import type { DuckDaoState, DuckTriggerEvent } from "./types";
import { createAccessories } from "./DuckAccessories";
import type { DuckAccessories } from "./DuckAccessories";
import { applyStateAnimation, resetToIdle } from "./DuckAnimations";
import type { DuckMeshRefs } from "./DuckAnimations";
import { checkNewAchievements, DUCK_ACHIEVEMENTS } from "./DuckAchievements";
import { toastService } from "../../services/toastService.svelte";
import { _ } from "../../locales/i18n";
import { get } from "svelte/store";
import type { TranslationKey } from "../../locales/schema";

const STORAGE_KEY = "duck_dao_state";
const XP_PER_LEVEL = 50;
const SLEEP_AFTER_SECONDS = 300; // 5 Minuten Inaktivität

export class DuckLogic {
    private scene: THREE.Scene;
    private group: THREE.Group;

    // Geometrie-Referenzen
    private head: THREE.Mesh | null = null;
    private beak: THREE.Mesh | null = null;
    private body: THREE.Mesh | null = null;
    private leftWing: THREE.Mesh | null = null;
    private rightWing: THREE.Mesh | null = null;
    private sleepEyes: THREE.Group | null = null;
    private accessories: DuckAccessories | null = null;

    // Zustands-Maschine
    private state: DuckState = DuckState.IDLE;
    private animationTime = 0;
    private stateTimer = 0;
    private inactivityTimer = 0;

    // Sättigung & Spam-Erkennung
    private fullness = 0;
    private recentPetTimestamps: number[] = [];

    // Persistenter Zustand
    private xp = 0;
    private level = 1;
    private currentStreak = 0;
    private longestStreak = 0;
    private lastActiveDate = "";
    private totalFeeds = 0;
    private achievements: string[] = [];

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.scale.set(1.5, 1.5, 1.5);
        this.group.position.set(-8.5, -6.5, 0);
        this.group.rotation.y = 1.0;
        this.loadState();
    }

    // ─── Persistenz ───────────────────────────────────────────────────────────

    private loadState(): void {
        if (!browser) return;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data: Partial<DuckDaoState> = JSON.parse(stored);
                this.xp = data.xp ?? 0;
                this.level = data.level ?? Math.floor(this.xp / XP_PER_LEVEL) + 1;
                this.currentStreak = data.currentStreak ?? 0;
                this.longestStreak = data.longestStreak ?? 0;
                this.lastActiveDate = data.lastActiveDate ?? "";
                this.totalFeeds = data.totalFeeds ?? 0;
                this.achievements = data.achievements ?? [];
            } catch (e) {
                console.error("DuckLogic: Failed to load duck state", e);
            }
        }
        this.updateStreak();
        this.saveState();
    }

    private saveState(): void {
        if (!browser) return;
        this.checkAndUnlockAchievements();
        const state: DuckDaoState = {
            xp: this.xp,
            level: this.level,
            currentStreak: this.currentStreak,
            longestStreak: this.longestStreak,
            lastActiveDate: this.lastActiveDate,
            totalFeeds: this.totalFeeds,
            achievements: this.achievements,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    private updateStreak(): void {
        const today = new Date().toISOString().slice(0, 10);
        if (!this.lastActiveDate) {
            this.currentStreak = 1;
        } else {
            const last = new Date(this.lastActiveDate);
            const now = new Date(today);
            const diffDays = Math.round(
                (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 1) {
                this.currentStreak += 1;
            } else if (diffDays > 1) {
                this.currentStreak = 1; // Streak gerissen
            }
            // diffDays === 0: selber Tag, kein Update nötig
        }
        if (this.currentStreak > this.longestStreak) {
            this.longestStreak = this.currentStreak;
        }
        this.lastActiveDate = today;
    }

    private checkAndUnlockAchievements(): void {
        const currentState: DuckDaoState = {
            xp: this.xp,
            level: this.level,
            currentStreak: this.currentStreak,
            longestStreak: this.longestStreak,
            lastActiveDate: this.lastActiveDate,
            totalFeeds: this.totalFeeds,
            achievements: this.achievements,
        };
        const newlyUnlocked = checkNewAchievements(currentState);
        if (newlyUnlocked.length > 0) {
            this.achievements = [...this.achievements, ...newlyUnlocked];
            console.log("🦆 Duck achievements unlocked:", newlyUnlocked);
            for (const id of newlyUnlocked) {
                const ach = DUCK_ACHIEVEMENTS.find((a) => a.id === id);
                if (ach) {
                    const name = get(_)(ach.nameKey as TranslationKey);
                    const desc = get(_)(ach.descriptionKey as TranslationKey);
                    toastService.success(`🏆 ${name}: ${desc}`);
                }
            }
            // Celebration-Zustand triggern (höchste Prio)
            this.transitionTo(DuckState.CELEBRATING, 2.5);
        }
    }

    // ─── Zustandsmaschine ─────────────────────────────────────────────────────

    private transitionTo(next: DuckState, duration: number): void {
        const currentPrio = DUCK_STATE_PRIORITY[this.state];
        const nextPrio = DUCK_STATE_PRIORITY[next];
        if (nextPrio >= currentPrio || this.state === DuckState.IDLE || this.state === DuckState.SLEEPING) {
            this.state = next;
            this.stateTimer = duration;
            this.animationTime = 0;
        }
    }

    // ─── Öffentliche API ──────────────────────────────────────────────────────

    public handleEvent(event: DuckTriggerEvent): void {
        // Inaktivitäts-Timer zurücksetzen
        this.inactivityTimer = 0;
        if (this.state === DuckState.SLEEPING) {
            this.state = DuckState.IDLE;
        }

        switch (event.type) {
            case "feed": {
                if (this.fullness >= 100) {
                    this.transitionTo(DuckState.ANNOYED, 2.5);
                    const msg = get(_)(("duck.full") as TranslationKey);
                    toastService.warning(msg);
                    return;
                }
                this.fullness = Math.min(100, this.fullness + 25);
                this.xp += event.amount;
                this.totalFeeds += 1;
                const oldLevel = this.level;
                this.level = Math.floor(this.xp / XP_PER_LEVEL) + 1;
                if (this.level > oldLevel) {
                    this.transitionTo(DuckState.CELEBRATING, 2.5);
                    this.updateAppearance();
                    console.log("🦆 Duck leveled up!", this.level);
                } else {
                    this.transitionTo(DuckState.EATING, 1.0);
                }
                this.saveState();
                break;
            }
            case "trade_win": {
                // Kleinerer XP-Bonus, proportional zum PnL
                const pnlNum = typeof event.pnl === "number" ? event.pnl : event.pnl.toNumber();
                const xpBonus = Math.max(5, Math.min(50, Math.floor(Math.abs(pnlNum) / 10)));
                this.xp += xpBonus;
                const oldLevel = this.level;
                this.level = Math.floor(this.xp / XP_PER_LEVEL) + 1;
                if (this.level > oldLevel) {
                    this.transitionTo(DuckState.CELEBRATING, 2.5);
                    this.updateAppearance();
                } else {
                    this.transitionTo(DuckState.CELEBRATING, 1.5);
                }
                this.saveState();
                break;
            }
            case "trade_loss": {
                this.transitionTo(DuckState.SAD, 3.0);
                break;
            }
            case "daily_login": {
                // Streak wurde bereits in loadState() aktualisiert
                this.transitionTo(DuckState.CELEBRATING, 1.0);
                this.saveState();
                break;
            }
            case "academy_complete": {
                this.xp += 20;
                this.level = Math.floor(this.xp / XP_PER_LEVEL) + 1;
                this.transitionTo(DuckState.CELEBRATING, 1.5);
                this.updateAppearance();
                this.saveState();
                break;
            }
            case "pet": {
                const now = Date.now();
                this.recentPetTimestamps = this.recentPetTimestamps.filter((t) => now - t < 2000);
                this.recentPetTimestamps.push(now);
                if (this.recentPetTimestamps.length >= 5) {
                    this.transitionTo(DuckState.ANNOYED, 2.5);
                    const msg = get(_)(("duck.annoyed") as TranslationKey);
                    toastService.warning(msg);
                } else {
                    this.transitionTo(DuckState.PETTING, 1.5);
                }
                break;
            }
        }
    }

    // ─── Initialisierung ──────────────────────────────────────────────────────

    public init(): void {
        console.log("DuckLogic: Initializing 🦆");
        this.createDuckGeometry();
        this.scene.add(this.group);
        this.updateAppearance();
    }

    private createDuckGeometry(): void {
        const yellowMat = new THREE.MeshStandardMaterial({
            color: 0xffd700,
            roughness: 0.4,
            metalness: 0.1,
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
        this.beak.position.set(0, 0, 0.35);
        this.head.add(this.beak);

        // Normal eyes (immer sichtbar, außer im Schlaf)
        const eyeGeom = new THREE.SphereGeometry(0.05, 16, 16);
        const leftEye = new THREE.Mesh(eyeGeom, blackMat);
        leftEye.position.set(-0.15, 0.1, 0.3);
        this.head.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeom, blackMat);
        rightEye.position.set(0.15, 0.1, 0.3);
        this.head.add(rightEye);

        // Schlaf-Augen (Halbkreise, initial unsichtbar)
        this.sleepEyes = this.createSleepEyes(blackMat);
        this.head.add(this.sleepEyes);

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

        // Accessoires (Sonnenbrille, Hut, Krone, Cape)
        if (this.head) {
            this.accessories = createAccessories(this.head, this.group);
        }
    }

    private createSleepEyes(mat: THREE.Material): THREE.Group {
        const group = new THREE.Group();
        // Halbkreise simuliert durch abgeflachte Zylinder
        const halfEyeGeom = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16, 1, false, 0, Math.PI);
        const leftSleep = new THREE.Mesh(halfEyeGeom, mat);
        leftSleep.position.set(-0.15, 0.1, 0.3);
        leftSleep.rotation.z = Math.PI;
        group.add(leftSleep);

        const rightSleep = new THREE.Mesh(halfEyeGeom, mat);
        rightSleep.position.set(0.15, 0.1, 0.3);
        rightSleep.rotation.z = Math.PI;
        group.add(rightSleep);

        group.visible = false;
        return group;
    }

    private updateAppearance(): void {
        if (!this.accessories) return;
        this.accessories.glasses.visible = this.level >= 2;
        // Hut nur zwischen Level 5 und 9 (Krone ab 10)
        this.accessories.hat.visible = this.level >= 5 && this.level < 10;
        this.accessories.crown.visible = this.level >= 10;
        this.accessories.cape.visible = this.level >= 20;
    }

    // ─── Animation Loop ───────────────────────────────────────────────────────

    public update(dt: number): void {
        this.animationTime += dt;
        this.inactivityTimer += dt;
        this.fullness = Math.max(0, this.fullness - dt * 5);

        // Idle-Float und Basis-Rotation
        this.group.position.y = -6.5 + Math.sin(this.animationTime * 2) * 0.1;
        if (this.state !== DuckState.CELEBRATING) {
            this.group.rotation.y = 1.0 + Math.sin(this.animationTime * 0.5) * 0.1;
        }

        // Inaktivität → Schlafen
        if (this.inactivityTimer >= SLEEP_AFTER_SECONDS && this.state === DuckState.IDLE) {
            this.state = DuckState.SLEEPING;
        }

        // Celebrating: Spin-Effekt direkt auf group
        if (this.state === DuckState.CELEBRATING) {
            this.group.rotation.y += dt * 10;
            this.group.position.y += Math.sin(this.animationTime * 10) * 0.5;
        }

        if (!this.head || !this.leftWing || !this.rightWing || !this.sleepEyes || !this.accessories) {
            return;
        }

        const refs: DuckMeshRefs = {
            group: this.group,
            head: this.head,
            leftWing: this.leftWing,
            rightWing: this.rightWing,
            sleepEyes: this.sleepEyes,
            accessories: this.accessories,
        };

        this.stateTimer -= dt;
        const expired = applyStateAnimation(this.state, refs, this.animationTime, dt, this.stateTimer);

        if (expired && this.state !== DuckState.IDLE && this.state !== DuckState.SLEEPING) {
            this.state = DuckState.IDLE;
            resetToIdle(refs);
        }
    }

    public getGroup(): THREE.Group {
        return this.group;
    }
}
