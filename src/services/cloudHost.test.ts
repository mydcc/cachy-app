/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import { cloudHostSecurityIssue, isLoopbackHost } from "./cloudHost";

describe("cloudHostSecurityIssue (BUG-0726)", () => {
  it("accepts an https host", () => {
    expect(cloudHostSecurityIssue("https://chat.cachy.app")).toBeNull();
  });

  it("accepts plain http only on loopback", () => {
    expect(cloudHostSecurityIssue("http://127.0.0.1:3000")).toBeNull();
    expect(cloudHostSecurityIssue("http://localhost:3000")).toBeNull();
    expect(cloudHostSecurityIssue("http://[::1]:3000")).toBeNull();
  });

  it("refuses plain http on a remote host, where the token would travel in clear text", () => {
    expect(cloudHostSecurityIssue("http://chat.cachy.app")).toMatch(/https/);
    expect(cloudHostSecurityIssue("http://192.168.1.10:3000")).toMatch(/https/);
  });

  it("refuses a non-http protocol", () => {
    expect(cloudHostSecurityIssue("ws://chat.cachy.app")).toMatch(/https/);
    expect(cloudHostSecurityIssue("file:///etc/passwd")).toMatch(/https/);
  });

  it("refuses an unparsable address", () => {
    expect(cloudHostSecurityIssue("not a url")).toMatch(/not a valid URL/);
  });
});

describe("isLoopbackHost", () => {
  it("recognises the loopback spellings", () => {
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
  });
});
