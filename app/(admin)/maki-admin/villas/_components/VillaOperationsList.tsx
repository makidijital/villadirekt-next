"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import {
  Image as ImageIcon,
  Pencil,
  ArrowUpRight,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { VillaActions } from "../VillaActions";
import { VillaTemporaryUrlButton } from "../VillaTemporaryUrlButton";
import { VillaZipShareButton } from "../VillaZipShareButton";

/* ===============================================================
   🛡️ VillaOperationsList — admin operasyon ekranı (pagination + search)
   ===============================================================
   `/maki-admin/villas` route'una bağlı client component.

   YENİ DAVRANIŞ (URL-bound):
     - Search: useSearchParams + router.replace + debounce (350ms)
     - Pagination: ?page=N, ?pageSize=M
     - URL state source-of-truth → bookmark / browser refresh /
       back-forward navigation hepsi tutarlı
     - Search değişince page=1'e reset
     - PageSize değişince page=1'e reset
     - Default değerler URL'e yazılmaz (clean URL)

   KORUNAN DAVRANIŞLAR:
     - 8 aksiyon: Düzenle / Galeri / Takvim / Temporary URL / ZIP /
       Detay / Pasifleştir / Kopyala / Sil (VillaActions reuse)
     - Drag-drop YOK (sıralama /siralama route'unda — bu ekran etkilenmez)
     - AUDIT log akışları VillaActions ve clone handler içinde aynen
     - VillaTemporaryUrlButton + VillaZipShareButton client island'ları
       aynen reuse
=============================================================== */

type VillaItem = {
  id: string;
  title: string;
  location?: string;
  is_active?: boolean;
  images?: string[];
  slug?: string | null;
  [k: string]: unknown;
};

