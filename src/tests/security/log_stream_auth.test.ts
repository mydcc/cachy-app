import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mutable mock env using vi.hoisted
const mockEnv = vi.hoisted(() => ({
  LOG_STREAM_KEY: undefined as string | undefined
}));

vi.mock("$env/dynamic/private", () => ({
  env: mockEnv
}));

// Import the handler
import { GET } from "../../routes/api/stream-logs/+server";

describe("GET /api/stream-logs Security", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.LOG_STREAM_KEY = undefined;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  const createRequest = (urlStr: string) => {
    return {
      url: new URL(urlStr, "http://localhost"),
      signal: new AbortController().signal
    } as unknown as Request;
  };

  it("should allow access in development mode without token", async () => {
    process.env.NODE_ENV = "development";

    // Simulate Request
    const event = { request: createRequest("http://localhost/api/stream-logs"), url: new URL("http://localhost/api/stream-logs") } as any;

    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("should deny access in production if LOG_STREAM_KEY is not set", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = undefined;

    const event = { request: createRequest("http://localhost/api/stream-logs"), url: new URL("http://localhost/api/stream-logs") } as any;
    const response = await GET(event);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("disabled");
  });

  it("should deny access in production if token is missing", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = { request: createRequest("http://localhost/api/stream-logs"), url: new URL("http://localhost/api/stream-logs") } as any;
    const response = await GET(event);

    expect(response.status).toBe(401);
  });

  it("should deny access in production if token is wrong", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = { request: createRequest("http://localhost/api/stream-logs?token=wrong"), url: new URL("http://localhost/api/stream-logs?token=wrong") } as any;
    const response = await GET(event);

    expect(response.status).toBe(401);
  });

  it("should allow access in production if token is correct", async () => {
    process.env.NODE_ENV = "production";
    mockEnv.LOG_STREAM_KEY = "super-secret";

    const event = { request: createRequest("http://localhost/api/stream-logs?token=super-secret"), url: new URL("http://localhost/api/stream-logs?token=super-secret") } as any;
    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
  });
});
