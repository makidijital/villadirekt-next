"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
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
import { getLocaleSwitchTargets } from "@/lib/i18n/locale-switch.helper";
import { resolvePublicHome } from "@/lib/i18n/public-home";

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
      className="absolute right-0 mt-2 z-50 min-w-[90px] bg-white rounded-xl border border-[var(--color-stone-100)] shadow-[0_16px_36px_-14px_rgb(0_0_0/0.35)] overflow-hidden py-1"
    >
      {SUPPORTED_LOCALES.map((l: Locale) =>
        l === locale ? (
          <li key={l}>
            <span
              role="option"
              aria-selected="true"
              aria-current="true"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-left bg-brand/10 text-[var(--color-stone-900)]"
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
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-left text-[var(--color-stone-700)] hover:bg-[var(--color-stone-50)] transition-colors"
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
       - mailto:   → Footer.tsx ile birebir */
  const phoneHref = settings.phone?.trim() ? `tel:${settings.phone.trim()}` : null;
  const emailHref = settings.email?.trim() ? `mailto:${settings.email.trim()}` : null;

  /* ═══════════════════════════════════════════════════════════
     🌊 TOPBAR — 3 bölüm: SOL (iletişim) / ORTA (boş ara alan) /
     SAĞ (kur + dil seçici)
     ═══════════════════════════════════════════════════════════
     KORUNAN FONKSİYON (davranış/veri katmanı hiç dokunulmadı):
       - Settings fetch + cancellation guard
       - useCurrency context + setCurrency (site-geneli fiyatlandırma)
       - Currency custom dropdown (SVG bayrak) + dışa-tık kapanış
       - TRY/USD/EUR/GBP seçenekleri AYNEN

     YENİ (yalnız UI/render/stil):
       - SOL: Telefon/E-posta
         (settings-driven, md+ görünür — mobilde alanı sıkıştırmamak
         için gizli; kapsam notunda belirtildiği gibi izinli).
       - ORTA: içerik YOK — yalnız `flex-1` ara alan (sol/sağ hizası
         korunur).
       - SAĞ: kur seçici + dil seçici (TÜM breakpoint'lerde görünür).
         Sosyal medya ikonları TopBar'dan kaldırıldı.

     Height: py değeri AYNEN (`py-[6px]`), ekstra padding eklenmedi. Z-index / sticky / fixed davranışı bu dosyada YOK —
     Header.tsx'teki `fixed`/`z-50` sarmalayıcıya dokunulmadı.
     ═══════════════════════════════════════════════════════════ */
  return (
    <div
      className="
        px-4 md:px-10 lg:px-16
        bg-brand
        text-white
      "
    >
      <div
        className="
          site-container
          flex items-center gap-2 md:gap-4 lg:gap-6
          py-[6px]
        "
      >
      {/* SOL — İletişim. Telefon TÜM breakpoint'lerde görünür (mobilde
          sol alan boş kalmasın); e-posta sıkışmayı önlemek için md+. */}
      <div className="flex items-center gap-4 lg:gap-5 shrink-0 text-[12px]">
        {phoneHref && (
          <a
            href={phoneHref}
            className="
              flex items-center gap-1.5
              text-white/75 hover:text-white
              transition-colors motion-reduce:transition-none
            "
          >
            <Phone size={15} strokeWidth={1.85} className="text-accent" aria-hidden />
            <span className="font-medium tabular-nums whitespace-nowrap">
              {settings.phone}
            </span>
          </a>
        )}

        {emailHref && (
          <a
            href={emailHref}
            className="
              hidden md:flex items-center gap-1.5
              text-white/75 hover:text-white
              transition-colors motion-reduce:transition-none
            "
          >
            <Mail size={15} strokeWidth={1.85} className="text-accent" aria-hidden />
            <span className="max-w-[170px] truncate">{settings.email}</span>
          </a>
        )}
      </div>

      {/* ORTA — boş ara alan (sol içerik solda, kur/dil sağda kalır). */}
      <div aria-hidden className="flex-1 min-w-0" />

      {/* SAĞ — Kur seçici + dil seçici (TÜM breakpoint'lerde görünür —
          zorunlu mobil görünürlük). */}
      <div className="flex items-center gap-3 md:gap-4 shrink-0">
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
              text-[12px] font-medium cursor-pointer
              transition-colors
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-accent/70
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
              className="absolute right-0 mt-2 z-50 min-w-[110px] bg-white rounded-xl border border-[var(--color-stone-100)] shadow-[0_16px_36px_-14px_rgb(0_0_0/0.35)] overflow-hidden py-1"
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
                      "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium text-left transition-colors " +
                      (c.code === currency
                        ? "bg-brand/10 text-[var(--color-stone-900)]"
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
                text-[12px] font-medium cursor-pointer
                transition-colors
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-accent/70
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
    </div>
  );
}
