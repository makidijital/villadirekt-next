import Link from "next/link";

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
  embedded = false,
}: {
  locale?: Locale;
  /** 🛡️ Ana sayfada SSS ile aynı section'da SOL KOLON olarak render
   *  (kendi section/padding/bg/container'ı YOK; başlık sola hizalı,
   *  kompakt). Veri, kartlar, linkler ve carousel AYNEN. */
  embedded?: boolean;
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

  /* 🔄 Ay kartı başlığı — yalnız ay adı (yıl yok); ay sırası/slug AYNEN. */
  const monthOnly = (bm: string) => {
    const mm = /^\d{4}-(\d{2})-\d{2}$/.exec(bm.trim());
    return mm ? monthName(Number(mm[1])) : "";
  };

  const header = (
    <div className={embedded ? "mb-6 md:mb-8" : "text-center mb-8 md:mb-12"}>
      <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
        {dict.title}
      </h2>
      <p
        className={
          "text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md " +
          (embedded ? "mt-2" : "mt-3 mx-auto")
        }
      >
        {dict.subtitle}
      </p>
    </div>
  );

  /* 🔄 REFERANS DÜZEN — her AY ayrı, sade beyaz kolon/kart; içinde her
     gece sayısı ayrı satır (sol: "N gecelik villalar", sağ: gri pill
     "X villa"). Veri/sıra/link/koşul (count > 0) AYNEN; fotoğraf YOK. */
  const body = (
    <>
      {header}

      <HorizontalCarousel
        showArrows
        ariaLabel={dict.carouselAriaLabel}
        prevLabel={carouselDict.previous}
        nextLabel={carouselDict.next}
        className="pb-1"
        arrowsOutside
      >
        <ul role="list" className="flex flex-nowrap min-w-max gap-4 md:gap-5 py-2 px-1">
          {months.map((m) => (
            <li
              key={m.bucketMonth}
              className={
                "snap-start shrink-0 w-[78vw] max-w-[300px] sm:w-[260px] " +
                (embedded ? "lg:w-[250px]" : "lg:w-[300px]")
              }
            >
              <div className="h-full rounded-[16px] border border-[var(--color-stone-200)]/80 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(10,22,51,0.35)]">
                <h3 className="font-display font-bold text-[19px] leading-tight tracking-[-0.015em] text-[#0A1633]">
                  {monthOnly(m.bucketMonth) || m.label}
                </h3>
                <div aria-hidden="true" className="mt-3 mb-3.5 h-px bg-[var(--color-stone-100)]" />

                <ul className="flex flex-col gap-2.5">
                  {SHORT_GAP_NIGHTS.map((nights) => {
                    const count = m.counts.get(nights) ?? 0;
                    if (count <= 0) return null;
                    return (
                      <li key={nights}>
                        <Link
                          href={localeHref(`/kisa-sureli-tarihler/${m.slug}/${nights}`, locale)}
                          className="
                            flex items-center justify-between gap-3 min-h-[52px] px-3.5
                            rounded-[11px] border border-[var(--color-stone-200)]/80 bg-white
                            hover:border-brand/50 hover:shadow-[0_8px_18px_-14px_color-mix(in_srgb,var(--color-brand)_45%,transparent)] hover:-translate-y-px
                            transition-[border-color,box-shadow,transform] duration-200
                            motion-reduce:transition-none motion-reduce:hover:translate-y-0
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                          "
                        >
                          <span className="min-w-0 text-[13px] font-semibold text-[var(--color-stone-800)] truncate">
                            {formatDictionaryString(dict.nightsLabel, { n: nights })}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--color-stone-100)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--color-stone-500)] tabular-nums">
                            {formatDictionaryString(dict.villaCount, { count })}
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
    </>
  );

  if (embedded) {
    return (
      <div
        id="kisa-sureli-firsatlar"
        className="scroll-mt-24 md:scroll-mt-28 min-w-0 lg:flex-1"
      >
        {body}
      </div>
    );
  }

  return (
    <section
      id="kisa-sureli-firsatlar"
      className="scroll-mt-24 md:scroll-mt-28 px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-14 md:pb-20 bg-[var(--color-stone-50)] "
    >
      <div className="site-container">{body}</div>
    </section>
  );
}
