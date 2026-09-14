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

import { defineConfig } from '@playwright/test';

/**
 * FEAT-0439 — the WebGPU parity suite (`npm run test:gpu`).
 *
 * Separate from `playwright.config.js` because it needs neither the app build
 * nor a preview server, only a Chromium with WebGPU enabled.
 *
 * Headless Chromium provides SwiftShader, a software WebGPU adapter that runs
 * the same `f32` shader arithmetic without a GPU, so the suite runs on a
 * machine without one. Set `CACHY_GPU_VULKAN=1` to run on the machine's real
 * adapter instead; the two produced bit-identical results when this suite was
 * written.
 */
export default defineConfig({
  testDir: './tests/gpu',
  reporter: 'list',
  timeout: 120_000,
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        ...(process.env.CACHY_GPU_VULKAN ? ['--enable-features=Vulkan', '--use-angle=vulkan'] : []),
      ],
    },
  },
});
