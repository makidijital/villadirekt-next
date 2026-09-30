import { translationRepository } from "@/lib/db/translation.repository.server";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import type { VillaTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10A — Admin Villa Translation UI
 *
 * Bu servis yalnızca EN/DE villa çevirilerinin (villa_translations —
 * description/badge/seo_title/seo_description; `title` ÇEVRİLMEZ)
 * okunması/yazılması için var. TR bu UI üzerinden YAZILAMAZ (locale
 * whitelist aşağıda "en" | "de" ile kapatılmış durumda).
 *
 * TÜM iş kuralı doğrulaması BURADA yapılır (repository katmanı yalnız
 * DB primitive'i — bkz. translation.repository.server.ts'in
 * `upsertOne` yorum bloğu).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

const MAX_DESCRIPTION_LEN = 5000;
const MAX_BADGE_LEN = 60;
const MAX_SEO_TITLE_LEN = 120; // SeoStep.tsx ile AYNI
const MAX_SEO_DESCRIPTION_LEN = 300; // SeoStep.tsx ile AYNI

export type VillaTranslationInput = {
  villaId: string;
  locale: string;
  /* 🛡️ `title` KALDIRILDI — villa adı özel isimdir, çevrilmez.
     Her locale'de canonical `villa.title` gösterilir. */
  description?: string | null;
  badge?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type VillaTranslationResult =
  | { ok: true; row: VillaTranslationRow }
  | { ok: false; error: string };

export type VillaTranslationsListResult =
  | { ok: true; rows: VillaTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getVillaTranslations(
  villaId: string
): Promise<VillaTranslationsListResult> {
  const id = (villaId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz villa" };

  const { data, error } = await translationRepository.findAllForParent("villa", id);
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertVillaTranslation(
  input: VillaTranslationInput
): Promise<VillaTranslationResult> {
  const villaId = (input.villaId ?? "").toString().trim();
  if (!villaId) return { ok: false, error: "Geçersiz villa" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const description = normalize(input.description);
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    return { ok: false, error: `Açıklama ${MAX_DESCRIPTION_LEN} karakteri geçemez` };
  }

  const badge = normalize(input.badge);
  if (badge && badge.length > MAX_BADGE_LEN) {
    return { ok: false, error: `Rozet ${MAX_BADGE_LEN} karakteri geçemez` };
  }

  const seoTitle = normalize(input.seoTitle);
  if (seoTitle && seoTitle.length > MAX_SEO_TITLE_LEN) {
    return { ok: false, error: `SEO başlık ${MAX_SEO_TITLE_LEN} karakteri geçemez` };
  }

  const seoDescription = normalize(input.seoDescription);
  if (seoDescription && seoDescription.length > MAX_SEO_DESCRIPTION_LEN) {
    return { ok: false, error: `SEO açıklama ${MAX_SEO_DESCRIPTION_LEN} karakteri geçemez` };
  }

  const { data: villaRow, error: villaError } = await villaAdminRepository.findSlugById(villaId);
  if (villaError) return { ok: false, error: "Villa doğrulanamadı" };
  if (!villaRow) return { ok: false, error: "Villa bulunamadı" };

  /* 🛡️ `title` payload'a HİÇ girmez — villa adı çevrilmez. DB kolonu
     (migration 082) duruyor ama bu koddan asla yazılmaz/okunmaz. */
  const { data, error } = await translationRepository.upsertOne("villa", villaId, locale, {
    description,
    badge,
    seo_title: seoTitle,
    seo_description: seoDescription,
  });

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
