import type { Metadata } from "next";
import type { ArchiveSearchParams } from "@/app/components/search/KiralikVillalarPageBody";
import TaxonomyLandingPageBody, {
  buildTaxonomyLandingMetadata,
} from "@/app/components/search/TaxonomyLandingPageBody";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/villa-turleri/[slug] — SEO LANDING (kategori, DE)
   ===============================================================
   Gövde + metadata `TaxonomyLandingPageBody`'de (TR/EN/DE ortak).
   Slug DB'den çözülür (admin'in eklediği kayıt deploy'suz çalışır);
   geçersiz slug / UUID → 404. Liste mevcut arşiv gövdesi;
   filtreler mevcut /arama'ya yönlenir.
   =============================================================== */

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: ArchiveSearchParams;
}): Promise<Metadata> {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  const { slug } = await params;
  return buildTaxonomyLandingMetadata("category", slug, "de", searchParams);
}

export default async function CategoryDeLandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: ArchiveSearchParams;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  const { slug } = await params;
  return (
    <TaxonomyLandingPageBody
      kind="category"
      slug={slug}
      locale="de"
      searchParams={searchParams}
    />
  );
}
