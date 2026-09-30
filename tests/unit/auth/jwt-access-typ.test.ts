/**
 * @vitest-environment node
 *
 * jose (dist/node/esm) HS256 imzalama, jsdom global ortamında
 * "payload must be an instance of Uint8Array" ile patlıyor (jsdom'un
 * ayrı VM context'i, jose'nin internal `instanceof Uint8Array`
 * kontrolünü farklı realm nedeniyle false döndürüyor — bkz.
 * login-totp-gate.test.ts'teki aynı fix). Bu dosya gerçek jose
 * sign/verify akışını test ettiğinden Node ortamına geçiyoruz —
 * yalnız BU dosya, global vitest.config.ts jsdom ayarı etkilenmiyor.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";

/* ===============================================================
   🛡️ H-1 SECURITY FIX — verifyAccessToken() `typ` claim enforcement
   ===============================================================
   Bu dosya doğrudan H-1 audit bulgusunu kanıtlar/regresyona karşı
   kilitler:
     "verifyAccessToken() yalnızca payload.typ === 'access' olan
      tokenları kabul etmeli. typ: 'totp_pending' / başka herhangi
      bir değer / undefined olan tokenlar kesinlikle başarısız
      dönmeli."

   Gerçek `signAccessToken`/`signTotpPendingToken`/`verifyAccessToken`
   kullanılır — mock YOK (bu saf, DB'siz, server-only olmayan bir
   modül; gerçek jose imzalama/doğrulama davranışını kanıtlamak
   için mock anlamsız olurdu).
   =============================================================== */

beforeAll(() => {
  process.env.AUTH_JWT_SECRET =
    "test-only-jwt-secret-at-least-32-characters-zzzzzz";
});

describe("verifyAccessToken — H-1 typ enforcement", () => {
  it("A) verifyAccessToken(signTotpPendingToken(...)) → FAIL (pending token access olarak KABUL EDİLMEZ)", async () => {
    const { signTotpPendingToken } = await import("@/lib/auth/native/jwt");
    const { verifyAccessToken } = await import("@/lib/auth/native/jwt");

    const pendingToken = await signTotpPendingToken("admin-uuid-1");
    const result = await verifyAccessToken(pendingToken);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("B) verifyAccessToken(signAccessToken(...)) → PASS (normal access token, claim'ler korunuyor)", async () => {
    const { signAccessToken, verifyAccessToken } = await import(
      "@/lib/auth/native/jwt"
    );

    const token = await signAccessToken({
      sub: "admin-uuid-2",
      email: "admin@maki.com",
      sid: "session-uuid-1",
      perms: ["villas.read", "reservations.write"],
      typ: "access",
    });
    const result = await verifyAccessToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("admin-uuid-2");
      expect(result.claims.email).toBe("admin@maki.com");
      expect(result.claims.sid).toBe("session-uuid-1");
      expect(result.claims.perms).toEqual([
        "villas.read",
        "reservations.write",
      ]);
      expect(result.claims.typ).toBe("access");
    }
  });

  it("typ tamamen EKSİK (undefined) → FAIL", async () => {
    const { verifyAccessToken } = await import("@/lib/auth/native/jwt");
    const key = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);

    // typ claim'i olmayan, ama aynı secret ile imzalı, geçerli bir JWT.
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: "admin-uuid-3" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-uuid-3")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(key);

    const result = await verifyAccessToken(token);
    expect(result.ok).toBe(false);
  });

  it("typ BAŞKA bir değer (\"refresh\" gibi uydurma) → FAIL", async () => {
    const { verifyAccessToken } = await import("@/lib/auth/native/jwt");
    const key = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);

    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: "admin-uuid-4",
      email: "x@x.com",
      sid: "sid-x",
      perms: [],
      typ: "refresh",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("admin-uuid-4")
      .setIssuedAt(now)
      .setExpirationTime(now + 900)
      .sign(key);

    const result = await verifyAccessToken(token);
    expect(result.ok).toBe(false);
  });

  it("regresyon — verifyTotpPendingToken hâlâ kendi pending token'ını doğru kabul ediyor (H-1 pending akışını bozmadı)", async () => {
    const { signTotpPendingToken, verifyTotpPendingToken } = await import(
      "@/lib/auth/native/jwt"
    );

    const pendingToken = await signTotpPendingToken("admin-uuid-5");
    const result = await verifyTotpPendingToken(pendingToken);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("admin-uuid-5");
      expect(result.claims.typ).toBe("totp_pending");
    }
  });
});
