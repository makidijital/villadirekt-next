import "server-only";

import { cache } from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ REQUEST LOCALE STORE — PHASE 4B (Locale Context Core)
   ===============================================================
   AMAÇ: Public route ağacındaki HERHANGİ bir server kodunun (bugün:
   yalnız Phase 4A'nın /en/* ve /de/* sayfaları; ileride: layout,
   Header/Footer, dictionary okuma, vb.) mevcut request'in locale'ini
   PROP DRILLING OLMADAN, güvenilir şekilde okuyabilmesi.

   MEKANİZMA — React `cache()` (request-scoped memoization):
     Bu proje zaten AYNI primitive'i production'da kullanıyor (bkz.
     app/(public)/kiralik-villa/[slug]/page.tsx →
     `getVillaBySlugCached = cache((slug) => getVillaBySlug(slug))`,
     "request-scoped dedupe" yorumuyla). React'ın `cache()`'i, Next.js
     App Router'ın GERÇEK bir request'i render ederken açtığı
     request-scoped dispatcher içinde çalıştığında, aynı fonksiyon +
     aynı argümanlar için TEK bir sonucu o request boyunca paylaşır;
     yeni bir HTTP request'te bu store SIFIRDAN başlar (sızıntı YOK,
     Next.js'in kendi garantisi — bkz. Next.js "Request Memoization").
     Burada YENİ bir cache/dispatcher mekanizması İCAT EDİLMEDİ —
     var olan, kanıtlanmış primitive reuse edildi.

     ⚠️ Bu davranış YALNIZ gerçek bir Next.js RSC render'ı içinde
     geçerlidir. Vitest/Node ortamında (bu dosyanın testinde olduğu
     gibi) aktif bir cache dispatcher yoksa `cache()` memoize ETMEZ
     (her çağrıda fabrika fonksiyonu yeniden çalışır) — bkz.
     tests/unit/request-locale.test.ts üstyazısı, orada `react`'ın
     `cache()`'i test ortamı için bilinçli olarak mock'lanır.

   OTOMATİK TR DAVRANIŞI: Mevcut Türkçe route'ları (kiralik-villa,
   kiralik-villalar, arama, rezervasyon, vb.) bu modülü HİÇ IMPORT
   ETMİYOR/ÇAĞIRMIYOR. Dolayısıyla `setRequestLocale` hiç
   çağrılmadığı için store'un başlangıç değeri olan `DEFAULT_LOCALE`
   ("tr") kalır — TR route'ları için "otomatik tr" davranışı, bu
   dosyaya veya TR route'larına HİÇBİR DOKUNUŞ GEREKTİRMEDEN elde
   edilir.

   Bu fazda çağıran TEK call-site grubu: Phase 4A'nın 8 /en/* ve
   /de/* page.tsx'i (her biri kendi literal locale'ini geçirir).
   Header/Footer/dictionary bu store'u BU FAZDA henüz OKUMUYOR
   (kapsam dışı — bkz. görev tanımı).
   =============================================================== */

type LocaleStore = { locale: Locale };

const getLocaleStore = cache((): LocaleStore => ({ locale: DEFAULT_LOCALE }));

/** Bu request için locale'i işaretler. Yalnız /en/* ve /de/*
 *  sayfalarından, kendi bilinen (literal) locale'leriyle çağrılır. */
export function setRequestLocale(locale: Locale): void {
  getLocaleStore().locale = locale;
}

/** Bu request için o ana kadar işaretlenmiş locale'i döner.
 *  `setRequestLocale` hiç çağrılmadıysa (TR route'ları) →
 *  `DEFAULT_LOCALE` ("tr"). */
export function getRequestLocale(): Locale {
  return getLocaleStore().locale;
}
