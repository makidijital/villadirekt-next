"use client";

import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import ManualReservationForm from "../ekle/ManualReservationForm";

/* ===============================================================
   🛡️ /maki-admin/manual-reservations/[id] — Edit
   ===============================================================
   Eski pattern (RSC + anon `db`) migration 040 admin-only RLS
   sonrası `getManualReservationById` null döndürüyor → `notFound()`
   → **Next page 404**. Aynı silent RLS fail liste sayfasında da
   yaşandı; bu sayfa için de aynı düzeltme uygulandı:

     RSC `getManualReservationById` (anon)        ← BROKEN (RLS DENY)
       ↓
     "use client" + adminFetch → /api/admin/manual-reservations/[id]
       → service-role repository (findById)        ← FIX

   ⚠️ BYTE-IDENTICAL KORUMA:
     - Row shape: `{ id, villa_id, start_date, end_date, note, source,
       status, created_at }` — eski service return ile aynı; form
       sadece 5 alanı (id, villa_id, start_date, end_date, note) tüketir.
     - Missing row → `notFound()` aynen (404 route → page tarafında
       Next.js not-found UI tetiklenir).
     - ManualReservationForm props (`villas`, `mode="edit"`,
       `initialData`) aynen besleniyor.
     - Geri linki + başlıklar + açıklama metni AYNEN.
     - villas listesi anon DB client select işliyordu; villa tablosu
       RLS anon-readable (mig 037) → davranış değişmedi; ama
       client-side fetch'e geçti (UX flicker hafif, parity korunur).
   =============================================================== */

type ManualReservationRow = {
  id: string;
  villa_id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
};

type VillaOption = { id: string; title: string };

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";

  const [reservation, setReservation] = useState<ManualReservationRow | null>(
    null
  );
  const [villas, setVillas] = useState<VillaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        /* Paralel fetch — manual row + villa list. Eski RSC ile
           aynı sıra/semantik (Promise.all). */
        const [resvRes, villasRes] = await Promise.all([
          adminFetch(
            `/api/admin/manual-reservations/${encodeURIComponent(id)}`
          ),
          adminFetch("/api/admin/villas"),
        ]);

        if (cancelled) return;

        /* Row fetch — 404 → notFound() (eski davranış). */
        if (resvRes.status === 404) {
          setMissing(true);
          return;
        }
        const resvJson = (await resvRes.json().catch(() => ({}))) as {
          ok?: boolean;
          manual_reservation?: ManualReservationRow;
          error?: string;
        };
        if (!resvRes.ok || !resvJson.ok || !resvJson.manual_reservation) {
          setMissing(true);
          return;
        }
        setReservation(resvJson.manual_reservation);

        /* Villas fetch — fail-soft. Eski page'de hata → console.error
           + [] fallback. */
        const villasJson = (await villasRes.json().catch(() => ({}))) as {
          ok?: boolean;
          villas?: VillaOption[];
        };
        if (villasRes.ok && villasJson.ok) {
          setVillas(villasJson.villas || []);
        } else {
          setVillas([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[manual-reservations.edit] EXCEPTION", err);
        setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!loading && missing) {
    /* Eski RSC `notFound()` davranışı aynen — Next.js not-found UI. */
    notFound();
  }

  if (loading || !reservation) {
    return (
      <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <Link
          href="/maki-admin/manual-reservations"
          className="inline-flex items-center gap-1 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] transition mb-3"
        >
          <ChevronLeft size={14} />
          Bloklar
        </Link>
        <p className="eyebrow">Rezervasyon</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Blok düzenle
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Tarih aralığı, mülk veya notu güncelleyebilirsin. Diğer
          rezervasyonlarla çakışma kontrolü otomatik uygulanır.
        </p>
      </div>

      <ManualReservationForm
        villas={villas}
        mode="edit"
        initialData={{
          id: reservation.id,
          villa_id: reservation.villa_id,
          start_date: reservation.start_date,
          end_date: reservation.end_date,
          note: reservation.note ?? null,
        }}
      />
    </div>
  );
}
