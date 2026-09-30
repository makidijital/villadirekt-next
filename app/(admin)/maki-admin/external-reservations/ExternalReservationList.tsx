"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Search,
  RefreshCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  CalendarRange,
  Home as HomeIcon,
  Filter,
  Layers,
  Ban,
  Trash2,
} from "lucide-react";

import {
  listExternalCalendarEventsAction as listExternalCalendarEvents,
  getExternalCalendarKpiAction as getExternalCalendarKpi,
  getExternalCalendarFilterOptionsAction as getExternalCalendarFilterOptions,
  countInactiveEventsForSourceAction as countInactiveEventsForSource,
} from "./external-reservations.action";
import {
  deactivateExternalCalendarEvent,
  purgeInactiveEventsForSource,
  type ExternalCalendarKpi,
  type ExternalEventListItem,
  type FilterOption,
} from "@/app/services/external-calendar-events.service";
import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import AdminDateRangePicker from "@/app/components/admin/shared/AdminDateRangePicker";
import { formatDateTr, formatDateTimeTr } from "@/lib/date-format";
import { calculateNights } from "@/lib/price.engine";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

/* ===============================================================
   🛡️ FAZ 56G — iCAL REZERVASYONLARI ADMIN LIST
   ===============================================================
   READ-ONLY operations view. Hiçbir edit/status/payment action yok.
   Mevcut /maki-admin/reservations sayfasından bağımsız ekran.
   "Senkronize Et" yalnız source bazlı (FAZ 56B endpoint'i çağırır).
=============================================================== */

const PAGE_SIZE = 50;

/* Source name → coral/blue/purple/gray badge tonu mapping. */
function sourceBadgeTone(name: string | undefined | null): {
  bg: string;
  text: string;
  border: string;
} {
  const n = (name || "").toLowerCase().trim();
  if (n.includes("airbnb")) {
    return {
      bg: "bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))]",
      text: "text-[var(--brand-coral-ink,#7a2912)]",
      border: "border-[var(--brand-coral,#FF653F)]/30",
    };
  }
  if (n.includes("booking")) {
    return {
      bg: "bg-sky-50",
      text: "text-sky-800",
      border: "border-sky-200",
    };
  }
  if (n.includes("vrbo")) {
    return {
      bg: "bg-violet-50",
      text: "text-violet-800",
      border: "border-violet-200",
    };
  }
  return {
    bg: "bg-[var(--color-stone-100)]",
    text: "text-[var(--color-stone-700)]",
    border: "border-[var(--color-stone-200)]",
  };
}

type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Pasif" },
];

