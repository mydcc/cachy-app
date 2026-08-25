// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsManager } from "./settings.svelte";
import { CONSTANTS } from "../lib/constants";

vi.mock("$app/environment", () => ({
  browser: true,
}));


describe("SettingsManager.destroy()", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
  });

  it("adds and removes the cross-tab storage listener", () => {
    const manager = new SettingsManager();
    const loadSpy = vi.spyOn(manager as unknown as { load: () => void }, "load").mockImplementation(() => {});

    // Ensure the listener was added
    expect(addEventListenerSpy).toHaveBeenCalledWith("storage", expect.any(Function));

    // Get the handler that was added
    const call = addEventListenerSpy.mock.calls.find((c: unknown[]) => c[0] === "storage");
    const handler = call[1];

    // Test the handler triggers a load if event matches
    handler({ key: CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, newValue: "{}" } as StorageEvent);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    manager.destroy();

    // Ensure the listener was removed with the exact same handler
    expect(removeEventListenerSpy).toHaveBeenCalledWith("storage", handler);

    // Ensure the listener reference inside the class is cleared
    expect((manager as unknown as { storageListener: unknown }).storageListener).toBeNull();
  });
});
