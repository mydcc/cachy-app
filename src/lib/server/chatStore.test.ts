import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatStore } from './chatStore';
import { promises as fs } from 'fs';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  }
}));

describe('chatStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatStore.reset();
  });

  it('should fallback to empty array if JSON is valid but does not match schema', async () => {
    // Mock fs.readFile to return valid JSON, but not a valid chat message array
    const invalidData = JSON.stringify([{ id: 123, text: "hello" }]); // id is number, not string
    vi.mocked(fs.readFile).mockResolvedValue(invalidData);

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages).toEqual([]);
  });

  it('should parse successfully if data matches schema', async () => {
    const validData = JSON.stringify([{
      id: "msg1",
      text: "hello world",
      sender: "user",
      timestamp: 123456789
    }]);
    vi.mocked(fs.readFile).mockResolvedValue(validData);

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("msg1");
  });
});
