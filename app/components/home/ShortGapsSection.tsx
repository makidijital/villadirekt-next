import Link from "next/link";
import { CalendarRange, ArrowUpRight, Sparkles } from "lucide-react";

import { shortGapsRepository } from "@/lib/db/short-gaps.repository";
import HorizontalCarousel from "../villa/HorizontalCarousel";
import {
  SHORT_GAP_NIGHTS,
  bucketMonthLabel,
  bucketMonthToSlug,
} from "@/lib/short-gaps.helpers";
/* 🛡️ PHASE 11 — ay adları artık hardcoded TR dizisinden DEĞİL,
   dictionary'den (`home.months`) geliyor. TR değerleri
   `lib/short-gaps.helpers.ts > MONTH_NAMES_TR` ile BİREBİR aynı →
   TR etiketleri ("Ocak 2026") DEĞİŞMEZ. Link yapısı (ASCII ay slug'ı)
   DİL BAĞIMSIZ kalır — `bucketMonthToSlug` DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { MonthNumber } from "@/lib/i18n/dictionaries/types";

/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — ANA SAYFA SECTION (server component)
   ===============================================================
   Mevcut homepage section paterni (CategoryCollection/LocationCollection):
     - Server-only render, kendi verisini çeker (get_short_gap_counts RPC).
     - Veri yoksa null döner → layout sessizce gizlenir (CLS yok).
     - Hiçbir mevcut sistemi etkilemez; salt-okuma.

   SAYI = DISTINCT villa sayısı (RPC count(DISTINCT villa_id)).
   minimum_stay_nights KULLANILMAZ.
   =============================================================== */

type GapCountRow = {
  bucket_month: string;
  gap_nights: number;
  villa_count: number;
};

type MonthGroup = {
  bucketMonth: string;
  label: string;
  slug: string;
  counts: Map<number, number>; // gap_nights → villa_count
};

export default async function ShortGapsSection({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.shortGaps;
  const carouselDict = getDictionary(locale).home.carousel;
  const months_ = getDictionary(locale).home.months;
  const monthName = (m: number) => months_[m as MonthNumber] ?? "";
  const { data, error } = await shortGapsRepository.getShortGapCounts();
  if (error || !Array.isArray(data) || data.length === 0) return null;

  /* Ay bazında grupla (RPC zaten bucket_month, gap_nights sıralı döner). */
  const byMonth = new Map<string, MonthGroup>();
  for (const row of data as GapCountRow[]) {
    const bm = String(row.bucket_month);
    const nights = Number(row.gap_nights);
    const count = Number(row.villa_count);
    if (!bm || count <= 0) continue;

    let group = byMonth.get(bm);
    if (!group) {
      group = {
        bucketMonth: bm,
        label: bucketMonthLabel(bm, monthName),
        slug: bucketMonthToSlug(bm),
        counts: new Map(),
      };
      byMonth.set(bm, group);
    }
    group.counts.set(nights, count);
  }

  const months = Array.from(byMonth.values()).filter(
    (m) => m.label && m.slug && m.counts.size > 0
  );
  if (months.length === 0) return null;

  return (
    <section
      id="kisa-sureli-firsatlar"
      className="scroll-mt-24 md:scroll-mt-28 px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-14 md:pb-20 bg-gradient-to-b from-[#f5f7fa] to-[#e8eef6]"
    >
      {/* 🛡️ Component-scoped premium hover styles — globals.css'e
          dokunulmadı; yalnız bu section'daki .sg-* class'larını
          hedefler. Sadece hover-tetiklenen tek seferlik geçişler
          (infinite/otomatik animasyon YOK) — prefers-reduced-motion
          altında da zaten sorunsuz (transition kapanır, statik kalır). */}
      <style>{`
        .sg-shine {
          position: relative;
          overflow: hidden;
        }
        .sg-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.10) 48%, rgba(255,255,255,0.16) 52%, transparent 65%);
          transform: translateX(-100%);
          transition: transform 900ms ease;
          pointer-events: none;
        }
        .group:hover .sg-shine::after {
          transform: translateX(100%);
        }
        @media (prefers-reduced-motion: reduce) {
          .sg-shine::after { transition: none; display: none; }
        }
      `}</style>

      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {dict.title}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            {dict.subtitle}
          </p>
        </div>

        <HorizontalCarousel
          showArrows
          ariaLabel={dict.carouselAriaLabel}
          prevLabel={carouselDict.previous}
          nextLabel={carouselDict.next}
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-5 md:gap-6">
            {months.map((m) => (
              <li
                key={m.bucketMonth}
                className="snap-start shrink-0 w-[80vw] max-w-[300px] sm:w-[320px] md:w-[300px] lg:w-[320px]"
              >
                <div
                  className={
                    "group relative overflow-hidden rounded-[26px] p-5 h-full flex flex-col " +
                    "bg-gradient-to-br from-[#0B1F3A] via-[#0F2540] to-[#132A46] " +
                    "shadow-[0_18px_40px_-22px_rgba(11,31,58,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] " +
                    "ring-1 ring-white/10 " +
                    "hover:shadow-[0_28px_54px_-22px_rgba(11,31,58,0.65)] hover:ring-[var(--brand-coral)]/30 " +
                    "hover:-translate-y-[3px] " +
                    "transition-[transform,box-shadow] duration-400 motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
                    "sg-shine"
                  }
                >
                  {/* ── HEADER — büyük editorial ay tipografisi + fırsat rozeti ── */}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-coral)]">
                        <Sparkles size={11} strokeWidth={2.2} aria-hidden />
                        {dict.badge}
                      </span>
                      <h3 className="mt-1.5 font-display font-medium text-[24px] md:text-[26px] text-white leading-[1.05] tracking-[-0.02em] truncate">
                        {m.label}
                      </h3>
                    </div>
                    <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-white/[0.06] text-white/80 ring-1 ring-white/10">
                      <CalendarRange className="w-[18px] h-[18px]" />
                    </span>
                  </div>

                  {/* Brand accent underline — turuncu→mavi, ince */}
                  <div
                    aria-hidden="true"
                    className="mt-3 mb-4 h-[3px] w-14 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
                  />

                  {/* ── GECE LİSTESİ — mevcut veri/link/sayı BİREBİR aynı ── */}
                  <ul className="flex flex-col gap-1 flex-1">
                    {SHORT_GAP_NIGHTS.map((nights) => {
                      const count = m.counts.get(nights) ?? 0;
                      if (count <= 0) return null;
                      return (
                        <li key={nights}>
                          <Link
                            href={localeHref(`/kisa-sureli-tarihler/${m.slug}/${nights}`, locale)}
                            className="group/row flex items-center justify-between rounded-xl px-3 py-2.5 -mx-1 hover:bg-white/[0.06] transition-colors motion-reduce:transition-none"
                          >
                            <span className="text-[13.5px] text-white/75 group-hover/row:text-white transition-colors motion-reduce:transition-none">
                              {formatDictionaryString(dict.nightsLabel, {
                                n: nights,
                              })}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums">
                              <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-[#ED7926]/20 to-[#0973BA]/20 text-white ring-1 ring-white/10 leading-none">
                                {count}
                              </span>
                              <ArrowUpRight className="w-3.5 h-3.5 text-white/40 group-hover/row:text-[var(--brand-coral)] group-hover/row:translate-x-0.5 transition-[color,transform] motion-reduce:transition-none" />
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </HorizontalCarousel>
      </div>
    </section>
  );
}
