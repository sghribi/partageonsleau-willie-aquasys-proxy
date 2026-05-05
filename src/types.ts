export type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface ScalewayEvent {
  path?: string;
  queryStringParameters?: Record<string, string | string[] | undefined> | null;
  headers?: Record<string, string | string[] | undefined> | null;
  body?: string | null;
  httpMethod?: string;
  method?: string;
  isBase64Encoded?: boolean;
}

export interface ScalewayContext {
  [key: string]: unknown;
}

export interface ScalewayResponse {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  isBase64Encoded?: boolean;
}

export type WillieTokenMode = "bearer" | "x-api-key" | "header" | "query" | "none";
export type ClientAuthMode = "header" | "bearer";
export type QueryStyle = "csv" | "repeat";
export type MissingMeterIdPolicy = "fail" | "pass";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  clientApiKeys: string[];
  clientApiKeySha256Hashes: string[];
  clientAuthHeader: string;
  clientAuthMode: ClientAuthMode;

  willieApiBaseUrl: URL;
  willieApiToken: string;
  willieTokenMode: WillieTokenMode;
  willieTokenHeader: string;
  willieTokenQueryParam: string;
  willieTokenHeaderValueTemplate: string;

  allowedMeterIds: Set<string>;
  meterIdKeys: string[];
  meterIdJsonPaths: string[][];
  clientMeterQueryParams: string[];
  upstreamMeterQueryParam: string | null;
  upstreamMeterQueryStyle: QueryStyle;

  allowedUpstreamPathRegexes: RegExp[];
  upstreamPathMeterIdRegexes: RegExp[];
  allowedMethods: Set<string>;
  publicBasePath: string | null;
  allowedQueryParams: Set<string> | null;
  blockedQueryParams: Set<string>;

  upstreamTimeoutMs: number;
  maxRequestBytes: number;
  maxResponseBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  filterOnMissingMeterId: MissingMeterIdPolicy;
  allowNonJsonResponses: boolean;
  corsAllowedOrigins: Set<string>;
  allowInsecureUpstream: boolean;
  logLevel: LogLevel;
}

export interface IncomingRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: string | null;
}

export interface AuthResult {
  ok: boolean;
  identity: string;
}

export interface FilterResult {
  value: JsonValue;
  droppedCount: number;
  foundMeterIdCount: number;
}
