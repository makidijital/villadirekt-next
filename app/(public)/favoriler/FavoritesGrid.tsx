"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Trash2, Share2, Check, AlertCircle } from "lucide-react";

import VillaCard from "@/app/components/villa/VillaCard";
import { useFavorites } from "@/hooks/use-favorites";
/* 🛡️ Villa Migration S1 — client boundary: runtime villa.service import'u
   yerine server action. Tip (VillaDTO) type-only import → erase edilir,
   client bundle'a villa.service SIZMAZ. Call-site alias ile değişmez. */
import {
  getVillasByIdsAction as getVillasByIds,
  getVillaBadgesAction,
} from "@/app/services/villa.action";
/* 🔒 Action artık tam VillaDTO değil, yalnız kart alanlarını döndürür
   (bkz. villa.action.ts PUBLIC PAYLOAD SINIRI). Tip action'dan türetilir. */
type FavoriteVilla = Awaited<ReturnType<typeof getVillasByIds>>[number];
/* 🛡️ FAZ 37 — Paylaşılabilir favori listesi service (DB snapshot). */
import { createSharedFavoritesListAction as createSharedFavoritesList } from "./shared-favorites.action";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`favoritesPage` namespace). localStorage favori mantığı, share token
   akışı ve VillaCard veri akışı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ FAZ 36 — FAVORITES GRID (client island)
   ===============================================================
   /favoriler client componenti.

   FLOW:
     1) useFavorites hook → localStorage'dan villa.id dizisi
     2) Mount sonrası getVillasByIds(favorites) → VillaDTO[]
        (visibility filter'lı; pasif/silinmiş otomatik düşer)
     3) VillaCard list render

   STATES:
     - loading            : hydrate öncesi + ilk fetch sırası
     - empty (no favs)    : premium curated wishlist boş state
     - empty (all stale)  : favori var ama hepsi pasif/silinmiş →
                            ufak bilgi mesajı
     - list               : VillaCard grid

   PERFORMANCE:
     - localStorage ID array değiştikçe re-fetch (useEffect deps)
     - O(1) lookup; toggle anında listede güncellenme; gereksiz
       re-fetch'i useMemo + key olarak ids JSON ile yönetiyoruz.
     - Cache YOK (kullanıcı-bazlı veri; her oturumda fresh).

   SSR:
     Server component'in render ettiği initial HTML her zaman boş
     placeholder/loading state. Client mount sonrası localStorage
     okunur, gerçek liste yüklenir. Hidrasyon mismatch YOK.

   DOKUNULMAYAN:
     reservation engine, pricing, BookingSidebar, review, search,
     gallery, cache, sidebar, private URL system.
   =============================================================== */

