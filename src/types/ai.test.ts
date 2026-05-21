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

import { describe, it, expect } from "vitest";
import { AiRoleSchema, AiMessageSchema, AiRequestSchema } from "./ai";

describe("ai schemas", () => {
  describe("AiRoleSchema", () => {
    it("should accept valid roles", () => {
      expect(AiRoleSchema.parse("user")).toBe("user");
      expect(AiRoleSchema.parse("assistant")).toBe("assistant");
      expect(AiRoleSchema.parse("system")).toBe("system");
    });

    it("should reject invalid roles", () => {
      expect(() => AiRoleSchema.parse("admin")).toThrow();
      expect(() => AiRoleSchema.parse("")).toThrow();
      expect(() => AiRoleSchema.parse(null)).toThrow();
      expect(() => AiRoleSchema.parse(123)).toThrow();
    });
  });

  describe("AiMessageSchema", () => {
    it("should accept valid messages", () => {
      const msg1 = { role: "user", content: "Hello" };
      const parsed1 = AiMessageSchema.parse(msg1);
      expect(parsed1).toEqual(msg1);

      const msg2 = { role: "system", content: "You are a helpful assistant." };
      const parsed2 = AiMessageSchema.parse(msg2);
      expect(parsed2).toEqual(msg2);
    });

    it("should reject invalid messages", () => {
      // missing role
      expect(() => AiMessageSchema.parse({ content: "Hi" })).toThrow();
      // missing content
      expect(() => AiMessageSchema.parse({ role: "user" })).toThrow();
      // invalid role
      expect(() =>
        AiMessageSchema.parse({ role: "admin", content: "Hi" })
      ).toThrow();
      // wrong type for content
      expect(() =>
        AiMessageSchema.parse({ role: "user", content: 123 })
      ).toThrow();
    });
  });

  describe("AiRequestSchema", () => {
    it("should accept valid requests without model", () => {
      const req = {
        messages: [{ role: "user", content: "Hello" }],
      };
      const parsed = AiRequestSchema.parse(req);
      expect(parsed).toEqual(req);
    });

    it("should accept valid requests with model", () => {
      const req = {
        messages: [
          { role: "system", content: "Hello" },
          { role: "user", content: "world" },
        ],
        model: "gpt-4",
      };
      const parsed = AiRequestSchema.parse(req);
      expect(parsed).toEqual(req);
    });

    it("should accept empty messages array", () => {
      const req = { messages: [] };
      const parsed = AiRequestSchema.parse(req);
      expect(parsed).toEqual(req);
    });

    it("should reject invalid requests", () => {
      // missing messages
      expect(() => AiRequestSchema.parse({})).toThrow();
      // invalid messages array items
      expect(() =>
        AiRequestSchema.parse({
          messages: [{ role: "user" }], // missing content
        })
      ).toThrow();
      // wrong type for model
      expect(() =>
        AiRequestSchema.parse({
          messages: [],
          model: 123,
        })
      ).toThrow();
      // wrong type for messages
      expect(() =>
        AiRequestSchema.parse({
          messages: "hello",
        })
      ).toThrow();
    });
  });
});
