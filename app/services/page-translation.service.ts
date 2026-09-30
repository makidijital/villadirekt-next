import { translationRepository } from "@/lib/db/translation.repository.server";
import { pagesServerRepository } from "@/lib/db/pages.repository.server";
import type { PageTranslationRow } from "@/lib/i18n/translations.types";
/* 🛡️ MIGRATION 091 — bölüm çevirisi için TEK doğrulama noktası.
   Canonical tarafın ZATEN kullandığı defansif parser REUSE edilir;
   yeni bir section şeması/DSL'i İCAT EDİLMEDİ. */
import { parsePageSections, type PageSection } from "@/lib/page-sections";

/**
 * 🛡️ PHASE 12C — Admin Sayfa (pages) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen — aynı gerekçeler:
 *   - çok alanlı entity (villa: description/badge/seo_*, page:
 *     title/excerpt/body/seo_*),
 *   - parent existence pre-check VAR (`pagesServerRepository.findById`,
 *     villa'daki `findSlugById` muadili),
 *   - TÜM iş kuralı doğrulaması BURADA (repository yalnız DB
 *     primitive'i — bkz. translation.repository.server.ts `upsertOne`).
 *
 * Çevrilen kolonlar `page_translations` tablosuyla BİREBİR:
 * title, body, excerpt, seo_title, seo_description (migration 082)
 * + sections (migration 091).
 * ⚠️ `slug` ÇEVRİLMEZ — tabloda kolonu YOKTUR (URL her locale'de
 * canonical `pages.slug` taşır).
 *
 * 🛡️ MIGRATION 091 — `sections` GERİYE DÖNÜK UYUMLU:
 *   `input.sections` VERİLMEZSE (`undefined`) upsert payload'ına HİÇ
 *   eklenmez → mevcut çağıranların ürettiği payload BİREBİR aynı kalır
 *   ve kayıtlı bölüm çevirisi UPDATE'te korunur. `null` geçilirse
 *   bölüm çevirisi bilinçli olarak TEMİZLENİR (public taraf canonical
 *   TR bölümlerine düşer).
 *
 * TR bu servisten YAZILAMAZ (locale whitelist "en" | "de"). Boş
 * bırakılan alanlar `null` yazılır → public tarafta TR'ye fallback.
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

/* Limitler: SEO alanları proje genelindeki değerlerle AYNI
   (villa-translation.service.ts / SeoStep.tsx: 120 / 300).
   title 200 → TypeTranslationsPanel `maxLength={200}` ile aynı.
   excerpt 300, body 20000 → CMS sayfa gövdesi villa açıklamasından
   (5000) uzun olabildiği için daha geniş, ancak sınırsız DEĞİL. */
const MAX_TITLE_LEN = 200;
const MAX_EXCERPT_LEN = 300;
const MAX_BODY_LEN = 20000;
const MAX_SEO_TITLE_LEN = 120;
const MAX_SEO_DESCRIPTION_LEN = 300;
/* Bölüm dizisi serileştirilmiş JSON uzunluk tavanı. Gövde tavanının
   (20000) 2 katı: bir CMS sayfası birden çok richtext bölümü
   taşıyabilir, ancak sınırsız DEĞİL (canonical tarafta da pratikte
   aynı büyüklük sınıfı geçerli). */
const MAX_SECTIONS_JSON_LEN = 40000;

export const PAGE_TRANSLATION_MAX_LEN = {
  title: MAX_TITLE_LEN,
  excerpt: MAX_EXCERPT_LEN,
  body: MAX_BODY_LEN,
  seoTitle: MAX_SEO_TITLE_LEN,
  seoDescription: MAX_SEO_DESCRIPTION_LEN,
  sectionsJson: MAX_SECTIONS_JSON_LEN,
} as const;

export type PageTranslationInput = {
  pageId: string;
  locale: string;
  title?: string | null;
  excerpt?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** 🛡️ MIGRATION 091 — `PageSection[]` (ham). `undefined` → kolona
   *  HİÇ dokunulmaz; `null`/geçersiz/boş → çeviri temizlenir (NULL). */
  sections?: unknown;
};

