import { Check } from "lucide-react";

import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ VillaFeaturesSection — PHASE 8D-2
   ===============================================================
   TR villa detay sayfasının (`app/(public)/kiralik-villa/[slug]/
   page.tsx`, "ozellikler" tab slot'u, satır ~608-641) "Ne sunuyor?"
   bloğunun SALT-SUNUM extraction'ı. TR dosyası bu component'i
   KULLANMIYOR — kendi inline JSX'i AYNEN, DOKUNULMADAN duruyor;
   yalnız EN/DE villa detay sayfaları import eder.

   Server component; server-only translation/repository koduna HİÇ
   erişmez — yalnız ZATEN ÇÖZÜLMÜŞ `TranslatedFeature[]` prop'unu
   render eder. Hardcoded TR metinleri ("Ne sunuyor?", "Özellik
   bilgisi bulunmuyor") BİLİNÇLİ OLARAK ÇEVRİLMEDİ (kapsam dışı —
   UI dictionary/localization AYRI bir fazın konusu).
   =============================================================== */

export type TranslatedFeature = {
  id: string;
  /** Gösterilecek metin — çevrilmişse çeviri, yoksa orijinal TR. */
  displayName: string;
};

export default function VillaFeaturesSection({
  features,
  locale,
}: {
  features: TranslatedFeature[];
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  return (
    <section>
      <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
        {dict.villa.featuresTitle}
      </h2>

      {features.length === 0 ? (
        <div className="card-premium mt-5 p-6 text-sm text-[var(--color-stone-400)] italic">
          {dict.villa.featuresEmpty}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
          {features.map((f) => (
            <div
              key={f.id}
              className="
                flex items-center gap-2.5
                text-[var(--color-stone-700)]
                bg-white border border-[var(--color-stone-100)]
                rounded-xl px-4 py-3 text-sm
                hover:border-[var(--color-champagne-300)] hover:shadow-soft
                transition
              "
            >
              <span className="w-5 h-5 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                <Check size={12} className="text-[var(--color-champagne-600)]" />
              </span>
              {f.displayName}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
