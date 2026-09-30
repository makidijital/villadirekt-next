/* ===============================================================
   🛡️ SETTINGS — client-safe tipler (FAZ 6 S1)
   ===============================================================
   `Settings` + `WatermarkPosition` tipleri buraya taşındı. `settings.service`
   ileride native repo (server-only) kullanacağı için tip'ler client-safe
   ayrı modülde tutulur (yalnız tip; runtime/import yan etkisi YOK). Public/
   admin/client tüm tip tüketicileri buradan alır; service de buradan import
   eder. Şekiller AYNEN (runtime diff YOK).

   ⚠️ NOT: `resend_api_key` / `mail_from*` tip yüzeyinde vardır (opsiyonel),
     ancak bu değerler yalnızca server/admin akışında doldurulur; public RPC
     (`get_public_settings`) bu alanları DÖNDÜRMEZ — secret sınırı service/
     RPC katmanında korunur (bu tip dosyası yalnız şekil tanımlar).
=============================================================== */

import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";

export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type Settings = {
  id?: string;

  site_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;

  prepayment_rate?: number | null;

  /* 🛡️ Migration 071 — Orphan-gap / minimum konaklama boşluk kuralı (public
     booking). true → min-stay'den kısa kullanılamaz boşluk bırakan seçim
     engellenir. null → fail-safe AÇIK. Default true. */
  orphan_gap_rule_enabled?: boolean | null;

  /* 🛡️ Migration 081 — Çoklu Dil (TR/EN/DE) PHASE 1A: yalnız ayar
     altyapısı. multilingual_enabled=false iken public site davranışı
     BİREBİR eskisi gibi (routing/UI/cache/fiyat/discount/pool-heating
     ETKİLENMEZ — bu faz yalnız admin ayar + get_public_settings
     whitelist'i genişletir). public_default_locale yalnız
     multilingual_enabled=true iken anlamlıdır; DB CHECK constraint'i
     ile tr/en/de dışına izin verilmez. Default: false / 'tr'. */
  multilingual_enabled?: boolean | null;
  public_default_locale?: "tr" | "en" | "de" | null;

  // 🔥 SITE LOGO (Storage public URL)
  site_logo?: string | null;

  /* 🔥 FOOTER LOGO (mig 048) — footer'a özel negatif/beyaz logo.
     NULL → footer site_logo'ya fallback eder. */
  footer_logo?: string | null;

  // 🔥 WATERMARK
  watermark_logo?: string | null;
  watermark_enabled?: boolean | null;
  watermark_opacity?: number | null; // 0.05 - 1
  watermark_position?: WatermarkPosition | null;
  watermark_size?: number | null; // % (10 - 50)

  // 🔥 MAIL (Resend)
  resend_api_key?: string | null;
  mail_from?: string | null; // örn: rezervasyon@domain.com
  mail_from_name?: string | null; // örn: MAKI DIGITAL

  /* 🔥 HOMEPAGE HERO — content yönetimi.
     Tümü nullable; eksik alan hardcoded default'a fallback eder
     (lib/hero.helpers.ts > resolveHeroContent).
     hero_enabled === false → tüm hero defaults'a düşer (safety reset).
     Image R2 storage public URL (bucket: site-assets, path: hero/...). */
  hero_enabled?: boolean | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_background_image?: string | null;
  hero_overlay_opacity?: number | null; // 0..1
  hero_primary_cta_text?: string | null;
  hero_primary_cta_href?: string | null;
  hero_secondary_cta_text?: string | null;
  hero_secondary_cta_href?: string | null;
  hero_badge_text?: string | null;

  /* 🛡️ PAGE HERO ARKA PLAN (mig 067) — tüm public iç sayfaların PageHero
     bandında kullanılan tek ortak arka plan görseli (site-assets relative
     path). Güçlü beyaz/sand overlay + blur + gradient altında DOKU olarak
     kullanılır. NULL → görsel yok. get_public_settings() whitelist'inde. */
  page_hero_background_image?: string | null;

  /* ===============================================================
     🛡️ EXTENDED SETTINGS (migration applied — kolonlar DB'de mevcut)
     ===============================================================
     /settings sub-route'larındaki modüler form'lar bu alanları
     yönetir. Hepsi nullable — boş ise public site fallback'e düşer
     (footer/hero/SEO hardcoded defaults). Schema'da kolon zaten var,
     burada sadece TS tipi genişletilir. */

  // İletişim ek
  /** Çalışma saatleri — public iletişim sayfasında gösterilir.
   *  Multi-line text desteği (textarea). Boşsa "Çalışma Saatleri"
   *  satırı render edilmez. */
  business_hours?: string | null;

  // Sosyal medya
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  whatsapp_link?: string | null;

  // SEO defaults
  default_meta_title?: string | null;
  default_meta_description?: string | null;
  default_og_image?: string | null;
  robots_index?: boolean | null;
  robots_follow?: boolean | null;
  google_site_verification?: string | null;
  yandex_verification?: string | null;
  bing_verification?: string | null;

  // Genel — branding ek
  favicon_url?: string | null;
  browser_theme_color?: string | null;
  footer_copyright?: string | null;
  company_legal_name?: string | null;

  // Gelişmiş — entegrasyon + maintenance
  custom_head_scripts?: string | null;
  analytics_script?: string | null;
  gtm_container_id?: string | null;
  maintenance_mode?: boolean | null;
  maintenance_message?: string | null;

  /* 🛡️ Migration 051 — auto-touch timestamp (BEFORE UPDATE trigger).
     Anasayfa Hero görsel cache-bust kaynağı; admin save sonrası değişir →
     page.tsx heroCacheKey değişir → withCacheBust yeni `?ts=` üretir →
     browser / R2 storage CDN / Next/Image optimizer cache hepsi
     cache-miss eder. get_public_settings() RPC whitelist'inde (mig 051). */
  updated_at?: string | null;

  /* 🛡️ PHASE 10L / 10M — EN/DE çevirileri (migration 083 + 084,
     `settings_translations`). DB'de `settings` tablosunun BİR KOLONU
     DEĞİLDİR; `getPublicSettings()` bu alanı AYRI, dar bir sorgudan
     türetip payload'a ekler (`get_public_settings` RPC whitelist'i
     DEĞİŞTİRİLMEDİ).

     • Yalnız 3 alan taşır: footer_copyright, default_meta_title,
       default_meta_description. (Bakım mesajı çevirisi Phase 10M'de
       kapsamdan çıkarıldı; AŞAĞIDAKİ canonical `maintenance_message`
       alanı KORUNDU ve public bakım ekranı onu kullanmaya devam eder.)
     • `multilingual_enabled` KAPALIYKEN hiç doldurulmaz (undefined) —
       ek sorgu da atılmaz, TR davranışı BİREBİR aynı kalır.
     • Secret (resend_api_key / mail_from*) bu alana ASLA giremez:
       `settings_translations` tablosunda öyle bir kolon YOKTUR. */
  translations?: SettingsTranslationsByLocale | null;
};
