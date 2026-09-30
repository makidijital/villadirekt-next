import { translationRepository } from "@/lib/db/translation.repository.server";
import type { PaymentMethodTranslationRow } from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ ÖDEME YÖNTEMİ ADI ÇEVİRİ SERVİSİ (migration 088)
   ===============================================================
   `app/services/menu-translation.service.ts` ile BİREBİR AYNI desen —
   aynı generic `translationRepository`, aynı `{ ok }` sonuç zarfı, aynı
   `en|de` yazılabilir-locale kısıtı. TR canonical kaynaktır
   (`payment_methods.name`) ve bu servisten ASLA yazılmaz/okunmaz.

   ⚠️ BOŞ DEĞER İZNİ (menu deseni): EN/DE çevirileri OPSİYONELDİR —
   boş/whitespace değer hata değil, `null` yazılır ve kayıt TR
   fallback'ine döner. Yeni bir fallback mantığı İCAT EDİLMEDİ:
   `resolveTaxonomyName` zaten boş/whitespace çeviriyi canonical ada
   düşürür.

   ⚠️ KAPSAM: yalnız GÖRÜNEN AD. `type` / `is_active` / `id` bu servise
   HİÇ girmez. Canonical `payment_methods.name` iş mantığında da okunur
   (`lib/payment-link.helper.ts > isWesternUnionMethod`) — bu servis o
   değeri DEĞİŞTİRMEZ.
   =============================================================== */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type PaymentMethodTranslationInput = {
  paymentMethodId: string;
  locale: string;
  /** Boş/whitespace → çeviri TEMİZLENİR (null) → TR fallback. */
  name: string;
};

export type PaymentMethodTranslationResult =
  | { ok: true; row: PaymentMethodTranslationRow }
  | { ok: false; error: string };

export type PaymentMethodTranslationsListResult =
  | { ok: true; rows: PaymentMethodTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Bir ödeme yönteminin EN/DE çevirileri (0..2 satır). */
export async function getPaymentMethodTranslations(
  paymentMethodId: string
): Promise<PaymentMethodTranslationsListResult> {
  const id = (paymentMethodId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz ödeme yöntemi" };

  const { data, error } = await translationRepository.findAllForParent(
    "payment_method",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

/** EN veya DE ödeme yöntemi adını yazar/günceller. Boş değer çeviriyi temizler. */
export async function upsertPaymentMethodTranslation(
  input: PaymentMethodTranslationInput
): Promise<PaymentMethodTranslationResult> {
  const paymentMethodId = (input.paymentMethodId ?? "").toString().trim();
  if (!paymentMethodId) return { ok: false, error: "Geçersiz ödeme yöntemi" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  /* Boş → null (temizleme). Reddetme YOK — bkz. dosya başı notu. */
  const name = normalize(input.name);

  const { data, error } = await translationRepository.upsertOne(
    "payment_method",
    paymentMethodId,
    locale,
    { name }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
