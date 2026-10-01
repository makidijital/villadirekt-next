import Image from "next/image";
import Link from "next/link";

import { getPageCoverPublicUrl } from "@/lib/storage.helpers";
import { versionedAssetUrl, versionFor } from "@/lib/storage/site-asset-version";
import { parsePageSections } from "@/lib/page-sections";
import PageSectionRenderer from "@/app/components/cms/PageSectionRenderer";
import PageHero from "@/app/components/ui/PageHero";
import {
  JsonLd,
  buildBreadcrumb,
} from "@/app/components/seo/StructuredData";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
/* 🛡️ PHASE 12E — statik UI metinleri MEVCUT public dictionary'den.
   `getDictionary` saf/senkron statik lookup (Phase 2); yeni provider/
   context/fallback mekanizması EKLENMEDİ. CMS'in ASIL içeriği
   (title/excerpt/body/seo_*) bu sözlükten GELMEZ — o `page_translations`
   üzerinden `resolvePageContent` ile çözülür (Phase 12D). */
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import type { Dictionary } from "@/lib/i18n/dictionaries/types";

type CmsDictionary = Dictionary["cms"];

/* ===============================================================
   🛡️ PHASE 12D — /p/[slug] ORTAK GÖVDE (TR / EN / DE)
   ===============================================================
   `app/components/home/HomePageBody.tsx` (Phase 11) ve
   `app/components/villa/VellaDetailBody` (Phase 10G) ile AYNI desen:
   TR sayfasının gövdesi DOM/CSS DEĞİŞTİRİLMEDEN buraya taşındı; üç
   locale de AYNI component'i render eder, yalnız `locale` ve
   ÇÖZÜLMÜŞ metin prop'ları farklıdır.

   TASARIM DEĞİŞMEDİ: JSX, className'ler, hero kararı, section
   renderer, prose tipografisi, responsive davranış BİREBİR aynı.

   ⚠️ ÇEVRİLMEYENLER (bilinçli, migration 082 ile uyumlu):
     • `slug` — URL her locale'de canonical `pages.slug`.
     • `sections` içindeki `image.path` — ASSET yoludur, her locale'de
       AYNI görsel gösterilir (çevrilmez).
     🛡️ MIGRATION 091 GÜNCELLEMESİ: `sections`'ın KULLANICIYA GÖRÜNEN
     metinleri (richtext.content · image.alt · quote.text/author) ARTIK
     ÇEVRİLİR — `page_translations.sections` + `resolveTranslatedSections`
     (çeviri yoksa/geçersizse canonical TR bölümlerine düşer).
     • Hero rozeti / eyebrow / "Kurumsal" kararı — anahtar kelime
       eşleşmesi TÜRKÇE metne bağlı olduğundan HER ZAMAN canonical
       `page.title` üzerinden hesaplanır (Phase 10G'deki
       `getDistanceIconKey` ile AYNI ilke). Aksi halde EN/DE
       sayfalarda kurumsal hero kaybolurdu.
     • 🛡️ PHASE 12E GÜNCELLEMESİ: statik arayüz metinleri (breadcrumb,
       eyebrow, hero rozeti, boş içerik durumu) ARTIK TR sabit DEĞİL —
       mevcut public dictionary'nin `cms` namespace'inden, aynı
       `locale` prop'u üzerinden çözülür. CMS'in ASIL içeriği
       (title/excerpt/body/seo_*) yine `page_translations`'tan gelir;
       iki kaynak birbirinden bağımsızdır.
   =============================================================== */

/* ---------------------------------------------------------------
   CMS içerik rozeti — slug/başlık anahtar kelimesine göre sağ
   karttaki etiketi içerik tipine uyarlar (kod tekrarı yok, tek
   PageHero component'i; yalnız prop değişir).
   --------------------------------------------------------------- */
/* Hakkımızda + politika/şart CMS sayfaları (slug ASCII olduğundan
   Türkçe büyük-harf toLowerCase sorunu slug üzerinden bypass edilir). */
