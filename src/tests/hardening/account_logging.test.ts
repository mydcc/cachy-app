import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "../../routes/api/account/+server";

// Mock @sveltejs/kit
vi.mock("@sveltejs/kit", () => ({
  json: (data: any, init?: any) => ({ ...init, body: JSON.stringify(data) }),
}));

describe("Account API Logging Security", () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock fetch to return a failure with sensitive data
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () =>
        Promise.resolve("Error with key: MY_SECRET_KEY_1234567890_LEAKED"),
      json: () => Promise.resolve({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not log sensitive data in error messages", async () => {
    const request = {
      json: async () => ({
        exchange: "bitunix",
        apiKey: "valid_api_key_12345",
        apiSecret: "valid_api_secret_12345",
      }),
    };

    // Execute POST
    await POST({ request: request as any } as any);

    // Check logs
    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls[0];
    const logOutput = loggedArgs.join(" ");

    console.log("Test captured log:", logOutput);

    // The sensitive key should be redacted
    expect(logOutput).not.toContain("MY_SECRET_KEY_1234567890_LEAKED");
    expect(logOutput).toContain("[REDACTED]");
  });
});
