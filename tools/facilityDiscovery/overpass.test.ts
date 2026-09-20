import { describe, expect, it } from "vitest";

import {
  MAX_RESPONSE_BYTES,
  fetchOverpassResponse,
  summarizePayload,
  USER_AGENT,
  type FetchOptions,
} from "./overpass.ts";

const BBOX: [number, number, number, number] = [8.85, 12.35, 9.65, 12.75];
const CONFIG = { endpoint: "https://overpass.test/api/interpreter", timeoutMs: 25_000, retries: 1 };
const NO_DELAY: FetchOptions = { delayFn: async () => {} };

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okOverpassBody(): string {
  return JSON.stringify({ version: 0.6, elements: [{ type: "node", id: 1, lat: 9.2, lon: 12.4, tags: { amenity: "hospital", name: "X" } }] });
}

/** Builds a Response whose body streams in chunks (for size-cap tests). */
function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function mockFetch(handlers: ((url: string, init: RequestInit | undefined) => Response | Promise<Response>)[]): { fetch: typeof fetch; calls: { url: string; init: RequestInit | undefined }[] } {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  let index = 0;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    const handler = handlers[Math.min(index, handlers.length - 1)];
    index++;
    if (handler === undefined) throw new Error("unexpected extra fetch call");
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}

describe("fetchOverpassResponse — request shape", () => {
  it("POSTs the query as a urlencoded body with the honest User-Agent and timeout signal", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse(okOverpassBody())]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(CONFIG.endpoint);
    expect(calls[0]?.init?.method).toBe("POST");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["User-Agent"]).toMatch(/Lifeguard360-facility-discovery/);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = String(calls[0]?.init?.body);
    expect(body).toMatch(/^data=/);
    expect(decodeURIComponent(body)).toContain('nwr["amenity"="hospital"]');
    expect(decodeURIComponent(body)).toContain("(8.85,12.35,9.65,12.75)");
    const signal = calls[0]?.init?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("is deterministic: same bbox → same query body", async () => {
    const first = mockFetch([() => jsonResponse(okOverpassBody())]);
    const second = mockFetch([() => jsonResponse(okOverpassBody())]);
    await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn: first.fetch });
    await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn: second.fetch });
    expect(first.calls[0]?.init?.body).toBe(second.calls[0]?.init?.body);
  });
});

describe("fetchOverpassResponse — success paths", () => {
  it("returns parsed data with attempt and byte metadata", async () => {
    const { fetch: fetchFn } = mockFetch([() => jsonResponse(okOverpassBody())]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempt).toBe(1);
      expect(result.bytes).toBeGreaterThan(0);
      expect(summarizePayload(result.data).totalElements).toBe(1);
    }
  });
});

describe("fetchOverpassResponse — retry policy (max 2 attempts)", () => {
  it("retries 429 once then succeeds; records attempt 2", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("slow down", 429), () => jsonResponse(okOverpassBody())]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempt).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("retries 500 once then succeeds", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("boom", 500), () => jsonResponse(okOverpassBody())]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("fails after repeated 429 (2 attempts total, not an uncontrolled loop)", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("slow", 429), () => jsonResponse("slow", 429)]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http-retryable-exhausted");
      expect(result.error.status).toBe(429);
    }
    expect(calls).toHaveLength(2);
  });

  it("fails after repeated 500", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("boom", 500), () => jsonResponse("boom", 503)]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("http-retryable-exhausted");
    expect(calls).toHaveLength(2);
  });

  it("does NOT retry non-retryable 400-class errors", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("bad request", 400)]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("http-non-retryable");
    expect(calls).toHaveLength(1);
  });

  it("retries a network failure once then succeeds", async () => {
    let calls = 0;
    const fetchFn = (async (): Promise<Response> => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return jsonResponse(okOverpassBody());
    }) as unknown as typeof fetch;
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("fails after repeated network failures", async () => {
    const fetchFn = (async (): Promise<Response> => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("network-exhausted");
  });

  it("classifies timeout aborts distinctly", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    const fetchFn = (async (): Promise<Response> => {
      throw timeoutError;
    }) as unknown as typeof fetch;
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("timeout");
  });

  it("never retries malformed JSON", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse("<html>not json</html>")]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("malformed-json");
    expect(calls).toHaveLength(1);
  });

  it("rejects oversized responses without parsing or retrying", async () => {
    const huge = "x".repeat(MAX_RESPONSE_BYTES + 1);
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse(huge)]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("oversized-response");
    expect(calls).toHaveLength(1);
  });

  it("rejects a streaming response that crosses the size cap mid-body", async () => {
    const chunk = "x".repeat(1024 * 1024);
    const chunks: string[] = Array.from({ length: 33 }, () => chunk); // 33 MiB total
    const { fetch: fetchFn } = mockFetch([() => streamingResponse(chunks)]);
    const result = await fetchOverpassResponse(BBOX, CONFIG, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("oversized-response");
  });

  it("rejects invalid configuration before any request", async () => {
    const { fetch: fetchFn, calls } = mockFetch([() => jsonResponse(okOverpassBody())]);
    const result = await fetchOverpassResponse(BBOX, { endpoint: "", timeoutMs: 0, retries: 1 }, { ...NO_DELAY, fetchFn });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid-config");
    expect(calls).toHaveLength(0);
  });
});
