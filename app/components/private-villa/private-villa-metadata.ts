import "server-only";

import type { Metadata } from "next";

import { getVillaByPrivateToken } from "@/app/services/villa.service";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /v/[token] METADATA (TR / EN / DE ORTAK)
   ===============================================================
   SEO politikası TR sayfasından BİREBİR taşındı:
     - robots: noindex/nofollow (+ googleBot) — token URL'i ASLA
       indexlenmemeli.
     - canonical YOK (başka bir URL kanonik sanılmasın).
     - hreflang YOK — noindex bir token sayfası için alternates
       yayınlanmaz; locale geçişi yalnız kullanıcı tarafındadır.
     - OpenGraph/Twitter kasıtla minimum.
   Yalnız GÖRÜNEN metinler locale'e göre dictionary'den gelir.
   =============================================================== */

export async function buildPrivateVillaMetadata(
  params: Promise<{ token: string }>,
  locale: Locale = DEFAULT_LOCALE
): Promise<Metadata> {
  const dict = getDictionary(locale).privateVilla;
  const { token } = await params;
  const villa = await getVillaByPrivateToken(token);

  if (!villa) {
    return {
      title: dict.metaInvalidTitle,
      robots: { index: false, follow: false },
    };
  }

  const title = villa.title || dict.metaTitleFallback;
  /* Description premium hidden-inventory hissi:
     "Özel paylaşım bağlantısı" → debug/admin hissi vermiyor. */
  const description = dict.metaDescription;

  const cover =
    villa.images && villa.images.length > 0 ? villa.images[0] : undefined;

  return {
    title,
    description,
    /* 🛡️ CRITICAL — kesin noindex/nofollow. */
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    openGraph: {
      title,
      description,
      type: "website",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}
