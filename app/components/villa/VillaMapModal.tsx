"use client";

/* ===============================================================
   🛡️ VillaMapModal — "Nerede?" kartının Harita/Yol Tarifi butonları
   + tıklanınca açılan harita modalı.
   ===============================================================
   AMAÇ:
     Sağ kolondaki "Nerede?" kartında artık harita iframe/embed'i
     KART İÇİNDE HER ZAMAN GÖRÜNMÜYOR — yalnız "Harita" butonuna
     basılınca bu modal içinde açılıyor. "Yol Tarifi" butonu ise
     (öncekiyle birebir aynı davranış) Google Maps yol tarifi
     linkini yeni sekmede açar.

     Harita render mantığı (map_type/coords/iframe/embed/fallback,
     dangerouslySetInnerHTML, villa.latitude/longitude/map_embed)
     BİREBİR aynı; yalnız DOM konumu (artık her zaman görünen kart
     yerine, modal içine) değişti — hiçbir koşul/veri silinmedi.

     Modal pattern'i (ESC → close, backdrop click → close, body
     scroll lock, role="dialog" aria-modal) mevcut VillaVideoModal
     ile AYNI mimariyi izler (bkz. app/components/villa/VillaVideoModal.tsx)
     — proje için yeni bir "harita sistemi" icat edilmedi, var olan
     modal deseni haritaya uygulandı.

   ASLA dokunulmadı: koordinat/harita verisi, booking/reservation,
   pricing, availability, Gallery, BookingSidebar.
   =============================================================== */

import { useEffect, useState } from "react";
import { X, Map as MapIcon, Navigation } from "lucide-react";

/* 🛡️ PHASE 10G — locale-aware UI metinleri + Google Maps embed `hl=`
   parametresi. `locale` OPSİYONEL, default "tr" → TR çıktısı BİREBİR
   AYNI. Harita verisi/koşulları (map_type/coords/embed) DEĞİŞMEDİ. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import type { Locale } from "@/lib/i18n/config";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";
import { extractSafeMapEmbedSrc } from "@/lib/map-embed.helper";

type Props = {
  mapType?: string;
  latitude?: number;
  longitude?: number;
  mapEmbed?: string;
  villaTitle?: string;
  /** 🛡️ PHASE 10G — opsiyonel; verilmezse "tr" (eski davranış). */
  locale?: Locale;
};

export default function VillaMapModal({
  mapType,
  latitude,
  longitude,
  mapEmbed,
  villaTitle,
  locale,
}: Props) {
  const dict = getDictionary(locale);
  const [isOpen, setIsOpen] = useState(false);

  /* === ESC tuşu → close (VillaVideoModal ile aynı desen) === */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  /* === Body scroll lock === */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const hasCoords =
    mapType === "coords" && !!latitude && !!longitude;
  /* 🛡️ SEC-05 — ham iframe HTML basmak yerine yalnız güvenli
     (allow-list'li) Google Maps `src` URL'ini çıkar; iframe'i biz
     üretiriz. Geçerli embed yoksa harita bölümü gösterilmez. */
  const safeMapEmbedSrc =
    mapType === "iframe" ? extractSafeMapEmbedSrc(mapEmbed) : null;
  const hasEmbed = !!safeMapEmbedSrc;
  const hasDirections = !!latitude && !!longitude;

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="
            inline-flex items-center justify-center gap-2
            rounded-xl bg-[#ED7926] px-4 py-3.5
            text-[13.5px] font-semibold text-white
            shadow-[0_10px_24px_-12px_rgba(237,121,38,0.55)]
            transition-[transform,box-shadow] duration-200 motion-reduce:transition-none
            hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-12px_rgba(237,121,38,0.65)]
            motion-reduce:hover:translate-y-0
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7926]/40
          "
        >
          <MapIcon size={16} strokeWidth={1.8} />
          {dict.map.openMap}
        </button>

        {hasDirections ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="
              inline-flex items-center justify-center gap-2
              rounded-xl border-2 border-[#0973BA] bg-white px-4 py-3.5
              text-[13.5px] font-semibold text-[#0973BA]
              transition-[transform,box-shadow,background-color] duration-200 motion-reduce:transition-none
              hover:-translate-y-0.5 hover:bg-[#0973BA]/5
              hover:shadow-[0_14px_28px_-16px_rgba(9,115,186,0.45)]
              motion-reduce:hover:translate-y-0
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40
            "
          >
            <Navigation size={16} strokeWidth={1.8} />
            {dict.map.directions}
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={dict.map.directionsUnavailableTitle}
            className="
              inline-flex items-center justify-center gap-2
              rounded-xl border-2 border-[var(--color-stone-200)] bg-white px-4 py-3.5
              text-[13.5px] font-semibold text-[var(--color-stone-300)]
              cursor-not-allowed
            "
          >
            <Navigation size={16} strokeWidth={1.8} />
            {dict.map.directions}
          </button>
        )}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            villaTitle
              ? formatDictionaryString(dict.map.modalAriaLabel, {
                  title: villaTitle,
                })
              : dict.map.modalAriaLabelFallback
          }
          className="fade-in fixed inset-0 z-[1100] flex items-center justify-center p-4"
        >
          {/* Backdrop — click → close (VillaVideoModal ile aynı desen) */}
          <div
            aria-hidden
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          <div className="relative w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={dict.map.closeAriaLabel}
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

            <div className="relative w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--color-stone-100)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ED7926]/15 to-[#0973BA]/15 text-[#ED7926]">
                  <MapIcon size={15} strokeWidth={1.8} />
                </span>
                <h2 className="font-display text-[17px] text-[var(--color-stone-900)] tracking-[-0.01em]">
                  {dict.map.whereTitle}
                </h2>
              </div>

              {hasCoords && (
                <iframe
                  src={`https://www.google.com/maps?q=${latitude},${longitude}&hl=${dict.map.embedLanguage}&z=14&output=embed`}
                  className="w-full h-[60vh] max-h-[480px] border-0"
                  loading="lazy"
                />
              )}

              {hasEmbed && (
                <>
                  <iframe
                    src={safeMapEmbedSrc as string}
                    title={villaTitle || dict.map.whereTitle}
                    className="w-full h-[60vh] max-h-[480px] border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] text-sm text-[var(--color-stone-500)]">
                    {dict.map.poweredByGoogle}
                  </div>
                </>
              )}

              {!hasCoords && !hasEmbed && (
                <div className="h-[240px] flex items-center justify-center text-[var(--color-stone-400)] italic">
                  {dict.map.noLocation}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
