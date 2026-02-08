/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type * as THREE from 'three';

export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private name: string;
  private renderer: THREE.WebGLRenderer | null = null;

  constructor(name: string, interval = 5000) {
    this.name = name;
    this.interval = interval;
  }

  start(renderer?: THREE.WebGLRenderer) {
    this.renderer = renderer || null;
    this.lastTime = performance.now();
    this.frameCount = 0;

    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
        this.log();
    }, this.interval);
  }

  stop() {
    if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
    }
  }

  update() {
    this.frameCount++;
  }

  private log() {
    const now = performance.now();
    const elapsed = now - this.lastTime;
    // Prevent division by zero
    if (elapsed === 0) return;

    const fps = Math.round((this.frameCount * 1000) / elapsed);

    let calls = '';
    if (this.renderer) {
        calls = ` | DrawCalls: ${this.renderer.info.render.calls}`;
    }

    console.log(`[${this.name}] FPS: ${fps}${calls}`);

    this.frameCount = 0;
    this.lastTime = now;
  }
}
