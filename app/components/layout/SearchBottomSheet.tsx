"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import VillaSearchBox from "@/app/components/layout/VillaSearchBox";
/* 🛡️ PHASE 11 — locale BottomNav'dan prop ile gelir (ekstra hook YOK). */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ SEARCH BOTTOM SHEET — MOBİL villa-adı arama (Apple/Airbnb kalitesi)
   ===============================================================
   Mevcut paylaşılan `VillaSearchBox` (`variant="sheet"`) İÇERİDE compose
   edilir — aynı canlı arama + debounce + `searchVillas` + seçim→navigate.
   YENİ arama algoritması / API / query / state YOK. `sheet` variant yalnız
   SUNUM: dropdown absolute değil, doğal akışta (içerikle uyumlu yükseklik);
   hint / "Villa bulunamadı" / sonuç listesi variant'ın kendi içinde. Sheet
   yalnız premium kabuk + davranış (kapan→navigate variant tarafında).

   POLISH:
     • Yükseklik İÇERİĞE GÖRE (hint kısa, sonuçlar uzun); max-h-[88vh],
       taşarsa sheet body scroll — absolute dropdown taşması artık YOK.
     • Açılış: opacity + translateY, 200ms ease-out (spring yok).
     • Koyu + hafif blur backdrop; üstte drag indicator; başlık "Villa Ara".
     • VisualViewport: klavye açılınca sheet yukarı kalkar (viewport
       küçülmesinde bozulmaz).
     • Sonuç seçilince sheet 200ms kapanış animasyonu BİTİNCE navigate
       (variant handleSheetSelect).
     • role="dialog" + aria-modal + ESC + backdrop click + focus trap +
       auto-focus + body scroll lock. Safe-area alt padding.
   =============================================================== */

export default function SearchBottomSheet({
  open,
  onClose,
  locale = DEFAULT_LOCALE,
}: {
  open: boolean;
  onClose: () => void;
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const searchDict = dict.layout.search;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [kbOffset, setKbOffset] = useState(0);

  /* ESC ile kapat. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Body scroll lock (açıkken). */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* Açılınca input'a auto-focus. */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      sheetRef.current?.querySelector("input")?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  /* Klavye açılınca sheet'i yukarı kaldır (VisualViewport). */
  useEffect(() => {
    if (!open) {
      setKbOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      setKbOffset(overlap > 0 ? overlap : 0);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [open]);

  /* Focus trap — Tab döngüsü sheet içinde kalır. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      className={
        "md:hidden fixed inset-0 z-[1000] print:hidden " +
        (open ? "" : "pointer-events-none")
      }
      aria-hidden={!open}
    >
      {/* Backdrop — koyu + hafif blur; tıklayınca kapanır. */}
      <button
        type="button"
        aria-label={searchDict.closeBackdropAriaLabel}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={
          "absolute inset-0 bg-black/40 backdrop-blur-sm " +
          "transition-opacity duration-200 ease-out " +
          (open ? "opacity-100" : "opacity-0")
        }
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={searchDict.dialogAriaLabel}
        style={{
          transform: open
            ? `translateY(-${kbOffset}px)`
            : "translateY(100%)",
        }}
        className={
          "absolute inset-x-0 bottom-0 max-h-[88vh] " +
          "flex flex-col overflow-hidden " +
          "bg-white rounded-t-3xl " +
          "shadow-[0_-20px_50px_-20px_rgba(2,6,23,0.35)] " +
          "pb-[env(safe-area-inset-bottom)] " +
          "transition-[transform,opacity] duration-200 ease-out " +
          "motion-reduce:transition-none " +
          (open ? "opacity-100" : "opacity-0")
        }
      >
        {/* Grabber + başlık + kapat */}
        <div className="pt-2.5 px-5 shrink-0">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--color-stone-200)]" />
          <div className="mt-3 mb-1 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--color-stone-900)] tracking-tight">
              {searchDict.sheetTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={dict.common.close}
              className="inline-flex items-center justify-center h-9 w-9 rounded-full text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 transition-colors"
            >
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        {/* Arama alanı — tam genişlik, premium yan boşluk. `sheet` variant
            doğal akışta (absolute değil) render eder; taşarsa BURASI
            (sheet body) scroll olur → dropdown taşması yok. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-2 pb-4">
          <VillaSearchBox
            variant="sheet"
            placeholder={searchDict.sheetPlaceholder}
            onResultNavigate={onClose}
            locale={locale}
          />
        </div>
      </div>
    </div>
  );
}
