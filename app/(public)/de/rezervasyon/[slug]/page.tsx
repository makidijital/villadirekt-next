import type { Metadata } from "next";

import ReservationPageBody from "@/app/components/reservation/ReservationPageBody";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/rezervasyon/[slug] — PUBLIC REZERVASYON (DE)
   ===============================================================
   TR ile AYNI gövde (`ReservationPageBody`) — tek fark `locale`
   prop'u. Servis çağrıları, fiyat/snapshot/ödeme/pool heating
   mantığı, API payload'ı ve rezervasyon oluşturma akışı BİREBİR
   aynıdır; bu fazda hiçbiri değiştirilmedi.

   PHASE 4A/4B'den KORUNAN DAVRANIŞ:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).
     • `robots: { index: false, follow: false }` — PHASE 4A'dan
       DEVRALINDI. `/rezervasyon/` TR tarafında robots.ts ile zaten
       Disallow; robots.ts/sitemap.ts'ye DOKUNULMADI.

   Not: `LocaleRouteComingSoon` placeholder'ı yerini gerçek gövdeye
   bıraktı.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
    adults?: string | string[];
    children?: string | string[];
    poolHeating?: string | string[];
  }>;
};

export default async function DeReservationPage({
  params,
  searchParams,
}: Props) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return (
    <ReservationPageBody
      params={params}
      searchParams={searchParams}
      locale="de"
    />
  );
}
