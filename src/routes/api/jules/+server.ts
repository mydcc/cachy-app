import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "$env/dynamic/private";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Access env variable dynamically
const API_KEY = env.JULES_API;

// Initialize Gemini if key exists
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export const POST: RequestHandler = async ({ request }) => {
  if (!genAI) {
    console.error("JULES_API key is missing on server.");
    return json(
      { error: "System configuration error: API key missing" },
      { status: 500 },
    );
  }

  try {
    const payload = await request.json();
    const { mode, context, error } = payload;

    // Select model - using flash for speed
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let prompt = "";
    if (mode === "AUTO") {
      prompt = `
You are Jules, the lead developer of the Cachy trading app.
The system has detected a CRITICAL ERROR.

ERROR DETAILS:
${JSON.stringify(error, null, 2)}

APP CONTEXT (State):
${JSON.stringify(context, null, 2)}

Task: Analyze this crash. specificy the likely cause and suggest a fix. Be technical and concise.
`;
    } else {
      // Manual REPORT
      prompt = `
You are Jules, the lead developer of the Cachy trading app.
The user (a developer/tester) has triggered a manual 'REPORT' snapshot.

APP STATE SNAPSHOT:
${JSON.stringify(context, null, 2)}

Task: Review the current application state for any anomalies, weird configurations, or potential issues.
If everything looks normal, give a friendly status update confirming all systems are nominal.
Keep it short and professional.
`;
    }

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return json({
      success: true,
      message: text,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Jules API Error:", e);
    return json(
      { error: "Failed to contact Jules: " + e.message },
      { status: 500 },
    );
  }
};
