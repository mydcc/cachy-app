/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { logger } from "$lib/server/logger";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ request }) => {
  // Setze Header für SSE
  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };

  const stream = new ReadableStream({
    start(controller) {
      // Callback function to handle new logs
      const onLog = (logEntry: any) => {
        try {
          const data = `data: ${JSON.stringify(logEntry)}\n\n`;
          controller.enqueue(data);
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error("Error sending log to stream:", err);
          }
          controller.close();
        }
      };

      // Subscribe to the logger
      logger.on("log", onLog);

      // Send initial connection message
      const initMsg = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        message: "Connected to Cachy Server Logs",
      });
      controller.enqueue(`data: ${initMsg}\n\n`);

      // Cleanup when the connection closes
      request.signal.addEventListener("abort", () => {
        logger.off("log", onLog);
      });
    },
    cancel() {
      // Fallback cancel logic handled in abort listener usually,
      // but strict cleanup here is good practice if supported environment.
    },
  });

  return new Response(stream, { headers });
};
