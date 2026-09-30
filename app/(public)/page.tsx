import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HomePageBody from "@/app/components/home/HomePageBody";
import { buildHomeMetadata } from "@/app/components/home/home-metadata";
import { getPublicHomeResolution } from "@/lib/i18n/public-home.server";

/* ===============================================================
   🛡️ ANA SAYFA — "/" (GİRİŞ NOKTASI)
   ===============================================================
   🛡️ PHASE 11 — Gövde `HomePageBody` (TR/EN/DE ORTAK) component'ine
   taşındı; `/en` ve `/de` AYNI component'i render eder (üç kopya YOK).

   🔄 KÖK NEDEN DÜZELTMESİ — VARSAYILAN DİL AYARI
   ---------------------------------------------------------------
   ÖNCEDEN: `<HomePageBody locale="tr" />` HARDCODED idi; admin'deki
   `settings.public_default_locale` (migration 081) public tarafta
   HİÇBİR YERDE okunmuyordu → "Varsayılan Dil = Deutsch" seçilse bile
   `/` her zaman Türkçe açılıyordu.

   ŞİMDİ: karar TEK bir yerden gelir — `getPublicHomeResolution()`
   (lib/i18n/public-home.server.ts → saf kural lib/i18n/public-home.ts).

     • MOD A (multilingual KAPALI **veya** varsayılan = "tr"):
       bu dosya AYNEN eskisi gibi TR ana sayfayı render eder.
       Yönlendirme YOK, metadata AYNI → BYTE-IDENTICAL.
     • MOD B (multilingual AÇIK **ve** varsayılan ∈ {"en","de"}):
       `/` saf bir yönlendirici olur → `/en` veya `/de`.
       TR ana sayfa `/tr`'ye taşınır (app/(public)/tr/page.tsx);
       logo/footer/bottom-nav/dil-değiştirici TR hedefleri de oraya
       bakar, böylece TR kullanıcı tekrar varsayılan dile DÜŞMEZ.

   ⚠️ `/en` ve `/de` bu mantıktan ETKİLENMEZ — doğrudan açıldıklarında
   hiçbir yere yönlenmezler (kendi page.tsx'leri değişmedi).

   CANONICAL/METADATA: `buildHomeMetadata("tr")` (MOD B'de TR ana sayfa
   `/tr`'de yaşadığı için canonical/hreflang oradan üretilir — bkz.
   app/components/home/home-metadata.ts).

   RENDERING: burada `headers()`/`cookies()` KULLANILMAZ. Tek okuma
   `getCachedSettings()` (unstable_cache, tag "settings") — yani bu
   sayfa statik/ISR uygunluğunu korur ve admin kaydındaki
   `revalidateSettings()` ile tazelenir. Ek dynamic zorlaması YOK.
   =============================================================== */

export async function generateMetadata(): Promise<Metadata> {
  return buildHomeMetadata("tr");
}

export default async function Home() {
  /* ⚠️ `redirect()` NEXT_REDIRECT fırlatır → try/catch DIŞINDA
     çağrılmalı. `getPublicHomeResolution` kendi içinde catch'liyor. */
  const { redirectsFromRoot, defaultLocale } = await getPublicHomeResolution();
  if (redirectsFromRoot) {
    redirect(`/${defaultLocale}`);
  }

  return <HomePageBody locale="tr" />;
}
