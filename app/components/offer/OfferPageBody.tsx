import { Clock, BellRing, Compass } from "lucide-react";

import OfferRequestForm from "@/app/(public)/teklif-al/OfferRequestForm";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`offer` namespace). Taxonomy verisi, API endpoint'i, honeypot/
   time-trap ve submit payload'ı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /teklif-al — ORTAK GÖVDE
   ===============================================================
   `app/(public)/teklif-al/page.tsx`'in GERÇEK gövdesinin TAŞINMIŞ
   hâlidir (DOM/CSS DEĞİŞTİRİLMEDEN) — `/en/teklif-al` ve
   `/de/teklif-al` AYNI gövdeyi render eder; kodun ikinci/üçüncü
   kopyası YOKTUR (`ContactPageBody` deseni).
   =============================================================== */

export default function OfferPageBody({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const dict = getDictionary(locale).offer;

  return (
    <div className="px-5 md:px-10 lg:px-16 pt-10 md:pt-14 pb-20 md:pb-28 bg-gradient-to-b from-[var(--color-sand-50)] via-white to-white">
      <div className="max-w-5xl mx-auto">
        {/* ════════════════════════════════════════════════════
            INTRO + TRUST CARD (asimetrik 2-col, light luxury)
            ════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-10 md:mb-14">
          <div className="lg:col-span-7">
            <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center text-[var(--brand-coral)]">
              <span
                aria-hidden="true"
                className="inline-block w-6 h-px align-middle mr-3 bg-[var(--brand-coral)]/60"
              />
              {dict.heroEyebrow}
            </p>
            <h1 className="font-display font-medium text-[28px] md:text-[36px] lg:text-[42px] text-[var(--color-stone-900)] mt-4 leading-tight tracking-[-0.02em]">
              {dict.heroTitle}
            </h1>
            <p className="mt-4 text-[14.5px] md:text-[15px] leading-relaxed text-[var(--color-stone-500)] max-w-xl">
              {dict.heroDescription}
            </p>
          </div>

          {/* Trust strip — küçük floating card */}
          <aside className="lg:col-span-5">
            <ul
              role="list"
              className="rounded-3xl bg-white border border-[var(--color-stone-100)] shadow-[0_12px_28px_-18px_rgba(27,26,23,0.10)] p-5 md:p-6 space-y-4"
            >
              <TrustRow
                icon={<Clock size={16} aria-hidden strokeWidth={1.6} />}
                title={dict.trust1Title}
                description={dict.trust1Description}
              />
              <TrustRow
                icon={<BellRing size={16} aria-hidden strokeWidth={1.6} />}
                title={dict.trust2Title}
                description={dict.trust2Description}
              />
              <TrustRow
                icon={<Compass size={16} aria-hidden strokeWidth={1.6} />}
                title={dict.trust3Title}
                description={dict.trust3Description}
              />
            </ul>
          </aside>
        </div>

        {/* ════════════════════════════════════════════════════
            FORM (client island)
            ════════════════════════════════════════════════════ */}
        <OfferRequestForm locale={locale} />
      </div>
    </div>
  );
}

function TrustRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="
          shrink-0 w-9 h-9 rounded-full
          bg-[var(--brand-coral-tint)]
          flex items-center justify-center
          text-[var(--brand-coral)]
        "
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-[var(--color-stone-900)] leading-tight">
          {title}
        </p>
        <p className="text-[12.5px] text-[var(--color-stone-500)] mt-1 leading-snug">
          {description}
        </p>
      </div>
    </li>
  );
}
