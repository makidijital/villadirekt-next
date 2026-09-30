"use client";

/* ===============================================================
   🛡️ ADMIN NOTIFICATION — BELL (topbar trigger)
   ===============================================================
   Compact bell button + unread dot. Click → NotificationCenter
   dropdown'ı toggle eder.
   - data-notification-trigger: outside-click handler bunu
     algılayıp panel'i kapatmaz (panel kendi handler'ında muaf
     tutar).
   - aria-haspopup, aria-expanded ile screen-reader semantik.
   =============================================================== */

import { Bell } from "lucide-react";
import { useNotificationCenter } from "./NotificationProvider";
import { NotificationCenter } from "./NotificationCenter";

export function NotificationBell() {
  const center = useNotificationCenter();
  const hasUnread = center.unreadCount > 0;

  return (
    <div className="relative">
      <button
        type="button"
        data-notification-trigger
        className="admin-icon-btn relative"
        aria-label={
          hasUnread
            ? `Bildirimler — ${center.unreadCount} okunmamış`
            : "Bildirimler"
        }
        aria-haspopup="dialog"
        aria-expanded={center.isOpen}
        onClick={center.toggle}
      >
        <Bell size={16} aria-hidden="true" />
        {hasUnread ? (
          <span
            aria-hidden="true"
            className={
              "absolute top-1.5 right-1.5 " +
              "w-1.5 h-1.5 rounded-full " +
              "bg-[var(--color-champagne-500)] " +
              "ring-2 ring-white"
            }
          />
        ) : null}
      </button>

      <NotificationCenter />
    </div>
  );
}
