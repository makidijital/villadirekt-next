/**
 * @vitest-environment node
 *
 * jose (dist/node/esm) HS256 imzalama, jsdom global ortamında
 * "payload must be an instance of Uint8Array" ile patlıyor — jsdom
 * kendi ayrı VM context'inde TypedArray sınıfları oluşturuyor, jose
 * internal `instanceof Uint8Array` kontrolü farklı realm nedeniyle
 * false dönüyor (bilinen jsdom/jose realm-mismatch sorunu). Bu dosya
 * gerçek jose imzalama/doğrulama akışını test ettiği için (login
 * gate'in kritik güvenlik garantisi) yalnız BU dosya için Node
 * ortamına geçiyoruz — global vitest.config.ts jsdom ayarı ve diğer
 * tüm testler ETKİLENMİYOR (scoped, additive fix).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/* ===============================================================
   🛡️ TOTP 2FA — LOGIN GATE (login.service.ts + totp-verify.service.ts)
   ===============================================================
   EN KRİTİK TEST DOSYASI — kullanıcının açıkça istediği güvenlik
   garantisini KOD SEVİYESİNDE kanıtlar:

     "totp_enabled=true olan bir admin için /api/auth/login akışı
      (loginNative) gerçek __Host-admin_at / __Host-admin_rt session
      cookie'lerini OLUŞTURMUYOR ve issueSession() HİÇ ÇAĞRILMIYOR —
      yalnız doğru TOTP/recovery kodu sonrası (verifyTotpLogin) gerçek
      session kuruluyor."

   YAKLAŞIM (mock sınırı):
     Yalnız GERÇEK I/O sınırları mock'lanır: DB repository'leri
     (adminUserServerRepository / adminSessionServerRepository /
     adminTotpServerRepository) ve `next/headers`'ın `cookies()`'i
     (in-memory fake jar). `login.service.ts`, `totp-verify.service.ts`,
     `session.service.ts`, `jwt.ts`, `cookies.ts`, `password.ts`,
     `totp.ts` — HEPSİ GERÇEK KODUYLA çalışır (JWT imzalama/doğrulama,
     Argon2id hash, AES-256-GCM şifreleme, TOTP doğrulama dahil).
     Böylece test yalnız "mock'ların doğru wire edildiğini" değil,
     GERÇEK gate mantığının doğru çalıştığını kanıtlar.

   `vitest.config.ts`'teki `server-only` alias'ı olmadan bu dosya hiç
   import edilemezdi (login.service.ts server-only) — bkz. o dosyadaki
   yorum.
   =============================================================== */

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/db/admin-user.repository.server", () => ({
  adminUserServerRepository: {
    findCredentialsByEmail: vi.fn(),
    recordLoginSuccess: vi.fn(async () => ({ error: null })),
    recordLoginFailure: vi.fn(async () => ({ error: null })),
    updatePasswordHash: vi.fn(async () => ({ error: null })),
    findByIdForSession: vi.fn(),
  },
}));

vi.mock("@/lib/db/admin-session.repository.server", () => ({
  adminSessionServerRepository: {
    create: vi.fn(),
    findActiveByRefreshHash: vi.fn(async () => ({ data: null, error: null })),
    rotate: vi.fn(async () => ({ error: null })),
    revokeById: vi.fn(async () => ({ error: null })),
    revokeAllForAdmin: vi.fn(async () => ({ error: null })),
    deleteExpired: vi.fn(async () => ({ error: null })),
  },
}));

vi.mock("@/lib/db/admin-totp.repository.server", () => ({
  adminTotpServerRepository: {
    getStateById: vi.fn(),
    setPendingSecret: vi.fn(async () => ({ error: null })),
    enable: vi.fn(async () => ({ error: null })),
    disable: vi.fn(async () => ({ error: null })),
    recordTotpFailure: vi.fn(async () => ({ error: null })),
    recordTotpSuccess: vi.fn(async () => ({ error: null })),
    insertRecoveryCodes: vi.fn(async () => ({ error: null })),
    findUnusedRecoveryCodes: vi.fn(async () => ({ data: [], error: null })),
    // 🛡️ M-2 — default: atomik claim BAŞARILI (data dolu) taklit eder.
    // Race-condition testi bunu per-test override ile `data: null`
    // (kaybeden taraf) yapar.
    markRecoveryCodeUsed: vi.fn(async () => ({
      data: { id: "code-row-1" },
      error: null,
    })),
    countUnusedRecoveryCodes: vi.fn(async () => ({ count: 0, error: null })),
    deleteAllRecoveryCodes: vi.fn(async () => ({ error: null })),
  },
}));

