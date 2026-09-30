import type { Metadata } from "next";

import ReservationLookupPageBody from "@/app/components/reservation-lookup/ReservationLookupPageBody";
import { buildReservationLookupMetadata } from "@/app/components/reservation-lookup/reservation-lookup-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/rezervasyon-kontrol — REZERVASYON DURUM SORGULAMA (DE)
   ===============================================================
   TR ile AYNI gövde (`ReservationLookupPageBody`) — tek fark `locale`
   prop'u. `?token=` çözümleme, API sözleşmesi ve güvenlik semantiği
   BİREBİR aynıdır.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildReservationLookupMetadata("de");
}

export default async function DeReservationCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return (
    <ReservationLookupPageBody searchParams={searchParams} locale="de" />
  );
}
