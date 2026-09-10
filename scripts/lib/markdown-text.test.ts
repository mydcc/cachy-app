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
import { stripFencedCodeBlocks } from "./markdown-text";

describe("stripFencedCodeBlocks", () => {
    it("drops a backtick fence and its body", () => {
        expect(stripFencedCodeBlocks("before\n```ts\nFixes #1792\n```\nafter")).toBe("before\nafter");
    });

    it("drops a tilde fence", () => {
        expect(stripFencedCodeBlocks("a\n~~~\nFixes #1\n~~~\nb")).toBe("a\nb");
    });

    it("drops an unterminated fence to the end", () => {
        expect(stripFencedCodeBlocks("keep\n```\nFixes #1")).toBe("keep");
    });

    it("keeps content after a closed fence", () => {
        expect(stripFencedCodeBlocks("```\nx\n```\nFixes #7")).toBe("Fixes #7");
    });

    it("does not close a fence with a shorter one", () => {
        expect(stripFencedCodeBlocks("````\n```\nFixes #1\n````\nkept")).toBe("kept");
    });

    it("leaves text without fences untouched", () => {
        expect(stripFencedCodeBlocks("Fixes #7\nbody")).toBe("Fixes #7\nbody");
    });
});
