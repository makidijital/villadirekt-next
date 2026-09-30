import type { Metadata } from "next";

import FavoritesPageBody from "@/app/components/favorites/FavoritesPageBody";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/favoriler — FAVORİLER (DE)
   ===============================================================
   TR ile AYNI gövde (`FavoritesPageBody`) — tek fark `locale` prop'u.
   localStorage favori mantığı ve paylaşım token akışı BİREBİR aynıdır.

   SEO: TR ile AYNI — `noindex/nofollow` (kişiye özel içerik),
   canonical/hreflang YOK.
   =============================================================== */

export const metadata: Metadata = {
  title: getDictionary("de").favoritesPage.metaTitle,
  description: getDictionary("de").favoritesPage.metaDescription,
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function DeFavoritesPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <FavoritesPageBody locale="de" />;
}
