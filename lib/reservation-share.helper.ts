import "server-only";

import { randomBytes, createHash } from "crypto";

/* ===============================================================
   🛡️ RESERVATION SHARE — token üretimi + hash (server-only)
   ===============================================================
   `lib/auth/native/refresh-token.ts` deseniyle BİREBİR: yüksek-entropi
   opaque token (URL'de) + SHA-256 hash (DB'de). Node `crypto`
   standart primitifleri (algoritma elle yazımı YOK). `server-only`
   ile client bundle'a sızması build-time engellenir.

   AKIŞ:
     - createReservationShareLink: generateShareToken() → raw URL'e,
       hashShareToken() → DB'ye (token_hash).
     - resolve: URL'deki raw token → hashShareToken() → RPC token_hash
       lookup. Raw token DB'de HİÇ tutulmaz.
   =============================================================== */

/** Yüksek-entropi opaque paylaşım token'ı (yalnız URL'de). */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** DB'de saklanacak hash (token yüksek-entropili → SHA-256 yeterli). */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 🛡️ EXPIRATION — rezervasyon `end_date + 3 gün`. Uydurma sabit süre
 *  YOK; süre rezervasyonun kendi verisinden türer (müşteri giriş/çıkışa
 *  kadar linki açabilir, sonra doğal olarak kapanır). UTC-safe.
 *  end_date geçersizse null döner (caller link üretmez). */
export function shareExpiresAtFromEndDate(
  endDate: string | null | undefined
): string | null {
  if (!endDate || typeof endDate !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(endDate.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + 3); // +3 gün tampon
  return dt.toISOString();
}

/** Public paylaşım URL'i — mevcut `/rezervasyon-kontrol?token=` (yeni
 *  route YOK). Base, NEXT_PUBLIC_SITE_URL'den; yoksa relative path. */
export function buildReservationShareUrl(rawToken: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const path = `/rezervasyon-kontrol?token=${encodeURIComponent(rawToken)}`;
  return base ? `${base}${path}` : path;
}
