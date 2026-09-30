import Link from "next/link";

import { getCachedSettings } from "@/lib/cache.helpers";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ PageHero — "Signature" (from-scratch, v2)
   ===============================================================
   Tüm public iç sayfaların ortak üst başlık bandı. Ortalanmış
   editorial masthead; tipografi odak. Async server component.

   STACKING (kesin, negatif z YOK):
     <section relative isolate overflow-hidden>  → kendi SC'si
       <div absolute inset-0 z-0>  arka plan (img + tek koyu overlay)
       <div relative z-10>         içerik (her zaman üstte)

   ARKA PLAN: settings.page_hero_background_image (mig 067),
   getCachedSettings + resolveAssetUrlVersioned (cache-bust). Görsel
   yoksa transparan section → sayfa zemini (mevcut davranış).

   OVERLAY: sinematik koyu navy gradient (beyaz overlay YOK). Görsel
   doğal renklerini korur (blur/opacity/brightness YOK); kontrast
   yalnız overlay'den. Görselli durumda yazılar açık (white/sky);
   görselsiz fallback'te mevcut koyu tokenlar → okunabilirlik korunur.

   API (DEĞİŞMEZ): breadcrumb, eyebrow, title, description, pills,
   stat, badge. stat öncelikli; badge yalnız stat yokken.
=============================================================== */

type Crumb = { name: string; href?: string };

type Props = {
  breadcrumb: Crumb[];
  eyebrow?: string;
  title: React.ReactNode;
  description?: string;
  pills?: string[];
  stat?: { value: string | number; label: string };
  badge?: { eyebrow?: string; lines: string[] };
};

