import "server-only";

import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { compare as bcryptCompare } from "bcryptjs";

/* ===============================================================
   🛡️ NATIVE AUTH — PASSWORD HASH/VERIFY (Argon2id + legacy bcrypt)
   ===============================================================
   AMAÇ:
     Şifre hash'leme/doğrulama — production-grade, kalıcı stack.

   TEKNOLOJİ (kalıcı):
     • Yeni hash'ler → **Argon2id** (`@node-rs/argon2`, OWASP #1; prebuilt
       binary → native derleme derdi yok). Kripto elle YAZILMAZ.
     • Legacy doğrulama → **bcryptjs** (eski auth sağlayıcısı `$2a$/$2b$/$2y$`
       hash'lerini reset ETTİRMEDEN doğrular).

   ALGORİTMA ÇEVİKLİĞİ (self-describing prefix):
     $argon2id$ → native (bu modül, yeni hash'ler)
     $2a$/$2b$/$2y$ → bcrypt (legacy) → başarılı girişte Argon2id'e re-hash
     (`needsRehash:true`) → upgrade-on-login, sıfır kesinti.

   ⚠️ HENÜZ WIRE EDİLMEDİ — login değişmedi. Altyapı hazır bekliyor.
   =============================================================== */

/* Argon2id parametreleri (OWASP minimum): m=19456 KiB (19 MiB),
   t=2, p=1. Gerekirse env ile artırılabilir; hash string'i parametreleri
   kendi içinde taşıdığından doğrulama parametreye bağlı değildir. */
/* NOT: `algorithm` opsiyonu belirtilmez → @node-rs/argon2 varsayılanı
   zaten Argon2id'dir (paket index.d.ts: Argon2id = "Default value, this is
   the default algorithm for normative recommendations"). `Algorithm` bir
   `const enum` olduğundan `isolatedModules` ile üyesine erişilemez; varsayılan
   Argon2id kullanıldığından üretilen hash `$argon2id$...` olur (verify prefix'i
   `$argon2` ile uyumlu). */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export type VerifyPasswordResult = {
  ok: boolean;
  /** Başarılı ama hash eski algoritma (bcrypt) → caller Argon2id'e re-hash etmeli. */
  needsRehash: boolean;
  /** Hash biçimi tanınmadı (ne argon2 ne bcrypt). */
  unsupported?: boolean;
};

/* ---------------------------------------------------------------
   HASH — yeni şifreler için Argon2id
--------------------------------------------------------------- */
export async function hashPassword(password: string): Promise<string> {
  return await argon2Hash(password, ARGON2_OPTIONS);
}

/* ---------------------------------------------------------------
   VERIFY — prefix'e göre dispatch
--------------------------------------------------------------- */
export async function verifyPassword(
  storedHash: string,
  password: string
): Promise<VerifyPasswordResult> {
  const hash = (storedHash || "").trim();

  // Native (güncel) — Argon2id.
  if (hash.startsWith("$argon2")) {
    let ok = false;
    try {
      ok = await argon2Verify(hash, password);
    } catch {
      ok = false;
    }
    return { ok, needsRehash: false };
  }

  // Legacy — eski auth sağlayıcısı bcrypt. Başarılı ise upgrade-on-login için
  // needsRehash=true (caller Argon2id'e yeniden yazar).
  if (
    hash.startsWith("$2a$") ||
    hash.startsWith("$2b$") ||
    hash.startsWith("$2y$")
  ) {
    let ok = false;
    try {
      ok = await bcryptCompare(password, hash);
    } catch {
      ok = false;
    }
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false, unsupported: true };
}

/** Bir hash native (güncel) algoritmada mı — değilse re-hash gerekir. */
export function needsRehash(storedHash: string): boolean {
  return !(storedHash || "").startsWith("$argon2");
}

/* ---------------------------------------------------------------
   TIMING-PARITY DUMMY (user enumeration side-channel önleme)
   ---------------------------------------------------------------
   Kullanıcı yok / pasif / password_hash yok durumlarında gerçek verify
   yapılmadığından yanıt "var olan kullanıcı"dan (Argon2 verify ~pahalı)
   çok daha hızlı döner → e-posta varlığı timing ile sızar. Bu fonksiyon
   AYNI parametrelerle (ARGON2_OPTIONS) bir Argon2 hesabı çalıştırıp sonucu
   ATAR. Argon2 `hash` maliyeti ≈ `verify` maliyetidir (ikisi de tek
   memory-hard pass, aynı m/t/p) → yanıt süresi eşitlenir. Hardcode edilmiş
   (malformed olursa erken-throw ile korumayı boşa çıkaracak) sabit hash
   yerine gerçek hash fonksiyonu kullanılır → garantili geçerli maliyet.
   Yan etki YOK (sonuç saklanmaz). */
export async function timingSafeDummyVerify(password: string): Promise<void> {
  try {
    await argon2Hash(password, ARGON2_OPTIONS);
  } catch {
    /* argon2 hatası login davranışını etkilemez (yalnız timing dolgusu). */
  }
}
