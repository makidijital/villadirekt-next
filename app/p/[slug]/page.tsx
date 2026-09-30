import type { Metadata } from "next";
import Link from "next/link";

import { getPageBySlug } from "@/app/services/page.service";
import { resolvePageContent } from "@/lib/i18n/get-page-translation.server";
import CmsPageBody from "@/app/components/cms/CmsPageBody";
import { buildCmsPageMetadata } from "@/app/components/cms/cms-page-metadata";
import { getCmsPageAssetVersions } from "@/app/components/cms/cms-asset-versions.server";

/* ===============================================================
   🛡️ /p/[slug] — PREMIUM EDITORIAL CMS PAGE (TR)
   ===============================================================
   PHASE 12D: Sayfa gövdesi `app/components/cms/CmsPageBody.tsx`'e,
   SEO metadata'sı `app/components/cms/cms-page-metadata.ts`'e
   TAŞINDI (DOM/CSS DEĞİŞTİRİLMEDEN) — `/en/p/[slug]` ve
   `/de/p/[slug]` AYNI gövdeyi render eder. Bu dosya artık yalnız
   TR giriş noktası: veri okur, `locale="tr"` ile gövdeyi çağırır.

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/p/[slug]` aynı.
     • `locale="tr"` → `resolvePageContent` `page_translations`'a
       HİÇ SORGU ATMAZ, canonical değerler döner.
     • Aşağıdaki 404 bloğu BİREBİR korundu (EN/DE `notFound()`
       kullanır — bkz. ilgili route dosyaları).

   Body/content drift fix `resolvePageContent` içine taşındı
   (`body ?? content`), davranış aynı.
   =============================================================== */

type Props = {
  params: Promise<{ slug: string }>;
};

/* ---------------- SEO METADATA ---------------- */
export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildCmsPageMetadata(slug, "tr");
}

/* ---------------- PAGE RENDER ---------------- */
export default async function CmsPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);

  if (!page) {
    return (
      <section className="px-5 md:px-10 lg:px-16 py-32 md:py-44">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
            404
          </p>
          <h1 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
            Sayfa bulunamadı.
          </h1>
          <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed">
            Aradığın sayfa kaldırılmış veya taşınmış olabilir.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 mt-10 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-champagne-700)] transition-colors"
          >
            Ana sayfaya dön <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }

  const resolved = await resolvePageContent(page, "tr");
  /* 🛡️ Görsel `?v=` versiyonları (R2 ETag; path aynı). */
  const assetVersions = await getCmsPageAssetVersions(page, resolved.sections);

  return (
    <CmsPageBody
      locale="tr"
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
