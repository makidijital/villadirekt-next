import AramaPageBody, {
  type AramaSearchParams,
} from "@/app/components/search/AramaPageBody";
import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";

/* ===============================================================
   🛡️ /de/arama — SEARCH RESULTS (DE) — PHASE 13
   ===============================================================
   ÖNCEKİ DURUM: `LocaleRouteComingSoon` placeholder (Phase 4A).
   ŞİMDİ: TR ile AYNI gövde (`AramaPageBody`) — tek fark `locale`
   prop'u. Arama pipeline'ı, URL query kontratı, availability,
   fiyat/sıralama/pagination semantiği BİREBİR aynı.

   KORUNAN PHASE 4A/4B DAVRANIŞI:
     • `setRequestLocale("de")` — request-scoped locale işareti.
     • `await requirePublicLocaleEnabled()` — `multilingual_enabled`
       kapalıyken notFound() → 404 (bugünkü production davranışı).

   SEO: `/arama` faceted-search olduğu için `robots.ts` Disallow +
   sitemap hariç tutma kararı GEÇERLİ; bu fazda metadata/hreflang
   EKLENMEDİ. Placeholder'a özel koşulsuz `noindex` metadata'sı
   KALDIRILDI — indexing politikası zaten robots.ts'te merkezî.
   =============================================================== */
export const dynamic = "force-dynamic";

export default async function DeSearchPage({
  searchParams,
}: {
  searchParams: AramaSearchParams;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  return <AramaPageBody locale="de" searchParams={searchParams} />;
}
