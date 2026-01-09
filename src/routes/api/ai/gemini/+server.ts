import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, model } = await request.json();
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return json({ error: 'Missing API Key' }, { status: 401 });
        }

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

        // Use 'gemini-2.0-flash' as requested/verified by user
        const selectedModel = model || 'gemini-2.0-flash';

        // Use streamGenerateContent?alt=sse for Server-Sent Events
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

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

        return new Response(response.body, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (e: any) {
        console.error('Gemini Proxy Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