export default function ExternalReservationList() {
  const toast = useNotify();

  const [items, setItems] = useState<ExternalEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [kpi, setKpi] = useState<ExternalCalendarKpi>({
    activeEventsCount: 0,
    activeSourcesCount: 0,
    errorSourcesCount: 0,
    lastSuccessAt: null,
  });
  const [villaOptions, setVillaOptions] = useState<FilterOption[]>([]);
  const [sourceOptions, setSourceOptions] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);
  const [deactivateBusyId, setDeactivateBusyId] = useState<string | null>(null);
  /* FAZ 56G+ — purge inactive (source-scoped). */
  const [inactiveCount, setInactiveCount] = useState<number>(0);
  const [purgeBusy, setPurgeBusy] = useState<boolean>(false);

  /* Filters */
  const [search, setSearch] = useState("");
  const [villaFilter, setVillaFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  /* 🛡️ Client-side ek arama (rezervasyonlar paritesi). Mevcut server-side
     "Ara" filtresi (summary ilike) AYNEN durur; bu yalnız ekrandaki
     subset'i daha hızlı daraltır. items state'ine dokunmaz. */
  const [clientSearch, setClientSearch] = useState("");
  /* fromDate / toDate string olarak korunur (API contract: "YYYY-MM-DD").
     UI tarafı AdminDateRangePicker'a Date objesi ile bağlanır; memo
     derived dönüşüm + handleDateRangeChange geri serialize. Eski iki
     ayrı AdminDateInput'tan tek range picker'a UX upgrade. */
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  /* 🛡️ Client-side görünür subset.
     Aramaya bakılan alanlar: summary (açıklama/not), villa.title (villa adı),
     external_uid (rezervasyon kodu), villa.slug.
     Boş aramada items birebir döner. */
  const visibleItems = useMemo(() => {
    const q = normalizeSearchText(clientSearch);
    if (!q) return items;
    return items.filter((it) => {
      const haystack = normalizeSearchText(
        (it.summary || "") +
        " " +
        (it.villa?.title || "") +
        " " +
        (it.villa?.slug || "") +
        " " +
        (it.external_uid || "")
      );
      return haystack.includes(q);
    });
  }, [items, clientSearch]);

  const fromDateObj = useMemo(() => parseDateOnly(fromDate), [fromDate]);
  const toDateObj = useMemo(() => parseDateOnly(toDate), [toDate]);
  function handleDateRangeChange([s, e]: [Date | null, Date | null]) {
    setFromDate(s ? formatLocalDate(s) : "");
    setToDate(e ? formatLocalDate(e) : "");
  }
  const [offset, setOffset] = useState(0);

  const isActiveValue = useMemo<boolean | null>(() => {
    if (statusFilter === "active") return true;
    if (statusFilter === "inactive") return false;
    return null;
  }, [statusFilter]);

  const loadEvents = useCallback(
    async (resetOffset = false) => {
      const nextOffset = resetOffset ? 0 : offset;
      const result = await listExternalCalendarEvents({
        villa_id: villaFilter || undefined,
        source_id: sourceFilter || undefined,
        is_active: isActiveValue,
        from: fromDate || null,
        to: toDate || null,
        search: search.trim() || null,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setItems(result.items);
      setTotal(result.total);
      if (resetOffset) setOffset(0);
    },
    [
      offset,
      villaFilter,
      sourceFilter,
      isActiveValue,
      fromDate,
      toDate,
      search,
    ]
  );

  const loadKpi = useCallback(async () => {
    const k = await getExternalCalendarKpi();
    setKpi(k);
  }, []);

  /* Initial mount + filter change */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [options] = await Promise.all([
        getExternalCalendarFilterOptions(),
        loadKpi(),
        loadEvents(true),
      ]);
      if (!cancelled) {
        setVillaOptions(options.villas);
        setSourceOptions(options.sources);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Filter değişti → offset reset + reload */
  useEffect(() => {
    if (loading) return;
    loadEvents(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaFilter, sourceFilter, isActiveValue, fromDate, toDate, search]);

  /* Offset değişti (pagination) → reload aynı filtre */
  useEffect(() => {
    if (loading) return;
    loadEvents(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  /* FAZ 56G+ — sourceFilter değişince purge-target count refresh. */
  useEffect(() => {
    if (!sourceFilter) {
      setInactiveCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const n = await countInactiveEventsForSource(sourceFilter);
      if (!cancelled) setInactiveCount(n);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFilter, items.length]);

  /* Seçili source'un aktiflik durumu — purge buton enable/disable kararı. */
  const selectedSource = useMemo<FilterOption | null>(() => {
    if (!sourceFilter) return null;
    return sourceOptions.find((s) => s.id === sourceFilter) || null;
  }, [sourceFilter, sourceOptions]);
  const purgeAllowed = !!selectedSource && selectedSource.is_active === false;
  const purgeVisible = !!sourceFilter;

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadKpi(), loadEvents(true)]);
    setRefreshing(false);
  }

  /* FAZ 56G+ — Pasif event'leri kalıcı sil (source-scoped).
     Yalnız source.is_active=false + event.is_active=false satırlar.
     Aktif kaynak veya aktif event ASLA silinmez (route DB seviyesinde
     guard ediyor + UI buton zaten disabled). */
  async function handlePurgeInactive() {
    if (!sourceFilter || !purgeAllowed || purgeBusy) return;
    if (inactiveCount === 0) return;
    const sourceLabel = selectedSource?.label || "Kaynak";
    const confirmed = window.confirm(
      `${sourceLabel}: ${inactiveCount} pasif event kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musun?`
    );
    if (!confirmed) return;
    setPurgeBusy(true);
    try {
      const res = await purgeInactiveEventsForSource(sourceFilter);
      if (!res.ok) {
        toast.error("Pasifler temizlenemedi", {
          id: `ext-purge-${sourceFilter}`,
          description: res.error,
        });
        return;
      }
      toast.success(`${res.deletedCount} pasif event temizlendi`, {
        id: `ext-purge-${sourceFilter}`,
      });
      setInactiveCount(0);
      await Promise.all([loadKpi(), loadEvents(false)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Pasifler temizlenemedi", {
        id: `ext-purge-${sourceFilter}`,
        description: msg,
      });
    } finally {
      setPurgeBusy(false);
    }
  }

  /* 🛡️ FAZ 56G+ — Admin soft deactivate.
     Soft toggle: is_active=false + manually_deactivated=true.
     Migration 032 + sync sweep sayesinde sonraki sync event'i
     yeniden diriltemez. Hard delete YOK; audit korunur. */
  async function handleDeactivate(
    eventId: string,
    sourceName: string | null,
    when: string
  ) {
    if (deactivateBusyId) return;
    setDeactivateBusyId(eventId);
    try {
      const res = await deactivateExternalCalendarEvent(eventId);
      if (!res.ok) {
        toast.error("Event pasifleştirilemedi", {
          id: `ext-deact-${eventId}`,
          description: res.error,
        });
        return;
      }
      toast.success(
        res.alreadyInactive
          ? "Event zaten pasifti"
          : `${sourceName || "Event"} pasifleştirildi · ${when}`,
        { id: `ext-deact-${eventId}` }
      );
      await Promise.all([loadKpi(), loadEvents(false)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Event pasifleştirilemedi", {
        id: `ext-deact-${eventId}`,
        description: msg,
      });
    } finally {
      setDeactivateBusyId(null);
    }
  }

  /* Source bazlı sync — sync endpoint'i FAZ 56B'den. Event mutate
     etmez; yalnız son sync günceller. */
  async function handleSyncSource(sourceId: string, sourceName: string) {
    if (syncBusyId) return;
    setSyncBusyId(sourceId);
    try {
      const res = await adminFetch(
        "/api/admin/external-calendars/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: sourceId }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        imported?: number;
        deactivated?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error(`${sourceName} senkronize edilemedi`, {
          id: `ext-sync-${sourceId}`,
          description: json.error || `HTTP ${res.status}`,
        });
        return;
      }
      toast.success(`${sourceName}: ${json.imported ?? 0} event`, {
        id: `ext-sync-${sourceId}`,
      });
      await Promise.all([loadKpi(), loadEvents(false)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error(`${sourceName} senkronize edilemedi`, {
        id: `ext-sync-${sourceId}`,
        description: msg,
      });
    } finally {
      setSyncBusyId(null);
    }
  }

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <div className="space-y-6">
      {/* NOTICE BANNER — admin gerçek reservation ile karıştırmasın */}
      <div className="rounded-2xl border border-[var(--brand-coral,#FF653F)]/30 bg-[var(--brand-coral-tint,rgba(255,101,63,0.06))] px-5 py-3.5 flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-[var(--brand-coral,#FF653F)] shrink-0"
        >
          <Layers size={13} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--color-stone-900)]">
            Harici Takvim Kayıtları
          </p>
          <p className="text-[12px] text-[var(--color-stone-500)] leading-relaxed mt-0.5">
            Bu kayıtlar Airbnb / Booking / VRBO gibi platformlardan sync
            edilen availability blocker'lardır.{" "}
            <strong className="text-[var(--color-stone-700)]">
              Gerçek rezervasyon değildirler
            </strong>{" "}
            — payment, mail, status flow tetiklemez. Sadece takvimi bloke
            ederler.
          </p>
        </div>
      </div>

      {/* KPI GRID */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Calendar size={14} />}
          label="Aktif Blok"
          value={loading ? "…" : kpi.activeEventsCount.toLocaleString("tr-TR")}
        />
        <KpiCard
          icon={<Layers size={14} />}
          label="Aktif Kaynak"
          value={
            loading ? "…" : kpi.activeSourcesCount.toLocaleString("tr-TR")
          }
        />
        <KpiCard
          icon={<CheckCircle2 size={14} />}
          label="Son Sync"
          value={loading ? "…" : formatDateTimeTr(kpi.lastSuccessAt)}
          mono
        />
        <KpiCard
          icon={<AlertCircle size={14} />}
          label="Hatalı Kaynak"
          value={
            loading ? "…" : kpi.errorSourcesCount.toLocaleString("tr-TR")
          }
          danger={!loading && kpi.errorSourcesCount > 0}
        />
      </section>

      {/* TOOLBAR — purge inactive (source-scoped) + refresh.
          🛡️ FAZ 56G+ — "Pasifleri Temizle" yalnız source filter
          seçildiğinde görünür. Aktif kaynak ise disabled + tooltip.
          Pasif kaynak ise enable + count badge. inactiveCount=0
          olduğunda da disabled (silinecek bir şey yok). */}
      <div className="flex items-center justify-end gap-2">
        {purgeVisible && (
          <button
            type="button"
            onClick={handlePurgeInactive}
            disabled={
              !purgeAllowed || purgeBusy || inactiveCount === 0 || loading
            }
            className="admin-btn-ghost"
            aria-label="Pasif eventleri kalıcı sil"
            title={
              !purgeAllowed
                ? "Aktif kaynakların eventleri temizlenemez — önce kaynağı pasifleştirin"
                : inactiveCount === 0
                  ? "Silinecek pasif event yok"
                  : `${inactiveCount} pasif event'i kalıcı sil (geri alınamaz)`
            }
          >
            {purgeBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            Pasifleri Temizle{purgeAllowed && inactiveCount > 0 ? ` (${inactiveCount})` : ""}
          </button>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="admin-btn-ghost"
          aria-label="Yenile"
        >
          {refreshing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCcw size={13} />
          )}
          Yenile
        </button>
      </div>

      {/* FILTERS */}
      <section className="card-premium px-5 py-4 md:px-6 md:py-4">
        <div className="flex items-center gap-2 mb-3 text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
          <Filter size={12} aria-hidden />
          Filtreler
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <FilterField label="Ara">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-stone-400)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="özet…"
                className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white pl-9 pr-3 py-2 text-[13px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
              />
            </div>
          </FilterField>
          <FilterField label="Mülk">
            <select
              value={villaFilter}
              onChange={(e) => setVillaFilter(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
            >
              <option value="">Tümü</option>
              {villaOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Kaynak">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
            >
              <option value="">Tümü</option>
              {sourceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Durum">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
              className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterField>
          {/* 🛡️ İki ayrı tarih input'u → tek range picker. Villa Listesi
              + Activity Logs ile ortak shared component (AdminDateRangePicker).
              fromDate/toDate string state aynen API'ye akar; UI Date
              objesi ile range çalışır. */}
          <FilterField label="Tarih Aralığı">
            <AdminDateRangePicker
              startDate={fromDateObj}
              endDate={toDateObj}
              onChange={handleDateRangeChange}
              placeholderText="GG.AA.YYYY – GG.AA.YYYY"
              ariaLabel="iCal rezervasyon tarih aralığı"
            />
          </FilterField>
        </div>
      </section>

      {/* ════════ SEARCH BAR (rezervasyonlar paritesi) ════════
          Mevcut server-side "Ara" filtresinden BAĞIMSIZ ek bir
          client-side search. Listenin hemen üstünde durur. */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk, kod, açıklama ara…"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {visibleItems.length} kayıt
        </span>
      </div>

      {/* LIST */}
      {loading ? (
        <div className="card-premium p-12 text-center text-[13px] text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <CalendarRange size={16} className="text-[var(--color-stone-500)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Bu filtrelerle eşleşen kayıt yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-md mx-auto">
            Mülk edit sayfasından iCal kaynağı ekleyip senkronize edince
            burada görünür.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleItems.map((row) => (
            <ExternalEventRow
              key={row.id}
              row={row}
              syncing={syncBusyId === row.source?.id}
              deactivating={deactivateBusyId === row.id}
              onSync={() => {
                if (row.source?.id && row.source.source_name) {
                  handleSyncSource(row.source.id, row.source.source_name);
                }
              }}
              onDeactivate={() =>
                handleDeactivate(
                  row.id,
                  row.source?.source_name ?? null,
                  `${row.start_date} → ${row.end_date}`
                )
              }
            />
          ))}
        </div>
      )}

      {/* PAGINATION */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12.5px] text-[var(--color-stone-500)]">
          <span className="tabular-nums">
            {total === 0 ? 0 : offset + 1}-
            {Math.min(offset + items.length, total)} / {total.toLocaleString("tr-TR")}
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
function ExternalEventRow({
  row,
  syncing,
  deactivating,
  onSync,
  onDeactivate,
}: {
  row: ExternalEventListItem;
  syncing: boolean;
  deactivating: boolean;
  onSync: () => void;
  onDeactivate: () => void;
}) {
  const nights = calculateNights(row.start_date, row.end_date);
  const tone = sourceBadgeTone(row.source?.source_name);
  const hasError = !!row.source?.last_error;

  return (
    <article
      className={
        "admin-card p-4 md:p-5 " +
        (row.is_active ? "" : "opacity-60")
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {/* HEADER ROW */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* "Harici" badge — admin gerçek reservation ile karıştırmasın */}
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-stone-900)] text-white px-2.5 py-0.5 text-[10.5px] font-medium tracking-[0.05em] uppercase">
              iCal
            </span>

            {/* Source name badge — coral/blue/purple/gray */}
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium " +
                tone.bg +
                " " +
                tone.text +
                " " +
                tone.border
              }
            >
              {row.source?.source_name || "Kaynak yok"}
            </span>

            {/* Status badge */}
            {row.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-medium">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Aktif
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-stone-100)] text-[var(--color-stone-500)] border border-[var(--color-stone-200)] px-2.5 py-0.5 text-[11px] font-medium">
                Pasif
              </span>
            )}

            {hasError && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-[10.5px] font-medium">
                <AlertCircle size={10} />
                Sync hatası
              </span>
            )}
          </div>

          {/* Villa + dates */}
          <div className="mt-2">
            <div className="flex items-center gap-1.5 text-[14px] text-[var(--color-stone-900)] font-medium">
              <HomeIcon size={12} className="text-[var(--color-stone-400)]" />
              {row.villa?.title || row.villa_id}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-[12.5px] text-[var(--color-stone-500)] tabular-nums">
              <span className="inline-flex items-center gap-1">
                <CalendarRange size={11} aria-hidden />
                {formatDateTr(row.start_date)} → {formatDateTr(row.end_date)}
              </span>
              <span className="text-[var(--color-stone-300)]">·</span>
              <span>{nights} gece</span>
              <span className="text-[var(--color-stone-300)]">·</span>
              <span className="text-[11.5px]">
                Son görülme: {formatDateTimeTr(row.last_seen_at)}
              </span>
            </div>
            {row.summary && (
              <p className="text-[12.5px] text-[var(--color-stone-500)] mt-1.5 line-clamp-2 max-w-2xl">
                {row.summary}
              </p>
            )}
            <p className="text-[10.5px] text-[var(--color-stone-400)] mt-2 italic">
              Takvimde bloke eder · gerçek rezervasyon değildir
            </p>
          </div>
        </div>

        {/* RIGHT — actions: source-level sync + event-level deactivate.
            FAZ 56G+: yalnız aktif row'da "Pasifleştir" görünür. Pasif
            row'da "Pasif" badge zaten gösteriliyor + opacity-60 ile
            görsel olarak ayrışıyor. */}
        <div className="shrink-0 flex items-center gap-2">
          {row.is_active && (
            <button
              type="button"
              onClick={onDeactivate}
              disabled={deactivating}
              className="admin-btn-ghost"
              aria-label="Bu event'i pasifleştir"
              title="Bu event'i pasifleştir — soft toggle; audit korunur, sync geri açamaz"
            >
              {deactivating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Ban size={13} />
              )}
              Pasifleştir
            </button>
          )}
          {row.source?.id && row.is_active && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="admin-btn-ghost"
              aria-label="Kaynağı senkronize et"
              title="Bu kaynağı şimdi senkronize et"
            >
              {syncing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCcw size={13} />
              )}
              Senkronize
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ===============================================================
   PRIMITIVES
=============================================================== */
function KpiCard({
  icon,
  label,
  value,
  mono,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white px-4 py-3.5">
      <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] inline-flex items-center gap-1.5">
        <span aria-hidden className="text-[var(--color-stone-400)]">
          {icon}
        </span>
        {label}
      </p>
      <p
        className={
          "font-display text-[20px] md:text-[22px] mt-1 leading-tight " +
          (mono ? "tabular-nums " : "") +
          (danger
            ? "text-red-700"
            : "text-[var(--color-stone-900)]")
        }
      >
        {value}
      </p>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ===============================================================
   📅 DATE HELPERS — range picker ↔ string state interop
   ===============================================================
   listExternalCalendarEvents API "YYYY-MM-DD" string bekliyor.
   Picker Date objesi ile çalıştığı için iki yönde defansif dönüşüm.
=============================================================== */
function parseDateOnly(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    mo < 0 ||
    mo > 11
  ) {
    return null;
  }
  return new Date(y, mo, d, 0, 0, 0, 0);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
