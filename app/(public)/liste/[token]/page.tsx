import SharedListPageBody from "@/app/components/shared-list/SharedListPageBody";

/* ===============================================================
   🛡️ /liste/[token] — admin curator share landing (TR)
   ===============================================================
   Gövde `SharedListPageBody`'ye taşındı (TR/EN/DE ORTAK) — bu dosya
   ince bir sarmalayıcıdır. Token resolve, snapshot sırası, pricing
   context, `notFound()` davranışı ve SEO politikası (noindex) BİREBİR
   aynıdır; TR çıktısı DEĞİŞMEDİ.
   =============================================================== */

export const dynamic = "force-dynamic";

/* Public-shareable URL → SEO crawl edilmemesi gerekir. */
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedVillaListPage({
  params,
}: {
  /* Next.js 16 async params kontratı. */
  params: Promise<{ token: string }>;
}) {
  return <SharedListPageBody params={params} />;
}
