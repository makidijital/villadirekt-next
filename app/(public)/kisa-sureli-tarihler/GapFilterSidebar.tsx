"use client";

/* ===============================================================
   🛡️ KISA SÜRELİ TARİHLER — FILTER SIDEBAR (CLIENT ISLAND)
   ===============================================================
   /arama'nın FilterSidebar'ının GÖRSEL/UX REPLİKASI. Aynı panel,
   FilterGroup accordion, region grouping, CounterRow, checkbox/buton
   stilleri ve mobil bottom-drawer davranışı. FARKLAR:
     - TARİH grubu YOK (DatePicker / check-in / check-out / takvim yok).
     - buildHref → `/arama` yerine `basePath` (aktif gap route).
     - Yalnız Villa Tipi + Bölge/Alt Bölge + Kişi Sayısı.

   ⚠️ /arama/FilterSidebar.tsx'e DOKUNULMADI; bu ayrı, izole bileşendir.
   URL CONTRACT (DEĞİŞMEZ): bolgeler · villa-turleri · guests.
   =============================================================== */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/* 🛡️ PUBLIC ÇOKLU DİL — filtre paneli metinleri MEVCUT `search.filters`
   namespace'inden REUSE edilir (bu bileşen /arama FilterSidebar'ın
   replikasıdır); yalnız karşılığı olmayan birkaç metin `shortGaps`
   namespace'inden gelir. URL CONTRACT (bolgeler · villa-turleri ·
   guests) ve filtre mantığı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

import {
  ChevronDown,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
  X,
} from "lucide-react";

/* ---------------- Types ---------------- */

export type GapFilterOption = {
  id: string;
  name: string;
  slug?: string | null;
  show_in_filter?: boolean | null;
  filter_group_name?: string | null;
};

export type GapInitialFilters = {
  regions: string[];
  categories: string[];
  guests: number;
};

