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

import { EventEmitter } from "events";

// Definiere die Log-Level
type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class ServerLogger extends EventEmitter {
  private static instance: ServerLogger;

  // Pattern für sensible Schlüssel, die maskiert werden sollen
  private sensitiveKeys = [
    "apiKey",
    "apiSecret",
    "secret",
    "signature",
    "access_token",
    "password",
    "token",
    "auth",
  ];

  private constructor() {
    super();
    // Erhöhe das Limit für Listener, da viele Clients verbunden sein könnten
    this.setMaxListeners(100);
  }

  public static getInstance(): ServerLogger {
    if (!ServerLogger.instance) {
      ServerLogger.instance = new ServerLogger();
    }
    return ServerLogger.instance;
  }

  /**
   * Maskiert sensible Daten in Objekten oder Strings
   */
  private sanitize(data: any): any {
    if (!data) return data;

    if (typeof data === "string") {
      // Versuche JSON zu parsen, falls es ein JSON-String ist
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(this.sanitize(parsed));
      } catch {
        // Einfacher String: Regex replacement könnte hier komplex sein,
        // daher lassen wir einfache Strings meist durch, es sei denn sie enthalten offensichtliche Secrets
        // TODO: Erweiterte String-Erkennung bei Bedarf
        return data;
      }
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    if (typeof data === "object") {
      const sanitized: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          // Check ob der Key sensibel ist (case-insensitive)
          const lowerKey = key.toLowerCase();
          const isSensitive = this.sensitiveKeys.some((s) =>
            lowerKey.includes(s.toLowerCase()),
          );

          if (isSensitive) {
            sanitized[key] = "***REDACTED***";
          } else {
            sanitized[key] = this.sanitize(data[key]);
          }
        }
      }
      return sanitized;
    }

    return data;
  }

  private emitLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: this.sanitize(data),
    };

    // Emit event for SSE streams
    this.emit("log", entry);
  }

  public info(message: string, data?: any) {
    this.emitLog("info", message, data);
  }

  public warn(message: string, data?: any) {
    this.emitLog("warn", message, data);
  }

  public error(message: string, data?: any) {
    this.emitLog("error", message, data);
  }

  public debug(message: string, data?: any) {
    this.emitLog("debug", message, data);
  }
}

export const logger = ServerLogger.getInstance();
