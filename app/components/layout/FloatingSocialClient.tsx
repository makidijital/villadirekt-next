"use client";

import { Phone } from "lucide-react";
import { usePathname } from "next/navigation";

/* 🛡️ PHASE 11 — locale, Header (9A) / Footer (9B) / BottomNav ile AYNI
   desenle `usePathname()` üzerinden türetilir. */
import { localeFromPathname } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ FLOATING SOCIAL — SUNUM KATMANI (client)
   ===============================================================
   PHASE 11 WRAPPER SPLIT: `FloatingSocial.tsx` (server) `settings`'i
   okuyup href'leri türetmeye DEVAM EDER; bu dosya yalnız SUNUMU yapar.
   `HeaderWrapper → Header` ve `FooterWrapper → Footer` (Phase 9A/9B)
   ile BİREBİR AYNI desen — yeni bir mimari İCAT EDİLMEDİ.

   ⚠️ JSX, className'ler, `<style>` bloğu, ikonlar, SVG path, href'ler,
   z-index, responsive ve animasyon davranışı server dosyasından
   BİREBİR taşındı. TEK fark: 5 metin (`aria-label` / `title` /
   görünür etiket) artık dictionary'den geliyor.

   `getCachedSettings()` BU DOSYADA YOKTUR — server sınırı korunur.
   =============================================================== */

export default function FloatingSocialClient({
  phoneHref,
  whatsappHref,
}: {
  phoneHref: string | null;
  whatsappHref: string | null;
}) {
  const dict = getDictionary(localeFromPathname(usePathname())).layout
    .floatingSocial;

  return (
    <>
      {/* 🛡️ Scoped animasyon — yalnız bu component. globals.css'e
          dokunulmadı; class isimleri (fc-fab-*) proje genelinde eşsiz. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .fc-fab-glow {
            animation: fc-fab-breathe 3.2s ease-in-out infinite;
          }
          .fc-fab:hover .fc-fab-glow,
          .fc-fab:focus-visible .fc-fab-glow {
            animation-duration: 1.3s;
          }
        }
        @keyframes fc-fab-breathe {
          0%, 100% { opacity: 0.45; transform: scale(0.92); }
          50% { opacity: 0.85; transform: scale(1.1); }
        }
        .fc-fab-glow--orange {
          background: radial-gradient(circle, rgba(237,121,38,0.6) 0%, rgba(237,121,38,0) 72%);
          filter: blur(11px);
        }
        .fc-fab-glow--green {
          background: radial-gradient(circle, rgba(37,211,102,0.6) 0%, rgba(37,211,102,0) 72%);
          filter: blur(11px);
        }
      `}</style>

      <aside
        aria-label={dict.ariaLabel}
        className="
          fixed right-3 md:right-5 bottom-20 md:bottom-8
          z-40
          hidden md:flex flex-col gap-4
          print:hidden
        "
      >
        {/* HEMEN ARA — premium orange FAB (tel:). Ambient breathing glow +
            camsı ikon rozeti + turuncu/mavi dual-tone ambient shadow. */}
        {phoneHref && (
          <a
            href={phoneHref}
            aria-label={dict.call}
            title={dict.call}
            className="
              fc-fab group/fab relative isolate inline-flex items-center gap-2.5
              rounded-full pl-2.5 pr-2.5 sm:pr-4 py-2.5
              bg-gradient-to-br from-[#ED7926] to-[#c85f16] text-white
              ring-1 ring-white/15
              shadow-[0_16px_36px_-14px_rgba(237,121,38,0.6),0_10px_24px_-12px_rgba(9,115,186,0.32)]
              hover:shadow-[0_22px_46px_-14px_rgba(237,121,38,0.75),0_14px_30px_-12px_rgba(9,115,186,0.42)]
              transition-transform duration-300 motion-reduce:transition-none
              hover:scale-[1.06] hover:-translate-y-0.5
              motion-reduce:hover:scale-100 motion-reduce:hover:translate-y-0
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ED7926]/60 focus-visible:ring-offset-2
            "
          >
            <span
              aria-hidden="true"
              className="fc-fab-glow fc-fab-glow--orange absolute -inset-2 rounded-full -z-10"
            />
            <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/95 text-[#ED7926] shrink-0 overflow-hidden shadow-[inset_0_-2px_3px_rgba(0,0,0,0.08)]">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/80 to-transparent"
              />
              <Phone size={16} strokeWidth={2.1} className="relative" aria-hidden />
            </span>
            <span className="hidden sm:inline pr-1 text-[13px] font-semibold tracking-wide whitespace-nowrap">
              {dict.call}
            </span>
          </a>
        )}

        {/* WHATSAPP — gerçek marka yeşili FAB (wa.me). Ambient breathing
            glow + camsı ikon rozeti + yeşil/mavi dual-tone ambient shadow
            (WhatsApp'ın kendi kimliği korunuyor, mavi yalnız gölgede
            hafif bir vurgu). Glyph/svg path AYNEN — değiştirilmedi. */}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={dict.whatsapp}
            title={dict.whatsapp}
            className="
              fc-fab group/fab relative isolate inline-flex items-center gap-2.5
              rounded-full pl-2.5 pr-2.5 sm:pr-4 py-2.5
              bg-[#25D366] text-white
              ring-1 ring-[#1da851]/40
              shadow-[0_16px_36px_-14px_rgba(37,211,102,0.6),0_10px_24px_-12px_rgba(9,115,186,0.28)]
              hover:shadow-[0_22px_46px_-14px_rgba(37,211,102,0.75),0_14px_30px_-12px_rgba(9,115,186,0.38)]
              transition-transform duration-300 motion-reduce:transition-none
              hover:scale-[1.06] hover:-translate-y-0.5
              motion-reduce:hover:scale-100 motion-reduce:hover:translate-y-0
              focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2
            "
          >
            <span
              aria-hidden="true"
              className="fc-fab-glow fc-fab-glow--green absolute -inset-2 rounded-full -z-10"
            />
            <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 overflow-hidden">
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
              />
              {/* Solid WHITE WhatsApp glyph — yeşil zeminde net görünür. */}
              <svg
                viewBox="0 0 24 24"
                width={20}
                height={20}
                fill="#ffffff"
                aria-hidden
                className="relative"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.157 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.477-.985zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
            </span>
            <span className="hidden sm:inline pr-1 text-[13px] font-semibold tracking-wide whitespace-nowrap">
              {dict.whatsapp}
            </span>
          </a>
        )}
      </aside>
    </>
  );
}
