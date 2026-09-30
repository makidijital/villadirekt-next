"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Phone,
  Mail,
  CalendarRange,
  Users,
  Trash2,
  ChevronDown,
  Sparkles,
  Inbox,
} from "lucide-react";

import {
  getOfferRequestsAction as getOfferRequests,
  updateOfferRequestStatusAction as updateOfferRequestStatus,
  deleteOfferRequestAction as deleteOfferRequest,
} from "./offer-requests.action";
import { OFFER_STATUS_LABEL } from "./offer-request-labels";
import type {
  OfferRequestRow,
  OfferRequestStatus,
} from "@/types/database";
import { formatDateTr } from "@/lib/date-format";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { adminFetch } from "@/lib/admin-fetch";
import {
  buildLabelMap,
  formatBudgetRange,
  humanizeTravelGroup,
  resolveFeatureLabel,
  resolveTokenLabel,
  type TaxonomyRow,
} from "@/lib/offer-request.humanize";

/* ===============================================================
   🛡️ FAZ 40 — ADMIN OFFER REQUEST LIST (client island)
   ===============================================================
   - Client-side fetch (RLS authenticated)
   - Stacked list, status badge, counter strip, expandable detail
   - Status transitions: pending → contacted → offered → closed
   - Delete via confirm
   =============================================================== */

const STATUS_TONE: Record<
  OfferRequestStatus,
  { dot: string; badge: string }
> = {
  pending: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 border-amber-200",
  },
  contacted: {
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-800 border-sky-200",
  },
  offered: {
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-800 border-violet-200",
  },
  closed: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
};

const STATUS_ORDER: OfferRequestStatus[] = [
  "pending",
  "contacted",
  "offered",
  "closed",
];

