"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

/* 🛡️ PHASE 11 — section başlıkları locale'e göre. SSS SORU/CEVAP metni
   `faq_translations` (migration 082) üzerinden SERVER tarafında çözülür
   ve zaten çevrilmiş olarak `faqs` prop'uyla gelir — bu component
   çeviri sorgusu YAPMAZ. Header/Footer/VillaCard ile AYNI desen:
   `getDictionary` saf/statik lookup, ek bundle maliyeti YOK. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ FaqSection — Luxury hospitality accordion (Faz 25)
   ===============================================================
   Anasayfa global SSS section'ı. Tek seferde 1 item açık;
   smooth height transition (grid-rows trick, layout-thrash yok).

   PALETTE: Faz 18 Mediterranean resort tokens:
     - aqua (cyan) primary accent
     - coral sunset secondary
     - champagne legacy korunmuş (cyan değerinde)
   Section bg: subtle aqua/coral ambient (existing body radial
   ile uyumlu).

   SSR-SAFE:
     - Outer section render server'da statik HTML
     - Bu component "use client" — yalnız accordion state için
     - faqs prop SSR'da gönderilir; hydration mismatch yok

   PERFORMANCE:
     - Tek useState (openIndex: number | null)
     - Smooth transition CSS grid-rows-[0fr→1fr] (height auto
       animation without measuring) → layout-thrash yok
     - JS minimal: tıklama → state toggle, sadece
   =============================================================== */

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export default function FaqSection({
  faqs,
  locale = DEFAULT_LOCALE,
}: {
  faqs: FaqItem[];
  locale?: Locale;
}) {
  const dict = getDictionary(locale).home.faq;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!faqs || faqs.length === 0) return null;

  return (
    <section
      id="sss"
      aria-labelledby="faq-heading"
      className="scroll-mt-24 md:scroll-mt-28 px-5 md:px-10 lg:px-16 py-16 md:py-24 border-t border-[var(--color-stone-100)]"
    >
      <div className="max-w-[760px] mx-auto">
        {/* ── HEADER — mikro-label + sade başlık + kısa alt metin.
               Eski "koyu lacivert sol panel" tamamen kaldırıldı; bölüm
               artık tek, bütünsel editorial bir kompozisyon. ── */}
        <div className="mb-10 md:mb-14">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
            <span
              aria-hidden="true"
              className="inline-block w-4 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            />
            {dict.eyebrow}
          </span>
          <h2
            id="faq-heading"
            className="mt-4 font-display font-medium text-[28px] md:text-[36px] text-[var(--color-stone-900)] leading-[1.08] tracking-[-0.02em]"
          >
            {dict.title}
          </h2>
          <p className="mt-3 text-[14.5px] md:text-[15px] text-[var(--color-stone-500)] max-w-md">
            {dict.subtitle}
          </p>
        </div>

        {/* ── EDITORIAL LİSTE — logic (openIndex, aria, grid-rows collapse)
               BİREBİR aynı; sunum tek bir numaralı satır listesi. Kart/box/
               ağır shadow YOK — sadece ince üst/alt/ara divider. ── */}
        <div>
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            const num = String(idx + 1).padStart(2, "0");
            return (
              <article
                key={faq.id}
                className="border-b border-[var(--color-stone-100)] first:border-t"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${idx}`}
                  id={`faq-button-${idx}`}
                  className="
                    group w-full flex items-center gap-4 md:gap-6
                    py-5 md:py-6 text-left
                    focus:outline-none focus-visible:ring-2
                    focus-visible:ring-[#0973BA]/30 focus-visible:ring-inset
                  "
                >
                  <span
                    className={
                      "shrink-0 font-display text-[13px] md:text-[14px] tabular-nums tracking-[0.02em] " +
                      "transition-colors duration-200 motion-reduce:transition-none " +
                      (isOpen ? "text-[#0973BA]" : "text-[var(--color-stone-300)]")
                    }
                  >
                    {num}
                  </span>
                  <span
                    className={
                      "flex-1 min-w-0 font-display text-[16px] md:text-[19px] leading-snug tracking-[-0.01em] " +
                      "transition-colors duration-200 motion-reduce:transition-none " +
                      (isOpen
                        ? "text-[var(--color-stone-900)]"
                        : "text-[var(--color-stone-700)] group-hover:text-[var(--color-stone-900)]")
                    }
                  >
                    {faq.question}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-5 h-5"
                  >
                    {isOpen ? (
                      <Minus
                        size={16}
                        strokeWidth={1.75}
                        className="text-[#ED7926] transition-colors duration-200 motion-reduce:transition-none"
                      />
                    ) : (
                      <Plus
                        size={16}
                        strokeWidth={1.75}
                        className="text-[var(--color-stone-400)] group-hover:text-[var(--color-stone-600)] transition-colors duration-200 motion-reduce:transition-none"
                      />
                    )}
                  </span>
                </button>

                {/* 🛡️ Smooth height animation — CSS grid-rows trick
                       (grid-rows-[0fr]→[1fr]); layout-thrash yok. AYNEN. */}
                <div
                  id={`faq-panel-${idx}`}
                  role="region"
                  aria-labelledby={`faq-button-${idx}`}
                  className={
                    "grid transition-[grid-template-rows] duration-300 ease-out " +
                    "motion-reduce:transition-none " +
                    (isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
                  }
                >
                  <div className="overflow-hidden">
                    <div className="flex gap-3 md:gap-4 pb-6 md:pb-7 pl-9 md:pl-14 pr-2 md:pr-8">
                      <span
                        aria-hidden="true"
                        className="shrink-0 w-[3px] rounded-full bg-gradient-to-b from-[#ED7926] to-[#0973BA]"
                      />
                      <p className="flex-1 min-w-0 text-[14.5px] md:text-[15.5px] text-[var(--color-stone-600)] leading-[1.75] whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
