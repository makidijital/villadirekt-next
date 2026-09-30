"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Phone, type LucideIcon } from "lucide-react";

import SearchBottomSheet from "@/app/components/layout/SearchBottomSheet";
/* 🛡️ PHASE 11 — locale prefix'ini soymak için (Phase 7B helper'ı). */
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
/* 🛡️ PHASE 11 — locale, Header (9A) / Footer (9B) ile AYNI şekilde
   ZATEN VAR OLAN `pathname`'den türetilir. Layout'a (server) dokunulmadı;
   `headers()`/`cookies()` KULLANILMADI. */
import { DEFAULT_LOCALE, localeFromPathname } from "@/lib/i18n/config";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ BOTTOM NAVIGATION — MOBİL (iOS/Airbnb kalitesi, premium)
   ===============================================================
   Yalnız MOBİL (`md:hidden`). Desktop'ta FloatingSocial aynen kalır.
   4 eşit-genişlik item: Anasayfa · Arama · WhatsApp · Telefon.
   WhatsApp/Telefon href'leri PROP olarak gelir (server layout
   `settings`'ten türetir — YENİ business logic YOK).

   🔄 "Öneri Al" (/teklif-al) öğesi bu bardan KALDIRILDI (yalnız mobil
   alt bar; /teklif-al route'u, Header/Footer/TopBar linkleri ve
   dictionary anahtarı `layout.bottomNav.offer` DEĞİŞMEDİ). Grid
   5 → 4 sütuna indirildi ki boş sütun kalmasın; yükseklik, konum,
   padding, renk, border, active-state ve responsive davranış AYNEN.

   🔎 ARAMA: route'a GİTMEZ; premium `SearchBottomSheet` açar. Sheet içinde
   mevcut paylaşılan `VillaSearchBox` (Hero/Header ile AYNI canlı arama)
   compose edilir → duplicate logic YOK, mevcut davranış aynen.

   VILLA DETAY (`/kiralik-villa/<slug>`) → MobileBookingCta zaten alt barın
   sahibi; İKİ alt bar olmaması için nav TAMAMEN gizlenir (null).
   Z-INDEX z-40 (modal 1000+ > Header/Cookie 50 > BottomNav 40 >
   MobileBookingCta 30 > içerik). Arama sheet'i z-[1000] (modal katmanı).
   =============================================================== */

interface BottomNavProps {
  phoneHref: string | null;
  whatsappHref: string | null;
  /* 🔄 TR ana sayfanın yolu. Varsayılan dil EN/DE iken "/" bir
     YÖNLENDİRİCİ olduğu için public layout "/tr" geçer; aksi halde
     (ve prop hiç verilmezse) "/" → davranış BYTE-IDENTICAL. */
  trHomeHref?: string;
}

const ITEM_BASE =
  "group flex h-[70px] w-full flex-col items-center justify-center gap-1 " +
  "transition-[color,transform] duration-150 ease-out " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 focus-visible:ring-inset";

const LABEL_CLASS = "text-[10.5px] font-medium leading-none tracking-tight";