type Props = {
  initialVillas: VillaItem[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  status?: string;
  document?: string;
  allowedPageSizes: number[];
};

const SEARCH_DEBOUNCE_MS = 350;

export default function VillaOperationsList({
  initialVillas,
  total,
  page,
  pageSize,
  q,
  status,
  document,
  allowedPageSizes,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  /* Local search state — URL hâlâ source-of-truth, ama input controlled
     olsun diye local state. Server q değişirse (back/forward) local
     state sync edilir. */
  const [searchValue, setSearchValue] = useState<string>(q);

  /* Track son URL'e yazılan q değerini ki, server'dan gelen q (back
     navigation) ile local state aynı olduğunda gereksiz router.replace
     yapmasın. */
  const lastUrlQ = useRef<string>(q);

  /* Server q değişti (örn. user back tuşuna bastı) → local input'u sync et.
     🛡️ Yalnız DIŞ değişimde (back/forward) sync; kendi router.replace
     echo'muzda (q === lastUrlQ.current) ATLA → in-flight kullanıcı girişi
     overwrite edilmez (son-karakter silinme bug fix). */
  useEffect(() => {
    if (q !== lastUrlQ.current) {
      setSearchValue(q);
      lastUrlQ.current = q;
    }
  }, [q]);

  /* URL builder — diğer query parametrelerini korur. Default değerler
     URL'den temizlenir (page=1, pageSize=30, q="" yazılmaz). */
  const buildHref = useCallback(
    (next: {
      page?: number;
      pageSize?: number;
      q?: string;
      status?: string | null;
      document?: string | null;
    }) => {
      const sp = new URLSearchParams(searchParams?.toString() || "");

      if (next.page !== undefined) {
        if (next.page <= 1) sp.delete("page");
        else sp.set("page", String(next.page));
      }
      if (next.pageSize !== undefined) {
        if (next.pageSize === 30) sp.delete("pageSize");
        else sp.set("pageSize", String(next.pageSize));
      }
      if (next.q !== undefined) {
        if (next.q.trim().length === 0) sp.delete("q");
        else sp.set("q", next.q.trim());
      }
      /* status: "all"/null → param sil (default); active/passive → set. */
      if (next.status !== undefined) {
        if (next.status === null || next.status === "all") sp.delete("status");
        else sp.set("status", next.status);
      }
      /* document: "all"/null → param sil (default); licensed/unlicensed → set. */
      if (next.document !== undefined) {
        if (next.document === null || next.document === "all") {
          sp.delete("document");
        } else {
          sp.set("document", next.document);
        }
      }

      const qs = sp.toString();
      return qs.length > 0 ? `${pathname}?${qs}` : pathname;
    },
    [searchParams, pathname]
  );

  /* Debounced search → URL push. q değişince page=1'e reset. */
  useEffect(() => {
    if (searchValue === lastUrlQ.current) return;

    const t = setTimeout(() => {
      lastUrlQ.current = searchValue.trim();
      router.replace(buildHref({ q: searchValue, page: 1 }), {
        scroll: false,
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [searchValue, router, buildHref]);

  /* Page size değişimi → page=1 reset. */
  function handlePageSizeChange(newSize: number) {
    if (newSize === pageSize) return;
    router.replace(buildHref({ pageSize: newSize, page: 1 }), {
      scroll: false,
    });
  }

  /* Belge filtresi değişimi → page=1 reset (q/status/pageSize korunur). */
  function handleDocumentChange(next: string) {
    router.replace(
      buildHref({
        document: next === "all" ? null : next,
        page: 1,
      }),
      { scroll: false }
    );
  }

  /* Sayfa değişimi (önceki/sonraki/sayfa tıklama). */
  function gotoPage(newPage: number) {
    if (newPage === page) return;
    router.replace(buildHref({ page: newPage }), { scroll: false });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-4">
      {/* ════════ TOOLBAR — search + pageSize selector + count ════════ */}
      <div className="admin-filter-bar flex flex-wrap items-center gap-3">
        <div className="admin-pill-search flex-1 min-w-[200px]">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Mülk adı veya slug ara…"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>

        {/* STATUS FILTER — Tümü / Aktif / Pasif (URL-driven, page=1 reset) */}
        <label className="inline-flex items-center gap-2 text-[12px] text-[var(--admin-muted-2)]">
          <span>Durum</span>
          <select
            value={status ?? "all"}
            onChange={(e) => {
              const next = e.target.value;
              router.replace(
                buildHref({
                  status: next === "all" ? null : next,
                  page: 1,
                }),
                { scroll: false }
              );
            }}
            className="
              text-[12.5px] rounded-lg border border-[var(--admin-border)]
              bg-white px-2 py-1
              text-[var(--admin-text)]
              focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent-soft,rgba(0,0,0,0.08))]
            "
          >
            <option value="all">Tümü</option>
            <option value="active">Aktif</option>
            <option value="passive">Pasif</option>
          </select>
        </label>

        {/* BELGE FILTER — Tümü / Belgeli / Belgesiz (URL-driven, page=1 reset) */}
        <label className="inline-flex items-center gap-2 text-[12px] text-[var(--admin-muted-2)]">
          <span>Belge</span>
          <select
            value={document ?? "all"}
            onChange={(e) => handleDocumentChange(e.target.value)}
            className="
              text-[12.5px] rounded-lg border border-[var(--admin-border)]
              bg-white px-2 py-1
              text-[var(--admin-text)]
              focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent-soft,rgba(0,0,0,0.08))]
            "
          >
            <option value="all">Tümü</option>
            <option value="licensed">Belgeli</option>
            <option value="unlicensed">Belgesiz</option>
          </select>
        </label>

        {/* PAGE SIZE SELECTOR */}
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
            {allowedPageSizes.map((sz) => (
              <option key={sz} value={sz}>
                {sz}
              </option>
            ))}
          </select>
        </label>

        {/* TOTAL + RANGE */}
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2 tabular-nums">
          {total > 0 ? (
            <>
              {rangeStart}-{rangeEnd} / {total}
            </>
          ) : (
            <>0 / 0</>
          )}
        </span>
      </div>

      {/* ════════ LIST ════════ */}
      {initialVillas.length === 0 && q.length > 0 ? (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted-2)]">
          <p className="font-medium text-[var(--admin-text)]">
            &ldquo;{q}&rdquo; aramasıyla eşleşen villa yok
          </p>
          <p className="text-[12.5px] mt-1">
            Farklı bir arama denemeyi veya filtreyi temizlemeyi deneyin.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {initialVillas.map((villa) => (
            <OperationsVillaCard key={villa.id} villa={villa} />
          ))}
        </div>
      )}

      {/* ════════ PAGINATION BAR ════════ */}
      {totalPages > 1 && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          onGoto={gotoPage}
        />
      )}
    </div>
  );
}

/* ===============================================================
   PaginationBar — önceki/sonraki + numaralı sayfa pillarları
   ===============================================================
   Görünüm: ← Önceki  1  2  3 … 42  Sonraki →
   Aktif sayfa coral pill; +/- 2 komşu + first/last her zaman görünür.
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

/* Sayfa numarası penceresi — `1 2 3 … 42` paterni.
   Algoritma:
     - Her zaman 1 ve last görünür
     - Aktif sayfa +/- 2 komşu görünür
     - Aralarda ellipsis. */
function computePageWindow(page: number, totalPages: number): (number | "…")[] {
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
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}

