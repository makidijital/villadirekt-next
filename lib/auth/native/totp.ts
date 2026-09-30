import "server-only";

import {
  randomBytes,
  randomInt,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";
import { OTP } from "otplib";

/* ===============================================================
   🛡️ TOTP 2FA — CORE (server-only)
   ===============================================================
   RFC 6238 uyumlu TOTP üretim/doğrulama + secret şifreleme +
   kurtarma kodu üretimi. Küçük, saf, test edilebilir fonksiyonlar —
   hiçbiri DB/cookie/route bilmez (o orkestrasyon login.service.ts /
   yeni 2fa route'larında).

   PARAMETRELER (Google Authenticator / Authy standart uyumlu):
     algorithm: sha1 (otplib default)
     digits:    6
     period:    30 saniye
     pencere:   ±1 zaman adımı (epochTolerance: 30sn simetrik →
                önceki/sonraki adım da kabul edilir; saat sürüklenmesi
                toleransı)

   SECRET ŞİFRELEME (AES-256-GCM):
     Anahtar = sha256(`TOTP_ENCRYPTION_SECRET`) — env değeri herhangi
     uzunlukta güvenli metin olabilir; sha256 sabit 32-byte anahtar
     türetir. IV her şifrelemede rastgele (12 byte, GCM standardı).
     Format: "<iv_b64>.<authTag_b64>.<ciphertext_b64>".

     ⚠️ `TOTP_ENCRYPTION_SECRET` — `AUTH_JWT_SECRET` İLE AYNI DEĞİL.
     Ayrı env, ayrı amaç (key separation prensibi — JWT imzalama ile
     TOTP secret şifreleme birbirinden bağımsız anahtar alanı).
     `NEXT_PUBLIC_` prefix'i YOK → client'a asla sızmaz.

   ⚠️ Bu modül `server-only` — TOTP secret'ı (encrypted/decrypted hali)
     ve şifreleme anahtarı hiçbir zaman client bundle'a taşınmaz.
   =============================================================== */

const totp = new OTP({ strategy: "totp" });

const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** ±1 zaman adımı tolerans (30sn simetrik → önceki/sonraki adım kabul). */
const WINDOW_TOLERANCE_SECONDS = PERIOD_SECONDS;

const RECOVERY_CODE_COUNT = 10;
/** Karışıklık yaratan karakterler çıkarıldı (0/O ve 1/I belirsizliği). */
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ---------------------------------------------------------------
   SECRET ÜRETİMİ
--------------------------------------------------------------- */
/** Yeni base32 TOTP secret üretir (160-bit / 20 byte entropi,
 *  otplib default). Yalnız enrollment/start akışında çağrılır. */
export function generateTotpSecret(): string {
  return totp.generateSecret();
}

/* ---------------------------------------------------------------
   OTPAUTH URI — QR + manuel-giriş fallback için
--------------------------------------------------------------- */
export function buildTotpUri(params: {
  secret: string;
  accountEmail: string;
  issuer?: string;
}): string {
  const issuer = (params.issuer || "Maki Admin").trim();
  return totp.generateURI({
    issuer,
    label: params.accountEmail,
    secret: params.secret,
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
}

/* ---------------------------------------------------------------
   KOD DOĞRULAMA — RFC 6238, ±1 zaman adımı penceresi
--------------------------------------------------------------- */
/** 6 haneli TOTP kodunu (çözülmüş) secret'a karşı doğrular. Format
 *  hatalı input (6 hane değil) → false (verify hiç çağrılmaz).
 *
 *  `epoch` — OPSİYONEL (yalnız test edilebilirlik için, unix saniye).
 *  Verilmezse otplib gerçek `Date.now()` kullanır (PRODUCTION DAVRANIŞI
 *  DEĞİŞMEDİ). Testler ±1 zaman-adımı penceresini flaky olmadan
 *  doğrulamak için sabit epoch'lar geçirir. */
export async function verifyTotpCode(
  code: string,
  secret: string,
  epoch?: number
): Promise<boolean> {
  const normalized = (code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    const result = await totp.verify({
      secret,
      token: normalized,
      digits: DIGITS,
      period: PERIOD_SECONDS,
      epochTolerance: WINDOW_TOLERANCE_SECONDS,
      ...(epoch !== undefined ? { epoch } : {}),
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------
   SECRET ŞİFRELEME — AES-256-GCM (TOTP_ENCRYPTION_SECRET, lazy)
--------------------------------------------------------------- */
function getEncryptionKey(): Buffer {
  const secret = process.env.TOTP_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "TOTP_ENCRYPTION_SECRET tanımlı değil veya <32 karakter — TOTP secret şifrelemesi için zorunlu (server-only)."
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** TOTP secret'ı DB'ye yazmadan önce şifreler. PLAINTEXT hiçbir zaman
 *  DB'ye yazılmaz. Format: "<iv_b64>.<authTag_b64>.<ciphertext_b64>". */
export function encryptTotpSecret(plainSecret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM standardı — 96 bit
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainSecret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

/** DB'den okunan şifreli TOTP secret'ını çözer. Yanlış anahtar/bozuk
 *  veri → GCM auth-tag doğrulaması FAIL → throw (sessizce yanlış
 *  secret döndürmez — caller try/catch ile "geçersiz" olarak ele alır). */
export function decryptTotpSecret(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = (encrypted || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Geçersiz TOTP secret formatı");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/* ---------------------------------------------------------------
   KURTARMA KODLARI — tek kullanımlık, plaintext yalnız üretim anında
--------------------------------------------------------------- */
function randomRecoveryCode(): string {
  let out = "";
  for (let i = 0; i < 10; i++) {
    // crypto.randomInt — rejection-sampling ile unbiased (Node builtin).
    out += RECOVERY_CODE_ALPHABET[randomInt(0, RECOVERY_CODE_ALPHABET.length)];
  }
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

/** N adet benzersiz kurtarma kodu üretir (default 10). Kodlar yalnız
 *  bu dönüş değerinde PLAINTEXT var — caller (enroll/confirm route)
 *  bunları Argon2id ile hash'leyip DB'ye yazar; plaintext yalnız
 *  enrollment response'unda bir kerelik client'a döner, DB'ye ASLA
 *  yazılmaz. */
export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT
): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(randomRecoveryCode());
  }
  return Array.from(codes);
}
