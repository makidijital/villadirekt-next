import { normalizePaymentPreference } from "@/lib/payment.helper";
import { accommodationBase } from "@/lib/price.engine";

import type { PriceDetailSnapshot } from "../_types/reservation-form-data";

/* ===============================================================
   🛡️ MANUEL "ŞİMDİ ÖDENECEK TUTAR" (prepayment_amount)
   ===============================================================
   Admin Tahsilat kartındaki "Şimdi Ödenecek Tutar (TRY)" inputu
   MEVCUT `prepayment_amount` kolonunu düzenler. Yeni kolon/migration
   YOK; `paid_amount` bu akışa HİÇ girmez.

   Kilit (client-only `prepayment_manual_amount`, DB'ye YAZILMAZ —
   payload builder'lar alanları tek tek seçer):
     • Yüklemede: ödeme tercihi "prepayment" ise DB'deki
       prepayment_amount kilitlenir (manuel tutar sayfa yenilense /
       not kaydedilse bile korunur).
     • Input değişince: yeni değer kilitlenir.
     • "Otomatik Ön Ödemeyi Doldur": kilit kalkar (otomatik hesap).
     • Tarih/villa/özel fiyat recalc'ı prepayment_amount'ı yeni
       otomatik değere çeker → kilitle eşleşmez → otomatik hesap
       (mevcut davranış AYNEN).
   Kilit yoksa / geçersizse builder'ın mevcut otomatik hesabı
   BYTE-IDENTICAL çalışır.
=============================================================== */

type ManualPrepaymentSource = {
  payment_preference?: unknown;
  prepayment_amount?: number | string | null;
  prepayment_manual_amount?: number | null;
};

/** Yüklenen rezervasyona (yalnız "prepayment" tercihinde) kilidi ekler. */
export function withLoadedPrepaymentLock<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const r = row as ManualPrepaymentSource;
  if (normalizePaymentPreference(r.payment_preference) !== "prepayment") {
    return row;
  }
  if (r.prepayment_amount === null || r.prepayment_amount === undefined) {
    return row;
  }
  const n = Number(r.prepayment_amount);
  if (!Number.isFinite(n)) return row;
  return { ...row, prepayment_manual_amount: n };
}

/**
 * Builder'larda kullanılır: geçerli manuel tutar varsa onu, yoksa null
 * döner (null → builder'ın mevcut otomatik hesabı).
 * Geçerli: tercih "prepayment", kilit mevcut, state değeri kilitle aynı,
 * 0 < tutar ≤ toplam.
 */
export function resolveManualPrepayment(
  data: ManualPrepaymentSource,
  totalTRY: number
): number | null {
  if (normalizePaymentPreference(data.payment_preference) !== "prepayment") {
    return null;
  }
  const lock = data.prepayment_manual_amount;
  if (lock === null || lock === undefined) return null;
  const value = Number(data.prepayment_amount);
  if (!Number.isFinite(value) || value !== Number(lock)) return null;
  if (value <= 0 || value > totalTRY) return null;
  return value;
}

/**
 * "Otomatik Ön Ödemeyi Doldur" değeri — builder'ların kilit YOKKEN
 * yazdığı otomatik ön ödeme ile aynı formül:
 *   custom price → round(total × oran / 100)
 *   normal       → round(accommodationBase(total, temizlik, havuz) × oran / 100)
 */
export function computeAutoPrepayment(input: {
  data: {
    custom_price?: boolean | null;
    total_price_try?: number | string | null;
    total_price?: number | string | null;
    cleaning_fee_try?: number | string | null;
    pool_heating_total_try?: number | string | null;
  };
  priceDetail: PriceDetailSnapshot | null;
  prepaymentRate: number;
}): number {
  const { data, priceDetail, prepaymentRate } = input;
  const totalTRY =
    Number(data.total_price_try) || Number(data.total_price) || 0;
  if (data.custom_price) {
    return Math.round((totalTRY * prepaymentRate) / 100);
  }
  const cleaningTRY =
    Number(data.cleaning_fee_try) || Number(priceDetail?.cleaning) || 0;
  const poolHeatingTRY = Number(data.pool_heating_total_try) || 0;
  return Math.round(
    (accommodationBase(totalTRY, cleaningTRY, poolHeatingTRY) *
      prepaymentRate) /
      100
  );
}
