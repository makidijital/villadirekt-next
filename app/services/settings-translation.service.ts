import { settingsServerRepository } from "@/lib/db/settings.repository.server";
import { settingsTranslationRepository } from "@/lib/db/settings-translation.repository.server";
import {
  SETTINGS_TRANSLATABLE_FIELDS,
  SETTINGS_TRANSLATION_MAX_LEN,
  emptySettingsTranslationValues,
  isSettingsTranslationLocale,
  pickSettingsTranslationValues,
  type SettingsTranslationLocale,
  type SettingsTranslationValues,
  type SettingsTranslationsByLocale,
} from "@/lib/i18n/settings-translations.types";

/* ===============================================================
   🛡️ SETTINGS TRANSLATION SERVICE — PHASE 10L §3/§4
   ===============================================================
   `app/services/villa-type-translation.service.ts` (Phase 10D) ile
   AYNI desen: TÜM iş kuralı doğrulaması BURADA (repository yalnız DB
   primitive'i), TR yazımı locale whitelist'i ile kapalı, boş değer →
   null, hata mesajları generic.

   FARKLAR (settings singleton olduğu için):
     • `parentId` DIŞARIDAN GELMEZ — settings satırının id'si burada,
       server tarafında çözülür (`findSingletonId`). Böylece çağıran
       keyfi bir `settings_id` enjekte EDEMEZ.
     • Alan whitelist'i `SETTINGS_TRANSLATABLE_FIELDS` (9 alan) —
       input'tan gelen obje HİÇBİR ZAMAN spread edilmez; 8 alan tek
       tek okunur.

   ⚠️ BU SERVİS `public.settings` TABLOSUNA YAZMAZ. Mevcut settings
   save akışı (`/api/admin/settings` PUT → `updateById`) ve 7 settings
   alt sayfası DEĞİŞTİRİLMEDİ.
   =============================================================== */

export type SettingsTranslationInput = {
  locale: string;
  footer_copyright?: string | null;
  default_meta_title?: string | null;
  default_meta_description?: string | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_badge_text?: string | null;
  hero_primary_cta_text?: string | null;
  hero_secondary_cta_text?: string | null;
  /* 🛡️ MIGRATION 087 — /iletisim çalışma saatleri (EN/DE). */
  business_hours?: string | null;
};

export type SettingsTranslationSaveResult =
  | { ok: true; locale: SettingsTranslationLocale; values: SettingsTranslationValues }
  | { ok: false; error: string };

export type SettingsTranslationsLoadResult =
  | { ok: true; translations: SettingsTranslationsByLocale }
  | { ok: false; error: string };

/** Boş/whitespace → null. `villa-translation.service.ts` ile AYNI. */
function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

const FIELD_LABELS: Record<(typeof SETTINGS_TRANSLATABLE_FIELDS)[number], string> = {
  footer_copyright: "Footer telif metni",
  default_meta_title: "Varsayılan meta başlık",
  default_meta_description: "Varsayılan meta açıklama",
  hero_title: "Hero başlığı",
  hero_subtitle: "Hero alt başlık",
  hero_badge_text: "Hero rozet metni",
  hero_primary_cta_text: "Birincil buton metni",
  hero_secondary_cta_text: "İkincil buton metni",
  business_hours: "Çalışma saatleri",
};

