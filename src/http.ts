import type { Config, IncomingRequest, ScalewayEvent, ScalewayResponse } from "./types";

export function toIncomingRequest(event: ScalewayEvent, config: Config): IncomingRequest {
  const method = (event.httpMethod ?? event.method ?? "GET").toUpperCase();
  const headers = normalizeHeaders(event.headers ?? {});
  const rawPath = event.path ?? "/";
  const path = sanitizeAndStripPath(rawPath, config.publicBasePath);
  const query = normalizeQuery(event.queryStringParameters ?? {});

  let body = event.body ?? null;
  if (body !== null && event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf8");
  }

  if (body !== null && Buffer.byteLength(body, "utf8") > config.maxRequestBytes) {
    throw httpError(413, "Request body too large");
  }

  return { method, path, query, headers, body };
}

export function jsonResponse(statusCode: number, payload: unknown, config: Config, origin?: string): ScalewayResponse {
  return {
    statusCode,
    headers: securityHeaders(config, origin, "application/json; charset=utf-8"),
    body: JSON.stringify(payload),
  };
}

export function emptyResponse(statusCode: number, config: Config, origin?: string): ScalewayResponse {
  return {
    statusCode,
    headers: securityHeaders(config, origin, "text/plain; charset=utf-8"),
    body: "",
  };
}

export function errorResponse(statusCode: number, message: string, config: Config, origin?: string): ScalewayResponse {
  return jsonResponse(statusCode, { error: message }, config, origin);
}

export function getHeader(headers: Record<string, string>, name: string): string | null {
  return headers[name.toLowerCase()] ?? null;
}

export function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  }
  return result;
}

export function originFromHeaders(headers: Record<string, string>): string | undefined {
  return headers["origin"];
}

export function corsPreflightResponse(config: Config, origin?: string): ScalewayResponse {
  return {
    statusCode: 204,
    headers: securityHeaders(config, origin, "text/plain; charset=utf-8", true),
    body: "",
  };
}

export function isCorsOriginAllowed(config: Config, origin?: string): boolean {
  if (!origin) return false;
  return config.corsAllowedOrigins.has(origin) || config.corsAllowedOrigins.has("*");
}

export function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function securityHeaders(config: Config, origin: string | undefined, contentType: string, preflight = false): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };

  if (isCorsOriginAllowed(config, origin)) {
    headers["Access-Control-Allow-Origin"] = config.corsAllowedOrigins.has("*") ? "*" : origin!;
    headers["Access-Control-Allow-Headers"] = `${config.clientAuthHeader}, Authorization, Content-Type, Accept`;
    headers["Access-Control-Allow-Methods"] = Array.from(config.allowedMethods).join(",");
    headers["Access-Control-Max-Age"] = "600";
    if (!preflight) headers["Access-Control-Expose-Headers"] = "Content-Type";
  }

  return headers;
}

function sanitizeAndStripPath(rawPath: string, publicBasePath: string | null): string {
  const noQuery = rawPath.split("?")[0] ?? "/";
  let path = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;

  if (publicBasePath && path === publicBasePath) path = "/";
  else if (publicBasePath && path.startsWith(`${publicBasePath}/`)) path = path.slice(publicBasePath.length);

  if (!path.startsWith("/")) path = `/${path}`;
  if (path.startsWith("//")) throw httpError(400, "Invalid path");
  if (path.length > 2048) throw httpError(414, "Path too long");

  const lower = path.toLowerCase();
  if (lower.includes("%00") || lower.includes("%2f") || lower.includes("%5c")) {
    throw httpError(400, "Encoded path separators are not allowed");
  }

  const segments = path.split("/");
  if (segments.some((s) => s === ".." || s === "." || s.includes("\\"))) {
    throw httpError(400, "Path traversal is not allowed");
  }

  return path;
}

function normalizeQuery(params: Record<string, string | string[] | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.append(key, value);
    }
  }
  return query;
}
