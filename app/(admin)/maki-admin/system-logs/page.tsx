"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listMailLogsAction as listMailLogs,
} from "./system-logs.action";
import type { MailLog } from "@/app/services/mail-log.service";
import {
  Activity,
  Search,
  RefreshCw,
  Mail,
  CheckCircle2,
  AlertCircle,
  Inbox,
  ChevronDown,
} from "lucide-react";

import MailLogsCard from "@/app/(admin)/maki-admin/settings/_components/MailLogsCard";

/* ===============================================================
   🔥 MAIL MERKEZİ — /maki-admin/system-logs
   ===============================================================
   - mail_logs üzerinden read-only operations dashboard
   - Stats: total / sent / failed / success rate
   - Filters: all / sent / failed / test / reservation_*
   - Search: recipient, subject, mail_type, error_message
   - Expandable diagnostics: error_message + raw fields
   - İş mantığına dokunmaz; sadece monitoring.
   =============================================================== */

type FilterKey =
  | "all"
  | "sent"
  | "failed"
  | "test"
  | "reservation_request"
  | "reservation_approved"
  | "reservation_cancelled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "sent", label: "Gönderildi" },
  { key: "failed", label: "Başarısız" },
  { key: "test", label: "Test" },
  { key: "reservation_request", label: "Talep" },
  { key: "reservation_approved", label: "Onay" },
  { key: "reservation_cancelled", label: "İptal" },
];

/* 🛡️ Central helper (manual UTC→Istanbul math, Intl-bypass-proof). */
import { formatDateTimeTr } from "@/lib/date-format";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

function formatDateTime(value?: string) {
  return formatDateTimeTr(value);
}

