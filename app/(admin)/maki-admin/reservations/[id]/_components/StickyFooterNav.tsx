/* ===============================================================
   📦 Reservation Detail — StickyFooterNav (Geri / İleri / Kaydet)
   ===============================================================
   FAZ 2 refactor: sticky bottom navigation bar. saveAll / goBack /
   goNext page.tsx'te tanımlı handler'lar; prop olarak gelir.
   Disabled state'ler currentStep boundary'lerinden derive edilir.
=============================================================== */

import { Save } from "lucide-react";

import type { WizardStep } from "./WizardStepBar";

export default function StickyFooterNav({
  currentStep,
  totalSteps,
  steps,
  goBack,
  goNext,
  saveAll,
}: {
  currentStep: number;
  totalSteps: number;
  steps: ReadonlyArray<WizardStep>;
  goBack: () => void;
  goNext: () => void;
  saveAll: () => void | Promise<void>;
}) {
  return (
    <div className="sticky bottom-4 z-30">
      <div className="card-premium p-3 flex flex-wrap justify-between items-center gap-3 shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)]">
        <p className="text-sm text-[var(--color-stone-500)] pl-3 hidden sm:block">
          Adım {currentStep} / {totalSteps}
          {steps[currentStep - 1] ? ` — ${steps[currentStep - 1].label}` : ""}
        </p>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStep === 1}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Geri
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={currentStep === totalSteps}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            İleri
          </button>
          <button onClick={saveAll} className="btn-primary">
            <Save size={15} />
            Değişiklikleri Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
