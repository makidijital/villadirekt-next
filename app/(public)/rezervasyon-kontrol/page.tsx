import type { Metadata } from "next";

import ReservationLookupPageBody from "@/app/components/reservation-lookup/ReservationLookupPageBody";
import { buildReservationLookupMetadata } from "@/app/components/reservation-lookup/reservation-lookup-metadata";

/* ===============================================================
   🛡️ /rezervasyon-kontrol — PUBLIC REZERVASYON DURUM SORGULAMA (TR)
   ===============================================================
   Sayfa gövdesi
   `app/components/reservation-lookup/ReservationLookupPageBody.tsx`'e
   TAŞINDI (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) —
   `/en|de/rezervasyon-kontrol` AYNI gövdeyi render eder.

   TR DAVRANIŞI DEĞİŞMEDİ: URL, metinler, `?token=` akışı ve güvenlik
   semantiği (yalnız reservation_no + email eşleşmesi) BİREBİR aynı.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildReservationLookupMetadata("tr");
}

export default async function ReservationCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return (
    <ReservationLookupPageBody searchParams={searchParams} locale="tr" />
  );
}
