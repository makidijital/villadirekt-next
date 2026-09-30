import SharedListPageBody from "@/app/components/shared-list/SharedListPageBody";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /en/liste/[token] — admin curator share landing (en)
   ===============================================================
   TR ile AYNI gövde (`SharedListPageBody`) — tek fark `locale` prop'u.
   Token resolve/snapshot/pricing mantığı ve `notFound()` davranışı
   BİREBİR aynıdır. SEO: TR ile AYNI (noindex/nofollow).
   =============================================================== */

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ENSharedVillaListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  return <SharedListPageBody params={params} locale="en" />;
}
