"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/* 🛡️ Canlı arama artık server action üzerinden (villa.repository +
   @/lib/db client bundle'a girmez); aynı SELECT/filter/ilike/limit. */
import { searchVillas } from "./villa-search.action";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";
/* 🛡️ PHASE 11 — YALNIZ UI metinleri locale-aware. Arama action'ı,
   debounce, sonuç mantığı ve `variant` sistemi DEĞİŞMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";

/* ===============================================================
   🛡️ VILLA SEARCH BOX — paylaşılan canlı arama (header + hero)
   ===============================================================
   Önceden Header.tsx içinde INLINE idi (desktop + mobile, paylaşılan
   state). Hero'ya taşınabilmesi için DUPLIKASYON OLMADAN buraya
   çıkarıldı. State + debounce effect + outside-click + getImage +
   dropdown JSX BİREBİR korundu (davranış değişmedi).

   variant:
     - "desktop" → header sağ pill (md:flex)
     - "mobile"  → header strip input (md:hidden)
     - "hero"    → Hero içi premium glassmorphism, full-width box
     - "sheet"   → mobil bottom-sheet; SUNUM katmanı — dropdown absolute
       DEĞİL, doğal akışta (içerikle uyumlu yükseklik); sonuç seçilince
       sheet kapanış animasyonu (200ms) BİTİNCE navigate. Logic (state +
       debounce + searchVillas + getImage + sonuç satırı içeriği) diğer
       variantlarla AYNEN paylaşılır — duplicate YOK. Diğer variantlar
       (hero/desktop/mobile/sticky) bu variant'tan ETKİLENMEZ.
   onResultNavigate: sonuç tıklanınca ekstra callback (header mobile
     drawer'ı kapatmak için setOpen(false); sheet için sheet'i kapatır).
   =============================================================== */

type Variant = "desktop" | "mobile" | "hero" | "sticky" | "sheet";

