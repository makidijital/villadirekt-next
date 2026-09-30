"use client";

/* ===============================================================
   🛡️ ADMIN — DESTRUCTIVE CONFIRM DIALOG
   ===============================================================
   Premium minimal modal: native confirm() yerine. Sadece
   destructive aksiyonlar (delete/disable/etc.) için. Notification
   sistemi feedback'i, bu component "kararlı yıkıcı eylem" onayı
   için kullanılır.

   - Backdrop subtle (stone-900/40 + 2px blur)
   - Card max-w-sm; compact 5px padding; soft shadow
   - Variant: "default" (stone CTA) / "danger" (red CTA)
   - ESC kapatır, body scroll lock, focus trap (basit: confirm
     button initial focus)
   - aria-modal + aria-labelledby/describedby
   - busy durumunda buton disable + label "İşleniyor…"
   - prefers-reduced-motion: backdrop blur kapanır

   Sıfır emoji, sıfır gradient, sıfır cheap animation.
   =============================================================== */

import { useEffect, useRef, useState } from "react";

type Variant = "danger" | "default";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Onayla",
  cancelLabel = "İptal",
  variant = "default",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);

    // body scroll lock
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus initial CTA
    const t = setTimeout(() => confirmBtnRef.current?.focus(), 0);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  const danger = variant === "danger";

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={description ? "confirm-desc" : undefined}
      className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
    >
      {/* Backdrop — outside-click dismiss (busy değilken) */}
      <button
        type="button"
        aria-label="İptal"
        tabIndex={-1}
        onClick={() => {
          if (!busy) onClose();
        }}
        className={
          "absolute inset-0 bg-stone-900/40 " +
          "backdrop-blur-[2px] motion-reduce:backdrop-blur-0 " +
          "cursor-default"
        }
      />

      {/* Dialog */}
      <div
        className={
          "relative w-full max-w-sm " +
          "bg-white rounded-2xl " +
          "border border-[var(--color-stone-100)] " +
          "shadow-[0_24px_48px_-12px_rgb(27_26_23/0.28)] " +
          "p-5"
        }
      >
        <h2
          id="confirm-title"
          className="text-[15px] font-semibold text-[var(--color-stone-900)] leading-snug"
        >
          {title}
        </h2>
        {description ? (
          <p
            id="confirm-desc"
            className="text-[13px] text-[var(--color-stone-500)] mt-2 leading-snug"
          >
            {description}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={
              "px-3.5 py-2 rounded-lg text-[13px] font-medium " +
              "text-[var(--color-stone-700)] " +
              "border border-[var(--color-stone-200)] " +
              "bg-white hover:bg-[var(--color-sand-50)] " +
              "transition-colors duration-150 motion-reduce:transition-none " +
              "disabled:opacity-50 disabled:cursor-not-allowed " +
              "focus:outline-none focus-visible:ring-2 " +
              "focus-visible:ring-[var(--color-champagne-500)]/40"
            }
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={
              "px-3.5 py-2 rounded-lg text-[13px] font-semibold " +
              "transition-colors duration-150 motion-reduce:transition-none " +
              "disabled:opacity-60 disabled:cursor-not-allowed " +
              "focus:outline-none focus-visible:ring-2 " +
              (danger
                ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500/40"
                : "bg-[var(--color-stone-900)] text-white hover:bg-[var(--color-stone-700)] focus-visible:ring-[var(--color-champagne-500)]/40")
            }
          >
            {busy ? "İşleniyor…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
