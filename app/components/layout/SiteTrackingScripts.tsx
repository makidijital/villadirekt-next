import Script from "next/script";

import type { Settings } from "@/app/services/settings.types";
import { normalizeGtmId } from "@/lib/gtm.helper";

/* ===============================================================
   🛡️ SEC-05 Phase 2 — PUBLIC-ONLY TAKİP / ÖZEL SCRIPT ALANLARI
   ===============================================================
   Önceden root `app/layout.tsx` içindeydi → admin paneli ve
   `/maki-admin/login` DAHİL her sayfada çalışıyordu. Artık yalnız
   public kabuklarda render edilir:
     - app/(public)/layout.tsx  (normal + bakım modu dalı)
     - app/p/layout.tsx         (aynı PublicLayout re-export'u)
     - app/not-found.tsx        (404 takibi korunur)
   Admin rotaları ((admin) grubu) bu component'i HİÇ render etmez →
   admin girdisi ham HTML / GTM konteyner tag'leri admin panelinde
   çalışmaz ve admin RSC payload'ına girmez.

   İÇERİK DEĞİŞMEDİ: `custom_head_scripts` ve `analytics_script`
   ham değerleri AYNEN (parse/sanitize YOK → hiçbir takip kodu
   kaybolmaz) basılır; GTM ID Phase 1 doğrulamasından geçer.

   Konum: Önceden `custom_head_scripts` <head> içindeki bir <div>'e
   basılıyordu; HTML parser <head> içindeki <div>'i görünce head'i
   kapatıp içeriği <body>'nin BAŞINA taşıyordu (+ React hydration
   #418). Burada aynı sıra (custom head → analytics → sayfa) body
   başında, geçerli HTML olarak korunur.
   =============================================================== */
export default function SiteTrackingScripts({
  settings,
}: {
  settings: Settings | null | undefined;
}) {
  /* 🛡️ SEC-05 (Phase 1) — GTM ID strict doğrulama. Geçersiz/zararlı
     değer null → inline script'e ASLA interpolate edilmez. */
  const gtmId = normalizeGtmId(settings?.gtm_container_id);
  const customHead = settings?.custom_head_scripts?.trim();
  const analyticsScript = settings?.analytics_script?.trim();

  return (
    <>
      {/* Custom head HTML — admin tarafından girilen raw HTML (public). */}
      {customHead ? (
        <div dangerouslySetInnerHTML={{ __html: customHead }} />
      ) : null}
      {/* GTM Container — `afterInteractive`, main bundle'ı bloklamaz. */}
      {gtmId ? (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}
      {/* Custom analytics script — admin raw HTML (public). */}
      {analyticsScript ? (
        <div dangerouslySetInnerHTML={{ __html: analyticsScript }} />
      ) : null}
    </>
  );
}