export default async function PageHero({
  breadcrumb,
  eyebrow,
  title,
  description,
  pills,
  stat,
  badge,
}: Props) {
  const hasBadge = !stat && !!badge && badge.lines.length > 0;
  const hasAside = !!stat || hasBadge;

  const settings = await getCachedSettings().catch(() => null);
  const bgUrl = resolveAssetUrlVersioned(
    settings?.page_hero_background_image,
    settings?.updated_at
  );
  const hasBg = !!bgUrl;

  /* Renk sistemi — görselli (koyu overlay üstü açık yazı) vs görselsiz
     (açık zemin, mevcut koyu tokenlar). */
  const cCrumb = hasBg ? "text-white/70" : "text-[var(--color-stone-400)]";
  const cCrumbSep = hasBg ? "text-white/40" : "text-[var(--color-stone-300)]";
  const cCrumbHover = hasBg ? "hover:text-white" : "hover:text-[var(--color-stone-900)]";
  const cCrumbActive = hasBg ? "text-white" : "text-[var(--color-stone-600)]";
  const cEyebrow = hasBg ? "text-sky-300" : "text-[var(--brand-coral)]";
  const cDivider = hasBg ? "bg-sky-400/70" : "bg-[var(--brand-coral)]/40";
  const cTick = hasBg ? "bg-sky-400/70" : "bg-[var(--brand-coral)]/50";
  const cTitle = hasBg ? "text-white" : "text-[var(--color-stone-900)]";
  const cDesc = hasBg ? "text-white/85" : "text-[var(--color-stone-500)]";
  const cPill = hasBg
    ? "bg-white/10 ring-white/20 text-white/85"
    : "bg-white/70 ring-black/[0.05] text-[var(--color-stone-600)]";
  const cStatValue = hasBg ? "text-white" : "text-[var(--color-stone-900)]";
  const cStatLabel = hasBg ? "text-white/70" : "text-[var(--color-stone-500)]";
  const cBadgeEyebrow = hasBg ? "text-sky-300" : "text-[var(--brand-coral)]";
  const cBadgeLine = hasBg ? "text-white" : "text-[var(--color-stone-800)]";
  const cBadgeSep = hasBg ? "text-white/40" : "text-[var(--color-stone-300)]";

  return (
    <section className="relative isolate overflow-hidden px-5 md:px-10 lg:px-16 pt-12 md:pt-20 pb-6 md:pb-10">
      {/* BACKGROUND — img (doğal renk) + tek sinematik koyu overlay; z-0 */}
      {bgUrl && (
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="eager"
            decoding="async"
            className="pointer-events-none select-none w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(5,18,40,0.45), rgba(5,18,40,0.30)), linear-gradient(180deg, rgba(6,12,24,0.58) 0%, rgba(8,15,30,0.48) 35%, rgba(10,18,35,0.42) 65%, rgba(8,14,28,0.55) 100%)",
            }}
          />
        </div>
      )}

      {/* CONTENT — her zaman üstte */}
      <div className="relative z-10 max-w-[900px] mx-auto text-center">
        {/* BREADCRUMB */}
        <nav
          aria-label="Breadcrumb"
          className={
            "flex items-center justify-center flex-wrap gap-x-3 gap-y-1 text-[12px] " +
            cCrumb
          }
        >
          {breadcrumb.map((c, i) => (
            <span
              key={`${c.name}-${i}`}
              className="inline-flex items-center gap-x-3"
            >
              {i > 0 && (
                <span aria-hidden="true" className={cCrumbSep}>
                  ·
                </span>
              )}
              {c.href ? (
                <Link
                  href={c.href}
                  className={
                    "transition-colors motion-reduce:transition-none " + cCrumbHover
                  }
                >
                  {c.name}
                </Link>
              ) : (
                <span className={"font-medium " + cCrumbActive}>{c.name}</span>
              )}
            </span>
          ))}
        </nav>

        {/* EYEBROW — iki yandan ince hairline (imza) */}
        {eyebrow && (
          <div className="flex items-center justify-center gap-3 mt-9 md:mt-12">
            <span aria-hidden="true" className={"w-7 h-px " + cDivider} />
            <p
              className={
                "text-[11px] tracking-[0.28em] uppercase font-medium " + cEyebrow
              }
            >
              {eyebrow}
            </p>
            <span aria-hidden="true" className={"w-7 h-px " + cDivider} />
          </div>
        )}

        {/* TITLE — odak noktası */}
        <h1
          className={
            "font-display font-medium leading-[1.02] tracking-[-0.035em] text-[40px] md:text-[58px] lg:text-[66px] mx-auto max-w-3xl " +
            cTitle +
            " " +
            (eyebrow ? "mt-6" : "mt-9 md:mt-12")
          }
        >
          {title}
        </h1>

        {/* DESCRIPTION */}
        {description && (
          <p
            className={
              "mt-6 md:mt-7 text-[15px] md:text-[16px] leading-[1.75] max-w-xl mx-auto " +
              cDesc
            }
          >
            {description}
          </p>
        )}

        {/* PILLS */}
        {pills && pills.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
            {pills.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className={
                  "inline-flex items-center px-3 py-1 rounded-full ring-1 ring-inset text-[11px] tracking-[0.04em] font-medium tabular-nums " +
                  cPill
                }
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* STAT / BADGE — kutu yok; doğal meta */}
        {hasAside && (
          <div className="mt-10 md:mt-14 flex justify-center">
            {stat && (
              <div className="inline-flex flex-col items-center">
                <span aria-hidden="true" className={"w-8 h-px mb-5 " + cTick} />
                <span
                  className={
                    "font-display font-medium text-[44px] md:text-[52px] leading-none tracking-[-0.035em] tabular-nums " +
                    cStatValue
                  }
                >
                  {stat.value}
                </span>
                <span
                  className={
                    "mt-3 text-[11px] tracking-[0.22em] uppercase font-medium " +
                    cStatLabel
                  }
                >
                  {stat.label}
                </span>
              </div>
            )}

            {hasBadge && badge && (
              <div className="inline-flex flex-col items-center">
                <span aria-hidden="true" className={"w-8 h-px mb-5 " + cTick} />
                {badge.eyebrow && (
                  <p
                    className={
                      "text-[11px] tracking-[0.24em] uppercase font-medium mb-3.5 " +
                      cBadgeEyebrow
                    }
                  >
                    {badge.eyebrow}
                  </p>
                )}
                <div className="flex items-center flex-wrap justify-center gap-x-3 gap-y-1.5">
                  {badge.lines.map((line, i) => (
                    <span key={`${line}-${i}`} className="inline-flex items-center gap-x-3">
                      {i > 0 && (
                        <span aria-hidden="true" className={cBadgeSep}>
                          ·
                        </span>
                      )}
                      <span
                        className={
                          "font-display text-[15.5px] md:text-[16.5px] tracking-[-0.01em] " +
                          cBadgeLine
                        }
                      >
                        {line}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
