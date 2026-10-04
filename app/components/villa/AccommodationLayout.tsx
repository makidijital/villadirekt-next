import { BedDouble, Bath } from "lucide-react";

import {
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";
/* 🛡️ PHASE 10E — locale-aware etiket/metin kaynakları. `lib/villa-layout.helper.ts`
   DEĞİŞTİRİLMEDİ; oradaki TR sabitleri (BED_TYPE_LABELS/BATHROOM_TYPE_LABELS) admin
   formunda aynen kullanılmaya devam ediyor. Bu component artık etiketleri dictionary
   üzerinden okuyor — TR dictionary değerleri o sabitlerle BİREBİR aynı olduğu için
   TR çıktısı DEĞİŞMEZ (tests/unit/villa-layout-label.helper.test.ts bunu kilitliyor). */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";
import {
  getBedTypeLabel,
  getBathroomTypeLabel,
  getBedroomNameLabel,
  getBathroomNameLabel,
} from "@/lib/villa-layout-label.helper";

/* ===============================================================
   🛡️ AccommodationLayout — public "Konaklama Düzeni" (mig 047)
   ===============================================================
   PURE PRESENTATIONAL (PriceList / VillaInfoBar paterni):
     - Server component'ten normalize edilmiş layout alır.
     - Airbnb tarzı kart grid; mevcut detay design dili (eyebrow +
       responsive grid + soft border kart).
     - Veri yoksa NULL render (caller zaten boş diziyse section
       çizmez; bu component ekstra guard).
   =============================================================== */

/* Kompakt mavi kart dili — "Yakındaki Noktalar" ile AYNI: brand blue
   (#1B4EF5), düz renk (gradient YOK), ~56px yükseklik, hafif mavi gölge,
   sol ince ikon alanı + ad + detay; uzun metin `…` ile kısalır. */
const CARD_CLASS =
  "group flex items-center gap-2.5 min-w-0 rounded-[13px] bg-[#1B4EF5] px-3 py-2.5 shadow-[0_4px_12px_-8px_rgba(27,78,245,0.55)] transition duration-200 motion-reduce:transition-none hover:bg-[#2A5BF7] hover:-translate-y-px motion-reduce:hover:translate-y-0";
const ICON_CLASS =
  "shrink-0 w-8 h-8 rounded-[9px] bg-white/15 text-white flex items-center justify-center";

type Props = {
  bedrooms: BedroomLayoutItem[];
  bathrooms: BathroomLayoutItem[];
  /* 🛡️ PHASE 10E — OPSİYONEL. Verilmezse "tr" → mevcut çağrı imzası
     (TR page.tsx) HİÇ DEĞİŞMEDEN çalışmaya devam eder. */
  locale?: Locale;
};

export default function AccommodationLayout({
  bedrooms,
  bathrooms,
  locale = "tr",
}: Props) {
  const hasBedrooms = bedrooms.length > 0;
  const hasBathrooms = bathrooms.length > 0;
  if (!hasBedrooms && !hasBathrooms) return null;

  const dict = getDictionary(locale);

  /* 🛡️ GÖRÜNEN AD ZİNCİRİ: sözlük çevirisi → numara fallback.
     Oda/banyo adları villa bazında DEĞİL, merkezi i18n sözlüğünden
     çözülür (lib/villa-layout-label.helper.ts → roomNameLabels).
     TR'de sözlük identity-map olduğu için TR çıktısı DEĞİŞMEZ; adı boş
     olan satır (TR'de de böyleydi) numara fallback'ine düşer. */

  return (
    <section>
      <h2 className="font-display font-bold text-[18px] leading-tight text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
        {dict.accommodation.sectionTitle}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {/* YATAK ODALARI — kompakt mavi kartlar */}
        {bedrooms.map((room, i) => {
          const bedSummary = room.beds
            .map((b) => `${getBedTypeLabel(b.type, locale)} × ${b.count}`)
            .join(" · ");
          return (
            <div
              key={`bed-${i}`}
              className={CARD_CLASS}
            >
              <span
                aria-hidden="true"
                className={ICON_CLASS}
              >
                <BedDouble size={15} strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-semibold text-white truncate">
                  {getBedroomNameLabel(room.name, locale) ||
                    formatDictionaryString(dict.accommodation.bedroomFallback, {
                      n: i + 1,
                    })}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-white/80 truncate">
                  {bedSummary || dict.accommodation.noDetail}
                </p>
              </div>
            </div>
          );
        })}

        {/* BANYOLAR — kompakt mavi kartlar */}
        {bathrooms.map((b, i) => (
          <div
            key={`bath-${i}`}
            className={CARD_CLASS}
          >
            <span
              aria-hidden="true"
              className={ICON_CLASS}
            >
              <Bath size={15} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[13px] font-semibold text-white truncate">
                {getBathroomNameLabel(b.name, locale) ||
                  formatDictionaryString(dict.accommodation.bathroomFallback, {
                    n: i + 1,
                  })}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-white/80 truncate">
                {getBathroomTypeLabel(b.type, locale)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
