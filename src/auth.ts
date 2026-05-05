import type { AuthResult, Config, ScalewayEvent } from "./types";
import { getHeader, normalizeHeaders } from "./http";

export async function authenticateClient(event: ScalewayEvent, config: Config): Promise<AuthResult> {
  const headers = normalizeHeaders(event.headers ?? {});
  const token = extractClientToken(headers, config);
  if (!token) return { ok: false, identity: "anonymous" };

  const tokenHash = await sha256Hex(token);

  for (const expected of config.clientApiKeySha256Hashes) {
    if (constantTimeEqual(tokenHash, expected.toLowerCase())) {
      return { ok: true, identity: tokenHash.slice(0, 16) };
    }
  }

  for (const raw of config.clientApiKeys) {
    if (constantTimeEqual(token, raw)) {
      return { ok: true, identity: tokenHash.slice(0, 16) };
    }
  }

  return { ok: false, identity: tokenHash.slice(0, 16) };
}

function extractClientToken(headers: Record<string, string>, config: Config): string | null {
  if (config.clientAuthMode === "bearer") {
    const authorization = getHeader(headers, "Authorization");
    if (!authorization) return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    return match?.[1]?.trim() || null;
  }

  const value = getHeader(headers, config.clientAuthHeader);
  return value?.trim() || null;
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}
