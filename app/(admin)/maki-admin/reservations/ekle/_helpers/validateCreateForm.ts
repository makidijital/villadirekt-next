import type { ReservationCreateData, PriceDetailSnapshot } from "../_types/reservation-create-data";

/* ===============================================================
   🛡️ FAZ 3 — validateCreateForm (PURE)
   ===============================================================
   Eski page.tsx `validateForm` inline body'sinin birebir kopyası;
   pure, deterministic, zero-side-effect.

   ⚠️ KESIN KURAL: validation kuralları BYTE-IDENTICAL korundu.
   Hiçbir kural eklenmedi, kaldırılmadı veya gevşetildi.

   ÇAĞRILDIĞI YERLER:
     - handleCreate (submit anında full validation)
     - validateStep (per-step subset — page.tsx içinde STEP_FIELDS
       ile filter uygulanır; helper aynı çıktıyı verir, page
       subset'i seçer)

   GİRDİLER:
     - data: ReservationCreateData (form state)
     - startDate: Date | null  (UI date state)
     - endDate:   Date | null  (UI date state)
     - priceDetail: PriceDetailSnapshot | null
       (calculateGrandTotal sonucu; totalCheck fallback için)

   ÇIKTI:
     - Record<string, string>  (alan adı → TR error mesajı)
     - Boş object → validation geçti

   FIELD LIST — STEP_FIELDS lockstep:
     name, phone, email          → STEP 1
     country, city               → STEP 2
     villa_id                    → STEP 3
     start_date, end_date        → STEP 4
     guests                      → STEP 5
     total_price_try             → STEP 6
     payment_method_id           → STEP 7
     payment_preference          → STEP 8
=============================================================== */

export type ValidateCreateFormInput = {
  data: ReservationCreateData;
  startDate: Date | null;
  endDate: Date | null;
  priceDetail: PriceDetailSnapshot | null;
};

export type ValidateCreateFormOutput = Record<string, string>;

export function validateCreateForm(
  input: ValidateCreateFormInput
): ValidateCreateFormOutput {
  const { data, startDate, endDate, priceDetail } = input;
  const e: Record<string, string> = {};

  /* trim helper — page.tsx içinde `(v: any) => (v ?? "").toString().trim()`
     olarak inline yazılıydı. Pure helper'a aldık; signature `unknown`
     çünkü data fields strict typed olsa bile null/undefined toleransı
     gerekiyor (defensive). */
  const trim = (v: unknown): string => (v ?? "").toString().trim();

  if (!data.villa_id) e.villa_id = "Villa zorunlu";

  if (!startDate) e.start_date = "Giriş tarihi zorunlu";
  if (!endDate) e.end_date = "Çıkış tarihi zorunlu";
  if (startDate && endDate && endDate <= startDate)
    e.end_date = "Çıkış tarihi giriş tarihinden sonra olmalı";

  if (!trim(data.name)) e.name = "Ad Soyad zorunlu";

  if (!trim(data.phone)) e.phone = "Telefon zorunlu";

  if (!trim(data.email)) e.email = "E-posta zorunlu";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(data.email)))
    e.email = "Geçerli e-posta gir";

  if (!trim(data.country)) e.country = "Ülke zorunlu";
  if (!trim(data.city)) e.city = "Şehir zorunlu";

  const guestsN = Number(data.guests) || 0;
  if (guestsN < 1) e.guests = "En az 1 misafir";

  if (!data.payment_method_id)
    e.payment_method_id = "Ödeme yöntemi seç";

  if (!data.payment_preference)
    e.payment_preference = "Ödeme tercihi seç";

  const totalCheck =
    Number(data.total_price_try) ||
    Number(priceDetail?.total) ||
    0;
  if (totalCheck <= 0)
    e.total_price_try = "Toplam tutar 0'dan büyük olmalı";

  return e;
}
