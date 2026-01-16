import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messages, model } = await request.json();
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    let systemInstruction = undefined;
    const contents = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Map user-friendly model names to technical Gemini 3 model names
    function getGeminiModelName(userChoice: string): string {
      // User-friendly values: "flash" or "pro"
      if (userChoice === "pro") {
        return "gemini-3-pro-preview";
      }
      // Default to flash (fastest, free-tier friendly)
      return "gemini-3-flash-preview";
    }

    let selectedModel = getGeminiModelName(model || "flash");

    // Legacy fallback: If old technical names are still used, migrate them
    const oldModelNames = [
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
    ];
    if (oldModelNames.includes(model || "")) {
      selectedModel = "gemini-3-flash-preview";
    }

    // Use streamGenerateContent?alt=sse for Server-Sent Events
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const payload: any = { contents };
    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    console.log(
      `Gemini Proxy: Sending request with model ${selectedModel}`
    );
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CachyApp/1.0 (SvelteKit)",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Gemini API Error (${response.status}):`, errText);
      let errMsg = "Gemini API Error";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch (e) {
        errMsg = errText.slice(0, 200); // Fallback to text if not JSON
      }
      return json({ error: errMsg }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("Gemini Proxy Error:", e);
    return json({ error: e.message }, { status: 500 });
  }
};
