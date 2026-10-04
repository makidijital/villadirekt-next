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
      <h2 className="font-display font-bold text-[18px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]">
        {dict.villa.detailFeaturesTitle}
      </h2>

      {features.length === 0 ? (
        <div className="card-premium mt-5 p-6 text-sm text-[var(--color-stone-400)] italic">
          {dict.villa.featuresEmpty}
        </div>
      ) : (
        /* Kompakt/minimal liste — kart kutuları kaldırıldı; sıkı 2/3
           kolon grid, tek satır öğe, küçük çizgisel check ikonu.
           Veri/sıralama AYNEN. */
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-2 mt-3.5">
          {features.map((f) => (
            <li
              key={f.id}
              title={f.displayName}
              className="flex items-center gap-1.5 min-w-0 text-[13px] leading-5 text-[var(--color-stone-700)]"
            >
              <Check
                size={13}
                strokeWidth={2.5}
                aria-hidden="true"
                className="shrink-0 text-[var(--color-champagne-600)]"
              />
              <span className="truncate">{f.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
