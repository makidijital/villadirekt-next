import type { Metadata } from "next";

import SharedFavoritesPageBody from "@/app/components/favorites/SharedFavoritesPageBody";
import { getSharedFavoritesList } from "@/app/services/shared-favorites.service";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /favoriler/paylas/[token] — SHARED FAVORITES (TR)
   ===============================================================
   Sayfa gövdesi
   `app/components/favorites/SharedFavoritesPageBody.tsx`'e TAŞINDI
   (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) —
   `/en|de/favoriler/paylas/[token]` AYNI gövdeyi render eder.

   DEĞİŞMEYEN: token/snapshot mantığı, `dynamic = "force-dynamic"`,
   robots noindex/nofollow, canonical YOK, JSON-LD YOK.
   =============================================================== */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const dict = getDictionary("tr").favoritesPage;
  const { token } = await params;
  const data = await getSharedFavoritesList(token);
  if (!data) {
    return {
      title: dict.sharedMetaInvalidTitle,
      robots: { index: false, follow: false },
    };
  }
  return {
    title: dict.sharedMetaTitle,
    description: dict.sharedMetaDescription,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}

export default async function SharedFavoritesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <SharedFavoritesPageBody params={params} locale="tr" />;
}
