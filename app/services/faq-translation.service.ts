import { translationRepository } from "@/lib/db/translation.repository.server";
import type { FaqTranslationRow } from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ SSS (FAQ) ÇEVİRİ SERVİSİ — ADMIN YAZMA/OKUMA
   ===============================================================
   `app/services/menu-translation.service.ts` (migration 086) ve
   `app/services/villa-type-translation.service.ts` (Phase 10D) ile
   AYNI desen: MEVCUT generic `translationRepository` (migration 082
   registry'si), aynı `{ ok }` sonuç zarfı, aynı `en|de` yazılabilir-
   locale kısıtı. YENİ TABLO / MİGRASYON / ÇEVİRİ MİMARİSİ YOK —
   `faq_translations` migration 082'de ZATEN VAR.

   TR canonical kaynaktır (`faqs.question` / `faqs.answer`) ve bu
   servisten ASLA yazılmaz/okunmaz.

   BOŞ DEĞER İZNİ: EN/DE opsiyoneldir. Boş/whitespace bir alan hata
   DEĞİLDİR; `null` yazılır ve public tarafta canonical TR'ye düşer
   (`applyFaqTranslations`, Phase 11 — alan BAZINDA fallback). Bu,
   `menu-translation.service.ts` ile AYNI bilinçli karardır.

   ⚠️ PUBLIC OKUMA BU SERVİSTEN GEÇMEZ: public tarafın yolu
   `lib/i18n/get-faq-translations.server.ts > applyFaqTranslations`
   (batch, locale başına TEK `.in()` sorgusu) ve `getCachedFaqs(locale)`
   — DEĞİŞTİRİLMEDİ.
   =============================================================== */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type FaqTranslationInput = {
  faqId: string;
  locale: string;
  /** Boş/whitespace → alan TEMİZLENİR (null) → TR fallback. */
  question: string;
  /** Boş/whitespace → alan TEMİZLENİR (null) → TR fallback. */
  answer: string;
};

export type FaqTranslationResult =
  | { ok: true; row: FaqTranslationRow }
  | { ok: false; error: string };

/** Admin formunun beklediği şekil: `{ faqId: { en?: {...}, de?: {...} } }`. */
export type FaqTranslationFields = { question: string; answer: string };
export type FaqTranslationsByLocale = Partial<
  Record<WritableTranslationLocale, FaqTranslationFields>
>;
export type FaqTranslationsMapResult =
  | { ok: true; map: Record<string, FaqTranslationsByLocale> }
  | { ok: false; error: string };

const WRITABLE_LOCALES: readonly WritableTranslationLocale[] = ["en", "de"];

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Birden fazla FAQ'ın EN/DE çevirileri — ADMIN formu için.
 * Locale başına TEK batch `.in()` sorgusu (kayıt başına sorgu YOK).
 * `faqIds` boşsa DB'ye HİÇ gidilmez.
 */
export async function getFaqTranslations(
  faqIds: readonly string[]
): Promise<FaqTranslationsMapResult> {
  const ids = Array.from(
    new Set(
      (faqIds || []).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    )
  );
  if (ids.length === 0) return { ok: true, map: {} };

  const results = await Promise.all(
    WRITABLE_LOCALES.map((locale) =>
      translationRepository.findManyForLocale("faq", ids, locale)
    )
  );

  if (results.some((r) => r.error)) {
    return { ok: false, error: "Çeviriler okunamadı" };
  }

  const map: Record<string, FaqTranslationsByLocale> = {};
  WRITABLE_LOCALES.forEach((locale, i) => {
    for (const row of results[i].data || []) {
      const faqId = row.faq_id;
      if (typeof faqId !== "string") continue;
      (map[faqId] ??= {})[locale] = {
        question: row.question ?? "",
        answer: row.answer ?? "",
      };
    }
  });

  return { ok: true, map };
}

/** EN veya DE çevirisini yazar/günceller. Boş alanlar temizlenir. */
export async function upsertFaqTranslation(
  input: FaqTranslationInput
): Promise<FaqTranslationResult> {
  const faqId = (input.faqId ?? "").toString().trim();
  if (!faqId) return { ok: false, error: "Geçersiz SSS kaydı" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  const question = normalize(input.question);
  const answer = normalize(input.answer);

  const { data, error } = await translationRepository.upsertOne(
    "faq",
    faqId,
    locale,
    { question, answer }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
