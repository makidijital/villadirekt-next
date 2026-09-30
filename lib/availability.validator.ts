/* ===============================================================
   🛡️ FAZ 51B — AVAILABILITY VALIDATORS (PURE MODULE)
   ===============================================================
   Bu dosya, lib/availability.helper.ts içinden ÇIKARILDI ama
   davranış BYTE-IDENTICAL. Sebep:
     helper eski sağlayıcı client import ediyor → modül load anında
     env (storage base URL) zorunlu → test ortamında
     DB client init hatası.
   Pure validatorlar burada artık IO bağımsız; test ortamında
   env olmadan import edilebilir.

   ÜÇ EXPORT:
     • isValidYmd                     (format-only YYYY-MM-DD)
     • isValidRange                   (half-open [start, end) strict)
     • AVAILABILITY_BLOCKING_STATUSES (allow-list)

   BACKWARD-COMPATIBILITY:
     lib/availability.helper.ts bu sembolleri RE-EXPORT eder
     (`export * from "./availability.validator"`); böylece tüm
     mevcut consumer'lar (app/(public)/arama/page.tsx,
     /kiralik-villa/[slug], /v/[token]) import path'lerini
     hiç değiştirmeden çalışmaya devam eder.

   HALF-OPEN OVERLAP KURALI — BU MODÜLDE DEĞİL:
     Overlap test'i DB-level (reservation.service inline +
     getBlockedVillaIds) yapıldığı için yalnız helper.ts'te kaldı.
     Buradaki validatorlar pre-condition guard'larıdır.
=============================================================== */

/* ─────── Allow-list: hangi reservation status'ler block eder ─────── */
export const AVAILABILITY_BLOCKING_STATUSES = [
  "pending",
  "confirmed",
] as const;

/* ─────── YYYY-MM-DD format guard ─────── */
/**
 * Returns true if `s` is a valid YYYY-MM-DD string.
 * ISO-prefix DATE'leri kabul eder (lokal semantic); timezone
 * offset DEĞİL. Parse semantics: pure string-level.
 * Calendar validity doğrulanmaz — caller parseLocalDate ile
 * semantik kontrol yapar.
 */
export function isValidYmd(s: unknown): s is string {
  return (
    typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  );
}

/* ─────── Half-open [) range guard ─────── */
/**
 * Returns true if `start` and `end` form a valid half-open [) range.
 * Lexicographic comparison; YYYY-MM-DD ISO 8601 dates sort correctly
 * as strings — no Date object math, no timezone drift.
 * Same-day (0-night) range INVALID — checkout = checkin not allowed.
 */
export function isValidRange(start: unknown, end: unknown): boolean {
  return isValidYmd(start) && isValidYmd(end) && start < end;
}
