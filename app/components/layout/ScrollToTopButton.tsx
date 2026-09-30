"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";

/* 🛡️ PHASE 11 — locale, Header/Footer ile AYNI desenle pathname'den.
   scrollY/visibility/scrollToTop davranışına DOKUNULMADI. */
import { localeFromPathname } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ SCROLL TO TOP — floating "sayfanın başına dön" butonu
   ===============================================================
   Public site geneli, sol alt köşe. FloatingSocial (sağ alt) ile
   çakışmaz; z-40 → CookieConsent (z-50) ve modaller (1000/1100)
   üstte kalır. Mobil bottom = BottomNav yüksekliği (70px) +
   env(safe-area-inset-bottom) + 16px → alt bar'ın (BottomNav /
   villa detay MobileBookingCta) üstünde premium boşlukla durur;
   magic number değil, bar yüksekliğini referans alır. Desktop
   md:bottom-8 (32px) AYNEN korunur.

   DAVRANIŞ:
     - Başlangıçta gizli; window.scrollY > 400 olunca görünür.
     - Fade/slide geçiş (opacity + translate-y).
     - Tık → smooth scroll top.

   ARCHITECTURE:
     - Client island; passive scroll listener + mount'ta tek kontrol
       (refresh mid-page durumunda doğru state). Cleanup on unmount.
     - Her zaman mount; yalnız opacity/translate ile animasyon.
   =============================================================== */

const SCROLL_THRESHOLD = 400;

export default function ScrollToTopButton() {
  const pathname = usePathname();
  const dict = getDictionary(localeFromPathname(pathname)).layout.scrollTop;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_THRESHOLD);
    /* Mount'ta bir kez kontrol (sayfa ortasında refresh senaryosu). */
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className="
        fixed left-3 md:left-5
        bottom-[calc(70px_+_env(safe-area-inset-bottom)_+_16px)] md:bottom-8
        z-40
        print:hidden
        flex flex-col items-center gap-2
      "
    >
      <span
        aria-hidden="true"
        className={`
          text-xs font-medium px-3 py-1 rounded-full
          bg-white/80 backdrop-blur-xl
          border border-[var(--color-stone-100)]
          shadow-sm text-[var(--color-stone-700)]
          transition-all duration-300 motion-reduce:transition-none
          ${
            visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-3 pointer-events-none"
          }
        `}
      >
        {dict.label}
      </span>

      <button
        type="button"
        onClick={scrollToTop}
        aria-label={dict.ariaLabel}
        className={`
          w-12 h-12 rounded-full
          flex items-center justify-center
          bg-white/80 backdrop-blur-xl
          border border-[var(--color-stone-100)]
          text-[var(--color-stone-700)]
          shadow-lg
          transition-all duration-300 motion-reduce:transition-none
          hover:bg-white hover:text-[var(--color-stone-900)]
          focus:outline-none focus:ring-2 focus:ring-[var(--brand-coral)]/40
          ${
            visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-3 pointer-events-none"
          }
        `}
      >
        <ChevronUp size={20} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
