"use client";

import { useMemo, useState } from "react";
import { CalendarRange, X, Lock, Globe } from "lucide-react";
import { parseLocalDate } from "@/lib/date-format";
import {
  countActiveBlocks,
  type ActiveBlockKind,
  type UnifiedActiveBlock,
} from "@/lib/active-blocks.helper";

/* ===============================================================
   🎯 AKTİF BLOKLAR PANELİ (sunum — presentational)
   ===============================================================
   Manuel bloklar + iCal rezervasyonlarını TEK listede gösterir.
   Tip başına badge, sağ üstte filtre sekmeleri (adet + toplam),
   silme YALNIZ manuel/her-ikisi satırlarda (iCal salt-okunur).

   ⚠️ İş mantığı / veri çekme YOK — tüm veri prop ile gelir
   (`buildActiveBlocks` çıktısı). Takvim render'ı etkilenmez.
=============================================================== */

type FilterKey = "all" | ActiveBlockKind;

interface ManualDeletePayload {
  id: string;
  start_date: string;
  end_date: string;
  note: string | null;
}

interface ActiveBlocksPanelProps {
  blocks: UnifiedActiveBlock[];
  onDeleteManual: (block: ManualDeletePayload) => void;
  deletingId: string | null;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "manual", label: "Manuel" },
  { key: "ical", label: "iCal" },
  { key: "both", label: "Her ikisi" },
];

function rangeLabel(start: string, end: string): string {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  const base = { day: "numeric", month: "short" } as const;
  return `${s.toLocaleDateString("tr-TR", base)} → ${e.toLocaleDateString(
    "tr-TR",
    { ...base, year: "numeric" }
  )}`;
}

/* Tip badge'i — manuel: amber · iCal: violet · her ikisi: split. */
function BlockBadge({ kind }: { kind: ActiveBlockKind }) {
  if (kind === "both") {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white tracking-wide select-none"
        style={{
          background:
            "linear-gradient(90deg, #d97706 0%, #d97706 50%, #7c3aed 50%, #7c3aed 100%)",
        }}
      >
        Her ikisi
      </span>
    );
  }
  if (kind === "ical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 select-none">
        <Globe size={10} strokeWidth={2.5} />
        iCal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 select-none">
      <Lock size={10} strokeWidth={2.5} />
      Manuel
    </span>
  );
}

export default function ActiveBlocksPanel({
  blocks,
  onDeleteManual,
  deletingId,
}: ActiveBlocksPanelProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => countActiveBlocks(blocks), [blocks]);

  const visible = useMemo(
    () => (filter === "all" ? blocks : blocks.filter((b) => b.kind === filter)),
    [blocks, filter]
  );

  if (blocks.length === 0) return null;

  return (
    <div className="card-premium p-5 space-y-4">
      {/* Başlık + filtreler */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] flex items-center gap-1.5">
          <CalendarRange
            size={12}
            className="text-[var(--color-champagne-600)]"
          />
          Aktif Bloklar ({counts.all})
        </p>

        <div className="flex flex-wrap gap-1 rounded-full bg-[var(--color-sand-50)] p-1">
          {FILTERS.map((f) => {
            const count =
              f.key === "all" ? counts.all : counts[f.key as ActiveBlockKind];
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors motion-reduce:transition-none " +
                  (active
                    ? "bg-white text-[var(--color-stone-900)] shadow-sm"
                    : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-700)]")
                }
              >
                {f.label}
                <span
                  className={
                    "inline-flex min-w-[18px] justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums " +
                    (active
                      ? "bg-[var(--color-stone-900)] text-white"
                      : "bg-[var(--color-sand-200)] text-[var(--color-stone-600)]")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Açıklama */}
      <p className="text-[12px] text-[var(--color-stone-500)] leading-relaxed">
        Bu listede manuel bloklar ve iCal rezervasyonları birlikte gösterilir.
        Aynı tarih aralığı hem iCal hem manuel olarak kapatıldıysa &ldquo;Her
        ikisi&rdquo; olarak işaretlenir.
      </p>

      {/* Liste */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-sand-200)] px-4 py-6 text-center text-[12.5px] text-[var(--color-stone-400)]">
          Bu filtrede blok yok.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((b) => {
            const deletable = b.manualId !== null;
            const isDeleting = deletingId !== null && deletingId === b.manualId;
            const secondary =
              b.kind === "both"
                ? `Çift kaynak: manuel + iCal${b.sourceName ? ` (${b.sourceName})` : ""}${b.note ? ` · Not: ${b.note}` : ""}`
                : b.kind === "ical"
                  ? b.sourceName || "Harici takvim"
                  : b.note
                    ? `Not: ${b.note}`
                    : null;

            return (
              <li
                key={b.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <BlockBadge kind={b.kind} />
                  <div className="min-w-0">
                    <p
                      className="truncate text-[13px] font-medium text-[var(--color-stone-800)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {rangeLabel(b.start_date, b.end_date)}
                    </p>
                    {secondary && (
                      <p className="truncate text-[11.5px] text-[var(--color-stone-500)]">
                        {secondary}
                      </p>
                    )}
                  </div>
                </div>

                {deletable ? (
                  <button
                    type="button"
                    onClick={() =>
                      onDeleteManual({
                        id: b.manualId as string,
                        start_date: b.manualStartDate ?? b.start_date,
                        end_date: b.manualEndDate ?? b.end_date,
                        note: b.note,
                      })
                    }
                    disabled={isDeleting}
                    aria-label="Manuel bloğu sil"
                    title={
                      b.kind === "both"
                        ? "Manuel bloğun tamamı silinir (iCal kaydı etkilenmez)"
                        : "Manuel bloğu sil"
                    }
                    className="
                      shrink-0 inline-flex items-center justify-center
                      h-7 w-7 rounded-full
                      border border-[var(--color-stone-200)] bg-white
                      text-[var(--color-stone-400)]
                      hover:border-red-300 hover:bg-red-50 hover:text-red-600
                      transition-colors motion-reduce:transition-none
                      disabled:opacity-50 disabled:cursor-not-allowed
                    "
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                ) : (
                  <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-[var(--color-stone-400)] select-none">
                    salt-okunur
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
