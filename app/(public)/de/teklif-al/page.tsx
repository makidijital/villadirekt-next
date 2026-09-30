import type { Metadata } from "next";

import OfferPageBody from "@/app/components/offer/OfferPageBody";
import { buildOfferMetadata } from "@/app/components/offer/offer-metadata";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/teklif-al — PREMIUM CONCIERGE PAGE (DE)
   ===============================================================
   TR ile AYNI gövde (`OfferPageBody`) — tek fark `locale` prop'u.
   Taxonomy API'si, honeypot/time-trap, payload ve submit akışı
   BİREBİR aynıdır.

   PHASE 4A/4B deseni:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildOfferMetadata("de");
}

export default async function DeOfferPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <OfferPageBody locale="de" />;
}
