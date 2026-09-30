"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Info } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import ManualReservationList from "./ManualReservationList";

/* ===============================================================
   🛡️ Manual reservations LIST PAGE — admin
   ===============================================================
   RSC + anon `db` patterni manual_reservations PHASE 3 (migration
   040) admin-only RLS sonrası boş liste döndürüyordu:

     RSC → getManualReservations() (service) → repository.findList()
       → db.from("manual_reservations").select(...)   // anon, no JWT
       → RLS DENY → [] silent fail

   Fix: /api/admin/reservations modeli ile bire bir aynı pattern'e
   geçildi → adminFetch (Bearer) → /api/admin/manual-reservations
   server route → service-role repository. Davranış BYTE-IDENTICAL:
     - SELECT shape `id, start_date, end_date, note, created_at,
       villa:villa_id(title)` aynen (route ↔ repo ↔ eski anon repo).
     - Order `created_at` DESC aynen.
     - Empty/loading state preserved (loading "Yükleniyor…" →
       ManualReservationList kendi empty card'ını gösterir).
     - ManualReservationList signature `{ initialData }` aynen;
       delete handler + UI davranışı dokunulmadı.
     - Service orchestration (createManualReservation,
       updateManualReservation, deleteManualReservation,
       getVillaAvailabilitySnapshot) dokunulmadı — client-side
       admin form'ları browser session JWT ile çalışmaya devam
       eder (is_active_admin() true → RLS allow).
   =============================================================== */

type ManualReservationRow = {
  id: string;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
  villa: { title: string | null } | null;
};

export default function Page() {
  const [data, setData] = useState<ManualReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  /* Cleanup metadata (route'tan). null/ran:false/0 → statik info box. */
  const [cleanupDeleted, setCleanupDeleted] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminFetch("/api/admin/manual-reservations");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          manual_reservations?: ManualReservationRow[];
          cleanup?: { ran?: boolean; deletedCount?: number };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          console.error(
            "[manual-reservations.list] FAILED",
            json.error || `HTTP ${res.status}`
          );
          setData([]);
          return;
        }
        setData(json.manual_reservations || []);
        setCleanupDeleted(
          json.cleanup?.ran ? json.cleanup.deletedCount || 0 : 0
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[manual-reservations.list] EXCEPTION", err);
        setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Rezervasyon</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Bloklanan tarihler
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Manuel olarak takvime eklenen rezervasyon ve bakım blokları.
          </p>
        </div>

        <Link
          href="/maki-admin/manual-reservations/ekle"
          className="btn-primary self-start"
        >
          <Plus size={15} />
          Yeni Blok
        </Link>
      </div>

      {/* 🧹 Migration 059 — otomatik cleanup bilgilendirmesi (intrusive değil).
         Cleanup çalışıp >0 kayıt sildiyse dinamik özet; aksi halde
         (skip / 0 silme) statik açıklama. Tasarım aynı. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)]/50 px-4 py-3">
        <Info
          size={15}
          className="mt-0.5 shrink-0 text-[var(--color-stone-400)]"
        />
        <p className="text-[12.5px] leading-relaxed text-[var(--color-stone-500)]">
          {cleanupDeleted > 0
            ? `🧹 Son otomatik temizlikte ${cleanupDeleted} eski blok temizlendi.`
            : "Geçmiş manuel bloklar, çıkış tarihinden 7 gün sonra otomatik temizlenir. Temizlik bu sayfa açıldığında arka planda kontrol edilir."}
        </p>
      </div>

      {loading ? (
        <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : (
        <ManualReservationList initialData={data} />
      )}
    </div>
  );
}
