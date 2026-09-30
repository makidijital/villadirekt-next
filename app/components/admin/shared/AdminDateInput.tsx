"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

/* ===============================================================
   🛡️ AdminDateInput — admin filter UX için custom date/datetime picker
   ===============================================================
   AMAÇ:
     Native <input type="date"> ve <input type="datetime-local">
     yerine admin design system'iyle uyumlu, light theme, popover
     tabanlı tek bir picker. OS/browser bağımlı dark popup
     görünümünü ortadan kaldırır.

   KAPSAM:
     • mode="date"     → "YYYY-MM-DD" string
     • mode="datetime" → "YYYY-MM-DDTHH:mm" string (HTML datetime-local format)
     • Boş değer = "" (no filter)

   DOKUNULMAYAN (kasıtlı olarak DAHİL EDİLMEDİ):
     • Reservation/manual ReservationCalendar
     • BookingSidebar / AvailabilityInlineCalendar
     • lib/calendar.engine getDayStyle/getDayState
   Bu component RESERVATION availability LOGIC'inden tamamen
   bağımsız — yalnız UI filter picker.

   ÖZELLİKLER:
     • TR locale ay/gün isimleri
     • Pzt başlangıçlı 7×6 grid
     • Bugün vurgusu
     • Seçili gün vurgusu (champagne ring)
     • datetime modunda HH/mm dual input
     • Clear (X) butonu
     • Click-outside + ESC ile kapanır
     • Keyboard: nav butonlarıyla ay değiştirme
=============================================================== */

export type AdminDateInputMode = "date" | "datetime";

type Props = {
  value: string; // "" | "YYYY-MM-DD" | "YYYY-MM-DDTHH:mm"
  onChange: (v: string) => void;
  mode?: AdminDateInputMode;
  placeholder?: string;
  ariaLabel?: string;
  /** 🛡️ OPSİYONEL üst sınır — "YYYY-MM-DD". Verilirse bu günden SONRAKİ
   *  günler grid'de pasifleşir. Verilmezse davranış ÖNCEKİYLE BİREBİR
   *  AYNI (mevcut çağıranlar etkilenmez). UI kolaylığı; asıl doğrulama
   *  her zaman service katmanındadır. */
  maxDate?: string;
};

const TR_MONTHS_LONG = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
] as const;

const TR_MONTHS_SHORT = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
] as const;

const WEEKDAY_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

