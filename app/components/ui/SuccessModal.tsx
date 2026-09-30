"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";

/* ===============================================================
   🛡️ SUCCESS MODAL — reusable success feedback component
   ===============================================================
   AMAÇ:
     alert() yerine modern, marka kimliğine uygun başarı bildirimi.
     Rezervasyon ve teklif formu submit sonrası kullanılır.

   ÖZELLİKLER:
     - Backdrop click veya × tuşu ile kapatma
     - Escape tuşu ile kapatma
     - Body scroll lock (modal açıkken arka plan scroll edilmez)
     - Mobil responsive (max-w-md + max-h ile taşma kontrolü)
     - Yeşil check ikonu (luxury concierge görsel dili)
     - 2 CTA: "Ana Sayfaya Dön" (Link) + "Kapat" (callback)
     - Safe-area iPhone padding bottom

   PROP CONTRACT (caller'larca):
     - open: bool
     - onClose: () => void
     - title, message: string
     - homeHref: string (default "/")
=============================================================== */

export default function SuccessModal({
  open,
  onClose,
  title,
  message,
  homeHref = "/",
  closeLabel = "Kapat",
  homeLabel = "Ana Sayfaya Dön",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  homeHref?: string;
  closeLabel?: string;
  homeLabel?: string;
}) {
  /* Body scroll lock + Esc tuşu */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-modal-title"
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Content card */}
      <div
        className="
          relative
          bg-white rounded-3xl
          shadow-[0_32px_80px_-24px_rgba(27,26,23,0.30),0_12px_32px_-12px_rgba(27,26,23,0.18)]
          max-w-md w-full
          max-h-[90vh] overflow-y-auto
          p-6 md:p-8
          pb-[calc(1.5rem+env(safe-area-inset-bottom))]
          md:pb-[calc(2rem+env(safe-area-inset-bottom))]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (×) — top-right */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="
            absolute top-4 right-4
            w-9 h-9 rounded-full
            flex items-center justify-center
            text-[var(--color-stone-500)]
            hover:bg-[var(--color-sand-50)]
            hover:text-[var(--color-stone-900)]
            transition-colors motion-reduce:transition-none
            focus:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--brand-coral)]/40
          "
        >
          <X size={18} />
        </button>

        {/* Check ikon — emerald success badge */}
        <div className="flex justify-center mb-5">
          <div
            className="
              w-16 h-16 md:w-20 md:h-20 rounded-full
              bg-emerald-50
              ring-1 ring-emerald-100
              flex items-center justify-center
              text-emerald-600
            "
            aria-hidden
          >
            <CheckCircle2 size={36} strokeWidth={1.5} />
          </div>
        </div>

        {/* Başlık */}
        <h2
          id="success-modal-title"
          className="
            font-display
            text-[22px] md:text-[26px]
            text-[var(--color-stone-900)]
            text-center
            tracking-[-0.015em]
            leading-tight
          "
        >
          {title}
        </h2>

        {/* Mesaj */}
        <p
          className="
            text-[14.5px] md:text-[15px]
            text-[var(--color-stone-600)]
            text-center
            leading-relaxed
            mt-3
          "
        >
          {message}
        </p>

        {/* Aksiyon butonları */}
        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={homeHref}
            onClick={onClose}
            className="btn-primary w-full sm:w-auto !px-6 !py-3 text-[13.5px] text-center"
          >
            {homeLabel}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="
              inline-flex items-center justify-center
              w-full sm:w-auto
              px-6 py-3 rounded-full
              border border-[var(--color-stone-200)]
              text-[13.5px] font-medium
              text-[var(--color-stone-700)]
              hover:border-[var(--brand-coral)]
              hover:text-[var(--color-stone-900)]
              hover:bg-[var(--brand-coral-tint)]
              transition-colors motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--brand-coral)]/30
            "
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
