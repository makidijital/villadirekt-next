"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X, Check } from "lucide-react";
/* 🐛 FIX — /maki-admin/villas aramasıyla BİREBİR aynı Türkçe-tolerant
   normalizasyon. Aynı helper (lib/search) hem sunucu villa aramasında
   (buildVillaSearchOrClause) hem villa-listesi client filtresinde kullanılıyor. */
import { normalizeSearchText } from "@/lib/search";

/* ===============================================================
   🛡️ VillaCombobox — searchable villa picker
   ===============================================================
   ManualReservationForm'daki native `<select>` yerine kullanılır.
   Davranış:
     - Trigger: `input` class (mevcut form select görsel paritesi).
     - Popover içinde arama inputu (title + slug üzerinde lowercase
       includes).
     - Klavye: ↑/↓ highlight, Enter seç, Escape kapat.
     - Outside click + Escape → kapat.
     - 5000+ villa için defansif: filtrelenen listeden ilk 200 item
       render edilir; aşan sayı footer'da bildirilir (UX hint).

   ⚠️ KESİN SINIRLAR:
     - API/DB/veri modeli değişmez.
     - Seçim sonrası onChange(id) çağrılır; parent state yönetimi
       eski `<select>` ile birebir aynı.
     - Yeni dependency YOK; mevcut lucide-react ikonları + Tailwind.
=============================================================== */

type VillaOption = {
  id: string;
  title: string | null;
  slug?: string | null;
};

type Props = {
  villas: VillaOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Hata vurgusu — native select'in `!border-red-500` paritesi. */
  error?: boolean;
};

const MAX_RENDERED = 200;

export default function VillaCombobox({
  villas,
  value,
  onChange,
  disabled,
  placeholder = "Mülk seç",
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* Seçili villa label'ı */
  const selected = useMemo(
    () => villas.find((v) => v.id === value) || null,
    [villas, value]
  );

  /* Filtreli liste — title + slug, Türkçe-tolerant normalize includes
     (/maki-admin/villas ile birebir aynı: normalizeSearchText). */
  const filtered = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return villas;
    return villas.filter((v) => {
      const haystack = normalizeSearchText(
        (v.title || "") + " " + (v.slug || "")
      );
      return haystack.includes(q);
    });
  }, [villas, query]);

  /* Defansif render slice — 5000+ villa varsa DOM patlamasın. */
  const rendered = filtered.slice(0, MAX_RENDERED);
  const overflow = filtered.length - rendered.length;

  /* Açıldığında yalnız inputa fokus (state init trigger onClick'inde). */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const openPicker = () => {
    const idx = value
      ? Math.max(
          0,
          filtered.findIndex((v) => v.id === value)
        )
      : 0;
    setHighlight(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  /* Outside click + Escape close. */
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Highlight değişince scroll'u görünür tut. */
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) =>
        rendered.length === 0 ? 0 : Math.min(h + 1, rendered.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = rendered[highlight];
      if (pick) choose(pick.id);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {/* TRIGGER — input class ile mevcut form paritesi */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          "input flex items-center justify-between w-full text-left disabled:opacity-60 disabled:cursor-not-allowed " +
          (error ? "!border-red-500" : "")
        }
      >
        <span
          className={
            selected
              ? "truncate text-[var(--color-stone-900)]"
              : "truncate text-[var(--color-stone-400)]"
          }
        >
          {selected?.title || placeholder}
        </span>
        <ChevronDown
          size={14}
          className={
            "shrink-0 ml-2 text-[var(--color-stone-400)] transition-transform motion-reduce:transition-none " +
            (open ? "rotate-180" : "")
          }
          aria-hidden="true"
        />
      </button>

      {/* POPOVER — akış içinde (absolute YOK):
            Dropdown normal block olarak yer kaplar; takvim ve diğer
            kardeş bloklar doğal olarak aşağı kayar. Üst üste çakışma
            kategorik olarak ortadan kalkar. */}
      {open && (
        <div
          className="
            mt-1.5 w-full
            rounded-2xl border border-[var(--color-stone-200)]
            bg-white shadow-[0_18px_44px_-24px_rgba(27,26,23,0.18)]
            overflow-hidden
          "
          role="listbox"
        >
          {/* SEARCH */}
          <div className="px-3 pt-3 pb-2 border-b border-[var(--color-stone-100)]">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-stone-400)]"
                aria-hidden
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onKeyDownInput}
                placeholder="Mülk adı veya slug ara…"
                className="w-full rounded-xl border border-[var(--color-stone-200)] bg-white pl-9 pr-9 py-2 text-[13px] text-[var(--color-stone-900)] placeholder:text-[var(--color-stone-400)] focus:border-[var(--brand-coral)] focus:shadow-[0_0_0_3px_rgba(255,101,63,0.18)] outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setHighlight(0);
                  }}
                  aria-label="Aramayı temizle"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full inline-flex items-center justify-center text-[var(--color-stone-400)] hover:text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* LIST */}
          <div
            ref={listRef}
            className="max-h-72 overflow-y-auto py-1"
          >
            {rendered.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-[var(--color-stone-400)]">
                Eşleşen mülk yok.
              </p>
            ) : (
              rendered.map((v, i) => {
                const isSelected = v.id === value;
                const isHl = i === highlight;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-idx={i}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(v.id)}
                    className={
                      "w-full text-left flex items-center justify-between gap-2 px-4 py-2 text-[13.5px] transition-colors motion-reduce:transition-none " +
                      (isHl
                        ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                        : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]")
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {v.title || "—"}
                      </span>
                      {v.slug && (
                        <span className="block truncate text-[11px] text-[var(--color-stone-400)] font-mono">
                          /{v.slug}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check
                        size={14}
                        className="text-[var(--color-champagne-700)] shrink-0"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })
            )}

            {overflow > 0 && (
              <p className="px-4 py-2 text-[11px] text-[var(--color-stone-400)] border-t border-[var(--color-stone-100)] text-center">
                + {overflow} sonuç daha · aramayı daraltın
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
