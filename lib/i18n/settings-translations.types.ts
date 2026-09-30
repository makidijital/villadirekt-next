/* ===============================================================
   🛡️ SETTINGS TRANSLATION TYPES — PHASE 10L
   ===============================================================
   migration 083'ün `settings_translations` tablosunun TypeScript
   karşılığı + ÇEVRİLEBİLİR ALAN WHITELIST'İ.

   Bu dosya YALNIZ tip + statik sabit içerir; hiçbir DB çağrısı
   yapmaz, `server-only` GEREKTİRMEZ (admin client island'ı da
   buradan okur). DB'ye dokunan repository ayrı bir dosyada:
   `lib/db/settings-translation.repository.server.ts`.

   ⚠️ NEDEN `TRANSLATION_ENTITY_CONFIG`'E EKLENMEDİ (Phase 10L §1):
     1) Phase 10L §14 "translation entity registry'yi değiştirme"
        diyor — o registry (migration 082'nin 9 tablosu) AYNEN kaldı.
     2) Generic repository'nin imzası `locale: Locale` ('tr' DAHİL).
        Burada TR yazımı hem DB CHECK'i hem tip seviyesinde YASAK —
        generic yola bağlanmak bu daralmayı gevşetirdi.
     3) `settings` bir SINGLETON; diğer 9 entity çok-satırlı parent'lara
        bağlı. Aynı soyutlamaya zorlamak yanlış eşleştirme olurdu.
   =============================================================== */

/** Bu tablodan yazılabilen/okunabilen diller. TR KASITLI OLARAK YOK —
 *  TR canonical değer `settings` satırının kendisidir (migration 083
 *  CHECK (locale IN ('en','de')) ile DB seviyesinde de zorlanır). */
export type SettingsTranslationLocale = "en" | "de";

export const SETTINGS_TRANSLATION_LOCALES: readonly SettingsTranslationLocale[] =
  ["en", "de"];

/** Runtime type guard — güvenilmeyen (client'tan gelen) locale değeri
 *  için TEK doğrulama noktası. */
export function isSettingsTranslationLocale(
  value: unknown
): value is SettingsTranslationLocale {
  return value === "en" || value === "de";
}

/* ---------------- ALAN WHITELIST'İ (TEK DOĞRULUK KAYNAĞI) ---------------- */

/** 🛡️ Çeviri kapsamındaki TAM 9 alan (migration 087 ile 8 → 9). Migration 083 + 084 + 085 sonrası
 *  `settings_translations` kolonlarıyla BİREBİR. Buraya eklenmeyen
 *  hiçbir settings alanı çeviri yoluyla yazılamaz/okunamaz (servis
 *  katmanı bu listeyi kullanır; DB şeması da zaten yalnız bu 8 kolona
 *  sahiptir → çift kilit).
 *
 *  🛡️ PHASE 10M — bakım modu mesajı çeviri kapsamından ÇIKARILDI
 *  (çeviri kolonu migration 084 ile DROP edildi). Bakım ekranı artık
 *  her dilde CANONICAL `settings.maintenance_message` değerini
 *  gösterir; o canonical alan KORUNDU ve hâlâ aktif kullanılıyor
 *  (public bakım ekranı + /maki-admin/settings/gelismis).
 *
 *  ⚠️ KAPSAM DIŞI (bilinçli): bakım modu mesajı, address ve TÜM
 *  canonical/teknik/secret alanlar (telefon, e-posta, WhatsApp,
 *  sosyal medya bağlantıları — bunlar VERİdir, her dilde aynıdır). */
export const SETTINGS_TRANSLATABLE_FIELDS = [
  "footer_copyright",
  "default_meta_title",
  "default_meta_description",
  /* 🛡️ PHASE 11 — ana sayfa Hero (migration 085). CTA HREF'leri ve hero
     görseli DİL BAĞIMSIZ olduğu için BURADA YOK. */
  "hero_title",
  "hero_subtitle",
  "hero_badge_text",
  "hero_primary_cta_text",
  "hero_secondary_cta_text",
  /* 🛡️ MIGRATION 087 — /iletisim EN/DE sürümü için "Çalışma Saatleri"
     serbest metni. TR canonical `settings.business_hours` AYNEN kalır;
     boş/whitespace çeviri `resolveSettingsText` ile TR'ye düşer. */
  "business_hours",
] as const;

