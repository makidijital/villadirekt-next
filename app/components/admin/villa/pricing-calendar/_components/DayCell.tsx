import { useRef } from "react";

import {
  compactPrice as sharedCompactPrice,
  formatCompactPrice,
} from "@/lib/format";

import { priceColorTone } from "../_helpers/color-tone";

import type {
  PricingCanvasRange,
  RangeBoundary,
} from "../_types/pricing-calendar";

// formatTRY / compactPrice → lib/format (TEK source-of-truth).
const compactPrice = sharedCompactPrice;

/* ===============================================================
   🛡️ FAZ 3 — DayCell (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde local function DayCell
   (L857-965) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL — INLINE STYLE alan-alan AYNEN:
     - height: 58
     - borderRadius: 8
     - background: baseBg
     - color: baseText
     - cursor: ternary
     - outline: 2px ya da 1px ternary (renk: champagne ya da rgba)
     - outlineOffset: -2 ya da -1 ternary
     - boxShadow: ternary string (champagne 0.45 alpha) ya da "none"
     - transition: EXACT-STRING
         "outline 0.12s ease, box-shadow 0.18s ease, transform 0.12s ease, background 0.18s ease"
     - transform: scale(1.02) ya da scale(1)
     - zIndex: 2 ya da 1
     - opacity: 1 ya da 0.35

   ⚠️ KESIN KURAL — TONE LOGIC:
     baseBg = !inCurrentMonth ? "transparent" : tone ? tone.bg : "#ffffff"
     baseText = !inCurrentMonth ? "#cbd5e1" : tone ? tone.text : "#475569"

   ⚠️ KESIN KURAL — ABSOLUTE INNER CHILDREN:
     - Date number top-1 left-1.5 absolute, opacity 0.8
     - Price label absolute inset-0 flex centered, paddingTop:10
     - compactPrice ile fontSize:12 fontWeight:700
     - "—" fallback fontSize:10 color:#cbd5e1

   ⚠️ KESIN KURAL — MOUSE EVENTS:
     - onMouseDown: e.preventDefault() + onCellDown(d)
     - onMouseEnter: onCellEnter(d)
     - inCurrentMonth=false durumunda her ikisi de no-op
=============================================================== */

