"use client";

import { useState } from "react";
import { LogIn, LogOut, ChevronDown, Users } from "lucide-react";

import type {
  OperationsSnapshot,
  OperationsCounts,
  OperationsLists,
  OperationCategoryKey,
  OperationItem,
  OperationStatus,
} from "@/app/services/operations.service";

/* ===============================================================
   🏨 UpcomingOperations — admin dashboard operasyon paneli
   ===============================================================
   Yaklaşan villa check-in / check-out hareketleri. Üst tarafta
   count pill'leri (Bugün / Yarın / 7 Gün), tıklayınca alt panel
   inline accordion olarak detay listesi açar.

   ARCH:
     - Client component — sadece expanded state için, server'dan
       hazır snapshot prop ile gelir. Veri fetch YOK.
     - Tek session-state: `expanded: OperationCategoryKey | null`.
       Aynı pill ikinci kez tıklanırsa kapanır.

   GÖRSEL:
     - 2 kolon: [Girişler] [Çıkışlar]
     - Mobile stack (md altında tek kolon)
     - Yeşil ton = girişler, amber ton = çıkışlar
     - Pill = button (cursor pointer, focus-visible ring,
       expanded'de güçlü border + ChevronDown rotate)
     - Liste — max-h scroll, item başına villa + misafir +
       tarih + kişi + status badge
   =============================================================== */

export default function UpcomingOperations({
  snapshot,
}: {
  snapshot: OperationsSnapshot;
}) {
  const [expanded, setExpanded] = useState<OperationCategoryKey | null>(null);

  function toggle(key: OperationCategoryKey) {
    setExpanded((cur) => (cur === key ? null : key));
  }

  return (
    <section className="admin-card-flat overflow-hidden">
      <div className="admin-card__header">
        <div>
          <h3 className="admin-card__title">Yaklaşan Operasyonlar</h3>
          <p className="admin-card__sub">
            Yaklaşan mülk giriş ve çıkış hareketleri
          </p>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GİRİŞLER — yeşil ton */}
        <OperationsCard
          tone="checkin"
          title="Girişler"
          subtitle="Yaklaşan check-in hareketleri"
          icon={<LogIn size={16} />}
          counts={snapshot.counts}
          items={snapshot.items}
          expanded={expanded}
          onToggle={toggle}
          pillKeys={{
            today: "checkinToday",
            tomorrow: "checkinTomorrow",
            next7: "checkinNext7Days",
          }}
          dateMode="start"
        />

        {/* ÇIKIŞLAR — amber ton */}
        <OperationsCard
          tone="checkout"
          title="Çıkışlar"
          subtitle="Yaklaşan check-out hareketleri"
          icon={<LogOut size={16} />}
          counts={snapshot.counts}
          items={snapshot.items}
          expanded={expanded}
          onToggle={toggle}
          pillKeys={{
            today: "checkoutToday",
            tomorrow: "checkoutTomorrow",
            next7: "checkoutNext7Days",
          }}
          dateMode="end"
        />
      </div>
    </section>
  );
}

/* ===============================================================
   TONE & STYLE TABLES
   =============================================================== */
type Tone = "checkin" | "checkout";

const TONE_STYLES: Record<
  Tone,
  {
    border: string;
    bg: string;
    iconWrap: string;
    pillBorderIdle: string;
    pillBorderActive: string;
    pillBgActive: string;
    pillRingActive: string;
    valueText: string;
  }
> = {
  checkin: {
    border: "border-emerald-100",
    bg: "bg-emerald-50/40",
    iconWrap: "bg-emerald-100 text-emerald-700",
    pillBorderIdle: "border-emerald-100",
    pillBorderActive: "border-emerald-300",
    pillBgActive: "bg-emerald-50",
    pillRingActive: "ring-emerald-200/60",
    valueText: "text-emerald-700",
  },
  checkout: {
    border: "border-amber-100",
    bg: "bg-amber-50/40",
    iconWrap: "bg-amber-100 text-amber-700",
    pillBorderIdle: "border-amber-100",
    pillBorderActive: "border-amber-300",
    pillBgActive: "bg-amber-50",
    pillRingActive: "ring-amber-200/60",
    valueText: "text-amber-700",
  },
};

/* ===============================================================
   OperationsCard — bir taraf (girişler veya çıkışlar)
   =============================================================== */
