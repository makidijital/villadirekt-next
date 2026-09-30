import type { Metadata } from "next";

import ShortGapsPageBody from "@/app/components/short-gaps/ShortGapsPageBody";
import { buildShortGapsMetadata } from "@/app/components/short-gaps/short-gaps-metadata";

/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — LİSTELEME SAYFASI (TR)
   ===============================================================
   Sayfa gövdesi `app/components/short-gaps/ShortGapsPageBody.tsx`'e
   TAŞINDI (DOM/CSS/sorgu akışı DEĞİŞTİRİLMEDEN) —
   `/en|de/kisa-sureli-tarihler/[ay]/[gece]` AYNI gövdeyi render eder.

   DEĞİŞMEYEN: `dynamic = "force-dynamic"`, gap/villa sorguları,
   URL contract (bolgeler · villa-turleri · guests), fiyat mantığı.
   =============================================================== */

export const dynamic = "force-dynamic";

type RouteParams = { ay: string; gece: string };
type SearchParams = {
  bolgeler?: string | string[];
  "villa-turleri"?: string | string[];
  guests?: string | string[];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  return buildShortGapsMetadata(params, "tr");
}

export default async function ShortGapListingPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  return (
    <ShortGapsPageBody
      params={params}
      searchParams={searchParams}
      locale="tr"
    />
  );
}