export default function OfferRequestList() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [data, setData] = useState<OfferRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  /* 🛡️ FAZ 48 — TAXONOMY LOOKUPS (humanize layer)
     Region/villa-type/feature token'larını isim'e çözmek için
     ilgili tablolardan id+slug+name çekiyoruz. Hata olursa
     boş map ile devam — render fallback humanizeSlug devreye girer. */
  const [regionMap, setRegionMap] = useState<Record<string, string>>({});
  const [villaTypeMap, setVillaTypeMap] = useState<Record<string, string>>({});
  const [featureMap, setFeatureMap] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const fresh = await getOfferRequests();
    setData(fresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getOfferRequests();
        if (!cancelled) setData(fresh);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Taxonomy fetch — render layer için; herhangi biri başarısız
     olursa fallback humanize devreye girer. */
  useEffect(() => {
    let cancelled = false;
    /* 🛡️ FAZ 2 frontend purge — adminFetch GET /api/admin/taxonomies.
       Eski 3 paralel anon DB client fetch tek route response'unda
       birleştirildi. Davranış BYTE-IDENTICAL: aynı select shape'leri
       ({ id, name, slug } / { id, name }) → aynı label map build. */
    (async () => {
      try {
        const res = await adminFetch("/api/admin/taxonomies");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          locations?: TaxonomyRow[];
          types?: TaxonomyRow[];
          features?: TaxonomyRow[];
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) return;
        setRegionMap(buildLabelMap(json.locations || []));
        setVillaTypeMap(buildLabelMap(json.types || []));
        setFeatureMap(buildLabelMap(json.features || []));
      } catch {
        /* fail-soft: humanize fallback caller'da. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counters = useMemo(() => {
    const c: Record<OfferRequestStatus, number> = {
      pending: 0,
      contacted: 0,
      offered: 0,
      closed: 0,
    };
    for (const r of data) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [data]);

  const handleStatus = async (
    id: string,
    next: OfferRequestStatus
  ) => {
    if (busyId) return;
    setBusyId(id);
    const res = await updateOfferRequestStatus(id, next);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Durum güncellenemedi", {
        id: `offer-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success(`Durum: ${OFFER_STATUS_LABEL[next]}`, {
      id: `offer-${id}`,
    });
    setData((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: next, updated_at: new Date().toISOString() }
          : r
      )
    );
    refresh().catch(() => {});
  };

  const handleDelete = async (id: string) => {
    if (busyId) return;
    const ok = await confirm({
      title: "Talep silinsin mi?",
      description: "Bu talep kalıcı olarak kaldırılır. İşlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(id);
    const res = await deleteOfferRequest(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `offer-del-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Talep silindi", { id: `offer-del-${id}` });
    setData((prev) => prev.filter((r) => r.id !== id));
  };

  /* ─────── COUNTER STRIP ─────── */
  const counterStrip = (
    <div className="flex items-center gap-3 flex-wrap">
      {STATUS_ORDER.map((s) => (
        <div
          key={s}
          className="
            inline-flex items-center gap-2.5
            rounded-2xl border border-[var(--color-stone-100)]
            bg-white px-3.5 py-2 text-sm
          "
        >
          <span
            aria-hidden
            className={"w-1.5 h-1.5 rounded-full " + STATUS_TONE[s].dot}
          />
          <span className="text-[var(--color-stone-500)]">
            {OFFER_STATUS_LABEL[s]}
          </span>
          <span className="font-display text-[15px] text-[var(--color-stone-900)] tabular-nums">
            {counters[s]}
          </span>
        </div>
      ))}
    </div>
  );

  /* ─────── LOADING ─────── */
  if (loading && data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="admin-card p-4 md:p-5 animate-pulse">
              <div className="h-4 w-1/3 bg-[var(--admin-bg-soft)] rounded mb-3" />
              <div className="h-3 w-2/3 bg-[var(--admin-bg-soft)] rounded mb-2" />
              <div className="h-3 w-1/2 bg-[var(--admin-bg-soft)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─────── EMPTY ─────── */
  if (data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Inbox size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz teklif talebi yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            /teklif-al sayfasından gelen talepler burada listelenir.
          </p>
        </div>
      </div>
    );
  }

  /* ─────── LIST ─────── */
  return (
    <div className="space-y-5">
      {counterStrip}
      <div className="flex flex-col gap-3">
        {data.map((r) => (
          <OfferRow
            key={r.id}
            row={r}
            open={openId === r.id}
            busy={busyId === r.id}
            regionMap={regionMap}
            villaTypeMap={villaTypeMap}
            featureMap={featureMap}
            onToggle={() => setOpenId((p) => (p === r.id ? null : r.id))}
            onStatus={(next) => handleStatus(r.id, next)}
            onDelete={() => handleDelete(r.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ===============================================================
   ROW CARD
=============================================================== */
function OfferRow({
  row,
  open,
  busy,
  regionMap,
  villaTypeMap,
  featureMap,
  onToggle,
  onStatus,
  onDelete,
}: {
  row: OfferRequestRow;
  open: boolean;
  busy: boolean;
  regionMap: Record<string, string>;
  villaTypeMap: Record<string, string>;
  featureMap: Record<string, string>;
  onToggle: () => void;
  onStatus: (next: OfferRequestStatus) => void;
  onDelete: () => void;
}) {
  const t = STATUS_TONE[row.status];
  const nights =
    row.start_date && row.end_date
      ? Math.max(
          0,
          Math.round(
            (new Date(row.end_date).getTime() -
              new Date(row.start_date).getTime()) /
              86400000
          )
        )
      : 0;

  return (
    <article className="admin-card p-4 md:p-5">
      {/* HEADER ROW */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-[16px] md:text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
              {row.full_name}
            </h3>
            <span
              className={
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 " +
                t.badge
              }
            >
              <span
                aria-hidden
                className={"w-1.5 h-1.5 rounded-full " + t.dot}
              />
              {OFFER_STATUS_LABEL[row.status]}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1 text-[12.5px] text-[var(--admin-muted-2)]">
            <a
              href={`tel:${row.phone}`}
              className="inline-flex items-center gap-1 hover:text-[var(--admin-text)] transition-colors"
            >
              <Phone size={11} aria-hidden />
              {row.phone}
            </a>
            {row.email && (
              <>
                <span className="text-[var(--admin-border-strong)]">·</span>
                <a
                  href={`mailto:${row.email}`}
                  className="inline-flex items-center gap-1 hover:text-[var(--admin-text)] transition-colors truncate max-w-[220px]"
                >
                  <Mail size={11} aria-hidden />
                  {row.email}
                </a>
              </>
            )}
            <span className="text-[var(--admin-border-strong)]">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users size={11} aria-hidden />
              {row.adults}+{row.children}
            </span>
            {nights > 0 && (
              <>
                <span className="text-[var(--admin-border-strong)]">·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <CalendarRange size={11} aria-hidden />
                  {nights} gece
                </span>
              </>
            )}
            <span className="text-[var(--admin-border-strong)]">·</span>
            <span className="tabular-nums">
              {formatDateTr(row.created_at)}
            </span>
          </div>
        </div>

        {/* Status select + Delete + Expand */}
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={row.status}
            disabled={busy}
            onChange={(e) => onStatus(e.target.value as OfferRequestStatus)}
            aria-label="Durum"
            className="admin-btn-ghost !rounded-lg !pr-7 cursor-pointer text-[12px]"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {OFFER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="admin-btn-ghost !text-red-600 !border-red-200 hover:!bg-red-50"
            aria-label="Talep sil"
            title="Sil"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="admin-btn-ghost"
          >
            <ChevronDown
              size={13}
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
            />
            Detay
          </button>
        </div>
      </div>

      {/* DETAIL DRAWER */}
      {open && (
        <OfferDetail
          row={row}
          regionMap={regionMap}
          villaTypeMap={villaTypeMap}
          featureMap={featureMap}
        />
      )}
    </article>
  );
}

/* ─────── Compact luxury chip ─────── */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="
        inline-flex items-center
        rounded-full
        bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))]
        text-[var(--brand-coral-ink,#7a2912)]
        border border-[var(--brand-coral,#FF653F)]/15
        px-2.5 py-0.5 text-[11.5px] font-medium
        tracking-[0.01em] whitespace-nowrap
      "
    >
      {children}
    </span>
  );
}

function ChipRow({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[var(--admin-muted-2)]">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((label, i) => (
        <Chip key={`${label}-${i}`}>{label}</Chip>
      ))}
    </div>
  );
}

function OfferDetail({
  row,
  regionMap,
  villaTypeMap,
  featureMap,
}: {
  row: OfferRequestRow;
  regionMap: Record<string, string>;
  villaTypeMap: Record<string, string>;
  featureMap: Record<string, string>;
}) {
  const regionLabels = (row.region_tokens || [])
    .map((t) => resolveTokenLabel(t, regionMap))
    .filter((s) => s.length > 0);
  const villaTypeLabels = (row.villa_type_tokens || [])
    .map((t) => resolveTokenLabel(t, villaTypeMap))
    .filter((s) => s.length > 0);
  const featureLabels = (row.feature_tokens || [])
    .map((t) => resolveFeatureLabel(t, featureMap))
    .filter((s) => s.length > 0);

  return (
    <div className="mt-4 pt-4 border-t border-[var(--admin-border,#ece8df)] grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-[13px]">
      <DetailField label="Tatil grubu">
        {row.travel_group ? (
          <Chip>{humanizeTravelGroup(row.travel_group)}</Chip>
        ) : (
          "—"
        )}
      </DetailField>
      <DetailField label="Tarih">
        {row.start_date && row.end_date
          ? `${formatDateTr(row.start_date)} → ${formatDateTr(row.end_date)}`
          : "—"}
      </DetailField>
      <DetailField label="Bölge tercihleri">
        <ChipRow items={regionLabels} />
      </DetailField>
      <DetailField label="Mülk tipleri">
        <ChipRow items={villaTypeLabels} />
      </DetailField>
      <DetailField label="Özellikler">
        <ChipRow items={featureLabels} />
      </DetailField>
      <DetailField label="Bütçe">
        {formatBudgetRange(row.budget_min, row.budget_max, row.budget_currency)}
      </DetailField>
      {row.note && (
        <div className="md:col-span-2">
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--admin-muted-2)] mb-1.5 inline-flex items-center gap-1.5">
            <Sparkles size={11} />
            Özel not
          </p>
          <p className="text-[13.5px] text-[var(--admin-text)] leading-[1.7] whitespace-pre-line">
            {row.note}
          </p>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  /* div wrapper (was <p>) — chip group / nested flex'i rahatça
     sarsın diye block-level container. */
  return (
    <div>
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--admin-muted-2)] mb-1">
        {label}
      </p>
      <div className="text-[13.5px] text-[var(--admin-text)]">{children}</div>
    </div>
  );
}
