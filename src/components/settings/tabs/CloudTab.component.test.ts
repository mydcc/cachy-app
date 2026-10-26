// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

const cloud = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(),
  sendMessage: vi.fn(async () => {}),
  isConnected: vi.fn(() => true),
  canDeleteMyMessages: vi.fn(() => false),
  subscribeMessages: vi.fn(() => () => {}),
  subscribeStatus: vi.fn(() => () => {}),
  status: vi.fn(() => ({
    connected: false,
    lastError: null,
    mySenderId: null,
  })),
}));

vi.mock("../../../services/cloudService", () => ({ cloudService: cloud }));

const store = vi.hoisted(() => ({
  settingsState: {
    cloudEnabled: true,
    cloudHost: "http://127.0.0.1:3000",
    cloudDbName: "cachy-server",
    cloudToken: "token",
  },
}));

vi.mock("../../../stores/settings.svelte", () => store);

vi.mock("../../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  return {
    _: readable((key: string) => key),
    locale: readable("en"),
  };
});

import CloudTab from "./CloudTab.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

function render() {
  component = mount(CloudTab, { target: host });
  flushSync();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  store.settingsState.cloudEnabled = true;
  cloud.isConnected.mockReturnValue(true);
  cloud.disconnect.mockClear();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
  host.remove();
  vi.clearAllMocks();
});

describe("CloudTab opt-in toggle (BUG-0726 review)", () => {
  it("disconnects when the opt-in is turned off", () => {
    render();
    const checkbox = host.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    checkbox.click();
    flushSync();

    expect(store.settingsState.cloudEnabled).toBe(false);
    expect(cloud.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects even while the handshake has not completed", () => {
    cloud.isConnected.mockReturnValue(false);
    render();
    const checkbox = host.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;

    checkbox.click();
    flushSync();

    expect(cloud.disconnect).toHaveBeenCalledTimes(1);
  });
});
