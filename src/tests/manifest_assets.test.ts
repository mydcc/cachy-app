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

/**
 * Guards `static/manifest.json` against declaring assets it does not have.
 *
 * Written after two of the four screenshots turned out to be JPEG files with a
 * `.png` extension, declared `"type": "image/png"`. A browser validates these
 * entries and drops the ones that do not match, which silently degrades the
 * install experience — no error, no warning, just a plainer install dialog
 * than the manifest asked for. Nothing in the build would have caught it,
 * because a manifest is only JSON as far as the bundler is concerned.
 *
 * Reads the real bytes rather than trusting the filename: the extension was
 * exactly what lied last time.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), "static");

interface ManifestImage {
  src: string;
  sizes?: string;
  type?: string;
  purpose?: string;
  form_factor?: string;
  label?: string;
}

interface Manifest {
  icons: ManifestImage[];
  screenshots?: ManifestImage[];
  shortcuts?: { icons?: ManifestImage[] }[];
  background_color?: string;
  theme_color?: string;
}

const manifest: Manifest = JSON.parse(readFileSync(join(STATIC_DIR, "manifest.json"), "utf8"));

/** Identifies the real format from the file's magic bytes, not its name. */
function sniff(bytes: Buffer): { mime: string; width: number; height: number } | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    // PNG: IHDR width/height are big-endian u32 at offsets 16 and 20.
    return { mime: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: walk the segment chain to the SOFn frame header, which carries the
    // dimensions. They are not at a fixed offset the way PNG's are.
    let offset = 2;
    while (offset < bytes.length - 9) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF0..SOF15, excluding DHT (c4), DAC (cc) and the RSTn markers.
      const isFrameHeader =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        return {
          mime: "image/jpeg",
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return { mime: "image/jpeg", width: 0, height: 0 };
  }

  return null;
}

/** Every image the manifest points at, from all three places it can list one. */
const declared: ManifestImage[] = [
  ...manifest.icons,
  ...(manifest.screenshots ?? []),
  ...(manifest.shortcuts ?? []).flatMap((s) => s.icons ?? []),
];

describe("static/manifest.json declares assets that exist and match", () => {
  it("lists at least one icon", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it.each(declared.map((img) => [img.src, img] as const))("%s exists on disk", (_src, img) => {
    expect(existsSync(join(STATIC_DIR, img.src))).toBe(true);
  });

  it.each(declared.map((img) => [img.src, img] as const))(
    "%s is really the type it declares",
    (_src, img) => {
      const actual = sniff(readFileSync(join(STATIC_DIR, img.src)));
      expect(actual, `${img.src} is not a recognised PNG or JPEG`).not.toBeNull();
      expect(actual!.mime).toBe(img.type);
    },
  );

  it.each(declared.map((img) => [img.src, img] as const))(
    "%s is really the size it declares",
    (_src, img) => {
      if (!img.sizes || img.sizes === "any") return;
      const actual = sniff(readFileSync(join(STATIC_DIR, img.src)))!;
      expect(`${actual.width}x${actual.height}`).toBe(img.sizes);
    },
  );

  it("has the fields an Android splash screen needs", () => {
    // Chrome builds the splash screen from background_color, the app name and
    // an icon of at least 512px. A missing one degrades it silently.
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);

    const largest = Math.max(
      ...manifest.icons.map((i) => Number.parseInt(i.sizes?.split("x")[0] ?? "0", 10)),
    );
    expect(largest).toBeGreaterThanOrEqual(512);
  });

  // `screenshots` is currently absent on purpose — the richer install dialog is
  // opt-in, and a wrong-looking screenshot is worse than none. This asserts the
  // shape only if the key comes back, rather than requiring it.
  it("declares a narrow screenshot if it declares any at all", () => {
    if (!manifest.screenshots?.length) return;
    const narrow = manifest.screenshots.filter((s) => s.form_factor === "narrow");
    expect(narrow.length, "screenshots are declared but none target mobile").toBeGreaterThan(0);
  });
});
