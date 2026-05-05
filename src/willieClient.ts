import type { Config, IncomingRequest, JsonValue, ScalewayResponse } from "./types";
import { filterJsonByAllowedMeters } from "./filter";
import { httpError, jsonResponse } from "./http";

interface UpstreamResult {
  statusCode: number;
  contentType: string;
  bodyText: string;
}

export async function callWillieAndFilter(request: IncomingRequest, config: Config, origin?: string): Promise<ScalewayResponse> {
  const upstream = await callWillie(request, config);

  if (request.method === "HEAD" || upstream.statusCode === 204) {
    return { statusCode: upstream.statusCode, headers: baseResponseHeaders(origin, config), body: "" };
  }

  const isJson = isJsonContentType(upstream.contentType);
  if (!isJson) {
    if (!config.allowNonJsonResponses) {
      throw httpError(502, "Upstream response is not JSON; refusing to relay unfilterable content");
    }
    return {
      statusCode: upstream.statusCode,
      headers: baseResponseHeaders(origin, config, upstream.contentType || "application/octet-stream"),
      body: upstream.bodyText,
    };
  }

  const parsed = safeParseJson(upstream.bodyText);
  if (!parsed.ok) throw httpError(502, "Invalid JSON returned by upstream API");

  const filtered = filterJsonByAllowedMeters(parsed.value, config);
  if (filtered.foundMeterIdCount === 0 && config.filterOnMissingMeterId === "fail") {
    throw httpError(502, "No meter identifier found in upstream response; refusing to relay potentially unfiltered data");
  }

  return jsonResponse(
    upstream.statusCode,
    filtered.value,
    config,
    origin,
  );
}

export function buildWillieUrl(request: IncomingRequest, config: Config): URL {
  const base = config.willieApiBaseUrl;
  const basePath = base.pathname.replace(/\/$/, "");
  const requestPath = request.path.replace(/^\/+/, "");
  const url = new URL(`${basePath}/${requestPath}`, base.origin);

  for (const [key, value] of request.query.entries()) {
    url.searchParams.append(key, value);
  }

  if (config.willieTokenMode === "query") {
    url.searchParams.set(config.willieTokenQueryParam, config.willieApiToken);
  }

  if (url.origin !== base.origin) throw httpError(400, "Invalid upstream URL");
  return url;
}

async function callWillie(request: IncomingRequest, config: Config): Promise<UpstreamResult> {
  const url = buildWillieUrl(request, config);
  const headers = buildUpstreamHeaders(request, config);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(config.upstreamTimeoutMs),
  };

  if (!["GET", "HEAD"].includes(request.method) && request.body !== null) {
    init.body = request.body;
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw httpError(504, "Upstream API timeout");
    }
    throw httpError(502, "Unable to reach upstream API");
  }

  const bodyText = await readResponseBodyWithLimit(response, config.maxResponseBytes);
  return {
    statusCode: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bodyText,
  };
}

function buildUpstreamHeaders(request: IncomingRequest, config: Config): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  headers.set("User-Agent", "partageons-eau-aquasys-willie-proxy/1.0");

  const contentType = request.headers["content-type"];
  if (contentType && !["GET", "HEAD"].includes(request.method)) {
    headers.set("Content-Type", contentType);
  }

  switch (config.willieTokenMode) {
    case "bearer":
      headers.set("Authorization", `Bearer ${config.willieApiToken}`);
      break;
    case "x-api-key":
      headers.set(config.willieTokenHeader || "X-API-Key", config.willieApiToken);
      break;
    case "header":
      headers.set(config.willieTokenHeader, config.willieTokenHeaderValueTemplate.replace("${token}", config.willieApiToken));
      break;
    case "query":
    case "none":
      break;
  }

  return headers;
}

async function readResponseBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw httpError(502, "Upstream response too large");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function safeParseJson(text: string): { ok: true; value: JsonValue } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch {
    return { ok: false };
  }
}

function isJsonContentType(contentType: string): boolean {
  return /(^|;)\s*application\/(.+\+)?json\b/i.test(contentType);
}

function baseResponseHeaders(origin: string | undefined, config: Config, contentType = "application/json; charset=utf-8"): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
  if (origin && (config.corsAllowedOrigins.has(origin) || config.corsAllowedOrigins.has("*"))) {
    headers["Access-Control-Allow-Origin"] = config.corsAllowedOrigins.has("*") ? "*" : origin;
  }
  return headers;
}
