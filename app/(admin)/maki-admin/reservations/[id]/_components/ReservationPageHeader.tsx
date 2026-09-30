/* ===============================================================
   📦 Reservation Detail — ReservationPageHeader
   ===============================================================
   FAZ 2 refactor: page üst başlığı + Sil butonu + meta cards
   (Rezervasyon Kodu / Oluşturma tarihi / Villa) — JSX byte-identical
   _components/'a taşındı.

   formatDate / reservationCodeDisplay / deleteReservation prop'tan
   gelir; logic page.tsx'te. HomeIcon lucide import burada local.
=============================================================== */

import { Trash2, Home as HomeIcon } from "lucide-react";

export default function ReservationPageHeader({
  data,
  formatDate,
  reservationCodeDisplay,
  deleteReservation,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  formatDate: (value?: string) => string;
  reservationCodeDisplay: (no: unknown) => string;
  deleteReservation: () => void | Promise<void>;
}) {
  return (
    <>
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Rezervasyon</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            {data.name || "Rezervasyon detayı"}
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Rezervasyon bilgilerini düzenle ve yönet.
          </p>
        </div>

        <button
          onClick={deleteReservation}
          className="inline-flex items-center gap-2 text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition self-start text-sm font-medium"
        >
          <Trash2 size={14} />
          Sil
        </button>
      </div>
    </>
  );
}

/* ===============================================================
   📦 ReservationMetaCards — Rezervasyon Kodu / Oluşturma / Villa
   =============================================================== */
export function ReservationMetaCards({
  data,
  formatDate,
  reservationCodeDisplay,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  formatDate: (value?: string) => string;
  reservationCodeDisplay: (no: unknown) => string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card-premium p-5">
        <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
          Rezervasyon Kodu
        </p>
        <p className="font-display text-xl text-[var(--color-stone-900)] mt-1 tabular-nums tracking-[-0.01em] select-all">
          {reservationCodeDisplay(data.reservation_no)}
        </p>
      </div>
      <div className="card-premium p-5">
        <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
          Oluşturma tarihi
        </p>
        <p className="font-display text-xl text-[var(--color-stone-900)] mt-1">
          {formatDate(data.created_at)}
        </p>
      </div>
      <div className="card-premium p-5">
        <p className="text-[11px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)] flex items-center gap-1.5">
          <HomeIcon
            size={11}
            className="text-[var(--color-champagne-600)]"
          />
          Mülk
        </p>
        <p className="font-medium text-[var(--color-stone-900)] mt-1 truncate">
          {data.villa?.title || "—"}
        </p>
      </div>
    </div>
  );
}
