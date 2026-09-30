import type { Metadata } from "next";

import OfferPageBody from "@/app/components/offer/OfferPageBody";
import { buildOfferMetadata } from "@/app/components/offer/offer-metadata";

/* ===============================================================
   🛡️ /teklif-al — PREMIUM CONCIERGE PAGE (TR)
   ===============================================================
   Sayfa gövdesi `app/components/offer/OfferPageBody.tsx`'e TAŞINDI
   (DOM/CSS DEĞİŞTİRİLMEDEN) — `/en/teklif-al` ve `/de/teklif-al`
   AYNI gövdeyi render eder (`ContactPageBody` deseni).

   TR DAVRANIŞI DEĞİŞMEDİ: URL, metinler, `robots: index/follow`,
   canonical ve form submit akışı BİREBİR aynı.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildOfferMetadata("tr");
}

export default function Page() {
  return <OfferPageBody locale="tr" />;
}
