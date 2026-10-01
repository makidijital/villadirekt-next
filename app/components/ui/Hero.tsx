import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  resolveHeroContent,
  type HeroContent,
} from "@/lib/hero.helpers";

import HeroSearchPanel from "./hero/_components/HeroSearchPanel";
/* 🛡️ PHASE 11 — Hero locale-aware. İÇERİK (badge/title/subtitle/CTA
   metinleri) zaten `resolveHeroContent` tarafından locale'e göre
   çözülüp `content` prop'uyla gelir; burada yalnız görsel alt metni
   ve arama panelinin locale'i kalır. CTA HREF'leri ve hero görseli
   DİL BAĞIMSIZDIR — bu dosyada o mantık DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

import type { HeroReviewStats } from "./hero/_types/hero";

/* ===============================================================
   🛡️ HERO — KOMPAKT İKİ KOLON
   ===============================================================
   - Full-viewport DEĞİL: yükseklik içerik + padding'den gelir
     (eski min-h-[60svh] lg:min-h-[78svh] kaldırıldı).
   - SOL: rozet, başlık, açıklama, CTA'lar (admin metinleri AYNEN).
   - SAĞ: tek villa görseli (admin hero görseli `backgroundImage`);
     overlay / gradient / floating kart / kolaj YOK.
   - ALT: HeroSearchPanel — iç yapısı ve davranışı AYNEN.
   - Ana hiza: site-container (1152px). Mobil: metin → görsel → arama.

   DOKUNULMAYAN İŞ MANTIĞI (AYNEN):
     - HeroSearchPanel state/URL push/datepicker portal
     - hero.helpers HeroContent shape + resolveHeroContent fallback'leri
     - HeroCta href yönlendirme mantığı
     - HeroReviewStats type contract (render edilmiyor, önceden de öyle)
   `hero.overlayOpacity` artık görsel üzerinde karartma olmadığı için
   kullanılmıyor (alan helper'da korunur).
=============================================================== */

/** Re-export caller path stability. */
export type { HeroReviewStats };

/* ===============================================================
   HeroCta — admin-driven CTA link, akıllı href yönlendirme.
   Buton TEXT + LINK admin settings'ten gelir (hero.primaryCta /
   secondaryCta). Link tipi href'ten türetilir:
     - `#...`            → aynı sayfa smooth scroll (globals:
                            html{scroll-behavior:smooth} + section
                            scroll-mt offset). Plain <a>.
     - `http(s)://...`   → harici, yeni sekme (target=_blank).
     - `mailto:` / `tel:`→ harici protocol, plain <a>.
     - `/...` (diğer)    → dahili route, next/link <Link>.
   Stil/içerik caller'dan (className + children) gelir; bu helper
   yalnız doğru elementi seçer. Hero layout/stiline dokunmaz.
   BU FONKSİYON DEĞİŞMEDİ — yalnızca çağıran yerdeki className/children
   (görsel katman) güncellendi. =============================== */
