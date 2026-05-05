import type { LogLevel } from "./types";

const order: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly level: LogLevel) {}

  debug(message: string, details?: Record<string, unknown>): void {
    this.write("debug", message, details);
  }

  info(message: string, details?: Record<string, unknown>): void {
    this.write("info", message, details);
  }

  warn(message: string, details?: Record<string, unknown>): void {
    this.write("warn", message, details);
  }

  error(message: string, details?: Record<string, unknown>): void {
    this.write("error", message, details);
  }

  private write(level: LogLevel, message: string, details?: Record<string, unknown>): void {
    if (order[level] < order[this.level]) return;
    const payload = {
      level,
      message,
      ...(redact(details ?? {}) as Record<string, unknown>),
      timestamp: new Date().toISOString(),
    };
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

function redact(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.map(redact);
  if (typeof input !== "object") return input;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (/token|secret|password|api[-_]?key|authorization/i.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redact(value);
    }
  }
  return result;
}
