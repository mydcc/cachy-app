import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { messages, model } = await request.json();
        const apiKey = request.headers.get('x-api-key');

        if (!apiKey) {
            return json({ error: 'Missing API Key' }, { status: 401 });
        }

        // Anthropic System Prompt is a top-level parameter, not a message in the array
        let systemPrompt = '';
        const anthropicMessages = messages.filter((m: any) => {
            if (m.role === 'system') {
                systemPrompt += m.content + '\n';
                return false;
            }
            return true;
        });

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: model || 'claude-3-5-sonnet-20240620',
                max_tokens: 2000,
                system: systemPrompt,
                messages: anthropicMessages
            })
        });

        if (!response.ok) {
            const err = await response.json();
            return json({ error: err.error?.message || 'Anthropic API Error' }, { status: response.status });
        }

        const data = await response.json();

        // Normalize to OpenAI format
        const text = data.content?.[0]?.text || '';
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
        console.error('Anthropic Proxy Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};
