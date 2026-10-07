import { Check } from "lucide-react";

import PublicBreadcrumb from "@/app/components/ui/PublicBreadcrumb";

/* ===============================================================
   🧾 ReservationCheckoutHeader — /rezervasyon/[slug] checkout başlığı
   ===============================================================
   SALT SUNUM (server component, state/effect YOK). PageHero bandının
   yerini alan kompakt checkout başlığı:
     • Breadcrumb (aynı isimler + aynı locale-aware href'ler — çağıran
       taraf hesaplar, bu component yalnız render eder).
     • Görsel adım göstergesi (Villa Seçimi → Bilgiler → Rezervasyon).
       Yalnız görsel; yeni step logic YOK — kullanıcı her zaman
       "Bilgiler" adımındadır (villa önceki sayfada seçildi).
     • Başlık + kısa güven açıklaması.
   Tüm metinler çağıran taraftan (dictionary) gelir — hardcoded YOK.
   =============================================================== */

export type { BreadcrumbItem as CheckoutCrumb } from "@/app/components/ui/PublicBreadcrumb";
import type { BreadcrumbItem } from "@/app/components/ui/PublicBreadcrumb";

type Props = {
  breadcrumb: BreadcrumbItem[];
  breadcrumbAriaLabel?: string;
  steps: { label: string }[];
  /** 0-based aktif adım indeksi (görsel). */
  activeStep: number;
  stepsAriaLabel: string;
  title: string;
  description: string;
};

export default function ReservationCheckoutHeader({
  breadcrumb,
  breadcrumbAriaLabel = "Breadcrumb",
  steps,
  activeStep,
  stepsAriaLabel,
  title,
  description,
}: Props) {
  return (
    <header className="mb-6 md:mb-8">
      {/* BREADCRUMB — ortak PublicBreadcrumb (markup/stil AYNEN taşındı) */}
      <PublicBreadcrumb items={breadcrumb} ariaLabel={breadcrumbAriaLabel} />

      <div className="mt-4 md:mt-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[24px] md:text-[30px] leading-tight tracking-[-0.02em] text-[#0A1633]">
            {title}
          </h1>
          <p className="mt-1.5 text-[13px] md:text-[14px] leading-relaxed text-[#5B6478] max-w-xl">
            {description}
          </p>
        </div>

        {/* ADIM GÖSTERGESİ — yalnız görsel */}
        <ol
          aria-label={stepsAriaLabel}
          className="flex flex-wrap items-center gap-x-1.5 gap-y-2 sm:gap-x-2 md:shrink-0"
        >
          {steps.map((s, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <li
                key={s.label}
                className="flex items-center gap-1.5 sm:gap-2"
                aria-current={active ? "step" : undefined}
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={
                      "h-px w-4 sm:w-6 " + (done || active ? "bg-[#1B4EF5]" : "bg-[#D5DBE6]")
                    }
                  />
                )}
                <span
                  aria-hidden="true"
                  className={
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold " +
                    (done
                      ? "bg-[#1B4EF5] text-white"
                      : active
                        ? "bg-white text-[#1B4EF5] ring-2 ring-[#1B4EF5]"
                        : "bg-white text-[#A3ACBD] ring-1 ring-[#D5DBE6]")
                  }
                >
                  {done ? <Check size={11} strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={
                    "text-[11.5px] sm:text-[12px] whitespace-nowrap " +
                    (active
                      ? "font-semibold text-[#0A1633]"
                      : done
                        ? "font-medium text-[#1B4EF5]"
                        : "text-[#8A93A6]")
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}
