/**
 * Overpass HTTP layer (Slice 2 — discovery CLI).
 *
 * The ONLY module in the discovery tooling permitted to touch the network.
 * Uses Node's built-in fetch (no HTTP packages). Policy (per the approved
 * Slice 2 spec):
 *   - exactly 2 attempts max (retries=1), ~5 s pause between attempts
 *   - retry ONLY on HTTP 429, HTTP 5xx, network failure
 *   - never retry 4xx (other than 429), malformed JSON, or parser failures
 *   - response-size sanity cap before any parsing
 * No Firebase, no src/** imports, no filesystem access.
 */

import type { Bbox } from "./query.ts";
import { buildOverpassQuery } from "./query.ts";

/** Identifies the tool honestly to the Overpass service (no browser impersonation). */
export const USER_AGENT = "Lifeguard360-facility-discovery/0.1 (OpenStreetMap attribution)";

/** Hard cap on accepted response body size (bytes) — sanity guard, not a quota. */
export const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** Pause before the single retry (spec: ~5 seconds). */
const RETRY_DELAY_MS = 5_000;

export interface OverpassRequestConfig {
  endpoint: string;
  timeoutMs: number;
  retries: number;
}

export type OverpassFailureKind =
  | "invalid-config"
  | "http-non-retryable"
  | "http-retryable-exhausted"
  | "network-exhausted"
  | "timeout"
  | "malformed-json"
  | "oversized-response";

export class OverpassError extends Error {
  readonly kind: OverpassFailureKind;
  readonly status?: number;

  constructor(kind: OverpassFailureKind, message: string, status?: number) {
    super(message);
    this.name = "OverpassError";
    this.kind = kind;
    this.status = status;
  }
}

export interface OverpassSuccess {
  ok: true;
  data: unknown;
  /** Attempt that succeeded (1-based) — surfaced for run metadata. */
  attempt: number;
  /** Response body size in bytes (for the run log). */
  bytes: number;
}

export interface OverpassFailure {
  ok: false;
  error: OverpassError;
}

export interface FetchOptions {
  retries?: number;
  /** Injectable delay for tests (defaults to a real ~5 s pause). */
  delayFn?: (ms: number) => Promise<void>;
  /** Injectable fetch for tests (defaults to globalThis.fetch). */
  fetchFn?: typeof fetch;
  /** Injectable abort-signal factory for tests (defaults to AbortSignal.timeout). */
  timeoutFn?: (ms: number) => AbortSignal;
}

const defaultDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Reads the body with a hard byte cap; rejects as oversized beyond it. */
async function readBodyWithCap(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    // No streaming body available (e.g. test mocks without a body) — fall back to text().
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new OverpassError("oversized-response", `Response exceeds the ${maxBytes}-byte sanity limit.`);
    }
    return text;
  }

  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new OverpassError("oversized-response", `Response exceeds the ${maxBytes}-byte sanity limit.`);
      }
      text += decoder.decode(value, { stream: true });
    }
  }
  text += decoder.decode();
  return text;
}

/** Returns the element count without keeping the whole payload alive. */
function countElements(payload: unknown): number {
  if (payload !== null && typeof payload === "object") {
    const elements = (payload as { elements?: unknown }).elements;
    if (Array.isArray(elements)) return elements.length;
  }
  return 0;
}

/**
 * Executes the Overpass request for a bbox with the exact approved retry
 * policy. On success returns the parsed JSON plus request metadata; on
 * failure returns a typed OverpassError (never throws for expected failures).
 */
export async function fetchOverpassResponse(
  bbox: Bbox,
  config: OverpassRequestConfig,
  options: FetchOptions = {},
): Promise<OverpassSuccess | OverpassFailure> {
  if (
    typeof config.endpoint !== "string" ||
    config.endpoint === "" ||
    !Number.isFinite(config.timeoutMs) ||
    config.timeoutMs <= 0 ||
    !Number.isInteger(config.retries) ||
    config.retries < 0
  ) {
    return {
      ok: false,
      error: new OverpassError("invalid-config", "Overpass config must include a valid endpoint, positive timeoutMs, and non-negative retries."),
    };
  }

  const maxAttempts = config.retries + 1;
  const doFetch = options.fetchFn ?? globalThis.fetch;
  const delay = options.delayFn ?? defaultDelay;
  const timeoutFn = options.timeoutFn ?? ((ms: number) => AbortSignal.timeout(ms));
  const query = buildOverpassQuery(bbox);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await doFetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: timeoutFn(config.timeoutMs),
      });
    } catch (cause) {
      const isTimeout = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      const error = new OverpassError(
        isTimeout ? "timeout" : "network-exhausted",
        isTimeout
          ? `Overpass request timed out after ${config.timeoutMs} ms.`
          : `Network failure contacting Overpass: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      if (attempt < maxAttempts) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return { ok: false, error };
    }

    if (!response.ok) {
      const status = response.status;
      // Drain the error body so the socket can be reused, but never parse it as data.
      await response.text().catch(() => "");
      if (isRetryableStatus(status) && attempt < maxAttempts) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return {
        ok: false,
        error: new OverpassError(
          isRetryableStatus(status) ? "http-retryable-exhausted" : "http-non-retryable",
          `Overpass returned HTTP ${status}${attempt < maxAttempts ? " after retry" : ""}.`,
          status,
        ),
      };
    }

    try {
      const text = await readBodyWithCap(response, MAX_RESPONSE_BYTES);
      const data: unknown = JSON.parse(text);
      return { ok: true, data, attempt, bytes: Buffer.byteLength(text) };
    } catch (cause) {
      if (cause instanceof OverpassError) return { ok: false, error: cause };
      return {
        ok: false,
        error: new OverpassError(
          "malformed-json",
          `Overpass response was not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      };
    }
  }

  // Defensive: the loop always returns; this satisfies exhaustive flow analysis.
  return {
    ok: false,
    error: new OverpassError("network-exhausted", "Overpass request failed after all attempts."),
  };
}

/** Element count of a successful payload (for _run.json without storing raw responses). */
export function summarizePayload(payload: unknown): { totalElements: number } {
  return { totalElements: countElements(payload) };
}
