"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Search,
} from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { formatDateTimeTr } from "@/lib/date-format";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import {
  LICENSE_REASON_LABEL,
  LICENSE_REVIEW_REASON_LABEL,
  LICENSE_STATUS_LABEL,
  isReliableStatus,
  licenseTransitionMessage,
} from "@/lib/ktb/license-state";
import type {
  LicenseBucket,
  LicenseOverview,
  LicenseOverviewRow,
  LicenseRun,
} from "@/app/services/villa-license-check.service";

/* ===============================================================
   🛡️ BELGE KONTROLÜ PANELİ (client)
   ===============================================================
   • Özet kartları (tıklanınca filtre), filtre + arama, liste.
   • "Tümünü Tara": POST → run; panel açıkken tick döngüsü
     (POST …/runs/[id]/tick) ilerletir. Sayfa kapanırsa run bekler;
     tekrar açılınca "Taramaya Devam Et".
   • Masaüstü tablo (md+), mobilde kart (villa listesi mobil düzeni).
   • "Pasife Al" / otomatik pasife alma YOK.
=============================================================== */

type Filter = "all" | LicenseBucket | "needs_review";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "valid", label: "Geçerli" },
  { key: "invalid", label: "İptal / Geçersiz" },
  { key: "not_found", label: "Bulunamadı" },
  { key: "check_failed", label: "Kontrol Edilemedi" },
  { key: "no_document", label: "Belge No Yok" },
  { key: "needs_review", label: "İnceleme Gerekli" },
];

