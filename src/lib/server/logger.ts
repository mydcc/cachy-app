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
export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

class ServerLogger extends EventEmitter {
  private static instance: ServerLogger;

  // Patterns for keys that are explicitly safe and should not be redacted
  // even if they partially match sensitive patterns (e.g., "max_tokens")
  private safeKeys = new Set([
    "max_tokens",
    "total_tokens",
    "completion_tokens",
    "prompt_tokens",
    "token_type",
    "expires_in",
    "created_at",
    "updated_at",
    "author",
    "authority",
  ]);

  // Regex patterns for identifying sensitive keys
  private sensitivePatterns: RegExp[] = [
    /passw(or)?d/i,
    /secret/i,
    /token/i,
    /api[-_]?key/i,
    /signature/i,
    /authorization/i,
    /bearer/i,
    /^private[-_]?key$/i,
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

  private isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();

    // Check safe keys first
    if (this.safeKeys.has(lowerKey)) {
      return false;
    }

    // Check against sensitive patterns
    return this.sensitivePatterns.some(pattern => pattern.test(key));
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
        // Recurse on the parsed object
        const sanitizedParsed = this.sanitize(parsed);
        // Return stringified version
        return JSON.stringify(sanitizedParsed);
      } catch {
        // Einfacher String: Sensible Daten maskieren
        return this.sanitizeString(data);
      }
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    if (typeof data === "object") {
      const sanitized: any = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          if (this.isSensitiveKey(key)) {
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

  private sanitizeString(str: string): string {
    let s = str;

    // 1. Redact Private Keys (PEM format)
    s = s.replace(
      /(-{5}BEGIN [A-Z ]+ PRIVATE KEY-{5})[\s\S]*?(-{5}END [A-Z ]+ PRIVATE KEY-{5})/g,
      '$1\n***REDACTED***\n$2'
    );

    // 2. Redact URLs with credentials (protocol://user:pass@host)
    s = s.replace(
      /([a-zA-Z][\w+.-]*:\/\/[^:]+):([^@]+)@/g,
      '$1:***REDACTED***@'
    );

    // 3. Redact Authorization Headers
    // Matches "Authorization: Bearer <token>" or "Authorization: <token>"
    s = s.replace(
      /(Authorization:\s*(?:\w+\s+)?)(.+)/gi,
      '$1***REDACTED***'
    );

    // 4. Redact Query Parameters in URLs (e.g. ?apiKey=..., &token=...)
    s = s.replace(/([?&])([\w-]+)=([^&\s]+)/g, (match, prefix, key, val) => {
        if (this.isSensitiveKey(key)) {
            return `${prefix}${key}=***REDACTED***`;
        }
        return match;
    });

    // 5. Redact Key-Value pairs (e.g. key=value, key="value", "key": "value")
    // Groups:
    // 1: Quote (Key), 2: Key (Quoted), 3: Key (Unquoted)
    // 4: Separator
    // 5: Quote (Val), 6: Val (Quoted), 7: Val (Unquoted)
    const kvRegex = /(?:("|')([\w-]+)\1|([\w-]+))(\s*[:=]\s*)(?:("|')((?:(?!\5).)*)\5|([^"'&\s,;]+))/gi;

    s = s.replace(kvRegex, (match, qKey, keyQuoted, keyUnquoted, sep, qVal, valQuoted, valUnquoted) => {
      const key = keyQuoted || keyUnquoted;

      // Skip Authorization header keys as they are handled specifically above
      if (key.toLowerCase() === 'authorization') {
        return match;
      }
      // Skip if it looks like a URL protocol (e.g. "https: //...") which was matched as Key="https", Sep=":", Val="//..."
      if (key.toLowerCase().startsWith('http')) {
         return match;
      }

      if (this.isSensitiveKey(key)) {
        const val = valQuoted ?? valUnquoted;
        // Don't redact if the value is empty
        if (!val && val !== "") return match;

        const qv = qVal || '';
        // If the key was quoted, we need to reconstruct that
        const qk = qKey || '';
        return `${qk}${key}${qk}${sep}${qv}***REDACTED***${qv}`;
      }
      return match;
    });

    return s;
  }

  private emitLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: this.sanitizeString(message),
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