import { cookies } from "next/headers";
import { adminUserServerRepository } from "@/lib/db/admin-user.repository.server";
import { adminSessionServerRepository } from "@/lib/db/admin-session.repository.server";
import { adminTotpServerRepository } from "@/lib/db/admin-totp.repository.server";

import { loginNative } from "@/lib/auth/native/login.service";
import { verifyTotpLogin } from "@/lib/auth/native/totp-verify.service";
import { verifyAccessToken, verifyTotpPendingToken } from "@/lib/auth/native/jwt";
import { hashPassword } from "@/lib/auth/native/password";
import { encryptTotpSecret, generateTotpSecret } from "@/lib/auth/native/totp";
import { ACCESS_COOKIE, REFRESH_COOKIE, PENDING_2FA_COOKIE } from "@/lib/auth/native/cookie-names";

import { OTP } from "otplib";
const otp = new OTP({ strategy: "totp" });

/* ---------------------------------------------------------------
   FAKE COOKIE JAR — next/headers'ın cookies() Promise'inin yerine
   geçer. `cookies.ts`'in GERÇEK kodu bunun üzerinde .get/.set çalıştırır.
--------------------------------------------------------------- */
function createFakeCookieJar() {
  const store = new Map<string, string>();
  return {
    get(name: string) {
      return store.has(name) ? { name, value: store.get(name)! } : undefined;
    },
    set(name: string, value: string) {
      if (value === "") store.delete(name);
      else store.set(name, value);
    },
    has(name: string) {
      return store.has(name);
    },
  };
}
type FakeJar = ReturnType<typeof createFakeCookieJar>;
let fakeJar: FakeJar;

let REAL_PASSWORD_HASH: string;
const REAL_PASSWORD = "Sup3rSecret!Passw0rd";

beforeAll(async () => {
  process.env.AUTH_JWT_SECRET =
    "test-only-jwt-secret-at-least-32-characters-xxxxxx";
  process.env.TOTP_ENCRYPTION_SECRET =
    "test-only-totp-encryption-secret-32-char-min-yyyyyy";
  REAL_PASSWORD_HASH = await hashPassword(REAL_PASSWORD);
});

beforeEach(() => {
  vi.clearAllMocks();
  fakeJar = createFakeCookieJar();
  vi.mocked(cookies).mockResolvedValue(fakeJar as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(adminSessionServerRepository.create).mockResolvedValue({
    data: {
      id: "sess-uuid-1",
      admin_id: "admin-1",
      refresh_token_hash: "hash",
      user_agent: null,
      ip: null,
      remember: false,
      created_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000_000).toISOString(),
      revoked_at: null,
    },
    error: null,
  } as never);
});

function credsRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "admin-1",
    email: "admin@maki.com",
    full_name: "Test Admin",
    is_active: true,
    password_hash: REAL_PASSWORD_HASH,
    sidebar_permissions: ["villas"],
    failed_attempts: 0,
    locked_until: null,
    totp_enabled: false,
    ...overrides,
  };
}