const BUCKET_UI: Record<LicenseBucket, { label: string; dot: string; badge: string }> = {
  valid: { label: "Geçerli", dot: "🟢", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  invalid: { label: "İptal / Geçersiz", dot: "🔴", badge: "bg-red-50 text-red-700 border-red-200" },
  not_found: { label: "Bulunamadı", dot: "⚪", badge: "bg-stone-50 text-stone-700 border-stone-300" },
  check_failed: { label: "Kontrol Edilemedi", dot: "🟠", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  no_document: { label: "Belge No Yok", dot: "⚫", badge: "bg-slate-100 text-slate-700 border-slate-300" },
  unchecked: { label: "Kontrol edilmedi", dot: "◌", badge: "bg-white text-slate-500 border-slate-200" },
};

const SUMMARY_ORDER: LicenseBucket[] = ["valid", "invalid", "not_found", "check_failed", "no_document"];
const PAGE_STEP = 50;

function isActiveRun(run: LicenseRun | null | undefined): run is LicenseRun {
  return !!run && (run.status === "queued" || run.status === "running");
}

const ABORT_LABEL: Record<string, string> = {
  ...LICENSE_REASON_LABEL,
  setup_failed: "Tarama oluşturulamadı",
  blocked: "KTB erişimi engellendi",
};

export default function LicenseCheckPanel({ initialOverview }: { initialOverview: LicenseOverview }) {
  const toast = useNotify();
  const [overview, setOverview] = useState<LicenseOverview>(initialOverview);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_STEP);
  const [ticking, setTicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const [loopError, setLoopError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/villa-license-checks");
      const json = (await res.json().catch(() => null)) as { ok?: boolean; overview?: LicenseOverview; error?: string } | null;
      if (res.ok && json?.ok && json.overview && mounted.current) setOverview(json.overview);
    } catch {
      /* sessiz — mevcut görünüm kalır */
    }
  }, []);

  /* ---- tick döngüsü: panel açıkken aktif taramayı ilerletir ---- */
  const activeRunId = isActiveRun(overview.activeRun) ? overview.activeRun.id : null;
  useEffect(() => {
    if (!ticking || !activeRunId) return;
    let cancelled = false;
    (async () => {
      while (!cancelled && mounted.current) {
        let json: { ok?: boolean; run?: LicenseRun; busy?: boolean; error?: string } | null = null;
        try {
          const res = await adminFetch(
            `/api/admin/villa-license-checks/runs/${encodeURIComponent(activeRunId)}/tick`,
            { method: "POST" }
          );
          json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok || !json.run) throw new Error(json?.error || `HTTP ${res.status}`);
        } catch (err) {
          if (!cancelled) {
            setLoopError(err instanceof Error ? err.message : "Tarama adımı başarısız");
            setTicking(false);
          }
          return;
        }
        if (cancelled) return;
        const run: LicenseRun = json.run!;
        const stillActive = run.status === "queued" || run.status === "running";
        setOverview((o) => ({ ...o, activeRun: stillActive ? run : null }));
        if (!stillActive) {
          setTicking(false);
          await refresh();
          if (run.status === "aborted") {
            toast.error("Tarama durduruldu", {
              id: "license-scan",
              description: ABORT_LABEL[run.abort_reason || ""] || run.abort_reason || undefined,
            });
          } else if (run.status === "completed") {
            toast.success("Tarama tamamlandı", { id: "license-scan" });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, json.busy ? 4000 : 300));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticking, activeRunId, refresh, toast]);

  const startScan = async () => {
    if (starting) return;
    setStarting(true);
    setLoopError(null);
    try {
      const res = await adminFetch("/api/admin/villa-license-checks", { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; run?: LicenseRun; alreadyRunning?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok || !json.run) {
        toast.error("Tarama başlatılamadı", { id: "license-scan", description: json?.error });
        return;
      }
      if (json.alreadyRunning) {
        toast.info("Devam eden bir tarama var", { id: "license-scan", description: "Mevcut tarama sürdürülüyor." });
      }
      setOverview((o) => ({ ...o, activeRun: isActiveRun(json.run) ? json.run! : null }));
      if (isActiveRun(json.run)) setTicking(true);
      else await refresh();
    } finally {
      setStarting(false);
    }
  };

  const recheck = async (row: LicenseOverviewRow) => {
    if (recheckingId) return;
    setRecheckingId(row.villaId);
    try {
      const res = await adminFetch(
        `/api/admin/villa-license-checks/villas/${encodeURIComponent(row.villaId)}`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: string; reason?: string | null; error?: string } | null;
      if (!res.ok || !json?.ok) {
        toast.error("Kontrol yapılamadı", { id: `license-${row.villaId}`, description: json?.error });
        return;
      }
      const label = LICENSE_STATUS_LABEL[(json.result || "CHECK_FAILED") as keyof typeof LICENSE_STATUS_LABEL];
      toast.success(`${row.title}: ${label}`, {
        id: `license-${row.villaId}`,
        description: json.reason ? LICENSE_REASON_LABEL[json.reason] || json.reason : undefined,
      });
      await refresh();
    } finally {
      setRecheckingId(null);
    }
  };

  /* ---- filtre + arama ---- */
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return overview.rows.filter((r) => {
      if (filter === "needs_review" ? !r.needsReview : filter !== "all" && r.bucket !== filter) return false;
      if (!q) return true;
      return (
        r.title.toLocaleLowerCase("tr-TR").includes(q) ||
        (r.documentNumber || "").toLocaleLowerCase("tr-TR").includes(q)
      );
    });
  }, [overview.rows, filter, query]);

  /* Filtre/arama değişince liste başa döner (effect yerine olay anında). */
  const changeFilter = (f: Filter) => {
    setFilter(f);
    setVisible(PAGE_STEP);
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    setVisible(PAGE_STEP);
  };

  const run = overview.activeRun;
  const active = isActiveRun(run);
  const pct = active && run.total_documents > 0 ? Math.min(100, Math.round((run.processed_documents / run.total_documents) * 100)) : 0;
  const lastScanAt = overview.lastRun?.finished_at || overview.lastRun?.created_at || null;
  const canQuery = overview.parserVerified;

  return (
    <div className="space-y-6">
      {/* ════════ PARSER UYARISI ════════ */}
      {!canQuery && (
        <div className="admin-card p-4 flex items-start gap-3 !bg-amber-50 !border-amber-200">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 text-[13px] text-amber-900">
            <p className="font-semibold">KTB sorgusu henüz etkin değil</p>
            <p className="mt-0.5">
              KTB sayfası ayrıştırıcısı gerçek KTB HTML örnekleriyle doğrulanana kadar
              KTB&apos;ye sorgu gönderilmez. Bu sürede hiçbir mülk geçersiz veya belgesiz
              olarak işaretlenmez.
            </p>
          </div>
        </div>
      )}

      {/* ════════ TARAMA KONTROLÜ ════════ */}
      <div className="admin-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="font-display text-[16px] text-[var(--admin-text)]">
              {active ? "Tarama devam ediyor" : "Toplu tarama"}
            </p>
            <p className="text-[12px] text-[var(--admin-muted-2)] mt-0.5">
              Son tarama: {lastScanAt ? formatDateTimeTr(lastScanAt) : "—"}
              {overview.lastRun?.status === "aborted" && overview.lastRun.abort_reason && (
                <> · durduruldu ({ABORT_LABEL[overview.lastRun.abort_reason] || overview.lastRun.abort_reason})</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active ? (
              <button
                type="button"
                onClick={() => {
                  setLoopError(null);
                  setTicking(true);
                }}
                disabled={ticking || !canQuery}
                className="admin-btn-primary disabled:opacity-50"
              >
                {ticking ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {ticking ? "Taranıyor…" : "Taramaya Devam Et"}
              </button>
            ) : (
              <button
                type="button"
                onClick={startScan}
                disabled={starting || !canQuery}
                className="admin-btn-primary disabled:opacity-50"
                title={!canQuery ? "KTB ayrıştırıcısı doğrulanmadı" : undefined}
              >
                {starting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Tümünü Tara
              </button>
            )}
          </div>
        </div>

        {active && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-[var(--admin-muted)]">
              <span className="tabular-nums">
                {run.processed_documents} / {run.total_documents}
              </span>
              <span className="tabular-nums">%{pct}</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--admin-bg-soft)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-[var(--admin-text)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            {!ticking && (
              <p className="text-[11.5px] text-[var(--admin-muted-2)]">
                Tarama bu sayfa açıkken ilerler. Kaldığı yerden devam etmek için “Taramaya Devam Et”e basın.
              </p>
            )}
          </div>
        )}
        {loopError && <p className="text-[12px] text-red-600">{loopError}</p>}
      </div>

      {/* ════════ ÖZET ════════ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY_ORDER.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => changeFilter(b)}
            className={`admin-card p-3 text-left min-w-0 ${filter === b ? "!border-[var(--admin-text)]" : ""}`}
          >
            <p className="text-[12px] text-[var(--admin-muted)] truncate">
              <span aria-hidden="true">{BUCKET_UI[b].dot}</span> {BUCKET_UI[b].label}
            </p>
            <p className="font-display text-[22px] text-[var(--admin-text)] tabular-nums">{overview.summary[b]}</p>
          </button>
        ))}
        <button
          type="button"
          onClick={() => changeFilter("needs_review")}
          className={`admin-card p-3 text-left min-w-0 !bg-amber-50/60 ${filter === "needs_review" ? "!border-amber-500" : ""}`}
        >
          <p className="text-[12px] text-amber-800 truncate">⚠ İnceleme Gerekli</p>
          <p className="font-display text-[22px] text-amber-900 tabular-nums">{overview.summary.needs_review}</p>
        </button>
      </div>
      {overview.summary.unchecked > 0 && (
        <p className="text-[12px] text-[var(--admin-muted-2)] -mt-3">
          Henüz kontrol edilmemiş: {overview.summary.unchecked}
        </p>
      )}

      {/* ════════ FİLTRE + ARAMA ════════ */}
      <div className="admin-filter-bar flex flex-wrap items-center gap-2">
        <div className="admin-pill-search flex-1 min-w-[200px]">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk adı veya belge no ara…"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => changeFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                filter === f.key
                  ? "bg-[var(--admin-text)] text-white border-[var(--admin-text)]"
                  : "bg-white text-[var(--admin-muted)] border-[var(--admin-border)] hover:text-[var(--admin-text)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[12px] text-[var(--admin-muted-2)]">{filtered.length} mülk</p>

      {/* ════════ MASAÜSTÜ TABLO ════════ */}
      <div className="hidden md:block admin-card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-wide text-[var(--admin-muted-2)] border-b border-[var(--admin-border)]">
              <th className="px-4 py-3 font-medium">Villa</th>
              <th className="px-4 py-3 font-medium">Belge No</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">Son Kontrol</th>
              <th className="px-4 py-3 font-medium">Önceki Durum</th>
              <th className="px-4 py-3 font-medium">Durum Değişikliği</th>
              <th className="px-4 py-3 font-medium text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((r) => (
              <tr key={r.villaId} className="border-b border-[var(--admin-border)] last:border-0 align-top">
                <td className="px-4 py-3 max-w-[220px]">
                  <p className="font-medium text-[var(--admin-text)] truncate">{r.title}</p>
                  {r.needsReview && <ReviewNote row={r} />}
                </td>
                <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">{r.documentNumber || "—"}</td>
                <td className="px-4 py-3"><StatusCell row={r} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--admin-muted)]">{r.lastCheckedAt ? formatDateTimeTr(r.lastCheckedAt) : "—"}</td>
                <td className="px-4 py-3 text-[var(--admin-muted)]">{r.previousStatus ? LICENSE_STATUS_LABEL[r.previousStatus] : "—"}</td>
                <td className="px-4 py-3 text-[var(--admin-muted)] max-w-[240px]"><ChangeCell row={r} /></td>
                <td className="px-4 py-3">
                  <RowActions row={r} canQuery={canQuery} busy={recheckingId === r.villaId} disabled={!!recheckingId} onRecheck={recheck} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-6 text-center text-[13px] text-[var(--admin-muted)]">Kayıt yok.</p>}
      </div>

      {/* ════════ MOBİL KART ════════ */}
      <div className="md:hidden space-y-3">
        {filtered.slice(0, visible).map((r) => (
          <article key={r.villaId} className="admin-card p-3 flex flex-col gap-2 min-w-0">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <p className="font-medium text-[var(--admin-text)] truncate min-w-0">{r.title}</p>
              <StatusCell row={r} />
            </div>
            <p className="text-[12px] text-[var(--admin-muted-2)]">
              <span className="font-mono">{r.documentNumber || "Belge no yok"}</span>
              <span className="mx-1.5">·</span>
              {r.lastCheckedAt ? formatDateTimeTr(r.lastCheckedAt) : "Kontrol edilmedi"}
            </p>
            {r.previousStatus && (
              <p className="text-[12px] text-[var(--admin-muted)]">Önceki: {LICENSE_STATUS_LABEL[r.previousStatus]}</p>
            )}
            <ChangeCell row={r} />
            {r.needsReview && <ReviewNote row={r} />}
            <RowActions row={r} canQuery={canQuery} busy={recheckingId === r.villaId} disabled={!!recheckingId} onRecheck={recheck} mobile />
          </article>
        ))}
        {filtered.length === 0 && <p className="p-6 text-center text-[13px] text-[var(--admin-muted)]">Kayıt yok.</p>}
      </div>

      {filtered.length > visible && (
        <div className="flex justify-center">
          <button type="button" className="admin-btn-ghost" onClick={() => setVisible((v) => v + PAGE_STEP)}>
            Daha fazla göster ({filtered.length - visible})
          </button>
        </div>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: LicenseOverviewRow }) {
  const ui = BUCKET_UI[row.bucket];
  const lastKnown = row.bucket === "check_failed" && isReliableStatus(row.currentStatus) ? LICENSE_STATUS_LABEL[row.currentStatus] : null;
  return (
    <div className="flex flex-col items-start gap-1 shrink-0">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${ui.badge}`}>
        <span aria-hidden="true">{ui.dot}</span>
        {ui.label}
      </span>
      {row.bucket === "check_failed" && row.lastReason && (
        <span className="text-[11px] text-[var(--admin-muted-2)]">{LICENSE_REASON_LABEL[row.lastReason] || row.lastReason}</span>
      )}
      {lastKnown && <span className="text-[11px] text-[var(--admin-muted-2)]">Son bilinen: {lastKnown}</span>}
    </div>
  );
}

function ChangeCell({ row }: { row: LicenseOverviewRow }) {
  const msg = licenseTransitionMessage(row.previousStatus, row.currentStatus);
  if (!msg) return <span className="text-[12px] text-[var(--admin-muted-2)] md:text-[13px]">—</span>;
  return (
    <span className="text-[12px] md:text-[12.5px] text-[var(--admin-text)]">
      {msg}
      {row.statusChangedAt && (
        <span className="block text-[11px] text-[var(--admin-muted-2)]">{formatDateTimeTr(row.statusChangedAt)}</span>
      )}
    </span>
  );
}

function ReviewNote({ row }: { row: LicenseOverviewRow }) {
  return (
    <p className="mt-1 inline-flex items-start gap-1 text-[11.5px] text-amber-800">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
      <span>{LICENSE_REVIEW_REASON_LABEL[row.reviewReason || ""] || "İnceleme gerekli"}</span>
    </p>
  );
}

function RowActions({
  row,
  canQuery,
  busy,
  disabled,
  onRecheck,
  mobile,
}: {
  row: LicenseOverviewRow;
  canQuery: boolean;
  busy: boolean;
  disabled: boolean;
  onRecheck: (row: LicenseOverviewRow) => void;
  mobile?: boolean;
}) {
  /* Masaüstü tabloda kompakt buton (satır yüksekliği şişmesin). */
  const btn = mobile ? "admin-btn-ghost" : "admin-btn-ghost !px-2.5 !py-1.5 !text-[12px] !gap-1.5 whitespace-nowrap";
  return (
    <div className={mobile ? "grid grid-cols-2 gap-1.5" : "flex flex-wrap justify-end gap-1.5"}>
      <button
        type="button"
        onClick={() => onRecheck(row)}
        disabled={!canQuery || !row.documentNumber || disabled}
        className={`${btn} disabled:opacity-50 ${mobile ? "col-span-2" : ""}`}
        title={!canQuery ? "KTB ayrıştırıcısı doğrulanmadı" : undefined}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Tekrar Kontrol Et
      </button>
      <Link href={`/maki-admin/villas/${row.villaId}`} className={btn}>
        <Pencil size={13} />
        Villa Düzenle
      </Link>
      {row.ktbUrl ? (
        <a href={row.ktbUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <ExternalLink size={13} />
          KTB&apos;de Aç
        </a>
      ) : (
        <span className={`${btn} opacity-40 cursor-not-allowed`} aria-disabled="true">
          <ExternalLink size={13} />
          KTB&apos;de Aç
        </span>
      )}
    </div>
  );
}
