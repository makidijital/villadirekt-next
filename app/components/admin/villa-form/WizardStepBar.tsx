"use client";

import { useEffect, useRef } from "react";

import type { VillaWizardStep } from "./types";

/* ===============================================================
   🔥 WizardStepBar — üstteki step navigation card'ı.
   Pure presentational. Edit page'de tüm step'lere serbest
   navigation, create page'de yalnızca tamamlanmış step'lere
   geri dönüş için kullanılabilir (mod prop'larıyla).

   - currentStep    : aktif step id
   - steps          : { id, label }[]
   - onStepClick(s) : page tarafından kontrol edilen state setter
   - allowFreeNav   : true → tüm step'lere atlama serbest (edit page)
                       false → sadece tamamlanmışlara (create page)
                       default: true (edit page davranışı)
   =============================================================== */
export default function WizardStepBar({
  steps,
  currentStep,
  onStepClick,
  allowFreeNav = true,
}: {
  steps: ReadonlyArray<VillaWizardStep>;
  currentStep: number;
  onStepClick: (id: number) => void;
  allowFreeNav?: boolean;
}) {
  const totalSteps = steps.length;

  /* 🔥 UX — step değişiminde (İleri/Geri veya step chip) yeni adımın en
     üstüne yumuşak scroll. `scrollIntoView` (window.scrollTo DEĞİL) +
     block:"start"; sticky admin header (h-16) için root'ta scroll-mt-24.
     İlk mount'ta ÇALIŞMAZ (yalnız currentStep değişiminde). Validation/
     state/form davranışı DEĞİŞMEZ — yalnız görsel scroll. */
  const barRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    barRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentStep]);

  return (
    <div
      ref={barRef}
      className="card-premium p-4 flex flex-wrap items-center gap-3 scroll-mt-24"
    >
      <span className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] mr-1">
        Adım {currentStep} / {totalSteps}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => {
          const isActive = s.id === currentStep;
          const isDone = s.id < currentStep;
          const canJump = allowFreeNav || s.id <= currentStep;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (canJump) onStepClick(s.id);
              }}
              disabled={!canJump}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                isActive
                  ? "bg-[var(--color-champagne-500)] text-white border-[var(--color-champagne-500)]"
                  : isDone
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : canJump
                      ? "bg-white text-[var(--color-stone-500)] border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
                      : "bg-white text-[var(--color-stone-400)] border-[var(--color-stone-100)] cursor-not-allowed"
              }`}
            >
              {s.id}. {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
