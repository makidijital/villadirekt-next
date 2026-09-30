"use client";

/* ===============================================================
   🛡️ AccommodationLayoutStep — Konaklama Düzeni (mig 047)
   ===============================================================
   PURE PRESENTATIONAL (VideoStep paterni):
     - Container'dan `bedrooms`/`bathrooms` + setter'ları alır.
     - Hiçbir API çağrısı yok; save işi villa-admin.service'in.
     - İki sekme: Yatak Odaları / Banyolar.

   Mevcut bedrooms/bathrooms TOPLAM sayıları AYRI alanlar
   (BasicInfoStep); bu component ek detaydır. Boş bırakılabilir.
   =============================================================== */

import { useState } from "react";
import { Plus, X, BedDouble, Bath, ChevronUp, ChevronDown } from "lucide-react";

import Section from "./shared/Section";
import {
  BED_TYPES,
  BED_TYPE_LABELS,
  BATHROOM_TYPES,
  BATHROOM_TYPE_LABELS,
  BEDROOM_NAME_SUGGESTIONS,
  type BedType,
  type BathroomType,
  type BedroomLayoutItem,
  type BathroomLayoutItem,
} from "@/lib/villa-layout.helper";

type Props = {
  bedrooms: BedroomLayoutItem[];
  setBedrooms: (next: BedroomLayoutItem[]) => void;
  bathrooms: BathroomLayoutItem[];
  setBathrooms: (next: BathroomLayoutItem[]) => void;
};

type Tab = "bedrooms" | "bathrooms";

