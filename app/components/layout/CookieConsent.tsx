"use client";

/* ===============================================================
   🍪 COOKIE CONSENT — ultra-minimal, client-only banner
   ===============================================================
   - localStorage `cookie_consent=accepted` → bir daha gösterilmez.
   - DB/eski sağlayıcı/API/analytics çağrısı YOK. Storage = yalnız localStorage.
   - SSR/hydration-safe: ilk render (server + client) NULL döner; banner
     yalnız mount sonrası (useEffect) localStorage okunup gösterilir →
     hydration mismatch YOK.
   - Fail-safe: localStorage erişilemezse (private mode/blok) hiçbir hata
     fırlatmaz; banner gösterilmez (sistemi bozmaz).
   - Non-modal: sayfa etkileşimini bloklamaz (pointer-events yalnız bar'da).
   - Mevcut site CSS değişkenleri reuse; yeni design system YOK.
   =============================================================== */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* 🛡️ PHASE 11 — locale, Header/Footer ile AYNI desenle pathname'den
   türetilir. Consent/localStorage davranışına DOKUNULMADI. */
import { localeFromPathname } from "@/lib/i18n/config";
/* 🛡️ NAVIGATION LOCALE PERSISTENCE — iç link aktif locale'i taşır
   (bkz. lib/i18n/locale-href.ts). */
import { localeHref } from "@/lib/i18n/locale-href";
import { getDictionary } from "@/lib/i18n/get-dictionary";

const STORAGE_KEY = "cookie_consent";

export default function CookieConsent() {
  const pathname = usePathname();
  /* 🛡️ NAVIGATION LOCALE PERSISTENCE — locale artık AYRI türetilir
     (dictionary çözümü BİREBİR aynı kalır) çünkü çerez politikası
     linkinin de aktif locale'i taşıması gerekir. */
  const locale = localeFromPathname(pathname);
  const dict = getDictionary(locale).layout.cookie;
  const [visible, setVisible] = useState(false);

  /* Mount sonrası: consent yoksa göster. try/catch fail-safe. */
  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        window.localStorage?.getItem(STORAGE_KEY) !== "accepted"
      ) {
        setVisible(true);
      }
    } catch {
      /* localStorage erişilemiyor → banner gösterme (fail-safe, no crash). */
    }
  }, []);

  const accept = () => {
    /* Yalnız localStorage. DB/API/analytics YOK. Yazma başarısız olsa
       bile banner kapanır (in-session); hata fırlatmaz. */
    try {
      window.localStorage?.setItem(STORAGE_KEY, "accepted");
    } catch {
      /* sessiz — consent reload'da kalmayabilir ama sistem bozulmaz. */
    }
    setVisible(false);
  };

  /* İlk render (server + client) → null. Mismatch yok. */
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={dict.ariaLabel}
      className="
        fixed inset-x-0 bottom-0 z-50
        px-4 pb-4 pointer-events-none
      "
    >
      <div
        className="
          pointer-events-auto
          mx-auto max-w-3xl
          flex flex-col sm:flex-row items-start sm:items-center gap-3
          rounded-xl border border-[var(--color-stone-200,#e7e5e4)]
          bg-[var(--color-ivory,#fffdf8)]/95 backdrop-blur
          shadow-lg
          px-4 py-3
        "
      >
        <p className="text-[13px] leading-relaxed text-[var(--color-stone-700,#44403c)] flex-1">
          {dict.message}
        </p>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Link
            href={localeHref("/p/cerez-politikasi", locale)}
            className="
              inline-flex items-center justify-center
              px-3.5 py-2 rounded-lg
              text-[12.5px] font-medium
              text-[var(--color-stone-600,#57534e)]
              hover:text-[var(--color-stone-900,#1c1917)]
              hover:bg-[var(--color-stone-100,#f5f5f4)]
              transition-colors motion-reduce:transition-none
            "
          >
            {dict.details}
          </Link>
          <button
            type="button"
            onClick={accept}
            className="
              inline-flex items-center justify-center
              px-4 py-2 rounded-lg
              text-[12.5px] font-semibold
              text-white bg-[var(--color-stone-900,#1c1917)]
              hover:opacity-90
              focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
              focus-visible:ring-[var(--color-stone-400,#a8a29e)]
              transition-opacity motion-reduce:transition-none
              flex-1 sm:flex-none
            "
          >
            {dict.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
