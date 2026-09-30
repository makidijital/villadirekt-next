import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";

import {
  MapPin,
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  Bus,
  Building2,
  Cross,
  Fuel,
  GraduationCap,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DistanceIconKey } from "@/lib/distance.helper";

/* ===============================================================
   🛡️ VillaDistancesSection — PHASE 8D-2
   ===============================================================
   TR villa detay sayfasının (`app/(public)/kiralik-villa/[slug]/
   page.tsx`, "konum" tab slot'u, satır ~518-606) "Yakındaki
   Noktalar" bloğunun SALT-SUNUM extraction'ı. TR dosyası bu
   component'i KULLANMIYOR — kendi inline JSX'i AYNEN, DOKUNULMADAN
   duruyor; bu component YALNIZ EN/DE villa detay sayfaları
   tarafından import edilir (Phase 8D-2 audit'in onaylanan
   "3 küçük server component" kararı).

   Server component (interaktivite yok — useState/onClick YOK,
   "use client" GEREKMİYOR). Server-only translation/repository
   koduna HİÇ erişmez — yalnız ZATEN ÇÖZÜLMÜŞ `TranslatedDistance[]`
   prop'unu render eder; çeviri/fallback çözümü ÇAĞIRAN page.tsx
   içinde `getTranslationsForParents` (Phase 8D-1) +
   `resolveTranslatedField` ile yapılır.

   Hardcoded TR UI metinleri ("ÇEVREYİ KEŞFEDİN", "Yakındaki
   Noktalar", açıklama cümlesi, "Bilgi yok") BİLİNÇLİ OLARAK
   ÇEVRİLMEDİ — bu fazın kapsamı yalnız DB-backed veri çevirisi
   (UI dictionary/localization AYRI bir fazın konusu).

   🛡️ ICON KEY — `iconKey` prop'u ÇAĞIRAN TARAFTA, ORİJİNAL (TR)
   `distance.title`'dan hesaplanmış olarak gelir (`getDistanceIconKey`
   TÜRKÇE anahtar kelimeye bağlı — çevrilmiş başlıkla hesaplanırsa
   ikonlar sessizce "pin" fallback'ine düşer, bkz. Phase 8D-2 audit
   "DISTANCE ICON KRİTİK"). Bu component icon key HESAPLAMAZ, yalnız
   `DISTANCE_ICON_MAP[d.iconKey]` ile ikonu render eder.
   =============================================================== */

const DISTANCE_ICON_MAP: Record<DistanceIconKey, LucideIcon> = {
  restaurant: UtensilsCrossed,
  store: ShoppingBag,
  waves: Waves,
  plane: Plane,
  bus: Bus,
  building: Building2,
  cross: Cross,
  fuel: Fuel,
  school: GraduationCap,
  pin: MapPin,
};

export type TranslatedDistance = {
  id: string;
  /** Gösterilecek metin — çevrilmişse çeviri, yoksa orijinal TR. */
  displayTitle: string;
  /** Gösterilecek mesafe metni — çevrilmişse çeviri, yoksa orijinal TR. */
  displayDistance: string;
  /** ORİJİNAL (TR) title'dan hesaplanmış ikon anahtarı — ÇEVRİLMİŞ
   *  değerle HESAPLANMAMALI (bkz. dosya başı yorum). */
  iconKey: DistanceIconKey;
};

export default function VillaDistancesSection({
  distances,
  locale,
}: {
  distances: TranslatedDistance[];
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  return (
    <section>
      <div className="max-w-xl">
        <div className="flex items-center gap-2.5 mb-3">
          <span
            aria-hidden="true"
            className="h-px w-9 bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
          />
          <span className="text-[11px] font-semibold tracking-[0.16em] text-[var(--color-stone-400)]">
            {dict.villa.distancesEyebrow}
          </span>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          {dict.villa.distancesTitle}
        </h2>
        <p className="mt-2.5 text-[14px] md:text-[14.5px] text-[var(--color-stone-500)] leading-relaxed">
          {dict.villa.distancesSubtitle}
        </p>
      </div>

      {/* 🛡️ Component-scoped satır fade/stagger animasyonu +
          reduced-motion guard — TR'deki AYNI inline stil bloğu. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ynp-row { animation: ynp-fade-in 500ms ease-out both; }
        }
        @keyframes ynp-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {distances.length === 0 ? (
        <p className="mt-6 text-[var(--color-stone-400)] text-sm italic">
          {dict.villa.distancesEmpty}
        </p>
      ) : (
        <div
          role="list"
          className="mt-7 md:mt-8 border-t border-[var(--color-stone-100)]"
        >
          {distances.map((d, i) => {
            const IconCmp: LucideIcon = DISTANCE_ICON_MAP[d.iconKey];
            return (
              <div
                role="listitem"
                key={d.id}
                className="
                  ynp-row group relative flex items-center gap-4 md:gap-5
                  py-4 md:py-[18px]
                  border-b border-[var(--color-stone-100)]
                  transition-transform duration-300 motion-reduce:transition-none
                  hover:translate-x-1.5 motion-reduce:hover:translate-x-0
                "
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-2.5 -left-px w-[2.5px] rounded-full bg-gradient-to-b from-[#ED7926] to-[#0973BA] opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
                />
                <span className="relative shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-[#ED7926]/10 to-[#0973BA]/10 text-[#0973BA] flex items-center justify-center transition-colors duration-300 motion-reduce:transition-none group-hover:from-[#ED7926]/20 group-hover:to-[#0973BA]/20">
                  <IconCmp size={15} strokeWidth={1.75} />
                </span>
                <p className="relative min-w-0 flex-1 text-[14px] md:text-[15px] font-medium text-[var(--color-stone-700)] truncate tracking-[-0.005em]">
                  {d.displayTitle}
                </p>
                <p
                  className="relative shrink-0 font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] tracking-[-0.01em]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {d.displayDistance}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
