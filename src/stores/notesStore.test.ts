import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true
}));

vi.mock("./settings.svelte", () => ({
  settingsState: {
    maxPrivateNotes: 10
  }
}));

import { NotesManager } from "./notes.svelte";

describe("NotesManager Security", () => {
  let notesManager: NotesManager;

  beforeEach(() => {
    // Mock localStorage
    const storage: Record<string, string> = {};
    global.localStorage = {
      getItem: (key: string) => storage[key] || null,
      setItem: (key: string, value: string) => { storage[key] = value; },
      removeItem: (key: string) => { delete storage[key]; },
      clear: () => { },
      length: 0,
      key: (index: number) => null,
    };
    notesManager = new NotesManager();
  });

  it("should generate a secure UUID for note ID", () => {
    notesManager.addNote("Test secure note");
    const note = notesManager.messages[0];

    expect(note).toBeDefined();
    expect(note.text).toBe("Test secure note");

    // UUID v4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(note.id).toMatch(uuidRegex);
  });
});
