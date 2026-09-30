import type { Metadata } from "next";

import KiralikVillalarPageBody, {
  type ArchiveSearchParams,
} from "@/app/components/search/KiralikVillalarPageBody";
import { buildVillasArchiveMetadata } from "@/app/components/search/kiralik-villalar-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/kiralik-villalar — PUBLIC ARCHIVE (EN)
   ===============================================================
   ÖNCEKİ DURUM: `LocaleRouteComingSoon` placeholder (Phase 4A).
   ŞİMDİ: TR ile AYNI gövde (`KiralikVillalarPageBody`) — tek fark
   `locale` prop'u. Veri akışı, URL query kontratı, sort/pagination
   semantiği BİREBİR aynı.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("en")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).

   SEO: placeholder'a özel koşulsuz `noindex` metadata'sı KALDIRILDI
   (Phase 13'te `/en|de/arama` için verilen AYNI karar). `/kiralik-
   villalar` robots.ts'te ZATEN allow; indexing politikası merkezî.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildVillasArchiveMetadata("en");
}

export default async function EnVillasPage({
  searchParams,
}: {
  searchParams: ArchiveSearchParams;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <KiralikVillalarPageBody locale="en" searchParams={searchParams} />;
}
