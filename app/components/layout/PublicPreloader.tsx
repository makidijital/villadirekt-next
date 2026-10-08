"use client";

import { useEffect, useState } from "react";

/* ===============================================================
   🎬 PUBLIC PRELOADER — yalnız ilk sayfa yüklemesi
   ===============================================================
   - Public layout'ta (app/(public)/layout.tsx) render edilir; admin
     layout'unda YOK. Layout client navigasyonlarında yeniden mount
     olmadığı için link tıklamalarında TEKRAR GÖSTERİLMEZ.
   - Logo: header ile AYNI kaynak (`settings.site_logo`, versioned URL);
     layout zaten okuduğu settings'ten prop geçer → EK FETCH YOK.
   - Animasyonlar saf CSS (globals.css → `.vd-preloader*`); ek
     dependency/kütüphane YOK.
   - Sahte bekleme YOK: hydration sonrası (en geç ~ilk boyamadan
     MIN_VISIBLE_MS sonra) kapanır. JS hiç çalışmazsa CSS failsafe
     ~1.8 sn'de kendiliğinden kaybolur.
   - `aria-hidden` + içerik `inert` DEĞİL → ekran okuyucular sayfa
     içeriğine her zaman erişir.
   - Server ve client ilk render'ı BİREBİR aynı → hydration uyumsuzluğu
     yok; kapandıktan sonra DOM'dan tamamen çıkar.
   =============================================================== */

/** Logo giriş animasyonunun okunabilmesi için minimum görünürlük
 *  (navigation start'tan itibaren). Sayfa daha geç hazır olursa ek
 *  bekleme UYGULANMAZ. */
export const PRELOADER_MIN_VISIBLE_MS = 450;
/** Fade-out süresi — CSS `.vd-preloader[data-state="out"]` ile aynı. */
export const PRELOADER_FADE_MS = 300;

type Phase = "in" | "out" | "gone";

export default function PublicPreloader({
  logoSrc,
  brand,
}: {
  logoSrc: string | null;
  brand?: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("in");

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elapsed =
      typeof performance !== "undefined" ? performance.now() : PRELOADER_MIN_VISIBLE_MS;
    const wait = reduce ? 0 : Math.max(0, PRELOADER_MIN_VISIBLE_MS - elapsed);
    const fade = reduce ? 80 : PRELOADER_FADE_MS;

    let goneTimer: ReturnType<typeof setTimeout> | undefined;
    const outTimer = setTimeout(() => {
      setPhase("out");
      goneTimer = setTimeout(() => setPhase("gone"), fade);
    }, wait);

    return () => {
      clearTimeout(outTimer);
      if (goneTimer) clearTimeout(goneTimer);
    };
  }, []);

  if (phase === "gone") return null;

  const wordmark = brand?.trim();

  return (
    <div
      className="vd-preloader"
      data-state={phase}
      data-testid="public-preloader"
      aria-hidden="true"
    >
      <div className="vd-preloader__inner">
        {logoSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoSrc}
            alt=""
            className="vd-preloader__logo"
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        ) : wordmark ? (
          <span className="vd-preloader__wordmark font-display">{wordmark}</span>
        ) : null}

        <div className="vd-preloader__bar">
          <span className="vd-preloader__track">
            <span className="vd-preloader__fill" />
          </span>
          <span className="vd-preloader__dot" />
        </div>
      </div>
    </div>
  );
}
