import type { Metadata } from "next";

import FavoritesPageBody from "@/app/components/favorites/FavoritesPageBody";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /favoriler — PUBLIC ROUTE (TR)
   ===============================================================
   Sayfa gövdesi `app/components/favorites/FavoritesPageBody.tsx`'e
   TAŞINDI (DOM/CSS DEĞİŞTİRİLMEDEN) — `/en|de/favoriler` AYNI gövdeyi
   render eder.

   SEO DEĞİŞMEDİ:
     robots: noindex/nofollow → kişiye özel içerik; index'lenmemeli.
     canonical YOK (kullanıcı bazlı liste) → hreflang de YOK.
   =============================================================== */

export const metadata: Metadata = {
  title: getDictionary("tr").favoritesPage.metaTitle,
  description: getDictionary("tr").favoritesPage.metaDescription,
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function Page() {
  return <FavoritesPageBody locale="tr" />;
}
