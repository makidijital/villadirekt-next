import Link from "next/link";
import Image from "next/image";
import { CalendarRange, ArrowUpRight } from "lucide-react";

import { shortGapsRepository } from "@/lib/db/short-gaps.repository";
import { getCachedVillas } from "@/lib/cache.helpers";
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

  /* 🔄 FIRSAT TÜRÜ KARTLARI — her (ay × gece) grubu bir kart. Sıra/
     koşul/sayı/link mevcut veriyle BİREBİR (ay sırası RPC'den, gece
     sırası SHORT_GAP_NIGHTS). */
  const groups = months.flatMap((m) =>
    SHORT_GAP_NIGHTS.filter((n) => (m.counts.get(n) ?? 0) > 0).map((nights) => ({
      key: `${m.bucketMonth}-${nights}`,
      bucketMonth: m.bucketMonth,
      label: m.label,
      slug: m.slug,
      nights,
      count: m.counts.get(nights) ?? 0,
    }))
  );
  if (groups.length === 0) return null;

  /* 🔄 Kart görseli — o gruptaki GERÇEK villaların kapak görseli.
     Mevcut repo (`findGapsByMonthNights`, /kisa-sureli-tarihler sayfası
     ile aynı kaynak) + mevcut cached villa listesi (images[0]). Salt
     okuma; hata/boşlukta görselsiz (placeholder) kart. Aynı fotoğraf
     mümkünse iki kartta tekrar kullanılmaz. */
  /* Görsel okuması hiçbir koşulda bölümü düşürmez (senkron hata dahil). */
  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const [villaList, gapLists] = await Promise.all([
    safe(() => getCachedVillas(), []),
    Promise.all(
      groups.map((g) =>
        safe(async () => {
          const r = await shortGapsRepository.findGapsByMonthNights(g.bucketMonth, g.nights);
          return Array.isArray(r?.data) ? (r.data as Array<{ villa_id: string }>) : [];
        }, [] as Array<{ villa_id: string }>)
      )
    ),
  ]);
  const coverByVilla = new Map<string, string>();
  for (const v of villaList) {
    const img = Array.isArray(v.images) ? v.images[0] : null;
    if (v.id && typeof img === "string" && img) coverByVilla.set(String(v.id), img);
  }
  const usedCovers = new Set<string>();
  const coverFor = (idx: number): string | null => {
    const ids = Array.from(new Set(gapLists[idx].map((r) => String(r.villa_id))));
    const covers = ids.map((id) => coverByVilla.get(id)).filter((c): c is string => !!c);
    const pick = covers.find((c) => !usedCovers.has(c)) ?? covers[0] ?? null;
    if (pick) usedCovers.add(pick);
    return pick;
  };
  const cards = groups.map((g, i) => ({ ...g, cover: coverFor(i) }));
  const countBadge = getDictionary(locale).home.villaTypes.countBadge;

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

  const body = (
    <>
      {header}

      <HorizontalCarousel
        showArrows
        ariaLabel={dict.carouselAriaLabel}
        prevLabel={carouselDict.previous}
        nextLabel={carouselDict.next}
        className="pb-1"
      >
        <ul role="list" className="flex flex-nowrap min-w-max gap-4 md:gap-5 py-2 px-1">
          {cards.map((c) => (
            <li
              key={c.key}
              className={
                "snap-start shrink-0 w-[68vw] max-w-[260px] sm:w-[240px] " +
                (embedded ? "lg:w-[238px]" : "lg:w-[260px]")
              }
            >
              {/* 🔄 Fotoğraflı fırsat kartı — kategori/bölge kartlarıyla aynı
                  dil: hafif radius, gerçek villa görseli, yalnız alt kısımda
                  hafif koyulaştırma, hover'da zoom + lift. Link AYNEN. */}
              <Link
                href={localeHref(`/kisa-sureli-tarihler/${c.slug}/${c.nights}`, locale)}
                className="
                  group relative block aspect-[4/5] overflow-hidden rounded-[14px]
                  bg-[var(--color-stone-100)]
                  shadow-[0_14px_34px_-22px_rgba(0,0,0,0.28)]
                  hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.36)] hover:-translate-y-[3px]
                  transition-[transform,box-shadow] duration-500
                  motion-reduce:transition-none motion-reduce:hover:translate-y-0
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2
                "
              >
                {c.cover ? (
                  <Image
                    src={c.cover}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 68vw, 260px"
                    className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                ) : (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-brand/30">
                    <CalendarRange size={40} strokeWidth={1.4} />
                  </span>
                )}

                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(#0000_45%,#0000002e_72%,#0000009e_100%)]"
                />

                {/* Ay — küçük beyaz çip */}
                <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] font-semibold text-[var(--color-stone-800)] shadow-[0_4px_12px_-6px_rgba(0,0,0,0.3)]">
                  <CalendarRange size={12} strokeWidth={2} className="text-brand" aria-hidden />
                  {c.label}
                </span>

                {/* Alt — gece türü + villa sayısı + sarı CTA ok */}
                <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-[18px] leading-tight text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">
                      {formatDictionaryString(dict.nightsLabel, { n: c.nights })}
                    </h3>
                    <p className="mt-0.5 text-[12px] font-medium text-white/85 tabular-nums [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
                      {formatDictionaryString(countBadge, { count: c.count })}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent text-[var(--color-stone-900)] transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  >
                    <ArrowUpRight size={15} strokeWidth={2.2} />
                  </span>
                </div>
              </Link>
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
