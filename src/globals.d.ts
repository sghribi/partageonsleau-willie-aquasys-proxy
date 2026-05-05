/* Minimal Node globals used by this project, to keep runtime dependencies empty. */
declare const process: {
  env: Record<string, string | undefined>;
  version: string;
};

declare const console: {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare const Buffer: {
  from(input: string, encoding?: "utf8" | "base64"): { toString(encoding?: "utf8"): string; length: number };
  byteLength(input: string, encoding?: "utf8"): number;
};

declare const exports: Record<string, unknown>;
