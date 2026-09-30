import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getPageBySlug } from "@/app/services/page.service";
import { resolvePageContent } from "@/lib/i18n/get-page-translation.server";
import CmsPageBody from "@/app/components/cms/CmsPageBody";
import { buildCmsPageMetadata } from "@/app/components/cms/cms-page-metadata";
import { getCmsPageAssetVersions } from "@/app/components/cms/cms-asset-versions.server";

/* ===============================================================
   🛡️ /en/p/[slug] — CMS SAYFASI (EN) — PHASE 12D
   ===============================================================
   `app/(public)/en/page.tsx` (Phase 11) ile AYNI iskelet:
     • `setRequestLocale("en")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (mevcut production davranışı).
     • TR ile AYNI gövde (`CmsPageBody`) — ayrı bir kopya YOK,
       yalnız `locale` ve çözülmüş metin prop'ları farklı.

   SLUG ÇEVRİLMEZ: URL her locale'de canonical `pages.slug` taşır
   (`/p/x` · `/en/p/x` · `/de/p/x`).

   FALLBACK: `resolvePageContent` alan bazında çalışır — EN
   çevirisi yoksa (veya bir kolonu boşsa) o alan TR canonical
   değerine düşer; URL yine `/en/p/...` kalır.

   404: TR sayfasının kendine özgü inline 404 bloğu TÜRKÇEDİR ve
   DEĞİŞTİRİLMEDİ; burada projenin standart `notFound()` yolu
   kullanılır (aynı dosyadaki `requirePublicLocaleEnabled` da aynı
   mekanizmayı kullanır) — böylece EN/DE'de Türkçe bir 404 metni
   gösterilmez ve yeni bir tasarım/dictionary key İCAT EDİLMEZ.
   =============================================================== */

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildCmsPageMetadata(slug, "en");
}

export default async function EnCmsPage({ params }: Props) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const resolved = await resolvePageContent(page, "en");
  /* 🛡️ Görsel `?v=` versiyonları (R2 ETag; path aynı). */
  const assetVersions = await getCmsPageAssetVersions(page, resolved.sections);

  return (
    <CmsPageBody
      locale="en"
      slug={slug}
      page={page}
      title={resolved.title}
      resolvedExcerpt={resolved.excerpt}
      body={resolved.body}
      /* 🛡️ MIGRATION 091 — bölümler de locale-aware çözülür; çeviri
         yoksa `resolveTranslatedSections` canonical TR bölümlerine
         düşer. EK SORGU YOK: aynı `resolvePageContent` çağrısı. */
      resolvedSections={resolved.sections}
      assetVersions={assetVersions}
    />
  );
}