export default function BottomNav({
  phoneHref,
  whatsappHref,
  trHomeHref = "/",
}: BottomNavProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  /* 🛡️ PHASE 11 — LOCALE PREFIX BUG DÜZELTMESİ.
     Önceden `pathname` HAM kullanılıyordu; `/en/kiralik-villa/x` ve
     `/de/kiralik-villa/x` `startsWith("/kiralik-villa/")` ile
     EŞLEŞMİYORDU → EN/DE villa detayında ÇİFT alt bar çıkıyordu.
     Aynı şekilde `/en` ana sayfasında "Anasayfa" sekmesi aktif
     görünmüyordu.

     Çözüm mevcut helper'la: `buildLocaleAlternates(path, "tr")`
     (Phase 7B) `/en`,`/de` prefix'ini segment-sınırlı şekilde soyup
     TR-eşdeğeri base path'i verir — `getLocaleSwitchTargets` ile AYNI
     desen. Yeni bir path/locale mantığı İCAT EDİLMEDİ. TR path'lerinde
     `basePath === pathname` olduğu için davranış BİREBİR AYNI kalır. */
  const basePath = buildLocaleAlternates(pathname || "/", "tr").languages.tr;

  /* 🛡️ PHASE 11 — locale AYRI bir türetme; yukarıdaki `basePath`
     (P0'da eklenen prefix-soyma) mantığına DOKUNULMADI. */
  const locale = localeFromPathname(pathname);
  const dict = getDictionary(locale);
  const navDict = dict.layout.bottomNav;

  // Villa detay → tek alt bar (MobileBookingCta) kalsın; nav gizle.
  if (basePath.startsWith("/kiralik-villa/")) return null;

  /* `/tr` (MOD B'deki TR ana sayfa) da "ana sayfa" sayılır —
     `stripLocalePrefix` yalnız /en,/de soyduğu için basePath "/tr"
     olarak gelir. MOD A'da `trHomeHref === "/"` → koşul BİREBİR
     eskisi gibi çalışır. */
  const isActive = (href: string) =>
    href === "/" || href === trHomeHref
      ? basePath === "/" || basePath === trHomeHref
      : basePath === href;

  return (
    <>
      {/* Spacer — içerik/footer barın arkasında kalmasın (yalnız mobil). */}
      <div
        aria-hidden
        className="md:hidden h-[calc(70px+env(safe-area-inset-bottom))]"
      />

      <nav
        aria-label={navDict.ariaLabel}
        className="
          md:hidden
          fixed inset-x-0 bottom-0 z-40
          bg-white/90 backdrop-blur-sm
          border-t border-[var(--color-stone-200)]
          shadow-[0_-8px_24px_-18px_rgba(2,6,23,0.28)]
          pb-[env(safe-area-inset-bottom)]
          print:hidden
        "
      >
        <ul className="grid grid-cols-4">
          <li>
            <InternalItem
              href={
                locale === DEFAULT_LOCALE
                  ? trHomeHref
                  : localeHref("/", locale)
              }
              label={dict.header.home}
              Icon={Home}
              active={isActive("/")}
            />
          </li>

          {/* 🔎 Arama — route DEĞİL, premium bottom sheet açar. */}
          <li>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={navDict.searchAriaLabel}
              aria-haspopup="dialog"
              aria-expanded={searchOpen}
              className={
                ITEM_BASE +
                " " +
                (searchOpen
                  ? "text-[var(--brand-coral)]"
                  : "text-[var(--color-stone-400)] active:text-[var(--color-stone-600)]")
              }
            >
              <Search
                size={21}
                strokeWidth={searchOpen ? 2.4 : 2}
                className="transition-transform duration-150 group-active:scale-105"
                aria-hidden
              />
              <span className={LABEL_CLASS}>{navDict.search}</span>
            </button>
          </li>

          {/* WhatsApp — ikon daima yeşil; label okunabilir stone. */}
          <li>
            <ActionItem
              href={whatsappHref}
              label="WhatsApp"
              Icon={WhatsappGlyph}
              iconClass="text-[#25D366]"
              external
            />
          </li>

          {/* Telefon — ikon daima brand; label okunabilir stone. */}
          <li>
            <ActionItem
              href={phoneHref}
              label={dict.footer.phone}
              Icon={Phone}
              iconClass="text-[var(--brand-coral)]"
            />
          </li>
        </ul>
      </nav>

      {/* Premium arama bottom-sheet — mevcut VillaSearchBox compose eder. */}
      <SearchBottomSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        locale={locale}
      />
    </>
  );
}

/* İç route link'i (Anasayfa) — aktifse brand rengi. */
function InternalItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={
        ITEM_BASE +
        " " +
        (active
          ? "text-[var(--brand-coral)]"
          : "text-[var(--color-stone-400)] active:text-[var(--color-stone-600)]")
      }
    >
      <Icon
        size={21}
        strokeWidth={active ? 2.4 : 2}
        className="transition-transform duration-150 group-active:scale-105"
        aria-hidden
      />
      <span className={LABEL_CLASS}>{label}</span>
    </Link>
  );
}

/* External aksiyon (tel: / wa.me). href yoksa inert (opacity, non-link)
   → 5 sütunlu grid bozulmaz. WCAG için label okunabilir stone; marka
   rengi ikonda taşınır. */
function ActionItem({
  href,
  label,
  Icon,
  iconClass,
  external,
}: {
  href: string | null;
  label: string;
  /* `LucideIcon` VEYA aynı prop yüzeyini karşılayan inline glyph
     (bkz. WhatsappGlyph). `LucideIcon` bu tipe atanabilir → mevcut
     Phone kullanımı DEĞİŞMEDİ. */
  Icon: NavActionIcon;
  iconClass: string;
  external?: boolean;
}) {
  const content = (
    <>
      <Icon
        size={21}
        strokeWidth={2}
        className={
          "transition-transform duration-150 group-active:scale-105 " + iconClass
        }
        aria-hidden
      />
      <span className={LABEL_CLASS + " text-[var(--color-stone-500)]"}>
        {label}
      </span>
    </>
  );

  if (!href) {
    return (
      <span aria-disabled="true" className={ITEM_BASE + " opacity-40"}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label={label}
      className={ITEM_BASE}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {content}
    </a>
  );
}

/* ActionItem'ın ikonundan beklediği minimum prop yüzeyi. `LucideIcon`
   bu tipe atanabilir (Phone aynen çalışır); inline marka glyph'leri de
   uyar — yeni bir ikon paketi EKLENMEDİ. */
type NavActionIcon = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

/* GERÇEK WhatsApp glyph'i — lucide-react'ta WhatsApp marka ikonu YOK
   (önceden genel `MessageCircle` sohbet balonu kullanılıyordu). Path
   verisi projenin ZATEN kullandığı inline SVG'nin BİREBİR aynısı
   (app/components/layout/FloatingSocialClient.tsx) — yeni paket, yeni
   çizim veya emoji YOK. `fill="currentColor"` sayesinde çağıranın
   verdiği `text-[#25D366]` rengi AYNEN korunur.

   `strokeWidth`/`aria-hidden` prop'ları tip uyumu için kabul edilir;
   dolu (filled) bir glyph olduğu için stroke uygulanmaz, `aria-hidden`
   SVG üzerinde zaten sabittir. */
function WhatsappGlyph({
  size = 21,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
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