type Props = {
  /** Aktif route (ör. /kisa-sureli-tarihler/haziran/2). buildHref + Temizle. */
  basePath: string;
  regionOptions: GapFilterOption[];
  categoryOptions: GapFilterOption[];
  initial: GapInitialFilters;
  /** Mobil CTA "X villa göster" için. */
  resultCount?: number;
  /** 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
};

/* ---------------- Helpers ---------------- */

const regionShortLabel = (
  name: string,
  group: string,
  allGroupTemplate: string
): string => {
  /* 🛡️ Bölge ADI ÇEVRİLMEZ (özel isim); yalnız "Tüm …" ön eki locale'e
     göre çözülür — /arama FilterSidebar ile AYNI kural. */
  if (name === group)
    return formatDictionaryString(allGroupTemplate, { group });
  if (name.includes("/")) {
    const tail = name.split("/").pop()?.trim();
    if (tail) return tail;
  }
  return name;
};

/* ===============================================================
   COMPONENT
   =============================================================== */
export default function GapFilterSidebar({
  basePath,
  regionOptions,
  categoryOptions,
  initial,
  resultCount = 0,
  locale = DEFAULT_LOCALE,
}: Props) {
  const dictionary = getDictionary(locale);
  const dict = dictionary.shortGaps;
  /* 🛡️ Filtre paneli metinleri /arama FilterSidebar ile AYNI namespace. */
  const filtersDict = dictionary.search.filters;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /* ---------------- DRAFT STATE ---------------- */
  const [regions, setRegions] = useState<string[]>(initial.regions);
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [guestCount, setGuestCount] = useState<number>(
    Math.max(1, initial.guests || 1)
  );

  /* URL değişince props.initial değişir → draft senkronize (kasıtlı;
     /arama FilterSidebar ile birebir aynı desen). */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setRegions(initial.regions);
    setCategories(initial.categories);
    setGuestCount(Math.max(1, initial.guests || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.regions.join(","), initial.categories.join(","), initial.guests]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ---------------- BÖLGE GRUP AÇ/KAPA ---------------- */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const regionGroups = useMemo(() => {
    const map = new Map<string, GapFilterOption[]>();
    for (const o of regionOptions) {
      if (!o.show_in_filter) continue;
      const group = (o.filter_group_name || "").trim() || o.name;
      const arr = map.get(group);
      if (arr) arr.push(o);
      else map.set(group, [o]);
    }
    const collator = new Intl.Collator("tr");
    const groups = Array.from(map.entries()).map(([group, items]) => ({
      group,
      items: items.sort((a, b) => {
        if (a.name === group) return -1;
        if (b.name === group) return 1;
        return collator.compare(a.name, b.name);
      }),
    }));
    groups.sort((a, b) => collator.compare(a.group, b.group));
    return groups;
  }, [regionOptions]);

  /* ---------------- MOBILE DRAWER ---------------- */
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const t = window.setTimeout(() => {
      const el = drawerRef.current?.querySelector<HTMLElement>(
        "[data-drawer-initial-focus]"
      );
      el?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  /* ---------------- HANDLERS ---------------- */

  const idToToken = (id: string, opts: GapFilterOption[]) => {
    const o = opts.find((x) => x.id === id);
    return (o?.slug && o.slug.trim()) || id;
  };

  const buildHref = () => {
    const params = new URLSearchParams();
    if (categories.length) {
      const tokens = categories.map((id) => idToToken(id, categoryOptions));
      params.set("villa-turleri", tokens.join(","));
    }
    if (regions.length) {
      const tokens = regions.map((id) => idToToken(id, regionOptions));
      params.set("bolgeler", tokens.join(","));
    }
    if (guestCount > 1) params.set("guests", String(guestCount));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const applyFilters = () => {
    const href = buildHref();
    startTransition(() => {
      router.push(href);
    });
    setMobileOpen(false);
  };

  const resetFilters = () => {
    setRegions([]);
    setCategories([]);
    setGuestCount(1);
    startTransition(() => {
      router.push(basePath);
    });
  };

  const toggleInList = (
    value: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    if (list.includes(value)) setList(list.filter((x) => x !== value));
    else setList([...list, value]);
  };

  /* GRUP-FARKINDA BÖLGE TOGGLE — /arama ile birebir aynı mantık. */
  const toggleRegion = (opt: GapFilterOption, group: string) => {
    const isRoot = opt.name === group;
    const groupItems =
      regionGroups.find((g) => g.group === group)?.items ?? [];
    const rootId = groupItems.find((it) => it.name === group)?.id;

    setRegions((prev) => {
      if (prev.includes(opt.id)) {
        return prev.filter((x) => x !== opt.id);
      }
      if (isRoot) {
        const subIds = new Set(
          groupItems.filter((it) => it.name !== group).map((it) => it.id)
        );
        return [...prev.filter((x) => !subIds.has(x)), opt.id];
      }
      const base = rootId ? prev.filter((x) => x !== rootId) : prev;
      return [...base, opt.id];
    });
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (regions.length) n += 1;
    if (categories.length) n += 1;
    if (guestCount > 1) n += 1;
    return n;
  }, [regions.length, categories.length, guestCount]);

  /* ===============================================================
     RENDER — panel (desktop aside + mobile drawer ortak)
     =============================================================== */
  const panel = (
    <div className="flex flex-col h-full min-h-0">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 pb-6 border-b border-[var(--color-stone-100)]">
        <div>
          <p className="text-[11px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-500)]">
            <span className="inline-block w-6 h-px bg-[var(--color-stone-300)] align-middle mr-2" />
            {dict.filterTitle}
          </p>
          <h2 className="font-display text-[26px] md:text-[28px] text-[var(--color-stone-900)] mt-2 tracking-[-0.025em] leading-tight">
            {dict.filterSubtitle}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={filtersDict.closeAriaLabel}
          className="md:hidden -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <X size={18} />
        </button>
      </div>

      {/* SCROLL AREA */}
      <div className="flex-1 min-h-0 overflow-y-auto py-6 space-y-8 pr-1 -mr-1">
        {/* ============ 1) VİLLA TİPİ ============ */}
        <FilterGroup
          icon={<Tag size={14} className="text-[var(--color-champagne-500)]" />}
          label={filtersDict.typeLabel}
          summary={
            categories.length === 0
              ? filtersDict.typeAll
              : formatDictionaryString(filtersDict.selectedCount, {
                  n: categories.length,
                })
          }
        >
          {categoryOptions.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">Tip yok.</p>
          ) : (
            <ul className="space-y-1">
              {categoryOptions.map((opt, i) => {
                const checked = categories.includes(opt.id);
                return (
                  <li key={opt.id}>
                    <label
                      className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-xl cursor-pointer transition-colors motion-reduce:transition-none ${
                        checked
                          ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                          : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                      }`}
                    >
                      <input
                        {...(i === 0 ? { "data-drawer-initial-focus": "" } : {})}
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          toggleInList(opt.id, categories, setCategories)
                        }
                        className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                      />
                      <span className="truncate">{opt.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </FilterGroup>

        {/* ============ 2) BÖLGE ============ */}
        <FilterGroup
          icon={
            <MapPin size={14} className="text-[var(--color-champagne-500)]" />
          }
          label={filtersDict.regionLabel}
          summary={
            regions.length === 0
              ? filtersDict.regionAll
              : formatDictionaryString(filtersDict.selectedCount, {
                  n: regions.length,
                })
          }
        >
          {regionGroups.length === 0 ? (
            <p className="text-[13px] text-[var(--color-stone-400)]">
              {filtersDict.regionEmpty}
            </p>
          ) : (
            <div className="space-y-1.5">
              {regionGroups.map((g) => {
                const selectedCount = g.items.filter((it) =>
                  regions.includes(it.id)
                ).length;
                const isOpen = openGroups[g.group] ?? selectedCount > 0;
                return (
                  <div
                    key={g.group}
                    className="rounded-xl border border-[var(--color-stone-100)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenGroups((s) => ({ ...s, [g.group]: !isOpen }))
                      }
                      aria-expanded={isOpen}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-[14px] text-[var(--color-stone-800)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none"
                    >
                      <span className="flex items-center gap-2 font-medium truncate">
                        <ChevronDown
                          size={14}
                          className={`text-[var(--color-stone-400)] shrink-0 transition-transform motion-reduce:transition-none ${
                            isOpen ? "" : "-rotate-90"
                          }`}
                        />
                        <span className="truncate">{g.group}</span>
                      </span>
                      {selectedCount > 0 && (
                        <span className="text-[11px] tabular-nums text-[var(--color-stone-400)] shrink-0">
                          {formatDictionaryString(
                            filtersDict.selectedCount,
                            { n: selectedCount }
                          )}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <ul className="space-y-1 px-1.5 pb-1.5">
                        {g.items.map((opt) => {
                          const checked = regions.includes(opt.id);
                          return (
                            <li key={opt.id}>
                              <label
                                className={`flex items-center gap-3 text-[14px] px-3 py-2.5 rounded-lg cursor-pointer transition-colors motion-reduce:transition-none ${
                                  checked
                                    ? "bg-[var(--color-sand-50)] text-[var(--color-stone-900)]"
                                    : "text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)]"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleRegion(opt, g.group)}
                                  className="!w-4 !h-4 accent-[var(--color-champagne-500)] !rounded"
                                />
                                <span className="truncate">
                                  {regionShortLabel(opt.name, g.group, filtersDict.regionGroupAll)}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FilterGroup>

        {/* ============ 3) KİŞİ SAYISI ============ */}
        <FilterGroup
          icon={
            <Users size={14} className="text-[var(--color-champagne-500)]" />
          }
          label={filtersDict.guestsLabel}
          summary={formatDictionaryString(filtersDict.guestsSummary, {
            n: guestCount,
          })}
        >
          <div className="space-y-3">
            <CounterRow
              label={filtersDict.guestsCounterLabel}
              hint={filtersDict.guestsCounterHint}
              decreaseAriaLabel={filtersDict.decreaseAriaLabel}
              increaseAriaLabel={filtersDict.increaseAriaLabel}
              value={guestCount}
              min={1}
              max={20}
              onChange={setGuestCount}
            />
            <p className="text-[11px] tracking-[0.04em] text-[var(--color-stone-400)] pt-1 leading-relaxed">
              <span className="tabular-nums">{guestCount}</span>
              {filtersDict.guestsHint}
            </p>
          </div>
        </FilterGroup>
      </div>

      {/* STICKY FOOTER */}
      <div className="pt-5 border-t border-[var(--color-stone-100)] flex items-center gap-3">
        <button
          type="button"
          onClick={resetFilters}
          disabled={activeFilterCount === 0 || isPending}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-full border border-[var(--color-stone-200)] text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <RotateCcw size={13} />
          {filtersDict.reset}
        </button>
        <button
          type="button"
          onClick={applyFilters}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-[var(--color-stone-900)] text-white text-[13px] font-medium tracking-[0.04em] hover:bg-[var(--color-stone-700)] transition-colors motion-reduce:transition-none disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Search size={14} />
          <span>
            {isPending
              ? filtersDict.applying
              : mobileOpen
              ? formatDictionaryString(dict.showResults, {
                  n: resultCount ?? 0,
                })
              : dict.filterApplyCta}
          </span>
        </button>
      </div>
    </div>
  );

  /* =============== RENDER ROOT =============== */
  return (
    <>
      {/* MOBILE TRIGGER */}
      <div className="md:hidden mb-8">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full inline-flex items-center justify-between gap-4 px-5 py-4 rounded-2xl bg-white border border-[var(--color-stone-100)] text-left hover:border-[var(--color-stone-200)] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          aria-haspopup="dialog"
          aria-expanded={mobileOpen}
        >
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] flex items-center justify-center">
              <SlidersHorizontal
                size={15}
                className="text-[var(--color-stone-700)]"
              />
            </span>
            <span>
              <span className="block text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                {dict.mobileTrigger}
              </span>
              <span className="block text-[14px] font-medium text-[var(--color-stone-900)] mt-0.5">
                {dict.mobileSummaryPlaceholder}
              </span>
            </span>
          </span>
          {activeFilterCount > 0 ? (
            <span className="text-[11px] tracking-[0.12em] uppercase font-semibold tabular-nums px-2.5 py-1 rounded-full bg-[var(--color-stone-900)] text-white">
              {activeFilterCount}
            </span>
          ) : (
            <ChevronDown size={16} className="text-[var(--color-stone-400)]" />
          )}
        </button>
      </div>

      {/* DESKTOP — inline sticky aside */}
      <aside className="hidden md:block">
        <div className="sticky top-28">
          <div className="bg-white border border-[var(--color-stone-100)] rounded-2xl p-6 max-h-[calc(100vh-9rem)] flex flex-col overflow-hidden">
            {panel}
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      <div
        className={`md:hidden fixed inset-0 z-[100] ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
        role="dialog"
        aria-modal="true"
        aria-label={dict.filtersAriaLabel}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-[var(--color-stone-900)]/40 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          ref={drawerRef}
          className={`absolute inset-x-0 bottom-0 h-[92vh] bg-white rounded-t-3xl shadow-[0_-24px_64px_-16px_rgb(27_26_23/0.22)] transition-transform duration-300 motion-reduce:transition-none ${
            mobileOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="flex items-center justify-center pt-3 pb-1">
            <span
              aria-hidden="true"
              className="w-10 h-1 rounded-full bg-[var(--color-stone-200)]"
            />
          </div>
          <div className="px-5 pt-2 pb-5 h-[calc(92vh-1.25rem)]">{panel}</div>
        </div>
      </div>
    </>
  );
}

/* ===============================================================
   SUB-COMPONENTS — /arama FilterGroup + CounterRow birebir kopya
   =============================================================== */

function FilterGroup({
  icon,
  label,
  summary,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-stone-700)]">
          {icon}
          {label}
        </h3>
        <span className="text-[11px] tracking-[0.06em] text-[var(--color-stone-400)] truncate max-w-[55%] text-right">
          {summary}
        </span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function CounterRow({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  decreaseAriaLabel,
  increaseAriaLabel,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** `formatDictionaryString` şablonu — `{label}`. */
  decreaseAriaLabel: string;
  increaseAriaLabel: string;
}) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium text-[var(--color-stone-900)]">
          {label}
        </p>
        <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.02em]">
          {hint}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => canDec && onChange(value - 1)}
          disabled={!canDec}
          aria-label={formatDictionaryString(decreaseAriaLabel, { label })}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Minus size={13} />
        </button>
        <span className="tabular-nums text-[14px] font-medium text-[var(--color-stone-900)] w-5 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={() => canInc && onChange(value + 1)}
          disabled={!canInc}
          aria-label={formatDictionaryString(increaseAriaLabel, { label })}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] text-[var(--color-stone-700)] flex items-center justify-center hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors motion-reduce:transition-none disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
