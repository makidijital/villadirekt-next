"use client";

import { usePathname } from "next/navigation";

/* ===============================================================
   🛡️ BAKIM EKRANI — PUBLIC ÇOKLU DİL
   ===============================================================
   `Header.tsx` / `Footer.tsx` (Phase 9A/9B) ile AYNI desen: aktif
   locale `usePathname()` + `localeFromPathname()` ile RENDER
   sırasında türetilir. Yeni bir i18n sistemi KURULMADI.

   ⚠️ MIGRATION 084 KAPSAM KARARI DEĞİŞMEDİ:
   `settings.maintenance_message` CANONICAL kalır ve
   `settings_translations` üzerinden ÇEVRİLMEZ. Yalnız
     • "Bakım" etiketi
     • admin hiç mesaj girmediğinde gösterilen VARSAYILAN metin
   locale-aware olur. Admin bir mesaj girdiyse o mesaj her dilde
   AYNEN gösterilir (bugünkü davranış).

   DOM/className/metin sırası `(public)/layout.tsx`'teki inline blok
   ile BİREBİR aynıdır.
   =============================================================== */
import { localeFromPathname } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export default function MaintenanceScreen({
  brand,
  message,
}: {
  brand: string;
  /** `settings.maintenance_message` (canonical). Boşsa dictionary varsayılanı. */
  message?: string | null;
}) {
  const dict = getDictionary(localeFromPathname(usePathname())).maintenance;
  const text = message?.trim() || dict.defaultMessage;

  return (
    <div className="public-shell flex flex-col min-h-screen bg-[var(--color-ivory)]">
      <section className="flex-1 flex items-center justify-center px-5 md:px-10 py-24">
        <div className="max-w-xl text-center">
          <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
            {dict.eyebrow}
          </p>
          <h1 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
            {brand}
          </h1>
          <p className="text-[var(--color-stone-500)] mt-6 leading-relaxed text-[15px] md:text-[16px]">
            {text}
          </p>
        </div>
      </section>
    </div>
  );
}
