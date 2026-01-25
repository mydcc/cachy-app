import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

// Server-side: API keys are only here, never sent to client
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { headlines, provider, model } = await request.json();
        if (!Array.isArray(headlines) || headlines.length === 0) {
            return json({ error: 'NO_HEADLINES' }, { status: 400 });
        }
        if (!provider || (provider !== 'openai' && provider !== 'gemini')) {
            return json({ error: 'INVALID_PROVIDER' }, { status: 400 });
        }
        const prompt = `Analyze sentiment for these headlines. score -1 to 1. regime: BULLISH, BEARISH, NEUTRAL, UNCERTAIN.\n\n${headlines.map(h => '- ' + h).join('\n')}\n\nOutput JSON ONLY: { "score": number, "regime": "string", "summary": "string", "keyFactors": ["string"] }`;

        let resultText = '';
        if (provider === 'openai') {
            if (!OPENAI_API_KEY) return json({ error: 'NO_OPENAI_KEY' }, { status: 500 });
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: 'system', content: 'Analyze sentiment.' },
                    { role: 'user', content: prompt },
                ],
                model: model || 'gpt-4o',
                response_format: { type: 'json_object' },
            });
            resultText = completion.choices[0].message.content || '{}';
        } else if (provider === 'gemini') {
            if (!GEMINI_API_KEY) return json({ error: 'NO_GEMINI_KEY' }, { status: 500 });
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });
            const result = await geminiModel.generateContent(prompt);
            resultText = result.response.text();
        }
        if (!resultText) return json({ error: 'NO_RESULT' }, { status: 500 });
        const analysis = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());
        return json({ analysis });
    } catch (e: any) {
        return json({ error: e.message || 'INTERNAL_ERROR' }, { status: 500 });
    }
};
