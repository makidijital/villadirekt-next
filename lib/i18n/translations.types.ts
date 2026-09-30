/* ===============================================================
   🛡️ TRANSLATION TYPES — PHASE 3 (Database Translation Architecture)
   ===============================================================
   migration 082'de oluşturulan 9 çeviri tablosunun TypeScript
   karşılıkları. `Locale` mevcut lib/i18n/config.ts'ten import
   edilir — burada yeniden tanımlanmaz (PHASE 1B ile tutarlılık).

   Bu dosya YALNIZ TİP + statik registry içerir; hiçbir DB çağrısı
   yapmaz, "server-only" GEREKTİRMEZ (client-safe). DB'ye dokunan
   generic repository ayrı bir dosyada: lib/db/translation.repository.server.ts.

   Bu fazda bu dosyayı/repository'yi HİÇBİR call-site KULLANMIYOR —
   yalnız gelecek fazlar (admin çeviri UI, public fallback rendering)
   için hazır, izole, test edilmiş bir temel.
   =============================================================== */

import type { Locale } from "./config";

/* ---------- Satır tipleri (migration 082 kolonlarıyla birebir) ---------- */

export type VillaTranslationRow = {
  id: string;
  villa_id: string;
  locale: Locale;
  /* 🛡️ `title` kolonu DB'de (migration 082) DURUYOR ancak koddan
     KULLANILMIYOR — villa adı özel isimdir, çevrilmez. Tipe dahil
     edilmemesi, yanlışlıkla yeniden okunmasını derleme zamanında
     engeller. */
  description: string | null;
  badge: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

/* 🛡️ PHASE 10I — `VillaLocationTranslationRow` KALDIRILDI.
   Bölge adları (Kalkan, Kaş, Fethiye, Çavdır …) ÖZEL İSİMDİR; EN/DE
   karşılıkları yoktur ve çevrilmez. `villa_location_translations`
   tablosu migration 082'de (commit 2014fc1) DURUYOR — migration
   geçmişi DEĞİŞTİRİLMEDİ — ancak koddan artık HİÇ okunmaz/yazılmaz.
   Tipin ve aşağıdaki entity kaydının kaldırılması, yanlışlıkla
   yeniden bağlanmasını DERLEME ZAMANINDA engeller (`villa.title`
   için Phase 10F'te uygulanan AYNI desen). */

export type VillaTypeTranslationRow = {
  id: string;
  type_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

export type VillaFeatureTranslationRow = {
  id: string;
  feature_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

/** ⚠️ Parent tablo `rule_items` (audit'teki "villa_rules" yanlıştı).
 *  Çevrilebilir kolon `title` (`name` DEĞİL). */
export type RuleItemTranslationRow = {
  id: string;
  rule_id: string;
  locale: Locale;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/** ⚠️ Çevrilebilir kolon `title` (`name` DEĞİL). */
export type PriceIncludeItemTranslationRow = {
  id: string;
  include_id: string;
  locale: Locale;
  title: string | null;
  created_at: string;
  updated_at: string;
};

/* 🛡️ `VillaDistanceTranslationRow` KALDIRILDI.
   Villa BAŞINA mesafe çevirisi girme özelliği kaldırıldı: mesafe
   başlıkları artık YALNIZ statik `distanceLabels` dictionary'sinden
   çözülür (`lib/distance-label.helper.ts`), canonical olmayan
   başlıklar aynen gösterilir. `villa_distances.title/distance` TR
   canonical veri olarak AYNEN kalır. `villa_distance_translations`
   tablosu migration 082'de DURUYOR (migration geçmişi DEĞİŞTİRİLMEDİ)
   ve migration 090 ile kaldırılır; koddan artık HİÇ okunmaz/yazılmaz.
   Tipin ve aşağıdaki entity kaydının kaldırılması, yanlışlıkla
   yeniden bağlanmasını DERLEME ZAMANINDA engeller (`villa_location`
   için Phase 10I'de uygulanan AYNI desen). */

export type BlogPostTranslationRow = {
  id: string;
  blog_post_id: string;
  locale: Locale;
  title: string | null;
  body: string | null;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

export type PageTranslationRow = {
  id: string;
  page_id: string;
  locale: Locale;
  title: string | null;
  body: string | null;
  excerpt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  /* 🛡️ MIGRATION 091 — `pages.sections` (JSONB) çevirisi. Canonical ile
     AYNI yapı: `PageSection[]` (richtext | image | quote). Tip burada
     BİLEREK `unknown`: DB'den gelen JSONB ham gelir ve TEK doğrulama
     noktası mevcut `parsePageSections` (lib/page-sections.ts) olmalıdır
     — `PageSection[]` diye tip iddia etmek doğrulanmamış veriyi
     doğrulanmış gibi gösterirdi. NULL / geçersiz / boş → public tarafta
     canonical TR bölümlerine düşülür (`resolveTranslatedSections`).

     OPSİYONEL — BİLİNÇLİ: repository `select("*")` ile okur; migration
     091 HENÜZ UYGULANMAMIŞSA dönen satırda bu anahtar HİÇ BULUNMAZ.
     `sections?: unknown` bu gerçeği modeller ve mevcut çağıranları/
     fixture'ları bozmaz; `resolveTranslatedSections` `undefined`'ı da
     canonical fallback'e çevirir (parse → [] → canonical). */
  sections?: unknown;
  created_at: string;
  updated_at: string;
};

export type FaqTranslationRow = {
  id: string;
  faq_id: string;
  locale: Locale;
  question: string | null;
  answer: string | null;
  created_at: string;
  updated_at: string;
};

/** 🛡️ MIGRATION 086 — dinamik menü etiketleri (`/maki-admin/menu`).
 *  Parent tablo `public.menu`; çevrilebilir TEK kolon `name`.
 *  ⚠️ `href` / `source_type` / `source_id` ÇEVRİLMEZ — menü linki
 *  canonical kalır, yalnız GÖRÜNEN ad locale'e göre çözülür. */
export type MenuTranslationRow = {
  id: string;
  menu_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

/** 🛡️ MIGRATION 088 — ödeme yöntemi adları (`/maki-admin/payment-methods`).
 *  Parent tablo `public.payment_methods`; çevrilebilir TEK kolon `name`.
 *  ⚠️ `type` / `is_active` ÇEVRİLMEZ (kod/flag alanı). Canonical
 *  `payment_methods.name` iş mantığında da okunur
 *  (`lib/payment-link.helper.ts > isWesternUnionMethod`) — bu yüzden
 *  ASLA çeviriyle ezilmez; yalnız GÖRÜNEN etiket çözülür. */
export type PaymentMethodTranslationRow = {
  id: string;
  payment_method_id: string;
  locale: Locale;
  name: string | null;
  created_at: string;
  updated_at: string;
};

/* ---------- Entity registry (repository'nin de kullandığı tek kaynak) ---------- */

export type TranslationEntity =
  | "villa"
  /* 🛡️ PHASE 10I — "villa_location" KALDIRILDI (bkz. yukarıdaki not). */
  | "villa_type"
  | "villa_feature"
  | "rule_item"
  | "price_include_item"
  /* 🛡️ "villa_distance" KALDIRILDI (bkz. yukarıdaki not). */
  | "blog_post"
  | "page"
  | "faq"
  /* 🛡️ MIGRATION 086 — migration 082'nin 9 tablosundan SONRA eklendi;
     şema (parent_id + locale + çevrilebilir alan) BİREBİR aynı. */
  | "menu"
  /* 🛡️ MIGRATION 088 — aynı şema; ödeme yöntemi etiketleri. */
  | "payment_method";

export type TranslationRowFor<E extends TranslationEntity> = E extends "villa"
  ? VillaTranslationRow
  : E extends "villa_type"
    ? VillaTypeTranslationRow
    : E extends "villa_feature"
      ? VillaFeatureTranslationRow
      : E extends "rule_item"
        ? RuleItemTranslationRow
          : E extends "price_include_item"
            ? PriceIncludeItemTranslationRow
            : E extends "blog_post"
              ? BlogPostTranslationRow
              : E extends "page"
                ? PageTranslationRow
                : E extends "faq"
                  ? FaqTranslationRow
                  : E extends "menu"
                    ? MenuTranslationRow
                    : E extends "payment_method"
                      ? PaymentMethodTranslationRow
                      : never;

export type TranslationEntityConfig = {
  /** migration 082 tablo adı. */
  table: string;
  /** Parent FK kolon adı (migration 082 ile birebir — bkz. proje
   *  konvansiyonu: villa_type_relations.type_id, villa_rule_relations
   *  → rule_id, villa_price_include_relations.include_id, vb.). */
  parentIdColumn: string;
};

/** migration 082'deki 9 tablonun TEK doğruluk kaynağı — hem
 *  lib/db/translation.repository.server.ts hem testler buradan okur.
 *  Yeni bir çeviri tablosu eklenirse yalnız burası + migration
 *  güncellenir. */
export const TRANSLATION_ENTITY_CONFIG: Record<
  TranslationEntity,
  TranslationEntityConfig
> = {
  villa: { table: "villa_translations", parentIdColumn: "villa_id" },
  villa_type: {
    table: "villa_type_translations",
    parentIdColumn: "type_id",
  },
  villa_feature: {
    table: "villa_feature_translations",
    parentIdColumn: "feature_id",
  },
  rule_item: {
    table: "rule_item_translations",
    parentIdColumn: "rule_id",
  },
  price_include_item: {
    table: "price_include_item_translations",
    parentIdColumn: "include_id",
  },
  /* 🛡️ MIGRATION 089 — blog yazısı içerik çevirileri. */
  blog_post: {
    table: "blog_post_translations",
    parentIdColumn: "blog_post_id",
  },
  page: { table: "page_translations", parentIdColumn: "page_id" },
  faq: { table: "faq_translations", parentIdColumn: "faq_id" },
  /* 🛡️ MIGRATION 086 — dinamik menü etiketleri. */
  menu: { table: "menu_translations", parentIdColumn: "menu_id" },
  /* 🛡️ MIGRATION 088 — ödeme yöntemi etiketleri. */
  payment_method: {
    table: "payment_method_translations",
    parentIdColumn: "payment_method_id",
  },
};