function relativeTime(value?: string) {
  if (!value) return "";
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} sn önce`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  return `${day} gün önce`;
}

function mailTypeLabel(t?: string | null) {
  switch (t) {
    case "test":
      return "Test";
    case "reservation_request":
      return "Talep";
    case "reservation_approved":
      return "Onay";
    case "reservation_cancelled":
      return "İptal";
    default:
      return t || "—";
  }
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<MailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    const data = await listMailLogs(200);
    setLogs(data || []);
    if (initial) setLoading(false);
    else setRefreshing(false);
  }

  useEffect(() => {
    load(true);
  }, []);

  /* ----- STATS ----- */
  const stats = useMemo(() => {
    const total = logs.length;
    const sent = logs.filter((l) => l.status === "sent").length;
    const failed = logs.filter((l) => l.status === "failed").length;
    const rate = total > 0 ? Math.round((sent / total) * 100) : 0;
    return { total, sent, failed, rate };
  }, [logs]);

  /* ----- FILTERED ----- */
  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return logs.filter((l) => {
      // status filter
      if (filter === "sent" && l.status !== "sent") return false;
      if (filter === "failed" && l.status !== "failed") return false;
      // mail_type filter
      if (
        ["test", "reservation_request", "reservation_approved", "reservation_cancelled"].includes(
          filter
        ) &&
        l.mail_type !== filter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        normalizeSearchText(l.recipient || "").includes(q) ||
        normalizeSearchText(l.subject || "").includes(q) ||
        normalizeSearchText(l.mail_type || "").includes(q) ||
        normalizeSearchText(l.error_message || "").includes(q)
      );
    });
  }, [logs, filter, search]);

  return (
    <div className="space-y-10 w-full">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Sistem</p>
          <h1 className="admin-page-header__title flex items-center gap-2.5">
            <Activity
              size={22}
              className="text-[var(--admin-accent-strong)]"
            />
            Mail Merkezi
          </h1>
          <p className="admin-page-header__sub">
            Tüm transactional mailler buradan izlenir. Status, mail tipi,
            recipient ve diagnostik bilgiler tek workspace&apos;te.
          </p>
        </div>

        <div className="admin-page-header__actions">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing}
            className="admin-btn-ghost"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Yenile
          </button>
        </div>
      </header>

      {/* KPI STATS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard
          label="Toplam"
          value={stats.total}
          icon={Inbox}
        />
        <StatCard
          label="Gönderildi"
          value={stats.sent}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Başarısız"
          value={stats.failed}
          icon={AlertCircle}
          tone="danger"
        />
        <StatCard
          label="Başarı Oranı"
          value={`%${stats.rate}`}
          icon={Mail}
          tone={stats.rate >= 95 ? "success" : stats.rate >= 80 ? "warn" : "danger"}
        />
      </section>

      {/* 🛡️ FAZ 54B — MAIL LOG MAINTENANCE BAR
          KPI grid (yukarıda, son 200 log üzerinden filter-aware
          metrikler) ile filter/search bar arasında compact bakım
          paneli. True DB count'larıyla (service-role) ve 30d/all
          cleanup aksiyonlarıyla. listMailLogs(200) ile aynı tabloyu
          okur ama farklı bir scope sunar — confliction yok. */}
      <MailLogsCard />

      {/* FILTERS + SEARCH (sticky) */}
      <div className="sticky top-[64px] z-20">
        <div className="admin-filter-bar shadow-[0_2px_8px_-4px_rgb(15_23_42_/_0.08)]">
          <div className="admin-pill-search">
            <Search
              size={14}
              className="text-[var(--admin-muted-2)]"
            />
            <input
              placeholder="Alıcı, konu, mail tipi veya hata mesajı ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                    active
                      ? "bg-[var(--admin-text)] text-white border-[var(--admin-text)]"
                      : "bg-[var(--admin-surface)] text-[var(--admin-muted)] border-[var(--admin-border)] hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-text)]"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <span className="text-[12px] text-[var(--admin-muted-2)] px-2 ml-auto">
            {filtered.length} kayıt
          </span>
        </div>
      </div>

      {/* LOG TABLE */}
      {loading && (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted)]">
          Yükleniyor…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="admin-card-flat p-14 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <Activity
              size={18}
              className="text-[var(--admin-muted)]"
            />
          </div>
          <h3 className="font-display text-[20px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Kayıt bulunamadı
          </h3>
          <p className="text-[var(--admin-muted-2)] text-sm mt-2 max-w-sm mx-auto">
            Filtre veya arama kriterlerini değiştirmeyi dene. İlk test mail
            gönderildiğinde burada görünecek.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="admin-table">
          {filtered.map((l) => {
            const id = l.id || `${l.created_at}-${l.recipient}`;
            const isOpen = openId === id;
            const sent = l.status === "sent";

            return (
              <div key={id}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : id)}
                  className="admin-row w-full text-left"
                >
                  {/* STATUS DOT */}
                  <span
                    aria-hidden="true"
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                      sent
                        ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                        : "bg-rose-50 border-rose-200 text-rose-600"
                    }`}
                  >
                    {sent ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <AlertCircle size={15} />
                    )}
                  </span>

                  {/* RECIPIENT + SUBJECT */}
                  <div className="min-w-0 flex-[1.4]">
                    <p className="text-[14px] font-semibold text-[var(--admin-text)] truncate leading-tight">
                      {l.recipient || "—"}
                    </p>
                    <p className="text-[12px] text-[var(--admin-muted)] truncate mt-0.5">
                      {l.subject || "—"}
                    </p>
                  </div>

                  {/* TYPE */}
                  <div className="hidden md:block min-w-0 shrink-0">
                    <span className="admin-badge admin-badge--info">
                      {mailTypeLabel(l.mail_type)}
                    </span>
                  </div>

                  {/* STATUS */}
                  <div className="hidden lg:block shrink-0">
                    <span
                      className={`admin-badge ${
                        sent
                          ? "admin-badge--confirmed"
                          : "admin-badge--rejected"
                      }`}
                    >
                      <span className="admin-badge__dot" />
                      {sent ? "Gönderildi" : "Başarısız"}
                    </span>
                  </div>

                  {/* PROVIDER */}
                  <div className="hidden xl:block text-[12px] text-[var(--admin-muted-2)] shrink-0 min-w-[80px]">
                    {l.provider || "—"}
                  </div>

                  {/* TIME */}
                  <div className="text-right shrink-0 min-w-[140px]">
                    <p className="text-[12.5px] text-[var(--admin-text)] tabular-nums">
                      {relativeTime(l.created_at)}
                    </p>
                    <p className="text-[11px] text-[var(--admin-muted-2)] mt-0.5">
                      {formatDateTime(l.created_at)}
                    </p>
                  </div>

                  {/* CHEVRON */}
                  <ChevronDown
                    size={16}
                    className={`text-[var(--admin-muted-2)] shrink-0 transition ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* EXPANDED */}
                {isOpen && (
                  <div className="px-[18px] pb-5 pt-1 border-b border-[var(--admin-border)] bg-[var(--admin-bg-soft)]/60">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DiagRow label="Alıcı" value={l.recipient} />
                      <DiagRow
                        label="Mail tipi"
                        value={mailTypeLabel(l.mail_type)}
                      />
                      <DiagRow label="Konu" value={l.subject} />
                      <DiagRow label="Sağlayıcı" value={l.provider} />
                      <DiagRow
                        label="Rezervasyon ID"
                        value={l.reservation_id || "—"}
                      />
                      <DiagRow
                        label="Oluşturulma"
                        value={formatDateTime(l.created_at)}
                      />
                    </div>

                    {!sent && l.error_message && (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                        <p className="text-[11px] tracking-[0.08em] uppercase font-semibold text-rose-700 mb-1">
                          Hata mesajı
                        </p>
                        <pre className="text-[12.5px] text-rose-900 whitespace-pre-wrap break-words leading-relaxed">
{l.error_message}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========================================================== */

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  icon: any;
  tone?: "neutral" | "success" | "warn" | "danger";
}) {
  const toneClass = {
    neutral: "",
    success: "text-emerald-600",
    warn: "text-amber-600",
    danger: "text-rose-600",
  }[tone];

  return (
    <div className="admin-stat">
      <div>
        <p className="admin-stat__label">{label}</p>
        <h2 className={`admin-stat__value ${toneClass}`}>{value}</h2>
      </div>
      <span className="admin-stat__icon">
        <Icon size={16} />
      </span>
    </div>
  );
}

function DiagRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <p className="text-[10.5px] tracking-[0.12em] uppercase font-semibold text-[var(--admin-muted-2)]">
        {label}
      </p>
      <p className="text-[13px] text-[var(--admin-text)] mt-1 break-all">
        {value || "—"}
      </p>
    </div>
  );
}
