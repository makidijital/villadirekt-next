import { translationRepository } from "@/lib/db/translation.repository.server";
import type { PriceIncludeItemTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10D — Batch 1 — Fiyata Dahil (price_include_items) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler
 * (🛡️ PHASE 10I: bu satır daha önce `villa-location-translation.
 * service.ts`'e atıfta bulunuyordu; o dosya KALDIRILDI — bölge
 * adları özel isimdir, çevrilmez) (paylaşılan taxonomy, `/maki-admin/
 * price-includes` sayfasından çağrılır, villa orchestration'a
 * bağlanmaz, parent existence pre-check yok —
 * `price-include-item.repository.ts`'de tekil `findById` YOK, FK
 * constraint hatası generic mesaja çevrilir).
 *
 * ⚠️ Çevrilebilir kolon `title` (`name` DEĞİL — migration 082
 * doğrulama notuyla tutarlı).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type PriceIncludeTranslationInput = {
  includeId: string;
  locale: string;
  title: string;
};

export type PriceIncludeTranslationResult =
  | { ok: true; row: PriceIncludeItemTranslationRow }
  | { ok: false; error: string };

export type PriceIncludeTranslationsListResult =
  | { ok: true; rows: PriceIncludeItemTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getPriceIncludeTranslations(
  includeId: string
): Promise<PriceIncludeTranslationsListResult> {
  const id = (includeId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz fiyata dahil öğe" };

  const { data, error } = await translationRepository.findAllForParent(
    "price_include_item",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertPriceIncludeTranslation(
  input: PriceIncludeTranslationInput
): Promise<PriceIncludeTranslationResult> {
  const includeId = (input.includeId ?? "").toString().trim();
  if (!includeId) return { ok: false, error: "Geçersiz fiyata dahil öğe" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (!title) return { ok: false, error: "Başlık gerekli" };

  const { data, error } = await translationRepository.upsertOne(
    "price_include_item",
    includeId,
    locale,
    { title }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
