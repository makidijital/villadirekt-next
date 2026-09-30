"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

import { useFavorites } from "@/hooks/use-favorites";
/* 🛡️ Header ile AYNI desen: aktif locale prop olarak gelir (Header
   `usePathname` + `localeFromPathname` ile türetir). Verilmezse TR →
   mevcut davranış BİREBİR korunur. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";

/* ===============================================================
   🛡️ FAZ 36 — HEADER FAVORITES SHORTCUT
   🛡️ FAZ 39C — CSS CLEANUP
   ===============================================================
   Public header'a küçük heart shortcut + count badge.

   FAZ 39C: `variant: "transparent" | "default"` prop'u kaldırıldı.
   FAZ 38 sonrası Header `transparent` davranışı `false` sabiti
   olduğu için yalnız "default" branch render ediliyordu. Prop
   dead-weight → kaldırıldı.

   SSR SAFETY:
     - useFavorites().isHydrated false ise count UI'da render
       edilmez (server + ilk client render identical: ikon-only).
     - Mount sonrası gerçek count → badge görünür.
     - Hidrasyon mismatch yok.

   STYLING:
     - Stone-700 ikon
     - Aktif favori var → coral filled icon + coral pill badge
     - Mobile-safe: hit area 36×36px; rounded-full
   =============================================================== */

export default function HeaderFavoritesLink({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const { count, isHydrated } = useFavorites();
  const showBadge = isHydrated && count > 0;
  const label = getDictionary(locale).favorites.myFavorites;

  return (
    <Link
      href={localeHref("/favoriler", locale)}
      aria-label={showBadge ? `${label} (${count})` : label}
      title={label}
      className="
        relative inline-flex items-center justify-center
        w-10 h-10 rounded-full
        text-[var(--color-stone-700)]
        hover:bg-[var(--color-sand-50)]
        hover:text-[var(--color-stone-900)]
        transition-colors motion-reduce:transition-none
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
      "
    >
      <Heart
        size={17}
        fill={showBadge ? "currentColor" : "none"}
        strokeWidth={1.75}
        className={showBadge ? "text-[var(--brand-coral)]" : ""}
        aria-hidden
      />
      {showBadge && (
        <span
          aria-hidden
          className="
            absolute -top-0.5 -right-0.5
            min-w-[18px] h-[18px] px-[5px]
            rounded-full
            text-[10px] font-medium tabular-nums leading-none
            flex items-center justify-center
            bg-[var(--brand-coral)] text-white
            shadow-[0_2px_6px_-2px_rgba(255,101,63,0.45)]
          "
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