export default function FavoritesGrid({
  /* 🛡️ Opsiyonel — verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const dict = getDictionary(locale).favoritesPage;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const {
    favorites,
    isHydrated,
    clearFavorites,
    count,
  } = useFavorites();

  const [villas, setVillas] = useState<FavoriteVilla[]>([]);
  /* 🛡️ Kart rozeti çevirileri — villa fetch'i ile AYNI effect'te TEK
     batch çağrısı (villa başına istek YOK). TR'de action boş obje
     döner (sorgu atılmaz) → TR davranışı BİREBİR eskisi gibi. */
  const [badgeById, setBadgeById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  /* 🛡️ FAZ 37 — Share state.
     idle / loading / success(url) / error(message). Inline panel
     ile gösterilir; public sayfada toast provider yok. */
  type ShareState =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; url: string; copied: boolean }
    | { kind: "error"; message: string };
  const [shareState, setShareState] = useState<ShareState>({ kind: "idle" });

  /* Re-fetch trigger: favorites array içeriği değişince. Stringify
     ile shallow compare; UUID dizileri kısa, maliyetsiz. */
  const idsKey = useMemo(
    () => JSON.stringify([...favorites].sort()),
    [favorites]
  );

  useEffect(() => {
    if (!isHydrated) return;
    if (favorites.length === 0) {
      setVillas([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getVillasByIds(favorites);
        if (cancelled) return;
        const badges = await getVillaBadgesAction(
          result.map((v) => v.id),
          locale
        ).catch(() => ({}));
        if (cancelled) return;
        setBadgeById(badges);
        /* localStorage insertion order'a göre kullanıcının "son
           eklediği üstte" beklentisini karşıla. favorites array'i
           append-order; villaResult'ı bu sıraya göre yeniden ord et. */
        const indexOf = new Map(favorites.map((id, idx) => [id, idx]));
        const sorted = [...result].sort((a, b) => {
          const ai = indexOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bi = indexOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          /* Recent favorited first → büyük index önce */
          return bi - ai;
        });
        setVillas(sorted);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, isHydrated, locale]);

  const handleClear = useCallback(() => {
    /* Native confirm — public sayfada toast/modal sistemi yok;
       admin NotificationProvider buraya wire edilmedi. */
    if (typeof window === "undefined") return;
    const ok = window.confirm(dict.clearConfirm);
    if (!ok) return;
    clearFavorites();
    setVillas([]);
  }, [clearFavorites]);

  /* 🛡️ FAZ 37 — Share handler.
     - createSharedFavoritesList(localStorageIds) → token
     - URL = window.location.origin + "/favoriler/paylas/" + token
     - navigator.clipboard.writeText → premium toast yerine inline
       success panel; copy failed olursa URL inline gösterilir. */
  const handleShare = useCallback(async () => {
    if (shareState.kind === "loading") return;
    if (favorites.length === 0) return;

    setShareState({ kind: "loading" });
    const res = await createSharedFavoritesList(favorites);
    if (!res.ok) {
      /* 🛡️ Sunucu hata metni yerine locale-aware generic mesaj. */
      setShareState({ kind: "error", message: dict.shareError });
      return;
    }

    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    const url = `${origin}${localePrefix}/favoriler/paylas/${res.token}`;

    /* Clipboard — defansif: API yoksa veya permission düşerse URL
       success panel'de gösterilir (manuel kopya). */
    let copied = false;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }

    setShareState({ kind: "success", url, copied });
  }, [favorites, shareState.kind]);

  /* ----------------- HYDRATE OLMAMIŞ / LOADING ----------------- */
  if (!isHydrated || (loading && villas.length === 0)) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16"
        aria-busy="true"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse space-y-5">
            <div className="aspect-[5/6] rounded-xl bg-[var(--color-sand-100)]/60" />
            <div className="px-1 space-y-3">
              <div className="h-3 w-1/3 bg-[var(--color-sand-100)] rounded" />
              <div className="h-5 w-2/3 bg-[var(--color-sand-100)] rounded" />
              <div className="h-4 w-1/4 bg-[var(--color-sand-100)] rounded mt-4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ----------------- EMPTY (hiç favori yok) ----------------- */
  if (count === 0) {
    return (
      <div
        className="
          rounded-3xl bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
          px-6 py-16 md:px-12 md:py-24
          text-center
        "
      >
        <div
          className="
            w-14 h-14 rounded-full mx-auto
            bg-white border border-[var(--color-stone-100)]
            flex items-center justify-center
            text-[var(--color-champagne-700)]
            shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
          "
          aria-hidden
        >
          <Heart size={18} strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] mt-6 tracking-[-0.015em]">
          {dict.emptyTitle}
        </h2>
        <p className="text-[14.5px] md:text-[15px] leading-[1.65] text-[var(--color-stone-500)] mt-4 max-w-md mx-auto">
          {dict.emptyBody}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`${localePrefix}/kiralik-villalar`}
            className="
              inline-flex items-center gap-2
              px-5 py-2.5 rounded-full
              bg-[var(--color-stone-900)] text-white
              text-[13px] font-medium tracking-[0.02em]
              hover:bg-[var(--color-stone-700)]
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--color-champagne-500)]/40
            "
          >
            {dict.emptyExploreCta}
          </Link>
          <Link
            href={`${localePrefix}/arama`}
            className="
              inline-flex items-center gap-2
              px-5 py-2.5 rounded-full
              border border-[var(--color-stone-200)]
              text-[13px] font-medium text-[var(--color-stone-700)]
              hover:border-[var(--color-champagne-500)] hover:text-[var(--color-stone-900)]
              hover:bg-white
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--color-champagne-500)]/40
            "
          >
            {dict.emptySearchCta}
          </Link>
        </div>
      </div>
    );
  }

  /* ----------------- TÜM FAVORİLER PASİF/SİLİNMİŞ -----------------
     Liste boş ama localStorage'da id var → kullanıcıya küçük açıklama. */
  if (villas.length === 0) {
    return (
      <div
        className="
          rounded-3xl bg-white border border-[var(--color-stone-100)]
          px-6 py-12 md:px-10 md:py-16
          text-center
        "
      >
        <h2 className="font-display text-xl md:text-2xl text-[var(--color-stone-900)] tracking-[-0.015em]">
          {dict.unavailableTitle}
        </h2>
        <p className="text-[14px] text-[var(--color-stone-500)] mt-3 max-w-md mx-auto">
          {dict.unavailableBody}
        </p>
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href={`${localePrefix}/kiralik-villalar`}
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-full
              bg-[var(--color-stone-900)] text-white
              text-[13px] font-medium tracking-[0.02em]
              hover:bg-[var(--color-stone-700)]
              transition-colors motion-reduce:transition-none
            "
          >
            {dict.unavailableExploreCta}
          </Link>
          <button
            type="button"
            onClick={handleClear}
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-full
              border border-[var(--color-stone-200)]
              text-[13px] font-medium text-[var(--color-stone-700)]
              hover:border-red-300 hover:text-red-700 hover:bg-red-50
              transition-colors motion-reduce:transition-none
            "
          >
            <Trash2 size={14} />
            {dict.unavailableClearCta}
          </button>
        </div>
      </div>
    );
  }

  /* ----------------- LIST ----------------- */
  return (
    <div className="space-y-10">
      {/* Toolbar — count + actions (paylaş + temizle) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-[var(--color-stone-500)] tabular-nums">
          <span className="font-display text-[16px] text-[var(--color-stone-900)] mr-1.5 tracking-[-0.01em]">
            {villas.length}
          </span>
          {dict.countSuffix}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 🛡️ FAZ 37 — Listeyi Paylaş CTA.
             Premium subtle pill. Loading state buton içinde; success
             feedback alttaki inline panel'de.
             villas.length > 0 zaten LIST branch'inde garantili. */}
          <button
            type="button"
            onClick={handleShare}
            disabled={
              shareState.kind === "loading" || villas.length === 0
            }
            className="
              inline-flex items-center gap-2
              text-[13px] font-medium
              px-4 py-2 rounded-full
              border border-[var(--color-stone-200)]
              text-[var(--color-stone-700)]
              hover:border-[var(--color-champagne-500)]
              hover:text-[var(--color-stone-900)]
              hover:bg-[var(--color-sand-50)]
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--color-champagne-500)]/40
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            aria-label={dict.shareAriaLabel}
          >
            <Share2 size={13} aria-hidden />
            {shareState.kind === "loading"
              ? dict.sharePreparing
              : dict.shareCta}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="
              inline-flex items-center gap-2
              text-[13px] font-medium
              text-[var(--color-stone-500)]
              hover:text-red-700
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-red-200 rounded-md
              px-2 py-1
            "
            aria-label={dict.clearAriaLabel}
          >
            <Trash2 size={13} />
            {dict.clearCta}
          </button>
        </div>
      </div>

      {/* 🛡️ FAZ 37 — Inline share status panel.
         success: link kopyalandı + URL preview; clipboard fail durumunda
         URL kopya kutusu ile manual fallback.
         error: kırmızı pill. */}
      {shareState.kind === "success" && (
        <div
          role="status"
          className="
            flex flex-wrap items-center justify-between gap-3
            rounded-2xl border border-emerald-200 bg-emerald-50/70
            px-4 py-3
          "
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="
                w-8 h-8 rounded-full
                bg-white border border-emerald-200
                flex items-center justify-center
                text-emerald-700 shrink-0
              "
              aria-hidden
            >
              <Check size={14} />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-emerald-900">
                {shareState.copied ? dict.shareCopied : dict.shareReady}
              </p>
              <p className="text-[12px] text-emerald-800/70 truncate font-mono mt-0.5">
                {shareState.url}
              </p>
            </div>
          </div>
          <a
            href={shareState.url}
            target="_blank"
            rel="noopener noreferrer"
            className="
              shrink-0
              inline-flex items-center gap-1.5
              text-[12.5px] font-medium
              text-emerald-800
              hover:text-emerald-900
              underline underline-offset-2 decoration-emerald-300
              hover:decoration-emerald-500
              transition-colors motion-reduce:transition-none
            "
          >
            {dict.sharePreview}
          </a>
        </div>
      )}
      {shareState.kind === "error" && (
        <div
          role="alert"
          className="
            flex items-center gap-3
            rounded-2xl border border-red-200 bg-red-50
            px-4 py-3
          "
        >
          <span
            className="
              w-8 h-8 rounded-full
              bg-white border border-red-200
              flex items-center justify-center
              text-red-700 shrink-0
            "
            aria-hidden
          >
            <AlertCircle size={14} />
          </span>
          <p className="text-[13px] text-red-900">{shareState.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-12 md:gap-y-16">
        {villas.map((villa) => (
          <VillaCard
            key={villa.id}
            id={villa.id}
            slug={villa.slug}
            title={villa.title}
            location={villa.location}
            price={villa.price}
            currency={villa.currency || "TRY"}
            images={villa.images}
            badge={badgeById[villa.id] ?? villa.badge}
            bedrooms={villa.bedrooms || 1}
            bathrooms={villa.bathrooms || 1}
            guests={villa.guests || 2}
            reviewAverage={villa.review_average}
            reviewCount={villa.review_count}
            /* 🛡️ Kart metinleri + detay linki locale-aware. */
            locale={locale}
          />
        ))}
      </div>
    </div>
  );
}
