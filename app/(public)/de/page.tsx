import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import HomePageBody from "@/app/components/home/HomePageBody";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";

/* ===============================================================
   🛡️ /de — ANA SAYFA (PHASE 11)
   ===============================================================
   ÖNCEKİ DURUM: `LocaleRouteComingSoon` placeholder + koşulsuz
   `robots: { index:false }` (Phase 4A/10C).

   ŞİMDİ: TR ile AYNI gövde (`HomePageBody`) — üç ayrı component
   kopyası YOKTUR, yalnız `locale` prop'u farklıdır.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı
       DEĞİŞMEDİ).

   ROBOTS: Placeholder'a özel koşulsuz `noindex` KALDIRILDI — sayfa
   artık gerçek içerik. Index politikası root layout'taki
   `settings.robots_index/robots_follow` ayarından miras alınır.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("de");
}

export default async function DeHomePage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  return <HomePageBody locale="de" />;
}