const CMS_ABOUT_RE = /hakk|about|biz kim|kurumsal kimlik/;
const CMS_POLICY_RE =
  /gizlilik|kvkk|cerez|çerez|mesafeli|sozlesme|sözleşme|sart|şart|politika|policy|iade|teslimat|kosul|koşul|iptal|kullanim|kullanım/;

function getCmsBadge(
  slug: string,
  title: string | null | undefined,
  dict: CmsDictionary
): { eyebrow?: string; lines: string[] } {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  /* Hakkımızda: sağ badge render edilmez (lines boş). Üst eyebrow
     "Kurumsal" getCorporateEyebrow'dan gelir. */
  if (CMS_ABOUT_RE.test(key)) {
    return { lines: [] };
  }
  if (/sss|faq|sik sorul|sık sorul|yardim|yardım/.test(key)) {
    return { eyebrow: dict.badgeHelpEyebrow, lines: [dict.badgeFaq] };
  }
  /* Politika & şart sayfaları: badge yalnız "Politika & Şartlar";
     üst eyebrow "Kurumsal" getCorporateEyebrow'dan gelir. */
  if (CMS_POLICY_RE.test(key)) {
    return { lines: [dict.badgePolicy] };
  }
  /* Diğer kurumsal/CMS PageHero sayfaları: badge yok. "Bilgilendirme"
     artık kullanılmaz; üst eyebrow "Kurumsal" getCorporateEyebrow'dan. */
  return { lines: [] };
}

/* SSS hariç kurumsal CMS sayfalarının tümü. */
const CMS_SSS_RE = /sss|faq|sik sorul|sık sorul|yardim|yardım/;

/* Küçük mavi üst eyebrow — SSS dışındaki tüm kurumsal CMS sayfalarında
   her zaman "Kurumsal". Yalnız SSS mevcut hâliyle kalır (undefined). */
function getCorporateEyebrow(
  slug: string,
  title: string | null | undefined,
  dict: CmsDictionary
): string | undefined {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  return CMS_SSS_RE.test(key) ? undefined : dict.eyebrowCorporate;
}

/* Kurumsal/yasal/bilgilendirme sayfaları (Hakkımızda, SSS, KVKK,
   Gizlilik, Mesafeli, Sözleşme/Şartlar, Çerez/İade/Teslimat) —
   kapak görseli OLSA BİLE her zaman premium PageHero kullanır.
   Gerçek makale/içerik (cover'lı) sayfalar editorial cover hero'da
   kalır. */
function isCorporatePage(
  slug: string,
  title: string | null | undefined
): boolean {
  const key = `${slug} ${title ?? ""}`.toLowerCase();
  return /hakk|about|biz kim|kurumsal|sss|faq|sik sorul|sık sorul|yardim|yardım|gizlilik|kvkk|cerez|çerez|mesafeli|sozlesme|sözleşme|sart|şart|politika|policy|iade|teslimat|kosul|koşul/.test(
    key
  );
}

export type CmsPageBodyPage = {
  title?: string | null;
  cover_image?: string | null;
  sections?: unknown;
};

type Props = {
  locale: Locale;
  slug: string;
  /** Canonical (TR) `pages` satırı — cover/sections/anahtar kelime. */
  page: CmsPageBodyPage;
  /** `resolvePageContent` ile çözülmüş, locale-aware başlık. */
  title: string | null;
  /** `resolvePageContent` ile çözülmüş, locale-aware excerpt. */
  resolvedExcerpt: string | null;
  /** `resolvePageContent` ile çözülmüş, locale-aware gövde. */
  body: string | null;
  /** 🛡️ MIGRATION 091 — `resolvePageContent` ile çözülmüş, locale-aware
   *  bölümler (HAM JSONB; parse aşağıda BUGÜNKÜ gibi yapılır).
   *  Verilmezse canonical `page.sections` kullanılır → bu prop'u
   *  geçmeyen mevcut çağıranların davranışı BİREBİR korunur. */
  resolvedSections?: unknown;
  /** 🛡️ Görsel URL versiyonları (`{ [path]: R2 ETag }`) — kapak ve
   *  bölüm görsellerine `?v=` eklenir; R2 path'i DEĞİŞMEZ. Verilmezse
   *  URL'ler BUGÜNKÜ gibi versiyonsuz (geriye uyumlu). */
  assetVersions?: Readonly<Record<string, string>>;
};

