import "server-only";

import { reservationShareRepository } from "@/lib/db/reservation-share.repository.server";
import { hashShareToken } from "@/lib/reservation-share.helper";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { getPaymentDisplayValues } from "@/lib/payment.helper";

/* 🛡️ ÖDEME YÖNTEMİ ETİKETİ — MEVCUT generic çeviri altyapısı REUSE.
   TR: canonical `payment_methods.name`. EN/DE: admin'in
   `/maki-admin/payment-methods` ekranından girdiği
   `payment_method_translations` değeri; yoksa/boşsa `resolveTaxonomyName`
   ile TR canonical'a düşer. Sabit EN/DE metin ÜRETİLMEZ.
   ⚠️ `payment_methods.type` yalnız iş mantığında kalır
   (`paymentMethodType` / `isWesternUnionMethod` DEĞİŞMEDİ). */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getPaymentMethodNamesByLocale } from "@/lib/i18n/get-payment-method-translations.server";
import { resolveTaxonomyName } from "@/lib/i18n/taxonomy-name.helper";

/* 🛡️ Site geneli standart giriş/çıkış saatleri — CheckInOutTimes.tsx ile
   AYNI değerler (projede villa/ayar bazlı saat kaynağı YOK; tek standart). */
const CHECK_IN_TIME = "16:00";
const CHECK_OUT_TIME = "10:00";

/* ===============================================================
   🛡️ RESERVATION SHARE — TOKEN RESOLVE (server-only)
   ===============================================================
   `/rezervasyon-kontrol?token=...` server component'i çağırır. Akış:
     raw token → sha256 hash → resolve RPC (revoked/expired filtre) →
     reservation_id → güvenli reservation read → SANITIZED DTO.
   Client'a ASLA ham row / PII / token gitmez.

   ÖDEME (KAFADAN HESAP YOK): tutarlar rezervasyonun kayıtlı TRY
   snapshot'ından okunur (total_price_try / paid_amount / remaining_
   payment / prepayment_amount — hepsi TRY; buildPublicReservationPayload
   + payment.helper ile teyitli). Price engine ÇALIŞTIRILMAZ → rezervasyon
   sonrası villa fiyatı değişse bile tutar sabit.

   Durumlar:
     - invalid : token yok / geçersiz / expired / revoked / bulunamadı
                 (generic; enumeration sızıntısı yok)
     - cancelled : rezervasyon iptal/reddedilmiş
     - ok : sanitized DTO
   =============================================================== */

export type ReservationShareStatusKey =
  | "pending"
  | "prepayment"
  | "confirmed";

export type ReservationShareDTO = {
  reservationNo: string;
  villaTitle: string;
  /** Villa kapak görseli (resolved URL) — yoksa null (layout bozulmaz). */
  villaImage: string | null;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  guests: number | null;
  statusKey: ReservationShareStatusKey;
  /** Site standardı giriş/çıkış saatleri (16:00 / 10:00). */
  checkInTime: string;
  checkOutTime: string;
  /** Ödeme özeti — TRY (rezervasyon accounting currency). */
  total: number | null;
  paid: number | null;
  remaining: number | null;
  prepayment: number | null;
  /** payment_preference === "full_payment". */
  isFullPayment: boolean;
  /** Bilgilendirme (TRY snapshot) — total/remaining hesabına KATILMAZ.
   *  Değer yoksa null → satır gösterilmez. */
  damageDeposit: number | null;
  cleaningFee: number | null;
  /** 🔥 HAVUZ ISITMA — uçtan uca tamamlama turu. cleaningFee ile AYNI
   *  desen: yalnız seçiliyse ve TRY snapshot > 0 ise dolu, aksi halde
   *  null → view satırı hiç göstermez (eski/havuz-ısıtmasız rezervasyon
   *  davranışı BYTE-IDENTICAL korunur). */
  poolHeatingFee: number | null;
  /** "Havale/EFT" | "Kredi Kartı" | null (yöntem tanımlı değilse). */
  paymentMethodLabel: string | null;
  /* Mülk sahibi — yalnız ad + telefon (email/iban ASLA). villa.owner yoksa null. */
  ownerName: string | null;
  ownerPhone: string | null;
  /* Misafir — rezervasyonun kendi kaydı (name/phone/email). */
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
};

