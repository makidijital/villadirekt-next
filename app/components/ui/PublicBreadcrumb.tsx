import Link from "next/link";
import { ChevronRight } from "lucide-react";

/* ===============================================================
   🧭 PublicBreadcrumb — public sayfa breadcrumb'ı (ortak)
   ===============================================================
   /rezervasyon checkout başlığındaki breadcrumb'ın (ReservationCheckout-
   Header) BİREBİR aynı markup/stil'i, ortak component olarak çıkarıldı:
   12px · #64708A metin · ChevronRight ayırıcı · link hover #1B4EF5 ·
   son öğe (href yok) semibold #0A1633.

   Kullananlar:
     • ReservationCheckoutHeader (/rezervasyon) — varsayılan (wrap).
     • VillaDetailBody (/kiralik-villa/[slug]) — `singleLine`: mobilde
       tek satır, uzun son öğe (villa adı) `…` ile kısalır; yatay taşma
       YOK.
   Salt sunum (server component); metin/href'ler çağırandan gelir.
   =============================================================== */

export type BreadcrumbItem = { name: string; href?: string };

type Props = {
  items: BreadcrumbItem[];
  ariaLabel?: string;
  /** true → tek satır + son öğe truncate (uzun villa adı). */
  singleLine?: boolean;
  className?: string;
  /** "onImage" → koyu görsel üstü beyaz ton (listing hero). Varsayılan
   *  "default" → mevcut koyu-üstü-açık zemin stili AYNEN. */
  tone?: "default" | "onImage";
};

export default function PublicBreadcrumb({
  items,
  ariaLabel = "Breadcrumb",
  singleLine = false,
  className = "",
  tone = "default",
}: Props) {
  const onImage = tone === "onImage";
  const cBase = onImage ? "text-white/75" : "text-[#64708A]";
  const cSep = onImage ? "text-white/45" : "text-[#A3ACBD]";
  const cHover = onImage ? "hover:text-white" : "hover:text-[#1B4EF5]";
  const cCurrent = onImage ? "font-semibold text-white" : "font-semibold text-[#0A1633]";
  return (
    <nav
      aria-label={ariaLabel}
      className={
        "flex items-center gap-x-2 text-[12px] " +
        cBase +
        " " +
        (singleLine ? "min-w-0 overflow-hidden whitespace-nowrap " : "flex-wrap gap-y-1 ") +
        className
      }
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span
            key={`${c.name}-${i}`}
            className={
              "inline-flex items-center gap-x-2 " +
              (singleLine ? (isLast ? "min-w-0" : "shrink-0") : "")
            }
          >
            {i > 0 && (
              <ChevronRight size={12} aria-hidden="true" className={"shrink-0 " + cSep} />
            )}
            {c.href ? (
              <Link
                href={c.href}
                className={cHover + " transition-colors motion-reduce:transition-none"}
              >
                {c.name}
              </Link>
            ) : (
              <span
                aria-current="page"
                title={singleLine ? c.name : undefined}
                className={cCurrent + (singleLine ? " truncate" : "")}
              >
                {c.name}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
