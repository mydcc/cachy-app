/*
 * Copyright (C) 2026 MYDCC
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

/**
 * BUG-0836: with `ssr = false`, any server load makes the client fetch
 * `/__data.json` on start. The service worker cannot answer that offline, so
 * one server load anywhere in the route tree turns an offline reload into the
 * error page — and no build step or other test notices.
 */

import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routesDir = fileURLToPath(new URL(".", import.meta.url));
const SERVER_LOAD_FILE = /^\+(layout|page)\.server\.(ts|js)$/;

describe("route tree", () => {
  it("has no server load, so an offline start never needs __data.json", () => {
    const serverLoads = readdirSync(routesDir, { recursive: true, encoding: "utf8" }).filter((file) =>
      SERVER_LOAD_FILE.test(file.split(/[\\/]/).pop() ?? ""),
    );
    expect(serverLoads).toEqual([]);
  });
});
