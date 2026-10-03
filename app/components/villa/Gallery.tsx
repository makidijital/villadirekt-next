"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Play } from "lucide-react";
import WatermarkOverlay from "./WatermarkOverlay";
import VillaVideoModal from "./VillaVideoModal";
import type { WatermarkPosition } from "@/app/services/settings.types";
import type { VillaYouTubeVideo } from "@/lib/youtube.helper";
/* 🛡️ PHASE 10B — locale-aware UI stringleri. `locale` opsiyonel,
   default "tr" (getDictionary(undefined) zaten TR'ye düşer) — mevcut
   TR call-site'ları (kiralik-villa/[slug]/page.tsx, v/[token]/page.tsx,
   AdminGallery.tsx) HİÇ DEĞİŞMEDEN, byte-identical render etmeye devam
   eder. Lightbox/swipe/keyboard/video-modal/image-loading mantığına
   DOKUNULMADI — yalnız UI string kaynağı değişti. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import type { Locale } from "@/lib/i18n/config";

type WatermarkProps = {
  logo?: string | null;
  enabled?: boolean | null;
  opacity?: number | null;
  position?: WatermarkPosition | null;
  size?: number | null;
};

/* 🛡️ SEO + a11y ALT TEXT — villa.title + image index pattern.
   Cover (index 0) için "kapak fotoğrafı"; diğerleri için sıra numarası.
   Schema.org image SEO ve screen-reader uyumu için. DB'de alt_text
   kolonu yok; auto-generation yeterli. Custom alt_text ileride DB
   eklenirse bu helper'ı override edebilir.

   `villaTitle` opsiyonel — verilmezse generic "Villa" fallback,
   eski kullanım davranışı aynen korunur (geriye dönük uyum). */
function buildImageAlt(
  villaTitle: string | undefined | null,
  index: number,
  total: number,
  dict: ReturnType<typeof getDictionary>
): string {
  const t = (villaTitle || "Villa").trim();
  if (index === 0) {
    return formatDictionaryString(dict.gallery.coverPhotoAlt, { title: t });
  }
  if (total > 1) {
    return formatDictionaryString(dict.gallery.photoAltWithTotal, {
      title: t,
      index: index + 1,
      total,
    });
  }
  return formatDictionaryString(dict.gallery.photoAlt, {
    title: t,
    index: index + 1,
  });
}

