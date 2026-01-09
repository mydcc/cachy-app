import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Simple in-memory store for chat messages
// In a real app, this would be a database.
// Being a global variable, it persists as long as the server process runs.
// On Vercel/Serverless, this would reset frequently, but for a VPS/PM2 setup it works fine.

interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'system';
    timestamp: number;
}

// Initialize with a welcome message
let messages: ChatMessage[] = [
    {
        id: 'system-welcome',
        text: 'Welcome to the global chat!',
        sender: 'system',
        timestamp: Date.now()
    }
];

// Keep only the last 100 messages to prevent memory overflow
const MAX_HISTORY = 100;

export const GET: RequestHandler = async ({ url }) => {
    // Optional: filter by 'since' timestamp to get only new messages
    const since = url.searchParams.get('since');
    let result = messages;

    if (since) {
        const sinceTs = parseInt(since);
        if (!isNaN(sinceTs)) {
            result = messages.filter(m => m.timestamp > sinceTs);
        }
    }

    return json({
        success: true,
        messages: result
    });
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { text, sender } = await request.json();

        if (!text || typeof text !== 'string') {
            return json({ error: 'Message text is required' }, { status: 400 });
        }

        const newMessage: ChatMessage = {
            id: crypto.randomUUID(),
            text: text.slice(0, 500), // Limit length
            sender: sender || 'user', // default to user
            timestamp: Date.now()
        };

        messages.push(newMessage);

        // Trim history
        if (messages.length > MAX_HISTORY) {
            messages = messages.slice(messages.length - MAX_HISTORY);
        }

        return json({
            success: true,
            message: newMessage
        });

    } catch (e) {
        console.error('Chat API Error:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
