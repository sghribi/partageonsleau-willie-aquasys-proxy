import type { Config, IncomingRequest } from "./types";
import { applyUpstreamMeterQueryFilter, assertPathMetersAreAllowed, assertRequestedMetersAreAllowed, extractMeterIdsFromQuery } from "./filter";
import { httpError } from "./http";

export function validateAndPrepareRequest(request: IncomingRequest, config: Config): IncomingRequest {
  if (!config.allowedMethods.has(request.method)) {
    throw httpError(405, "Method not allowed");
  }

  if (!isPathAllowed(request.path, config)) {
    throw httpError(404, "Endpoint not found");
  }

  assertPathMetersAreAllowed(request.path, config);

  const sanitizedQuery = sanitizeQuery(request.query, config);
  const requestedMeters = extractMeterIdsFromQuery(sanitizedQuery, config);
  assertRequestedMetersAreAllowed(requestedMeters, config);

  const filteredQuery = applyUpstreamMeterQueryFilter(sanitizedQuery, config);
  return { ...request, query: filteredQuery };
}

function isPathAllowed(path: string, config: Config): boolean {
  return config.allowedUpstreamPathRegexes.some((regex) => regex.test(path));
}

function sanitizeQuery(query: URLSearchParams, config: Config): URLSearchParams {
  const result = new URLSearchParams();
  let count = 0;

  for (const [key, value] of query.entries()) {
    count += 1;
    if (count > 100) throw httpError(400, "Too many query parameters");
    if (key.length > 128 || value.length > 4096) throw httpError(400, "Query parameter too large");

    const lowerKey = key.toLowerCase();
    if (config.blockedQueryParams.has(lowerKey)) continue;
    if (config.allowedQueryParams && !config.allowedQueryParams.has(lowerKey)) continue;

    result.append(key, value);
  }

  return result;
}
