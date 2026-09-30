"use client";

/* ===============================================================
   🛡️ VillaVideoSection — premium YouTube player (lazy / thumbnail-first)
   ===============================================================
   AMAÇ:
     Villa detay sayfasında YouTube videolarını sergilemek.
     "lite-youtube-embed" pattern'i: ilk render'da SADECE thumbnail
     + play butonu mount edilir. Kullanıcı play'e basınca iframe
     mount olur (autoplay=1 ile direkt başlar).

   PERFORMANCE:
     - Iframe ~500 KB+ — eager mount Lighthouse score'u boğar.
     - Thumbnail (~30 KB) + tek SVG play butonu = ~32 KB initial.
     - Iframe ASLA mount edilmez (kullanıcı tıklamadıkça).
     - 16:9 aspect-ratio container → CLS = 0.
     - `loading="lazy"` thumbnail için (viewport dışı = network yok).
     - Birden fazla video: sekmeli minimal navigation (state-local).

   SECURITY:
     - parseYouTubeId çıktısı varsayılır (admin form validate etti)
     - Defansif olarak ID regex bir kez daha kontrol edilir
     - Embed URL `youtube-nocookie.com` (privacy-enhanced, no cookie)
     - referrerPolicy="strict-origin-when-cross-origin"
     - allow="..." minimum gerekli set (no payment, no microphone)
     - allowFullScreen evet

   UX:
     - Mobile + desktop responsive
     - Lüks villa sitesi hissi: kara backdrop, soft shadow, premium
       eyebrow tagline, rounded-3xl
     - Hover: play butonu büyür, thumbnail subtle zoom
     - Birden fazla video varsa thumbnail sekmesi altında

   ENGINE / BOOKING / PRICING ile SIFIR etkileşim.
   =============================================================== */

import { useMemo, useState } from "react";
import { Play, Film } from "lucide-react";