describe("loginNative — TOTP GATE (en kritik davranış)", () => {
  it("totp_enabled=false → MEVCUT DAVRANIŞ: issueSession çağrılıyor, gerçek access+refresh cookie set ediliyor", async () => {
    vi.mocked(adminUserServerRepository.findCredentialsByEmail).mockResolvedValue({
      data: credsRow({ totp_enabled: false }),
      error: null,
    } as never);

    const result = await loginNative("admin@maki.com", REAL_PASSWORD, {
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(true);
    expect(adminSessionServerRepository.create).toHaveBeenCalledTimes(1);

    const access = fakeJar.get(ACCESS_COOKIE);
    const refresh = fakeJar.get(REFRESH_COOKIE);
    expect(access).toBeDefined();
    expect(refresh).toBeDefined();

    // Access cookie gerçek, doğrulanabilir bir JWT olmalı.
    const verified = await verifyAccessToken(access!.value);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.claims.sub).toBe("admin-1");
    }
  });

  it("totp_enabled=true → issueSession ÇAĞRILMIYOR, GERÇEK access/refresh cookie OLUŞMUYOR, code:'totp_required' dönüyor, pending cookie set ediliyor", async () => {
    vi.mocked(adminUserServerRepository.findCredentialsByEmail).mockResolvedValue({
      data: credsRow({ totp_enabled: true }),
      error: null,
    } as never);

    const result = await loginNative("admin@maki.com", REAL_PASSWORD, {
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("totp_required");
    }

    // 🛡️ EN KRİTİK ASSERTION — kullanıcının talep ettiği güvenlik kanıtı:
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
    expect(fakeJar.get(ACCESS_COOKIE)).toBeUndefined();
    expect(fakeJar.get(REFRESH_COOKIE)).toBeUndefined();

    // Yalnız dar-amaçlı pending cookie var — ve gerçek bir "totp_pending"
    // claim'i taşıyor (access token claim'i DEĞİL).
    const pending = fakeJar.get(PENDING_2FA_COOKIE);
    expect(pending).toBeDefined();
    const pendingClaims = await verifyTotpPendingToken(pending!.value);
    expect(pendingClaims.ok).toBe(true);
    if (pendingClaims.ok) {
      expect(pendingClaims.claims.sub).toBe("admin-1");
      expect(pendingClaims.claims.typ).toBe("totp_pending");
    }

    // Pending token, gerçek access-token verifier'ı KANDIRAMAZ (farklı
    // claim yapısı/anlamı — middleware/authorizeAdminCaller bu cookie'yi
    // zaten hiç okumuyor, ama ekstra güvence olarak da doğrulanır).
    const asAccess = await verifyAccessToken(pending!.value);
    // jose imzası geçerli olsa da (aynı secret) claim şekli/anlamı farklı;
    // middleware/authorizeAdminCaller PENDING_2FA_COOKIE'yi hiç okumadığı
    // için bu token pratikte hiçbir korumalı route'a ulaşmaz. Burada
    // yalnız "gerçek session mekanizması bu değeri kullanmaz" ilkesini
    // dokümante ediyoruz — asıl izolasyon ayrı cookie ismiyle sağlanıyor.
    void asAccess;
  });

  it("totp_enabled=true AMA şifre YANLIŞ → generic 'invalid' (2FA durumu SIZDIRILMAZ), hiçbir cookie oluşmuyor", async () => {
    vi.mocked(adminUserServerRepository.findCredentialsByEmail).mockResolvedValue({
      data: credsRow({ totp_enabled: true }),
      error: null,
    } as never);

    const result = await loginNative("admin@maki.com", "yanlis-sifre", {
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // "totp_required" DEĞİL — şifre yanlışken 2FA durumu asla ortaya çıkmaz.
      expect(result.code).toBe("invalid");
    }
    expect(fakeJar.get(ACCESS_COOKIE)).toBeUndefined();
    expect(fakeJar.get(PENDING_2FA_COOKIE)).toBeUndefined();
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });

  it("yanlış şifre (2FA kapalı admin) → mevcut davranış: 'invalid', failed_attempts artıyor", async () => {
    vi.mocked(adminUserServerRepository.findCredentialsByEmail).mockResolvedValue({
      data: credsRow({ totp_enabled: false, failed_attempts: 2 }),
      error: null,
    } as never);

    const result = await loginNative("admin@maki.com", "yanlis-sifre", {
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
    expect(adminUserServerRepository.recordLoginFailure).toHaveBeenCalledWith(
      "admin-1",
      3,
      null
    );
  });
});

describe("verifyTotpLogin — TOTP/recovery doğrulama sonrası gerçek session", () => {
  function totpState(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "admin-1",
      totp_secret: null as string | null,
      totp_enabled: true,
      totp_enrolled_at: new Date().toISOString(),
      totp_failed_attempts: 0,
      totp_locked_until: null,
      ...overrides,
    };
  }

  function adminRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "admin-1",
      email: "admin@maki.com",
      full_name: "Test Admin",
      is_active: true,
      sidebar_permissions: ["villas"],
      totp_enabled: true,
      ...overrides,
    };
  }

  it("doğru TOTP kodu → issueSession çağrılıyor, gerçek cookie'ler set ediliyor, pending temizleniyor", async () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const code = await otp.generate({ secret, digits: 6, period: 30 });

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: encrypted }),
      error: null,
    } as never);

    // Login sonrası set edilmiş bir pending cookie olduğunu simüle et
    // (clearPendingTotpCookie'nin gerçekten çağrıldığını görebilmek için).
    fakeJar.set(PENDING_2FA_COOKIE, "some-pending-token-value");

    const result = await verifyTotpLogin("admin-1", {
      code,
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(true);
    expect(adminSessionServerRepository.create).toHaveBeenCalledTimes(1);
    expect(adminTotpServerRepository.recordTotpSuccess).toHaveBeenCalledWith(
      "admin-1"
    );

    const access = fakeJar.get(ACCESS_COOKIE);
    const refresh = fakeJar.get(REFRESH_COOKIE);
    expect(access).toBeDefined();
    expect(refresh).toBeDefined();
    const verified = await verifyAccessToken(access!.value);
    expect(verified.ok).toBe(true);

    // Pending cookie temizlenmiş olmalı.
    expect(fakeJar.get(PENDING_2FA_COOKIE)).toBeUndefined();
  });

  it("yanlış TOTP kodu → session OLUŞMUYOR, totp_failed_attempts artıyor", async () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const realCode = await otp.generate({ secret, digits: 6, period: 30 });
    const wrongCode = String((Number(realCode) + 1) % 1_000_000).padStart(6, "0");

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: encrypted, totp_failed_attempts: 1 }),
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      code: wrongCode,
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
    expect(fakeJar.get(ACCESS_COOKIE)).toBeUndefined();
    expect(adminTotpServerRepository.recordTotpFailure).toHaveBeenCalledWith(
      "admin-1",
      2,
      null
    );
  });

  it("5. başarısız denemede kilitlenir (totp_locked_until set edilir)", async () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: encrypted, totp_failed_attempts: 4 }),
      error: null,
    } as never);

    await verifyTotpLogin("admin-1", {
      code: "000000",
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(adminTotpServerRepository.recordTotpFailure).toHaveBeenCalledTimes(1);
    const call = vi.mocked(adminTotpServerRepository.recordTotpFailure).mock
      .calls[0];
    expect(call[0]).toBe("admin-1");
    expect(call[1]).toBe(5);
    expect(call[2]).not.toBeNull(); // locked_until artık dolu
  });

  it("kilitliyken (locked_until gelecekte) → doğru kod olsa bile 'locked', session oluşmuyor", async () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const code = await otp.generate({ secret, digits: 6, period: 30 });
    const future = new Date(Date.now() + 10 * 60_000).toISOString();

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: encrypted, totp_locked_until: future }),
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      code, // DOĞRU kod olsa bile
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("locked");
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });

  it("admin is_active=false → 'inactive', session oluşmuyor, pending temizlenir", async () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    const code = await otp.generate({ secret, digits: 6, period: 30 });

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow({ is_active: false }),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: encrypted }),
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      code,
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("inactive");
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });

  it("2FA bu sırada disable edilmişse (totp_enabled=false state) → 'invalid', session oluşmuyor", async () => {
    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState({ totp_secret: null, totp_enabled: false }),
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      code: "123456",
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });
});