export default function CmsPageBody({
  locale,
  slug,
  page,
  title,
  resolvedExcerpt,
  body,
  resolvedSections,
  assetVersions,
}: Props) {
  /* 🛡️ PHASE 12E — statik arayüz metinleri. `locale` prop'u zaten
     mevcut (Phase 12D); yeni bir locale kaynağı EKLENMEDİ. */
  const dict = getDictionary(locale).cms;

  /* 🛡️ PHASE 12D — body/excerpt/title ARTIK locale-aware çözülmüş
     olarak prop ile gelir (`resolvePageContent`). Mevcut defansif
     body/content drift fix'i o helper'ın içine TAŞINDI. */
  const excerpt = (resolvedExcerpt ?? "").trim();

  const coverPath = (page as { cover_image?: string | null }).cover_image;
  const coverUrl = versionedAssetUrl(
    getPageCoverPublicUrl(coverPath),
    assetVersions,
    coverPath
  );

  /* HERO KARARI:
       - Kurumsal/yasal/bilgilendirme sayfaları → her zaman PageHero
         (cover_image olsa bile; talep gereği premium band).
       - Cover'lı gerçek içerik/makale sayfaları → editorial cover hero.
       - Cover'sız diğer sayfalar → PageHero. */
  const corporate = isCorporatePage(slug, page.title);
  const usePageHero = corporate || !coverUrl;

  /* Sections: JSONB defansif parse — geçersiz veriler düşer.
     🛡️ MIGRATION 091 — kaynak artık locale-aware: `resolvedSections`
     (`resolvePageContent` → `resolveTranslatedSections`) verilmişse o,
     verilmemişse BUGÜNKÜ gibi canonical `page.sections`. Parse, render
     ve `hasSections` mantığı DEĞİŞMEDİ; bu bileşen hâlâ SAF ve
     senkrondur — içinde DB sorgusu YOKTUR (veri erişimi route/service
     katmanında kalır). */
  const sections = parsePageSections(
    resolvedSections !== undefined
      ? resolvedSections
      : (page as { sections?: unknown }).sections
  );
  const hasSections = sections.length > 0;
  const hasBody =
    typeof body === "string" && body.trim().length > 0;

  /* CMS içerik rozeti + eyebrow. lines boşsa (yalnız Hakkımızda) badge
     render edilmez ve eyebrow üstteki PageHero eyebrow'una taşınır. */
  const cmsBadge = getCmsBadge(slug, page.title, dict);
  const heroEyebrow = getCorporateEyebrow(slug, page.title, dict);

  /* SEO: BreadcrumbList JSON-LD */
  /* 🛡️ `locale` yalnız JSON-LD `inLanguage` için geçilir ve TR'de
     BİLİNÇLİ olarak `undefined` bırakılır → TR çıktısı Phase 12D
     öncesiyle BYTE-IDENTICAL kalır (bkz. buildBreadcrumb, Phase 7D:
     "verilmezse davranış öncekiyle AYNI"). */
  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dict.breadcrumbHome, url: "/" },
      { name: title || dict.fallbackTitle },
    ],
    locale === DEFAULT_LOCALE ? undefined : locale
  );

  return (
    <article className="bg-white">
      <JsonLd data={breadcrumbLd} />

      {/* ============================================================
          HERO
          - usePageHero=false (cover'lı gerçek içerik sayfası):
            mevcut editorial hero + cover (DOKUNULMADI)
          - usePageHero=true (kurumsal/yasal VEYA cover'sız):
            paylaşılan premium PageHero (içerik rozeti)
          ============================================================ */}
      {!usePageHero ? (
        <section className="px-5 md:px-10 lg:px-16 pt-32 md:pt-44 pb-12 md:pb-20">
          <div className="max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase font-medium text-[var(--color-stone-500)] mb-6"
            >
              <Link
                href={localeHref("/", locale)}
                className="hover:text-[var(--color-champagne-700)] transition-colors"
              >
                {dict.breadcrumbHome}
              </Link>
              <span aria-hidden="true">·</span>
              <span className="text-[var(--color-stone-700)]">{title}</span>
            </nav>

            {/* Eyebrow */}
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
              {dict.eyebrowContent}
            </p>

            {/* Title — premium serif */}
            <h1 className="font-display text-[40px] md:text-[64px] lg:text-[80px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.035em]">
              {title}
            </h1>

            {/* Excerpt */}
            {excerpt && (
              <p className="text-[17px] md:text-[20px] leading-[1.55] text-[var(--color-stone-500)] mt-8 max-w-2xl">
                {excerpt}
              </p>
            )}
          </div>

          {/* Cover image — full-width premium */}
          <div className="max-w-6xl mx-auto mt-12 md:mt-16">
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-[var(--color-sand-50)]">
              <Image
                src={coverUrl as string}
                alt={title || ""}
                fill
                priority
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1100px"
                className="object-cover object-center"
              />
            </div>
          </div>
        </section>
      ) : (
        <PageHero
          breadcrumb={[
            { name: dict.breadcrumbHome, href: localeHref("/", locale) },
            { name: title || dict.fallbackTitle },
          ]}
          eyebrow={heroEyebrow}
          title={title || dict.fallbackTitle}
          description={excerpt || undefined}
          badge={cmsBadge}
        />
      )}

      {/* ============================================================
          CONTENT CONTAINER — prose typography
          ============================================================ */}
      <section
        className={
          "px-5 md:px-10 lg:px-16 pb-32 md:pb-44 " +
          (usePageHero ? "pt-12 md:pt-16" : "")
        }
      >
        {/* 🛡️ Content container — kurumsal/longform editorial genişlik.
           KVKK / sözleşme / hakkımızda gibi sayfalar dar "blog kolon"
           hissi vermesin diye 1100px'e çıkarıldı. Bu değer aynı
           sayfanın HERO cover'ı (`max-w-[1100px]`, yukarıda) ile
           BİREBİR aynı → desktop'ta cover ile body kenarları visual
           olarak hizalanır (modern premium kurumsal düzen).

           Responsive davranış:
             • mobil <768px      → viewport - px-5 (40px) padding aktif;
                                    1100px sınırı devre dışı (no-op)
             • tablet 768–1024   → md:px-10 (80px) padding aktif; 1100px
                                    yine devre dışı
             • laptop 1024–1280  → lg:px-16 (128px) padding kontrol;
                                    içerik ~896-1152px arasında
             • desktop >=1280px  → 1100px sınır aktif, mx-auto ile ortalı

           Hero (max-w-3xl), navbar, footer, typography, leading,
           font-size DOKUNULMADI. */}
        <div className="max-w-6xl mx-auto space-y-12 md:space-y-16">
          {/* Sections varsa render, yoksa body fallback */}
          {hasSections ? (
            sections.map((s, idx) => (
              <PageSectionRenderer
                key={idx}
                section={s}
                version={
                  s.type === "image" ? versionFor(assetVersions, s.path) : undefined
                }
              />
            ))
          ) : hasBody ? (
            <div className="space-y-5">
              {body!
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p
                    key={i}
                    className="text-[16px] md:text-[17px] leading-[1.8] text-[var(--color-stone-700)] whitespace-pre-line"
                  >
                    {p}
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-[var(--color-stone-400)] italic text-center">
              {dict.contentComingSoon}
            </p>
          )}
        </div>
      </section>
    </article>
  );
}