export default function Gallery({
  images,
  watermark,
  villaTitle,
  videos,
  actions,
  locale,
}: {
  images: string[];
  watermark?: WatermarkProps;
  /** 🛡️ SEO + a11y: alt text auto-generation için. Opsiyonel; eski
   *  caller'lar (yoksa) "Villa" generic fallback'a düşer. */
  villaTitle?: string;
  /* 🛡️ VillaInfoBar'dan taşındı (yalnız DOM konumu) — hero görselinin
     sol üst köşesinde overlay olarak render edilir. Video listesi boş/
     undefined ise CTA görünmez; mevcut VillaVideoModal AYNEN tüketiliyor. */
  videos?: VillaYouTubeVideo[] | null;
  /* 🛡️ VillaInfoBar'dan taşındı — Favori/Paylaş gibi caller-controlled
     aksiyon slotu (FavoriteButton). Logic'e ASLA dokunulmaz, yalnız DOM
     konumu. Opsiyonel — verilmezse hiçbir aksiyon görünmez. */
  actions?: ReactNode;
  /* 🛡️ PHASE 10B — opsiyonel, default "tr" (getDictionary(undefined)).
     TR call-site'ları bu prop'u hiç geçmeden BYTE-IDENTICAL çalışır. */
  locale?: Locale;
}) {
  const dict = getDictionary(locale);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const safeVideos = videos ?? [];
  const hasVideo = safeVideos.length > 0;

  /* 🛡️ MOBILE SWIPE — native touch handler (zero dependency).
     Lightbox modal içinde parmakla sağa-sola sürükleme ile prev/next.
     Masaüstü mouse/click davranışı, klavye ← → Esc, lightbox dış-tıkla
     kapatma, thumbnail tap → AYNEN korunur (touch event'leri yalnız
     touchscreen cihazlarda tetiklenir; mouse event'leriyle çakışmaz). */
  const touchStartX = useRef<number | null>(null);
  const SWIPE_THRESHOLD = 50;

  /* 🛡️ THUMBNAIL FILMSTRIP — lightbox aktif thumbnail referansları.
     scrollIntoView ile aktif thumb görünür alanda tutulur. Yalnız
     lightbox açıkken render edilir → LCP etkisi yok. */
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 🔥 scroll lock
  useEffect(() => {
    if (activeIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [activeIndex]);

  // 🔥 keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex]);

  /* 🛡️ Aktif thumbnail'i görünür alana kaydır (lightbox açılışında +
     her next/prev/klavye/swipe navigasyonunda). Sayfa scroll-lock
     olduğundan block:"nearest" dış scroll tetiklemez; inline:"center"
     yatay şeridi ortalar. */
  useEffect(() => {
    if (activeIndex === null) return;
    const el = thumbRefs.current[activeIndex];
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [activeIndex]);

  function next() {
    setActiveIndex((prev) =>
      prev !== null ? (prev + 1) % images.length : 0
    );
  }

  function prev() {
    setActiveIndex((prev) =>
      prev !== null ? (prev - 1 + images.length) % images.length : 0
    );
  }

  /* 🛡️ Touch handlers — lightbox swipe gesture.
     touchStart: ilk parmak teması X koordinatını sakla.
     touchEnd: bırakılan X ile delta hesapla; SWIPE_THRESHOLD aşılırsa
     yön bazında next/prev tetikle. Çoklu parmak (pinch) durumunda
     sessizce bypass. */
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) {
      touchStartX.current = null;
      return;
    }
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const endX = e.changedTouches[0]?.clientX;
    if (typeof endX !== "number") return;
    const dx = endX - startX;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) next();
    else prev();
  }

  if (!images || images.length === 0) {
    return (
      <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center">
        {dict.gallery.noImages}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        {/* 🛡️ VIDEO CTA + FAVORİ — hero'nun SOL ÜST köşesinde overlay.
            VillaInfoBar'dan taşındı; logic AYNEN (video modal aç/kapa,
            FavoriteButton/useFavorites), yalnız DOM konumu değişti.
            Gallery'nin lightbox/swipe/sayaç davranışına sıfır etkisi
            var — "Tüm Fotoğraflar" butonuyla aynı overlay dili
            (absolute + z-10) kullanılıyor, karşı köşede. */}
        {(actions || hasVideo) && (
          <div className="absolute top-3 left-3 md:top-4 md:left-4 z-10 flex items-center gap-2">
            {hasVideo && (
              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                aria-label={
                  villaTitle
                    ? formatDictionaryString(
                        dict.gallery.playVideoAriaLabelWithTitle,
                        { title: villaTitle }
                      )
                    : dict.gallery.playVideoAriaLabel
                }
                className="
                  group/video
                  inline-flex items-center gap-2.5
                  pl-2 pr-5 py-2
                  rounded-full
                  bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)]
                  text-white text-[13px] font-semibold tracking-wide
                  shadow-[0_10px_24px_-8px_rgb(27_26_23/0.5)]
                  hover:shadow-[0_14px_28px_-8px_rgb(27_26_23/0.55)]
                  transition-all duration-200 motion-reduce:transition-none
                  hover:-translate-y-[1px] motion-reduce:hover:translate-y-0
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                "
              >
                <span
                  aria-hidden
                  className="
                    relative inline-flex items-center justify-center
                    w-7 h-7 rounded-full
                    bg-white text-[var(--color-stone-900)]
                    shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]
                  "
                >
                  <Play
                    size={12}
                    strokeWidth={1.8}
                    fill="currentColor"
                    className="ml-0.5"
                  />
                </span>
                <span className="whitespace-nowrap">{dict.gallery.playVideo}</span>
              </button>
            )}
            {actions}
          </div>
        )}

        {/* 🛡️ MOBILE (<768px) — büyük hero + iki secondary; küçültülmüş
           desktop grid DEĞİL, kendine özgü kompozisyon. Tüm tıklamalar
           mevcut lightbox'ı tetikler (setActiveIndex); watermark her
           karede AYNEN. */}
        <div className="grid md:hidden gap-2">
          <div
            className="group relative overflow-hidden rounded-[18px] cursor-pointer aspect-[16/10]"
            onClick={() => setActiveIndex(0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0]}
              alt={buildImageAlt(villaTitle, 0, images.length, dict)}
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
            />
            <WatermarkOverlay {...watermark} />
          </div>

          {images.length >= 2 && (
            <div className="grid grid-cols-2 gap-2">
              <div
                className="group relative overflow-hidden rounded-[14px] cursor-pointer aspect-[3/2]"
                onClick={() => setActiveIndex(1)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[1]}
                  alt={buildImageAlt(villaTitle, 1, images.length, dict)}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
                />
                <WatermarkOverlay {...watermark} />
              </div>

              {images.length >= 3 && (
                <div
                  className="group relative overflow-hidden rounded-[14px] cursor-pointer aspect-[3/2]"
                  onClick={() => setActiveIndex(2)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[2]}
                    alt={buildImageAlt(villaTitle, 2, images.length, dict)}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-active:scale-[1.03]"
                  />
                  <WatermarkOverlay {...watermark} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 🔄 DESKTOP (≥768px) — kompakt mozaik (12 kolon × 2 satır):
           solda geniş ana görsel (7 kolon), sağda FARKLI boyutlarda en
           fazla 3 görsel: üstte geniş (5 kolon), altta 3 + 2 kolon.
           Görseller images[0..3] — mevcut sıra, her slot FARKLI foto.
           Az fotoğrafta (1/2/3) slotlar boşluğu dolduracak şekilde
           genişler. Yükseklik ~%23 azaldı (440/500 → 340/385).
           Tüm tıklamalar mevcut lightbox'ı aynı index ile açar;
           watermark her karede AYNEN. */}
        <div className="hidden md:grid grid-cols-12 grid-rows-2 gap-2 h-[340px] lg:h-[385px]">
          {(() => {
            const n = Math.min(images.length, 4);
            const slots: Array<{ idx: number; cls: string }> =
              n === 1
                ? [{ idx: 0, cls: "col-span-12 row-span-2 rounded-[20px]" }]
                : n === 2
                ? [
                    { idx: 0, cls: "col-span-7 row-span-2 rounded-[20px]" },
                    { idx: 1, cls: "col-span-5 row-span-2 rounded-[14px]" },
                  ]
                : n === 3
                ? [
                    { idx: 0, cls: "col-span-7 row-span-2 rounded-[20px]" },
                    { idx: 1, cls: "col-span-5 row-start-1 rounded-[14px]" },
                    { idx: 2, cls: "col-span-5 row-start-2 rounded-[14px]" },
                  ]
                : [
                    { idx: 0, cls: "col-span-7 row-span-2 rounded-[20px]" },
                    { idx: 1, cls: "col-span-5 row-start-1 rounded-[14px]" },
                    { idx: 2, cls: "col-span-3 row-start-2 rounded-[14px]" },
                    { idx: 3, cls: "col-span-2 row-start-2 rounded-[14px]" },
                  ];
            return slots.map(({ idx, cls }) => (
              <div
                key={idx}
                className={"group relative overflow-hidden cursor-pointer " + cls}
                onClick={() => setActiveIndex(idx)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={images[idx]}
                  alt={buildImageAlt(villaTitle, idx, images.length, dict)}
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                <WatermarkOverlay {...watermark} />
              </div>
            ));
          })()}
        </div>

        {/* 🛡️ TÜM FOTOĞRAFLAR — floating control, galeri köşesinde modern
           bir giriş noktası. Mevcut lightbox'ı index 0'dan açar; davranış
           AYNEN (yalnız yeni, görünür bir tetikleyici). Gerçek fotoğraf
           sayısı kullanılır — FAKE sayı YOK. Yalnızca collage'da
           görünenden fazlası varsa (>3) render edilir. */}
        {images.length > 3 && (
          <button
            type="button"
            onClick={() => setActiveIndex(0)}
            aria-label={formatDictionaryString(
              dict.gallery.viewAllPhotosAriaLabel,
              { count: images.length }
            )}
            className="
              absolute bottom-3 right-3 md:bottom-4 md:right-4 z-10
              inline-flex items-center gap-1.5
              rounded-full bg-white/95 backdrop-blur-sm
              px-3.5 py-2
              text-[12.5px] font-semibold text-[var(--color-stone-800)]
              ring-1 ring-black/5
              shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)]
              hover:bg-white transition-colors duration-200 motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50
            "
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            {formatDictionaryString(dict.gallery.viewAllPhotos, {
              count: images.length,
            })}
          </button>
        )}
      </div>

      {/* 🔥 LIGHTBOX */}
      {activeIndex !== null && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center gap-3"
          onClick={() => setActiveIndex(null)} // 🔥 dışa tıklayınca kapat
        >
          {/* içerik tıklanınca kapanmasın
              🛡️ onTouchStart/onTouchEnd — mobile swipe gesture; mouse
              event'leriyle çakışmaz, masaüstü davranışı AYNEN korunur. */}
          <div
            className="relative"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* kapatma */}
            <button
              onClick={() => setActiveIndex(null)}
              className="absolute top-5 right-5 text-white text-2xl"
            >
              ✕
            </button>

            {/* önceki */}
            <button
              onClick={prev}
              className="absolute left-5 top-1/2 -translate-y-1/2 text-white text-3xl"
            >
              ‹
            </button>

            {/* görsel + watermark wrapper */}
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[activeIndex]}
                alt={buildImageAlt(villaTitle, activeIndex, images.length, dict)}
                className="max-h-[78vh] max-w-[90vw] object-contain rounded-xl"
              />
              <WatermarkOverlay {...watermark} />
            </div>

            {/* sonraki */}
            <button
              onClick={next}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white text-3xl"
            >
              ›
            </button>
          </div>

          {/* 🛡️ THUMBNAIL FİLMSTRIP — ana görselin altında.
              - Yalnız lightbox açıkken render (LCP etkisi yok).
              - Mobilde overflow-x-auto ile yatay scroll; desktop'ta
                w-max + mx-auto ile ortalanmış filmstrip (foto azsa
                ortada, çoksa scroll).
              - Thumbnail tıklaması mevcut activeIndex state'ini set eder.
              - stopPropagation: şerit içi tıklama/scroll dış overlay'i
                kapatmaz ve iç görselin swipe handler'larını tetiklemez.
              - loading="lazy": 30-50 fotoğrafta toplu indirme önlenir. */}
          <div
            className="max-w-[92vw] overflow-x-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <div className="flex gap-2 px-2 py-1 w-max mx-auto">
              {images.map((src, i) => (
                <button
                  key={i}
                  ref={(el) => {
                    thumbRefs.current[i] = el;
                  }}
                  onClick={() => setActiveIndex(i)}
                  aria-label={formatDictionaryString(
                    dict.gallery.photoAriaLabel,
                    { index: i + 1 }
                  )}
                  aria-current={i === activeIndex ? "true" : undefined}
                  className={
                    "relative shrink-0 h-14 w-20 md:h-16 md:w-24 " +
                    "overflow-hidden rounded-lg ring-2 transition " +
                    (i === activeIndex
                      ? "ring-white opacity-100"
                      : "ring-transparent opacity-50 hover:opacity-100")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIDEO MODAL — local state. isOpen=false iken iframe yok.
          VillaInfoBar'dan taşındı; logic AYNEN. */}
      {hasVideo && (
        <VillaVideoModal
          isOpen={videoOpen}
          onClose={() => setVideoOpen(false)}
          videos={safeVideos}
          villaTitle={villaTitle}
          locale={locale}
        />
      )}
    </>
  );
}
