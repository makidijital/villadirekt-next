import type { Metadata } from "next";

import ReservationLookupPageBody from "@/app/components/reservation-lookup/ReservationLookupPageBody";
import { buildReservationLookupMetadata } from "@/app/components/reservation-lookup/reservation-lookup-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/rezervasyon-kontrol — REZERVASYON DURUM SORGULAMA (EN)
   ===============================================================
   TR ile AYNI gövde (`ReservationLookupPageBody`) — tek fark `locale`
   prop'u. `?token=` çözümleme, API sözleşmesi ve güvenlik semantiği
   BİREBİR aynıdır.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildReservationLookupMetadata("en");
}

export default async function EnReservationCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return (
    <ReservationLookupPageBody searchParams={searchParams} locale="en" />
  );
}
