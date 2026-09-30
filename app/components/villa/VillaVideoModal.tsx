"use client";

/* ===============================================================
   🛡️ VillaVideoModal — premium video modal (hero button trigger)
   ===============================================================
   AMAÇ:
     Villa hero görselindeki "Villa Videosu" butonundan tetiklenen
     modal player. İnline VillaVideoSection yerine modal pattern;
     hero + video aynı görsel hiyerarşide; section breaking yok.

   PERFORMANCE:
     - isOpen=false iken iframe yok, fetch yok, DOM minimal.
     - Modal açılınca: thumbnail değil, doğrudan iframe (kullanıcı
       gesture sonrası autoplay=1 — browser policy uyumlu).
     - Aspect-video container → CLS = 0.
     - Lazy mount: modal kapalıyken `null` döner.

   UX:
     - ESC tuşu → close
     - Backdrop click → close
     - Body scroll lock (mount/unmount cleanup, prev value restore)
     - role="dialog" + aria-modal
     - Mobile-safe (max-w + max-h limit, w-full sm)
     - Premium: rounded-3xl, shadow-2xl, kara backdrop + blur
     - Close button top-right glass circle (kapatma vurgusu)
     - Multi-video: alt thumbnail tab nav (sekme değişince iframe re-mount)

   SECURITY:
     - Embed URL: youtube-nocookie.com (helper'dan)
     - autoplay=1 yalnız user gesture sonrası (modal click = gesture)
     - referrerPolicy: strict-origin-when-cross-origin
     - allow: minimum gerekli
     - allowFullScreen evet

   ASLA dokunulmadı: existing youtube helper, gallery navigation,
   pricing, booking, reservation, availability, API route.
   =============================================================== */

import { useEffect, useState } from "react";
import { X, Play } from "lucide-react";

import {
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";

/* 🛡️ PHASE 10G — locale-aware erişilebilirlik metinleri. `locale`
   OPSİYONEL, default "tr" → TR çıktısı BİREBİR AYNI. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  videos: VillaYouTubeVideo[];
  villaTitle?: string;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
};

export default function VillaVideoModal({
  isOpen,
  onClose,
  videos,
  villaTitle,
  locale,
}: Props) {
  const dict = getDictionary(locale);
  /* Aktif sekme — hangi videonun gösterildiği (multi-video).
     Her modal açılışında 0'a reset (state-local useState mount). */
  const [activeIndex, setActiveIndex] = useState(0);

  /* === ESC tuşu → close === */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* === Body scroll lock === */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  /* Her açılışta sekme reset — eski active state'i taşıma.
     React 19 `set-state-in-effect` rule trivial cascade flag eder
     ama burada bilinçli: modal yeniden açıldığında ilk video
     gösterilsin. Tek setState, deps = [isOpen]. */
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (!videos || videos.length === 0) return null;

  const activeVideo = videos[activeIndex] ?? videos[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        villaTitle
          ? formatDictionaryString(dict.gallery.videoModalAriaLabelWithTitle, {
              title: villaTitle,
            })
          : dict.gallery.videoModalAriaLabel
      }
      className="fade-in fixed inset-0 z-[1100] flex items-center justify-center p-4"
    >
      {/* Backdrop — kara + blur. Click → close. */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Panel — 16:9, max-w-5xl, rounded-3xl shadow-2xl */}
      <div className="relative w-full max-w-5xl">
        {/* Close button — top-right glass circle, modal'ın DIŞINDA
            görsel olarak (overflow-visible parent) */}
        <button
          type="button"
          onClick={onClose}
          aria-label={dict.gallery.closeVideoAriaLabel}
          className="
            absolute -top-12 right-0 sm:-top-2 sm:-right-12
            w-10 h-10 rounded-full
            bg-white/15 hover:bg-white/25
            border border-white/25
            backdrop-blur-md
            flex items-center justify-center
            text-white
            transition-colors motion-reduce:transition-none
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60
            z-10
          "
        >
          <X size={18} />
        </button>

        {/* Player container — 16:9, rounded-3xl, shadow-2xl */}
        <div
          className="
            relative w-full overflow-hidden
            rounded-3xl bg-black
            shadow-2xl
            aspect-video
          "
        >
          <iframe
            key={activeVideo.id /* sekme değişince re-mount → temiz state */}
            src={`${getYouTubeEmbedUrl(activeVideo.id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={
              villaTitle
                ? formatDictionaryString(dict.gallery.videoFrameTitleWithTitle, {
                    title: villaTitle,
                  })
                : dict.gallery.videoFrameTitle
            }
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>

        {/* MULTI-VIDEO TABS — birden fazla varsa */}
        {videos.length > 1 && (
          <div
            role="tablist"
            aria-label={dict.gallery.otherVideosAriaLabel}
            className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
          >
            {videos.map((v, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveIndex(i)}
                  className={
                    "relative shrink-0 overflow-hidden rounded-xl " +
                    "transition-all duration-200 motion-reduce:transition-none " +
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 " +
                    (isActive
                      ? "ring-2 ring-white ring-offset-2 ring-offset-black/0"
                      : "opacity-65 hover:opacity-100")
                  }
                  style={{ width: 124, height: 70 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getYouTubeThumbnailUrl(v.id, "hq")}
                    alt={`Video ${i + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Play hint icon — non-active'ler için */}
                  {!isActive && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center bg-black/30"
                    >
                      <Play
                        size={20}
                        strokeWidth={1.5}
                        fill="currentColor"
                        className="text-white drop-shadow-md"
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
