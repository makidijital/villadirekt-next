"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type SVGProps,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Phone, Mail } from "lucide-react";

import {
  getPublicSettingsAction as getPublicSettings,
} from "@/app/services/settings.action";
import type { Settings } from "@/app/services/settings.types";
import { useCurrency } from "@/app/context/CurrencyContext";

/* 🛡️ PHASE 10C — TopBar dil değiştirici (Admin > Genel Ayarlar >
   `multilingual_enabled` açıkken görünür). YENİDEN İCAT EDİLMEDİ:
     - Aktif locale tespiti: `localeFromPathname()` (Phase 9A,
       Header.tsx ile AYNI desen — middleware/headers() gerektirmez).
     - Hedef URL üretimi: `getLocaleSwitchTargets()` (Phase 10C,
       lib/i18n/locale-switch.helper.ts) → `buildLocaleAlternates()`
       (Phase 7B) üzerine kurulu; locale karşılığı olmayan route'lar
       için ASLA 404 üretmez, hedef locale'in ana sayfasına döner.
     - Dictionary: `getDictionary()` (mevcut sistem, yeni key YOK —
       yalnız `common.language` eklendi, hiçbir mevcut key
       değişmedi/silinmedi).
   Bu dropdown currency seçiciyle YALNIZ görsel/mekanik olarak
   ÖZDEŞ — state/ref/dışa-tık efekti TAMAMEN AYRI (aşağıda). */
import {
  isMultilingualEnabled,
  localeFromPathname,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ TopBar statik metinleri — `{no}` gibi token'lar MEVCUT helper ile
   doldurulur (yeni bir i18n mekanizması EKLENMEDİ). */
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { getLocaleSwitchTargets } from "@/lib/i18n/locale-switch.helper";
import { resolvePublicHome } from "@/lib/i18n/public-home";

/* 🛡️ TURSAB belge numarası — ÖNCEDEN de bu dosyada HARDCODED'di
   (settings şemasına dokunulmadı). Çeviri metninden AYRI tutulur ki
   numara üç dilde tekrarlanmasın; `header.agencyCredential`'ın `{no}`
   token'ına enjekte edilir. */
const TURSAB_LICENSE_NO = "13303";

/* `symbol` — kapalı tetikleyicide VE dropdown seçeneklerinde gösterilen
   para birimi sembolü (₺ / $ / € / £); ikisi de AYNI sunumu kullanır.
   `flag` alanı veri şeklini bozmamak için BIRAKILDI ama şu an hiçbir
   yerde render EDİLMİYOR (kur ≠ ülke; seçeneklerde de sembol gösteriliyor).
   Kur state'i / dönüşüm mantığı / seçim davranışı DOKUNULMADI. */
const CURRENCY_OPTIONS: { code: string; flag: string; symbol: string }[] = [
  { code: "TRY", flag: "/flags/tr.svg", symbol: "₺" },
  { code: "USD", flag: "/flags/us.svg", symbol: "$" },
  { code: "EUR", flag: "/flags/eu.svg", symbol: "€" },
  { code: "GBP", flag: "/flags/gb.svg", symbol: "£" },
];

/* Dil bayrakları — kapalı tetikleyicide seçili dil, dropdown'da her
   seçenek için. Projenin ZATEN kullandığı `/flags/*.svg`
   asset deseni (yukarıdaki CURRENCY_OPTIONS ile aynı). Emoji bilinçli
   olarak KULLANILMADI: bayrak emoji'leri Windows'ta render EDİLMEZ.
   `de.svg` bu tur eklendi; tr/gb zaten mevcuttu. Yeni paket/library YOK. */
const LOCALE_FLAGS: Record<Locale, string> = {
  tr: "/flags/tr.svg",
  en: "/flags/gb.svg",
  de: "/flags/de.svg",
};

/* ═══════════════════════════════════════════════════════════════
   🛡️ TOPBAR REDESIGN — inline brand-colored sosyal ikonlar
   ═══════════════════════════════════════════════════════════════
   Önceki sürüm `stroke="currentColor"` monokrom outline ikonlar
   kullanıyordu (Footer ile aynı path verisi). Redesign talebi
   gereği artık ikonlar kendi GERÇEK platform marka kimliğini
   taşıyor (Instagram gradient, Facebook mavisi #1877F2, WhatsApp
   yeşili #25D366, YouTube kırmızısı #FF0000, TikTok siyah+cyan/
   pembe glitch rozeti) — badge/rozet biçimi zaten bu markaların
   resmi logo diliyle birebir örtüşüyor. Site marka renkleri
   (#ED7926 / #0973BA) BİLİNÇLİ OLARAK bu ikonlara uygulanmadı;
   talep gereği sosyal ikonlar bu kuralın istisnası. Yeni harici
   icon library YOK — tamamen inline SVG (mevcut yaklaşımın devamı).
   ═══════════════════════════════════════════════════════════════ */
const InstagramIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <defs>
      <linearGradient id="topbar-ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#FEE411" />
        <stop offset="25%" stopColor="#FD5949" />
        <stop offset="55%" stopColor="#D6249F" />
        <stop offset="100%" stopColor="#285AEB" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#topbar-ig-grad)" />
    <rect
      x="6.3"
      y="6.3"
      width="11.4"
      height="11.4"
      rx="3.4"
      fill="none"
      stroke="#fff"
      strokeWidth="1.5"
    />
    <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.5" />
    <circle cx="16.4" cy="7.6" r="0.9" fill="#fff" />
  </svg>
);

const FacebookIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="#1877F2" />
    <path
      fill="#fff"
      d="M15.4 8.4h-1.3c-.5 0-.9.4-.9 1v1.5h2.1l-.3 2.1h-1.8V19h-2.2v-6h-1.7v-2.1h1.7v-1.8c0-1.7 1-2.7 2.6-2.7.75 0 1.4.06 1.6.08v1.92z"
    />
  </svg>
);

const WhatsappIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="#25D366" />
    <path
      fill="#fff"
      d="M12 6.4c-3.06 0-5.53 2.47-5.53 5.53 0 1.02.28 1.98.76 2.8l-.8 2.93 3-.79a5.5 5.5 0 0 0 2.57.64c3.06 0 5.53-2.48 5.53-5.53S15.06 6.4 12 6.4zm3.16 7.9c-.13.37-.77.72-1.06.76-.27.04-.62.06-1-.06a9 9 0 0 1-.88-.34 6.5 6.5 0 0 1-2.43-2.15 2.9 2.9 0 0 1-.6-1.52c0-.45.24-.67.34-.76.09-.1.2-.12.27-.12h.19c.06 0 .14-.01.22.17.09.18.29.67.31.72.02.05.04.11.01.18-.03.06-.05.1-.1.16l-.15.17c-.05.06-.1.1-.05.2.06.11.27.44.56.71.39.35.72.46.82.51.09.05.14.03.19-.02l.27-.31c.07-.09.14-.07.23-.04l.71.33c.08.04.14.06.16.1.03.07.03.35-.1.71z"
    />
  </svg>
);

const YoutubeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <rect x="2" y="4.5" width="20" height="15" rx="4.5" fill="#FF0000" />
    <path d="M10.1 8.5l6.1 3.5-6.1 3.5V8.5z" fill="#fff" />
  </svg>
);

const TiktokIcon = (props: SVGProps<SVGSVGElement>) => {
  const notePath =
    "M14.2 5.5c.4 1.7 1.7 3 3.4 3.3v2.3a5.6 5.6 0 0 1-3.4-1.15v5.1a4.6 4.6 0 1 1-4.6-4.6c.16 0 .32 0 .47.02v2.35a2.25 2.25 0 1 0 1.83 2.2V5.5h2.3z";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#010101" />
      <path d={notePath} fill="#25F4EE" transform="translate(-0.35 -0.35)" />
      <path d={notePath} fill="#FE2C55" transform="translate(0.35 0.35)" />
      <path d={notePath} fill="#fff" />
    </svg>
  );
};

/* Sosyal ikon link'i — badge kendi marka rengini taşıdığı için hover
   artık renk yerine hafif scale/opacity lift (tek satır micro-interaction,
   motion-reduce safe). */
function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="
        inline-flex items-center justify-center
        opacity-85 hover:opacity-100 hover:-translate-y-[1px] hover:scale-105
        transition-[opacity,transform] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100
        focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:rounded-md
      "
    >
      {children}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════
   🛡️ DİL SEÇİCİ SEÇENEK LİSTESİ — query string KORUMALI
   ═══════════════════════════════════════════════════════════════
   Dropdown'un `<ul role="listbox">` içeriği BİREBİR aynı (DOM/class/
   ARIA değişmedi); yalnız ayrı bir component'e taşındı. GEREKÇE:
   hedef URL'lerin mevcut query string'i (ör. `/arama?villa-turleri=
   ...&flexible=3`) koruyabilmesi için `useSearchParams()` gerekli —
   `usePathname()` query TAŞIMAZ. `useSearchParams()` statik
   prerender'da en yakın Suspense sınırına kadar client-render
   zorladığı için bu component ÇAĞRI YERİNDE `<Suspense>` ile
   sarmalanır; böylece TopBar'ın geri kalanı (ve public layout'taki
   tüm sayfalar) statik render davranışını AYNEN korur.
   `searchParams.toString()` çıktısı uygulamanın kendi URL üreticileriyle
   (FilterSidebar `buildHref`, AramaPageBody `buildAramaSearchHref` —
   ikisi de `URLSearchParams.toString()`) AYNI encoding'i kullanır. */
