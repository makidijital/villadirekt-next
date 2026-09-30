"use client";

/* ===============================================================
   🛡️ ADMIN NOTIFICATION — CENTER (bell dropdown)
   ===============================================================
   - Compact dropdown panel (380px desktop, full-width mobile)
   - Header: title + tümünü okundu işaretle + temizle
   - Item list: severity dot + title + description + relative time
   - Read state: opacity-60
   - Empty state: minimal + güven veren ton
   - Click outside / Escape kapatır
   - Subtle motion (180ms ease-out)
   =============================================================== */

import { useEffect, useRef } from "react";
import type { AdminNotification } from "./types";
import { useNotificationCenter } from "./NotificationProvider";
import { parseUtcDate } from "@/lib/date-format";

export function NotificationCenter() {
  const center = useNotificationCenter();
  const panelRef = useRef<HTMLDivElement>(null);

  /* Outside click → kapat */
  useEffect(() => {
    if (!center.isOpen) return;
    const handler = (e: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = e.target as Node;
      if (panel.contains(target)) return;
      // Bell button kendisi outside-click handler'ı tetiklemesin
      const bellTrigger = (e.target as HTMLElement)?.closest?.(
        "[data-notification-trigger]"
      );
      if (bellTrigger) return;
      center.close();
    };
    // Mount sonrası bir tick bekle ki açan click outside-click'e
    // sayılmasın.
    const handle = setTimeout(() => {
      window.addEventListener("mousedown", handler);
    }, 0);
    return () => {
      clearTimeout(handle);
      window.removeEventListener("mousedown", handler);
    };
  }, [center.isOpen, center.close, center]);

  if (!center.isOpen) return null;

  const { items, unreadCount, markAllRead, clear, markRead, close } = center;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Bildirimler"
      className={
        "absolute right-0 top-full mt-2 z-[900] " +
        "w-[calc(100vw-2rem)] sm:w-[380px] " +
        "bg-white rounded-2xl " +
        "border border-[var(--color-stone-100)] " +
        "shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] " +
        "overflow-hidden " +
        "transition-[transform,opacity] duration-200 ease-out " +
        "motion-reduce:transition-none"
      }
    >
      {/* HEADER */}
      <div
        className={
          "flex items-center justify-between gap-3 " +
          "px-4 py-3 " +
          "border-b border-[var(--color-stone-100)]"
        }
      >
        <div className="flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--color-stone-900)]">
            Bildirimler
          </h3>
          {unreadCount > 0 ? (
            <span className="text-[11px] font-medium text-[var(--color-stone-500)] tabular-nums">
              {unreadCount} okunmamış
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className={
                "px-2 py-1 rounded-md text-[11px] font-medium " +
                "text-[var(--color-stone-500)] " +
                "hover:text-[var(--color-stone-900)] " +
                "hover:bg-[var(--color-sand-50)] " +
                "transition-colors duration-150 " +
                "motion-reduce:transition-none " +
                "focus:outline-none focus-visible:ring-2 " +
                "focus-visible:ring-[var(--color-champagne-500)]/40"
              }
            >
              Tümünü okundu işaretle
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className={
                "px-2 py-1 rounded-md text-[11px] font-medium " +
                "text-[var(--color-stone-500)] " +
                "hover:text-[var(--color-stone-900)] " +
                "hover:bg-[var(--color-sand-50)] " +
                "transition-colors duration-150 " +
                "motion-reduce:transition-none " +
                "focus:outline-none focus-visible:ring-2 " +
                "focus-visible:ring-[var(--color-champagne-500)]/40"
              }
            >
              Temizle
            </button>
          ) : null}
        </div>
      </div>

      {/* LIST / EMPTY */}
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="max-h-[440px] overflow-y-auto"
          role="list"
          aria-label="Bildirim listesi"
        >
          {items.map((it) => (
            <NotificationRow
              key={it.id}
              item={it}
              onClick={() => {
                markRead(it.id);
              }}
            />
          ))}
        </ul>
      )}

      {/* Footer (bottom action) — close hint, screen-reader için
          görsel olarak gizli ama bell button focusable. */}
      <button
        type="button"
        onClick={close}
        className="sr-only"
        aria-label="Bildirimleri kapat"
      >
        Kapat
      </button>
    </div>
  );
}

/* ---------------------------------------------
   🔥 NOTIFICATION ROW
---------------------------------------------- */
function NotificationRow({
  item,
  onClick,
}: {
  item: AdminNotification;
  onClick: () => void;
}) {
  const isRead = item.readAt !== null;
  const dotColor =
    item.severity === "success"
      ? "bg-emerald-500"
      : item.severity === "error"
        ? "bg-red-500"
        : "bg-[var(--color-stone-400)]";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "w-full text-left px-4 py-3 " +
          "flex items-start gap-2.5 " +
          "border-b border-[var(--color-stone-100)] last:border-b-0 " +
          "hover:bg-[var(--color-sand-50)] " +
          "transition-colors duration-150 " +
          "motion-reduce:transition-none " +
          "focus:outline-none focus-visible:bg-[var(--color-sand-50)] " +
          (isRead ? "opacity-60" : "")
        }
      >
        <span
          aria-hidden="true"
          className={`mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`}
        />

        <div className="flex-1 min-w-0">
          <p className="text-[13px] leading-snug font-medium text-[var(--color-stone-900)] break-words">
            {item.title}
          </p>
          {item.description ? (
            <p className="text-[12px] leading-snug text-[var(--color-stone-500)] mt-0.5 break-words">
              {item.description}
            </p>
          ) : null}
          <p className="text-[11px] text-[var(--color-stone-400)] mt-1.5 tabular-nums">
            {formatRelativeTime(item.createdAt)}
          </p>
        </div>

        {/* Unread indicator (sağ tarafta) */}
        {!isRead ? (
          <span
            aria-label="Okunmadı"
            className={
              "mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full " +
              "bg-[var(--color-champagne-500)]"
            }
          />
        ) : null}
      </button>
    </li>
  );
}

/* ---------------------------------------------
   🔥 EMPTY STATE
---------------------------------------------- */
function EmptyState() {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-[var(--color-stone-700)]">
        Henüz bildirim yok
      </p>
      <p className="text-[12px] text-[var(--color-stone-500)] mt-1">
        Aksiyonlarınızın özetini burada göreceksiniz.
      </p>
    </div>
  );
}

/* ---------------------------------------------
   🔥 RELATIVE TIME — minimal, locale-free
---------------------------------------------- */
function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diff < 30 * SEC) return "Şimdi";
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return `${m} dk önce`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} sa önce`;
  }
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return d === 1 ? "Dün" : `${d} gün önce`;
  }
  // Fallback: short date (tr-TR, Europe/Istanbul explicit, parseUtcDate normalize)
  try {
    const d = parseUtcDate(ts);
    if (!d) return "";
    return d.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Istanbul",
    });
  } catch {
    const d = parseUtcDate(ts);
    if (!d) return "";
    return d.toLocaleDateString("tr-TR", {
      timeZone: "Europe/Istanbul",
    });
  }
}
