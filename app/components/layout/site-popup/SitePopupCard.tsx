import Link from "next/link";
import { X } from "lucide-react";

import type { PublicSitePopup } from "@/lib/site-popup";

/* ===============================================================
   🛡️ SitePopupCard — açılış/kampanya popup'ının GÖRSEL gövdesi
   ===============================================================
   Hem public modal (SitePopupDialog) hem admin canlı önizleme bunu
   kullanır → iki yerde aynı tasarım, tek kaynak.

   • Tüm metinler React text node'u (düz metin) — HTML render YOK.
   • Görsel yalnız bu bileşen render edildiğinde istenir.
   • Renk/radius/gölge: mevcut sistem (SuccessModal gölgesi,
     rounded-3xl, .btn-primary, marka gradyanı #ED7926→#0973BA).
   =============================================================== */

export type SitePopupCardProps = {
  popup: Pick<
    PublicSitePopup,
    "imageUrl" | "title" | "description" | "highlight" | "stats" | "button"
  >;
  titleId?: string;
  onClose?: () => void;
  onCta?: () => void;
  closeLabel?: string;
  /** Admin önizlemesinde link gezinmesin. */
  preview?: boolean;
};

/* CTA: .btn-primary ile aynı pill ölçüsü/tipografisi; zemin kırmızı
   (Tailwind red-600, hover red-700), beyaz metin. Görselin üzerinde. */
const CTA_CLASS =
  "inline-flex items-center justify-center max-w-full px-[22px] py-3 rounded-full " +
  "text-[14px] font-semibold tracking-[0.005em] text-center text-white " +
  "bg-red-600 hover:bg-red-700 hover:-translate-y-px " +
  "shadow-[0_1px_2px_rgb(27_26_23/0.10),0_14px_28px_-10px_rgb(220_38_38/0.55)] " +
  "transition motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

export default function SitePopupCard({
  popup,
  titleId,
  onClose,
  onCta,
  closeLabel = "Kapat",
  preview = false,
}: SitePopupCardProps) {
  const { imageUrl, title, description, highlight, stats, button } = popup;
  const hasOverlayText = !!(highlight || title || description || stats.length);

  return (
    <div
      className="
        relative w-full overflow-hidden rounded-3xl bg-white
        shadow-[0_32px_80px_-24px_rgba(27,26,23,0.30),0_12px_32px_-12px_rgba(27,26,23,0.18)]
      "
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          data-popup-close
          className="
            absolute top-3 right-3 md:top-4 md:right-4 z-10
            w-10 h-10 md:w-11 md:h-11 rounded-full
            flex items-center justify-center
            bg-black/45 text-white backdrop-blur-sm
            hover:bg-black/65
            transition-colors motion-reduce:transition-none
            focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80
          "
        >
          <X size={20} aria-hidden />
        </button>
      )}

      {/* GÖRSEL + ÜZERİNDEKİ METİNLER */}
      <div
        className={
          "relative w-full min-h-[300px] sm:min-h-[340px] aspect-[4/5] sm:aspect-[16/10] max-h-[62vh] sm:max-h-[66vh] " +
          (imageUrl ? "bg-[var(--color-stone-900)]" : "bg-gradient-to-br from-[#ED7926] to-[#0973BA]")
        }
      >
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {hasOverlayText && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5"
          />
        )}

        {(hasOverlayText || button) && (
          <>
            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7 md:p-9 text-white">
              {highlight && (
                <p className="font-display leading-[0.85] tracking-[-0.04em] text-[72px] sm:text-[96px] md:text-[120px] drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
                  {highlight}
                </p>
              )}
              {title && (
                <h2
                  id={titleId}
                  className="font-display text-[22px] sm:text-[28px] md:text-[34px] leading-[1.15] tracking-[-0.02em] mt-2 max-w-[620px]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-2.5 text-[14px] md:text-[15.5px] leading-relaxed text-white/85 max-w-[560px] whitespace-pre-line">
                  {description}
                </p>
              )}
              {/* Son satır: alt bilgiler (sol) + CTA (sağ alt) — görselin
                  üzerinde. Mobilde CTA alt bilgilerin altında, sağa yaslı. */}
              {(stats.length > 0 || button) && (
                <div
                  className={
                    "sm:flex sm:items-end sm:justify-between sm:gap-6" +
                    (hasOverlayText ? " mt-4 md:mt-5" : "")
                  }
                >
                  {stats.length > 0 && (
                    <ul className="flex flex-wrap gap-2 min-w-0 sm:flex-1">
                      {stats.map((s, i) => (
                        <li
                          key={`${i}-${s}`}
                          className="px-3 py-1.5 rounded-full text-[12px] md:text-[13px] font-medium bg-white/12 border border-white/25 backdrop-blur-sm"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  {button && (
                    <div
                      className={
                        "flex justify-end sm:ml-auto sm:shrink-0 sm:max-w-[45%]" +
                        (stats.length > 0 ? " mt-4 sm:mt-0" : "")
                      }
                    >
                      {preview ? (
                        <span className={CTA_CLASS}>{button.text}</span>
                      ) : button.external ? (
                        <a
                          href={button.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={onCta}
                          className={CTA_CLASS}
                        >
                          {button.text}
                        </a>
                      ) : (
                        <Link href={button.url} onClick={onCta} className={CTA_CLASS}>
                          {button.text}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
