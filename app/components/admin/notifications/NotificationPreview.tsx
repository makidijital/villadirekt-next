"use client";

/* ===============================================================
   🛡️ ADMIN NOTIFICATION — PREVIEW (sağ üst ephemeral)
   ===============================================================
   - Compact card; subtle 1px border + soft shadow
   - 6px severity dot (success: emerald / error: red / info: stone)
   - Loading: 14px spinner (currentColor)
   - Inter / 13.5px primary, 12px description
   - Mount sonrası transform/opacity transition (220ms ease-out)
   - prefers-reduced-motion: motion-reduce ile transition kapanır
   - aria-live polite (success/info/loading) / assertive (error)
   - Sıfır emoji, sıfır gradient
   =============================================================== */

import { useEffect, useState } from "react";
import type { NotificationSeverity } from "./types";

type PreviewItem = {
  id: string;
  severity: NotificationSeverity | "loading";
  title: string;
  description?: string;
  duration: number;
};

const POSITION_CLASS =
  "fixed z-[1000] pointer-events-none " +
  "top-4 right-4 left-4 md:left-auto " +
  "flex flex-col items-stretch md:items-end gap-2 " +
  "max-w-[calc(100vw-2rem)] md:max-w-[380px] " +
  "md:w-[380px]";

export function NotificationPreview({
  previews,
  onDismiss,
}: {
  previews: PreviewItem[];
  onDismiss: (id: string) => void;
}) {
  if (previews.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bildirimler"
      className={POSITION_CLASS}
    >
      {previews.map((p) => (
        <PreviewCard
          key={p.id}
          item={p}
          onDismiss={() => onDismiss(p.id)}
        />
      ))}
    </div>
  );
}

function PreviewCard({
  item,
  onDismiss,
}: {
  item: PreviewItem;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const isError = item.severity === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-state={mounted ? "open" : "closed"}
      className={
        "pointer-events-auto w-full " +
        "bg-white rounded-xl " +
        "border border-[var(--color-stone-100)] " +
        "shadow-[0_8px_24px_-12px_rgb(27_26_23/0.18)] " +
        "px-3.5 py-3 " +
        "flex items-start gap-2.5 " +
        "transition-[transform,opacity] duration-200 ease-out " +
        "motion-reduce:transition-none " +
        (mounted ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0")
      }
    >
      <Indicator severity={item.severity} />

      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] leading-snug font-medium text-[var(--color-stone-900)] break-words">
          {item.title}
        </p>
        {item.description ? (
          <p className="text-[12px] leading-snug text-[var(--color-stone-500)] mt-0.5 break-words">
            {item.description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Bildirimi kapat"
        className={
          "shrink-0 -mr-1 -mt-0.5 w-6 h-6 rounded-md " +
          "flex items-center justify-center " +
          "text-[var(--color-stone-400)] " +
          "hover:text-[var(--color-stone-700)] " +
          "hover:bg-[var(--color-sand-50)] " +
          "transition-colors duration-150 " +
          "motion-reduce:transition-none " +
          "focus:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-[var(--color-champagne-500)]/40"
        }
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M1 1 L9 9 M9 1 L1 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function Indicator({ severity }: { severity: PreviewItem["severity"] }) {
  if (severity === "loading") {
    return (
      <span
        aria-hidden="true"
        className={
          "mt-[3px] shrink-0 w-3.5 h-3.5 rounded-full " +
          "border-[1.5px] border-[var(--color-stone-200)] " +
          "border-t-[var(--color-stone-700)] " +
          "animate-spin motion-reduce:animate-none"
        }
      />
    );
  }

  const dotColor =
    severity === "success"
      ? "bg-emerald-500"
      : severity === "error"
        ? "bg-red-500"
        : "bg-[var(--color-stone-400)]";

  return (
    <span
      aria-hidden="true"
      className={`mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`}
    />
  );
}
