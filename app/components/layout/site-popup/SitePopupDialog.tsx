"use client";

import { useEffect, useRef } from "react";

import type { PublicSitePopup } from "@/lib/site-popup";

import SitePopupCard from "./SitePopupCard";

/* ===============================================================
   🛡️ SitePopupDialog — modal kabuğu (yalnız popup açılacaksa
   dinamik import edilir; bkz. SitePopupLoader)
   ===============================================================
   Mevcut SuccessModal davranış deseni: z-[1100], bg-black/60 +
   backdrop-blur, ESC ile kapanma, backdrop tıklamasıyla kapanma,
   body scroll kilidi (önceki overflow değeri geri yüklenir).
   Ek olarak: açılışta odak kapatma butonuna, kapanışta önceki
   elemana döner.
   =============================================================== */

export default function SitePopupDialog({
  popup,
  onClose,
  onCta,
  closeLabel,
}: {
  popup: PublicSitePopup;
  onClose: () => void;
  onCta: () => void;
  closeLabel: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current
      ?.querySelector<HTMLElement>("[data-popup-close]")
      ?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const titleId = popup.title ? "site-popup-title" : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : closeLabel}
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={panelRef}
        className="relative w-full max-w-[920px] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <SitePopupCard
          popup={popup}
          titleId={titleId}
          onClose={onClose}
          onCta={onCta}
          closeLabel={closeLabel}
        />
      </div>
    </div>
  );
}
