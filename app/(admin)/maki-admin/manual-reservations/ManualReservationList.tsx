"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { deleteManualReservationAction as deleteManualReservation } from "@/app/(admin)/maki-admin/manual-reservations/manual-reservation.action";
/* 🐛 FIX — Türkçe-tolerant arama; /maki-admin/villas + VillaCombobox ile
   birebir aynı helper (yeni algoritma/helper YOK). */
import { normalizeSearchText } from "@/lib/search";
import {
  Calendar,
  Trash2,
  CalendarRange,
  Pencil,
  ArrowRight,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";

/* 🛡️ FAZ 29 — formatDateTr + calculateNights reuse.
   Mevcut helper'lar; yeni math/format YAZILMADI. */
import { formatDateTr } from "@/lib/date-format";
import { calculateNights } from "@/lib/price.engine";

/* ===============================================================
   🛡️ CLIENT-SIDE PAGINATION — villas UX paritesi (URL state)
   ===============================================================
   Bu sayfa zaten TÜM kayıtları client tarafında çekip filtreliyor;
   bu yüzden server-side pagination YOK. Repository/API/service/DB'ye
   DOKUNULMAZ — yalnız filtered `visibleItems` client tarafında
   dilimlenir. Sayfa boyutu allow-list + default 30; default'lar
   (page=1, pageSize=30) URL'e yazılmaz (clean URL). */
const ALLOWED_PAGE_SIZES = [10, 30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 30;

function parsePageSize(raw: string | null): number {
  const n = Number(raw);
  if (
    !Number.isFinite(n) ||
    !ALLOWED_PAGE_SIZES.includes(n as (typeof ALLOWED_PAGE_SIZES)[number])
  ) {
    return DEFAULT_PAGE_SIZE;
  }
  return n;
}

function parsePageParam(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/* Sayfa numarası penceresi — `1 2 3 … 42` (villas paterni). */
function computePageWindow(
  page: number,
  totalPages: number
): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) {
    set.add(2);
    set.add(3);
  }
  if (page >= totalPages - 2) {
    set.add(totalPages - 1);
    set.add(totalPages - 2);
  }
  const sorted = Array.from(set)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function ManualReservationList({ initialData }: any) {
  const toast = useNotify();
  const confirm = useConfirm();
  const [data, setData] = useState(initialData || []);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  /* 🛡️ Client-side UI search — rezervasyonlar paritesi.
     Aranan alanlar: villa.title, id (rezervasyon kodu/id), note (açıklama),
     ve defansif olarak name/phone (manual_reservations şemasında yok ama
     ileride eklenirse otomatik kapsanır; yoksa boş string → no-op). */
  const [search, setSearch] = useState<string>("");
  const visibleItems = useMemo(() => {
    const q = normalizeSearchText(search);
    if (!q) return data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).filter((it) => {
      const haystack = normalizeSearchText(
        (it?.villa?.title || "") +
          " " +
          (it?.id || "") +
          " " +
          (it?.note || "") +
          " " +
          (it?.name || "") +
          " " +
          (it?.phone || "")
      );
      return haystack.includes(q);
    });
  }, [data, search]);

  /* 🛡️ URL state (villas paritesi): ?page, ?pageSize. */
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageSize = parsePageSize(searchParams?.get("pageSize") ?? null);
  const pageFromUrl = parsePageParam(searchParams?.get("page") ?? null);

  /* URL builder — diğer query parametrelerini korur; default'lar
     (page=1, pageSize=30) URL'den temizlenir. */
  const buildHref = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      const sp = new URLSearchParams(searchParams?.toString() || "");
      if (next.page !== undefined) {
        if (next.page <= 1) sp.delete("page");
        else sp.set("page", String(next.page));
      }
      if (next.pageSize !== undefined) {
        if (next.pageSize === DEFAULT_PAGE_SIZE) sp.delete("pageSize");
        else sp.set("pageSize", String(next.pageSize));
      }
      const qs = sp.toString();
      return qs.length > 0 ? `?${qs}` : "";
    },
    [searchParams]
  );

  /* 🛡️ Pagination HER ZAMAN filtered `visibleItems` üzerinden
     hesaplanır (ham `data` üzerinden DEĞİL). */
  const totalItems = visibleItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, pageFromUrl), totalPages);
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);
  const pageItems = visibleItems.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  /* 🛡️ CLAMP — silme veya stale URL sonucu page > totalPages olursa
     son geçerli sayfaya düş (boş sayfada bırakma). Render zaten safePage
     kullanır; bu effect URL'i de senkronlar. */
  useEffect(() => {
    if (pageFromUrl > totalPages) {
      router.replace(buildHref({ page: totalPages }), { scroll: false });
    }
  }, [pageFromUrl, totalPages, router, buildHref]);

  /* Arama değişince page=1 (yalnız deep-page'deyken replace; mevcut
     search filtresi AYNEN korunur). */
  function handleSearchChange(value: string) {
    setSearch(value);
    if (pageFromUrl > 1) {
      router.replace(buildHref({ page: 1 }), { scroll: false });
    }
  }

  function handlePageSizeChange(newSize: number) {
    if (newSize === pageSize) return;
    router.replace(buildHref({ pageSize: newSize, page: 1 }), {
      scroll: false,
    });
  }

  function gotoPage(newPage: number) {
    if (newPage === safePage) return;
    router.replace(buildHref({ page: newPage }), { scroll: false });
  }

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Blok silinsin mi?",
      description: "Seçili manuel blok kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;
    /* 🛡️ FAZ 55J-3 — BEFORE snapshot from list state. */
    const before = data.find((x: any) => x.id === id) || null;
    try {
      setLoadingId(id);
      /* FAZ 34: DB I/O service'e delege; service repository'ye delege.
         Davranış BYTE-IDENTICAL — error throw + audit log + toast
         + UI state component'te kalır (UI concerns). */
      await deleteManualReservation(id);
      setData((prev: any) => prev.filter((x: any) => x.id !== id));
      toast.success("Blok silindi", { id: `manual-blok-delete-${id}` });
      /* AUDIT LOG (fail-safe). */
      logActivity({
        action: "manual_reservation.deleted",
        entity_type: "manual_reservation",
        entity_id: id,
        entity_title: before
          ? `${before.start_date} → ${before.end_date}`
          : "Manuel blok",
        before_data: before
          ? {
              id: before.id,
              villa_id: before.villa_id,
              start_date: before.start_date,
              end_date: before.end_date,
              note: before.note,
            }
          : null,
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error("Silinemedi", { id: `manual-blok-delete-${id}` });
    } finally {
      setLoadingId(null);
    }
  };

  if (data.length === 0) {
    return (
      <div className="card-premium p-10 text-center">
        <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
          <CalendarRange size={16} className="text-[var(--color-champagne-700)]" />
        </div>
        <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
          Henüz blok eklenmemiş
        </h3>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Tarih bloklamak için &ldquo;Yeni Blok&rdquo; butonunu kullan.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ════════ SEARCH BAR (rezervasyonlar paritesi) ════════
          Liste populated iken görünür; data tamamen boşken early-return
          empty-state'ine girilir ve bar render edilmez. */}
      <div className="admin-filter-bar mb-3 flex flex-wrap items-center gap-3">
        <div className="admin-pill-search flex-1 min-w-[200px]">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk, ID, not ara…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* PAGE SIZE SELECTOR (villas paritesi) */}
        <label className="inline-flex items-center gap-2 text-[12px] text-[var(--admin-muted-2)]">
          <span>Sayfa başına</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="
              text-[12.5px] rounded-lg border border-[var(--admin-border)]
              bg-white px-2 py-1
              text-[var(--admin-text)]
              focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent-soft,rgba(0,0,0,0.08))]
            "
          >
            {ALLOWED_PAGE_SIZES.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>
        </label>

        <span className="text-[12px] text-[var(--admin-muted-2)] px-2 tabular-nums">
          {totalItems > 0 ? `${rangeStart}-${rangeEnd} / ${totalItems}` : "0 / 0"} kayıt
        </span>
      </div>

    <div className="card-premium overflow-hidden divide-y divide-[var(--color-stone-100)]">
      {pageItems.map((item: any) => {
        /* 🛡️ FAZ 29 — premium tarih format + gece hesap (reuse).
           formatDateTr: "20 Mayıs 2026" (UTC→Istanbul shift safe).
           calculateNights: 7 gece (BookingSidebar, PricingCalendarCanvas,
           ReservationCalendar ile birebir aynı). */
        const nights = calculateNights(
          item.start_date,
          item.end_date
        );

        return (
          <div
            key={item.id}
            className="flex justify-between items-center p-5 hover:bg-[var(--color-sand-50)] transition gap-4"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0 mt-0.5">
                <Calendar
                  size={14}
                  className="text-[var(--color-champagne-700)]"
                />
              </span>
              <div className="min-w-0">
                <div className="font-medium text-[var(--color-stone-900)] truncate">
                  {item.villa?.title || "-"}
                </div>
                {/* 🛡️ FAZ 29 — premium readable tarih.
                   ESKİ: 20.05.2026 → 23.05.2026
                   YENİ: 20 Mayıs 2026 → 23 Mayıs 2026 */}
                <div className="text-sm text-[var(--color-stone-700)] mt-1 inline-flex items-center gap-1.5 flex-wrap tabular-nums">
                  <span>{formatDateTr(item.start_date)}</span>
                  <ArrowRight
                    size={12}
                    className="text-[var(--color-stone-400)] shrink-0"
                    aria-hidden
                  />
                  <span>{formatDateTr(item.end_date)}</span>
                </div>
                {nights > 0 && (
                  <div className="text-[11px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
                    {nights} gece
                  </div>
                )}
                {item.note && (
                  <div className="text-[11px] text-[var(--color-stone-400)] tracking-[0.04em] uppercase mt-1.5 truncate">
                    {item.note}
                  </div>
                )}
              </div>
            </div>

            {/* 🛡️ FAZ 29 — Aksiyon grubu: Düzenle + Sil */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href={`/maki-admin/manual-reservations/${item.id}`}
                className="
                  inline-flex items-center gap-1.5 text-[13px]
                  text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)]
                  px-3 py-1.5 rounded-lg
                  border border-transparent
                  hover:bg-white hover:border-[var(--color-champagne-300)]
                  transition-colors motion-reduce:transition-none
                "
                aria-label="Düzenle"
              >
                <Pencil size={13} />
                Düzenle
              </Link>
              <button
                onClick={() => handleDelete(item.id)}
                disabled={loadingId === item.id}
                className="
                  inline-flex items-center gap-1.5 text-[13px]
                  text-red-600 hover:text-red-700
                  px-3 py-1.5 rounded-lg hover:bg-red-50
                  transition-colors motion-reduce:transition-none
                  disabled:opacity-40
                "
              >
                <Trash2 size={13} />
                {loadingId === item.id ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          </div>
        );
      })}
    </div>

    {/* ════════ PAGINATION BAR (villas paritesi) ════════ */}
    {totalPages > 1 && (
      <PaginationBar page={safePage} totalPages={totalPages} onGoto={gotoPage} />
    )}
    </>
  );
}

/* ===============================================================
   PaginationBar — önceki/sonraki + numaralı sayfa pillarları
   ===============================================================
   ← Önceki  1  2  3 … 42  Sonraki →  (aktif sayfa champagne pill). */
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
      className="flex flex-wrap items-center justify-center gap-1.5 pt-4"
    >
      <button
        type="button"
        onClick={() => onGoto(page - 1)}
        disabled={prevDisabled}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ChevronLeft size={14} />
        Önceki
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 py-1.5 text-[12.5px] text-[var(--color-stone-400)]"
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
              "inline-flex items-center justify-center min-w-[32px] px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium tabular-nums transition-colors motion-reduce:transition-none " +
              (p === page
                ? "bg-[var(--color-champagne-600)] text-white"
                : "text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)]")
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
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] hover:bg-[var(--color-sand-50)] transition-colors motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        Sonraki
        <ChevronRight size={14} />
      </button>
    </nav>
  );
}
