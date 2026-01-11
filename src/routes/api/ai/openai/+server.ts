import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, model } = await request.json();
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return json({ error: 'Missing API Key' }, { status: 401 });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-4o',
                messages: messages,
                max_tokens: 2000,
                stream: true // Enable streaming
            })
        });

        if (!response.ok) {
            const err = await response.json();
            return json({ error: err.error?.message || 'OpenAI API Error' }, { status: response.status });
        }

        // Return the stream directly
        return new Response(response.body, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (e: any) {
        console.error('OpenAI Proxy Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
