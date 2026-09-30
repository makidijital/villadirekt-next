"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DailyReservationPoint } from "@/app/services/analytics.service";

/* ===============================================================
   📊 ReservationsChart — admin dashboard area chart
   ===============================================================
   Son N gün için günlük rezervasyon sayısını (pending + confirmed)
   gösteren area chart. Pure SVG; harici chart kütüphanesine bağımlı
   değil (recharts paket içinde YOK; foundation kapasite için custom
   SVG yeterli).

   ÖZELLİKLER:
     - Smooth curve   : Catmull-Rom → cubic Bezier interpolasyonu.
     - Area fill      : linearGradient (accent → transparent).
     - Subtle grid    : 4 yatay çizgi (0% / 25% / 50% / 75% / 100%).
     - Y-axis ticks   : 0, ~25%, ~50%, ~75%, max — integer rounded.
     - X-axis labels  : Türkçe kısa format "01 May" — yoğunluğa göre
                        ~6-8 label, geri kalanı tick olarak gizli.
     - Tooltip        : Mouse X'e en yakın nokta — date + count.
     - Responsive     : ResizeObserver ile container genişliği
                        canlı izlenir; SVG re-render. Tek boyutlu
                        (yükseklik sabit 260) mobile-friendly.
     - Theme          : --admin-accent (#06b6d4 cyan) — admin layout
                        ile birebir uyumlu.

   PERFORMANS:
     - useMemo ile path/grid/labels türetilir; mouse hover
       state değişimi geometriyi yeniden hesaplamaz.
     - ResizeObserver tek instance, cleanup'lı.
   =============================================================== */

const CHART_HEIGHT = 260;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 32; /* x-axis label alanı */
const PADDING_LEFT = 36; /* y-axis label alanı */
const PADDING_RIGHT = 16;

const MIN_CONTAINER_WIDTH = 320; /* fallback (SSR ilk paint) */

/* En fazla bu kadar x-axis label gösterilir. Daha sıkıştırılırsa
   etiketler üst üste biner; mobile'da otomatik olarak daha sıkça
   atlanır. */
const MAX_X_LABELS = 8;