export default function AccommodationLayoutStep({
  bedrooms,
  setBedrooms,
  bathrooms,
  setBathrooms,
}: Props) {
  const [tab, setTab] = useState<Tab>("bedrooms");

  /* ---------------- BEDROOM OPS ---------------- */
  const addBedroom = () => {
    const n = bedrooms.length + 1;
    setBedrooms([
      ...bedrooms,
      { name: `${n}. Yatak Odası`, beds: [] },
    ]);
  };
  const removeBedroom = (idx: number) => {
    setBedrooms(bedrooms.filter((_, i) => i !== idx));
  };
  const moveBedroom = (idx: number, dir: -1 | 1) => {
    const t = idx + dir;
    if (t < 0 || t >= bedrooms.length) return;
    const next = [...bedrooms];
    [next[idx], next[t]] = [next[t], next[idx]];
    setBedrooms(next);
  };
  const setBedroomName = (idx: number, name: string) => {
    setBedrooms(
      bedrooms.map((r, i) => (i === idx ? { ...r, name } : r))
    );
  };
  const setBedCount = (idx: number, type: BedType, count: number) => {
    setBedrooms(
      bedrooms.map((r, i) => {
        if (i !== idx) return r;
        const beds = r.beds.filter((b) => b.type !== type);
        if (count > 0) beds.push({ type, count });
        return { ...r, beds };
      })
    );
  };
  const getBedCount = (room: BedroomLayoutItem, type: BedType): number =>
    room.beds.find((b) => b.type === type)?.count ?? 0;

  /* ---------------- BATHROOM OPS ---------------- */
  const addBathroom = () => {
    const n = bathrooms.length + 1;
    setBathrooms([...bathrooms, { name: `${n}. Banyo`, type: "full" }]);
  };
  const removeBathroom = (idx: number) => {
    setBathrooms(bathrooms.filter((_, i) => i !== idx));
  };
  const setBathroomName = (idx: number, name: string) => {
    setBathrooms(
      bathrooms.map((b, i) => (i === idx ? { ...b, name } : b))
    );
  };
  const setBathroomType = (idx: number, type: BathroomType) => {
    setBathrooms(
      bathrooms.map((b, i) => (i === idx ? { ...b, type } : b))
    );
  };

  return (
    <Section
      eyebrow="Detaylar"
      title="Konaklama Düzeni"
      subtitle="Oda bazında yatak ve banyo düzenini girin (opsiyonel). Toplam yatak odası / banyo sayısı ayrı alanlardadır."
    >
      {/* TABS */}
      <div className="inline-flex items-center gap-1 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] p-1 mb-6">
        <button
          type="button"
          onClick={() => setTab("bedrooms")}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none ${
            tab === "bedrooms"
              ? "bg-white text-[var(--color-stone-900)] shadow-sm"
              : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-800)]"
          }`}
        >
          <BedDouble size={14} /> Yatak Odaları
          {bedrooms.length > 0 && (
            <span className="tabular-nums text-[11px] opacity-70">
              ({bedrooms.length})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("bathrooms")}
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none ${
            tab === "bathrooms"
              ? "bg-white text-[var(--color-stone-900)] shadow-sm"
              : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-800)]"
          }`}
        >
          <Bath size={14} /> Banyolar
          {bathrooms.length > 0 && (
            <span className="tabular-nums text-[11px] opacity-70">
              ({bathrooms.length})
            </span>
          )}
        </button>
      </div>

      {/* shared datalist for bedroom name suggestions */}
      <datalist id="bedroom-name-suggestions">
        {BEDROOM_NAME_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* ============ YATAK ODALARI ============ */}
      {tab === "bedrooms" && (
        <div className="space-y-4">
          {bedrooms.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-500)]">
              Henüz oda eklenmedi. Aşağıdaki butonla ilk yatak odasını
              ekleyin.
            </p>
          ) : (
            <ul className="space-y-4">
              {bedrooms.map((room, idx) => (
                <li
                  key={idx}
                  className="rounded-2xl border border-[var(--color-stone-200)] bg-white p-4 md:p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      list="bedroom-name-suggestions"
                      value={room.name}
                      onChange={(e) => setBedroomName(idx, e.target.value)}
                      placeholder="Oda adı (örn. Ana Yatak Odası)"
                      className="flex-1 min-w-0 rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[14px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--brand-coral,#ff653f)] transition-colors"
                    />
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveBedroom(idx, -1)}
                        disabled={idx === 0}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Yukarı taşı"
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBedroom(idx, 1)}
                        disabled={idx === bedrooms.length - 1}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        aria-label="Aşağı taşı"
                      >
                        <ChevronDown size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBedroom(idx)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-stone-400)] hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="Odayı sil"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Bed type counters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {BED_TYPES.map((bt) => {
                      const count = getBedCount(room, bt);
                      return (
                        <div
                          key={bt}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)]/40 px-3 py-2"
                        >
                          <span className="text-[13px] text-[var(--color-stone-700)] truncate">
                            {BED_TYPE_LABELS[bt]}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setBedCount(idx, bt, Math.max(0, count - 1))
                              }
                              disabled={count === 0}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--color-stone-200)] bg-white text-[var(--color-stone-600)] hover:border-[var(--color-stone-300)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label={`${BED_TYPE_LABELS[bt]} azalt`}
                            >
                              –
                            </button>
                            <span className="w-6 text-center text-[14px] font-medium tabular-nums text-[var(--color-stone-900)]">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setBedCount(idx, bt, Math.min(20, count + 1))
                              }
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[var(--color-stone-200)] bg-white text-[var(--color-stone-600)] hover:border-[var(--color-stone-300)] transition-colors"
                              aria-label={`${BED_TYPE_LABELS[bt]} arttır`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addBedroom}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 border border-dashed border-[var(--color-stone-300)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--brand-coral,#ff653f)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
          >
            <Plus size={14} /> Yatak Odası Ekle
          </button>
        </div>
      )}

      {/* ============ BANYOLAR ============ */}
      {tab === "bathrooms" && (
        <div className="space-y-4">
          {bathrooms.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-500)]">
              Henüz banyo eklenmedi. Aşağıdaki butonla ilk banyoyu ekleyin.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {bathrooms.map((b, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--color-stone-200)] bg-white p-3 md:p-4"
                >
                  <span className="text-[10px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] shrink-0">
                    #{idx + 1}
                  </span>
                  <input
                    value={b.name}
                    onChange={(e) => setBathroomName(idx, e.target.value)}
                    placeholder="Banyo adı (örn. 1. Banyo)"
                    className="flex-1 min-w-0 rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[14px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:outline-none focus:border-[var(--brand-coral,#ff653f)] transition-colors"
                  />
                  <select
                    value={b.type}
                    onChange={(e) =>
                      setBathroomType(idx, e.target.value as BathroomType)
                    }
                    className="shrink-0 rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[14px] text-[var(--color-stone-900)] focus:outline-none focus:border-[var(--brand-coral,#ff653f)] transition-colors"
                  >
                    {BATHROOM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {BATHROOM_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeBathroom(idx)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-[var(--color-stone-400)] hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label="Banyoyu sil"
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addBathroom}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 border border-dashed border-[var(--color-stone-300)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--brand-coral,#ff653f)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
          >
            <Plus size={14} /> Banyo Ekle
          </button>
        </div>
      )}
    </Section>
  );
}
