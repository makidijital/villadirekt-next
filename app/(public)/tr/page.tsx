import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HomePageBody from "@/app/components/home/HomePageBody";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";
import { getPublicHomeResolution } from "@/lib/i18n/public-home.server";

/* ===============================================================
   🛡️ /tr — TÜRKÇE ANA SAYFA (YALNIZ MOD B'DE YAŞAR)
   ===============================================================
   NEDEN VAR: varsayılan dil EN/DE olduğunda `/` saf bir yönlendirici
   olur. TR ana sayfanın o modda da (a) kullanıcı tarafından
   erişilebilir, (b) arama motorları tarafından indexlenebilir bir
   URL'i olması gerekir — aksi halde `hreflang="tr"` ve sitemap'in
   priority 1.0 girdisi bir redirect'e işaret eder ve TR ana sayfa
   indexlenemez hale gelirdi.

   ⚠️ TR İÇ ROUTE'LARI PREFIX'SİZ KALIR — `/tr` YALNIZ ana sayfa
   içindir. `/tr/kiralik-villalar` gibi bir route YOKTUR ve
   OLUŞTURULMADI; `localeHref` / `buildLocaleAlternates` / TR URL
   mimarisi DEĞİŞMEDİ.

   MOD A (multilingual kapalı veya varsayılan="tr") → `/`'ye yönlenir.
   Böylece her iki modda da TR ana sayfanın TEK kanonik URL'i olur;
   duplicate-content ÜRETİLMEZ.

   `setRequestLocale` ÇAĞRILMAZ: store'un başlangıç değeri zaten
   `DEFAULT_LOCALE` ("tr") — TR route'larının mevcut deseniyle
   BİREBİR aynı (bkz. lib/i18n/request-locale.server.ts:35-41).

   `requirePublicLocaleEnabled()` de ÇAĞRILMAZ: bu sayfa yalnız
   multilingual AÇIKKEN render edilir (MOD B'nin ön koşulu); kapalıyken
   zaten `/`'ye yönlenir. `/en` ve `/de`'nin 404 gate'i DEĞİŞMEDİ.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("tr");
}

export default async function TrHomePage() {
  const { redirectsFromRoot } = await getPublicHomeResolution();
  if (!redirectsFromRoot) {
    redirect("/");
  }

  return <HomePageBody locale="tr" />;
}