export default function VillaSearchBox({
  variant = "desktop",
  placeholder,
  onResultNavigate,
  locale = DEFAULT_LOCALE,
}: {
  variant?: Variant;
  /** 🛡️ GERİYE DÖNÜK UYUM: verilirse AYNEN kullanılır; verilmezse
   *  locale'e göre `layout.search.placeholder`'a düşer (TR'de eski
   *  varsayılan "Villa ara..." ile BİREBİR aynı metin). */
  placeholder?: string;
  onResultNavigate?: () => void;
  locale?: Locale;
}) {
  const dictionary = getDictionary(locale);
  const searchDict = dictionary.layout.search;
  const placeholderText = placeholder ?? searchDict.placeholder;
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const router = useRouter();

  /* 🛡️ LIVE SEARCH — debounce + memory-leak guard (Header'dan birebir).
     `cancelled` flag: debounce geç tetiklemesi veya response gelmeden
     unmount olursa setState çağrılmaması için. */
  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      const data = await searchVillas(search, 5);
      if (cancelled) return;
      setResults(data || []);
      setLoading(false);
      setOpenSearch(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    const handleClick = () => setOpenSearch(false);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const getImage = (villa: any) => {
    if (!villa.villa_images?.length) return "/placeholder.jpg";
    const sorted = villa.villa_images.sort((a: any, b: any) => {
      if (a.is_cover) return -1;
      if (b.is_cover) return 1;
      return a.sort_order - b.sort_order;
    });
    /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından
       URL; legacy FULL URL pass-through, relative path → URL. */
    return resolveVillaImageUrl(sorted[0]?.image_url) || "/placeholder.jpg";
  };

  /* ── Variant presentation (yalnız stiller; mantık ortak) ───────── */
  const containerClass =
    variant === "hero"
      ? "relative flex items-center gap-3 w-full max-w-xl rounded-3xl px-6 py-4 bg-gradient-to-b from-white/82 to-white/64 backdrop-blur-xl border border-[var(--color-champagne-500)]/25 shadow-[0_26px_60px_-22px_rgba(11,31,58,0.45),0_10px_26px_-14px_rgba(2, 170, 229,0.20),inset_0_1px_0_rgba(255,255,255,0.65)] transition-[box-shadow,border-color] duration-300 motion-reduce:transition-none focus-within:border-[var(--color-champagne-500)]/55 focus-within:shadow-[0_30px_66px_-20px_rgba(11,31,58,0.5),0_0_0_4px_rgba(2, 170, 229,0.14),0_10px_26px_-12px_rgba(2, 170, 229,0.32),inset_0_1px_0_rgba(255,255,255,0.7)]"
      : variant === "sticky"
        ? "relative flex items-center gap-2 flex-1 min-w-0"
      : variant === "mobile"
        ? "relative flex items-center bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] rounded-full px-3 py-1.5 flex-1 min-w-0 max-w-[160px]"
        : "relative flex items-center rounded-full border bg-[var(--color-sand-50)] border-[var(--color-stone-100)] text-[var(--color-stone-700)] px-4 py-2 transition-colors duration-300 motion-reduce:transition-none";

  const iconSize =
    variant === "hero" ? 19 : variant === "sticky" ? 16 : variant === "mobile" ? 14 : 15;

  /* Hero/sticky'de turkuaz accent (daha belirgin); header
     variant'larında nötr stone-400 KORUNUR. */
  const iconClass =
    variant === "hero" || variant === "sticky"
      ? "text-[var(--brand-coral)] shrink-0"
      : "text-[var(--color-stone-400)] shrink-0";

  const inputClass =
    variant === "hero"
      ? "!bg-transparent !border-0 !shadow-none outline-none w-full px-1 text-[15px] tracking-[0.01em] !text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] placeholder:font-normal placeholder:tracking-[0.02em]"
      : variant === "sticky"
        ? "!bg-transparent !border-0 !shadow-none outline-none w-full px-1 text-[14px] !text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)]"
      : variant === "mobile"
        ? "!bg-transparent !border-0 !shadow-none outline-none text-[13px] pl-2 w-full min-w-0"
        : "!bg-transparent !border-0 !shadow-none outline-none text-[13.5px] px-2 w-32 focus:w-48 transition-all !text-[var(--color-stone-900)] placeholder-[var(--color-stone-400)]";

  const dropdownClass =
    variant === "hero"
      ? "absolute top-full mt-3 left-0 w-full bg-white/98 backdrop-blur-xl rounded-2xl border border-[var(--color-champagne-500)]/15 shadow-[0_30px_70px_-22px_rgba(11,31,58,0.45),0_10px_28px_-14px_rgba(11,31,58,0.18)] z-50 overflow-hidden"
      : variant === "sticky"
        ? "absolute top-full mt-2 left-0 w-full bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-[60] overflow-hidden"
      : variant === "mobile"
        ? "absolute top-full mt-2 right-0 w-[260px] sm:w-[300px] bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden"
        : "absolute top-full mt-3 left-0 w-96 bg-white shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] rounded-2xl border border-[var(--color-stone-100)] z-50 overflow-hidden";

  const handleResultClick = () => {
    setOpenSearch(false);
    setSearch("");
    onResultNavigate?.();
  };

  /* 🛡️ SHEET seçim — önce sheet'i kapat (onResultNavigate → parent
     searchOpen=false, sheet 200ms ile aşağı kayar), animasyon BİTİNCE
     navigate. Hedef Link ile AYNI (`/kiralik-villa/<slug>`); yeni logic
     yok. Diğer variantlar Link ile anında gider (davranış değişmedi). */
  const handleSheetSelect = (slug: string) => {
    setOpenSearch(false);
    setSearch("");
    onResultNavigate?.();
    window.setTimeout(() => router.push(localeHref(`/kiralik-villa/${slug}`, locale)), 200);
  };

  /* 🛡️ Sonuç satırı İÇERİĞİ — Link (diğer variantlar) ve button (sheet)
     sarmalayıcıları arasında PAYLAŞILIR. Tek kaynak → duplicate render
     azaltıldı; non-sheet DOM'u birebir korunur. */
  const rowInner = (villa: any) => (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getImage(villa)}
        alt=""
        className="w-14 h-12 object-cover rounded-lg ring-1 ring-[var(--color-stone-100)]"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[13.5px] font-medium text-[var(--color-stone-900)] truncate">
          {villa.title}
        </span>
        <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.05em] uppercase truncate">
          {villa.location?.name || ""}
        </span>
      </div>
    </>
  );

  /* ============================================================
     🛡️ SHEET VARIANT — yalnız SUNUM (mantık yukarıdan paylaşılır)
     ============================================================
     • dropdown absolute DEĞİL → doğal akış, içerikle uyumlu yükseklik
     • boş sorgu: premium "arama yapın" hint
     • sonuç yok: premium "Villa bulunamadı"
     • sonuç satırı: <button> (rowInner paylaşılır) → handleSheetSelect
       (kapan→navigate). Scroll sheet kabuğuna bırakılır (burada değil). */
  if (variant === "sheet") {
    return (
      <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 w-full rounded-2xl px-4 py-3.5 bg-[var(--color-sand-50)] border border-[var(--color-stone-200)] focus-within:border-[var(--brand-coral)]/40 focus-within:bg-white transition-colors">
          <Search
            size={20}
            className="text-[var(--brand-coral)] shrink-0"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setOpenSearch(true)}
            placeholder={placeholderText}
            className="!bg-transparent !border-0 !shadow-none outline-none w-full text-[15px] !text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)]"
          />
        </div>

        <div className="mt-3">
          {!search && (
            <div className="mt-5 flex flex-col items-center text-center px-6 select-none">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[var(--color-sand-50)] text-[var(--color-stone-400)]">
                <Search size={20} strokeWidth={2} aria-hidden />
              </span>
              <p className="mt-3 text-[14px] font-medium text-[var(--color-stone-700)]">
                {searchDict.emptyTitle}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-stone-400)] leading-relaxed">
                {searchDict.emptyBody}
              </p>
            </div>
          )}

          {search && loading && (
            <div className="p-4 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-[var(--brand-coral)] border-t-transparent rounded-full animate-spin" />
              {dictionary.common.searching}
            </div>
          )}

          {search && !loading && results.length === 0 && (
            <div className="mt-5 flex flex-col items-center text-center px-6 select-none">
              <span className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[var(--color-sand-50)] text-[var(--color-stone-400)]">
                <Search size={20} strokeWidth={2} aria-hidden />
              </span>
              <p className="mt-3 text-[14px] font-medium text-[var(--color-stone-700)]">
                {searchDict.noResultsTitle}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-stone-400)] leading-relaxed">
                {searchDict.noResultsBody}
              </p>
            </div>
          )}

          {search && !loading && results.length > 0 && (
            <div className="rounded-2xl border border-[var(--color-stone-100)] divide-y divide-[var(--color-stone-100)] overflow-hidden">
              {results.map((villa) => (
                <button
                  key={villa.id}
                  type="button"
                  onClick={() => handleSheetSelect(villa.slug)}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-[var(--color-sand-50)] transition"
                >
                  {rowInner(villa)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass} onClick={(e) => e.stopPropagation()}>
      <Search
        size={iconSize}
        className={iconClass}
        strokeWidth={variant === "hero" ? 2.25 : 2}
        aria-hidden
      />

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setOpenSearch(true)}
        placeholder={placeholderText}
        className={inputClass}
      />

      {openSearch && search && (
        <div className={dropdownClass}>
          {loading && (
            <div className="p-4 text-sm text-[var(--color-stone-500)] flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-[var(--brand-coral)] border-t-transparent rounded-full animate-spin" />
              {dictionary.common.searching}
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="p-5 text-center text-sm text-[var(--color-stone-400)]">
              <p className="font-medium text-[var(--color-stone-600)]">
                {searchDict.noResultsCompactTitle}
              </p>
              <p className="text-xs mt-1">
                {searchDict.noResultsCompactBody}
              </p>
            </div>
          )}

          {!loading &&
            results.map((villa) => (
              <Link
                key={villa.id}
                href={localeHref(`/kiralik-villa/${villa.slug}`, locale)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-sand-50)] transition border-b border-[var(--color-stone-100)] last:border-b-0"
                onClick={handleResultClick}
              >
                {rowInner(villa)}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