function LocaleSwitchOptions({
  locale,
  pathname,
  label,
  onSelect,
  trHomePath,
}: {
  locale: Locale;
  pathname: string | null;
  label: string;
  onSelect: () => void;
  /* 🔄 Varsayılan dil EN/DE iken TR ana sayfanın yolu ("/tr").
     Varsayılan "tr" iken "/" gelir → davranış BYTE-IDENTICAL. */
  trHomePath: string;
}) {
  const searchParams = useSearchParams();
  const localeSwitchTargets = getLocaleSwitchTargets(
    pathname,
    searchParams.toString(),
    trHomePath
  );

  return (
    <ul
      role="listbox"
      aria-label={label}
      className="absolute right-0 mt-2 z-50 min-w-[90px] bg-white rounded-xl border border-[var(--color-stone-100)] shadow-[0_16px_36px_-14px_rgb(11_31_58/0.35)] overflow-hidden py-1"
    >
      {SUPPORTED_LOCALES.map((l: Locale) =>
        l === locale ? (
          <li key={l}>
            <span
              role="option"
              aria-selected="true"
              aria-current="true"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] font-medium text-left bg-gradient-to-r from-[#ED7926]/10 to-[#0973BA]/10 text-[var(--color-stone-900)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOCALE_FLAGS[l]}
                alt=""
                className="w-4 h-3 rounded-[1px] object-cover shrink-0"
              />
              {l.toUpperCase()}
            </span>
          </li>
        ) : (
          <li key={l}>
            <Link
              href={localeSwitchTargets[l]}
              role="option"
              aria-selected="false"
              onClick={onSelect}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[14px] font-medium text-left text-[var(--color-stone-700)] hover:bg-[var(--color-stone-50)] transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOCALE_FLAGS[l]}
                alt=""
                className="w-4 h-3 rounded-[1px] object-cover shrink-0"
              />
              {l.toUpperCase()}
            </Link>
          </li>
        )
      )}
    </ul>
  );
}

