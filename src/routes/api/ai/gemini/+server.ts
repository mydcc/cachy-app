import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, model } = await request.json();
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return json({ error: 'Missing API Key' }, { status: 401 });
        }

        // Convert standard messages format to Gemini format
        // Standard: [{ role: 'user', content: '...' }, { role: 'system', content: '...' }]
        // Gemini: { contents: [{ role: 'user', parts: [{ text: '...' }] }] }
        // Note: Gemini doesn't support 'system' role in 'contents' for v1beta, but supports 'system_instruction' separately in latest API.
        // For simplicity/compatibility, we will merge system prompt into the first user message or use v1beta1 models that support it better.
        // We will use 'gemini-1.5-flash' as default.

        let systemInstruction = undefined;
        const contents = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemInstruction = { parts: [{ text: msg.content }] };
            } else {
                contents.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                });
            }
        }

        const selectedModel = model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const payload: any = { contents };
        if (systemInstruction) {
            payload.systemInstruction = systemInstruction;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            return json({ error: err.error?.message || 'Gemini API Error' }, { status: response.status });
        }

        const data = await response.json();

        // Normalize response to OpenAI format for frontend consistency
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const normalized = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: text
                }
            }]
        };

        return json(normalized);

    } catch (e: any) {
        console.error('Gemini Proxy Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
