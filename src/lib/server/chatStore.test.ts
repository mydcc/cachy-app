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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatStore } from './chatStore';
import type { ChatMessage } from './chatStore';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  }
}));

describe('chatStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatStore.reset();
  });

  it('should drop all invalid messages when none match schema', async () => {
    const invalidData = JSON.stringify([{ id: 123, text: "hello" }]); // id is number, not string
    vi.mocked(fs.readFile).mockResolvedValue(invalidData);

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages).toEqual([]);
    // Should persist cleaned data to disk
    expect(fs.writeFile).toHaveBeenCalled();
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
    // No save needed since all messages are valid
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should keep valid messages and discard invalid ones in a mixed array', async () => {
    const mixedData = JSON.stringify([
      { id: "msg1", text: "valid", sender: "user", timestamp: 100 },
      { id: 123, text: "invalid id", sender: "user", timestamp: 200 },
      { id: "msg3", text: "also valid", sender: "system", timestamp: 300 },
      { id: "msg4", text: "bad sender", sender: "admin", timestamp: 400 },
    ]);
    vi.mocked(fs.readFile).mockResolvedValue(mixedData);

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages.length).toBe(2);
    expect(messages[0].id).toBe("msg1");
    expect(messages[1].id).toBe("msg3");
    // Should persist cleaned data since some messages were dropped
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should fallback to empty array if data is not an array', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ not: "an array" }));

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages).toEqual([]);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should coerce null profitFactor and clientId to undefined', async () => {
    const dataWithNulls = JSON.stringify([{
      id: "msg1",
      text: "legacy message",
      sender: "user",
      timestamp: 100,
      profitFactor: null,
      clientId: null
    }]);
    vi.mocked(fs.readFile).mockResolvedValue(dataWithNulls);

    await chatStore.init();
    const messages = await chatStore.getMessages();

    expect(messages.length).toBe(1);
    expect(messages[0].profitFactor).toBeUndefined();
    expect(messages[0].clientId).toBeUndefined();
  });

  it('should reject invalid messages in addMessage', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify([]));

    await chatStore.init();

    // Try to add a message with an invalid sender
    await chatStore.addMessage({
      id: "msg1",
      text: "hello",
      sender: "admin" as any,
      timestamp: Date.now(),
    });

    const messages = await chatStore.getMessages();
    expect(messages).toEqual([]);
  });

  it('should accept valid messages in addMessage', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify([]));

    await chatStore.init();

    const validMessage: ChatMessage = {
      id: "msg1",
      text: "hello",
      sender: "user",
      timestamp: Date.now(),
    };
    await chatStore.addMessage(validMessage);

    const messages = await chatStore.getMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe("msg1");
  });
});
