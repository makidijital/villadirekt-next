import { translationRepository } from "@/lib/db/translation.repository.server";
import type { VillaFeatureTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10D — Batch 1 — Özellik/Olanak (villa_features) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler
 * (🛡️ PHASE 10I: bu satır daha önce `villa-location-translation.
 * service.ts`'e atıfta bulunuyordu; o dosya KALDIRILDI — bölge
 * adları özel isimdir, çevrilmez) (paylaşılan taxonomy, `/maki-admin/
 * features` sayfasından çağrılır, villa orchestration'a bağlanmaz,
 * parent existence pre-check yok — `villa-feature.repository.ts`'de
 * tekil `findById` YOK, FK constraint hatası generic mesaja çevrilir).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type FeatureTranslationInput = {
  featureId: string;
  locale: string;
  name: string;
};

export type FeatureTranslationResult =
  | { ok: true; row: VillaFeatureTranslationRow }
  | { ok: false; error: string };

export type FeatureTranslationsListResult =
  | { ok: true; rows: VillaFeatureTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getFeatureTranslations(
  featureId: string
): Promise<FeatureTranslationsListResult> {
  const id = (featureId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz özellik" };

  const { data, error } = await translationRepository.findAllForParent(
    "villa_feature",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertFeatureTranslation(
  input: FeatureTranslationInput
): Promise<FeatureTranslationResult> {
  const featureId = (input.featureId ?? "").toString().trim();
  if (!featureId) return { ok: false, error: "Geçersiz özellik" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const name = normalize(input.name);
  if (!name) return { ok: false, error: "İsim gerekli" };

  const { data, error } = await translationRepository.upsertOne(
    "villa_feature",
    featureId,
    locale,
    { name }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
