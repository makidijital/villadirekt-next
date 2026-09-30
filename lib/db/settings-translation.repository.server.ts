import "server-only";

import { dbNative as db } from "./native";
import type {
  SettingsTranslationLocale,
  SettingsTranslationRow,
  SettingsTranslationValues,
} from "@/lib/i18n/settings-translations.types";

/* ===============================================================
   🛡️ SETTINGS TRANSLATION REPOSITORY — PHASE 10L (server-only)
   ===============================================================
   migration 083'ün `settings_translations` tablosu için DAR, DEDİKE
   repository. Migration 082'nin generic `translation.repository.
   server.ts`'ine BAĞLANMADI — gerekçe:
     • Phase 10L §14: translation entity registry DEĞİŞTİRİLMEYECEK.
     • Generic `upsertOne(entity, parentId, locale, fields)` imzası
       `fields: Record<string, unknown>` alır ve `locale: Locale`
       ('tr' dahil) kabul eder. Burada HER İKİSİ de kasıtlı olarak
       DARALTILDI (aşağıya bkz.).

   🛡️ GÜVENLİK SINIRLARI (Phase 10L §3 / §13):
     1) Tablo adı bu dosyada SABİT — çağırandan gelmez.
     2) `upsertOne` KEYFİ OBJE PASSTHROUGH KABUL ETMEZ: payload
        tek tek, isimle kurulur (`SettingsTranslationValues`'ın 8
        alanı). Çağıran fazladan bir alan geçirse bile o alan
        SQL'e HİÇ ULAŞMAZ. (DB şeması da yalnız bu 8 kolona sahip →
        çift kilit.)
     3) `locale` tipi `SettingsTranslationLocale` ("en" | "de") —
        "tr" derleme zamanında reddedilir; runtime doğrulaması
        servis katmanında (`isSettingsTranslationLocale`), DB
        seviyesinde ise migration 083'ün CHECK constraint'i.
     4) `import "server-only"` — client bundle'a sızarsa BUILD HATA.

   Bu repository `public.settings` tablosunu YAZMAZ; yalnız
   `settings_translations`'a yazar. Mevcut settings write chain
   (`/api/admin/settings` PUT → `settingsServerRepository.updateById`)
   bu dosyadan HİÇ ETKİLENMEZ.
   =============================================================== */

const TABLE = "settings_translations";

export const settingsTranslationRepository = {
  /** Singleton settings satırının TÜM çevirileri (0..2 satır). */
  async findAllForSettings(settingsId: string) {
    return db
      .from<SettingsTranslationRow>(TABLE)
      .select("*")
      .eq("settings_id", settingsId);
  },

  /** Tek locale çevirisi (varsa). */
  async findOne(settingsId: string, locale: SettingsTranslationLocale) {
    return db
      .from<SettingsTranslationRow>(TABLE)
      .select("*")
      .eq("settings_id", settingsId)
      .eq("locale", locale)
      .maybeSingle();
  },

  /**
   * UPSERT — `UNIQUE (settings_id, locale)` (migration 083) onConflict
   * hedefi. Payload 9 alanın TAMAMINI yazar: çağıran (servis) her
   * zaman o locale'in TAM durumunu gönderir, böylece kısmi bir kayıt
   * diğer alanları sessizce null'lamaz.
   *
   * ⚠️ `values` burada AÇIKÇA açılır — `...values` spread'i KASITLI
   * OLARAK KULLANILMADI (bkz. dosya başı güvenlik notu 2).
   */
  async upsertOne(
    settingsId: string,
    locale: SettingsTranslationLocale,
    values: SettingsTranslationValues
  ) {
    return db
      .from<SettingsTranslationRow>(TABLE)
      .upsert(
        {
          settings_id: settingsId,
          locale,
          footer_copyright: values.footer_copyright,
          default_meta_title: values.default_meta_title,
          default_meta_description: values.default_meta_description,
          hero_title: values.hero_title,
          hero_subtitle: values.hero_subtitle,
          hero_badge_text: values.hero_badge_text,
          hero_primary_cta_text: values.hero_primary_cta_text,
          hero_secondary_cta_text: values.hero_secondary_cta_text,
          business_hours: values.business_hours,
        },
        { onConflict: "settings_id,locale" }
      )
      .select("*")
      .single();
  },

  /** Tek locale çevirisini tamamen kaldırır (opsiyonel — §3).
   *  Silinen locale public tarafta TR canonical'e döner. */
  async deleteOne(settingsId: string, locale: SettingsTranslationLocale) {
    return db
      .from<SettingsTranslationRow>(TABLE)
      .delete()
      .eq("settings_id", settingsId)
      .eq("locale", locale);
  },
};
