/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The layout's lazy imports are effects in a Svelte component, so a mounted
 * test would have to boot the whole shell just to reject a dynamic import.
 * Reading the source pins the wiring instead: every lazy-import catch must
 * call `handleLazyLoadFailure`, and none may log the rejection itself
 * (BUG-0780).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const LAZY_IMPORT_LABELS = [
  "MarketDashboardModal",
  "AlertPanel",
  "AutoBackupRestoreModal",
  "OrderDetailsTooltip",
  "AmbientTopline",
  "FireOverlay",
  "FXOverlay",
] as const;

function readLayout(): string {
  return readFileSync(new URL("./+layout.svelte", import.meta.url), "utf8");
}

describe("+layout lazy import failures (BUG-0780)", () => {
  it("routes every lazy import failure through handleLazyLoadFailure", () => {
    const source = readLayout();

    // One match per `import("…").then(…).catch(…);` chain. The `[^;]` bodies
    // keep the guard from matching unrelated `.catch` calls such as
    // `initAlertEngine().catch(…)`.
    const lazyChains = [
      ...source.matchAll(/import\("([^"]+)"\)\s*\.then\([^;]*?\)\s*\.catch\(([^;]*)\);/g),
    ];

    expect(lazyChains).toHaveLength(LAZY_IMPORT_LABELS.length);
    for (const [, specifier, catchBody] of lazyChains) {
      expect(specifier).toMatch(/^\.\.\/components\//);
      expect(catchBody).toContain("handleLazyLoadFailure(");
      expect(catchBody).not.toMatch(/console\.(error|warn|log)/);
    }

    expect(source).toContain(
      'import { handleLazyLoadFailure } from "../lib/staleDeploymentRecovery";',
    );
    for (const label of LAZY_IMPORT_LABELS) {
      expect(source).toContain(`handleLazyLoadFailure("${label}", err)`);
    }
  });
});
