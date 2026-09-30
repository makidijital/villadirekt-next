import type { Metadata } from "next";

import ReservationSuccessBody from "@/app/components/reservation/ReservationSuccessBody";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/rezervasyon/basarili — REZERVASYON BAŞARILI (EN)
   ===============================================================
   TR ile AYNI gövde (`ReservationSuccessBody`) — tek fark `locale`
   prop'u. `ref` / `villa` query parametreleri ve `getCachedSettings`
   WhatsApp link öncelik sırası BİREBİR aynıdır.

   PHASE 4A/4B deseni:
     • `setRequestLocale("en")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404.
     • `robots: { index: false, follow: false }` — TR ile AYNI SEO
       davranışı. robots.ts/sitemap.ts'ye DOKUNULMADI.
   =============================================================== */

export const metadata: Metadata = {
  title: getDictionary("en").reservation.success.metaTitle,
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ ref?: string; villa?: string }>;

export default async function EnReservationSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <ReservationSuccessBody searchParams={searchParams} locale="en" />;
}