/* ── String <-> Date helpers (LOCAL midnight; UTC drift yok) ── */
function parseLocalYmd(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out = new Date(y, mo, d);
  if (Number.isNaN(out.getTime())) return null;
  return out;
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseHm(s: string): { hh: number; mm: number } {
  if (!s) return { hh: 0, mm: 0 };
  const m = /T(\d{2}):(\d{2})/.exec(s);
  if (!m) return { hh: 0, mm: 0 };
  return {
    hh: Math.max(0, Math.min(23, Number(m[1]) || 0)),
    mm: Math.max(0, Math.min(59, Number(m[2]) || 0)),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/* ── Grid builder — Pzt başlangıçlı 7×6 ── */
type GridCell = { date: Date; inMonth: boolean };

function buildMonthGrid(viewMonth: Date): GridCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstDow = (first.getDay() + 6) % 7;
  const lastDow = (last.getDay() + 6) % 7;
  const cells: GridCell[] = [];
  for (let i = firstDow; i > 0; i--) {
    cells.push({ date: new Date(year, month, 1 - i), inMonth: false });
  }
  for (let day = 1; day <= last.getDate(); day++) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  const trailing = 6 - lastDow;
  for (let i = 1; i <= trailing; i++) {
    cells.push({ date: new Date(year, month + 1, i), inMonth: false });
  }
  while (cells.length < 42) {
    const tail = cells[cells.length - 1].date;
    cells.push({
      date: new Date(tail.getFullYear(), tail.getMonth(), tail.getDate() + 1),
      inMonth: false,
    });
  }
  return cells.slice(0, 42);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default function AdminDateInput({
  value,
  onChange,
  mode = "date",
  placeholder = "Seç…",
  ariaLabel,
  maxDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* Selected date + time parsed from `value` */
  const selectedDate = useMemo(() => parseLocalYmd(value), [value]);
  const selectedTime = useMemo(
    () => (mode === "datetime" ? parseHm(value) : { hh: 0, mm: 0 }),
    [value, mode]
  );

  /* currentMonth — popover ay anchor'ı; her açılışta value veya bugün */
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const base = selectedDate || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  /* Açılışta currentMonth'u sync'le (value harici değişirse). */
  useEffect(() => {
    if (open) {
      const base = selectedDate || new Date();
      setCurrentMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    }
  }, [open, selectedDate]);

  /* Click-outside + ESC ile kapan. */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Display string for trigger button. */
  const displayValue = useMemo(() => {
    if (!selectedDate) return "";
    const d = selectedDate;
    const datePart = `${pad2(d.getDate())} ${TR_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    if (mode === "datetime") {
      return `${datePart} · ${pad2(selectedTime.hh)}:${pad2(selectedTime.mm)}`;
    }
    return datePart;
  }, [selectedDate, selectedTime, mode]);

  /* Day click handler — emit composed string. */
  const handlePickDay = useCallback(
    (d: Date) => {
      const ymd = formatYmd(d);
      if (mode === "datetime") {
        const hh = pad2(selectedTime.hh);
        const mm = pad2(selectedTime.mm);
        onChange(`${ymd}T${hh}:${mm}`);
        /* datetime modunda popover'ı açık tut → kullanıcı saati ayarlasın. */
      } else {
        onChange(ymd);
        setOpen(false);
      }
    },
    [mode, onChange, selectedTime.hh, selectedTime.mm]
  );

  /* Time change handler — yalnız datetime mode. */
  const handleTimeChange = useCallback(
    (hh: number, mm: number) => {
      const safeH = Math.max(0, Math.min(23, hh));
      const safeM = Math.max(0, Math.min(59, mm));
      if (!selectedDate) return;
      const ymd = formatYmd(selectedDate);
      onChange(`${ymd}T${pad2(safeH)}:${pad2(safeM)}`);
    },
    [onChange, selectedDate]
  );

  const handleClear = useCallback(() => {
    onChange("");
    setOpen(false);
  }, [onChange]);

  const handleToday = useCallback(() => {
    const t = new Date();
    setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  }, []);

  const todayKey = new Date().toDateString();

  return (
    <div ref={wrapRef} className="relative">
      {/* TRIGGER — input look-alike, admin design system spacing/radius */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={ariaLabel || placeholder}
        className={`
          w-full flex items-center gap-2
          rounded-xl border border-[var(--color-stone-200)] bg-white
          px-3 py-2 text-[13px]
          ${displayValue ? "text-[var(--color-stone-900)]" : "text-[var(--color-stone-400)]"}
          hover:border-[var(--color-stone-300)]
          focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none
          transition
        `}
      >
        <CalendarIcon
          size={13}
          className="text-[var(--color-stone-400)] shrink-0"
          aria-hidden
        />
        <span className="flex-1 min-w-0 truncate text-left">
          {displayValue || placeholder}
        </span>
        {displayValue && (
          <span
            role="button"
            aria-label="Temizle"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-[var(--color-stone-100)] text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] transition"
            title="Temizle"
          >
            <X size={11} />
          </span>
        )}
      </button>

      {/* POPOVER */}
      {open && (
        <div
          className="absolute left-0 z-[60] mt-2 w-[300px] max-w-[calc(100vw-1rem)] rounded-2xl border border-[var(--color-stone-100)] bg-white p-3 shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)]"
          role="dialog"
          aria-label="Tarih seç"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              onClick={() =>
                setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                )
              }
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--color-sand-50)] transition"
              aria-label="Önceki ay"
            >
              <ChevronLeft size={14} className="text-[var(--color-stone-600)]" />
            </button>
            <div className="flex items-center gap-2">
              <h4 className="font-display text-[13px] text-[var(--color-stone-900)] tracking-[-0.015em] capitalize">
                {TR_MONTHS_LONG[currentMonth.getMonth()]}
                <span className="text-[var(--color-stone-400)] font-normal ml-1">
                  {currentMonth.getFullYear()}
                </span>
              </h4>
              <button
                type="button"
                onClick={handleToday}
                className="px-2 py-0.5 rounded-md text-[10px] tracking-[0.12em] uppercase font-medium text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition"
              >
                Bugün
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                setCurrentMonth(
                  (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                )
              }
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--color-sand-50)] transition"
              aria-label="Sonraki ay"
            >
              <ChevronRight size={14} className="text-[var(--color-stone-600)]" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5 mb-1">
            {WEEKDAY_HEADERS.map((w) => (
              <div
                key={w}
                className="text-center text-[9px] font-bold tracking-[0.14em] uppercase text-[var(--color-stone-400)] py-1"
              >
                {w[0]}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {buildMonthGrid(currentMonth).map((cell, i) => {
              const isAfterMax = maxDate
                ? formatYmd(cell.date) > maxDate
                : false;
              const isInMonth = cell.inMonth && !isAfterMax;
              const isToday = cell.date.toDateString() === todayKey;
              const isSelected = selectedDate
                ? sameDay(cell.date, selectedDate)
                : false;
              const baseStyle: CSSProperties = {
                cursor: isInMonth ? "pointer" : "default",
              };
              return (
                <button
                  type="button"
                  key={`${i}-${cell.date.toDateString()}`}
                  onClick={() => isInMonth && handlePickDay(cell.date)}
                  disabled={!isInMonth}
                  style={baseStyle}
                  className={`
                    aspect-square flex items-center justify-center rounded-md text-[11.5px] font-medium
                    ${!isInMonth ? "text-[var(--color-stone-300)]" : ""}
                    ${isInMonth && !isSelected ? "text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]" : ""}
                    ${isSelected ? "bg-[rgba(200,155,60,0.20)] text-[var(--color-stone-900)] ring-2 ring-[var(--color-champagne-500,#c89b3c)]" : ""}
                    ${isToday && !isSelected ? "ring-1 ring-[var(--color-champagne-500,#c89b3c)]" : ""}
                    transition
                  `}
                  tabIndex={isInMonth ? 0 : -1}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time row — yalnız datetime mode. */}
          {mode === "datetime" && (
            <div className="mt-3 pt-3 border-t border-[var(--color-stone-100)] flex items-center justify-between gap-2">
              <span className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                Saat
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={selectedDate ? selectedTime.hh : ""}
                  disabled={!selectedDate}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    handleTimeChange(n, selectedTime.mm);
                  }}
                  className="w-12 rounded-md border border-[var(--color-stone-200)] bg-white px-2 py-1 text-[12.5px] text-center tabular-nums focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none disabled:opacity-50"
                  aria-label="Saat"
                />
                <span className="text-[var(--color-stone-400)] tabular-nums">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={selectedDate ? selectedTime.mm : ""}
                  disabled={!selectedDate}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    handleTimeChange(selectedTime.hh, n);
                  }}
                  className="w-12 rounded-md border border-[var(--color-stone-200)] bg-white px-2 py-1 text-[12.5px] text-center tabular-nums focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none disabled:opacity-50"
                  aria-label="Dakika"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-[var(--color-stone-100)] flex items-center justify-between">
            <button
              type="button"
              onClick={handleClear}
              disabled={!displayValue}
              className="text-[11px] tracking-[0.08em] uppercase font-medium text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 rounded-md text-[11px] tracking-[0.08em] uppercase font-medium text-white bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)] transition"
            >
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
