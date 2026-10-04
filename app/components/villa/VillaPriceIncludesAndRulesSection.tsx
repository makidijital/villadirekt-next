import { Check, Info } from "lucide-react";

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

  /* Minimal liste — kart/kutu/border/arka plan YOK. Sol: dahil olanlar
     (küçük brand-blue check), sağ: kurallar (küçük brand-blue info).
     Veri/sıra/metin/boş-durum mantığı AYNEN; iki kolon koşulu AYNEN. */
  return (
    <div
      className={
        "grid grid-cols-1 gap-8 md:gap-10 " +
        (priceIncludes.length > 0 && rules.length > 0
          ? "lg:grid-cols-2 lg:items-start"
          : "")
      }
    >
      {priceIncludes.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-[18px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]">
            {dict.villa.detailPriceIncludesTitle}
          </h2>
          <ul className="mt-4 space-y-3">
            {priceIncludes.map((p) => (
              <li
                key={p.id}
                title={p.displayTitle}
                className="flex items-center gap-2.5 min-w-0 text-[13.5px] leading-5 text-[var(--color-stone-700)]"
              >
                <Check
                  size={15}
                  strokeWidth={2.25}
                  aria-hidden="true"
                  className="shrink-0 text-[#1B4EF5]"
                />
                <span className="truncate">{p.displayTitle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rules.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-[18px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]">
            {dict.villa.detailRulesTitle}
          </h2>
          <ul className="mt-4 space-y-3">
            {rules.map((r) => (
              <li
                key={r.id}
                title={r.displayTitle}
                className="flex items-center gap-2.5 min-w-0 text-[13.5px] leading-5 text-[var(--color-stone-700)]"
              >
                <Info
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0 text-[#1B4EF5]"
                />
                <span className="truncate">{r.displayTitle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
