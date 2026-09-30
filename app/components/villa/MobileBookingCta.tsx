"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" — mevcut TR call-site'ı (kiralik-villa/[slug]/page.tsx)
   hiç değişmeden byte-identical render eder. Scroll-to-anchor/handler
   mantığına DOKUNULMADI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { type Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ MOBILE BOOKING CTA — sticky bottom bar (mobile/tablet only)
   ===============================================================
   AMAÇ:
     Villa detay sayfasında mobil kullanıcı uzun scroll yapmadan
     BookingSidebar'a hızlıca ulaşabilsin. Ekran altında sabit bir
     CTA bar; ortadaki "Rezervasyon Yap" butonuna tap → smooth scroll
     ile booking-sidebar anchor'una gider.

   🔄 3 PARÇALI CTA (bu tur — YALNIZ GÖRSEL):
     [WhatsApp ikon] · [Rezervasyon Yap (flex-1)] · [Telefon ikon]
     - FİYAT bu bardan KALDIRILDI. Fiyat hesaplama, BookingSidebar'ın
       kendi fiyat gösterimi, PriceList, price.engine ve rezervasyon
       akışı DEĞİŞMEDİ — yalnız bu bar artık fiyat basmıyor.
     - "Rezervasyon Yap" butonunun href'i (`#targetId`) ve `handleClick`
       scroll handler'ı BİREBİR AYNI; yalnız genişliği (flex-1) değişti.
     - WhatsApp/telefon href'leri PROP olarak gelir (VillaDetailBody
       `settings`'ten türetir — Header/Footer/FloatingSocial ile AYNI
       türetme). Bu dosyada hardcoded numara/URL YOK.

   DAVRANIŞ:
     - Mobile/tablet (<lg): fixed bottom-0 inset-x-0; daima görünür
     - Desktop (lg+): `lg:hidden` → render edilmez, mevcut
       `<aside lg:sticky lg:top-32>` sticky sidebar AYNEN çalışır
     - Tıklama: native `scrollIntoView({ behavior: "smooth", block:
       "start" })`; targetId DOM'da yoksa sessiz no-op
     - WhatsApp/telefon href'i null ise o aksiyon inert (opacity) render
       edilir → 3 parçalı düzen bozulmaz

   Z-INDEX (z-30) — landscape:
     z-1000+ modal (Booking/Gallery/Video) > z-50 CookieConsent +
     Header > z-40 FloatingSocial > **z-30 MobileBookingCta** >
     z-auto content. FloatingSocial bottom-right köşede üstte; cookie
     banner ilk ziyarette üstte; CTA banner kapanınca ortaya çıkar.

   SAFE-AREA:
     `pb-[env(safe-area-inset-bottom)]` iPhone notched cihazlarda
     home indicator zone'unu CTA içeriğinin altında bırakır.

   PRINT:
     `print:hidden` ile yazdırma çıktısında CTA görünmez.

   SSR-SAFE:
     "use client" component; SSR'da render olur (HTML var), client
     mount sonrası onClick handler bağlanır. Hidrasyon mismatch yok.

   DOKUNULMAYAN:
     - BookingSidebar.tsx (prop signature, iç mantığı)
     - BookingEngine state, rezervasyon akışı
     - Desktop sticky davranışı
=============================================================== */

