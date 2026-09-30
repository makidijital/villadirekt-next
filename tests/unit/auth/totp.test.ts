import { describe, it, expect, beforeAll } from "vitest";
import { OTP } from "otplib";

import {
  generateTotpSecret,
  buildTotpUri,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
} from "@/lib/auth/native/totp";

/* ===============================================================
   🛡️ TOTP 2FA — CORE (lib/auth/native/totp.ts) — unit tests
   ===============================================================
   `vitest.config.ts`'e eklenen `server-only` alias'ı sayesinde bu
   dosya doğrudan test edilebiliyor (totp.ts server-only kalmaya
   devam ediyor — production/build davranışı DEĞİŞMEDİ, yalnız test
   ortamında resolve ediliyor).

   Sabit bir test secret'ı + deterministik `epoch` parametresi
   kullanılır (gerçek saat/step sınırına bağlı flaky testlerden
   kaçınmak için) — `verifyTotpCode`'un opsiyonel 3. parametresi.
   =============================================================== */

const otp = new OTP({ strategy: "totp" });
const FIXED_EPOCH = 1_700_000_000; // sabit, step sınırından uzak bir an
const PERIOD = 30;

async function codeAt(secret: string, epoch: number): Promise<string> {
  return otp.generate({ secret, digits: 6, period: PERIOD, epoch });
}

beforeAll(() => {
  // encryptTotpSecret/decryptTotpSecret için zorunlu (server-only, lazy-read).
  process.env.TOTP_ENCRYPTION_SECRET =
    "test-only-totp-encryption-secret-32-chars-min-aaaa";
});

describe("generateTotpSecret", () => {
  it("boş olmayan bir base32 secret döner", () => {
    const s = generateTotpSecret();
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    expect(/^[A-Z2-7]+=*$/.test(s)).toBe(true);
  });

  it("her çağrıda farklı secret üretir (entropi sanity)", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });
});

describe("buildTotpUri", () => {
  it("otpauth://totp URI'sinde issuer + label + secret bulunur", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri({
      secret,
      accountEmail: "admin@maki.com",
      issuer: "Maki Admin",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain(encodeURIComponent("Maki Admin"));
    expect(uri).toContain(encodeURIComponent("admin@maki.com"));
    expect(uri).toContain(`secret=${secret}`);
  });

  it("issuer verilmezse default 'Maki Admin' kullanılır", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpUri({ secret, accountEmail: "x@y.com" });
    expect(uri).toContain(encodeURIComponent("Maki Admin"));
  });
});

describe("verifyTotpCode — geçerli/geçersiz kod", () => {
  it("doğru kod (tam o an) → true", async () => {
    const secret = generateTotpSecret();
    const code = await codeAt(secret, FIXED_EPOCH);
    await expect(verifyTotpCode(code, secret, FIXED_EPOCH)).resolves.toBe(true);
  });

  it("yanlış kod → false", async () => {
    const secret = generateTotpSecret();
    const real = await codeAt(secret, FIXED_EPOCH);
    // Gerçek koddan farklı garanti 6 haneli bir değer üret.
    const wrongNum = (Number(real) + 1) % 1_000_000;
    const wrong = String(wrongNum).padStart(6, "0");
    await expect(verifyTotpCode(wrong, secret, FIXED_EPOCH)).resolves.toBe(false);
  });

  it("format hatalı input (5 hane) → false, otplib hiç çağrılmaz", async () => {
    const secret = generateTotpSecret();
    await expect(verifyTotpCode("12345", secret, FIXED_EPOCH)).resolves.toBe(false);
  });

  it("format hatalı input (harf içeriyor) → false", async () => {
    const secret = generateTotpSecret();
    await expect(verifyTotpCode("12a456", secret, FIXED_EPOCH)).resolves.toBe(false);
  });

  it("boş input → false", async () => {
    const secret = generateTotpSecret();
    await expect(verifyTotpCode("", secret, FIXED_EPOCH)).resolves.toBe(false);
  });

  it("baştaki/sondaki boşluklar temizlenir (kullanıcı deneyimi)", async () => {
    const secret = generateTotpSecret();
    const code = await codeAt(secret, FIXED_EPOCH);
    await expect(
      verifyTotpCode(`  ${code}  `, secret, FIXED_EPOCH)
    ).resolves.toBe(true);
  });
});

