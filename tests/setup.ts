import { vi } from "vitest";

console.log("[Test Setup] Initializing mocks...");

// Mock global fetch to prevent ECONNREFUSED from backend calls
const originalFetch = global.fetch;

global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === "string" ? input : input.toString();

  // Block connections to local backend
  if (urlStr.includes("localhost:3000") || urlStr.includes("127.0.0.1:3000") || urlStr.includes("::1:3000")) {
    console.log(`[Test Mock] Blocked fetch to ${urlStr}`);
    return new Response(JSON.stringify({ error: "Network blocked by test setup" }), {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "application/json" },
    });
  }

  if (originalFetch) {
      return originalFetch(input, init);
  }

  return new Response("Mock Fetch", { status: 404 });
});

// Mock WebSocket to prevent ECONNREFUSED from SpacetimeDB or Bitunix
class MockWebSocket {
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  url: string;

  constructor(url: string) {
    this.url = url;
    console.log(`[Test Mock] Blocked WebSocket to ${url}`);
    // Simulate immediate error or close for local connections
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
        setTimeout(() => {
            if (this.onerror) this.onerror(new Event("error"));
            if (this.onclose) this.onclose(new CloseEvent("close"));
        }, 10);
    }
  }
  send() {}
  close() {}
}

global.WebSocket = MockWebSocket as any;