export default function MobileBookingCta({
  targetId,
  locale,
  phoneHref = null,
  whatsappHref = null,
}: {
  /** Smooth scroll hedefi anchor id'si (page.tsx'te `<aside id=...>`). */
  targetId: string;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr". */
  locale?: Locale;
  /** `tel:` linki — VillaDetailBody `settings.phone`'dan türetir. */
  phoneHref?: string | null;
  /** WhatsApp linki — `settings.whatsapp_link` ya da wa.me fallback. */
  whatsappHref?: string | null;
}) {
  const dict = getDictionary(locale);
  const contactDict = dict.layout.floatingSocial;
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (typeof document === "undefined") return;

    /* 🛡️ MOBİL SCROLL HİZASI — "ikinci ekran" hedefi:
       [Header] altında → [TARİH] → [MİSAFİR].
       Öncelik: Tarih kartı (#booking-date-field) sticky header'ın HEMEN
       ALTINA hizalanır. Bulunamazsa aside (targetId) fallback (eski
       davranış korunur). Header yüksekliği GERÇEK DOM ölçümüyle alınır
       (sabit px yok → responsive + adres-çubuğu değişimine dayanıklı).
       Rezervasyon/tarih/fiyat/backend mantığına DOKUNULMAZ — yalnız
       scroll hizası. Desktop'ta bu component `lg:hidden` → handler hiç
       çalışmaz, mevcut sticky sidebar aynen. */
    const el =
      document.getElementById("booking-date-field") ||
      document.getElementById(targetId);
    if (!el) return;

    const header = document.querySelector("header");
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const GAP = 12; // Tarih kartının üstünde küçük, kontrollü boşluk

    const top =
      el.getBoundingClientRect().top + window.scrollY - headerH - GAP;

    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  return (
    <aside
      aria-label={dict.booking.mobileCtaAriaLabel}
      className="
        lg:hidden
        fixed inset-x-0 bottom-0
        z-30
        bg-white border-t border-[var(--color-stone-100)]
        shadow-[0_-12px_32px_-12px_rgba(27,26,23,0.18)]
        pb-[env(safe-area-inset-bottom)]
        px-4 pt-3
        flex items-center justify-between gap-3
        print:hidden
      "
    >
      {/* SOL: WhatsApp — gerçek marka glyph'i, mevcut link AYNEN. */}
      <ContactAction
        href={whatsappHref}
        label={contactDict.whatsapp}
        iconClass="text-[#25D366]"
        external
      >
        <WhatsappGlyph size={20} className="text-[#25D366]" />
      </ContactAction>

      {/* ORTA: CTA — href ve onClick handler'ı DEĞİŞMEDİ (SADECE görsel).
          🔄 DÜZ TURUNCU: `.btn-primary` (globals.css) turkuaz #03729c
          tabanı + turkuaz ambient shadow taşıyor; turuncu istendiği ve
          "ekstra efekt ekleme" dendiği için bu buton artık o class'ı
          KULLANMIYOR. Geometri BİREBİR korunuyor (globals.css:349-357
          ile aynı: inline-flex/center, gap 8px, padding 12px 22px →
          px-5 py-3, radius 999px → rounded-full, font-weight 600).
          Renk projenin mevcut marka turuncusu #ED7926 (Hero/FaqSection/
          HeroSearchPanel'de ZATEN kullanılan literal; CSS token'ı YOK).
          globals.css'e DOKUNULMADI → diğer tüm btn-primary'ler AYNEN. */}
      <Link
        href={`#${targetId}`}
        onClick={handleClick}
        className="
          flex-1 min-w-0
          inline-flex items-center justify-center gap-2
          rounded-full px-5 py-3
          bg-[#ED7926] hover:bg-[#D96B1D] active:bg-[#C25F16]
          text-white font-semibold text-[13.5px] tracking-[0.005em]
          border border-transparent
          transition-colors duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7926]/50
        "
      >
        {dict.booking.bookNow}
      </Link>

      {/* SAĞ: Telefon — lucide `Phone`, mevcut tel: linki AYNEN. */}
      <ContactAction
        href={phoneHref}
        label={contactDict.call}
        iconClass="text-[var(--brand-coral)]"
      >
        <Phone
          size={20}
          strokeWidth={2}
          className="text-[var(--brand-coral)]"
          aria-hidden
        />
      </ContactAction>
    </aside>
  );
}

/* Yuvarlak ikon aksiyonu (WhatsApp / telefon). btn-primary ile aynı
   pill radius'u (999px) ve ~44px dokunma hedefi; renk paleti mevcut
   token'lardan. href yoksa inert `<span>` → 3 parçalı düzen bozulmaz
   (BottomNav'daki ActionItem ile AYNI graceful-degradation deseni). */
function ContactAction({
  href,
  label,
  iconClass,
  external,
  children,
}: {
  href: string | null;
  label: string;
  iconClass: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-full " +
    "border border-[var(--color-stone-200)] bg-white " +
    "transition-colors duration-150 active:bg-[var(--color-stone-50)] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 " +
    iconClass;

  if (!href) {
    return (
      <span aria-disabled="true" className={className + " opacity-40"}>
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/* GERÇEK WhatsApp glyph'i — lucide-react'ta WhatsApp marka ikonu YOK.
   Path verisi projenin ZATEN kullandığı inline SVG'nin BİREBİR aynısı
   (app/components/layout/FloatingSocialClient.tsx · BottomNav.tsx) —
   yeni paket, yeni çizim veya emoji YOK. `fill="currentColor"` ile
   çağıranın verdiği `text-[#25D366]` rengi korunur. */
function WhatsappGlyph({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.157 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.477-.985zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}
