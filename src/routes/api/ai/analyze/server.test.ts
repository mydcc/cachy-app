import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server';

// Mock AI Libraries
vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
            getGenerativeModel: () => ({
                generateContent: vi.fn().mockResolvedValue({
                    response: { text: () => '{"score": 0.5}' }
                })
            })
        }))
    };
});

vi.mock('openai', () => {
    return {
        default: class {
            constructor() {}
            chat = {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        choices: [{ message: { content: '{"score": 0.8}' } }]
                    })
                }
            }
        }
    };
});

describe('AI Analyze Endpoint', () => {
    it('should return error if apiKey is missing', async () => {
        const request = {
            json: async () => ({ provider: 'openai' })
        } as Request;
        const response = await POST({ request } as any);
        expect(response.status).toBe(400);
    });

    it('should call OpenAI correctly', async () => {
        const request = {
            json: async () => ({ provider: 'openai', apiKey: 'test-key', prompt: 'test' })
        } as Request;
        const response = await POST({ request } as any);
        const data = await response.json();
        expect(data.result).toBe('{"score": 0.8}');
    });
});
