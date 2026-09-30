import type { Metadata } from "next";

import KiralikVillalarPageBody, {
  type ArchiveSearchParams,
} from "@/app/components/search/KiralikVillalarPageBody";
import { buildVillasArchiveMetadata } from "@/app/components/search/kiralik-villalar-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/kiralik-villalar — PUBLIC ARCHIVE (DE)
   ===============================================================
   ÖNCEKİ DURUM: `LocaleRouteComingSoon` placeholder (Phase 4A).
   ŞİMDİ: TR ile AYNI gövde (`KiralikVillalarPageBody`) — tek fark
   `locale` prop'u. Veri akışı, URL query kontratı, sort/pagination
   semantiği BİREBİR aynı.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).

   SEO: placeholder'a özel koşulsuz `noindex` metadata'sı KALDIRILDI
   (Phase 13'te `/en|de/arama` için verilen AYNI karar). `/kiralik-
   villalar` robots.ts'te ZATEN allow; indexing politikası merkezî.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildVillasArchiveMetadata("de");
}

export default async function DeVillasPage({
  searchParams,
}: {
  searchParams: ArchiveSearchParams;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <KiralikVillalarPageBody locale="de" searchParams={searchParams} />;
}
