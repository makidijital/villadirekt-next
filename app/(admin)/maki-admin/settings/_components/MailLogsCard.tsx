"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Wrench,
} from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import {
  useConfirm,
  useNotify,
} from "@/app/components/admin/notifications/NotificationProvider";
import { formatDateTimeTr } from "@/lib/date-format";

/* ===============================================================
   🛡️ FAZ 54B — MAIL LOG MAINTENANCE BAR
   ===============================================================
   /maki-admin/system-logs (Mail Merkezi) sayfasında, KPI grid ile
   filter bar arasına compact bir maintenance kartı olarak mount
   edilir. FAZ 54'te /settings/entegrasyonlar altındaydı; o yer
   kaldırıldı, yalnız konum değişti.

   ENDPOINT'LER (SABİT — FAZ 54'TEN BERİ AYNI):
     • GET  /api/admin/mail-logs/stats    → total/failed/latest
     • POST /api/admin/mail-logs/cleanup  → mode "30d" | "all"

   UI DEĞİŞİKLİĞİ (FAZ 54 → 54B):
     • H2 başlık + uzun açıklama kaldırıldı (Mail Merkezi page
       header zaten anlatıyor; duplicate önlendi).
     • Layout horizontal compact bar: stats inline + actions
       inline → tek satır desktop, stack mobile.
     • Eyebrow "Bakım" + Wrench icon ile maintenance bağlamı
       net belirtildi.

   DAVRANIŞ (KORUNDU):
     • Mount'ta stats fetch (true DB count, service-role)
     • Cleanup sonrası authoritative re-fetch
     • useConfirm destructive gate (her iki action için)
     • Per-button loading state
     • Success/error toast
=============================================================== */

type StatsState = {
  total: number;
  failed: number;
  latestCreatedAt: string | null;
};

type StatsResponse = {
  ok?: boolean;
  total?: number;
  failed?: number;
  latest_created_at?: string | null;
  error?: string;
};

type CleanupResponse = {
  ok?: boolean;
  mode?: string;
  deleted?: number;
  error?: string;
};

const formatCount = (n: number): string =>
  new Intl.NumberFormat("tr-TR").format(n);

export default function MailLogsCard() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [stats, setStats] = useState<StatsState>({
    total: 0,
    failed: 0,
    latestCreatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<"30d" | "all" | null>(null);

  const fetchStats = useCallback(async (): Promise<StatsState | null> => {
    try {
      const res = await adminFetch("/api/admin/mail-logs/stats", {
        method: "GET",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }
      const json = (await res.json().catch(() => ({}))) as StatsResponse;
      if (!json.ok) throw new Error(json.error || "Bilinmeyen hata");
      return {
        total: Number(json.total) || 0,
        failed: Number(json.failed) || 0,
        latestCreatedAt: json.latest_created_at ?? null,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[MailLogsCard] stats FAILED", msg);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchStats();
      if (cancelled) return;
      if (data) setStats(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  async function handleCleanup(mode: "30d" | "all") {
    if (processing) return;

    const isAll = mode === "all";
    const ok = await confirm({
      title: isAll
        ? "Tüm mail logları silinsin mi?"
        : "30 günden eski loglar silinsin mi?",
      description: isAll
        ? "Mail gönderim geçmişi tamamen temizlenir. İşlem geri alınamaz; ileride hata izi takip etmek zorlaşır."
        : "30 günden eski tüm log satırları kalıcı olarak silinir. Yeni loglar etkilenmez.",
      confirmLabel: isAll ? "Tümünü Sil" : "30 Günden Eskileri Sil",
      variant: "danger",
    });
    if (!ok) return;

    setProcessing(mode);
    try {
      const res = await adminFetch("/api/admin/mail-logs/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json().catch(() => ({}))) as CleanupResponse;
      if (!res.ok || !json.ok) {
        toast.error("Loglar temizlenemedi", {
          id: "mail-logs-cleanup",
          description: json.error || `HTTP ${res.status}`,
        });
        return;
      }
      toast.success(
        `${formatCount(json.deleted ?? 0)} log silindi`,
        { id: "mail-logs-cleanup" }
      );
      const fresh = await fetchStats();
      if (fresh) setStats(fresh);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Loglar temizlenemedi", {
        id: "mail-logs-cleanup",
        description: msg,
      });
    } finally {
      setProcessing(null);
    }
  }

  const totalDisplay = loading ? "…" : formatCount(stats.total);
  const failedDisplay = loading ? "…" : formatCount(stats.failed);
  const latestDisplay = loading ? "…" : formatDateTimeTr(stats.latestCreatedAt);

  return (
    <section
      className="
        card-premium
        px-5 py-4 md:px-6 md:py-4
        flex flex-col gap-4
        lg:flex-row lg:items-center lg:justify-between
      "
      aria-label="Mail log bakım"
    >
      {/* LEFT — eyebrow + stats inline */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 min-w-0">
        <div className="inline-flex items-center gap-2 shrink-0">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))] text-[var(--brand-coral,#FF653F)]"
          >
            <Wrench size={13} strokeWidth={1.75} />
          </span>
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
            Bakım
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0">
          <InlineStat
            icon={<CheckCircle2 size={12} strokeWidth={1.75} />}
            label="Toplam"
            value={totalDisplay}
          />
          <InlineStat
            icon={<AlertCircle size={12} strokeWidth={1.75} />}
            label="Başarısız"
            value={failedDisplay}
            danger={!loading && stats.failed > 0}
          />
          <InlineStat
            icon={<Clock size={12} strokeWidth={1.75} />}
            label="Son log"
            value={latestDisplay}
            mono
          />
        </div>
      </div>

      {/* RIGHT — destructive actions */}
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        <ActionButton
          icon={<Trash2 size={13} strokeWidth={1.75} />}
          label="30 Günden Eskileri Sil"
          activeLabel="Siliniyor…"
          loading={processing === "30d"}
          disabled={!!processing || loading || stats.total === 0}
          onClick={() => handleCleanup("30d")}
          variant="soft"
        />
        <ActionButton
          icon={<Trash2 size={13} strokeWidth={1.75} />}
          label="Tüm Logları Temizle"
          activeLabel="Temizleniyor…"
          loading={processing === "all"}
          disabled={!!processing || loading || stats.total === 0}
          onClick={() => handleCleanup("all")}
          variant="danger"
        />
      </div>
    </section>
  );
}

/* ===============================================================
   PRIMITIVES
=============================================================== */

function InlineStat({
  icon,
  label,
  value,
  danger,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
  mono?: boolean;
}) {
  const valueColor = danger
    ? "text-red-700"
    : "text-[var(--color-stone-900)]";
  return (
    <div className="inline-flex items-baseline gap-1.5 min-w-0">
      <span
        aria-hidden
        className="text-[var(--color-stone-400)] self-center"
      >
        {icon}
      </span>
      <span className="text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)]">
        {label}
      </span>
      <span
        className={
          "text-[14px] font-medium leading-none " +
          (mono ? "tabular-nums " : "") +
          valueColor
        }
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  activeLabel,
  loading,
  disabled,
  onClick,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  activeLabel: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant: "soft" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-[background-color,border-color,color] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap";
  const variantClass =
    variant === "danger"
      ? " border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300"
      : " border-[var(--color-stone-200)] bg-white text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] hover:border-[var(--color-stone-300)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={base + variantClass}
      aria-label={label}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : (
        icon
      )}
      {loading ? activeLabel : label}
    </button>
  );
}
