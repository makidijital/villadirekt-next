import type { Metadata } from "next";

import ReservationSuccessBody from "@/app/components/reservation/ReservationSuccessBody";

/* ===============================================================
   🛡️ /rezervasyon/basarili — REZERVASYON BAŞARILI (TR)
   ===============================================================
   Sayfa gövdesi
   `app/components/reservation/ReservationSuccessBody.tsx`'e TAŞINDI
   (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) — `/en/rezervasyon/basarili`
   ve `/de/rezervasyon/basarili` AYNI gövdeyi render eder.

   TR DAVRANIŞI DEĞİŞMEDİ:
     • URL `/rezervasyon/basarili` aynı.
     • `metadata.title` eski hardcoded değerle BİREBİR (dictionary
       TR değeri aynı stringtir).
     • SEO: robots noindex, nofollow — başarı sayfaları indexlenmez
       (duplicate + private content guard).
     • Route segment config (`dynamic`/`revalidate`) EKLENMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  title: "Rezervasyon Talebiniz Alındı",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ ref?: string; villa?: string }>;

export default async function ReservationSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <ReservationSuccessBody searchParams={searchParams} locale="tr" />;
}
