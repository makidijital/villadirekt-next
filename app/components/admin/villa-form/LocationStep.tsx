import { Plus, X } from "lucide-react";
import type { ReactNode } from "react";

import Section from "./shared/Section";
import RadioPill from "./shared/RadioPill";

import type {
  VillaDistanceItem,
  VillaMapData,
  VillaMapDataSetter,
} from "./types";
import {
  DISTANCE_OPTIONS,
  DISTANCE_UNITS,
  DEFAULT_DISTANCE_UNIT,
  isCanonicalDistanceTitle,
  parseDistance,
  type DistanceUnit,
} from "@/lib/distance.helper";

/* ===============================================================
   🔥 LocationStep — Wizard Adım 3 (Step 3).
   İki Section:
     - Adım 7  → Mesafeler
     - Adım 10 → Konum (map)
   Pure presentational. Map için MapPicker slot olarak verilir.

   🛡️ FAZ 41 — Distance refinement:
     - Title: free-text → select (DISTANCE_OPTIONS canonical list)
       Legacy custom title varsa option olarak preserve edilir.
     - Distance: numeric input + sabit "km" suffix UI.
       Eski string'lerden numeric kısım strip edilir (display only);
       service-layer "5" → "5 km" normalize eder.
   =============================================================== */

export default function LocationStep({
  distances,
  setDistances,
  mapData,
  setMapData,
  mapPickerSlot,
}: {
  distances: VillaDistanceItem[];
  setDistances: (next: VillaDistanceItem[]) => void;
  mapData: VillaMapData;
  setMapData: VillaMapDataSetter;
  mapPickerSlot: ReactNode;
}) {
  return (
    <>
      {/* DISTANCES — Adım 7 */}
      <Section
        eyebrow="Adım 7"
        title="Mesafeler"
        subtitle="Mülke olan önemli mesafeleri ekle (metre veya kilometre)"
      >
        <div className="space-y-3">
          {distances.map((d, index) => {
            /* Title canonical mı? Değilse legacy custom — option olarak preserve. */
            const titleIsCanonical = isCanonicalDistanceTitle(d.title);

            /* `parseDistance` text-canonical "N m" / "N km" / legacy
               free-text'ten value + unit + isLegacy çıkarır.
               Form-local `d.unit` set edilmişse onu önceliklendir
               (admin az önce dropdown'la değiştirmiş olabilir; text
               re-serialize gecikme yapabilir). */
            const parsed = parseDistance(d.distance);
            const numericValue = parsed.value;
            const currentUnit: DistanceUnit =
              d.unit ?? parsed.unit ?? DEFAULT_DISTANCE_UNIT;
            const distanceIsFreeText = parsed.isLegacy;

            /* Yardımcı: distance text'i {value, unit} çiftinden
               serialize et. Boş value → "" (service-layer prune eder). */
            const serialize = (value: string, unit: DistanceUnit) =>
              value ? `${value} ${unit}` : "";

            return (
              <div
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_160px_36px] gap-3 items-center"
              >
                {/* TITLE select (canonical) — legacy custom title preserve */}
                <select
                  value={d.title || ""}
                  onChange={(e) => {
                    const updated = [...distances];
                    updated[index] = { ...updated[index], title: e.target.value };
                    setDistances(updated);
                  }}
                  className="input min-w-0 w-full"
                >
                  <option value="">Mesafe türü seçin…</option>
                  {DISTANCE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  {/* Legacy custom title — sadece bu kaydın title'ı canonical
                      değilse option olarak görünür. Admin değiştirirse kaybolur. */}
                  {d.title && !titleIsCanonical && (
                    <option value={d.title}>{d.title}</option>
                  )}
                </select>

                {/* DISTANCE numeric input + unit dropdown.
                    Layout: tek rounded container içinde input solda,
                    dikey divider, select sağda. Eski sabit "km" suffix
                    yerine select; aynı hizada kalır. */}
                <div
                  className={
                    "relative flex items-center min-w-0 w-full rounded-xl border " +
                    "border-[var(--color-stone-200)] bg-white " +
                    "focus-within:border-[var(--brand-coral,#ff653f)] " +
                    "transition-colors"
                  }
                  title={
                    distanceIsFreeText
                      ? `Eski değer: "${d.distance}". Yeni değer kaydedince sayı + birim formatına dönüşür.`
                      : undefined
                  }
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="5"
                    value={numericValue}
                    onChange={(e) => {
                      /* Sadece rakam + ondalık (nokta veya virgül) kabul. */
                      const cleaned = e.target.value
                        .replace(/[^0-9.,]/g, "")
                        .replace(",", ".");
                      const updated = [...distances];
                      updated[index] = {
                        ...updated[index],
                        /* Mevcut unit korunur (admin az önce seçtiyse). */
                        unit: currentUnit,
                        distance: serialize(cleaned, currentUnit),
                      };
                      setDistances(updated);
                    }}
                    className="
                      flex-1 min-w-0 !border-0 !shadow-none
                      bg-transparent px-3 py-2 text-sm
                      !text-[var(--color-stone-900)]
                      placeholder:!text-[var(--color-stone-400)]
                      focus:!ring-0 focus:!outline-none
                    "
                  />
                  {/* Dikey divider */}
                  <span
                    aria-hidden
                    className="h-5 w-px bg-[var(--color-stone-200)] mx-0.5 shrink-0"
                  />
                  {/* Unit select — m / km */}
                  <select
                    aria-label="Mesafe birimi"
                    value={currentUnit}
                    onChange={(e) => {
                      const nextUnit = (e.target.value === "m" ? "m" : "km") as DistanceUnit;
                      const updated = [...distances];
                      updated[index] = {
                        ...updated[index],
                        unit: nextUnit,
                        /* Value korunur — sadece text'i yeni unit ile re-serialize. */
                        distance: serialize(numericValue, nextUnit),
                      };
                      setDistances(updated);
                    }}
                    className="
                      shrink-0 appearance-none
                      bg-transparent border-0
                      pl-2 pr-7 py-2 text-sm font-medium
                      text-[var(--color-stone-700)]
                      cursor-pointer
                      focus:!ring-0 focus:!outline-none
                      bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%20fill=%22none%22%20stroke=%22%23a8a29e%22%20stroke-width=%221.6%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22><polyline%20points=%224%206%208%2010%2012%206%22/></svg>')]
                      bg-no-repeat
                      bg-[length:12px_12px]
                      bg-[position:right_0.5rem_center]
                    "
                  >
                    {DISTANCE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* DELETE row */}
                <button
                  type="button"
                  onClick={() =>
                    setDistances(distances.filter((_, i) => i !== index))
                  }
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-stone-400)] hover:text-red-500 hover:bg-red-50 transition shrink-0"
                  aria-label="Sil"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            setDistances([...distances, { title: "", distance: "" }])
          }
          className="w-full mt-3 border border-dashed border-[var(--color-stone-200)] rounded-xl py-3 text-sm text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] hover:border-[var(--brand-coral,#ff653f)] hover:text-[var(--color-stone-900)] transition inline-flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          Yeni mesafe ekle
        </button>
      </Section>

      {/* MAP — Adım 10 */}
      <Section
        eyebrow="Adım 10"
        title="Konum"
        subtitle="Harita tipini seç"
      >
        <div className="flex flex-wrap gap-3 mb-4">
          <RadioPill
            checked={mapData.map_type === "coords"}
            onChange={() =>
              setMapData({ ...mapData, map_type: "coords" })
            }
            label="Haritadan seç (sürükle)"
          />
          <RadioPill
            checked={mapData.map_type === "iframe"}
            onChange={() =>
              setMapData({ ...mapData, map_type: "iframe" })
            }
            label="Google iframe"
          />
        </div>

        {mapData.map_type === "coords" && (
          <div className="rounded-2xl overflow-hidden border border-[var(--color-stone-100)]">
            {mapPickerSlot}
          </div>
        )}

        {mapData.map_type === "iframe" && (
          <textarea
            placeholder="Google Maps iframe kodunu buraya yapıştır…"
            value={mapData.map_embed}
            onChange={(e) =>
              setMapData({ ...mapData, map_embed: e.target.value })
            }
            className="input !rounded-2xl !p-4 h-32 resize-none font-mono text-xs"
          />
        )}
      </Section>

    </>
  );
}