export type SettingsTranslatableField =
  (typeof SETTINGS_TRANSLATABLE_FIELDS)[number];

export function isSettingsTranslatableField(
  value: unknown
): value is SettingsTranslatableField {
  return (
    typeof value === "string" &&
    (SETTINGS_TRANSLATABLE_FIELDS as readonly string[]).includes(value)
  );
}

/** Alan başına maksimum uzunluklar. `default_meta_title` /
 *  `default_meta_description` limitleri villa SEO adımıyla (SeoStep.tsx,
 *  villa-translation.service.ts) AYNI — yeni bir kural icat edilmedi. */
export const SETTINGS_TRANSLATION_MAX_LEN: Record<
  SettingsTranslatableField,
  number
> = {
  footer_copyright: 300,
  default_meta_title: 120,
  default_meta_description: 300,
  /* Hero limitleri admin Settings > Genel'deki alanlarla uyumlu tutuldu. */
  hero_title: 200,
  hero_subtitle: 600,
  hero_badge_text: 80,
  hero_primary_cta_text: 60,
  hero_secondary_cta_text: 60,
  /* Admin Settings > İletişim'deki canonical alanla uyumlu. */
  business_hours: 300,
};

/* ---------------- Satır / payload tipleri ---------------- */

/** migration 083 + 084 sonrası satır — kolonlarla BİREBİR. */
export type SettingsTranslationRow = {
  id: string;
  settings_id: string;
  locale: SettingsTranslationLocale;
  footer_copyright: string | null;
  default_meta_title: string | null;
  default_meta_description: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_badge_text: string | null;
  hero_primary_cta_text: string | null;
  hero_secondary_cta_text: string | null;
  business_hours: string | null;
  created_at: string;
  updated_at: string;
};

/** Yalnız çevrilebilir 8 alan (id/locale/timestamp YOK). Boş değer
 *  `null` ile temsil edilir → public tarafta TR canonical'e düşer. */
export type SettingsTranslationValues = Record<
  SettingsTranslatableField,
  string | null
>;

/** Public payload şekli: `{ en: {...}, de: {...} }`. Eksik locale =
 *  o dil için hiç çeviri satırı yok → TR canonical. */
export type SettingsTranslationsByLocale = Partial<
  Record<SettingsTranslationLocale, SettingsTranslationValues>
>;

/** Boş (tamamı null) değer seti — client state'i ve servis
 *  normalizasyonu için ortak başlangıç. */
export function emptySettingsTranslationValues(): SettingsTranslationValues {
  return {
    footer_copyright: null,
    default_meta_title: null,
    default_meta_description: null,
    hero_title: null,
    hero_subtitle: null,
    hero_badge_text: null,
    hero_primary_cta_text: null,
    hero_secondary_cta_text: null,
    business_hours: null,
  };
}

/** Bir satırdan YALNIZ 8 çevrilebilir alanı ayıklar (id/settings_id/
 *  timestamp public payload'a HİÇ girmez). */
export function pickSettingsTranslationValues(
  row: Pick<SettingsTranslationRow, SettingsTranslatableField>
): SettingsTranslationValues {
  return {
    footer_copyright: row.footer_copyright ?? null,
    default_meta_title: row.default_meta_title ?? null,
    default_meta_description: row.default_meta_description ?? null,
    hero_title: row.hero_title ?? null,
    hero_subtitle: row.hero_subtitle ?? null,
    hero_badge_text: row.hero_badge_text ?? null,
    hero_primary_cta_text: row.hero_primary_cta_text ?? null,
    hero_secondary_cta_text: row.hero_secondary_cta_text ?? null,
    business_hours: row.business_hours ?? null,
  };
}
