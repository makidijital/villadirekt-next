import type { Metadata } from "next";

import PrivateVillaPageBody from "@/app/components/private-villa/PrivateVillaPageBody";
import { buildPrivateVillaMetadata } from "@/app/components/private-villa/private-villa-metadata";

/* ===============================================================
   🛡️ FAZ 31 — PRIVATE / TEMPORARY VILLA URL ROUTE (TR)
   ===============================================================
   `/v/[token]` — off-market preview route.

   Gövde `PrivateVillaPageBody`'ye, metadata `private-villa-metadata`'ya
   taşındı (TR/EN/DE ORTAK) — bu dosya ince bir sarmalayıcıdır. Token
   resolve, veri yükleme, fiyat/müsaitlik mantığı, `notFound()` ve SEO
   politikası (noindex/nofollow, canonical YOK) BİREBİR aynıdır; TR
   çıktısı DEĞİŞMEDİ.
   =============================================================== */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  return buildPrivateVillaMetadata(params);
}

export default async function PrivateVillaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  return <PrivateVillaPageBody params={params} searchParams={searchParams} />;
}
