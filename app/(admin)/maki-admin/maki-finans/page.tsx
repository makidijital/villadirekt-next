"use client";

/* ===============================================================
   🛡️ MAKI FINANS — admin foundation page
   ===============================================================
   "Maki Finans" modülünün boş foundation sayfası. Şimdilik 4 KPI
   kartı render eder; ileride komisyon raporları, tahsilat detayı,
   owner payout, gelir analizi vb. buraya eklenecek.

   KESIN SINIRLAR:
     - Read-only. Hiçbir reservation/booking/payment/availability
       mutate edilmiyor.
     - DB query: `finance.service > getFinanceKpiSnapshot` (single
       SELECT, status IN ('pending','confirmed') filter).
     - Loading/error state: temiz UX; sayfa çökmez.

   UI:
     - Premium admin theme (sand/stone palette, card-style)
     - 4 stat card (responsive grid: 1 / 2 / 4 col)
     - TR locale currency format: ₺1.250.000
     - Count'lar tabular-nums + TR thousand separator
   =============================================================== */

import { useEffect, useState } from "react";
import {
  TrendingUp,
  Wallet,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { getFinanceKpiSnapshotAction as getFinanceKpiSnapshot } from "./finance.action";
import {
  FINANCE_RANGE_PRESETS,
  DEFAULT_FINANCE_RANGE,
  type FinanceRangePreset,
} from "@/app/services/finance.constants";
import type { FinanceKpiSnapshot } from "@/app/services/finance.service";

/* TR locale TRY formatter — 0 ondalık (foundation seviyesinde
   kuruşa girmiyoruz; ileride options'a parametre eklenebilir). */
const tryFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

function formatTRY(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return tryFormatter.format(n);
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("tr-TR");
}

export default function MakiFinansPage() {
  const [preset, setPreset] = useState<FinanceRangePreset>(
    DEFAULT_FINANCE_RANGE
  );
  const [data, setData] = useState<FinanceKpiSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /* Preset değişince re-fetch — tek getFinanceKpiSnapshot çağrısı,
       service tarafında koşullu `.gte("created_at", ...)` uygular.
       Cancellation flag stale setState'i önler (hızlı preset
       değişiminde önceki fetch sonucunu bastırma).

       React 19 `set-state-in-effect` rule iki reset setState'i flag
       eder; burada KASITLI — preset değişiminde önceki snapshot'ı
       temizleyip loading skeleton'a düşürmek için gerekli. */
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setData(null);
    getFinanceKpiSnapshot(preset)
      .then((snapshot) => {
        if (!cancelled) setData(snapshot);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Beklenmedik hata";
        setError(msg);
      });
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const isLoading = data === null && error === null;

  return (
    <div className="space-y-6">
      {/* HEADER + PRESET RANGE FILTER */}
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.02em]">
            Maki Finans
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] max-w-xl">
            Finans, komisyon ve gelir yönetimi modülü.
          </p>
        </div>

        {/* SEGMENTED PILL TABS — 4 hazır preset; custom picker YOK.
            Aktif preset koyu fill; diğerleri hover-state. */}
        <div
          role="tablist"
          aria-label="Tarih aralığı"
          className="
            inline-flex flex-wrap items-center gap-1
            rounded-full
            bg-[var(--color-sand-50)]
            border border-[var(--color-stone-100)]
            p-1
          "
        >
          {FINANCE_RANGE_PRESETS.map((p) => {
            const active = p.key === preset;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPreset(p.key)}
                className={
                  "px-3.5 py-1.5 rounded-full text-[12.5px] font-medium tracking-wide " +
                  "transition-colors motion-reduce:transition-none " +
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
                  (active
                    ? "bg-[var(--color-stone-900)] text-white shadow-[0_4px_12px_-6px_rgb(27_26_23/0.35)]"
                    : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-white")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ERROR BANNER */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <strong className="font-medium">Veri alınamadı:</strong> {error}
        </div>
      )}

      {/* KPI GRID — 4 card (1 / 2 / 4 col responsive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Toplam Satış"
          value={data ? formatTRY(data.totalSalesTry) : "—"}
          icon={TrendingUp}
          loading={isLoading}
          accent="stone"
        />
        <StatCard
          title="Toplam Komisyon"
          value={data ? formatTRY(data.totalCommission) : "—"}
          icon={Wallet}
          loading={isLoading}
          accent="champagne"
        />
        <StatCard
          title="Onaylı Rezervasyon"
          value={data ? formatCount(data.confirmedCount) : "—"}
          icon={CheckCircle2}
          loading={isLoading}
          accent="emerald"
        />
        <StatCard
          title="Bekleyen Rezervasyon"
          value={data ? formatCount(data.pendingCount) : "—"}
          icon={Clock}
          loading={isLoading}
          accent="amber"
        />
      </div>

      {/* FOUNDATION NOTE — future modules (komisyon raporları,
          tahsilat, owner payout vb.) buraya gelecek. */}
      <p className="text-[11px] text-[var(--color-stone-400)] tracking-wide">
        Yalnız <code className="px-1 py-0.5 rounded bg-[var(--color-sand-50)] text-[var(--color-stone-600)]">pending</code> ve{" "}
        <code className="px-1 py-0.5 rounded bg-[var(--color-sand-50)] text-[var(--color-stone-600)]">confirmed</code>{" "}
        rezervasyonlar dahildir. İptal/red dışı tutulur.
      </p>
    </div>
  );
}

/* ===============================================================
   StatCard — premium admin theme card
   =============================================================== */
type Accent = "stone" | "champagne" | "emerald" | "amber";

const ACCENT_TONE: Record<
  Accent,
  { iconBg: string; iconColor: string }
> = {
  stone: {
    iconBg: "bg-[var(--color-sand-50)]",
    iconColor: "text-[var(--color-stone-700)]",
  },
  champagne: {
    iconBg: "bg-[var(--color-sand-100)]",
    iconColor: "text-[var(--color-champagne-600)]",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
};

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  accent,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  loading: boolean;
  accent: Accent;
}) {
  const tone = ACCENT_TONE[accent];
  return (
    <div
      className="
        rounded-2xl bg-white
        border border-[var(--color-stone-100)]
        shadow-[0_8px_24px_-16px_rgb(27_26_23/0.08)]
        p-5
        space-y-4
      "
    >
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
          {title}
        </p>
        <span
          aria-hidden
          className={
            "w-9 h-9 rounded-xl flex items-center justify-center " +
            tone.iconBg +
            " " +
            tone.iconColor
          }
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
      </div>
      <p
        className="
          font-display text-2xl md:text-3xl
          text-[var(--color-stone-900)]
          tracking-[-0.02em]
          tabular-nums
        "
      >
        {loading ? (
          <span
            aria-label="Yükleniyor"
            className="inline-block h-7 w-32 rounded-md bg-[var(--color-stone-100)] animate-pulse"
          />
        ) : (
          value
        )}
      </p>
    </div>
  );
}
