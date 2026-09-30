"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* 🛡️ Varsayılan ok etiketleri dictionary'den (TR değerleri ESKİ
   hardcoded metinlerle BİREBİR). Dört çağıranın hepsi zaten kendi
   locale'inden `prevLabel`/`nextLabel` geçiriyor — bu yalnız
   hardcoded metni kaldıran güvenli fallback'tir. */
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const FALLBACK_CAROUSEL = getDictionary(DEFAULT_LOCALE).common;

/* ===============================================================
   🛡️ HORIZONTAL CAROUSEL — generic reusable scroller
   ===============================================================
   Tek source-of-truth:
     - wheel deltaY → horizontal scroll (boundary-aware, native
       dikey scroll devreye girer → user-trapping yok)
     - touch / trackpad horizontal: native (zaten doğal)
     - snap-x mandatory + scrollbar hidden + grab cursor
     - opsiyonel desktop arrows (showArrows={true}):
         * sadece md+ breakpoint
         * sadece gerçek overflow varsa
         * scroll başında sol arrow gizli; sonunda sağ arrow gizli
     - edge detection: scroll + resize + ResizeObserver listener
       state'i atStart/atEnd/hasOverflow olarak günceller

   KULLANIM:
     <HorizontalCarousel showArrows ariaLabel="...">
       <ul className="flex flex-nowrap min-w-max gap-N ...">
         <li className="snap-start shrink-0 w-[N] ...">...</li>
       </ul>
     </HorizontalCarousel>

   CategoryCollection + LocationCollection ortak altyapı.
   =============================================================== */

type Props = {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  /** Desktop sağ/sol arrow göster. Mobile'da daima gizli. */
  showArrows?: boolean;
  /** Arrow click'inde kaydırılacak piksel. Default 420 (≈ 1 kart + gap). */
  scrollStep?: number;
  /** 🛡️ PHASE 11 P0 — ok butonlarının accessibility metinleri.
   *  OPSİYONEL; verilmezse TR default'ları kullanılır → mevcut
   *  çağıranlar ETKİLENMEZ, görsel davranış DEĞİŞMEZ. */
  prevLabel?: string;
  nextLabel?: string;
};

export default function HorizontalCarousel({
  children,
  className = "",
  ariaLabel,
  showArrows = false,
  scrollStep = 420,
  prevLabel = FALLBACK_CAROUSEL.carouselPrev,
  nextLabel = FALLBACK_CAROUSEL.carouselNext,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  /* ----- Wheel: dikey wheel → yatay scroll, boundary'de native devreye girer ----- */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const overflowNow = el.scrollWidth > el.clientWidth;
      if (!overflowNow) return;
      const startNow = el.scrollLeft <= 0;
      const endNow = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      const goingForward = e.deltaY > 0;
      const goingBackward = e.deltaY < 0;
      if ((goingForward && endNow) || (goingBackward && startNow)) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
    };

    /* passive: false → preventDefault efektli olsun.
       React'in onWheel'i default passive listener kullanır. */
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /* ----- Edge detection: arrows için state ----- */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth + 1;
      setHasOverflow(overflow);
      setAtStart(el.scrollLeft <= 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    /* Children eklenmesi / viewport değişimi → recalculate.
       ResizeObserver modern tarayıcılarda native (Chrome 64+,
       Safari 13.1+, Firefox 69+). Eski tarayıcıda no-op. */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, []);

  const scrollLeft = () =>
    ref.current?.scrollBy({ left: -scrollStep, behavior: "smooth" });
  const scrollRight = () =>
    ref.current?.scrollBy({ left: scrollStep, behavior: "smooth" });

  /* Arrows: sadece desktop, sadece overflow varsa. */
  const arrowsEnabled = showArrows && hasOverflow;

  return (
    <div className="relative">
      <div
        ref={ref}
        aria-label={ariaLabel}
        className={
          "overflow-x-auto overflow-y-hidden w-full " +
          "snap-x snap-mandatory " +
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
          "[scroll-behavior:smooth] " +
          "cursor-grab active:cursor-grabbing " +
          className
        }
      >
        {children}
      </div>

      {arrowsEnabled && !atStart && (
        <button
          type="button"
          onClick={scrollLeft}
          aria-label={prevLabel}
          className="hidden md:flex absolute left-3 lg:left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center bg-white/90 backdrop-blur-sm border border-[var(--color-stone-200)] shadow-[0_4px_16px_-4px_rgb(27_26_23/0.2)] text-[var(--color-stone-800)] hover:bg-white hover:scale-105 transition motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {arrowsEnabled && !atEnd && (
        <button
          type="button"
          onClick={scrollRight}
          aria-label={nextLabel}
          className="hidden md:flex absolute right-3 lg:right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full items-center justify-center bg-white/90 backdrop-blur-sm border border-[var(--color-stone-200)] shadow-[0_4px_16px_-4px_rgb(27_26_23/0.2)] text-[var(--color-stone-800)] hover:bg-white hover:scale-105 transition motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
