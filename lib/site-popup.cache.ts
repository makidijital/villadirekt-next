import "server-only";

import { unstable_cache } from "next/cache";

import { getPublicSitePopup } from "@/app/services/site-popup.service";

/* ===============================================================
   🛡️ SITE POPUP — public cache (tag: "site-popup")
   ===============================================================
   Public layout her render'da bunu çağırır; DB'ye en fazla saatte
   bir gidilir. Admin kaydı `revalidateTag("site-popup")` ile anında
   invalidate eder (bkz. popup.action.ts). Diğer cache'lerden
   (settings/menu/…) BAĞIMSIZ — popup değişikliği onları temizlemez.
   Tarih penceresi client'ta da kontrol edildiği için cache'in en
   fazla 1 saatlik gecikmesi başlangıç/bitiş anını kaydırmaz.
   =============================================================== */
export const SITE_POPUP_CACHE_TAG = "site-popup";

export const getCachedSitePopup = unstable_cache(
  async () => getPublicSitePopup(),
  ["site-popup:public"],
  { tags: [SITE_POPUP_CACHE_TAG], revalidate: 3600 }
);
