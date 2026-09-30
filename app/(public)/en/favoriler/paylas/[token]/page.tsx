import type { Metadata } from "next";

import SharedFavoritesPageBody from "@/app/components/favorites/SharedFavoritesPageBody";
import { getSharedFavoritesList } from "@/app/services/shared-favorites.service";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/favoriler/paylas/[token] — SHARED FAVORITES (EN)
   ===============================================================
   TR ile AYNI gövde (`SharedFavoritesPageBody`) — tek fark `locale`
   prop'u. Token/snapshot mantığı ve `notFound()` davranışı BİREBİR
   aynıdır. SEO: TR ile AYNI (noindex/nofollow, canonical YOK).
   =============================================================== */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const dict = getDictionary("en").favoritesPage;
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

export default async function EnSharedFavoritesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <SharedFavoritesPageBody params={params} locale="en" />;
}