import {
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";

type Props = {
  /* DB-canonical array. Null/undefined/invalid → render YOK. */
  videos: VillaYouTubeVideo[] | null | undefined;
  /* Villa adı — section eyebrow/aria label için. */
  villaTitle?: string;
};

export default function VillaVideoSection({ videos, villaTitle }: Props) {
  /* Defansif normalize — admin save'inde zaten yapılıyor ama
     parent component'lerin garantilemediği durumlarda da güvenli. */
  const safeVideos = useMemo(
    () => normalizeYouTubeVideos(videos),
    [videos]
  );

  /* Aktif sekme — hangi videonun gösterildiği (multi-video desteği). */
  const [activeIndex, setActiveIndex] = useState(0);

  /* Play state — sadece aktif video için iframe mount tetikleyicisi.
     Sekme değişince reset olur (yeni sekme tekrar thumbnail-first). */
  const [playedIndex, setPlayedIndex] = useState<number | null>(null);

  if (safeVideos.length === 0) return null;

  const activeVideo = safeVideos[activeIndex] ?? safeVideos[0];
  const isPlayed = playedIndex === activeIndex;

  const handlePlay = () => {
    setPlayedIndex(activeIndex);
  };

  const handleTabChange = (i: number) => {
    setActiveIndex(i);
    /* Sekme değişince yeni videoyu thumbnail-first başlat. */
    setPlayedIndex(null);
  };

  return (
    <section
      aria-label={
        villaTitle
          ? `${villaTitle} villa videosu`
          : "Villa videosu"
      }
      className="space-y-4"
    >
      {/* HEADER — premium eyebrow + title */}
      <div className="flex items-center gap-2.5">
        <span
          className="
            w-8 h-8 shrink-0 rounded-xl
            bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
            flex items-center justify-center
            text-[var(--color-champagne-600)]
          "
          aria-hidden
        >
          <Film size={15} />
        </span>
        <div>
          <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-500)]">
            Villa Tanıtımı
          </p>
          <h3 className="font-display text-lg md:text-xl text-[var(--color-stone-900)] tracking-[-0.015em]">
            {safeVideos.length === 1 ? "Villa Videosu" : "Villa Videoları"}
          </h3>
        </div>
      </div>

      {/* PLAYER CONTAINER — 16:9, CLS=0 */}
      <div
        className="
          relative w-full overflow-hidden
          rounded-3xl bg-black
          shadow-[0_24px_56px_-20px_rgb(27_26_23/0.32)]
          aspect-video
        "
      >
        {isPlayed ? (
          /* IFRAME MODE — user clicked play. autoplay=1 → kullanıcı
             gesture ile başladığı için browser autoplay policy ihlali yok.
             rel=0 → ilgisiz videolar bitince gözükmez (premium). */
          <iframe
            key={activeVideo.id /* sekme değişince re-mount */}
            src={`${getYouTubeEmbedUrl(activeVideo.id)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={
              villaTitle
                ? `${villaTitle} — YouTube videosu`
                : "Villa YouTube videosu"
            }
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 w-full h-full border-0"
          />
        ) : (
          /* THUMBNAIL MODE — ilk görünüm. Click → iframe mount. */
          <button
            type="button"
            onClick={handlePlay}
            aria-label={
              villaTitle
                ? `${villaTitle} videosunu oynat`
                : "Villa videosunu oynat"
            }
            className="
              group absolute inset-0 w-full h-full
              cursor-pointer
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/60
            "
          >
            {/* Thumbnail image — lazy load, object-cover for 16:9 crop */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getYouTubeThumbnailUrl(activeVideo.id, "max")}
              alt=""
              loading="lazy"
              decoding="async"
              /* Eğer maxresdefault yoksa (eski videolar) hqdefault'a fallback.
                 onError handler ile alternatif src dener. */
              onError={(e) => {
                const img = e.currentTarget;
                const hq = getYouTubeThumbnailUrl(activeVideo.id, "hq");
                if (img.src !== hq && hq) {
                  img.src = hq;
                }
              }}
              className="
                absolute inset-0 w-full h-full
                object-cover object-center
                transition-transform duration-700 ease-out
                group-hover:scale-[1.02]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />

            {/* Cinematic gradient overlay */}
            <div
              aria-hidden
              className="
                absolute inset-0
                bg-gradient-to-t from-black/55 via-black/15 to-black/25
                pointer-events-none
              "
            />

            {/* Play button — premium glass circle */}
            <span
              aria-hidden
              className="
                absolute inset-0 flex items-center justify-center
                pointer-events-none
              "
            >
              <span
                className="
                  inline-flex items-center justify-center
                  w-16 h-16 md:w-20 md:h-20
                  rounded-full
                  bg-white/95 text-[var(--color-stone-900)]
                  shadow-[0_12px_32px_-8px_rgb(0_0_0/0.5)]
                  ring-1 ring-white/40
                  transition-transform duration-300
                  group-hover:scale-110
                  motion-reduce:transition-none motion-reduce:group-hover:scale-100
                "
              >
                {/* Play triangle — slight right offset for visual balance */}
                <Play
                  size={28}
                  strokeWidth={1.4}
                  fill="currentColor"
                  className="ml-1"
                />
              </span>
            </span>
          </button>
        )}
      </div>

      {/* TABS — birden fazla video varsa thumbnail navigation.
          Tek video varsa hiç render edilmez (gereksiz UI yok). */}
      {safeVideos.length > 1 && (
        <div
          role="tablist"
          aria-label="Diğer videolar"
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {safeVideos.map((v, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(i)}
                className={
                  "relative shrink-0 overflow-hidden " +
                  "rounded-xl transition-all duration-200 " +
                  "motion-reduce:transition-none " +
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/60 " +
                  (isActive
                    ? "ring-2 ring-[var(--color-champagne-500)] ring-offset-2"
                    : "opacity-70 hover:opacity-100")
                }
                style={{ width: 108, height: 60 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getYouTubeThumbnailUrl(v.id, "hq")}
                  alt={`Video ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-black/15"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
