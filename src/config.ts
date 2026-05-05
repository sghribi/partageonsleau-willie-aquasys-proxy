import type {
  ClientAuthMode,
  Config,
  LogLevel,
  MissingMeterIdPolicy,
  QueryStyle,
  WillieTokenMode,
} from "./types";

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const allowInsecureUpstream = getBoolean("ALLOW_INSECURE_UPSTREAM", false);
  const willieApiBaseUrl = parseBaseUrl(required("WILLIE_API_BASE_URL"), allowInsecureUpstream);

  const willieTokenMode = getEnum<WillieTokenMode>("WILLIE_TOKEN_MODE", ["bearer", "x-api-key", "header", "query", "none"], "bearer");
  const willieApiToken = env("WILLIE_API_TOKEN", "").trim();
  if (willieTokenMode !== "none" && willieApiToken.length === 0) {
    throw new Error("Missing required env var WILLIE_API_TOKEN when WILLIE_TOKEN_MODE is not none");
  }

  const clientApiKeys = splitList(env("AQUASYS_API_KEYS", ""));
  const clientApiKeySha256Hashes = splitList(env("AQUASYS_API_KEY_SHA256_HASHES", "")).map((h) => h.toLowerCase());
  if (clientApiKeys.length === 0 && clientApiKeySha256Hashes.length === 0) {
    throw new Error("Missing AQUASYS_API_KEYS or AQUASYS_API_KEY_SHA256_HASHES");
  }

  const allowedMeterIds = new Set(splitList(required("ALLOWED_METER_IDS")));
  if (allowedMeterIds.size === 0) throw new Error("ALLOWED_METER_IDS must not be empty");

  const allowedUpstreamPathRegexes = splitList(env("ALLOWED_UPSTREAM_PATHS", "")).map(toRegex);
  if (allowedUpstreamPathRegexes.length === 0) {
    throw new Error("ALLOWED_UPSTREAM_PATHS is required. Do not deploy a pass-through proxy without a path allowlist.");
  }

  const allowedQueryParamsList = splitList(env("ALLOWED_QUERY_PARAMS", ""));
  const publicBasePath = normalizeOptionalPath(env("PUBLIC_BASE_PATH", ""));

  cachedConfig = {
    clientApiKeys,
    clientApiKeySha256Hashes,
    clientAuthHeader: env("AQUASYS_AUTH_HEADER", "X-API-Key"),
    clientAuthMode: getEnum<ClientAuthMode>("AQUASYS_AUTH_MODE", ["header", "bearer"], "header"),

    willieApiBaseUrl,
    willieApiToken,
    willieTokenMode,
    willieTokenHeader: env("WILLIE_TOKEN_HEADER", willieTokenMode === "x-api-key" ? "X-API-Key" : "Authorization"),
    willieTokenQueryParam: env("WILLIE_TOKEN_QUERY_PARAM", "token"),
    willieTokenHeaderValueTemplate: env("WILLIE_TOKEN_HEADER_VALUE_TEMPLATE", "${token}"),

    allowedMeterIds,
    meterIdKeys: splitList(env("METER_ID_KEYS", "meterId,meter_id,waterMeterId,water_meter_id,counterId,counter_id,deviceId,device_id")),
    meterIdJsonPaths: splitList(env("METER_ID_JSON_PATHS", "meter.id,counter.id,device.id,waterMeter.id")).map((p) => p.split(".").filter(Boolean)),
    clientMeterQueryParams: splitList(env("CLIENT_METER_QUERY_PARAMS", "meterId,meter_id,meterIds,meter_ids,counterId,counter_id,deviceId,device_id")),
    upstreamMeterQueryParam: emptyToNull(env("UPSTREAM_METER_QUERY_PARAM", "")),
    upstreamMeterQueryStyle: getEnum<QueryStyle>("UPSTREAM_METER_QUERY_STYLE", ["csv", "repeat"], "csv"),

    allowedUpstreamPathRegexes,
    upstreamPathMeterIdRegexes: splitList(env("UPSTREAM_PATH_METER_ID_REGEXES", "")).map(toRegex),
    allowedMethods: new Set(splitList(env("ALLOWED_METHODS", "GET,HEAD,OPTIONS")).map((m) => m.toUpperCase())),
    publicBasePath,
    allowedQueryParams: allowedQueryParamsList.length > 0 ? new Set(allowedQueryParamsList.map((v) => v.toLowerCase())) : null,
    blockedQueryParams: new Set(splitList(env("BLOCKED_QUERY_PARAMS", "api_key,key,token,access_token,auth,authorization")).map((v) => v.toLowerCase())),

    upstreamTimeoutMs: getInteger("UPSTREAM_TIMEOUT_MS", 10_000, 500, 60_000),
    maxRequestBytes: getInteger("MAX_REQUEST_BYTES", 65_536, 0, 10_485_760),
    maxResponseBytes: getInteger("MAX_RESPONSE_BYTES", 5_242_880, 1024, 52_428_800),
    rateLimitWindowMs: getInteger("RATE_LIMIT_WINDOW_MS", 60_000, 1000, 3_600_000),
    rateLimitMaxRequests: getInteger("RATE_LIMIT_MAX_REQUESTS", 120, 1, 100_000),

    filterOnMissingMeterId: getEnum<MissingMeterIdPolicy>("FILTER_ON_MISSING_METER_ID", ["fail", "pass"], "fail"),
    allowNonJsonResponses: getBoolean("ALLOW_NON_JSON_RESPONSES", false),
    corsAllowedOrigins: new Set(splitList(env("CORS_ALLOWED_ORIGINS", ""))),
    allowInsecureUpstream,
    logLevel: getEnum<LogLevel>("LOG_LEVEL", ["debug", "info", "warn", "error"], "info"),
  };

  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

function required(name: string): string {
  const value = env(name, "").trim();
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function splitList(value: string): string[] {
  return value
    .split(/[;,\n]/g)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function getEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = env(name, fallback).trim().toLowerCase();
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
}

function getBoolean(name: string, fallback: boolean): boolean {
  const raw = env(name, String(fallback)).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(raw)) return true;
  if (["false", "0", "no", "n"].includes(raw)) return false;
  throw new Error(`${name} must be a boolean`);
}

function getInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = env(name, String(fallback)).trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function parseBaseUrl(raw: string, allowInsecure: boolean): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new Error("WILLIE_API_BASE_URL must be HTTPS unless ALLOW_INSECURE_UPSTREAM=true");
  }
  url.hash = "";
  url.search = "";
  return url;
}

function toRegex(raw: string): RegExp {
  try {
    return new RegExp(raw);
  } catch (error) {
    throw new Error(`Invalid regex in env configuration: ${raw}`);
  }
}

function normalizeOptionalPath(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return value.startsWith("/") ? value.replace(/\/$/, "") : `/${value.replace(/\/$/, "")}`;
}
