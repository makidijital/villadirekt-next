import type { Metadata } from "next";

import ShortGapsPageBody from "@/app/components/short-gaps/ShortGapsPageBody";
import { buildShortGapsMetadata } from "@/app/components/short-gaps/short-gaps-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/kisa-sureli-tarihler/[ay]/[gece] — KISA SÜRELİ TARİHLER (EN)
   ===============================================================
   TR ile AYNI gövde (`ShortGapsPageBody`) — tek fark `locale` prop'u.
   Gap/villa sorguları, fiyat mantığı ve URL contract BİREBİR aynıdır.
   Ay SLUG'ı canonical (TR) kalır — yalnız GÖRÜNEN ay adı çevrilir.
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
  return buildShortGapsMetadata(params, "en");
}

export default async function EnShortGapListingPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return (
    <ShortGapsPageBody
      params={params}
      searchParams={searchParams}
      locale="en"
    />
  );
}
