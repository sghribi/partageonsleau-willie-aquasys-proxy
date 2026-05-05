import type { ScalewayContext, ScalewayEvent, ScalewayResponse } from "./types";
import { authenticateClient } from "./auth";
import { loadConfig } from "./config";
import { Logger } from "./logger";
import { checkRateLimit } from "./rateLimit";
import { validateAndPrepareRequest } from "./requestGuards";
import { callWillieAndFilter } from "./willieClient";
import { corsPreflightResponse, errorResponse, originFromHeaders, toIncomingRequest } from "./http";

export async function handle(event: ScalewayEvent, _context?: ScalewayContext): Promise<ScalewayResponse> {
  let config;
  let origin: string | undefined;
  const startedAt = Date.now();

  try {
    config = loadConfig();
    const logger = new Logger(config.logLevel);
    const incoming = toIncomingRequest(event, config);
    origin = originFromHeaders(incoming.headers);

    if (incoming.method === "OPTIONS") {
      return corsPreflightResponse(config, origin);
    }

    const auth = await authenticateClient(event, config);
    if (!auth.ok) {
      logger.warn("Client authentication failed", { identity: auth.identity, path: incoming.path });
      return errorResponse(401, "Unauthorized", config, origin);
    }

    const rate = checkRateLimit(auth.identity, config);
    if (!rate.allowed) {
      return {
        statusCode: 429,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Retry-After": String(rate.retryAfterSeconds),
        },
        body: JSON.stringify({ error: "Too many requests" }),
      };
    }

    const prepared = validateAndPrepareRequest(incoming, config);
    const response = await callWillieAndFilter(prepared, config, origin);

    logger.info("Request proxied", {
      identity: auth.identity,
      method: prepared.method,
      path: prepared.path,
      statusCode: response.statusCode,
      durationMs: Date.now() - startedAt,
    });

    return response;
  } catch (error) {
    const statusCode = statusCodeFromError(error);
    const publicMessage = publicMessageForStatus(statusCode);

    try {
      if (!config) config = loadConfig();
      new Logger(config.logLevel).error("Request failed", {
        statusCode,
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      return errorResponse(statusCode, publicMessage, config, origin);
    } catch {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        body: JSON.stringify({ error: "Internal server error" }),
      };
    }
  }
}

function statusCodeFromError(error: unknown): number {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const candidate = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) return candidate;
  }
  return 500;
}

function publicMessageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400: return "Bad request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Endpoint not found";
    case 405: return "Method not allowed";
    case 413: return "Request body too large";
    case 414: return "URI too long";
    case 429: return "Too many requests";
    case 502: return "Upstream API error";
    case 504: return "Upstream API timeout";
    default: return "Internal server error";
  }
}

// Scaleway accepte un export CommonJS du handler après compilation TypeScript.
exports.handle = handle;
