"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  Filter,
  RefreshCw,
  Trash2,
  Loader2,
  User,
  Layers,
  Clock,
} from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import {
  useConfirm,
  useNotify,
} from "@/app/components/admin/notifications/NotificationProvider";
import { formatDateTimeTr } from "@/lib/date-format";
import AdminDateRangePicker from "@/app/components/admin/shared/AdminDateRangePicker";

/* ===============================================================
   🛡️ FAZ 55 — ACTIVITY LOG LIST (client island)
   ===============================================================
   /maki-admin/activity-logs sayfasının çalışma motoru.

   FEATURE'LAR:
     • Filtreler: admin email/id, action, entity_type, tarih
     • Action ve entity badge'leri (coral accent)
     • Expandable row: compact diff_summary + raw before/after JSON
     • Maintenance bar: 90d / all cleanup (useConfirm gate)
     • Pagination (limit 50)
=============================================================== */

type LogRow = {
  id: string;
  admin_user_id: string | null;
  admin_email: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_title: string | null;
  before_data: unknown;
  after_data: unknown;
  diff_summary: string[] | null;
  route: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type ListResponse = {
  ok?: boolean;
  items?: LogRow[];
  total?: number;
  error?: string;
};

const PAGE_SIZE = 50;

const ENTITY_LABEL: Record<string, string> = {
  villa: "Mülk",
  reservation: "Rezervasyon",
  manual_reservation: "Manuel Rez.",
  review: "Yorum",
  page: "Sayfa",
  settings: "Ayarlar",
  admin_user: "Admin",
  exchange_rates: "Döviz",
  mail_logs: "Mail Log",
  homepage_collection: "Anasayfa Koleksiyon",
  menu: "Menü",
  faq: "SSS",
  offer_request: "Teklif Talebi",
  contact_message: "İletişim",
};

function formatCount(n: number): string {
  return new Intl.NumberFormat("tr-TR").format(n);
}

function shortAction(a: string): string {
  /* "villa.update" → "Villa · Güncelle" tarzı */
  const [domain, op] = a.split(".");
  const opLabel: Record<string, string> = {
    create: "Oluştur",
    update: "Güncelle",
    delete: "Sil",
    soft_delete: "Çöpe Taşı",
    restore: "Geri Yükle",
    approve: "Onayla",
    reject: "Reddet",
    feature: "Öne Çıkar",
    unfeature: "Öne Çıkarmayı Kaldır",
    status_change: "Durum Değişimi",
    refresh: "Yenile",
    cleanup: "Temizlik",
    activate: "Aktifleştir",
    deactivate: "Pasifleştir",
  };
  return (opLabel[op] || op || a) + (domain ? "" : "");
}

export default function ActivityLogList() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [items, setItems] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<"90d" | "all" | null>(null);
  const [offset, setOffset] = useState(0);

  /* Filters */
  const [fAdmin, setFAdmin] = useState("");
  const [fAction, setFAction] = useState("");
  const [fEntity, setFEntity] = useState("");
  /* fFrom / fTo string olarak korunur (API contract aynen — datetime-local
     formatı "YYYY-MM-DDTHH:mm"). UI tarafı AdminDateRangePicker'a Date
     objesi ile bağlanır; gün başlangıcı 00:00, gün sonu 23:59 olarak
     serialize edilir. Eski minute-level UX'ten gün-level'e geçiş —
     kullanıcı kuralı (tek range input). */
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  /* Derived Date objects for range picker. */
  const fromDateObj = useMemo(() => parseDateFlexible(fFrom), [fFrom]);
  const toDateObj = useMemo(() => parseDateFlexible(fTo), [fTo]);

  function handleDateRangeChange([s, e]: [Date | null, Date | null]) {
    setFFrom(s ? `${formatLocalDate(s)}T00:00` : "");
    setFTo(e ? `${formatLocalDate(e)}T23:59` : "");
  }

  const load = useCallback(
    async (resetOffset = false) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(resetOffset ? 0 : offset));
      if (fAdmin.trim()) params.set("admin_user_id", fAdmin.trim());
      if (fAction.trim()) params.set("action", fAction.trim());
      if (fEntity.trim()) params.set("entity_type", fEntity.trim());
      if (fFrom.trim()) params.set("from", fFrom.trim());
      if (fTo.trim()) params.set("to", fTo.trim());
      try {
        const res = await adminFetch(
          "/api/admin/activity-logs/list?" + params.toString(),
          { method: "GET" }
        );
        const json = (await res.json().catch(() => ({}))) as ListResponse;
        if (!res.ok || !json.ok) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        setItems(json.items || []);
        setTotal(json.total ?? 0);
        if (resetOffset) setOffset(0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        toast.error("Loglar yüklenemedi", {
          id: "activity-list",
          description: msg,
        });
      }
    },
    [offset, fAdmin, fAction, fEntity, fFrom, fTo, toast]
  );

  /* Initial + filter changes (offset hariç) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fAdmin, fAction, fEntity, fFrom, fTo]);

  /* Offset değişimi (pagination) */
  useEffect(() => {
    if (loading) return;
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function handleCleanup(mode: "90d" | "all") {
    if (processing) return;
    const isAll = mode === "all";
    const ok = await confirm({
      title: isAll
        ? "Tüm aktivite logları silinsin mi?"
        : "90 günden eski loglar silinsin mi?",
      description: isAll
        ? "Tüm audit izi kalıcı olarak silinir. Geri alınamaz. Compliance / soruşturma gereksinimleri varsa önce yedek alın."
        : "90 günden eski tüm log satırları kalıcı olarak silinir. Yeni loglar etkilenmez.",
      confirmLabel: isAll ? "Tümünü Sil" : "90 Günden Eskileri Sil",
      variant: "danger",
    });
    if (!ok) return;
    setProcessing(mode);
    try {
      const res = await adminFetch("/api/admin/activity-logs/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Loglar temizlenemedi", {
          id: "activity-cleanup",
          description: json.error || `HTTP ${res.status}`,
        });
        return;
      }
      toast.success(`${formatCount(json.deleted ?? 0)} log silindi`, {
        id: "activity-cleanup",
      });
      await load(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Loglar temizlenemedi", {
        id: "activity-cleanup",
        description: msg,
      });
    } finally {
      setProcessing(null);
    }
  }

  const pageInfo = useMemo(() => {
    const from = total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + items.length, total);
    return { from, to };
  }, [offset, items.length, total]);

  return (
    <div className="space-y-5">
      {/* MAINTENANCE BAR */}
      <section
        className="card-premium px-5 py-4 md:px-6 md:py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        aria-label="Aktivite log bakım"
      >
        <div className="inline-flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))] text-[var(--brand-coral,#FF653F)]"
          >
            <Activity size={13} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
              Audit Trail
            </p>
            <p className="text-[14px] font-medium text-[var(--color-stone-900)] tabular-nums">
              {loading ? "…" : formatCount(total)} kayıt
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <ActionButton
            icon={<RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />}
            label="Yenile"
            loading={false}
            disabled={refreshing || loading}
            onClick={handleRefresh}
            variant="soft"
          />
          <ActionButton
            icon={<Trash2 size={13} strokeWidth={1.75} />}
            label="90 Günden Eskileri Sil"
            activeLabel="Siliniyor…"
            loading={processing === "90d"}
            disabled={!!processing || loading || total === 0}
            onClick={() => handleCleanup("90d")}
            variant="soft"
          />
          <ActionButton
            icon={<Trash2 size={13} strokeWidth={1.75} />}
            label="Tümünü Temizle"
            activeLabel="Temizleniyor…"
            loading={processing === "all"}
            disabled={!!processing || loading || total === 0}
            onClick={() => handleCleanup("all")}
            variant="danger"
          />
        </div>
      </section>

      {/* FILTERS */}
      <section className="card-premium px-5 py-4 md:px-6 md:py-4">
        <div className="flex items-center gap-2 mb-3 text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          <Filter size={12} aria-hidden />
          Filtreler
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <FilterInput
            label="Admin ID"
            value={fAdmin}
            onChange={setFAdmin}
            placeholder="uuid"
          />
          <FilterInput
            label="Action"
            value={fAction}
            onChange={setFAction}
            placeholder="villa.update"
          />
          <FilterSelect
            label="Entity"
            value={fEntity}
            onChange={setFEntity}
            options={[
              { value: "", label: "Tümü" },
              ...Object.entries(ENTITY_LABEL).map(([v, l]) => ({
                value: v,
                label: l,
              })),
            ]}
          />
          {/* 🛡️ Date range picker — Villa Listesi / iCal / Activity
              logs ortak shared component. Tek input popup calendar,
              range selection. fFrom/fTo string state'i API kontratı
              için aynen korunur — picker Date objesi ile UI yapar,
              handleDateRangeChange `T00:00`/`T23:59` ile serialize eder.
              Grid'de 2 hücreyi (Başlangıç + Bitiş) tek range field'ı
              değiştirir; geri kalan filter genişlik dağılımı korunur. */}
          <div className="md:col-span-2">
            <label className="block text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-1">
              Tarih Aralığı
            </label>
            <AdminDateRangePicker
              startDate={fromDateObj}
              endDate={toDateObj}
              onChange={handleDateRangeChange}
              placeholderText="GG.AA.YYYY – GG.AA.YYYY"
              ariaLabel="Aktivite log tarih aralığı"
            />
          </div>
        </div>
      </section>

      {/* LIST */}
      {loading ? (
        <div className="card-premium p-10 text-center text-[var(--color-stone-500)] text-sm">
          Yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <p className="text-[var(--color-stone-500)] text-sm">
            Bu filtrelerle eşleşen log yok.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((row) => (
            <LogRowCard
              key={row.id}
              row={row}
              open={openId === row.id}
              onToggle={() =>
                setOpenId((p) => (p === row.id ? null : row.id))
              }
            />
          ))}
        </div>
      )}

      {/* PAGINATION */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12.5px] text-[var(--color-stone-500)]">
          <span className="tabular-nums">
            {pageInfo.from}-{pageInfo.to} / {formatCount(total)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="admin-btn-ghost"
            >
              Önceki
            </button>
            <button
              type="button"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="admin-btn-ghost"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   ROW
=============================================================== */
function LogRowCard({
  row,
  open,
  onToggle,
}: {
  row: LogRow;
  open: boolean;
  onToggle: () => void;
}) {
  const entityLabel = row.entity_type
    ? ENTITY_LABEL[row.entity_type] || row.entity_type
    : "—";

  return (
    <article className="admin-card p-4 md:p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left flex items-start gap-3 flex-wrap"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))] text-[var(--brand-coral-ink,#7a2912)] border border-[var(--brand-coral,#FF653F)]/15 px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em]">
              {row.action}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-sand-50)] text-[var(--color-stone-700)] border border-[var(--color-stone-200)] px-2.5 py-0.5 text-[11px] font-medium">
              <Layers size={10} aria-hidden />
              {entityLabel}
            </span>
            {row.entity_title && (
              <span className="text-[13px] font-medium text-[var(--color-stone-900)] truncate max-w-[280px]">
                {row.entity_title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[12px] text-[var(--color-stone-500)]">
            <span className="inline-flex items-center gap-1">
              <User size={11} aria-hidden />
              {row.admin_email}
            </span>
            <span className="text-[var(--color-stone-300)]">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock size={11} aria-hidden />
              {formatDateTimeTr(row.created_at)}
            </span>
            {row.route && (
              <>
                <span className="text-[var(--color-stone-300)]">·</span>
                <code className="text-[11px] text-[var(--color-stone-400)]">
                  {row.route}
                </code>
              </>
            )}
          </div>
        </div>
        <ChevronDown
          size={14}
          className={
            "text-[var(--color-stone-400)] shrink-0 mt-1 transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-[var(--color-stone-100)] space-y-4">
          {/* DIFF */}
          {row.diff_summary && row.diff_summary.length > 0 && (
            <div>
              <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
                Değişiklik özeti
              </p>
              <ul className="space-y-1">
                {row.diff_summary.map((d, i) => (
                  <li
                    key={i}
                    className="text-[13px] text-[var(--color-stone-700)] font-mono leading-relaxed"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* META */}
          {(row.ip_address || row.user_agent || row.entity_id) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
              {row.entity_id && (
                <DetailField label="Entity ID">{row.entity_id}</DetailField>
              )}
              {row.ip_address && (
                <DetailField label="IP">{row.ip_address}</DetailField>
              )}
              {row.user_agent && (
                <DetailField label="User-Agent">
                  <span className="truncate block">{row.user_agent}</span>
                </DetailField>
              )}
            </div>
          )}

          {/* RAW JSON */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <JsonBlock label="Before" data={row.before_data} />
            <JsonBlock label="After" data={row.after_data} />
          </div>
        </div>
      )}
    </article>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
        {label}
      </p>
      <div className="text-[13px] text-[var(--color-stone-700)] mt-0.5 break-all">
        {children}
      </div>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const empty = data === null || data === undefined;
  return (
    <div>
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-1.5">
        {label}
      </p>
      {empty ? (
        <p className="text-[12px] text-[var(--color-stone-400)] italic">—</p>
      ) : (
        <pre className="text-[11.5px] text-[var(--color-stone-700)] bg-[var(--color-sand-50)] rounded-xl p-3 max-h-72 overflow-auto leading-relaxed">
{JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ===============================================================
   FILTERS
=============================================================== */
function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-1">
        {label}
      </label>
      <input
        type={type || "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] text-[var(--color-stone-900)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ===============================================================
   ACTION BUTTON (paylaşılan primitive — MailLogsCard'la aynı dil)
=============================================================== */
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
  activeLabel?: string;
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
      {loading && activeLabel ? activeLabel : label}
    </button>
  );
}

/* ===============================================================
   📅 DATE HELPERS — range picker ↔ string state interop
   ===============================================================
   Range picker Date objesi ile çalışır; mevcut fFrom/fTo string state
   "YYYY-MM-DDTHH:mm" datetime-local formatında. Helper'lar iki yönde
   defansif dönüşüm sağlar.

   - parseDateFlexible : "YYYY-MM-DD" veya "YYYY-MM-DDTHH:mm" → Date | null
                         (local TZ, getFullYear/Month/Date ile UTC drift YOK)
   - formatLocalDate   : Date → "YYYY-MM-DD" (local)
=============================================================== */
function parseDateFlexible(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const hh = m[4] ? Number(m[4]) : 0;
  const mm = m[5] ? Number(m[5]) : 0;
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    mo < 0 ||
    mo > 11
  ) {
    return null;
  }
  return new Date(y, mo, d, hh, mm, 0, 0);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