export default function DayCell({
  date,
  inCurrentMonth,
  priceRange,
  discountedPrice = null,
  isInActiveRange,
  boundary,
  isDraggingNow,
  minPrice,
  maxPrice,
  onCellDown,
  onCellEnter,
  onCellTap,
  compact = false,
}: {
  date: Date;
  inCurrentMonth: boolean;
  priceRange: PricingCanvasRange | null;
  /** 🛡️ İNDİRİM ÖNİZLEMESİ (UI-only) — dolu (non-null) VE priceRange de
   *  doluysa: eski fiyat üstü çizili + bu değer yeşil gösterilir. null/
   *  undefined ise (indirim yok, ya da MonthBlock'a hiç geçilmediyse)
   *  davranış BYTE-IDENTICAL (tek satır normal fiyat) kalır. */
  discountedPrice?: number | null;
  isInActiveRange: boolean;
  boundary: RangeBoundary;
  isDraggingNow: boolean;
  minPrice: number;
  maxPrice: number;
  onCellDown: (d: Date) => void;
  onCellEnter: (d: Date) => void;
  /** 📱 Mobil tap-to-range. Verilmezse touch handler'lar no-op → mevcut
   *  mouse davranışı BİREBİR korunur. */
  onCellTap?: (d: Date) => void;
  /** 5 ay görünümünde kompakt hücre (yükseklik/padding/font küçülür).
   *  Default false → 3 ay görünümü BYTE-IDENTICAL kalır. */
  compact?: boolean;
}) {
  /* 📱 Touch tap tespiti — başlangıç konumu; touchend'de hareket eşiğiyle
     scroll'u tap'tan ayırır (parmak kaydırma yanlışlıkla gün seçmesin). */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const tone = priceRange
    ? priceColorTone(priceRange.price, minPrice, maxPrice)
    : null;
  const baseBg = !inCurrentMonth
    ? "transparent"
    : tone
      ? tone.bg
      : "#ffffff";
  const baseText = !inCurrentMonth
    ? "#cbd5e1"
    : tone
      ? tone.text
      : "#475569";

  return (
    <div
      onMouseDown={(e) => {
        if (!inCurrentMonth) return;
        e.preventDefault();
        onCellDown(date);
      }}
      onMouseEnter={() => {
        if (!inCurrentMonth) return;
        onCellEnter(date);
      }}
      onTouchStart={(e) => {
        // Yalnız tap-to-range aktifse (onCellTap verildiyse) ve ay-içi günse.
        if (!inCurrentMonth || !onCellTap) {
          touchStartRef.current = null;
          return;
        }
        const t = e.touches[0];
        touchStartRef.current = t
          ? { x: t.clientX, y: t.clientY }
          : null;
      }}
      onTouchEnd={(e) => {
        if (!inCurrentMonth || !onCellTap) return;
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        if (t) {
          // ~10px'ten fazla hareket → scroll/drag, tap DEĞİL → yok say.
          if (
            Math.abs(t.clientX - start.x) > 10 ||
            Math.abs(t.clientY - start.y) > 10
          ) {
            return;
          }
        }
        // 🛡️ Sentetik mouse/click emülasyonunu engelle → aynı dokunuş
        //    onMouseDown/onClick olarak İKİNCİ kez tetiklenmez (double-fire yok).
        e.preventDefault();
        onCellTap(date);
      }}
      className="relative"
      style={{
        height: compact ? 50 : 58,
        borderRadius: compact ? 6 : 8,
        background: baseBg,
        color: baseText,
        cursor: inCurrentMonth ? "pointer" : "default",
        outline: isInActiveRange
          ? "2px solid var(--color-champagne-500, #c89b3c)"
          : "1px solid rgba(15,23,42,0.05)",
        outlineOffset: isInActiveRange ? -2 : -1,
        boxShadow:
          isInActiveRange && (boundary || isDraggingNow)
            ? "0 5px 14px -8px rgba(200,155,60,0.45)"
            : "none",
        transition:
          "outline 0.12s ease, box-shadow 0.18s ease, transform 0.12s ease, background 0.18s ease",
        transform:
          isInActiveRange && boundary ? "scale(1.02)" : "scale(1)",
        zIndex: isInActiveRange && boundary ? 2 : 1,
        opacity: inCurrentMonth ? 1 : 0.35,
      }}
    >
      <span
        className="absolute top-1 left-1.5 text-[10px] font-semibold leading-none tabular-nums"
        style={{ color: baseText, opacity: 0.8 }}
      >
        {date.getDate()}
      </span>

      {inCurrentMonth && (
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            compact ? "px-0.5" : "px-1"
          }`}
          style={{ paddingTop: compact ? 7 : 10 }}
        >
          {priceRange ? (
            discountedPrice != null ? (
              /* 🛡️ İNDİRİM ÖNİZLEMESİ — eski fiyat üstü çizili (soluk),
                 yeni (indirimli) fiyat altta YEŞİL + kalın. Hücrenin
                 height/outline/transition/background stilleri (yukarıda)
                 HİÇ değişmedi; sadece bu iç blok iki satıra çıktı. */
              <div className="flex flex-col items-center leading-none gap-[1px]">
                <span
                  className="font-display tabular-nums"
                  style={{
                    fontSize: compact ? 8 : 9,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    color: baseText,
                    opacity: 0.55,
                    textDecoration: "line-through",
                    whiteSpace: "nowrap",
                  }}
                >
                  {compact
                    ? formatCompactPrice(priceRange.price, priceRange.currency)
                    : compactPrice(priceRange.price, priceRange.currency)}
                </span>
                <span
                  className="font-display tabular-nums"
                  style={{
                    fontSize: compact ? 10 : 12,
                    fontWeight: 800,
                    letterSpacing: "-0.01em",
                    color: "#059669",
                    whiteSpace: "nowrap",
                  }}
                >
                  {compact
                    ? formatCompactPrice(discountedPrice, priceRange.currency)
                    : compactPrice(discountedPrice, priceRange.currency)}
                </span>
              </div>
            ) : (
              <span
                className="font-display tabular-nums"
                style={{
                  fontSize: compact ? 10 : 12,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: baseText,
                  whiteSpace: compact ? "nowrap" : undefined,
                }}
              >
                {compact
                  ? formatCompactPrice(priceRange.price, priceRange.currency)
                  : compactPrice(priceRange.price, priceRange.currency)}
              </span>
            )
          ) : (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "#cbd5e1" }}
            >
              —
            </span>
          )}
        </div>
      )}

    </div>
  );
}
