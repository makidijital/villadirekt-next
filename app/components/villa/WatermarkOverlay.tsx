"use client";

import type { WatermarkPosition } from "@/app/services/settings.types";

/* ===============================================================
   🔥 WATERMARK OVERLAY
   ===============================================================
   - CSS-only absolute overlay
   - Asla görsel processing yapmaz
   - download önleyici: pointer-events:none, drag/select kapalı
   - Parent wrapper relative + overflow-hidden olmalı
   =============================================================== */

type Props = {
  logo?: string | null;
  enabled?: boolean | null;
  opacity?: number | null;
  position?: WatermarkPosition | null;
  size?: number | null; // %
};

function positionStyle(position: WatermarkPosition) {
  switch (position) {
    case "top-left":
      return { top: "4%", left: "4%" } as React.CSSProperties;
    case "top-right":
      return { top: "4%", right: "4%" } as React.CSSProperties;
    case "bottom-left":
      return { bottom: "4%", left: "4%" } as React.CSSProperties;
    case "bottom-right":
      return { bottom: "4%", right: "4%" } as React.CSSProperties;
    case "center":
    default:
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      } as React.CSSProperties;
  }
}

export default function WatermarkOverlay({
  logo,
  enabled,
  opacity,
  position,
  size,
}: Props) {
  if (!enabled || !logo) return null;

  const safePos: WatermarkPosition = (position || "center") as WatermarkPosition;
  const safeOpacity = Math.min(Math.max(Number(opacity) || 0.15, 0.05), 1);
  const safeSize = Math.min(Math.max(Number(size) || 25, 10), 50);

  const pos = positionStyle(safePos);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute select-none"
      style={{
        ...pos,
        width: `${safeSize}%`,
        opacity: safeOpacity,
        userSelect: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo}
        alt=""
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-auto select-none pointer-events-none"
        style={{ ["WebkitUserDrag" as any]: "none" }}
      />
    </div>
  );
}
