/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, it, expect, vi } from "vitest";

// `browser: true` so the constructor takes the subscription path. The effect
// inside it stays inert because `cloudEnabled` is false in the settings mock.
vi.mock("$app/environment", () => ({ browser: true }));

vi.mock("./settings.svelte", () => ({
  settingsState: {
    cloudEnabled: false,
    cloudHost: "http://127.0.0.1:3000",
    cloudDbName: "cachy-server",
    cloudToken: "",
  },
}));

const { mockCloud, unsubscribeStatus, unsubscribeMessages } = vi.hoisted(() => {
  const unsubscribeStatus = vi.fn();
  const unsubscribeMessages = vi.fn();

  return {
    unsubscribeStatus,
    unsubscribeMessages,
    mockCloud: {
      subscribeMessages: vi.fn(() => unsubscribeMessages),
      subscribeStatus: vi.fn(() => unsubscribeStatus),
      sendMessage: vi.fn(),
      connect: vi.fn(),
      isConnected: vi.fn(() => false),
      status: vi.fn(() => ({
        connected: false,
        lastError: null,
        mySenderId: null,
      })),
    },
  };
});

vi.mock("../services/cloudService", () => ({ cloudService: mockCloud }));

import { chatState } from "./chat.svelte";

/**
 * The status and message subscriptions are plain callbacks, not `$effect`s, so
 * destroy() has to release them explicitly — otherwise a hot reload leaves the
 * old store attached to the live cloud service.
 */
describe("ChatManager cloud subscriptions", () => {
  it("subscribes on construction and releases both on destroy", () => {
    expect(mockCloud.subscribeStatus).toHaveBeenCalledTimes(1);
    expect(mockCloud.subscribeMessages).toHaveBeenCalledTimes(1);

    chatState.destroy();

    expect(unsubscribeStatus).toHaveBeenCalledTimes(1);
    expect(unsubscribeMessages).toHaveBeenCalledTimes(1);
  });
});
