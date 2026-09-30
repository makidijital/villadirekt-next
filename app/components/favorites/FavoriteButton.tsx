"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
/* 🛡️ PHASE 10G — locale-aware etiket. `locale` OPSİYONEL, default "tr"
   → TR çıktısı BİREBİR AYNI. localStorage/favorites mantığı DEĞİŞMEDİ. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ FAZ 36 — FAVORITE BUTTON (reusable)
   ===============================================================
   Public villa surface'lerinde "favorilere ekle" interaksiyonu.
   Variant'lar:
     - card   : VillaCard sağ üst köşe ikon-only (mevcut Heart UI
                replace ediyor; layout boyut + position parity)
     - detail : Villa detail / hero altı CTA-style buton; luxury
                subtle, text + ikon

   STATE:
     - active   : Heart filled, warm tone
     - inactive : Heart outline, neutral
     - Geçişler: motion-reduce'a duyarlı; subtle scale + fill color

   SSR SAFETY:
     - useFavorites().isHydrated false ise inactive görüntüsü
       render edilir (server + client ilk render ile birebir aynı).
     - Mount sonrası gerçek state ile re-render; hidrasyon
       mismatch yok.

   A11Y:
     - button role + aria-pressed (aktif/pasif boolean)
     - aria-label dinamik: "Favorilere ekle" / "Favorilerden kaldır"
     - <Link> içine nest olduğunda preventDefault + stopPropagation
       → parent kart link'ine tıklama tetiklenmez (VillaCard
       sarmalanmış).

   PERFORMANCE:
     - Yalnız client island; bundle delta minimum (lucide Heart
       zaten kullanımda).
     - localStorage read/write microseconds.

   DOKUNULMAYAN:
     - Reservation engine, pricing, BookingSidebar, review system,
       AggregateRating, cache, search, gallery, admin, sidebar,
       availability, private URL system.
   =============================================================== */

type Variant = "card" | "detail" | "icon";

export default function FavoriteButton({
  villaId,
  variant = "card",
  /* Card variant'ta hover-only görünür; detail variant'ta her zaman.
     Card variant'ta override için (örn. detail'de küçük secondary
     yerine card-style göstermek istenirse): `alwaysVisible`. */
  alwaysVisible = false,
  locale,
}: {
  villaId: string;
  variant?: Variant;
  alwaysVisible?: boolean;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const { isFavorite, toggleFavorite, isHydrated } = useFavorites();

  /* Aktif state'i yalnız hidrasyondan sonra etkin tut.
     Aksi takdirde SSR vs client mismatch. */
  const active = isHydrated && isFavorite(villaId);
  const label = active ? dict.favorites.remove : dict.favorites.add;

  const handleClick = (e: React.MouseEvent) => {
    /* VillaCard sarmalı `<Link>` içine konumlandığında parent
       navigasyonunu engelle. Detail sayfasında zararsız. */
    e.preventDefault();
    e.stopPropagation();
    if (!villaId) return;
    toggleFavorite(villaId);
  };

  if (variant === "detail") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={
          "inline-flex items-center gap-2 " +
          "px-4 py-2.5 rounded-full " +
          "text-[13px] font-medium tracking-[0.01em] " +
          "border transition-colors motion-reduce:transition-none " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
          (active
            ? "bg-[var(--color-sand-50)] border-[var(--color-champagne-300)] text-[var(--color-champagne-700)] hover:bg-[var(--color-sand-100)]"
            : "bg-white border-[var(--color-stone-200)] text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
        }
      >
        <Heart
          size={14}
          className={
            "transition-transform duration-300 motion-reduce:transition-none " +
            (active
              ? "fill-[var(--color-champagne-600)] text-[var(--color-champagne-600)] scale-105"
              : "")
          }
          fill={active ? "currentColor" : "none"}
          strokeWidth={1.75}
          aria-hidden
        />
        {active ? dict.favorites.saved : dict.favorites.save}
      </button>
    );
  }

  /* ICON variant — inline icon-only buton (VillaInfoBar action area).
     `card` ile karıştırılmaz: card variant absolute positioned + hover-show,
     icon variant inline + her zaman görünür + boyut video CTA height'ı ile
     uyumlu (h-10). Secondary action hissi: subtle border + white bg.
     Aktif state: champagne tint + filled heart.

     Logic AYNI: handleClick, active, label, useFavorites — sıfır değişim. */
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className={
          "inline-flex items-center justify-center " +
          "w-10 h-10 rounded-full " +
          "border transition-colors motion-reduce:transition-none " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
          (active
            ? "bg-[var(--color-sand-50)] border-[var(--color-champagne-300)] text-[var(--color-champagne-600)] hover:bg-[var(--color-sand-100)]"
            : "bg-white border-[var(--color-stone-200)] text-[var(--color-stone-600)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
        }
      >
        <Heart
          size={16}
          className={
            "transition-transform duration-300 motion-reduce:transition-none " +
            (active
              ? "fill-[var(--color-champagne-600)] text-[var(--color-champagne-600)] scale-105"
              : "")
          }
          fill={active ? "currentColor" : "none"}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
    );
  }

  /* CARD variant — VillaCard sağ üst köşe ikon-only buton.
     Mevcut layout korunur: w-9 h-9 rounded-full + opacity-0 group-hover. */
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={
        "absolute top-4 right-4 z-10 " +
        "w-9 h-9 rounded-full " +
        "bg-white/90 backdrop-blur-sm " +
        "flex items-center justify-center " +
        "hover:bg-white transition motion-reduce:transition-none " +
        "shadow-[0_2px_8px_-2px_rgb(27_26_23/0.18)] " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
        /* Visibility kuralı:
            - Aktif favori ise her zaman görünür (kullanıcının
              durumunu görmesi için kalıcı).
            - Değilse hover/focus + alwaysVisible flag'ine bağlı. */
        (active || alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100")
      }
    >
      <Heart
        size={15}
        className={
          "transition-colors motion-reduce:transition-none " +
          (active
            ? "fill-[var(--color-champagne-600)] text-[var(--color-champagne-600)]"
            : "text-[var(--color-stone-700)]")
        }
        fill={active ? "currentColor" : "none"}
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
  );
}
