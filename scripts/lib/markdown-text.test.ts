// @vitest-environment node
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

import { describe, it, expect } from "vitest";
import { stripCodeBlocks } from "./markdown-text";

describe("stripCodeBlocks", () => {
    it("drops a backtick fence and its body", () => {
        expect(stripCodeBlocks("before\n```ts\nFixes #1792\n```\nafter")).toBe("before\nafter");
    });

    it("drops a tilde fence", () => {
        expect(stripCodeBlocks("a\n~~~\nFixes #1\n~~~\nb")).toBe("a\nb");
    });

    it("drops an unterminated fence to the end", () => {
        expect(stripCodeBlocks("keep\n```\nFixes #1")).toBe("keep");
    });

    it("keeps content after a closed fence", () => {
        expect(stripCodeBlocks("```\nx\n```\nFixes #7")).toBe("Fixes #7");
    });

    it("does not close a fence with a shorter one", () => {
        expect(stripCodeBlocks("````\n```\nFixes #1\n````\nkept")).toBe("kept");
    });

    it("drops a four-space indented code line", () => {
        expect(stripCodeBlocks("keep\n    Fixes #1792\nafter")).toBe("keep\nafter");
    });

    it("drops a tab-indented code line", () => {
        expect(stripCodeBlocks("keep\n\tFixes #1\nafter")).toBe("keep\nafter");
    });

    it("keeps a line indented by fewer than four spaces", () => {
        expect(stripCodeBlocks("   Fixes #7")).toBe("   Fixes #7");
    });

    it("leaves text without code blocks untouched", () => {
        expect(stripCodeBlocks("Fixes #7\nbody")).toBe("Fixes #7\nbody");
    });
});
