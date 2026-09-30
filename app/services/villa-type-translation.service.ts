import { translationRepository } from "@/lib/db/translation.repository.server";
import type { VillaTypeTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10D — Batch 1 — Villa Tipi (villa_types) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler
 * (🛡️ PHASE 10I: bu satır daha önce `villa-location-translation.
 * service.ts`'e atıfta bulunuyordu; o dosya KALDIRILDI — bölge
 * adları özel isimdir, çevrilmez) (paylaşılan taxonomy, `/maki-admin/
 * types` sayfasından çağrılır, villa orchestration'a bağlanmaz, parent
 * existence pre-check yok — `villa-type.repository.ts`'de tekil
 * `findById` YOK, FK constraint hatası generic mesaja çevrilir).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type TypeTranslationInput = {
  typeId: string;
  locale: string;
  name: string;
};

export type TypeTranslationResult =
  | { ok: true; row: VillaTypeTranslationRow }
  | { ok: false; error: string };

export type TypeTranslationsListResult =
  | { ok: true; rows: VillaTypeTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getTypeTranslations(
  typeId: string
): Promise<TypeTranslationsListResult> {
  const id = (typeId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz villa tipi" };

  const { data, error } = await translationRepository.findAllForParent(
    "villa_type",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertTypeTranslation(
  input: TypeTranslationInput
): Promise<TypeTranslationResult> {
  const typeId = (input.typeId ?? "").toString().trim();
  if (!typeId) return { ok: false, error: "Geçersiz villa tipi" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const name = normalize(input.name);
  if (!name) return { ok: false, error: "İsim gerekli" };

  const { data, error } = await translationRepository.upsertOne(
    "villa_type",
    typeId,
    locale,
    { name }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
