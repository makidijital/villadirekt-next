"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — `import { eski sağlayıcı }` KALDIRILDI.
   Villa title fetch /api/admin/villas/[id] üzerinden (mevcut route,
   `title` field zaten dahil). */
import { adminFetch } from "@/lib/admin-fetch";
import PricingCalendarCanvas from "@/app/components/admin/villa/PricingCalendarCanvas";

/* ===============================================================
   🔥 PRICING CANVAS — Standalone admin pricing route
   ===============================================================
   Tüm pricing canvas mantığı reusable component'e taşındı:
     app/components/admin/villa/PricingCalendarCanvas.tsx
   Bu sayfa artık sadece thin wrapper:
     - Header (villa başlığı + back link)
     - <PricingCalendarCanvas villaId={id} />
   Aynı bileşen villa edit page Adım 4 (Fiyatlandırma) içinde de
   kullanılır. Backend (villa_prices) tek source-of-truth.
   =============================================================== */

export default function VillaPricingCanvasPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";

  const [villaTitle, setVillaTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    /* 🛡️ FAZ 2 — adminFetch GET /api/admin/villas/[id].
       Route'un response shape'i { ok, villa: { id, title, cleaning_*,
       custom_prepayment_rate, deposit } }; sadece title okunur (eski
       koşulla aynı), BYTE-IDENTICAL. .maybeSingle semantic'i route
       içinde `.single()` ile — id geçersizse 500 döner, eski .maybeSingle
       null döndürürdü; fail-soft için catch + null set ile aynı sonuç. */
    (async () => {
      try {
        const res = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(id)}`
        );
        if (cancelled) return;
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          villa?: { title?: string | null } | null;
        };
        if (!res.ok || !json.ok) {
          setVillaTitle(null);
          return;
        }
        setVillaTitle((json.villa?.title as string) || null);
      } catch {
        if (!cancelled) setVillaTitle(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <div className="card-premium p-10 text-center text-[var(--color-stone-500)]">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* TOP BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles size={11} />
            Pricing Canvas
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em] truncate">
            {villaTitle || "Fiyat Yönetimi"}
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Hücreleri sürükleyerek tarih aralığı seç. Fiyat panelinden
            anında düzenle. Backend{" "}
            <code className="text-[var(--color-stone-700)] bg-[var(--color-sand-50)] px-1 py-0.5 rounded text-[11px]">
              villa_prices
            </code>{" "}
            tablosu tek source-of-truth.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <Link
            href={`/maki-admin/villas/${id}`}
            className="btn-ghost"
          >
            <ArrowLeft size={15} />
            Mülk Düzenle
          </Link>
        </div>
      </div>

      {/* CANVAS */}
      <PricingCalendarCanvas villaId={id} />
    </div>
  );
}