function HeroCta({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  if (/^https?:\/\//i.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  if (href.startsWith("mailto:") || href.startsWith("tel:")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function Hero({
  content,
  reviewStats,
  locale = DEFAULT_LOCALE,
}: {
  content?: HeroContent;
  reviewStats?: HeroReviewStats | null;
  locale?: Locale;
}) {
  const dict = getDictionary(locale).home.hero;
  /* Defensive: prop verilmediyse defaults. */
  const hero: HeroContent = content || resolveHeroContent(null, { locale });
  const titleLines = (hero.title || "").split("\n");

  /* reviewStats render edilmiyor (önceki versiyonda da öyleydi —
     HeroReviewCard kaldırılmıştı) — ama prop type contract caller'a
     (page.tsx) BOZULMASIN diye signature aynen tutuluyor. void to
     silence unused warning. */
  void reviewStats;

  return (
    <section
      className="
        relative z-20
        w-full
        px-5 md:px-10 lg:px-16
        bg-[var(--color-ivory)]
      "
    >
      {/* ═══════════════════════════════════════════════════════════
          KOMPAKT HERO — içerik yüksekliği kadar (full-viewport DEĞİL).
          Ana hiza: site-container (var(--container-6xl) = 1152px).
          Desktop: SOL metin (~%50) · SAĞ tek villa görseli.
          Mobil: metin üstte → görsel altta → arama paneli.
          Gradient / karartma / floating kart YOK.
          ═══════════════════════════════════════════════════════════ */}
      <div className="site-container pt-8 md:pt-12 lg:pt-14 pb-6 md:pb-8">
        <div
          className={
            "grid grid-cols-1 items-center gap-8 md:gap-10 lg:gap-12 " +
            (hero.backgroundImage ? "lg:grid-cols-2" : "")
          }
        >
          {/* ─── SOL — COPY BLOCK ─────────────────────────────── */}
          <div className="min-w-0">
            {/* Eyebrow — 🛡️ Admin "Hero Rozet Metni" boşsa
               (`hero.badge === ""`) HİÇ render edilmez. */}
            {hero.badge && (
              <p
                className="
                  inline-flex items-center gap-2.5
                  rounded-full border border-[var(--color-stone-200)] bg-white
                  px-4 py-2
                  text-[11px] tracking-[0.28em] uppercase font-medium
                  text-[var(--color-stone-700)]
                "
              >
                <span
                  aria-hidden="true"
                  className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60"
                  />
                </span>
                {hero.badge}
              </p>
            )}

            {/* Başlık — ilk satır koyu, sonraki satırlar marka mavisi.
               🛡️ Admin "Hero Başlığı" boşsa H1 HİÇ render edilmez. */}
            {hero.title && (
              <h1
                className="
                  font-display
                  text-[32px] sm:text-[38px] md:text-[46px] lg:text-[52px]
                  leading-[1.02] tracking-[-0.03em]
                  text-[var(--color-stone-900)]
                  mt-5 md:mt-6
                "
              >
                {titleLines.map((line, i) => (
                  <span
                    key={i}
                    className={i === 0 ? "block" : "block text-brand"}
                  >
                    {line}
                  </span>
                ))}
              </h1>
            )}

            {/* Açıklama */}
            {hero.subtitle && (
              <p
                className="
                  text-[15px] md:text-[16.5px] leading-[1.7]
                  text-[var(--color-stone-500)]
                  mt-5 md:mt-6
                  max-w-xl whitespace-pre-line
                "
              >
                {hero.subtitle}
              </p>
            )}

            {/* CTA row — admin-driven (hero.primaryCta / secondaryCta);
               HeroCta href yönlendirme mantığı DEĞİŞMEDİ. Metni boş CTA
               render edilmez; ikisi de boşsa satır da render edilmez. */}
            {(hero.primaryCta || hero.secondaryCta) && (
              <div className="mt-7 md:mt-8 flex flex-wrap items-center gap-3">
                {hero.primaryCta && (
                  <HeroCta
                    href={hero.primaryCta.href}
                    className="
                      group relative inline-flex items-center
                      px-6 py-3 rounded-full
                      text-white text-[13.5px] font-medium tracking-[0.02em]
                      bg-brand hover:bg-brand-strong
                      shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]
                      hover:-translate-y-[1px]
                      transition-[transform,background-color] duration-300
                      motion-reduce:transition-none motion-reduce:hover:translate-y-0
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ivory)]
                    "
                  >
                    <span className="relative z-10 inline-flex items-center gap-2">
                      {hero.primaryCta.text}
                      <ArrowUpRight
                        size={15}
                        className="transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                        aria-hidden
                      />
                    </span>
                  </HeroCta>
                )}
                {hero.secondaryCta && (
                  <HeroCta
                    href={hero.secondaryCta.href}
                    className="
                      group inline-flex items-center gap-2
                      px-5 py-3 rounded-full
                      border border-[var(--color-stone-200)] bg-white
                      text-[var(--color-stone-900)]
                      text-[13.5px] font-medium tracking-[0.02em]
                      hover:border-brand hover:text-brand
                      hover:-translate-y-[1px]
                      transition-[transform,border-color,color] duration-300
                      motion-reduce:transition-none motion-reduce:hover:translate-y-0
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                    "
                  >
                    {hero.secondaryCta.text}
                  </HeroCta>
                )}
              </div>
            )}
          </div>

          {/* ─── SAĞ — TEK VİLLA GÖRSELİ (admin hero görseli) ─────
             Tek <Image>; overlay / gradient / floating kart YOK.
             priority → LCP; aspect-ratio kutusu → CLS=0. */}
          {hero.backgroundImage && (
            <div
              className="
                relative w-full overflow-hidden
                aspect-[4/3]
                rounded-3xl
                bg-[var(--color-stone-100)]
                shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]
              "
            >
              <Image
                src={hero.backgroundImage}
                alt={hero.title || dict.imageAlt}
                fill
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover object-center"
              />
            </div>
          )}
        </div>

        {/* ─── ARAMA PANELİ — hero içeriğinin ALTINDA, AYNEN ───── */}
        <HeroSearchPanel locale={locale} />
      </div>

      {/* 🛡️ DATEPICKER PORTAL TARGET — HeroSearchPanel'in
         react-datepicker portalId="hero-datepicker-portal" hedefi. */}
      <div id="hero-datepicker-portal" />
    </section>
  );
}