function OperationsCard({
  tone,
  title,
  subtitle,
  icon,
  counts,
  items,
  expanded,
  onToggle,
  pillKeys,
  dateMode,
}: {
  tone: Tone;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  counts: OperationsCounts;
  items: OperationsLists;
  expanded: OperationCategoryKey | null;
  onToggle: (key: OperationCategoryKey) => void;
  pillKeys: {
    today: OperationCategoryKey;
    tomorrow: OperationCategoryKey;
    next7: OperationCategoryKey;
  };
  dateMode: "start" | "end";
}) {
  const s = TONE_STYLES[tone];

  /* Bu kartın aktif pill'i (varsa) — yalnız kendi 3 pill'ini izle. */
  const activeKey =
    expanded === pillKeys.today ||
    expanded === pillKeys.tomorrow ||
    expanded === pillKeys.next7
      ? expanded
      : null;
  const activeList = activeKey ? items[activeKey] : null;

  return (
    <div
      className={`rounded-2xl border ${s.border} ${s.bg} p-5 flex flex-col`}
    >
      <header className="flex items-start gap-3">
        <span
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.iconWrap}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-[var(--admin-text)]">
            {title}
          </h4>
          <p className="text-[12px] text-[var(--admin-muted-2)] mt-0.5">
            {subtitle}
          </p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatPill
          tone={tone}
          label="Bugün"
          value={counts[pillKeys.today]}
          isActive={expanded === pillKeys.today}
          onClick={() => onToggle(pillKeys.today)}
        />
        <StatPill
          tone={tone}
          label="Yarın"
          value={counts[pillKeys.tomorrow]}
          isActive={expanded === pillKeys.tomorrow}
          onClick={() => onToggle(pillKeys.tomorrow)}
        />
        <StatPill
          tone={tone}
          label="7 Gün"
          value={counts[pillKeys.next7]}
          isActive={expanded === pillKeys.next7}
          onClick={() => onToggle(pillKeys.next7)}
        />
      </div>

      {/* EXPANDABLE LIST PANEL */}
      {activeKey && activeList && (
        <OperationsList
          tone={tone}
          items={activeList}
          dateMode={dateMode}
        />
      )}
    </div>
  );
}

/* ===============================================================
   StatPill — tıklanabilir count pill
   =============================================================== */
function StatPill({
  tone,
  label,
  value,
  isActive,
  onClick,
}: {
  tone: Tone;
  label: string;
  value: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const s = TONE_STYLES[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isActive}
      className={
        "group relative rounded-xl border bg-white px-3 py-3 text-center " +
        "transition-all duration-150 " +
        "focus:outline-none focus-visible:ring-2 " +
        "cursor-pointer " +
        (isActive
          ? `${s.pillBorderActive} ${s.pillBgActive} ring-2 ${s.pillRingActive}`
          : `${s.pillBorderIdle} hover:shadow-sm`)
      }
    >
      <p className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-[22px] leading-none tabular-nums ${s.valueText}`}
      >
        {value}
      </p>
      <ChevronDown
        size={12}
        aria-hidden
        className={
          "absolute top-1.5 right-1.5 text-[var(--admin-muted-2)] " +
          "transition-transform duration-200 " +
          (isActive ? "rotate-180" : "rotate-0")
        }
      />
    </button>
  );
}

/* ===============================================================
   OperationsList — aktif pill için inline detay listesi
   =============================================================== */
function OperationsList({
  tone,
  items,
  dateMode,
}: {
  tone: Tone;
  items: ReadonlyArray<OperationItem>;
  dateMode: "start" | "end";
}) {
  const s = TONE_STYLES[tone];

  if (items.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-[var(--admin-border)] bg-white/70 px-4 py-5 text-center">
        <p className="text-[13px] text-[var(--admin-muted-2)]">
          Bu kategoride hareket yok.
        </p>
      </div>
    );
  }

  return (
    <ul
      className={
        "mt-4 rounded-xl border bg-white divide-y divide-[var(--admin-border)] " +
        "max-h-[280px] overflow-y-auto " +
        s.pillBorderIdle
      }
    >
      {items.map((it) => (
        <li
          key={it.id}
          className="px-3.5 py-3 flex items-start gap-3 min-w-0"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-[var(--admin-text)] truncate">
              {it.villaTitle || "Mülk adı yok"}
            </p>
            <p className="text-[12px] text-[var(--admin-muted)] truncate mt-0.5">
              {it.guestName || "İsimsiz misafir"}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-[var(--admin-muted-2)] flex-wrap">
              <span className="tabular-nums">
                {formatTrShort(dateMode === "start" ? it.startDate : it.endDate)}
              </span>
              {typeof it.guests === "number" && it.guests > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users size={11} />
                  {it.guests}
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={it.status} />
        </li>
      ))}
    </ul>
  );
}

/* ===============================================================
   StatusBadge — pending / confirmed
   =============================================================== */
function StatusBadge({ status }: { status: OperationStatus }) {
  const map: Record<
    OperationStatus,
    { label: string; cls: string }
  > = {
    pending: { label: "Bekliyor", cls: "admin-badge--pending" },
    confirmed: { label: "Onaylandı", cls: "admin-badge--confirmed" },
  };
  const conf = map[status];
  return (
    <span className={`admin-badge ${conf.cls} shrink-0 mt-0.5`}>
      <span className="admin-badge__dot" />
      {conf.label}
    </span>
  );
}

/* ===============================================================
   HELPERS
   =============================================================== */

const TR_MONTHS_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
] as const;

/* YYYY-MM-DD → "13 May". TZ-safe: string parse, Date'e geçmiyor. */
function formatTrShort(iso: string): string {
  if (!iso) return "-";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (
    !Number.isFinite(monthIdx) ||
    monthIdx < 0 ||
    monthIdx > 11 ||
    !Number.isFinite(day)
  )
    return iso;
  const monthLabel = TR_MONTHS_SHORT[monthIdx];
  return `${String(day).padStart(2, "0")} ${monthLabel}`;
}