export type PageTranslationResult =
  | { ok: true; row: PageTranslationRow }
  | { ok: false; error: string };

export type PageTranslationsListResult =
  | { ok: true; rows: PageTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 🛡️ MIGRATION 091 — bölüm dizisinin `normalize()` karşılığı.
 * `parsePageSections` ile SANITIZE eder (bilinmeyen type / eksik alan
 * düşer), geçerli bölüm kalmazsa `null` döner → public taraf canonical
 * TR bölümlerine fallback yapar. DB'ye yalnız doğrulanmış, canonical
 * ile AYNI yapıdaki bir dizi yazılır.
 */
function normalizeSections(value: unknown): PageSection[] | null {
  const parsed = parsePageSections(value);
  return parsed.length > 0 ? parsed : null;
}

export async function getPageTranslations(
  pageId: string
): Promise<PageTranslationsListResult> {
  const id = (pageId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz sayfa" };

  const { data, error } = await translationRepository.findAllForParent(
    "page",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertPageTranslation(
  input: PageTranslationInput
): Promise<PageTranslationResult> {
  const pageId = (input.pageId ?? "").toString().trim();
  if (!pageId) return { ok: false, error: "Geçersiz sayfa" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (title && title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Başlık ${MAX_TITLE_LEN} karakteri geçemez` };
  }

  const excerpt = normalize(input.excerpt);
  if (excerpt && excerpt.length > MAX_EXCERPT_LEN) {
    return {
      ok: false,
      error: `Kısa açıklama ${MAX_EXCERPT_LEN} karakteri geçemez`,
    };
  }

  const body = normalize(input.body);
  if (body && body.length > MAX_BODY_LEN) {
    return { ok: false, error: `İçerik ${MAX_BODY_LEN} karakteri geçemez` };
  }

  const seoTitle = normalize(input.seoTitle);
  if (seoTitle && seoTitle.length > MAX_SEO_TITLE_LEN) {
    return {
      ok: false,
      error: `SEO başlık ${MAX_SEO_TITLE_LEN} karakteri geçemez`,
    };
  }

  const seoDescription = normalize(input.seoDescription);
  if (seoDescription && seoDescription.length > MAX_SEO_DESCRIPTION_LEN) {
    return {
      ok: false,
      error: `SEO açıklama ${MAX_SEO_DESCRIPTION_LEN} karakteri geçemez`,
    };
  }

  /* 🛡️ MIGRATION 091 — bölümler. `undefined` ise bu alan payload'a HİÇ
     girmez (aşağıda), böylece mevcut çağıranların davranışı ve kayıtlı
     bölüm çevirisi korunur. */
  const sectionsProvided = input.sections !== undefined;
  const sections = sectionsProvided ? normalizeSections(input.sections) : null;
  if (sections && JSON.stringify(sections).length > MAX_SECTIONS_JSON_LEN) {
    return {
      ok: false,
      error: `Bölümler ${MAX_SECTIONS_JSON_LEN} karakteri geçemez`,
    };
  }

  /* Parent existence pre-check — villa servisindeki `findSlugById`
     ile AYNI rol: FK hatasını generic mesaja çevirmek yerine erken,
     anlaşılır hata döner. Mevcut repository fonksiyonu REUSE edildi. */
  const { data: pageRow, error: pageError } =
    await pagesServerRepository.findById(pageId);
  if (pageError) return { ok: false, error: "Sayfa doğrulanamadı" };
  if (!pageRow) return { ok: false, error: "Sayfa bulunamadı" };

  const { data, error } = await translationRepository.upsertOne(
    "page",
    pageId,
    locale,
    {
      title,
      excerpt,
      body,
      seo_title: seoTitle,
      seo_description: seoDescription,
      /* `sections` verilmediyse ANAHTAR HİÇ EKLENMEZ — payload mevcut
         çağıranlar için BİREBİR eskisi gibi kalır. */
      ...(sectionsProvided ? { sections } : {}),
    }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
