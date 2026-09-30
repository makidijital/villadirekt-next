import HeaderWrapper from "@/app/components/layout/HeaderWrapper";
/* 🛡️ PHASE 9B — Footer, HeaderWrapper/Header deseninin birebir aynısına
   taşındı: DB/service veri-çekimi artık FooterWrapper'da (async server),
   Footer.tsx artık "use client" (usePathname ile locale tespiti, bkz. o
   dosya). Bu satır DIŞINDA bu layout dosyasında HİÇBİR değişiklik YOK —
   maintenance-mode gate, getCachedSettings, phoneHref/whatsappHref
   türetimi BİREBİR aynı. headers()/cookies() KULLANILMADI; bu dosyanın
   static/ISR rendering uygunluğu ETKİLENMEDİ. */
import FooterWrapper from "@/app/components/layout/FooterWrapper";
import CookieConsent from "@/app/components/layout/CookieConsent";
/* 🛡️ PUBLIC ÇOKLU DİL — bakım ekranı client island'a taşındı (locale
   `usePathname` ile türetilir). DOM/className/metin sırası BİREBİR aynı;
   `settings.maintenance_message` canonical kalır. */
import MaintenanceScreen from "@/app/components/layout/MaintenanceScreen";
import FloatingSocial from "@/app/components/layout/FloatingSocial";
import BottomNav from "@/app/components/layout/BottomNav";
import ScrollToTopButton from "@/app/components/layout/ScrollToTopButton";
import { getCachedSettings } from "@/lib/cache.helpers";
import { resolvePublicHome } from "@/lib/i18n/public-home";
/* 🛡️ SEC-05 Phase 2 — GTM + custom head/analytics alanları root
   layout'tan buraya taşındı (admin panelinde çalışmasın diye). */
import SiteTrackingScripts from "@/app/components/layout/SiteTrackingScripts";
/* 🛡️ Açılış/kampanya popup'ı (migration 095). Kapalıysa hiç render
   edilmez; aktifse hafif client loader karar verip modalı lazy yükler. */
import SitePopupLoader from "@/app/components/layout/site-popup/SitePopupLoader";
import { getCachedSitePopup } from "@/lib/site-popup.cache";

/* ===============================================================
   🛡️ PUBLIC LAYOUT — MAINTENANCE MODE GATE
   ===============================================================
   🛡️ PHASE 10M — Bakım ekranı bu dosyaya INLINE geri taşındı.
   Phase 10L'de yalnız bakım MESAJININ çevirisini seçebilmek için
   ayrı bir client component'e (`MaintenanceScreen.tsx`) çıkarılmıştı;
   o çeviri kapsamdan kaldırıldığı (migration 084) için component'in
   varlık nedeni ortadan kalktı ve dosya SİLİNDİ. Blok, Phase 10L
   ÖNCESİ haliyle BİREBİR geri yüklendi — DOM, className'ler, metin
   sırası, "Bakım" etiketi ve Türkçe varsayılan mesaj DEĞİŞMEDİ;
   `usePathname`/`localeFromPathname`/`resolveSettingsText` client
   mantığı tamamen kalktı. Mesaj yine CANONICAL
   `settings.maintenance_message` değerinden gelir.
   ---------------------------------------------------------------

   settings.maintenance_mode === true ise public site bakım
   ekranıyla değiştirilir. /maki-admin/* bu layout altında DEĞİL
   (ayrı admin layout) → bakım sırasında admin çalışmaya devam
   eder, login erişilebilir, static assets etkilenmez.
   =============================================================== */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getCachedSettings().catch(() => null);
  if (settings?.maintenance_mode === true) {
    const brand = settings?.site_name?.trim() || "Villa Kiralama";
    /* 🛡️ `settings.maintenance_message` CANONICAL kalır (migration 084
       kararı DEĞİŞMEDİ). Boşsa dictionary varsayılanı gösterilir; "Bakım"
       etiketi ve varsayılan metin locale-aware (bkz. MaintenanceScreen). */
    /* 🛡️ SEC-05 Phase 2 — root layout'tayken bakım modunda da
       yükleniyordu; davranış korunur. */
    return (
      <>
        <SiteTrackingScripts settings={settings} />
        <MaintenanceScreen brand={brand} message={settings?.maintenance_message} />
      </>
    );
  }

  /* 🛡️ Mobil BottomNav için WhatsApp/Telefon href'leri — FloatingSocial
     ile BİREBİR aynı türetme (yeni business logic YOK). */
  const phoneHref = settings?.phone?.trim()
    ? `tel:${settings.phone.trim()}`
    : null;
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  /* 🔄 TR ana sayfa yolu — varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİDİR, TR ana sayfa "/tr"'de yaşar. `settings` ZATEN
     yukarıda okundu → EK FETCH YOK. Varsayılan "tr" veya multilingual
     kapalı → "/" (BYTE-IDENTICAL). */
  const { trHomeHref } = resolvePublicHome(settings);

  /* Popup — ayrı cache tag'i ("site-popup"); hata/tablo yok → null
     (site etkilenmez). */
  const sitePopup = await getCachedSitePopup().catch(() => null);

  return (
    <>
    {/* 🛡️ SEC-05 Phase 2 — takip/özel script alanları (public-only).
       public-shell'in ÖNCESİNDE → önceki DOM sırası (body başı) korunur. */}
    <SiteTrackingScripts settings={settings} />
    <div className="public-shell flex flex-col min-h-screen bg-[var(--color-ivory)]">
      {/* HEADER */}
      <HeaderWrapper />

      {/* CONTENT */}
      <main className="flex-1">
        <div className="w-full">{children}</div>
      </main>

      {/* FOOTER */}
      <FooterWrapper />

      {/* 🛡️ Floating Social — fixed bottom-right WhatsApp/Instagram/YouTube
         widget'i. Server component; settings'ten okur, üç href de boşsa
         null döner. z-40 → modaller (1000/1100) ve cookie banner (50)
         üstte kalır; Hero/Header/SearchPanel dokunulmadan additive
         entegrasyon. Bakım modunda render edilmez (early-return). */}
      <FloatingSocial />

      {/* 📱 Mobil Bottom Navigation — yalnız <md; villa detayında (kendi
         MobileBookingCta'sı var) otomatik gizlenir. Desktop'ta render
         edilir ama `md:hidden` ile görünmez → FloatingSocial desktop'ta
         aynen çalışır. Href'ler server'da türetilip prop geçilir. */}
      <BottomNav
        phoneHref={phoneHref}
        whatsappHref={whatsappHref}
        trHomeHref={trHomeHref}
      />

      {/* ⬆️ Scroll-to-top — sol alt floating client island; scrollY>400'de
         görünür. z-40 (cookie/modaller üstte kalır), bottom-20 md:bottom-8
         (mobil MobileBookingCta bar'ını temizler). Additive; layout
         yapısına dokunmaz. */}
      <ScrollToTopButton />

      {/* 🍪 Çerez onay banner'ı — client-only island, SSR-safe, additive.
         Bakım modunda render edilmez (yukarıdaki early-return). */}
      <CookieConsent />

      {sitePopup && <SitePopupLoader popup={sitePopup} />}
    </div>
    </>
  );
}