export type ReservationShareResult =
  | { kind: "invalid" }
  | { kind: "cancelled" }
  | { kind: "ok"; data: ReservationShareDTO };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** UTC-safe gece sayısı (yalnız tarih farkı; price engine DEĞİL). */
function nightsBetween(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end);
  if (!a || !b) return null;
  const da = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const db = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  const diff = Math.round((db - da) / 86400000);
  return diff > 0 ? diff : null;
}

export async function resolveReservationShare(
  rawToken: string | null | undefined,
  /** 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı eskisi gibi. */
  locale: Locale = DEFAULT_LOCALE
): Promise<ReservationShareResult> {
  const token = (rawToken || "").toString().trim();
  if (!token) return { kind: "invalid" };

  /* 1) Hash → RPC (revoked/expired → null). */
  let reservationId: string | null = null;
  try {
    const tokenHash = hashShareToken(token);
    const { data, error } =
      await reservationShareRepository.resolveByTokenHash(tokenHash);
    if (error) {
      console.error("[reservation-share] resolve RPC error:", error.message);
      return { kind: "invalid" };
    }
    reservationId =
      typeof data === "string" && data ? data : null;
  } catch (e) {
    console.error("[reservation-share] resolve exception:", e);
    return { kind: "invalid" };
  }
  if (!reservationId) return { kind: "invalid" };

  /* 2) Güvenli reservation read. */
  const { data: rows, error: readErr } =
    await reservationShareRepository.findReservationForShare(reservationId);
  if (readErr) {
    console.error("[reservation-share] read error:", readErr.message);
    return { kind: "invalid" };
  }
  const row =
    Array.isArray(rows) && rows.length > 0
      ? (rows[0] as {
          reservation_no: string | null;
          status: string | null;
          payment_link_status: string | null;
          payment_preference: string | null;
          name: string | null;
          phone: string | null;
          email: string | null;
          start_date: string | null;
          end_date: string | null;
          guests: number | null;
          total_price: number | null;
          total_price_try: number | null;
          paid_amount: number | null;
          prepayment_amount: number | null;
          remaining_payment: number | null;
          original_currency: string | null;
          damage_deposit: number | null;
          cleaning_fee_try: number | null;
          pool_heating_selected: boolean | null;
          pool_heating_total_try: number | null;
          payment_method: {
            id: string | null;
            name: string | null;
            type: string | null;
          } | null;
          villa: {
            title: string | null;
            villa_images:
              | Array<{
                  image_url: string | null;
                  is_cover: boolean | null;
                  sort_order: number | null;
                }>
              | null;
            owner: {
              first_name: string | null;
              last_name: string | null;
              phone: string | null;
            } | null;
          } | null;
        })
      : null;
  if (!row) return { kind: "invalid" };

  /* 3) İptal/red → özel ekran. */
  const status = (row.status ?? "").toString().trim().toLowerCase();
  if (status === "cancelled" || status === "rejected") {
    return { kind: "cancelled" };
  }

  /* statusKey — lookup API `deriveStatusKey` ile aynı mantık. */
  const pls = (row.payment_link_status ?? "").toString().trim().toLowerCase();
  const statusKey: ReservationShareStatusKey =
    status === "confirmed"
      ? "confirmed"
      : pls === "sent"
        ? "prepayment"
        : "pending";

  /* Ödeme — TEK SOURCE-OF-TRUTH: mail (reservation-approved) + PDF voucher
     ile AYNI helper (getPaymentDisplayValues). "Özel toplam tutar (TRY)"
     zaten total_price_try'da taşınır → helper onu totalTRY olarak alır.
     🐛 FIX: "Kalan", mail/PDF gibi remainingFromPaid (total − ödenen)'dir;
     DB'deki remaining_payment SNAPSHOT'ı özel toplam + ön ödemede tutarsız
     olabildiği için DISPLAY'de KULLANILMAZ (snapshot DB'de bozulmaz). */
  const pay = getPaymentDisplayValues({
    total_price_try: row.total_price_try,
    total_price: row.total_price,
    prepayment_amount: row.prepayment_amount,
    paid_amount: row.paid_amount,
    remaining_payment: row.remaining_payment,
    payment_preference: row.payment_preference,
  });
  const total = pay.totalTRY;
  const paid = pay.paidTRY;
  const prepay = num(row.prepayment_amount);
  const remaining = pay.remainingFromPaid;
  const isFullPayment = pay.isFullPayment;

  /* Bilgilendirme snapshot'ları (TRY) — hesaba KATILMAZ. Yalnız > 0 ise
     DTO'ya konur; aksi halde null → view satırı hiç göstermez. */
  const damageDepositVal = num(row.damage_deposit);
  const cleaningFeeVal = num(row.cleaning_fee_try);
  /* 🔥 HAVUZ ISITMA — yalnız pool_heating_selected=true VE snapshot>0
     iken gösterilir; eski (pool_heating_selected=false/NULL) rezervasyon
     davranışı BYTE-IDENTICAL (poolHeatingFee=null → view satırı yok). */
  const poolHeatingFeeVal = row.pool_heating_selected
    ? num(row.pool_heating_total_try)
    : 0;

  /* Villa kapak görseli — is_cover öncelik, yoksa ilk geçerli (mevcut
     resolveVillaImageUrl; yeni storage sistemi yok). Yoksa null. */
  const imgs = Array.isArray(row.villa?.villa_images)
    ? row.villa!.villa_images
    : [];
  const coverRaw =
    imgs.find((i) => i?.is_cover)?.image_url ?? imgs[0]?.image_url ?? null;
  const villaImage = coverRaw ? resolveVillaImageUrl(coverRaw) ?? null : null;

  /* Ödeme yöntemi etiketi — CANONICAL `payment_methods.name` (+ EN/DE
     `payment_method_translations`). Yöntem tanımlı değilse veya adı boşsa
     null (parantez gösterilmez) — eski davranışla aynı.
     SORGU: TR'de çeviri sorgusu HİÇ atılmaz; EN/DE'de TEK batch `.in()`
     çağrısı (tek id) — N+1 YOK. Okuma hatası fail-soft → TR canonical. */
  const pmId = (row.payment_method?.id ?? "").toString().trim();
  const pmName = (row.payment_method?.name ?? "").toString().trim();
  let paymentMethodLabel: string | null = null;
  if (pmName) {
    const namesByLocale =
      locale === DEFAULT_LOCALE || !pmId
        ? {}
        : await getPaymentMethodNamesByLocale([pmId]).catch(() => ({}));
    paymentMethodLabel = resolveTaxonomyName(
      pmName,
      namesByLocale[pmId],
      locale
    );
  }

  /* Mülk sahibi — yalnız ad + telefon (email/iban embed edilmedi). */
  const owner = row.villa?.owner ?? null;
  const ownerName = owner
    ? [owner.first_name, owner.last_name]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join(" ") || null
    : null;
  const ownerPhone = owner?.phone?.trim() || null;

  /* Misafir — rezervasyonun kendi kaydı. */
  const guestName = row.name?.trim() || null;
  const guestPhone = row.phone?.trim() || null;
  const guestEmail = row.email?.trim() || null;

  return {
    kind: "ok",
    data: {
      reservationNo: (row.reservation_no || "").toString(),
      villaTitle: (row.villa?.title || "Villa").toString(),
      villaImage,
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      nights: nightsBetween(row.start_date, row.end_date),
      guests: Number(row.guests) || null,
      statusKey,
      checkInTime: CHECK_IN_TIME,
      checkOutTime: CHECK_OUT_TIME,
      total: total > 0 ? total : null,
      paid: paid > 0 ? paid : 0,
      remaining: isFullPayment ? 0 : remaining > 0 ? remaining : null,
      prepayment: prepay > 0 ? prepay : null,
      isFullPayment,
      damageDeposit: damageDepositVal > 0 ? damageDepositVal : null,
      cleaningFee: cleaningFeeVal > 0 ? cleaningFeeVal : null,
      poolHeatingFee: poolHeatingFeeVal > 0 ? poolHeatingFeeVal : null,
      paymentMethodLabel,
      ownerName,
      ownerPhone,
      guestName,
      guestPhone,
      guestEmail,
    },
  };
}
