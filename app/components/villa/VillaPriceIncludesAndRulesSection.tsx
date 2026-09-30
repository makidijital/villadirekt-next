import { Check } from "lucide-react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ VillaPriceIncludesAndRulesSection — PHASE 8D-2
   ===============================================================
   TR villa detay sayfasının (`app/(public)/kiralik-villa/[slug]/
   page.tsx`, satır ~769-846) "INCLUDES + RULES" bloğunun
   SALT-SUNUM extraction'ı — TR'nin AYNI koşullu wrapper mantığı
   (ikisi de boşsa hiçbir şey render edilmez; ikisi de doluysa lg+
   ekranda 2-kolon yan yana). TR dosyası bu component'i KULLANMIYOR —
   kendi inline JSX'i AYNEN, DOKUNULMADAN duruyor; yalnız EN/DE villa
   detay sayfaları import eder.

   Server component; server-only translation/repository koduna HİÇ
   erişmez. Hardcoded TR metinleri ("Konaklama ücretine dahil",
   "Konaklama kuralları") BİLİNÇLİ OLARAK ÇEVRİLMEDİ (kapsam dışı).
   =============================================================== */

export type TranslatedPriceInclude = {
  id: string;
  displayTitle: string;
};

export type TranslatedRule = {
  id: string;
  displayTitle: string;
};

export default function VillaPriceIncludesAndRulesSection({
  priceIncludes,
  rules,
  locale,
}: {
  priceIncludes: TranslatedPriceInclude[];
  rules: TranslatedRule[];
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  if (priceIncludes.length === 0 && rules.length === 0) {
    return null;
  }

  return (
    <div
      className={
        "grid grid-cols-1 gap-4 md:gap-5 " +
        (priceIncludes.length > 0 && rules.length > 0
          ? "lg:grid-cols-2 lg:items-start"
          : "")
      }
    >
      {priceIncludes.length > 0 && (
        <section
          className="
            rounded-3xl border border-emerald-100
            bg-emerald-50/60
            p-6 md:p-7
          "
        >
          <h2 className="font-display text-2xl md:text-3xl text-emerald-900 tracking-[-0.015em]">
            {dict.villa.priceIncludesTitle}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            {priceIncludes.map((p) => (
              <div
                key={p.id}
                className="
                  flex items-center gap-2.5
                  text-[var(--color-stone-700)]
                  bg-white border border-emerald-100
                  rounded-xl px-4 py-3 text-sm
                  hover:border-emerald-300 hover:shadow-soft
                  transition
                "
              >
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-emerald-600" />
                </span>
                {p.displayTitle}
              </div>
            ))}
          </div>
        </section>
      )}

      {rules.length > 0 && (
        <section
          className="
            rounded-3xl border border-rose-100
            bg-rose-50/60
            p-6 md:p-7
          "
        >
          <h2 className="font-display text-2xl md:text-3xl text-rose-900 tracking-[-0.015em]">
            {dict.villa.rulesTitle}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            {rules.map((r) => (
              <div
                key={r.id}
                className="
                  flex items-center gap-2.5
                  text-[var(--color-stone-700)]
                  bg-white border border-rose-100
                  rounded-xl px-4 py-3 text-sm
                  hover:border-rose-300 hover:shadow-soft
                  transition
                "
              >
                <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                  <Check size={12} className="text-rose-600" />
                </span>
                {r.displayTitle}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