/** Singleton settings satırının id'si. Yok/hata → null. */
async function resolveSettingsId(): Promise<string | null> {
  const { data, error } = await settingsServerRepository.findSingletonId();
  if (error) return null;
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

/* ---------------------------------------------------------------
   OKUMA — public + admin ortak yolu
--------------------------------------------------------------- */

/**
 * Tüm EN/DE çevirileri `{ en: {...}, de: {...} }` şeklinde döner.
 * Satır yoksa o locale HİÇ bulunmaz (→ TR canonical fallback).
 *
 * 🛡️ Yalnız 8 çevrilebilir alan payload'a girer — `id`, `settings_id`,
 * `created_at`, `updated_at` KASITLI OLARAK DIŞARI ÇIKMAZ
 * (`pickSettingsTranslationValues`). Bu payload public tarafta
 * client'a kadar gidebilir; bu yüzden minimum yüzey.
 */
export async function getSettingsTranslations(): Promise<SettingsTranslationsLoadResult> {
  const settingsId = await resolveSettingsId();
  if (!settingsId) return { ok: false, error: "Ayar kaydı bulunamadı" };

  const { data, error } =
    await settingsTranslationRepository.findAllForSettings(settingsId);
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const translations: SettingsTranslationsByLocale = {};
  for (const row of data || []) {
    if (!isSettingsTranslationLocale(row?.locale)) continue;
    translations[row.locale] = pickSettingsTranslationValues(row);
  }

  return { ok: true, translations };
}

/**
 * Public okuma yardımcısı — hata durumunda `null` döner (public site
 * çeviri okunamadığı için ÇÖKMEZ; TR canonical'e düşer).
 * `settings.service.ts > getPublicSettings` bunu kullanır.
 */
export async function getPublicSettingsTranslations(
  settingsId: string
): Promise<SettingsTranslationsByLocale | null> {
  const id = (settingsId ?? "").toString().trim();
  if (!id) return null;

  const { data, error } =
    await settingsTranslationRepository.findAllForSettings(id);
  if (error || !data || data.length === 0) return null;

  const translations: SettingsTranslationsByLocale = {};
  for (const row of data) {
    if (!isSettingsTranslationLocale(row?.locale)) continue;
    translations[row.locale] = pickSettingsTranslationValues(row);
  }

  return Object.keys(translations).length > 0 ? translations : null;
}

/* ---------------------------------------------------------------
   YAZMA
--------------------------------------------------------------- */

/**
 * Tek locale'in 4 alanını UPSERT eder.
 *
 * DOĞRULAMA SIRASI:
 *   1) locale whitelist ("en" | "de") — "tr" REDDEDİLİR
 *   2) alan whitelist — input'tan YALNIZ 8 alan okunur (spread YOK)
 *   3) trim + boş → null
 *   4) uzunluk limitleri
 *   5) settings satırı var mı
 */
export async function upsertSettingsTranslation(
  input: SettingsTranslationInput
): Promise<SettingsTranslationSaveResult> {
  if (!isSettingsTranslationLocale(input?.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  /* 🛡️ Alan whitelist'i — `...input` SPREAD EDİLMEZ. Fazladan alan
     (ör. resend_api_key, site_name, id) buraya girse bile okunmaz. */
  const values: SettingsTranslationValues = {
    ...emptySettingsTranslationValues(),
    footer_copyright: normalize(input.footer_copyright),
    default_meta_title: normalize(input.default_meta_title),
    default_meta_description: normalize(input.default_meta_description),
    hero_title: normalize(input.hero_title),
    hero_subtitle: normalize(input.hero_subtitle),
    hero_badge_text: normalize(input.hero_badge_text),
    hero_primary_cta_text: normalize(input.hero_primary_cta_text),
    hero_secondary_cta_text: normalize(input.hero_secondary_cta_text),
    business_hours: normalize(input.business_hours),
  };

  for (const field of SETTINGS_TRANSLATABLE_FIELDS) {
    const value = values[field];
    const max = SETTINGS_TRANSLATION_MAX_LEN[field];
    if (value && value.length > max) {
      return {
        ok: false,
        error: `${FIELD_LABELS[field]} ${max} karakteri geçemez`,
      };
    }
  }

  const settingsId = await resolveSettingsId();
  if (!settingsId) return { ok: false, error: "Ayar kaydı bulunamadı" };

  const { data, error } = await settingsTranslationRepository.upsertOne(
    settingsId,
    locale,
    values
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };

  return { ok: true, locale, values: pickSettingsTranslationValues(data) };
}

/**
 * Tek locale'in çevirisini tamamen kaldırır (opsiyonel — §3).
 * Sonuç: o dil public tarafta TR canonical'e döner.
 */
export async function deleteSettingsTranslation(
  locale: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSettingsTranslationLocale(locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }

  const settingsId = await resolveSettingsId();
  if (!settingsId) return { ok: false, error: "Ayar kaydı bulunamadı" };

  const { error } = await settingsTranslationRepository.deleteOne(
    settingsId,
    locale
  );
  if (error) return { ok: false, error: "Çeviri silinemedi" };

  return { ok: true };
}
