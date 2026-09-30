"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  Plus,
  Power,
  RefreshCcw,
  Link as LinkIcon,
} from "lucide-react";

import {
  createExternalCalendarSourceAction as createExternalCalendarSource,
  listExternalCalendarSourcesAction as listExternalCalendarSources,
  setExternalCalendarSourceActiveAction as setExternalCalendarSourceActive,
} from "./ical-sync.action";
import type { ExternalCalendarSource } from "@/app/services/external-calendar-source.service";
import { adminFetch } from "@/lib/admin-fetch";
import {
  useConfirm,
  useNotify,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
import { formatDateTimeTr } from "@/lib/date-format";

/* ===============================================================
   🛡️ FAZ 56E — TAKVİM SENKRONİZASYONLARI KARTI
   ===============================================================
   Villa edit ekranına mount edilir. external_calendar_sources
   tablosuna CRUD + manuel sync tetikleme + readonly export URL.

   GÜVENLİK:
     • Tüm RW yalnız authenticated admin (RLS authenticated full CRUD
       — migration 029). Anon erişim YOK.
     • Sync endpoint authorizeAdminCaller arkasında.
     • Source delete HARD değil — is_active=false (audit korunur).
     • ical_url whitelist: yalnız http/https (service sanitize eder).

   AVAILABILITY ETKİSİ:
     SIFIR. FAZ 56C henüz yapılmadı → external event'ler hâlâ
     bloklama yapmıyor. Bu kart yalnız veri ve UI; reservation
     pipeline'a, calendar/booking sidebar'a SIFIR dokunuş.

   ACTIVITY LOG:
     external_calendar_source.created / .deactivated / .reactivated
     fail-safe (logger fail → core flow korunur).
=============================================================== */

const PLATFORMS = [
  "Airbnb",
  "Booking",
  "VRBO",
  "TatilSepeti",
  "Villakolik",
  "Diğer",
] as const;

type PlatformChoice = (typeof PLATFORMS)[number];

type Props = {
  villaId: string;
  villaSlug: string;
  villaTitle?: string | null;
};

export default function IcalSyncCard({
  villaId,
  villaSlug,
  villaTitle,
}: Props) {
  const toast = useNotify();
  const confirm = useConfirm();

  const [sources, setSources] = useState<ExternalCalendarSource[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  /* Add form state */
  const [formPlatform, setFormPlatform] = useState<PlatformChoice>("Airbnb");
  const [formCustomName, setFormCustomName] = useState("");
  const [formUrl, setFormUrl] = useState("");

  /* Export URL — readonly, full absolute. Slug değişirse rebuilt. */
  const exportUrl = useMemo(() => {
    if (typeof window === "undefined") return `/api/ical/villa/${villaSlug}`;
    return `${window.location.origin}/api/ical/villa/${villaSlug}`;
  }, [villaSlug]);

  /* ---------- LOAD ---------- */
  const refresh = useCallback(async () => {
    const { sources: list, eventCounts: counts } =
      await listExternalCalendarSources(villaId);
    setSources(list);
    setEventCounts(counts);
  }, [villaId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /* ---------- COPY ---------- */
  async function handleCopyExportUrl() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(exportUrl);
        toast.success("Export URL kopyalandı", { id: "ical-export-copy" });
      }
    } catch {
      toast.error("Kopyalanamadı", { id: "ical-export-copy" });
    }
  }

  /* ---------- CREATE ---------- */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const resolvedName =
      formPlatform === "Diğer"
        ? formCustomName.trim()
        : (formPlatform as string);
    if (!resolvedName) {
      toast.error("Platform adı gerekli", { id: "ical-source-create" });
      return;
    }
    if (!formUrl.trim()) {
      toast.error("iCal URL gerekli", { id: "ical-source-create" });
      return;
    }
    setSaving(true);
    try {
      const res = await createExternalCalendarSource({
        villa_id: villaId,
        source_name: resolvedName,
        ical_url: formUrl.trim(),
      });
      if (!res.ok) {
        toast.error("Eklenemedi", {
          id: "ical-source-create",
          description: res.error,
        });
        return;
      }
      toast.success("Kaynak eklendi", { id: "ical-source-create" });
      logActivity({
        action: "external_calendar_source.created",
        entity_type: "external_calendar",
        entity_id: res.row.id,
        entity_title:
          res.row.source_name + (villaTitle ? " · " + villaTitle : ""),
        after_data: {
          source_name: res.row.source_name,
          villa_id: villaId,
          ical_url: res.row.ical_url,
        },
      }).catch(() => {});
      setFormPlatform("Airbnb");
      setFormCustomName("");
      setFormUrl("");
      setShowAddForm(false);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  /* ---------- SYNC ---------- */
  async function handleSync(source: ExternalCalendarSource) {
    if (busyId) return;
    setBusyId(source.id);
    try {
      const res = await adminFetch(
        "/api/admin/external-calendars/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: source.id }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        imported?: number;
        deactivated?: number;
        skipped?: number;
        total_seen?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error("Senkronizasyon başarısız", {
          id: `ical-sync-${source.id}`,
          description: json.error || `HTTP ${res.status}`,
        });
        await refresh();
        return;
      }
      toast.success(`${json.imported ?? 0} event senkronize edildi`, {
        id: `ical-sync-${source.id}`,
        description:
          json.deactivated && json.deactivated > 0
            ? `${json.deactivated} eski event pasifleştirildi`
            : undefined,
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      toast.error("Senkronizasyon başarısız", {
        id: `ical-sync-${source.id}`,
        description: msg,
      });
    } finally {
      setBusyId(null);
    }
  }

  /* ---------- TOGGLE / "DELETE" (soft) ---------- */
  async function handleToggleActive(source: ExternalCalendarSource) {
    if (busyId) return;
    const nextActive = !source.is_active;
    if (!nextActive) {
      const ok = await confirm({
        title: "Kaynak pasifleştirilsin mi?",
        description:
          `"${source.source_name}" kaynağı pasif yapılacak. Mevcut event ` +
          "kayıtları silinmez (audit korunur); ileride yeniden aktifleştirebilirsiniz.",
        confirmLabel: "Pasifleştir",
        variant: "danger",
      });
      if (!ok) return;
    }
    setBusyId(source.id);
    try {
      const res = await setExternalCalendarSourceActive(
        source.id,
        nextActive
      );
      if (!res.ok) {
        toast.error("Güncellenemedi", {
          id: `ical-toggle-${source.id}`,
          description: res.error,
        });
        return;
      }
      toast.success(nextActive ? "Aktifleştirildi" : "Pasifleştirildi", {
        id: `ical-toggle-${source.id}`,
      });
      logActivity({
        action: nextActive
          ? "external_calendar_source.reactivated"
          : "external_calendar_source.deactivated",
        entity_type: "external_calendar",
        entity_id: source.id,
        entity_title:
          source.source_name + (villaTitle ? " · " + villaTitle : ""),
        before_data: { is_active: source.is_active },
        after_data: { is_active: nextActive },
      }).catch(() => {});
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  /* ---------------- RENDER ---------------- */
  return (
    <section className="card-premium p-6 md:p-8 space-y-6">
      {/* HEADER */}
      <header>
        <div className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))] text-[var(--brand-coral,#FF653F)]"
          >
            <Calendar size={14} strokeWidth={1.75} />
          </span>
          <h2 className="font-display text-xl md:text-2xl text-[var(--color-stone-900)] tracking-[-0.015em]">
            Takvim Senkronizasyonları
          </h2>
        </div>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 leading-relaxed max-w-2xl">
          Airbnb, Booking ve diğer platformlardan rezervasyon bloklarını
          otomatik senkronize edin. Sync sonrası external event'ler audit
          kaydı tutulur. Availability bloklamada kullanım sonraki fazda
          devreye alınacak.
        </p>
      </header>

      {/* EXPORT URL */}
      <div className="rounded-2xl border border-[var(--color-stone-100)] bg-[var(--color-sand-50)] p-4 md:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <LinkIcon size={13} className="text-[var(--brand-coral)]" aria-hidden />
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
            Bu mülk için export URL
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <code
            className="
              flex-1 min-w-0 truncate text-[12.5px] font-mono
              text-[var(--color-stone-700)] bg-white
              border border-[var(--color-stone-200)]
              rounded-lg px-3 py-2
              select-all
            "
            title={exportUrl}
          >
            {exportUrl}
          </code>
          <button
            type="button"
            onClick={handleCopyExportUrl}
            className="
              inline-flex items-center gap-1.5
              rounded-full border border-[var(--color-stone-200)] bg-white
              px-3.5 py-1.5 text-[12.5px] font-medium
              text-[var(--color-stone-700)]
              hover:bg-[var(--color-sand-100)] hover:border-[var(--color-stone-300)]
              transition-[background-color,border-color] shrink-0
            "
            aria-label="Export URL kopyala"
          >
            <Copy size={13} />
            Kopyala
          </button>
        </div>
        <p className="text-[11.5px] text-[var(--color-stone-400)] leading-relaxed">
          Bu URL'i Airbnb/Booking gibi platformlara "iCal import" alanına
          yapıştırın. Yalnız bu villanın rezervasyonları paylaşılır.
        </p>
      </div>

      {/* SOURCE LIST */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="rounded-2xl border border-[var(--color-stone-100)] bg-white p-6 text-center text-[13px] text-[var(--color-stone-500)]">
            Yükleniyor…
          </div>
        ) : sources.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-stone-200)] bg-white p-8 text-center">
            <p className="text-[13px] text-[var(--color-stone-500)]">
              Henüz takvim kaynağı eklenmedi.
            </p>
          </div>
        ) : (
          sources.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              eventCount={eventCounts[s.id] || 0}
              busy={busyId === s.id}
              onSync={() => handleSync(s)}
              onToggleActive={() => handleToggleActive(s)}
            />
          ))
        )}
      </div>

      {/* ADD NEW */}
      {showAddForm ? (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-[var(--color-stone-100)] bg-white p-5 md:p-6 space-y-4"
        >
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
            Yeni Kaynak Ekle
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
                Platform
              </label>
              <select
                value={formPlatform}
                onChange={(e) =>
                  setFormPlatform(e.target.value as PlatformChoice)
                }
                disabled={saving}
                className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] text-[var(--color-stone-900)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {formPlatform === "Diğer" && (
              <div>
                <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
                  Platform Adı
                </label>
                <input
                  type="text"
                  value={formCustomName}
                  onChange={(e) => setFormCustomName(e.target.value)}
                  disabled={saving}
                  placeholder="örn. Holiday Lettings"
                  maxLength={80}
                  className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[11px] tracking-[0.14em] uppercase font-medium text-[var(--color-stone-500)] mb-2">
              iCal URL
            </label>
            <input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              disabled={saving}
              placeholder="https://www.airbnb.com/calendar/ical/...ics"
              maxLength={2000}
              className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white px-3 py-2 text-[13px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none font-mono"
            />
            <p className="text-[11px] text-[var(--color-stone-400)] mt-1.5">
              Platform admin paneline gidip "iCal export" linkini kopyalayın.
              http veya https URL gerekli.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setFormCustomName("");
                setFormUrl("");
              }}
              disabled={saving}
              className="admin-btn-ghost"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="
                inline-flex items-center justify-center gap-1.5
                rounded-full border border-[var(--brand-coral,#FF653F)]/40
                bg-[var(--brand-coral-tint,rgba(255,101,63,0.10))]
                text-[var(--brand-coral-ink,#7a2912)]
                px-3.5 py-1.5 text-[12.5px] font-medium
                hover:bg-[var(--brand-coral-tint,rgba(255,101,63,0.18))]
                hover:border-[var(--brand-coral,#FF653F)]/60
                transition-[background-color,border-color]
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="
            inline-flex items-center gap-1.5
            rounded-full border border-dashed border-[var(--color-stone-300)]
            bg-white text-[var(--color-stone-700)]
            px-4 py-2 text-[13px] font-medium
            hover:border-[var(--brand-coral,#FF653F)]/60
            hover:text-[var(--brand-coral-ink,#7a2912)]
            transition-[border-color,color]
          "
        >
          <Plus size={14} />
          Yeni iCal kaynağı ekle
        </button>
      )}
    </section>
  );
}

/* ===============================================================
   SOURCE ROW
=============================================================== */
function SourceRow({
  source,
  eventCount,
  busy,
  onSync,
  onToggleActive,
}: {
  source: ExternalCalendarSource;
  eventCount: number;
  busy: boolean;
  onSync: () => void;
  onToggleActive: () => void;
}) {
  const isOk =
    !source.last_error && source.last_success_at !== null;
  return (
    <div
      className={
        "rounded-2xl border bg-white p-4 md:p-5 " +
        (source.is_active
          ? "border-[var(--color-stone-100)]"
          : "border-[var(--color-stone-100)] opacity-60")
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] leading-tight">
              {source.source_name}
            </h3>
            <span
              className={
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border " +
                (source.is_active
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-[var(--color-stone-100)] text-[var(--color-stone-500)] border-[var(--color-stone-200)]")
              }
            >
              <span
                aria-hidden
                className={
                  "w-1.5 h-1.5 rounded-full " +
                  (source.is_active ? "bg-emerald-500" : "bg-[var(--color-stone-400)]")
                }
              />
              {source.is_active ? "Aktif" : "Pasif"}
            </span>
            {source.last_error && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border bg-red-50 text-red-700 border-red-200">
                <AlertCircle size={10} />
                Hata
              </span>
            )}
            {isOk && !source.last_error && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 size={10} />
                Sağlıklı
              </span>
            )}
          </div>
          <p className="text-[11.5px] font-mono text-[var(--color-stone-500)] truncate mt-1.5">
            {source.ical_url}
          </p>
          <div className="flex items-center gap-2 flex-wrap mt-2 text-[11.5px] text-[var(--color-stone-500)]">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Calendar size={11} aria-hidden />
              {eventCount} aktif event
            </span>
            <span className="text-[var(--color-stone-300)]">·</span>
            <span className="tabular-nums">
              Son sync: {source.last_synced_at
                ? formatDateTimeTr(source.last_synced_at)
                : "—"}
            </span>
          </div>
          {source.last_error && (
            <p className="text-[11.5px] text-red-700 mt-1.5 break-words">
              {source.last_error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onSync}
            disabled={busy || !source.is_active}
            className="admin-btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Şimdi senkronize et"
            title={
              source.is_active
                ? "Şimdi senkronize et"
                : "Kaynak pasif — önce aktifleştirin"
            }
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCcw size={13} />
            )}
            {busy ? "Senkronize…" : "Senkronize Et"}
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={busy}
            className={
              "admin-btn-ghost " +
              (source.is_active
                ? "!text-amber-700 !border-amber-200 hover:!bg-amber-50"
                : "!text-emerald-700 !border-emerald-200 hover:!bg-emerald-50")
            }
            aria-label={source.is_active ? "Pasifleştir" : "Aktifleştir"}
            title={
              source.is_active
                ? "Pasifleştir (event'ler silinmez)"
                : "Aktifleştir"
            }
          >
            <Power size={13} />
            {source.is_active ? "Pasifleştir" : "Aktifleştir"}
          </button>
        </div>
      </div>
    </div>
  );
}
