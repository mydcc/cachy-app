# Jules Integration Concept for Cachy App

## Overview
This document outlines the architecture for integrating the Google Jules API into the Cachy App (SvelteKit). The goal is to allow the Cachy App to trigger automated code audits, refactoring tasks, or report generation directly from the admin dashboard.

## 1. Security & Configuration
To use the Jules API, we need to securely store the API Key.

*   **Server-Side Storage**: The API Key should **never** be exposed to the client (browser).
*   **Environment Variable**: Store the key in `.env` as `JULES_API_KEY`.
*   **Settings UI**: Add a field in the "Settings" -> "Integrations" (or "General") tab to input the key.
    *   This input should POST to a server-side endpoint to save it (e.g., to a secure DB or file, or just instruction to set the ENV).
    *   *Recommendation*: For now, rely on `JULES_API_KEY` in `.env` to avoid storing secrets in the database/localStorage.

## 2. Backend Architecture (SvelteKit)
We will create a server-side API route to proxy requests to Google. This ensures the API Key stays on the server.

### New Route: `src/routes/api/jules/+server.ts`
This route will handle POST requests from the frontend.

```typescript
// Pseudo-code for src/routes/api/jules/+server.ts
import { JULES_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';

export async function POST({ request }) {
    const { action, payload } = await request.json();

    if (!JULES_API_KEY) {
        return json({ error: 'API Key not configured' }, { status: 500 });
    }

    let url = '';
    let body = null;

    switch (action) {
        case 'list_sources':
            url = 'https://jules.googleapis.com/v1alpha/sources';
            break;
        case 'create_session':
            url = 'https://jules.googleapis.com/v1alpha/sessions';
            body = payload;
            break;
        // ... handle other actions
    }

    const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
            'X-Goog-Api-Key': JULES_API_KEY,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();
    return json(data);
}
```

## 3. Frontend Integration
We will add a UI component to interact with Jules.

### "Audit Dashboard" Component
*   **Location**: `src/components/admin/JulesDashboard.svelte` (or similar).
*   **Features**:
    1.  **List Sources**: Dropdown to select which repo to act on.
    2.  **Prompt Input**: Text area to describe the task (e.g., "Audit src/services/tradeService.ts for race conditions").
    3.  **Start Session**: Button to trigger the API.
    4.  **Activity Log**: Polls the API to show progress (Plan generated -> Plan approved -> Code changes).

### Workflow
1.  User clicks "Start Audit".
2.  Frontend calls `/api/jules` with `{ action: 'create_session', payload: { ... } }`.
3.  Server calls Jules API.
4.  Frontend receives Session ID.
5.  Frontend periodically polls `/api/jules` (action: `list_activities`) to update the UI.

## 4. Automation & Reports
To generate reports like `ANALYSIS_REPORT.md` automatically:
1.  Send a prompt to Jules: "Analyze the codebase for security issues and generate a markdown report."
2.  Jules will likely produce the report as a file change (Pull Request) or as a text output in the activity log.
3.  The Cachy App can parse this output and display it in a "Reports" view.

## 5. Next Steps
1.  **Verify Connectivity**: Use `scripts/test_jules_api.py` to confirm the API Key works.
2.  **Implement Backend Proxy**: Create `src/routes/api/jules/+server.ts`.
3.  **Build UI**: Create a simple interface to trigger sessions.
