import Link from "next/link";
import { Save, Image as ImageIcon } from "lucide-react";

import type { VillaWizardStep } from "./types";

/* ===============================================================
   🔥 StickyActionBar — alttaki sticky Geri / İleri / Galeri /
   Submit bar'ı. Pure presentational; tıklamalar parent
   handler'larına yönlenir.

   İki davranış modu:
     - default (edit page):
         Geri + İleri (stone-bordered, son adımda disabled)
         + Galeri (galeriHref verildiyse) + Submit (her zaman görünür)
         Geri sadece currentStep===1 ise disabled.
     - submitOnlyOnLastStep=true (create page):
         Geri + (currentStep<son ? İleri primary : Submit)
         Galeri YOK. Geri loading sırasında da disabled.

   - submitLabel "Güncelle" / "Villa Ekle" gibi
   - loading true → submit disabled + loadingLabel
   =============================================================== */
export default function StickyActionBar({
  steps,
  currentStep,
  onBack,
  onNext,
  onSubmit,
  loading,
  submitLabel,
  loadingLabel = "Kaydediliyor…",
  galeriHref,
  submitOnlyOnLastStep = false,
  disableNavWhileLoading = false,
}: {
  steps: ReadonlyArray<VillaWizardStep>;
  currentStep: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
  loadingLabel?: string;
  galeriHref?: string;
  submitOnlyOnLastStep?: boolean;
  disableNavWhileLoading?: boolean;
}) {
  const totalSteps = steps.length;
  const stepLabel = steps[currentStep - 1]?.label || "";
  const onLastStep = currentStep === totalSteps;

  const backDisabled =
    currentStep === 1 || (disableNavWhileLoading && loading);

  // Default mode → İleri her zaman render, son adımda disabled
  // submitOnlyOnLastStep → İleri yalnız son-olmayan adımlarda, Submit yalnız son
  const showNext = !submitOnlyOnLastStep || !onLastStep;
  const showSubmit = !submitOnlyOnLastStep || onLastStep;
  // İleri styling: default mode'da ghost stone, create mode'da primary
  const nextClassName = submitOnlyOnLastStep
    ? "btn-primary disabled:opacity-60"
    : "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] disabled:opacity-40 disabled:cursor-not-allowed transition";

  return (
    <div className="sticky bottom-4 z-30">
      <div className="card-premium p-3 flex flex-wrap justify-between items-center gap-3 shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)]">
        <p className="text-sm text-[var(--color-stone-500)] pl-3 hidden sm:block">
          Adım {currentStep} / {totalSteps}
          {stepLabel ? ` — ${stepLabel}` : ""}
        </p>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[var(--color-stone-200)] text-[var(--color-stone-700)] bg-white hover:bg-[var(--color-sand-50)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Geri
          </button>

          {showNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={
                submitOnlyOnLastStep
                  ? loading
                  : onLastStep
              }
              className={nextClassName}
            >
              İleri
            </button>
          )}

          {galeriHref && (
            <Link href={galeriHref} className="btn-ghost">
              <ImageIcon size={15} />
              Galeri
            </Link>
          )}

          {showSubmit && (
            <button
              onClick={onSubmit}
              disabled={loading}
              className={
                submitOnlyOnLastStep
                  ? "btn-primary disabled:opacity-60"
                  : "btn-primary"
              }
            >
              <Save size={15} />
              {loading ? loadingLabel : submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
