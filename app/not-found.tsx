import type { Metadata } from "next";
import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
/* 🛡️ PHASE 9B — Footer artık "use client" (usePathname ile locale
   tespiti, veri çekimi YOK). Bu sayfa (public)/layout.tsx'in DIŞINDA
   olduğu için kendi Footer'ını kendisi render eder — bu yüzden burada
   da (public)/layout.tsx'teki gibi self-contained FooterWrapper
   (async server, DB'den veri çeker) kullanılır. Davranış BİREBİR aynı;
   yalnızca veri-çekme sorumluluğu Footer'dan FooterWrapper'a taşındı. */
import FooterWrapper from "@/app/components/layout/FooterWrapper";
/* 🛡️ PERF — öneri villaları artık dar, LIMIT 3'lü, istek-içi dedupe'lu
   (React cache) sorgudan gelir; `getCachedVillas` (tüm liste, ~3 MB,
   cache'lenemiyordu) KULLANILMAZ. Sıra/kapak/fiyat dönüşümü aynı
   (`mapVilla`) — bkz. villa.service.ts > getNotFoundSuggestionVillas. */
import { getNotFoundSuggestionVillas } from "@/app/services/villa.service";
/* 🛡️ PUBLIC ÇOKLU DİL — görünen 404 gövdesi client island'a taşındı
   (locale `usePathname` ile türetilir; Header/Footer ile AYNI desen).
   Veri akışı (`getCachedVillas`) ve DOM/CSS DEĞİŞMEDİ. */
import NotFoundContent from "@/app/components/not-found/NotFoundContent";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ SEC-05 Phase 2 — root layout'tan taşınan takip alanları; 404
   sayfası (public) layout DIŞINDA olduğu için burada ayrıca render
   edilir → 404 takibi (GTM vb.) korunur. */
import SiteTrackingScripts from "@/app/components/layout/SiteTrackingScripts";
import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ ÖZEL 404 (app/not-found.tsx)
   ===============================================================
   Global eşleşmeyen URL'ler için. Root layout içinde render olur
   (header/footer (public) layout'ta olduğundan burada KENDİMİZ
   render ederiz — HeaderWrapper/Footer self-contained async server
   component'ler, prop gerektirmez).

   - Premium, mevcut tasarım diliyle uyumlu (CSS değişkenleri, font-display).
   - Mobil uyumlu.
   - noindex (404 HTTP statüsü + robots metadata).
   - Mevcut route'lara DOKUNULMAZ; yalnız bu dosya eklenir.
   =============================================================== */

/* 🛡️ `metadata` bir SERVER export'udur ve `not-found.tsx` eşleşmeyen TÜM
   URL'ler için render edildiğinden burada aktif locale (headers() olmadan)
   BİLİNEMEZ — bu yüzden meta TR canonical değerleriyle kalır. Sayfa zaten
   `noindex`; GÖRÜNEN metinler `NotFoundContent` içinde locale-aware. */
export const metadata: Metadata = {
  title: getDictionary(DEFAULT_LOCALE).notFound.metaTitle,
  description: getDictionary(DEFAULT_LOCALE).notFound.metaDescription,
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  /* Öne çıkan villalar — aktif + sort_order/created_at sıralı İLK 3
     (eski `getCachedVillas().slice(0, 3)` ile aynı küme ve sıra).
     Hata olursa bölüm gizlenir. */
  const featured = await getNotFoundSuggestionVillas().catch(() => []);
  const settings = await getCachedSettings().catch(() => null);

  return (
    <>
    <SiteTrackingScripts settings={settings} />
    <div className="flex flex-col min-h-screen bg-[var(--color-ivory)]">
      <HeaderWrapper />

      {/* 🛡️ Kartlar `NotFoundContent` (client island) içinde render
          edilir — VillaCard ancak orada türetilen locale'i alabilir.
          `getCachedVillas` akışı, sıralama ve kart prop'ları AYNEN. */}
      <NotFoundContent suggestionVillas={featured} />

      <FooterWrapper />
    </div>
    </>
  );
}
