import { calculateNights } from "@/lib/price.engine";
import { formatLocalDate, parseLocalDate } from "@/lib/date-format";

/* ===============================================================
   🛡️ SEC-06 — PUBLIC REZERVASYON TARİH DOĞRULAMASI (SAF / PURE)
   ===============================================================
   Yalnız `POST /api/public/reservations` kullanır (admin akışı ve
   `createReservation` DEĞİŞMEDİ).

   NEDEN: Fiyat motoru (`parseLocalDate`) yalnız "YYYY-MM-DD" anlar;
   "2027/09/27", "20270918", "2027-09-23 00:00" gibi değerler motorda
   Invalid Date → 0 gece → 0 TL üretirken Postgres aynı değeri geçerli
   bir tarih olarak kaydediyordu (F1). Motor DEĞİŞTİRİLMEDİ; bunun
   yerine tarih, motora girmeden ÖNCE sıkı biçimde doğrulanır.

   KURALLAR:
     - Tarih yoksa → "Tarih zorunlu" (createReservation ile AYNI mesaj).
     - Tam olarak "YYYY-MM-DD" ve gerçek bir takvim günü olmalı
       (2027-02-30 gibi taşan günler RED). Otomatik parse/normalize
       YAPILMAZ; boşluk, saat, "T", "/" vb. hepsi reddedilir.
     - En az 1 gece (çıkış > giriş) → aksi halde "Tarih aralığı hatalı"
       (createReservation ile AYNI mesaj).
     - Konaklamanın TAMAMI geçmişteyse (çıkış günü, UTC bugünden 1 gün
       tolerans ile daha önceyse) RED. Mevcut public akışların hiçbiri
       böyle bir aralık üretmez (takvim geçmişi kapatır; indirim ve kısa
       boşluk listeleri yalnız bitişi bugün/ileride olan kayıtları
       gösterir). Giriş günü geçmişte olan ama çıkışı gelecekte olan
       aralıklara BİLEREK dokunulmaz (devam eden indirim CTA'sı böyle
       link üretebiliyor — raporda ayrıca işaretlendi).
   =============================================================== */

export const RESERVATION_DATE_ERRORS = {
  required: "Tarih zorunlu",
  invalidFormat: "Geçersiz tarih formatı. Tarihler YYYY-AA-GG biçiminde olmalı",
  invalidRange: "Tarih aralığı hatalı",
  past: "Geçmiş tarihler için rezervasyon yapılamaz",
} as const;

const STRICT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Tam olarak "YYYY-MM-DD" ve takvimde var olan bir gün mü? */
export function isStrictIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !STRICT_DATE_RE.test(value)) return false;
  const d = parseLocalDate(value);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: "2027-02-30" → 2 Mart'a taşar → eşleşmez → RED.
  return formatLocalDate(d) === value;
}

/** UTC takvim gününden `days` gün önceki "YYYY-MM-DD". */
function utcDayKey(now: Date, days: number): string {
  const t = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - days
  );
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Public rezervasyon tarihlerini doğrular.
 * @returns hata mesajı (reddet) veya null (geçerli).
 */
export function validatePublicReservationDates(
  start: unknown,
  end: unknown,
  now: Date = new Date()
): string | null {
  if (!start || !end) return RESERVATION_DATE_ERRORS.required;

  if (!isStrictIsoDate(start) || !isStrictIsoDate(end)) {
    return RESERVATION_DATE_ERRORS.invalidFormat;
  }

  const nights = calculateNights(start, end);
  if (!Number.isFinite(nights) || nights < 1) {
    return RESERVATION_DATE_ERRORS.invalidRange;
  }

  // "YYYY-MM-DD" karşılaştırması sözlük sırasıyla güvenli.
  if (end < utcDayKey(now, 1)) {
    return RESERVATION_DATE_ERRORS.past;
  }

  return null;
}
