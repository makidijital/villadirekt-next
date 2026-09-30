"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, TrendingUp, Loader2 } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { formatDateTimeTr } from "@/lib/date-format";

/* FAZ 53A — types/database.ts ExchangeRateRow shape'i stale (base/
   quote/fetched_at); gerçek DB code/rate/updated_at. Card artık
   anon-client service yerine /api/admin/exchange-rates/current
   üzerinden service-role GET'e gidiyor → RLS bypass + auth gate.
   ExchangeRatesMap tipi burada local olarak yeniden tanımlı çünkü
   wire format API response ile birebir. */
type AllowedCode = "USD" | "EUR" | "GBP";
type ExchangeRatesMap = {
  rates: Partial<Record<AllowedCode, number>>;
  updatedAt: string | null;
};

/* ===============================================================
   🛡️ FAZ 53 — DÖVİZ KURLARI KARTI (admin settings)
   ===============================================================
   /maki-admin/settings/entegrasyonlar içine mount edilir.
   Mevcut SettingsSection / card-premium dili ile aynı estetik;
   subtle coral accent (badge + butonun glow'u).

   DAVRANIŞ:
     - Mount'ta DB'den mevcut USD/EUR/GBP rate'lerini + en yeni
       updated_at'i çeker.
     - "Kurları Güncelle" tıklayınca POST /api/admin/exchange-rates/
       refresh (Bearer token via adminFetch).
     - Success: yeni rate map ile state update; success toast.
     - Error: error toast + state korunur.

   NOT — REZERVASYON / PRICING ETKİSİ:
     Bu component pricing/reservation hesabını çalıştırmaz. Yalnız
     `exchange_rates` tablosunu update eder. Mevcut convertPrice /
     calculateGrandTotal davranışı byte-identical kalır; bir sonraki
     sayfa yüklemesinde public CurrencyContext yeni rate'leri çeker.
=============================================================== */

const CURRENCY_META: Array<{
  code: "USD" | "EUR" | "GBP";
  label: string;
  symbol: string;
}> = [
  { code: "USD", label: "Amerikan Doları", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "İngiliz Sterlini", symbol: "£" },
];

function formatRate(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export default function ExchangeRatesCard() {
  const toast = useNotify();

  const [state, setState] = useState<ExchangeRatesMap>({
    rates: {},
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* FAZ 53A — Service-role GET ile fetch.
     Wire format: { ok, rates: { USD, EUR, GBP }, updated_at } */
  const load = useCallback(async (): Promise<ExchangeRatesMap> => {
    const res = await adminFetch("/api/admin/exchange-rates/current", {
      method: "GET",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      rates?: Partial<Record<AllowedCode, number | string>>;
      updated_at?: string | null;
      error?: string;
    };
    if (!json.ok) {
      throw new Error(json.error || "Bilinmeyen hata");
    }
    const rates: Partial<Record<AllowedCode, number>> = {};
    for (const code of ["USD", "EUR", "GBP"] as AllowedCode[]) {
      const v = Number(json.rates?.[code]);
      if (Number.isFinite(v) && v > 0) rates[code] = v;
    }
    return { rates, updatedAt: json.updated_at ?? null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await load();
        if (!cancelled) setState(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        console.error("[ExchangeRatesCard] load FAILED", msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await adminFetch("/api/admin/exchange-rates/refresh", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rates?: Record<string, number>;
        updated_at?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Kurlar güncellenemedi", {
          id: "exchange-rate-refresh",
          description: json.error || `HTTP ${res.status}`,
        });
        return;
      }
      /* Optimistic local update + authoritative refetch */
      const fresh: ExchangeRatesMap = {
        rates: {
          USD: Number(json.rates?.USD) || undefined,
          EUR: Number(json.rates?.EUR) || undefined,
          GBP: Number(json.rates?.GBP) || undefined,
        },
        updatedAt: json.updated_at || new Date().toISOString(),
      };
      setState(fresh);
      toast.success("Kurlar güncellendi", { id: "exchange-rate-refresh" });
      /* Authoritative re-fetch — DB ile state'i hizala. */
      load()
        .then((data) => setState(data))
        .catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Kurlar güncellenemedi", {
        id: "exchange-rate-refresh",
        description: msg,
      });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))] text-[var(--brand-coral,#FF653F)]"
            >
              <TrendingUp size={14} strokeWidth={1.75} />
            </span>
            <h2 className="font-display text-xl md:text-2xl text-[var(--color-stone-900)] tracking-[-0.015em]">
              Döviz Kurları
            </h2>
          </div>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 leading-relaxed max-w-xl">
            Fiyat dönüşümlerinde kullanılan canlı kur verileri. TCMB günlük
            kur feed'inden çekilir; rezervasyon hesaplarına anında yansır.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="
            inline-flex items-center gap-1.5
            rounded-full border
            border-[var(--brand-coral,#FF653F)]/40
            bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))]
            text-[var(--brand-coral-ink,#7a2912)]
            px-3.5 py-1.5 text-[12.5px] font-medium
            hover:bg-[var(--brand-coral-tint,rgba(255,101,63,0.18))]
            hover:border-[var(--brand-coral,#FF653F)]/60
            transition-[background-color,border-color]
            disabled:opacity-60 disabled:cursor-not-allowed
            shrink-0
          "
          aria-label="Kurları güncelle"
        >
          {refreshing ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCcw size={13} strokeWidth={1.75} aria-hidden />
          )}
          {refreshing ? "Güncelleniyor…" : "Kurları Güncelle"}
        </button>
      </header>

      {/* RATES GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CURRENCY_META.map((m) => {
          const value = state.rates[m.code];
          return (
            <div
              key={m.code}
              className="
                rounded-2xl border border-[var(--color-stone-100)] bg-white
                px-4 py-3.5
                flex items-center justify-between
              "
            >
              <div className="min-w-0">
                <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                  {m.code} → TRY
                </p>
                <p className="text-[12.5px] text-[var(--color-stone-500)] mt-0.5 truncate">
                  {m.label}
                </p>
              </div>
              <div className="text-right tabular-nums shrink-0">
                <p className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] leading-tight">
                  {loading ? "…" : formatRate(value)}
                </p>
                <p className="text-[10.5px] text-[var(--color-stone-400)] mt-0.5">
                  {m.symbol} 1 = {loading ? "…" : formatRate(value)} ₺
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER — last update */}
      <footer className="pt-3 border-t border-[var(--color-stone-100)] flex items-center justify-between flex-wrap gap-2">
        <p className="text-[12px] text-[var(--color-stone-500)]">
          Son güncelleme:{" "}
          <span className="text-[var(--color-stone-700)] font-medium tabular-nums">
            {loading ? "…" : formatDateTimeTr(state.updatedAt)}
          </span>
        </p>
        <p className="text-[11px] text-[var(--color-stone-400)]">
          Kaynak: TCMB · ForexSelling
        </p>
      </footer>
    </section>
  );
}
