"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Square,
  CheckSquare,
  Share2,
  Copy,
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import AdminDateRangePicker from "@/app/components/admin/shared/AdminDateRangePicker";
/* 🛡️ Public /arama ile AYNI availability motoru — get_blocked_villa_ids
   RPC (mig 039, SECURITY DEFINER, PII-safe, anon'dan da çağrılabilir).
   Reservations(pending/confirmed) + manual_reservations + external
   (is_active) half-open [start,end) overlap birleşimi. */
import { getBlockedVillaIdsAction } from "@/lib/availability.action";
import { normalizeSearchText } from "@/lib/search";

import VillaCard from "@/app/components/villa/VillaCard";
import {
  getStartingPrice,
  calculateGrandTotal,
  calculateNights,
} from "@/lib/price.engine";
/* 🛡️ Public /arama sorting motoru — AYNEN reuse (duplicate logic yok). */
import {
  applyPublicSort,
  parsePublicSort,
  computePageWindow,
  type PublicSort,
} from "@/lib/pagination";
import { useCurrency } from "@/app/context/CurrencyContext";
import { createSharedVillaListAction as createSharedVillaList } from "./shared-villa-list.action";
import {
  DEFAULT_EXPIRATION_KEY,
  type ExpirationKey,
} from "@/app/services/shared-villa-list.constants";
import type { SharedSearchParams } from "@/app/services/shared-villa-list.service";

/* Pill select label table — frontend kullanır, server-side
   ALLOWED_EXPIRATIONS map ile zaten sınırlı (key allow-list). */
const EXPIRATION_OPTIONS: ReadonlyArray<{
  key: ExpirationKey;
  label: string;
}> = [
  { key: "1h", label: "1 Saat" },
  { key: "3h", label: "3 Saat" },
  { key: "6h", label: "6 Saat" },
  { key: "24h", label: "24 Saat" },
];

/* 🚀 RENDER PAGINATION — sayfa başına gösterilecek kart sayısı.
   YALNIZ RENDER KATMANI: veri çekme, filtreleme, arama, sıralama,
   fiyat hesabı ve seçim mantığı bu sabitten ETKİLENMEZ; hepsi
   filtrelenmiş TÜM liste üzerinde çalışmaya devam eder. Yalnız
   `.map()` edilen dilim sınırlanır. 24 = grid'in 2/3/4 kolon
   varyantlarının üçüne de tam bölünen değer. */
const RENDER_PAGE_SIZE = 24;

/* ===============================================================
   🏛️ VillaListesiClient — admin curator orchestrator
   ===============================================================
   AKIŞ:
     - Filter bar (start, end, guests, location)
     - VillaCard grid (selection checkbox overlay)
     - Sticky alt bar: "X villa seçildi" + "Listeyi Paylaş" CTA
     - Modal: title/note + token üretimi + paylaşılabilir link

   PRICING:
     - Tarih girildiyse VillaCard `stayStart/stayEnd/prices/cleaning_*`
       props alır → `calculateGrandTotal` ile total + gece + temizlik
       dahil bilgisini render eder.
     - Tarih yoksa `getStartingPrice` fallback (arama page ile aynı
       pattern; VillaCard `price` prop'una starting price geçilir).
     - Currency conversion `VillaCard` içinde `convertPrice` ile
       kullanıcı currency'sine çevrilir (CurrencyContext).

   ZERO-IMPACT:
     - calculateGrandTotal, pricing engine, currency context,
       reservation logic, booking sidebar — DOKUNULMAZ.
     - Filter sadece guests + location_id client-side. Tarih
       sadece pricing context (availability check YOK — admin
       sadece müşterinin ne göreceğini önizler).
   =============================================================== */

export type VillaListesiRow = {
  id: string;
  slug: string;
  title: string;
  location_id: string;
  location: string;
  price: number | null;
  currency: string | null;
  images: string[];
  badge: string | null;
  guests: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  cleaning_fee: number;
  cleaning_currency: string;
  cleaning_limit: number;
  prices: Array<{
    price: number;
    currency: string;
    start_date: string;
    end_date: string;
  }>;
};

