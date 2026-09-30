import type { Metadata } from "next";

import PrivateVillaPageBody from "@/app/components/private-villa/PrivateVillaPageBody";
import { buildPrivateVillaMetadata } from "@/app/components/private-villa/private-villa-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/v/[token] — off-market preview (de)
   ===============================================================
   TR ile AYNI gövde (`PrivateVillaPageBody`) — tek fark `locale`
   prop'u. Token resolve/veri/fiyat mantığı ve `notFound()` BİREBİR
   aynıdır. SEO: TR ile AYNI (noindex/nofollow, canonical YOK).
   =============================================================== */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  return buildPrivateVillaMetadata(params, "de");
}

export default async function DEPrivateVillaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return (
    <PrivateVillaPageBody
      params={params}
      searchParams={searchParams}
      locale="de"
    />
  );
}
