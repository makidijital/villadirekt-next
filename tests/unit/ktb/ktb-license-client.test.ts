// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { fetchKtbLicensePage } from "@/lib/ktb/ktb-license.client.server";

function html(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

describe("fetchKtbLicensePage", () => {
  it("URL sabit host + belgeno parametresi, redirect manual, no-store, UA", async () => {
    const fetchImpl = vi.fn(async () => html("<html>ok</html>"));
    const out = await fetchKtbLicensePage("07-6195", { fetchImpl });
    expect(out).toMatchObject({ ok: true, httpStatus: 200, body: "<html>ok</html>" });
    if (out.ok) expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.ktb.gov.tr/genel/bakanlikbelgelikonutlardemo.aspx?belgeno=07-6195");
    expect(init.redirect).toBe("manual");
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("Mozilla/5.0");
  });

  const cases: Array<[string, () => Promise<Response>, Record<string, unknown>]> = [
    ["403 → tarama durur", async () => html("x", 403), { reason: "http_403", stopRun: true, retryable: false }],
    ["429 → tarama durur", async () => html("x", 429), { reason: "http_429", stopRun: true, retryable: false }],
    ["500 → retryable", async () => html("x", 500), { reason: "http_5xx", retryable: true, stopRun: false }],
    ["302 → yapısal", async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }), { reason: "redirect", structural: true }],
    ["404 → yapısal", async () => html("x", 404), { reason: "http_404", structural: true }],
    ["JSON → yapısal", async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }), { reason: "unexpected_content_type", structural: true }],
    ["büyük yanıt", async () => html("x", 200, { "content-length": String(5 * 1024 * 1024) }), { reason: "response_too_large" }],
    ["DNS/ağ hatası", async () => { throw new TypeError("fetch failed"); }, { reason: "network_error", retryable: true }],
  ];
  for (const [name, impl, expected] of cases) {
    it(name, async () => {
      const out = await fetchKtbLicensePage("07-6195", { fetchImpl: impl as never });
      expect(out.ok).toBe(false);
      expect(out).toMatchObject(expected);
    });
  }

  it("timeout → retryable CHECK_FAILED nedeni", async () => {
    const fetchImpl = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    const out = await fetchKtbLicensePage("07-6195", { fetchImpl, timeoutMs: 20 });
    expect(out).toMatchObject({ ok: false, reason: "timeout", retryable: true });
  });
});
