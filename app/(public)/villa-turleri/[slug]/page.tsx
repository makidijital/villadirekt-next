import type { Metadata } from "next";
import type { ArchiveSearchParams } from "@/app/components/search/KiralikVillalarPageBody";
import TaxonomyLandingPageBody, {
  buildTaxonomyLandingMetadata,
} from "@/app/components/search/TaxonomyLandingPageBody";

/* ===============================================================
   🛡️ /villa-turleri/[slug] — SEO LANDING (kategori, TR)
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
  const { slug } = await params;
  return buildTaxonomyLandingMetadata("category", slug, "tr", searchParams);
}

export default async function CategoryLandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: ArchiveSearchParams;
}) {
  const { slug } = await params;
  return (
    <TaxonomyLandingPageBody
      kind="category"
      slug={slug}
      locale="tr"
      searchParams={searchParams}
    />
  );
}