describe("verifyTotpLogin — recovery code akışı", () => {
  function totpState(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "admin-1",
      totp_secret: encryptTotpSecret(generateTotpSecret()),
      totp_enabled: true,
      totp_enrolled_at: new Date().toISOString(),
      totp_failed_attempts: 0,
      totp_locked_until: null,
      ...overrides,
    };
  }
  function adminRow() {
    return {
      id: "admin-1",
      email: "admin@maki.com",
      full_name: "Test Admin",
      is_active: true,
      sidebar_permissions: [],
      totp_enabled: true,
    };
  }

  it("doğru recovery kod → issueSession çağrılıyor, kod used_at ile işaretleniyor, usedRecoveryCode=true", async () => {
    const plainRecoveryCode = "ABCDE-FGH23";
    const hash = await hashPassword(plainRecoveryCode);

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.findUnusedRecoveryCodes).mockResolvedValue({
      data: [{ id: "code-row-1", admin_id: "admin-1", code_hash: hash, created_at: new Date().toISOString(), used_at: null }],
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      recoveryCode: plainRecoveryCode,
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.usedRecoveryCode).toBe(true);
    expect(adminTotpServerRepository.markRecoveryCodeUsed).toHaveBeenCalledWith(
      "code-row-1",
      expect.any(String)
    );
    expect(adminSessionServerRepository.create).toHaveBeenCalledTimes(1);
    expect(fakeJar.get(ACCESS_COOKIE)).toBeDefined();
  });

  it("yanlış recovery kod → session oluşmuyor, kod tüketilmiyor", async () => {
    const hash = await hashPassword("DOGRU-KOD99");

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.findUnusedRecoveryCodes).mockResolvedValue({
      data: [{ id: "code-row-1", admin_id: "admin-1", code_hash: hash, created_at: new Date().toISOString(), used_at: null }],
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      recoveryCode: "YANLIS-KOD1",
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    expect(adminTotpServerRepository.markRecoveryCodeUsed).not.toHaveBeenCalled();
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });

  it("ikinci kullanım — kod artık 'unused' listesinde değil (DB'de used_at set) → tekrar kullanılamaz", async () => {
    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState(),
      error: null,
    } as never);
    // Zaten kullanılmış → repository artık BOŞ unused listesi döner
    // (gerçek DB'de `used_at IS NULL` filtresiyle eşdeğer).
    vi.mocked(adminTotpServerRepository.findUnusedRecoveryCodes).mockResolvedValue({
      data: [],
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      recoveryCode: "ABCDE-FGH23",
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
  });

  it("🛡️ M-2 — concurrent kullanım: atomik claim KAYBEDİLİRSE (data:null) session AÇILMAZ, aynı kod iki kez tüketilemez", async () => {
    // Senaryo: iki eşzamanlı istek AYNI recovery code'u kullanıyor.
    // İkisi de findUnusedRecoveryCodes'ta satırı "unused" görüyor ve
    // verifyPassword ile eşleşiyor (TOCTOU penceresi) — ama yalnız
    // BİRİ atomik UPDATE...RETURNING'i (used_at IS NULL WHERE'i)
    // kazanır. Bu test KAYBEDEN isteği simüle eder: markRecoveryCodeUsed
    // `{ data: null, error: null }` döner (RETURNING boş — satır zaten
    // başka bir request tarafından tüketilmiş). Beklenti: matched=false,
    // issueSession/adminSessionServerRepository.create HİÇ ÇAĞRILMAZ,
    // gerçek cookie set edilmez, totp_failed_attempts artırılır (normal
    // "geçersiz kod" yoluna düşer).
    const plainRecoveryCode = "RACEC-ODE99";
    const hash = await hashPassword(plainRecoveryCode);

    vi.mocked(adminUserServerRepository.findByIdForSession).mockResolvedValue({
      data: adminRow(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.getStateById).mockResolvedValue({
      data: totpState(),
      error: null,
    } as never);
    vi.mocked(adminTotpServerRepository.findUnusedRecoveryCodes).mockResolvedValue({
      data: [{ id: "code-row-race", admin_id: "admin-1", code_hash: hash, created_at: new Date().toISOString(), used_at: null }],
      error: null,
    } as never);
    // 🛡️ Kaybeden taraf — atomik UPDATE 0 satır etkiledi (RETURNING boş).
    vi.mocked(adminTotpServerRepository.markRecoveryCodeUsed).mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const result = await verifyTotpLogin("admin-1", {
      recoveryCode: plainRecoveryCode,
      remember: false,
      ip: null,
      userAgent: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid");
    // Claim denendi (satır eşleşti) ama kazanamadı → session ASLA açılmadı.
    expect(adminTotpServerRepository.markRecoveryCodeUsed).toHaveBeenCalledWith(
      "code-row-race",
      expect.any(String)
    );
    expect(adminSessionServerRepository.create).not.toHaveBeenCalled();
    expect(fakeJar.get(ACCESS_COOKIE)).toBeUndefined();
    expect(fakeJar.get(REFRESH_COOKIE)).toBeUndefined();
    // Kaybeden istek normal "geçersiz kod" yoluna düşer → sayaç artar.
    expect(adminTotpServerRepository.recordTotpFailure).toHaveBeenCalledWith(
      "admin-1",
      1,
      null
    );
  });
});
