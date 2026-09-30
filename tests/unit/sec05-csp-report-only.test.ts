/* ===============================================================
   🛡️ SEC-05 — CSP REPORT-ONLY REGRESYON KİLİDİ
   ===============================================================
   1) Yalnız `Content-Security-Policy-Report-Only` (enforce YOK).
   2) CDN origin'leri env'den (hardcode / fallback domain YOK).
   3) 'unsafe-eval' YOK; Report-Only'de yok sayılan direktifler YOK.
   4) /api/csp-report: 204, maskeleme (token/path/query loglanmaz),
      boyut sınırı, dedupe.
   =============================================================== */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nextConfig, { buildCspReportOnly } from "@/next.config";
import {
  extractViolations,
  summarizeBlocked,
  summarizePage,
  __resetCspReportDedupeForTests,
} from "@/lib/security/csp-report";
import { POST } from "@/app/api/csp-report/route";

const ENV = {
  NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES: "https://cdn.test-villa.example/",
  NEXT_PUBLIC_CDN_BASE_SITE_ASSETS: "https://assets.test-site.example/base/",
};

const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(name + " "))
    ?.split(/\s+/)
    .slice(1) ?? null;

describe("SEC-05 — buildCspReportOnly", () => {
  it("CDN origin'leri env'den türetilir (path atılır)", () => {
    for (const kind of ["public", "admin"] as const) {
      const img = directive(buildCspReportOnly(kind, ENV), "img-src");
      expect(img).toContain("https://cdn.test-villa.example");
      expect(img).toContain("https://assets.test-site.example");
    }
  });

  it("env yoksa CDN eklenmez ve HİÇBİR fallback domain kullanılmaz", () => {
    const p = buildCspReportOnly("public", {});
    expect(p).not.toMatch(/villayagel|yazvillam|example/i);
    expect(directive(p, "img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://*.supabase.co",
      "https://i.ytimg.com",
      "https://*.googletagmanager.com",
      "https://*.google-analytics.com",
    ]);
  });

  it("geçersiz / tehlikeli env değeri policy'ye sızmaz", () => {
    const p = buildCspReportOnly("public", {
      NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES: "javascript:alert(1)",
      NEXT_PUBLIC_CDN_BASE_SITE_ASSETS: "not a url; script-src *",
    });
    expect(p).not.toContain("javascript");
    expect(p).not.toContain("script-src *");
  });

  it("'unsafe-eval' yok; Report-Only'de yok sayılan direktifler yok", () => {
    for (const kind of ["public", "admin"] as const) {
      const p = buildCspReportOnly(kind, ENV);
      expect(p).not.toContain("unsafe-eval");
      expect(p).not.toContain("frame-ancestors");
      expect(p).not.toContain("upgrade-insecure-requests");
      expect(p).not.toMatch(/nonce-|strict-dynamic/);
      expect(directive(p, "object-src")).toEqual(["'none'"]);
      expect(directive(p, "base-uri")).toEqual(["'self'"]);
      expect(directive(p, "report-uri")).toEqual(["/api/csp-report"]);
    }
  });

  it("public: GTM/GA4 + harita/YouTube iframe'leri; admin: GTM YOK, harita seçici var", () => {
    const pub = buildCspReportOnly("public", ENV);
    const adm = buildCspReportOnly("admin", ENV);
    expect(directive(pub, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://*.googletagmanager.com",
    ]);
    expect(directive(pub, "connect-src")).toContain("https://*.google-analytics.com");
    expect(directive(pub, "frame-src")).toEqual([
      "https://www.google.com",
      "https://google.com",
      "https://maps.google.com",
      "https://www.youtube-nocookie.com",
    ]);
    expect(directive(adm, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(adm).not.toContain("googletagmanager");
    expect(adm).not.toContain("google-analytics");
    expect(directive(adm, "connect-src")).toEqual(["'self'"]);
    expect(directive(adm, "img-src")).toEqual(
      expect.arrayContaining(["https://unpkg.com", "https://*.tile.openstreetmap.org"])
    );
  });
});

describe("SEC-05 — next.config headers()", () => {
  it("yalnız Report-Only header'ı döner (enforce eden CSP YOK)", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(2);
    for (const r of rules) {
      for (const h of r.headers) {
        expect(h.key).toBe("Content-Security-Policy-Report-Only");
        expect(h.key.toLowerCase()).not.toBe("content-security-policy");
      }
    }
    expect(rules.map((r) => r.source)).toEqual([
      "/((?!api|_next/static|_next/image|favicon.ico|maki-admin).*)",
      "/maki-admin/:path*",
    ]);
  });

  it("public kaynak deseni: sayfalar eşleşir; api/_next/admin eşleşmez", () => {
    const re = /^\/((?!api|_next\/static|_next\/image|favicon.ico|maki-admin).*)$/;
    for (const p of ["/", "/kiralik-villa/x", "/v/tok", "/en/iletisim", "/bu-sayfa-yok"]) {
      expect(re.test(p)).toBe(true);
    }
    for (const p of ["/api/csp-report", "/_next/static/chunks/a.js", "/_next/image", "/maki-admin", "/maki-admin/login"]) {
      expect(re.test(p)).toBe(false);
    }
  });

  it("images.remotePatterns: legacy korunur; CDN env yoksa eski/sabit domain'e dönülmez", () => {
    const pats = nextConfig.images?.remotePatterns ?? [];
    expect(pats[0]).toEqual({
      protocol: "https",
      hostname: "**.supabase.co",
      pathname: "/storage/v1/object/public/**",
    });
    /* Test ortamında NEXT_PUBLIC_CDN_BASE_* tanımsız → yalnız legacy. */
    expect(pats).toHaveLength(1);
    expect(JSON.stringify(pats)).not.toMatch(/villayagel/i);
  });

  it("images.remotePatterns: CDN host'ları env'den eklenir", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES", "https://cdn.env-test.example");
    vi.stubEnv("NEXT_PUBLIC_CDN_BASE_SITE_ASSETS", "https://assets.env-test.example/");
    try {
      const cfg = (await import("@/next.config")).default;
      const hosts = (cfg.images?.remotePatterns ?? []).map((p) =>
        typeof p === "object" && "hostname" in p ? p.hostname : ""
      );
      expect(hosts).toEqual([
        "**.supabase.co",
        "cdn.env-test.example",
        "assets.env-test.example",
      ]);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

describe("SEC-05 — CSP rapor ayrıştırma ve maskeleme", () => {
  it("blocked-uri → yalnız origin (path/query/token atılır)", () => {
    expect(summarizeBlocked("https://px.example/tr?id=123&cid=abc")).toBe("https://px.example");
    expect(summarizeBlocked("inline")).toBe("inline");
    expect(summarizeBlocked("eval")).toBe("eval");
    expect(summarizeBlocked("data:image/png;base64,AAAA")).toBe("data");
    expect(summarizeBlocked("")).toBe("unknown");
  });

  it("sayfa yolu maskelenir (token'lı yollar)", () => {
    expect(summarizePage("https://site.example/v/SECRET_TOKEN_123")).toBe("/v/*");
    expect(summarizePage("https://site.example/en/v/SECRET")).toBe("/en/v/*");
    expect(summarizePage("https://site.example/favoriler/paylas/TOKEN")).toBe("/favoriler/*");
    expect(summarizePage("https://site.example/?q=1")).toBe("/");
    expect(summarizePage("https://site.example/iletisim")).toBe("/iletisim");
  });

  it("application/csp-report ve Reporting API formatlarını ayrıştırır", () => {
    expect(
      extractViolations({
        "csp-report": {
          "document-uri": "https://s.example/v/TOKEN",
          "violated-directive": "script-src-elem",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?t=1",
          "script-sample": "alert(document.cookie)",
        },
      })
    ).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example", page: "/v/*" }]);
    expect(
      extractViolations([
        { type: "csp-violation", body: { documentURL: "https://s.example/", effectiveDirective: "img-src", blockedURL: "https://px.example/p?id=9" } },
      ])
    ).toEqual([{ directive: "img-src", blocked: "https://px.example", page: "/" }]);
    expect(extractViolations("x")).toEqual([]);
    expect(extractViolations(null)).toEqual([]);
  });
});

describe("SEC-05 — POST /api/csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    __resetCspReportDedupeForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  const post = (body: string, headers: Record<string, string> = {}) =>
    POST(
      new Request("http://localhost/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report", ...headers },
        body,
      })
    );
  const report = JSON.stringify({
    "csp-report": {
      "document-uri": "https://s.example/v/PRIVATE_TOKEN",
      "effective-directive": "img-src",
      "blocked-uri": "https://px.example/p?email=a@b.c",
      "script-sample": "SECRET_SAMPLE",
    },
  });

  it("204 döner ve yalnız maskelenmiş özeti loglar", async () => {
    const res = await post(report);
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('"directive":"img-src"');
    expect(line).toContain('"blocked":"https://px.example"');
    expect(line).toContain('"page":"/v/*"');
    for (const leak of ["PRIVATE_TOKEN", "email", "a@b.c", "SECRET_SAMPLE"]) {
      expect(line).not.toContain(leak);
    }
  });

  it("aynı ihlal tekrarında log tekrarlanmaz (dedupe)", async () => {
    await post(report);
    await post(report);
    await post(report);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("bozuk JSON / boş / çok büyük gövde → 204, log yok", async () => {
    expect((await post("{not json")).status).toBe(204);
    expect((await post("")).status).toBe(204);
    expect((await post("x".repeat(20 * 1024))).status).toBe(204);
    expect((await post("{}", { "content-length": String(1024 * 1024) })).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
