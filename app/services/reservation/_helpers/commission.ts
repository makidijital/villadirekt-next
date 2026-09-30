import { reservationRepository } from "@/lib/db/reservation.repository";

/* ===============================================================
   🛡️ FAZ 2 — COMMISSION HELPERS (FAZ 33 delege)
   ===============================================================
   Eski `reservation.service.ts` içinde inline tanımlı:
     - DEFAULT_COMMISSION_RATE (const)
     - safeCommissionRate (pure)
     - calcCommissionAmount (pure)
     - villa.commission_rate fetch bloğu (line 229-258)
   BYTE-IDENTICAL bu dosyaya alındı.

   FAZ 33 (READ extraction):
     `fetchCommissionRate` DB call'ı artık doğrudan eski sağlayıcı
     client'ı tüketmez; `reservationRepository.findVillaCommissionRate`
     üzerinden delege edilir. Davranış BYTE-IDENTICAL:
       - Aynı tablo (`villa`)
       - Aynı select (`commission_rate`)
       - Aynı predicate (`.eq("id", villaId)`)
       - Aynı resolver (`.maybeSingle()`)
     Fail-open semantic + console tag bu dosyada kalır
     (repository sessizdir).

   ⚠️ FAIL-OPEN PATTERN KORUNDU:
     Villa commission fetch fail → fallback rate ile devam.
     Console.error tag (`[reservation.commission.fetch] FAILED`)
     birebir aynen.

   FORMÜL (eski yorum):
     amount = total_price_try * (rate / 100)

   KURALLAR (eski yorum):
     - Kaynak: villa.commission_rate (DB seviyesinde mevcut kolon).
     - Fallback: rate null/invalid/range dışı (0..100) → 20.
     - Hesap her zaman total_price_try üzerinden — ASLA paid_amount,
       prepayment_amount veya original_price üzerinden değil.
     - total_price_try=0 → amount=0 (legitimate, manual admin entry).
=============================================================== */

/** Default komisyon oranı. Eski inline `DEFAULT_COMMISSION_RATE = 20`. */
export const DEFAULT_COMMISSION_RATE = 20;

/** Range guard 0-100; finite number → as-is, aksi → fallback (20). */
export function safeCommissionRate(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100) {
    return raw;
  }
  return DEFAULT_COMMISSION_RATE;
}

/** Pure: total_price_try × rate/100. Non-finite veya ≤0 → 0. */
export function calcCommissionAmount(
  totalPriceTry: unknown,
  rate: number
): number {
  const base = Number(totalPriceTry);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base * (rate / 100);
}

/* ---------------------------------------------------------------
   🔥 fetchCommissionRate — villa.commission_rate fetch (fail-open)
   ---------------------------------------------------------------
   Eski createReservation inline pattern'inin birebir kopyası.
   Yorum + log tag + dönen değer aynen.
   `createReservation` orchestrator'ı bu helper'ı çağırır + dönen
   `rate` değerini `calcCommissionAmount` ile birlikte kullanır.
=============================================================== */
export async function fetchCommissionRate(villaId: string): Promise<number> {
  const { data: villaCommissionRow, error: villaCommissionError } =
    await reservationRepository.findVillaCommissionRate(villaId);
  if (villaCommissionError) {
    /* Fail-open: rezervasyon akışı bozulmasın; fallback rate kullan.
       Production'da Sentry log'u (mevcut console.error pattern). */
    console.error(
      "[reservation.commission.fetch] FAILED",
      villaCommissionError.message
    );
  }
  return safeCommissionRate(villaCommissionRow?.commission_rate);
}
