/* ===============================================================
   📦 Reservation Detail — WizardStepBar
   ===============================================================
   FAZ 2 refactor: 6-adımlı wizard step bar (clickable pill butonlar).
   active / done / future state'leri page.tsx'teki STEPS + currentStep
   üzerinden derive edilir; logic değişmedi.
=============================================================== */

export type WizardStep = { id: number; label: string };

export default function WizardStepBar({
  steps,
  currentStep,
  totalSteps,
  onStepClick,
}: {
  steps: ReadonlyArray<WizardStep>;
  currentStep: number;
  totalSteps: number;
  onStepClick: (id: number) => void;
}) {
  return (
    <div className="card-premium p-4 flex flex-wrap items-center gap-3">
      <span className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] mr-1">
        Adım {currentStep} / {totalSteps}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s) => {
          const isActive = s.id === currentStep;
          const isDone = s.id < currentStep;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStepClick(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                isActive
                  ? "bg-[var(--color-champagne-500)] text-white border-[var(--color-champagne-500)]"
                  : isDone
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-white text-[var(--color-stone-500)] border-[var(--color-stone-100)] hover:border-[var(--color-stone-200)]"
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