export type LocationOption = {
  id: string;
  name: string;
  /** Migration 050 — Hero/FilterSidebar ile aynı: dropdown yalnız grup
      köklerini (name === filter_group_name) gösterir; seçilen kök
      filtrede gruptaki tüm lokasyonlara genişler. */
  filter_group_name?: string | null;
};

export type CategoryOption = {
  id: string;
  name: string;
};

export default function VillaListesiClient({
  villas,
  locations,
  categories,
  villaCategoryMap,
}: {
  villas: VillaListesiRow[];
  locations: LocationOption[];
  categories: CategoryOption[];
  /** villa.id → categoryId[] map. M:N junction precomputed server-side. */
  villaCategoryMap: Record<string, string[]>;
}) {
  /* ---------------- FILTER STATE ----------------
     dateRange: react-datepicker selectsRange ile [Date|null, Date|null].
     start/end string'leri derive edilir; VillaCard'a pricing context
     ve share payload için YYYY-MM-DD format'ında geçirilir.
     guests: input string (boş "" → 0 anlamına gelir).
     locationId / categoryId: single-select UUID (boş "" → tüm). */
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    null,
    null,
  ]);
  const [startDateObj, endDateObj] = dateRange;
  const [guests, setGuests] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  /* 🛡️ Kategori filtresi MULTI-SELECT (OR). Boş array = tüm kategoriler.
     Bölge (locationId) tek-seçim olarak KORUNDU. */
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  /* Checkbox dropdown aç/kapa + outside-click ref. */
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [catOpen]);
  const toggleCategory = (id: string) =>
    setCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  /* 🛡️ SORT — public /arama allow-list (smart | price-asc/desc |
     capacity-asc/desc). Default "smart" = mevcut server sırası (sort_order
     ASC, created_at DESC) AYNEN. */
  const [sort, setSort] = useState<PublicSort>("smart");
  /* Public ile aynı currency davranışı (yeni logic yok): CurrencyContext'ten
     currency + rates. Provider yoksa default (TRY, {}) → graceful, public ilk
     ziyaret fallback'iyle aynı. */
  const { currency, rates } = useCurrency();

  /* 🛡️ Client-side UI search — rezervasyonlar ekranı paritesi.
     Title / location adı / slug / id üzerinde lowercase includes;
     mevcut dropdown filtreleriyle AND mantığıyla kombine. */
  const [search, setSearch] = useState<string>("");

  /* Date → YYYY-MM-DD string (local, TZ-drift'siz). FilterSidebar
     `formatDateForUrl` ile birebir aynı semantik. */
  const start = useMemo(
    () => (startDateObj ? formatLocalDate(startDateObj) : ""),
    [startDateObj]
  );
  const end = useMemo(
    () => (endDateObj ? formatLocalDate(endDateObj) : ""),
    [endDateObj]
  );

  /* ---------------- SELECTION ---------------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---------------- SHARE MODAL ---------------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [expirationKey, setExpirationKey] = useState<ExpirationKey>(
    DEFAULT_EXPIRATION_KEY
  );
  const [submitting, setSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  /* ---------------- COMPUTED FILTER ---------------- */
  const guestsNum = (() => {
    const n = Number(guests);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  })();
  const hasDateRange = !!start && !!end;

  /* ---------------- AVAILABILITY (public /arama paritesi) ----------------
     Tarih aralığı seçiliyse o aralıkta DOLU villa id'lerini getir
     (getBlockedVillaIds → get_blocked_villa_ids RPC). hasDateRange false
     ise boş Set → availability filtresi devre dışı (eski davranış).

     - YARIŞ KOŞULU GUARD: her fetch'e bir `reqId` verilir; yalnız EN SON
       isteğin yanıtı state'e yazılır (kullanıcı tarih değiştirirse eski
       response yazılmaz). cancelled flag unmount'ta da yazımı durdurur.
     - FAIL-SOFT: helper RPC hatasında zaten boş Set döner; ayrıca catch
       ile boş Set'e düşülür → liste eski davranışa (tüm villalar) iner. */
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    /* getBlockedVillaIds geçersiz/eksik range'de RPC çağırmadan boş Set
       döner → hasDateRange false iken availability filtresi otomatik
       devre dışı (boş Set). Tek setState async callback içinde. */
    const candidateIds = villas.map((v) => v.id);
    (async () => {
      try {
        const set = new Set(
          await getBlockedVillaIdsAction(start, end, candidateIds)
        );
        if (!cancelled) setBlockedSet(set);
      } catch {
        if (!cancelled) setBlockedSet(new Set()); // fail-soft
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [start, end, villas]);

  /* 🛡️ Migration 050 — dropdown yalnız grup kökleri (name === group). */
  const rootLocations = useMemo(
    () =>
      locations.filter((l) => {
        const g = (l.filter_group_name ?? "").toString().trim();
        return g.length > 0 && l.name === g;
      }),
    [locations]
  );

  /* Seçilen grup kökü → o gruba ait TÜM location_id'ler (kök dahil).
     Kürasyonsuz/eşleşmeyen seçimde fallback: yalnız seçilen id. */
  const expandedLocationIds = useMemo(() => {
    if (!locationId) return null;
    const selected = locations.find((l) => l.id === locationId);
    const group = (selected?.filter_group_name ?? "").toString().trim();
    if (!group) return new Set([locationId]);
    const ids = locations
      .filter((l) => (l.filter_group_name ?? "").toString().trim() === group)
      .map((l) => l.id);
    return new Set(ids.length > 0 ? ids : [locationId]);
  }, [locationId, locations]);

  const filtered = useMemo(() => {
    /* 🔎 Türkçe-aware arama kanonu (ırmak/Irmak/İrmak → aynı). */
    const q = normalizeSearchText(search);
    return villas.filter((v) => {
      /* 🛡️ AVAILABILITY — public /arama ile aynı: seçili tarihte dolu
         villayı gizle. hasDateRange false iken blockedSet boş → no-op. */
      if (blockedSet.has(v.id)) return false;
      if (expandedLocationIds && !expandedLocationIds.has(v.location_id))
        return false;
      if (guestsNum > 0 && (v.guests ?? 0) < guestsNum) return false;
      if (categoryIds.length > 0) {
        /* 🛡️ AND — public /arama ile birebir: villa seçili TÜM
           kategorilere sahip olmalı (arama page typeSet.size === required
           semantiği). Tek kategori seçiminde AND === OR. */
        const cats = villaCategoryMap[v.id];
        if (!cats || !categoryIds.every((c) => cats.includes(c)))
          return false;
      }
      /* 🛡️ Search — title / location adı / slug / id üzerinde lowercase
         includes. Dropdown filtreleriyle AND mantığı (en sonda). */
      if (q) {
        const haystack = normalizeSearchText(
          (v.title || "") +
            " " +
            (v.location || "") +
            " " +
            (v.slug || "") +
            " " +
            (v.id || "")
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    villas,
    expandedLocationIds,
    guestsNum,
    categoryIds,
    villaCategoryMap,
    search,
    blockedSet,
  ]);

  /* ---------------- SORT STAGE (public /arama reuse) ----------------
     `filtered` (availability + tüm filtreler) SONRASI, render ÖNCESİ temiz
     bir sıralama. Pipeline'a dokunulmaz; yalnız sıra değişir.
     - smart → no-op (applyPublicSort referansı aynen döner = server sırası).
     - capacity-asc/desc → public ile aynı: `guests` alanı.
     - price-asc/desc → public ile aynı motor:
         tarih var  → calculateGrandTotal().total (stay+cleaning, grand total)
         tarih yok  → getStartingPrice(prices) (base/starting fallback)
       Sonuç `_sortPrice` ile applyPublicSort'a verilir (public stay-total
       override deseniyle birebir). */
  const sortedFiltered = useMemo(() => {
    if (sort === "smart") return filtered;

    const isPrice = sort === "price-asc" || sort === "price-desc";
    if (!isPrice) {
      // Kapasite — applyPublicSort `guests` kullanır.
      return applyPublicSort(filtered, sort, { userCurrency: currency, rates });
    }

    const nights = hasDateRange ? calculateNights(start, end) : 0;
    const input = filtered.map((v) => {
      let sp: number | null = null;
      if (hasDateRange && nights > 0 && v.prices.length > 0) {
        const r = calculateGrandTotal({
          start,
          end,
          prices: v.prices,
          currency,
          rates,
          cleaning_fee: v.cleaning_fee,
          cleaning_currency: v.cleaning_currency,
          cleaning_limit: v.cleaning_limit,
        });
        sp =
          typeof r.total === "number" &&
          Number.isFinite(r.total) &&
          r.total > 0
            ? r.total
            : null;
      } else {
        const base = getStartingPrice(v.prices);
        sp = base && base.price > 0 ? base.price : null;
      }
      return { ...v, _sortPrice: sp };
    });

    return applyPublicSort(input, sort, { userCurrency: currency, rates });
  }, [filtered, sort, hasDateRange, start, end, currency, rates]);

  /* ---------------- RENDER PAGINATION (yalnız görüntüleme) ----------------
     🚀 TEK AMAÇ: aynı anda mount edilen `VillaCard` sayısını sınırlamak.
     Bu blok pipeline'ın EN SONUNA eklenir — `filtered` ve `sortedFiltered`
     olduğu gibi kalır ve aşağıdaki davranışların HEPSİ filtrelenmiş TÜM
     liste üzerinde çalışmaya devam eder:
       • "Tümünü seç" (`selectAllFiltered` → `filtered`, sayfadan bağımsız)
       • seçim Set'i (sayfa değişince korunur)
       • sayaç (`filtered.length`)
       • arama / bölge / kategori / misafir / tarih-müsaitlik filtreleri
       • sıralama (fiyat/kapasite dahil) ve fiyat/kur hesapları
       • "Listeyi Paylaş" (seçili id'lerle çalışır, render'la değil)
     Yalnız `pageItems` render edilir.

     STATE: local `useState`. URL'e DOKUNULMAZ — bu sayfada filtreler de
     URL'de tutulmuyor (`useSearchParams`/`router` hiç kullanılmıyor);
     sayfayı URL'e yazmak refresh'te "filtre yok ama sayfa 40" tutarsızlığı
     üretirdi. En düşük riskli yöntem local state. */
  const [page, setPage] = useState(1);

  /* Sonuç kümesini değiştiren HER girdide 1. sayfaya dön — aksi halde
     filtre daraltılınca boş ekran kalırdı. (Mevcut iki admin pagination
     deseniyle aynı kural.)

     React'in "prop değişince state'i ayarla" deseni (render sırasında
     senkron ayar) kullanılır; `useEffect` + `setState` kullanılmaz —
     projenin `set-state-in-effect` lint kuralı ve cascading render
     maliyeti böylece devreye girmez. `blockedSet` imzaya GEREKMEZ:
     müsaitlik yalnız `start`/`end` değişince yeniden çözülür ve o
     değişim imzada zaten var. */
  const filterSignature = [
    search,
    locationId,
    categoryIds.join(","),
    guests,
    start,
    end,
    sort,
  ].join("|");
  const [prevFilterSignature, setPrevFilterSignature] =
    useState(filterSignature);
  if (prevFilterSignature !== filterSignature) {
    setPrevFilterSignature(filterSignature);
    setPage(1);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(sortedFiltered.length / RENDER_PAGE_SIZE)
  );
  /* Clamp — liste daralırsa mevcut sayfa aralık dışında kalmasın. */
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = sortedFiltered.slice(
    (safePage - 1) * RENDER_PAGE_SIZE,
    safePage * RENDER_PAGE_SIZE
  );

  /* ---------------- HANDLERS ---------------- */
  function gotoPage(next: number) {
    setPage(Math.min(Math.max(1, next), totalPages));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((v) => v.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openShareModal() {
    setShareUrl(null);
    setShareError(null);
    setModalOpen(true);
  }

  async function handleSubmitShare() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setShareError(null);

    const searchParams: SharedSearchParams = {};
    if (hasDateRange) {
      searchParams.start = start;
      searchParams.end = end;
    }
    if (guestsNum > 0) searchParams.guests = guestsNum;
    if (locationId) searchParams.regions = [locationId];
    if (categoryIds.length) searchParams.categories = categoryIds;

    const res = await createSharedVillaList({
      villaIds: Array.from(selected),
      searchParams,
      title: title || undefined,
      note: note || undefined,
      expirationKey,
    });

    setSubmitting(false);

    if (!res.ok) {
      setShareError(res.error);
      return;
    }
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    setShareUrl(`${origin}/liste/${res.token}`);
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* fallback: silently ignored — kullanıcı manuel kopyalayabilir */
    }
  }

  function closeModal() {
    setModalOpen(false);
    setTitle("");
    setNote("");
    setExpirationKey(DEFAULT_EXPIRATION_KEY);
    setShareUrl(null);
    setShareError(null);
  }

  /* ---------------- RENDER ---------------- */
  return (
    <div className="space-y-6 pb-32">
      {/* ════════ SEARCH BAR ════════
          Rezervasyonlar ekranı paritesi (admin-pill-search).
          Mevcut dropdown filtreleriyle AND mantığı; URL'e dokunmaz. */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk adı, bölge, slug veya ID ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {filtered.length} villa
        </span>
        {/* 🛡️ SIRALAMA — public /arama allow-list. Filtre grid'i (4 kolon)
           byte-identical kalsın diye search bar'a eklendi. */}
        <select
          value={sort}
          onChange={(e) => setSort(parsePublicSort(e.target.value))}
          className="input ml-auto w-auto"
          aria-label="Sıralama"
        >
          <option value="smart">Varsayılan</option>
          <option value="capacity-asc">Kapasite (artan)</option>
          <option value="capacity-desc">Kapasite (azalan)</option>
          <option value="price-asc">Fiyat (artan)</option>
          <option value="price-desc">Fiyat (azalan)</option>
        </select>
      </div>

      {/* ════════ FILTER BAR ════════ */}
      <section className="admin-card-flat p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* 📅 Tek calendar date-range — react-datepicker selectsRange.
              FilterSidebar / Hero ile aynı kütüphane + pattern. Kullanıcı
              önce girişe, sonra çıkışa tıklar; tek range oluşur. */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Konaklama Tarihi
            </label>
            <AdminDateRangePicker
              startDate={startDateObj}
              endDate={endDateObj}
              onChange={setDateRange}
              placeholderText="Giriş – Çıkış Tarihi"
              minDate={new Date()}
              ariaLabel="Konaklama tarihi aralığı"
            />
          </div>
          {/* 🏷️ Kategori — MULTI-SELECT (OR). Compact checkbox dropdown.
              Boş seçim = tüm kategoriler. Bölge filtresi single kalır. */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Kategori
            </label>
            <div className="relative z-40" ref={catRef}>
              <button
                type="button"
                onClick={() => setCatOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={catOpen}
                className="input w-full flex items-center justify-between gap-2 text-left"
              >
                <span
                  className={
                    categoryIds.length === 0
                      ? "text-[var(--admin-muted-2)]"
                      : ""
                  }
                >
                  {categoryIds.length === 0
                    ? "Tüm kategoriler"
                    : `${categoryIds.length} kategori seçili`}
                </span>
                <ChevronDown
                  size={14}
                  className="text-[var(--admin-muted-2)] shrink-0"
                />
              </button>
              {catOpen && (
                <ul
                  role="listbox"
                  className="absolute z-40 mt-1 left-0 right-0 max-h-64 overflow-auto rounded-lg border border-[var(--color-stone-200)] bg-white shadow-[0_12px_28px_-12px_rgb(27_26_23/0.22)] py-1"
                >
                  {categories.map((c) => {
                    const checked = categoryIds.includes(c.id);
                    return (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-[var(--color-stone-700)] hover:bg-[var(--color-sand-50)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCategory(c.id)}
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Bölge
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="input"
            >
              <option value="">Tüm bölgeler</option>
              {rootLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
              Kişi
            </label>
            <input
              type="number"
              min={1}
              placeholder="örn. 4"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--admin-muted-2)]">
          Tarih girmek opsiyonel — sadece müşterinin göreceği fiyat
          önizlemesi (toplam / gece / temizlik dahil) için kullanılır.
          Boş bırakırsanız &ldquo;gece başlangıç fiyatı&rdquo; gösterilir.
        </p>
        <div className="mt-4 flex items-center justify-between text-[13px] text-[var(--admin-muted)]">
          <span>
            <strong className="text-[var(--admin-text)]">
              {filtered.length}
            </strong>{" "}
            villa listelendi
            <span className="text-[var(--admin-muted-2)] mx-1.5">/</span>
            <span className="text-[var(--admin-muted-2)]">
              toplam {villas.length}
            </span>
            {selected.size > 0 ? (
              <>
                {" "}
                · <strong className="text-emerald-700">{selected.size}</strong>{" "}
                seçili
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="
                text-[12px] font-medium text-[var(--admin-muted)]
                hover:text-[var(--admin-text)]
                disabled:opacity-40 disabled:cursor-not-allowed
                px-2 py-1 rounded
              "
            >
              Tümünü seç
            </button>
            <span aria-hidden className="text-[var(--admin-muted-2)]">·</span>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selected.size === 0}
              className="
                text-[12px] font-medium text-[var(--admin-muted)]
                hover:text-[var(--admin-text)]
                disabled:opacity-40 disabled:cursor-not-allowed
                px-2 py-1 rounded
              "
            >
              Temizle
            </button>
          </div>
        </div>
      </section>

      {/* ════════ GRID ════════ */}
      {villas.length === 0 ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)] space-y-2">
          <p className="font-medium text-[var(--admin-text)]">
            Aktif mülk bulunamadı.
          </p>
          <p className="text-[12.5px]">
            Veri çekilemediyse server log&apos;a (
            <code>[villa-listesi.fetch]</code>) bakın; aksi halde
            mülk yönetiminden bir mülk ekleyin ve aktifleştirin.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)] space-y-2">
          <p className="font-medium text-[var(--admin-text)]">
            Filtreye uyan mülk yok.
          </p>
          <p className="text-[12.5px]">
            Toplam {villas.length} aktif villa var. Bölge/kişi filtresini
            gevşetin.
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-5 md:gap-x-6 gap-y-10">
          {/* 🚀 `pageItems` = sortedFiltered'ın yalnız görünen dilimi.
             Kart içeriği, prop'ları ve seçim overlay'i AYNEN. */}
          {pageItems.map((v) => {
            const isSelected = selected.has(v.id);
            /* Starting price fallback (arama page ile aynı pattern). */
            const fallback = (() => {
              const rawPrice = Number(v.price);
              if (Number.isFinite(rawPrice) && rawPrice > 0) {
                return { price: rawPrice, currency: v.currency || "TRY" };
              }
              const sp = getStartingPrice(v.prices);
              return sp ? sp : null;
            })();
            return (
              <div key={v.id} className="relative">
                {/* Selection checkbox overlay — z-30, Link tıklamasından önce yakalar. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSelect(v.id);
                  }}
                  aria-pressed={isSelected}
                  aria-label={
                    isSelected ? "Seçimi kaldır" : "Listeye ekle"
                  }
                  className={
                    "absolute top-3 left-3 z-30 " +
                    "w-9 h-9 rounded-full flex items-center justify-center " +
                    "backdrop-blur-md ring-1 ring-inset " +
                    "transition-colors duration-200 " +
                    (isSelected
                      ? "bg-emerald-500 ring-emerald-500 text-white"
                      : "bg-white/70 ring-white/40 text-stone-700 hover:bg-white")
                  }
                >
                  {isSelected ? (
                    <CheckSquare size={16} strokeWidth={2} />
                  ) : (
                    <Square size={16} strokeWidth={2} />
                  )}
                </button>

                {/* Seçim halkası — VillaCard'ı sarmalar.
                    rounded-[20px] curation variant outer radius ile uyumlu. */}
                <div
                  className={
                    "rounded-[20px] transition-shadow duration-200 " +
                    (isSelected
                      ? "ring-4 ring-emerald-200/70 ring-offset-2 ring-offset-[var(--admin-bg,#fafafa)]"
                      : "")
                  }
                >
                  <VillaCard
                    id={v.id}
                    slug={v.slug}
                    title={v.title}
                    location={v.location}
                    price={fallback?.price ?? undefined}
                    currency={fallback?.currency || "TRY"}
                    images={v.images}
                    badge={v.badge ?? undefined}
                    bedrooms={v.bedrooms || 1}
                    bathrooms={v.bathrooms || 1}
                    guests={v.guests || 2}
                    stayStart={hasDateRange ? start : undefined}
                    stayEnd={hasDateRange ? end : undefined}
                    prices={hasDateRange ? v.prices : undefined}
                    cleaningFee={hasDateRange ? v.cleaning_fee : undefined}
                    cleaningCurrency={
                      hasDateRange ? v.cleaning_currency : undefined
                    }
                    cleaningLimit={
                      hasDateRange ? v.cleaning_limit : undefined
                    }
                    variant="curation"
                  />
                </div>
              </div>
            );
          })}
        </div>
        {totalPages > 1 && (
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            onGoto={gotoPage}
          />
        )}
        </>
      )}

      {/* ════════ STICKY ACTION BAR ════════ */}
      {selected.size > 0 && (
        <div
          className="
            fixed bottom-5 left-1/2 -translate-x-1/2 z-40
            flex items-center gap-4
            rounded-full bg-white border border-[var(--admin-border)]
            shadow-[0_12px_30px_-12px_rgb(15_23_42/0.18)]
            px-5 py-3
          "
        >
          <span className="text-[13.5px] text-[var(--admin-text)] font-medium">
            <strong className="text-emerald-700">{selected.size}</strong>{" "}
            villa seçildi
          </span>
          <button
            type="button"
            onClick={openShareModal}
            className="
              inline-flex items-center gap-2
              rounded-full bg-emerald-600 hover:bg-emerald-700
              text-white text-[13.5px] font-semibold
              px-4 py-2 transition-colors
            "
          >
            <Share2 size={14} />
            Listeyi Paylaş
          </button>
        </div>
      )}

      {/* ════════ SHARE MODAL ════════ */}
      {modalOpen && (
        <div
          className="
            fixed inset-0 z-50 bg-black/40 backdrop-blur-sm
            flex items-center justify-center p-4
          "
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="
              w-full max-w-md
              rounded-2xl bg-white border border-[var(--admin-border)]
              shadow-xl p-6 space-y-4
            "
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[20px] text-[var(--admin-text)] tracking-[-0.01em]">
                  Listeyi paylaş
                </h3>
                <p className="text-[12.5px] text-[var(--admin-muted-2)] mt-1">
                  {selected.size} villa içeren özel bir bağlantı üretilecek.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-[var(--admin-muted-2)] hover:text-[var(--admin-text)] p-1"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            {!shareUrl ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Başlık (opsiyonel)
                  </label>
                  <input
                    type="text"
                    placeholder="Örn: Antalya 4 kişi sıcak villa seçkisi"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="input"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Not (opsiyonel)
                  </label>
                  <textarea
                    placeholder="Müşteriye kısa bir mesaj…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input !rounded-xl !p-3 h-24 resize-none text-[13.5px]"
                    maxLength={500}
                  />
                </div>

                {/* 🕒 LINK SÜRESİ — pill segmented control.
                    Frontend opaque key (1h/3h/6h/24h) gönderir;
                    backend ALLOWED_EXPIRATIONS map ile saate çevirir
                    (arbitrary TTL koruması). */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-wide text-[var(--admin-muted-2)] font-medium">
                    Link Süresi
                  </label>
                  <div
                    role="radiogroup"
                    aria-label="Link süresi"
                    className="
                      grid grid-cols-4 gap-1
                      rounded-xl border border-[var(--admin-border)]
                      bg-[var(--admin-bg-soft)] p-1
                    "
                  >
                    {EXPIRATION_OPTIONS.map((opt) => {
                      const isActive = expirationKey === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={isActive}
                          onClick={() => setExpirationKey(opt.key)}
                          className={
                            "rounded-lg px-3 py-2 text-[12.5px] font-medium " +
                            "transition-colors duration-150 " +
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 " +
                            (isActive
                              ? "bg-white text-[var(--admin-text)] shadow-sm border border-[var(--admin-border)]"
                              : "text-[var(--admin-muted)] hover:text-[var(--admin-text)]")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--admin-muted-2)]">
                    Paylaşılan link seçilen süre sonunda otomatik silinir.
                  </p>
                </div>

                {shareError && (
                  <p className="text-[12.5px] text-red-600">{shareError}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="
                      text-[13.5px] font-medium text-[var(--admin-muted)]
                      hover:text-[var(--admin-text)]
                      px-4 py-2 rounded-lg
                    "
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitShare}
                    disabled={submitting}
                    className="
                      inline-flex items-center gap-2
                      rounded-lg bg-emerald-600 hover:bg-emerald-700
                      text-white text-[13.5px] font-semibold
                      px-4 py-2 transition-colors
                      disabled:opacity-60 disabled:cursor-not-allowed
                    "
                  >
                    {submitting ? "Oluşturuluyor…" : "Bağlantı oluştur"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                  <p className="text-[12px] uppercase tracking-wide text-emerald-700 font-medium flex items-center gap-1.5">
                    <Check size={12} /> Bağlantı hazır
                  </p>
                  <p className="text-[12.5px] text-emerald-900 mt-1">
                    Müşterinize aşağıdaki bağlantıyı gönderin.
                  </p>
                </div>

                <div className="flex items-stretch gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="input font-mono !text-[12px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={copyShareUrl}
                    className="
                      inline-flex items-center gap-1.5 shrink-0
                      rounded-lg border border-[var(--admin-border)]
                      bg-white hover:bg-[var(--admin-bg-soft)]
                      text-[13px] font-medium text-[var(--admin-text)]
                      px-3
                    "
                  >
                    <Copy size={13} />
                    Kopyala
                  </button>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      text-[13.5px] font-medium text-[var(--admin-muted)]
                      hover:text-[var(--admin-text)]
                      px-4 py-2 rounded-lg
                    "
                  >
                    Önizle
                  </a>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="
                      rounded-lg bg-[var(--admin-text)] hover:bg-black
                      text-white text-[13.5px] font-semibold
                      px-4 py-2 transition-colors
                    "
                  >
                    Tamam
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   PaginationBar — önceki/sonraki + numaralı sayfa pillarları
   ===============================================================
   Görünüm ve sınıflar `VillaOperationsList.tsx:319` (/maki-admin/villas)
   ile BİREBİR — admin tasarım dili (`--admin-*` token'ları + aktif
   sayfa `--brand-coral` pill). Sayfa penceresi algoritması
   `lib/pagination.ts` → `computePageWindow` (mevcut ortak helper;
   yeni algoritma YAZILMADI).
=============================================================== */
function PaginationBar({
  page,
  totalPages,
  onGoto,
}: {
  page: number;
  totalPages: number;
  onGoto: (next: number) => void;
}) {
  const pages = computePageWindow(page, totalPages);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Sayfa gezinme"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      <button
        type="button"
        onClick={() => onGoto(page - 1)}
        disabled={prevDisabled}
        className="
          inline-flex items-center gap-1
          px-3 py-1.5 rounded-lg
          text-[12.5px] font-medium
          text-[var(--admin-muted)]
          hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          transition-colors motion-reduce:transition-none
          disabled:opacity-40 disabled:cursor-not-allowed
          disabled:hover:bg-transparent
        "
      >
        <ChevronLeft size={14} />
        Önceki
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--admin-muted-2)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onGoto(p)}
            aria-current={p === page ? "page" : undefined}
            className={
              "inline-flex items-center justify-center min-w-[32px] " +
              "px-2.5 py-1.5 rounded-lg " +
              "text-[12.5px] font-medium tabular-nums " +
              "transition-colors motion-reduce:transition-none " +
              (p === page
                ? "bg-[var(--brand-coral)] text-white"
                : "text-[var(--admin-muted)] hover:text-[var(--admin-text)] hover:bg-[var(--admin-bg-soft)]")
            }
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onGoto(page + 1)}
        disabled={nextDisabled}
        className="
          inline-flex items-center gap-1
          px-3 py-1.5 rounded-lg
          text-[12.5px] font-medium
          text-[var(--admin-muted)]
          hover:text-[var(--admin-text)]
          hover:bg-[var(--admin-bg-soft)]
          transition-colors motion-reduce:transition-none
          disabled:opacity-40 disabled:cursor-not-allowed
          disabled:hover:bg-transparent
        "
      >
        Sonraki
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}

/* ===============================================================
   HELPERS
   =============================================================== */

/* Date → YYYY-MM-DD (local TZ-safe). FilterSidebar `formatDateForUrl`
   ile birebir aynı semantik — `toISOString()` UTC drift'ine düşmez,
   getFullYear/Month/Date kullanır. */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