export default function ReservationsChart({
  data,
}: {
  data: ReadonlyArray<DailyReservationPoint>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(
    MIN_CONTAINER_WIDTH
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  /* ----------------------------------------------------------
     RESIZE OBSERVER — container genişliğini canlı izle.
     SVG mutlak px ile çizilir (tooltip pozisyonu için), bu
     yüzden gerçek width gerekli. Resize cleanup'lı.
  ---------------------------------------------------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    /* İlk ölçüm — mount anında getBoundingClientRect. */
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setContainerWidth(initial);

    if (typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setContainerWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----------------------------------------------------------
     GEOMETRY — pure derivation, useMemo ile cache'li.
  ---------------------------------------------------------- */
  const geom = useMemo(() => {
    const width = Math.max(containerWidth, MIN_CONTAINER_WIDTH);
    const height = CHART_HEIGHT;

    const plotWidth = width - PADDING_LEFT - PADDING_RIGHT;
    const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

    const n = data.length;
    const maxRaw = n === 0 ? 0 : Math.max(...data.map((d) => d.count));
    /* Y eksenini "nice" max'e yuvarla — boş günler de görünür kalsın.
       Hiç rezervasyon yoksa maxY=4 (boş chart visually anlamlı). */
    const niceMax = niceMaxValue(maxRaw);

    /* X step: tek nokta varsa center; aksi halde eşit dağıt. */
    const xStep =
      n <= 1 ? 0 : plotWidth / (n - 1);
    const points = data.map((d, i) => {
      const x = PADDING_LEFT + (n <= 1 ? plotWidth / 2 : i * xStep);
      const y =
        PADDING_TOP +
        plotHeight -
        (niceMax === 0 ? 0 : (d.count / niceMax) * plotHeight);
      return { x, y };
    });

    /* Smooth path — Catmull-Rom → cubic Bezier. */
    const linePath = buildSmoothPath(points);

    /* Area path: line + bottom corners + close. */
    const lastIdx = points.length - 1;
    const areaPath =
      points.length === 0
        ? ""
        : `${linePath} L ${points[lastIdx].x} ${
            PADDING_TOP + plotHeight
          } L ${points[0].x} ${PADDING_TOP + plotHeight} Z`;

    /* Grid çizgileri (yatay) — 0% / 25% / 50% / 75% / 100%. */
    const gridY = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
      y: PADDING_TOP + plotHeight - p * plotHeight,
      value: Math.round(niceMax * p),
    }));

    /* X-axis label step — N büyükse seyrekleştir. */
    const labelStep = Math.max(1, Math.ceil(n / MAX_X_LABELS));

    return {
      width,
      height,
      plotWidth,
      plotHeight,
      points,
      linePath,
      areaPath,
      gridY,
      labelStep,
      niceMax,
    };
  }, [containerWidth, data]);

  /* ----------------------------------------------------------
     MOUSE HOVER — viewport X'i veri index'ine map et.
  ---------------------------------------------------------- */
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    /* Plot alanı dışındaysa tooltip kapansın. */
    if (
      mx < PADDING_LEFT ||
      mx > geom.width - PADDING_RIGHT ||
      data.length === 0
    ) {
      if (hoverIndex !== null) setHoverIndex(null);
      return;
    }
    /* En yakın index'i bul. */
    const rel = mx - PADDING_LEFT;
    const step = data.length <= 1 ? 1 : geom.plotWidth / (data.length - 1);
    const idx = Math.min(
      data.length - 1,
      Math.max(0, Math.round(rel / step))
    );
    if (idx !== hoverIndex) setHoverIndex(idx);
  }

  function handleMouseLeave() {
    if (hoverIndex !== null) setHoverIndex(null);
  }

  const hoverPoint =
    hoverIndex !== null && geom.points[hoverIndex]
      ? geom.points[hoverIndex]
      : null;
  const hoverData =
    hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;

  /* Tooltip pozisyonu — sağ kenara yapışmasın diye clamp. */
  const tooltipLeft =
    hoverPoint && containerWidth > 0
      ? clamp(hoverPoint.x, 80, geom.width - 80)
      : 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <svg
        role="img"
        aria-label="Son 30 gün günlük rezervasyon grafiği"
        width={geom.width}
        height={geom.height}
        viewBox={`0 0 ${geom.width} ${geom.height}`}
        className="block w-full select-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="rcArea" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--admin-accent)"
              stopOpacity={0.28}
            />
            <stop
              offset="100%"
              stopColor="var(--admin-accent)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>

        {/* GRID + Y LABELS */}
        {geom.gridY.map((g, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PADDING_LEFT}
              x2={geom.width - PADDING_RIGHT}
              y1={g.y}
              y2={g.y}
              stroke="var(--admin-border)"
              strokeWidth={1}
              strokeDasharray={i === 0 ? "0" : "3 3"}
            />
            <text
              x={PADDING_LEFT - 8}
              y={g.y + 4}
              textAnchor="end"
              fontSize={10}
              fill="var(--admin-muted-2)"
              fontFamily="inherit"
            >
              {g.value}
            </text>
          </g>
        ))}

        {/* AREA + LINE */}
        {geom.areaPath && (
          <path d={geom.areaPath} fill="url(#rcArea)" stroke="none" />
        )}
        {geom.linePath && (
          <path
            d={geom.linePath}
            fill="none"
            stroke="var(--admin-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* X-AXIS LABELS */}
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          const visible = i % geom.labelStep === 0 || isLast;
          if (!visible) return null;
          const p = geom.points[i];
          if (!p) return null;
          return (
            <text
              key={`xl-${d.date}`}
              x={p.x}
              y={geom.height - PADDING_BOTTOM + 18}
              textAnchor="middle"
              fontSize={10}
              fill="var(--admin-muted-2)"
              fontFamily="inherit"
            >
              {d.label}
            </text>
          );
        })}

        {/* HOVER VERTICAL GUIDE + DOT */}
        {hoverPoint && (
          <g pointerEvents="none">
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={PADDING_TOP}
              y2={geom.height - PADDING_BOTTOM}
              stroke="var(--admin-accent)"
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={6}
              fill="white"
              stroke="var(--admin-accent)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* TOOLTIP */}
      {hoverData && hoverPoint && (
        <div
          className="
            pointer-events-none absolute -translate-x-1/2 -translate-y-full
            rounded-lg border border-[var(--admin-border)]
            bg-white px-3 py-2 shadow-md
            text-[12px] leading-tight
          "
          style={{
            left: `${tooltipLeft}px`,
            top: `${Math.max(hoverPoint.y - 10, 4)}px`,
            minWidth: 110,
          }}
        >
          <div className="font-medium text-[var(--admin-text)]">
            {hoverData.label}
          </div>
          <div className="mt-0.5 text-[var(--admin-muted)]">
            <span className="font-display text-[14px] text-[var(--admin-text)] tabular-nums">
              {hoverData.count}
            </span>{" "}
            rezervasyon
          </div>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   🔧 HELPERS
   =============================================================== */

/* Catmull-Rom → cubic Bezier path builder.
   Smooth curve garantisi; tangent süreksizliği yok.
   Tek nokta → "M x y" (line yok, area katmanı zaten yutuyor). */
function buildSmoothPath(
  points: ReadonlyArray<{ x: number; y: number }>
): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    /* Catmull-Rom control point conversion (tension = 0.5). */
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    parts.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }
  return parts.join(" ");
}

/* Y eksenini "nice" değere yuvarla (1/2/5 × 10^n stepping).
   Boş seri için min 4 (chart visually anlamlı). */
function niceMaxValue(rawMax: number): number {
  if (rawMax <= 0) return 4;
  if (rawMax <= 4) return 4;
  if (rawMax <= 8) return 8;
  if (rawMax <= 10) return 10;

  const exp = Math.floor(Math.log10(rawMax));
  const base = Math.pow(10, exp);
  const norm = rawMax / base;
  let niceNorm: number;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 5) niceNorm = 5;
  else niceNorm = 10;
  return niceNorm * base;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
