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
      {/* Eyebrow ("ÇEVREYİ KEŞFEDİN") ve açıklama cümlesi kaldırıldı —
          yalnız başlık. */}
      <h2 className="font-display font-bold text-[18px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em]">
        {dict.villa.detailDistancesTitle}
      </h2>

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
        /* Kompakt mavi kart grid — brand blue (#1B4EF5), düz renk
           (gradient YOK), hafif shadow; sol ince ikon alanı + ad +
           mesafe. Veri/sıralama/ikon eşlemesi AYNEN. */
        <div
          role="list"
          className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5"
        >
          {distances.map((d, i) => {
            const IconCmp: LucideIcon = DISTANCE_ICON_MAP[d.iconKey];
            return (
              <div
                role="listitem"
                key={d.id}
                className="
                  ynp-row group flex items-center gap-2.5 min-w-0
                  rounded-[13px] bg-[#1B4EF5] px-3 py-2.5
                  shadow-[0_4px_12px_-8px_rgba(27,78,245,0.55)]
                  transition duration-200 motion-reduce:transition-none
                  hover:bg-[#2A5BF7] hover:-translate-y-px motion-reduce:hover:translate-y-0
                "
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 w-8 h-8 rounded-[9px] bg-white/15 text-white flex items-center justify-center"
                >
                  <IconCmp size={15} strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[13px] font-semibold text-white truncate">
                    {d.displayTitle}
                  </p>
                  <p
                    className="mt-0.5 text-[12px] font-medium text-white/80 truncate"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {d.displayDistance}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
