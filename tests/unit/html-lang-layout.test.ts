/* ===============================================================
   🛡️ PHASE 7E — A) app/layout.tsx <html lang> REGRESYON KİLİDİ
   ===============================================================
   Bu dosya Phase 7E'nin AUDIT SONUCUNU test olarak kayıt altına alır:

   BULGU: `app/layout.tsx` (ROOT layout, `<html>` etiketini üreten TEK
   yer — Next.js App Router'da yalnız root layout `<html>`/`<body>`
   render edebilir) `/en/kiralik-villa/[slug]` gibi bir sayfanın
   `setRequestLocale("en")` (Phase 4B, `request-locale.server.ts`)
   çağrısını GÜVENLİ ŞEKİLDE OKUYAMAZ. Neden:

     React Server Components render sırası PARENT-ÖNCE-ÇOCUK'tur:
     Next.js `<RootLayout>{children}</RootLayout>` ağacını render
     ederken RootLayout'un kendi async fonksiyon GÖVDESİ (ve onun
     döndürdüğü JSX'teki `lang={...}` gibi PRIMITIVE prop değerleri)
     `children` (nested layout → page) render edilmeden ÖNCE
     tamamlanır/hesaplanır. `EnVillaDetailPage` içindeki
     `setRequestLocale("en")` çağrısı, RootLayout'un JSX'i (ve
     içindeki `lang` prop'u) ZATEN üretildikten SONRA çalışır — bu
     yüzden RootLayout'ta `getRequestLocale()` okunsa bile bu HER ZAMAN
     henüz yazılmamış DEFAULT_LOCALE ("tr") değerini görür, ASLA
     "en"/"de" değil.

     Next.js'in bu tür bir problem için sunduğu TEK resmi mekanizma
     `next/root-params` (`node_modules/next/dist/server/request/
     root-params.js`) — ama bu yalnız ROOT LAYOUT'UN ÜSTÜNDE bir
     `[dynamic]` segment olduğunda çalışır
     (`collect-root-param-keys.js`: "we return once we found the
     first layout" — segment toplama root layout'ta DURUR). Bu
     projede `app/layout.tsx` ZATEN en üstteki (ilk) layout — üstünde
     hiçbir dynamic segment yok (EN/DE literal `en`/`de` klasörleri,
     Phase 4A'nın bilinçli kararıyla `[locale]` dynamic segment
     DEĞİL). `next/root-params` kullanmak, TÜM route'ları (TR dahil)
     bir `[locale]` segmentinin altına taşımayı gerektirir — bu,
     Phase 7E'nin AÇIKÇA YASAKLADIĞI "URL mimarisini değiştirme" /
     "middleware'i değiştirme" sınırını ihlal eder.

   SONUÇ: `app/layout.tsx` BU FAZDA DEĞİŞTİRİLMEDİ. `<html lang="tr">`
   TÜM route'lar için (TR/EN/DE) SABİT kalıyor — bu, görev tanımının
   kendi öngördüğü "güvenli değilse zorlama, yalnız robots/noindex
   kısmını yap" fallback'idir (bkz. Phase 7E raporu).

   Bu dosyadaki testler RootLayout'un GERÇEKTEN, bugün, HER durumda
   `lang="tr"` ürettiğini doğruluyor (regresyon kilidi — ileride biri
   bunu yanlışlıkla `getRequestLocale()`'a bağlarsa bu test KIRILIR ve
   yukarıdaki mimari uyarıyı okumaya zorlar). İllüstratif "parent önce
   render olur" hazard testi ayrı bir dosyada
   (`request-locale-render-order.test.ts`) — bu ayrım, o dosyanın
   `react`'i tüm dosya kapsamında mock'lamasının BU dosyadaki
   `app/layout.tsx` import'unu (ve onun gerçek React davranışına
   bağımlılığını) ETKİLEMEMESİ İÇİNDİR.

   `next/font/google` (Outfit/Inter/Fraunces/Geist_Mono) YALNIZ Next.js'in
   kendi SWC derleyici eklentisiyle çalışır; ham Vitest/Vite ortamında
   `Outfit is not a function` hatası verir (ampirik olarak doğrulandı —
   bu PROJEDE `app/layout.tsx`'i import eden BAŞKA HİÇBİR test yok, bu
   İLK KEZ deneniyor — bkz. probe-layout-import.test.ts /
   probe-layout-import2.test.ts). Bu yüzden `next/font/google` bu
   dosyada YEREL olarak mock'lanıyor (yalnız bu test dosyasını
   etkiler, `vitest.config.ts` DEĞİŞTİRİLMEDİ, global davranış AYNI).
=============================================================== */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: () => Promise.resolve(null),
}));

vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-outfit" }),
  Inter: () => ({ variable: "--font-inter" }),
  Fraunces: () => ({ variable: "--font-fraunces" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

describe("A) app/layout.tsx — RootLayout <html lang> regresyon kilidi", () => {
  it("RootLayout HER ZAMAN <html lang=\"tr\"> döner (Phase 7E BU FAZDA DEĞİŞTİRMEDİ — bkz. dosya başı audit notu)", async () => {
    const mod = await import("@/app/layout");
    const element = (await mod.default({ children: null })) as {
      props: { lang: string };
    };
    expect(element.props.lang).toBe("tr");
  });

  it("settings null/reject olsa BİLE lang hâlâ 'tr' (fail-safe, ÖNCEKİ davranışla AYNI)", async () => {
    const mod = await import("@/app/layout");
    const element = (await mod.default({ children: null })) as {
      type: string;
      props: { lang: string };
    };
    expect(element.props.lang).toBe("tr");
    expect(element.type).toBe("html");
  });
});