export default function TopBar() {
  /* 🛡️ Faz 9 hardening: `useState<any>` → `Settings | null`. DEĞİŞMEDİ. */
  const [settings, setSettings] = useState<Settings | null>(null);
  const { currency, setCurrency } = useCurrency();

  // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
  //   getSettings async; component hızlı unmount olursa stale
  //   setState yarış koşulu önlenir. DEĞİŞMEDİ.
  useEffect(() => {
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      setSettings(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 🛡️ Currency dropdown (custom — native <select> emoji bayrakları
     Windows'ta render edilmiyordu). State + dışa-tık ile kapanır.
     DEĞİŞMEDİ — mekanik birebir korunuyor, yalnız görsel stil yenilendi. */
  const [curOpen, setCurOpen] = useState(false);
  const curRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!curOpen) return;
    const onDown = (e: MouseEvent) => {
      if (curRef.current && !curRef.current.contains(e.target as Node)) {
        setCurOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [curOpen]);

  /* 🛡️ PHASE 10C — Aktif locale, `usePathname()` + `localeFromPathname()`
     (Phase 9A, Header.tsx/Footer.tsx ile BİREBİR AYNI desen) ile
     tespit edilir. TopBar zaten "use client" — middleware/headers()
     gerektirmez, yeni bir cache/fetch katmanı YOK. */
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const dictionary = getDictionary(locale);

  /* 🛡️ Dil seçici dropdown — currency seçiciyle (`curOpen`/`curRef`)
     AYNI mekanik (state + dışa-tık kapanma) ama TAMAMEN AYRI state/
     ref/efekt. Kullanıcı talebi gereği İKİSİ ASLA PAYLAŞILMAZ. */
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!langOpen) return;
    const onDown = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [langOpen]);

  if (!settings) return null;

  /* 🛡️ PHASE 10C — Dil değiştirici GÖRÜNÜRLÜK KOŞULU: yalnız
     `settings.multilingual_enabled === true` (null/undefined/hata →
     `isMultilingualEnabled` false döner, `!settings` guard'ı zaten
     settings null/fetch-hatası durumunu üstte fail-safe kapatıyor).
     `getLocaleSwitchTargets` yalnız switcher görünürken hesaplanır
     (gereksiz iş yok). */
  const multilingualEnabled = isMultilingualEnabled(settings);

  /* 🔄 TR ana sayfa yolu — `settings` ZATEN yukarıda okundu, ek fetch
     YOK. Kural tek kaynaktan gelir (lib/i18n/public-home.ts, saf).
     Varsayılan "tr" veya multilingual kapalı → "/" (bugünkü davranış). */
  const { trHomeHref } = resolvePublicHome(settings);

  /* 🛡️ İLETİŞİM HREF TÜRETME — mevcut projede zaten kullanılan
     pattern'lerin AYNISI (yeni mantık YOK, sadece TopBar'a taşındı):
       - tel:      → FloatingSocial.tsx / Footer.tsx ile birebir
       - WhatsApp  → settings.whatsapp_link öncelik; yoksa telefon
                     hanesinden wa.me fallback (FloatingSocial.tsx /
                     app/(public)/layout.tsx ile birebir aynı türetme)
       - mailto:   → Footer.tsx ile birebir */
  const phoneHref = settings.phone?.trim() ? `tel:${settings.phone.trim()}` : null;
  const phoneDigits = (settings.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);
  const emailHref = settings.email?.trim() ? `mailto:${settings.email.trim()}` : null;

  /* ═══════════════════════════════════════════════════════════
     🌊 TOPBAR REDESIGN — 3 bölüm: SOL (iletişim) / ORTA (Costeralla
     Travel · TURSAB) / SAĞ (sosyal + kur)
     ═══════════════════════════════════════════════════════════
     KORUNAN FONKSİYON (davranış/veri katmanı hiç dokunulmadı):
       - Settings fetch + cancellation guard
       - useCurrency context + setCurrency (site-geneli fiyatlandırma)
       - Currency custom dropdown (SVG bayrak) + dışa-tık kapanış
       - TRY/USD/EUR/GBP seçenekleri AYNEN

     YENİ (yalnız UI/render/stil):
       - SOL: 7/24 Destek (küçük pulse-dot) + WhatsApp/Telefon/E-posta
         (settings-driven, md+ görünür — mobilde alanı sıkıştırmamak
         için gizli; kapsam notunda belirtildiği gibi izinli).
       - ORTA: "Costeralla Travel" + "TURSAB A Grubu Acenta · Belge No:
         13303" — bu aşamada HARDCODED (settings şemasına dokunulmadı).
         Artık TÜM breakpoint'lerde görünür (eski `hidden md:flex`
         kaldırıldı). Hafif ışıltı: turuncu→mavi (#ED7926→#0973BA)
         gradient metin + ince, yavaş (4s) ışık geçişi sweep — mevcut
         globals.css `@keyframes shimmer` (skeleton loader ile AYNI,
         yeni CSS eklenmedi) inline `animation` ile reuse edilir.
         `motion-reduce:hidden` ile erişilebilirlik korunur.
       - SAĞ: sosyal ikonlar (md+ görünür) + kur seçici (TÜM
         breakpoint'lerde görünür — mobilde de kalması ZORUNLU talep).

     Height: py değeri AYNEN (`py-[6px]`) — büyüme yalnız zorunlu
     2 satırlı ORTA metin içeriğinden kaynaklanır, ekstra padding
     eklenmedi. Z-index / sticky / fixed davranışı bu dosyada YOK —
     Header.tsx'teki `fixed`/`z-50` sarmalayıcıya dokunulmadı.
     ═══════════════════════════════════════════════════════════ */
  return (
    <div
      className="
        flex items-center gap-2 md:gap-4 lg:gap-6
        px-4 md:px-10 lg:px-12 py-[6px]
        bg-[var(--color-stone-900)]
        text-white
      "
    >
      {/* SOL — İletişim (7/24 Destek + Telefon + E-posta). WhatsApp bu
          bölümden kaldırıldı (SAĞ sosyal medya grubunda aynen kalıyor).
          Mobilde sıkışmayı/taşmayı önlemek için md+ görünür. */}
      <div className="hidden md:flex items-center gap-4 lg:gap-5 shrink-0 text-[14px]">
        {/* 7/24 DESTEK — premium, küçük; pulse abartısız (tek küçük nokta). */}
        <div className="flex items-center gap-1.5 text-white/85">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#ED7926] opacity-70 animate-ping motion-reduce:animate-none" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ED7926]" />
          </span>
          <span className="font-medium tracking-[0.14em] uppercase text-[11.5px] whitespace-nowrap">
            {dictionary.header.supportBadge}
          </span>
        </div>

        {(phoneHref || emailHref) && (
          <span aria-hidden className="h-3 w-px bg-white/15" />
        )}

        {phoneHref && (
          <a
            href={phoneHref}
            className="
              flex items-center gap-1.5
              text-white/75 hover:text-white
              transition-colors motion-reduce:transition-none
            "
          >
            <Phone size={15} strokeWidth={1.85} className="text-[#ED7926]" aria-hidden />
            <span className="font-medium tabular-nums whitespace-nowrap">
              {settings.phone}
            </span>
          </a>
        )}

        {emailHref && (
          <a
            href={emailHref}
            className="
              flex items-center gap-1.5
              text-white/75 hover:text-white
              transition-colors motion-reduce:transition-none
            "
          >
            <Mail size={15} strokeWidth={1.85} className="text-[#0973BA]" aria-hidden />
            <span className="max-w-[170px] truncate">{settings.email}</span>
          </a>
        )}
      </div>

      {/* ORTA — Costeralla Travel · TURSAB (hardcoded, bkz. yorum bloğu).
          TÜM breakpoint'lerde görünür (zorunlu mobil görünürlük). */}
      <div className="relative flex-1 min-w-0 flex flex-col items-center justify-center overflow-hidden py-px">
        <div className="relative inline-flex flex-col items-center max-w-full">
          <span
            className="
              relative z-10
              font-display font-semibold
              text-[12px] sm:text-[13px] md:text-[14px]
              tracking-[0.015em]
              leading-tight
              whitespace-nowrap truncate max-w-full
              bg-clip-text text-transparent
              bg-gradient-to-r from-[#ED7926] to-[#0973BA]
            "
          >
            Costeralla Travel
          </span>
          <span
            className="
              relative z-10
              text-[9px] sm:text-[10px] md:text-[10.5px]
              tracking-[0.06em]
              leading-tight
              whitespace-nowrap truncate max-w-full
              text-white/55
              mt-0.5
            "
          >
            {formatDictionaryString(dictionary.header.agencyCredential, {
              no: TURSAB_LICENSE_NO,
            })}
          </span>

          {/* Işıltı — çok hafif, yavaş (4s) ışık geçişi. Mevcut globals.css
              `@keyframes shimmer` (skeleton loader) reuse edilir; yeni
              keyframe eklenmedi. Neon/rahatsız edici blink YOK. */}
          <span
            aria-hidden
            className="absolute inset-0 z-20 pointer-events-none motion-reduce:hidden"
          >
            <span
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(100deg, transparent 42%, rgba(255,255,255,0.45) 50%, transparent 58%)",
                transform: "translateX(-100%)",
                animation: "shimmer 4s ease-in-out infinite",
              }}
            />
          </span>
        </div>
      </div>

      {/* SAĞ — Sosyal medya (md+ görünür) + Kur seçici (TÜM breakpoint'lerde
          görünür — zorunlu mobil görünürlük). */}
      <div className="flex items-center gap-3 md:gap-4 shrink-0">
        <div className="hidden md:flex items-center gap-2.5">
          {settings.instagram && (
            <SocialLink href={settings.instagram} label="Instagram">
              <InstagramIcon width={21} height={21} aria-hidden />
            </SocialLink>
          )}
          {settings.facebook && (
            <SocialLink href={settings.facebook} label="Facebook">
              <FacebookIcon width={21} height={21} aria-hidden />
            </SocialLink>
          )}
          {whatsappHref && (
            <SocialLink href={whatsappHref} label="WhatsApp">
              <WhatsappIcon width={21} height={21} aria-hidden />
            </SocialLink>
          )}
          {settings.youtube && (
            <SocialLink href={settings.youtube} label="YouTube">
              <YoutubeIcon width={21} height={21} aria-hidden />
            </SocialLink>
          )}
          {settings.tiktok && (
            <SocialLink href={settings.tiktok} label="TikTok">
              <TiktokIcon width={21} height={21} aria-hidden />
            </SocialLink>
          )}
        </div>

        {(settings.instagram ||
          settings.facebook ||
          whatsappHref ||
          settings.youtube ||
          settings.tiktok) && (
          <span aria-hidden className="hidden md:block h-4 w-px bg-white/15" />
        )}

        {/* Kur seçici — MEKANİK DEĞİŞMEDİ (aynı state/dışa-tık/useCurrency);
            yalnız görsel stil "modern/kompakt/premium" hedefiyle yenilendi. */}
        <div className="relative shrink-0" ref={curRef}>
          <button
            type="button"
            onClick={() => setCurOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={curOpen}
            className="
              inline-flex items-center gap-1.5
              rounded-full px-2.5 py-[3px]
              bg-white/10 hover:bg-white/[0.16]
              ring-1 ring-inset ring-white/10 hover:ring-white/25
              text-white/90 hover:text-white
              text-[14px] font-medium cursor-pointer
              transition-colors
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-[#0973BA]/60
            "
          >
            {/* 🔄 Seçili kurun SEMBOLÜ (₺ / $ / € / £). Yalnız görsel —
                `currency` state'i, `setCurrency`, dönüşüm mantığı ve
                dropdown DEĞİŞMEDİ. */}
            <span aria-hidden className="shrink-0 leading-none">
              {CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol ??
                ""}
            </span>
            {currency}
            <ChevronDown size={11} className="text-white/55" />
          </button>

          {curOpen && (
            <ul
              role="listbox"
              className="absolute right-0 mt-2 z-50 min-w-[110px] bg-white rounded-xl border border-[var(--color-stone-100)] shadow-[0_16px_36px_-14px_rgb(11_31_58/0.35)] overflow-hidden py-1"
            >
              {CURRENCY_OPTIONS.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.code === currency}
                    onClick={() => {
                      setCurrency(c.code);
                      setCurOpen(false);
                    }}
                    className={
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[14px] font-medium text-left transition-colors " +
                      (c.code === currency
                        ? "bg-gradient-to-r from-[#ED7926]/10 to-[#0973BA]/10 text-[var(--color-stone-900)]"
                        : "text-[var(--color-stone-700)] hover:bg-[var(--color-stone-50)]")
                    }
                  >
                    {/* 🔄 Seçeneğin KENDİ kur sembolü (₺ / $ / € / £) —
                        kapalı tetikleyicideki sunumla BİREBİR aynı.
                        `aria-hidden` + sabit genişlik: erişilebilir ad
                        `c.code` olarak KALIR (mevcut testler bu adla
                        eşleşiyor) ve satırlar hizalı durur. `onClick`/
                        `setCurrency`/state DEĞİŞMEDİ. */}
                    <span
                      aria-hidden
                      className="w-4 shrink-0 text-center leading-none"
                    >
                      {c.symbol}
                    </span>
                    {c.code}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 🛡️ PHASE 10C — Dil değiştirici. Currency seçiciyle
            (yukarıdaki `curRef` bloğu) GÖRSEL/MEKANİK olarak ÖZDEŞ —
            rounded-pill buton + ChevronDown + aynı absolute dropdown
            stili. State/ref TAMAMEN AYRI (`langOpen`/`langRef`).
            Yalnız `multilingualEnabled` iken render edilir — kapalı/
            null/hata durumunda hiçbir DOM eklenmez (fail-safe). */}
        {multilingualEnabled && (
          <div className="relative shrink-0" ref={langRef}>
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={dictionary.common.language}
              className="
                inline-flex items-center gap-1.5
                rounded-full px-2.5 py-[3px]
                bg-white/10 hover:bg-white/[0.16]
                ring-1 ring-inset ring-white/10 hover:ring-white/25
                text-white/90 hover:text-white
                text-[14px] font-medium cursor-pointer
                transition-colors
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-[#0973BA]/60
              "
            >
              {/* 🔄 Seçili DİLİN bayrağı — kur seçicinin `<img>` deseniyle
                  BİREBİR aynı sınıflar. Yalnız SEÇİLİ olanın bayrağı
                  basılır; locale çözümleme/dropdown/navigasyon
                  DEĞİŞMEDİ. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOCALE_FLAGS[locale]}
                alt=""
                className="w-4 h-3 rounded-[1px] object-cover shrink-0"
              />
              {locale.toUpperCase()}
              <ChevronDown size={11} className="text-white/55" />
            </button>

            {langOpen && (
              <Suspense fallback={null}>
                <LocaleSwitchOptions
                  locale={locale}
                  pathname={pathname}
                  label={dictionary.common.language}
                  onSelect={() => setLangOpen(false)}
                  trHomePath={trHomeHref}
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