/* ===============================================================
   OperationsVillaCard — kart: thumbnail + title + status + toolbar
=============================================================== */
function OperationsVillaCard({ villa }: { villa: VillaItem }) {
  const isInactive = villa.is_active === false;
  const coverImage =
    Array.isArray(villa.images) && villa.images.length > 0
      ? villa.images[0]
      : null;

  return (
    <article
      className={
        "admin-card p-3 md:p-4 flex flex-col md:flex-row md:items-start gap-3 md:gap-4 group relative " +
        /* 🛡️ Pasif villa görsel vurgusu — yalnız is_active === false.
           Soft kırmızı arka plan + kırmızı border (admin-card bg/border'ı
           class ile geldiği için `!` ile override). Aktif villalar
           ETKİLENMEZ; kart yapısı/yükseklik/hover (shadow+transform)
           korunur. */
        (isInactive ? "!bg-red-50 !border-red-200 " : "")
      }
    >
      {/* 🛡️ Kart tıklama → PUBLIC villa detay sayfası (mevcut gerçek
         slug kullanılır; slug üretimi/hardcode YOK). "Stretched
         link" deseni: bu Link kartın tamamını kaplar (absolute
         inset-0) ama z-index'i ACTION TOOLBAR'ın (aşağıda
         `relative z-[2]`) altında kalır — böylece Düzenle / Galeri /
         Takvim / Temporary URL / ZIP / Detay / Pasifleştir / Kopyala /
         Sil aksiyonları kendi tıklama davranışını AYNEN korur; yalnız
         thumbnail/başlık/durum rozeti gibi boş kart alanına tıklamak
         public sayfaya gider. slug yoksa hiç render edilmez (kırık
         link oluşmaz). */}
      {villa.slug ? (
        <Link
          href={`/kiralik-villa/${villa.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${villa.title} — genel (public) mülk sayfasını aç`}
          className="absolute inset-0 z-[1]"
        />
      ) : null}

      {/* THUMBNAIL */}
      <div
        className="
          shrink-0 w-full h-40 md:w-28 md:h-24
          rounded-xl overflow-hidden
          bg-[var(--admin-bg-soft)]
          border border-[var(--admin-border)]
          flex items-center justify-center
          text-[var(--admin-muted-2)]
        "
      >
        {coverImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={coverImage}
            alt={villa.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={18} aria-hidden />
        )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-[16px] md:text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
                {villa.title}
              </h3>
              {isInactive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-amber-500"
                  />
                  Pasif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  />
                  Aktif
                </span>
              )}
            </div>
            <p className="text-[12px] text-[var(--admin-muted-2)] mt-0.5 truncate">
              {villa.location || "—"}
              <span className="mx-1.5 text-[var(--admin-border-strong)]">·</span>
              <span className="font-mono">#{String(villa.id).slice(0, 4)}</span>
            </p>
          </div>
        </div>

        {/* ACTION TOOLBAR — aksiyonlar AYNEN korundu. Mobilde 2 kolon grid
           (kart genişliği içinde kalır); md+ mevcut flex-wrap düzeni. */}
        <div className="relative z-[2] grid grid-cols-2 gap-1.5 md:flex md:items-center md:flex-wrap">
          <Link
            href={`/maki-admin/villas/${villa.id}`}
            className="admin-btn-ghost"
          >
            <Pencil size={13} />
            Düzenle
          </Link>

          <Link
            href={`/maki-admin/villas/${villa.id}/galeri`}
            className="admin-btn-primary"
          >
            <ImageIcon size={13} />
            Galeri
          </Link>

          <Link
            href={`/maki-admin/manual-reservations/ekle?villa=${encodeURIComponent(
              String(villa.id)
            )}`}
            className="admin-btn-ghost"
            title="Bu mülk için takvimi aç ve yeni blok ekle"
          >
            <Calendar size={13} />
            Takvim
          </Link>

          {isInactive && (
            <VillaTemporaryUrlButton
              villaId={String(villa.id)}
              villaTitle={String(villa.title || "Mülk")}
            />
          )}

          <VillaZipShareButton
            villaId={String(villa.id)}
            villaTitle={String(villa.title || "Mülk")}
          />

          <Link
            href={`/maki-admin/villas/${villa.id}`}
            className="
              hidden md:inline-flex items-center gap-1
              px-2.5 py-1.5 rounded-lg
              text-[12.5px] font-medium
              text-[var(--admin-muted)]
              hover:text-[var(--admin-text)]
              hover:bg-[var(--admin-bg-soft)]
              transition-colors motion-reduce:transition-none
            "
          >
            Detay
            <ArrowUpRight size={12} />
          </Link>

          <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:flex-nowrap">
            <VillaActions
              villaId={String(villa.id)}
              villaTitle={String(villa.title || "Mülk")}
              initialActive={villa.is_active !== false}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
