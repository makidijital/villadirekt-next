import { describe, it, expect, vi, beforeEach } from "vitest";

/* ===============================================================
   🛡️ M-1 SECURITY FIX — disable / recovery-codes/regenerate rate-limit
   ===============================================================
   Kanıtlar:
     D) "disable/recovery regenerate re-auth brute force → rate
        limited" — applyRateLimit() 429 dönerse route, authorization'a
        (authorizeAdminSession) HİÇ ULAŞMADAN erken-return yapıyor.
     - Rate-limit LIMITLENMEMİŞ durumda (null) mevcut akış (authz +
       re-auth) DEĞİŞMEDEN çalışmaya devam ediyor.
     - Doğru rate-limit GRUBU ("totp-disable" / "totp-recovery-
       regenerate") kullanılıyor — ayrı bucket, "totp" (login-2fa-verify)
       ile paylaşılmıyor.

   Yalnız gerçek I/O sınırı mock'lanır (`@/lib/rate-limit`,
   `@/lib/admin-route-auth`) — route'un kendi orkestrasyon mantığı
   gerçek çalışır.
   =============================================================== */

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: vi.fn(),
}));

import { applyRateLimit } from "@/lib/rate-limit";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

function fakeReq(): Request {
  return new Request("http://localhost/api/admin/2fa/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "irrelevant" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("🛡️ M-1 — /api/admin/2fa/disable rate-limit", () => {
  it("D) applyRateLimit 429 dönerse → route erken-return yapar, authorizeAdminSession HİÇ ÇAĞRILMAZ", async () => {
    const limitedResponse = new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429 }
    );
    vi.mocked(applyRateLimit).mockResolvedValue(limitedResponse);

    const { POST } = await import("@/app/api/admin/2fa/disable/route");
    const res = await POST(fakeReq());

    expect(res.status).toBe(429);
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "totp-disable"
    );
    expect(authorizeAdminSession).not.toHaveBeenCalled();
  });

  it("limitlenmemiş (null) → mevcut authorizeAdminSession akışı DEĞİŞMEDEN çalışır", async () => {
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(authorizeAdminSession).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    } as never);

    const { POST } = await import("@/app/api/admin/2fa/disable/route");
    const res = await POST(fakeReq());
    const json = await res.json();

    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "totp-disable"
    );
    expect(authorizeAdminSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
    expect(json.error).toBe("Oturum bulunamadı");
  });
});

describe("🛡️ M-1 — /api/admin/2fa/recovery-codes/regenerate rate-limit", () => {
  it("D) applyRateLimit 429 dönerse → route erken-return yapar, authorizeAdminSession HİÇ ÇAĞRILMAZ", async () => {
    const limitedResponse = new Response(
      JSON.stringify({ error: "Too many requests" }),
      { status: 429 }
    );
    vi.mocked(applyRateLimit).mockResolvedValue(limitedResponse);

    const { POST } = await import(
      "@/app/api/admin/2fa/recovery-codes/regenerate/route"
    );
    const res = await POST(fakeReq());

    expect(res.status).toBe(429);
    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "totp-recovery-regenerate"
    );
    expect(authorizeAdminSession).not.toHaveBeenCalled();
  });

  it("limitlenmemiş (null) → mevcut authorizeAdminSession akışı DEĞİŞMEDEN çalışır", async () => {
    vi.mocked(applyRateLimit).mockResolvedValue(null);
    vi.mocked(authorizeAdminSession).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    } as never);

    const { POST } = await import(
      "@/app/api/admin/2fa/recovery-codes/regenerate/route"
    );
    const res = await POST(fakeReq());
    const json = await res.json();

    expect(applyRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "totp-recovery-regenerate"
    );
    expect(authorizeAdminSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
    expect(json.error).toBe("Oturum bulunamadı");
  });
});
