import "server-only";

import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import {
  getTranslation,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
/* 🛡️ MIGRATION 091 — bölüm (sections) çevirisinin GEÇERLİLİK kapısı.
   Yeni bir parser/DSL yazılmadı; canonical tarafın ZATEN kullandığı
   defansif parser REUSE edilir (tek doğrulama noktası). */
import { parsePageSections } from "@/lib/page-sections";

/* ===============================================================
   🛡️ PHASE 12D — CMS SAYFA (pages) ÇEVİRİ OKUMA KATMANI
   ===============================================================
   `lib/i18n/get-faq-translations.server.ts` (Phase 11) ile AYNI
   desen: MEVCUT generic okuma katmanının (`getTranslation` +
   `resolveTranslatedField`, Phase 5) üzerine, tek bir entity için
   ince bir "çöz ve fallback'le" sarmalayıcısı. Yeni repository,
   yeni tablo, yeni cache YOK.

   TR KISAYOLU: `locale === "tr"` (veya geçersiz bir değer →
   `toLocale` ile TR'ye düşer) ise `page_translations` tablosuna
   HİÇ SORGU ATILMAZ; canonical değerler aynen döner. Mevcut TR
   `/p/[slug]` davranışına SIFIR ek DB maliyeti.

   FALLBACK: Alan bazında. Çeviri satırı olsa bile boş/NULL bir
   kolon canonical TR değerine düşer (`resolveTranslatedField`
   semantiği, migration 082'de tüm çevrilebilir kolonlar nullable).
   Çeviri satırı hiç yoksa TÜM alanlar TR'ye düşer — ancak URL
   (`/en/p/...`) korunur.

   KAPSAM: `page_translations` kolonlarıyla BİREBİR —
   title · excerpt · body · seo_title · seo_description (migration 082)
   + sections (migration 091).
   `slug` ÇEVRİLMEZ — URL her locale'de canonical `pages.slug` taşır
   (tabloda kolonu YOKTUR).

   🛡️ MIGRATION 091 — `sections` FALLBACK'İ NEDEN AYRI:
   `resolveTranslatedField` STRING içindir (`.trim()` ile "dolu mu"
   kararı verir); `sections` bir JSONB DİZİSİDİR. Bu yüzden AYNI
   ilkenin dizi karşılığı olan küçük, izole bir helper kullanılır:
   `resolveTranslatedSections`. Yeni bir çeviri sistemi, yeni bir
   section DSL'i veya ikinci bir resolver katmanı OLUŞTURULMADI.
   =============================================================== */

/** `pages` satırından okunan canonical (TR) alanlar. Alan adları DB
 *  kolonlarıyla birebir; `content` mevcut defansif body/content
 *  drift fix'i için (bkz. app/p/[slug]/page.tsx). */
export type PageCanonicalContent = {
  id?: string | null;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  content?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  /** 🛡️ MIGRATION 091 — canonical `pages.sections` (JSONB, ham). */
  sections?: unknown;
};

export type ResolvedPageContent = {
  title: string | null;
  excerpt: string | null;
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  /** 🛡️ MIGRATION 091 — locale'e göre çözülmüş bölümler (HAM JSONB).
   *  Tüketici taraf (`CmsPageBody`) bunu BUGÜNKÜ gibi
   *  `parsePageSections` ile parse eder — render yolu DEĞİŞMEDİ. */
  sections: unknown;
};

/**
 * 🛡️ MIGRATION 091 — `sections` için alan bazlı fallback'in dizi
 * karşılığı. `resolveTranslatedField` ile AYNI ilke:
 *
 *   "çeviri değeri ANLAMLI DOLU ise onu, değilse canonical'ı döndür"
 *
 * String'de "anlamlı dolu" = `.trim() !== ""`; bir bölüm dizisinde
 * ise = "defansif parse'tan EN AZ BİR geçerli bölüm çıkıyor". Böylece
 * `null`, `undefined`, `[]`, dizi olmayan bir değer veya yalnız
 * bozuk/bilinmeyen tipli bölümler içeren bir çeviri SESSİZCE canonical
 * TR bölümlerine düşer — EN/DE sayfa asla bölümsüz kalmaz.
 *
 * Saf (pure) — DB'ye dokunmaz, throw etmez, canonical değeri HİÇ
 * değiştirmez (ham JSONB olduğu gibi geri döner; parse sorumluluğu
 * bugünkü gibi render tarafındadır).
 */
export function resolveTranslatedSections(
  translatedSections: unknown,
  canonicalSections: unknown
): unknown {
  if (parsePageSections(translatedSections).length > 0) {
    return translatedSections;
  }
  return canonicalSections;
}

function canonicalBody(page: PageCanonicalContent): string | null {
  return page.body ?? page.content ?? null;
}

function canonicalContent(page: PageCanonicalContent): ResolvedPageContent {
  return {
    title: page.title ?? null,
    excerpt: page.excerpt ?? null,
    body: canonicalBody(page),
    seoTitle: page.seo_title ?? null,
    seoDescription: page.seo_description ?? null,
    sections: page.sections ?? null,
  };
}

/**
 * Bir `pages` satırını + hedef locale'i alır, public tarafta
 * gösterilecek NİHAİ metinleri döner.
 *
 * - TR (veya geçersiz locale) → canonical değerler, sorgu YOK.
 * - `page.id` yoksa → canonical değerler, sorgu YOK (savunmacı).
 * - Çeviri okunamazsa (`getTranslation` hata halinde `null` döner,
 *   asla throw etmez) → canonical değerler. Public render bir
 *   çeviri okuma sorunuyla ASLA çökmez.
 */
export async function resolvePageContent(
  page: PageCanonicalContent | null | undefined,
  locale: Locale
): Promise<ResolvedPageContent> {
  if (!page) {
    return {
      title: null,
      excerpt: null,
      body: null,
      seoTitle: null,
      seoDescription: null,
      sections: null,
    };
  }

  const resolvedLocale = toLocale(locale);
  const canonical = canonicalContent(page);

  if (resolvedLocale === DEFAULT_LOCALE) return canonical;

  const pageId = (page.id ?? "").toString().trim();
  if (!pageId) return canonical;

  const row = await getTranslation("page", pageId, resolvedLocale);
  if (!row) return canonical;

  return {
    title: resolveTranslatedField(row.title, canonical.title),
    excerpt: resolveTranslatedField(row.excerpt, canonical.excerpt),
    body: resolveTranslatedField(row.body, canonical.body),
    seoTitle: resolveTranslatedField(row.seo_title, canonical.seoTitle),
    seoDescription: resolveTranslatedField(
      row.seo_description,
      canonical.seoDescription
    ),
    /* 🛡️ MIGRATION 091 — AYNI çeviri satırından okunur; EK SORGU YOK
       (`getTranslation` zaten `select("*")` ile tüm kolonları getirir). */
    sections: resolveTranslatedSections(row.sections, canonical.sections),
  };
}