describe("verifyTotpCode — ±1 zaman adımı penceresi (RFC 6238)", () => {
  it("bir önceki adımın kodu (t-30s) → true (saat sürüklenmesi toleransı)", async () => {
    const secret = generateTotpSecret();
    const prevCode = await codeAt(secret, FIXED_EPOCH - PERIOD);
    await expect(
      verifyTotpCode(prevCode, secret, FIXED_EPOCH)
    ).resolves.toBe(true);
  });

  it("bir sonraki adımın kodu (t+30s) → true", async () => {
    const secret = generateTotpSecret();
    const nextCode = await codeAt(secret, FIXED_EPOCH + PERIOD);
    await expect(
      verifyTotpCode(nextCode, secret, FIXED_EPOCH)
    ).resolves.toBe(true);
  });

  it("iki adım öncesinin kodu (t-60s) → false (pencere dışı)", async () => {
    const secret = generateTotpSecret();
    const oldCode = await codeAt(secret, FIXED_EPOCH - 2 * PERIOD);
    await expect(
      verifyTotpCode(oldCode, secret, FIXED_EPOCH)
    ).resolves.toBe(false);
  });

  it("iki adım sonrasının kodu (t+60s) → false (pencere dışı)", async () => {
    const secret = generateTotpSecret();
    const futureCode = await codeAt(secret, FIXED_EPOCH + 2 * PERIOD);
    await expect(
      verifyTotpCode(futureCode, secret, FIXED_EPOCH)
    ).resolves.toBe(false);
  });
});

describe("encryptTotpSecret / decryptTotpSecret — AES-256-GCM roundtrip", () => {
  it("encrypt → decrypt orijinal secret'ı verir", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });

  it("aynı secret iki kez şifrelenince farklı ciphertext üretir (rastgele IV)", () => {
    const secret = generateTotpSecret();
    const a = encryptTotpSecret(secret);
    const b = encryptTotpSecret(secret);
    expect(a).not.toBe(b);
    // ama ikisi de aynı plaintext'e çözülür
    expect(decryptTotpSecret(a)).toBe(secret);
    expect(decryptTotpSecret(b)).toBe(secret);
  });

  it("şifreli değer 3 nokta-ayrılı segment formatında", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted.split(".").length).toBe(3);
  });

  it("YANLIŞ TOTP_ENCRYPTION_SECRET ile decrypt BAŞARISIZ olur (throw)", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);

    const original = process.env.TOTP_ENCRYPTION_SECRET;
    process.env.TOTP_ENCRYPTION_SECRET =
      "farkli-bir-totp-encryption-secret-32-char-min-bbbb";
    try {
      expect(() => decryptTotpSecret(encrypted)).toThrow();
    } finally {
      process.env.TOTP_ENCRYPTION_SECRET = original;
    }
  });

  it("bozuk/geçersiz format → throw", () => {
    expect(() => decryptTotpSecret("not-a-valid-encrypted-value")).toThrow();
    expect(() => decryptTotpSecret("")).toThrow();
  });

  it("TOTP_ENCRYPTION_SECRET tanımsızsa encryptTotpSecret throw eder", () => {
    const original = process.env.TOTP_ENCRYPTION_SECRET;
    delete process.env.TOTP_ENCRYPTION_SECRET;
    try {
      expect(() => encryptTotpSecret("x")).toThrow();
    } finally {
      process.env.TOTP_ENCRYPTION_SECRET = original;
    }
  });
});

describe("generateRecoveryCodes", () => {
  it("default 10 benzersiz kod üretir", () => {
    const codes = generateRecoveryCodes();
    expect(codes.length).toBe(10);
    expect(new Set(codes).size).toBe(10);
  });

  it("istenen sayıda kod üretir (örn. 8)", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes.length).toBe(8);
  });

  it("format XXXXX-XXXXX (0/O ve 1/I belirsizliği yok)", () => {
    const codes = generateRecoveryCodes(20);
    for (const code of codes) {
      expect(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(code)).toBe(true);
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});
