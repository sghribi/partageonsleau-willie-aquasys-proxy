import { test } from "node:test";
import * as assert from "node:assert/strict";
import type { Config } from "../src/types";
import { filterJsonByAllowedMeters, applyUpstreamMeterQueryFilter, assertPathMetersAreAllowed } from "../src/filter";

function config(overrides: Partial<Config> = {}): Config {
  return {
    clientApiKeys: ["client"],
    clientApiKeySha256Hashes: [],
    clientAuthHeader: "X-API-Key",
    clientAuthMode: "header",
    willieApiBaseUrl: new URL("https://api.example.test"),
    willieApiToken: "token",
    willieTokenMode: "bearer",
    willieTokenHeader: "Authorization",
    willieTokenQueryParam: "token",
    willieTokenHeaderValueTemplate: "${token}",
    allowedMeterIds: new Set(["m1", "m2"]),
    meterIdKeys: ["meterId", "meter_id"],
    meterIdJsonPaths: [["meter", "id"]],
    clientMeterQueryParams: ["meter_id", "meter_ids"],
    upstreamMeterQueryParam: "meter_ids",
    upstreamMeterQueryStyle: "csv",
    allowedUpstreamPathRegexes: [/^\/v1\/readings\/?$/],
    upstreamPathMeterIdRegexes: [/^\/v1\/meters\/([^/]+)\/readings\/?$/],
    allowedMethods: new Set(["GET"]),
    publicBasePath: null,
    allowedQueryParams: null,
    blockedQueryParams: new Set(["token"]),
    upstreamTimeoutMs: 10000,
    maxRequestBytes: 65536,
    maxResponseBytes: 5242880,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    filterOnMissingMeterId: "fail",
    allowNonJsonResponses: false,
    corsAllowedOrigins: new Set(),
    allowInsecureUpstream: false,
    logLevel: "error",
    ...overrides,
  };
}

test("filterJsonByAllowedMeters drops unauthorized meter objects", () => {
  const result = filterJsonByAllowedMeters(
    {
      data: [
        { meterId: "m1", value: 10 },
        { meterId: "m3", value: 99 },
        { meter: { id: "m2" }, value: 20 },
      ],
    },
    config(),
  );

  assert.equal(result.droppedCount, 1);
  assert.equal(result.foundMeterIdCount, 3);
  assert.deepEqual(result.value, {
    data: [
      { meterId: "m1", value: 10 },
      { meter: { id: "m2" }, value: 20 },
    ],
  });
});

test("applyUpstreamMeterQueryFilter injects allowed meters if no client filter is provided", () => {
  const query = applyUpstreamMeterQueryFilter(new URLSearchParams("from=2026-01-01"), config());
  assert.equal(query.get("meter_ids"), "m1,m2");
});

test("applyUpstreamMeterQueryFilter rejects unauthorized client meter ids", () => {
  assert.throws(() => {
    applyUpstreamMeterQueryFilter(new URLSearchParams("meter_ids=m3"), config());
  });
});

test("assertPathMetersAreAllowed rejects unauthorized path ids", () => {
  assert.throws(() => assertPathMetersAreAllowed("/v1/meters/m3/readings", config()));
});
