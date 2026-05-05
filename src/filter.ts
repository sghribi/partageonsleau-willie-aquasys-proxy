import type { Config, FilterResult, JsonObject, JsonValue } from "./types";

const DROP = Symbol("drop");
type MaybeDropped = JsonValue | typeof DROP;

export function filterJsonByAllowedMeters(value: JsonValue, config: Config): FilterResult {
  const state = { droppedCount: 0, foundMeterIdCount: 0 };
  const filtered = filterNode(value, config, state);
  return {
    value: filtered === DROP ? null : filtered,
    droppedCount: state.droppedCount,
    foundMeterIdCount: state.foundMeterIdCount,
  };
}

export function extractMeterIdsFromQuery(query: URLSearchParams, config: Config): string[] {
  const names = new Set(config.clientMeterQueryParams.map((p) => p.toLowerCase()));
  if (config.upstreamMeterQueryParam) names.add(config.upstreamMeterQueryParam.toLowerCase());

  const ids: string[] = [];
  for (const [key, value] of query.entries()) {
    if (!names.has(key.toLowerCase())) continue;
    ids.push(...splitPotentialIdList(value));
  }
  return unique(ids);
}

export function assertRequestedMetersAreAllowed(ids: string[], config: Config): void {
  const forbidden = ids.filter((id) => !config.allowedMeterIds.has(id));
  if (forbidden.length > 0) {
    const error = new Error("Forbidden meter id in request") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
}

export function applyUpstreamMeterQueryFilter(query: URLSearchParams, config: Config): URLSearchParams {
  const result = new URLSearchParams(query);
  const requestedIds = extractMeterIdsFromQuery(result, config);
  assertRequestedMetersAreAllowed(requestedIds, config);

  if (!config.upstreamMeterQueryParam) return result;

  result.delete(config.upstreamMeterQueryParam);
  const idsToSend = requestedIds.length > 0 ? unique(requestedIds) : Array.from(config.allowedMeterIds);

  if (config.upstreamMeterQueryStyle === "repeat") {
    for (const id of idsToSend) result.append(config.upstreamMeterQueryParam, id);
  } else {
    result.set(config.upstreamMeterQueryParam, idsToSend.join(","));
  }

  return result;
}

export function assertPathMetersAreAllowed(path: string, config: Config): void {
  for (const regex of config.upstreamPathMeterIdRegexes) {
    const match = regex.exec(path);
    if (!match) continue;
    const captured = match[1];
    if (!captured) continue;
    const id = safeDecode(captured);
    if (!config.allowedMeterIds.has(id)) {
      const error = new Error("Forbidden meter id in path") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
  }
}

function filterNode(value: JsonValue, config: Config, state: { droppedCount: number; foundMeterIdCount: number }): MaybeDropped {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const filtered: JsonValue[] = [];
    for (const item of value) {
      const result = filterNode(item, config, state);
      if (result !== DROP) filtered.push(result);
    }
    return filtered;
  }

  const object = value as JsonObject;
  const ids = getMeterIdsFromObject(object, config);
  if (ids.length > 0) {
    state.foundMeterIdCount += ids.length;
    const isAllowed = ids.every((id) => config.allowedMeterIds.has(id));
    if (!isAllowed) {
      state.droppedCount += 1;
      return DROP;
    }
  }

  const filteredObject: JsonObject = {};
  for (const [key, child] of Object.entries(object)) {
    if (child === undefined) continue;
    const filteredChild = filterNode(child, config, state);
    if (filteredChild !== DROP) filteredObject[key] = filteredChild;
  }
  return filteredObject;
}

function getMeterIdsFromObject(object: JsonObject, config: Config): string[] {
  const ids: string[] = [];

  for (const key of config.meterIdKeys) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    const value = object[key];
    if (typeof value === "string" || typeof value === "number") {
      ids.push(String(value));
    }
  }

  for (const path of config.meterIdJsonPaths) {
    const value = getByPath(object, path);
    if (typeof value === "string" || typeof value === "number") {
      ids.push(String(value));
    }
  }

  return unique(ids);
}

function getByPath(object: JsonObject, path: string[]): JsonValue | undefined {
  let current: JsonValue | undefined = object;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonObject)[segment];
  }
  return current;
}

function splitPotentialIdList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // Keep CSV fallback below.
    }
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
