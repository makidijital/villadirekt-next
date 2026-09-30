import Link from "next/link";
import { CheckCircle2, Home, MessageCircle, ArrowLeft } from "lucide-react";

import { getCachedSettings } from "@/lib/cache.helpers";

/* 🛡️ REZERVASYON ÇOKLU DİL — statik UI metinleri MEVCUT public
   dictionary'den (`reservation.success`). Yeni i18n sistemi
   KURULMADI. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /rezervasyon/basarili — ORTAK GÖVDE
   ===============================================================
   Bu dosya `app/(public)/rezervasyon/basarili/page.tsx`'in GERÇEK
   gövdesinin TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN)
   — `/en/rezervasyon/basarili` ve `/de/rezervasyon/basarili` AYNI
   gövdeyi render eder; kodun ikinci/üçüncü kopyası YOKTUR.

   ReservationForm başarılı submit sonrası `router.push` ile bu
   sayfaya yönlendirir (locale-aware: TR `/rezervasyon/basarili`,
   EN `/en/rezervasyon/basarili`, DE `/de/rezervasyon/basarili`).

   QUERY PARAMETRELERİ (DEĞİŞMEDİ):
     - ref:    reservation.id (string) — referans numarası
     - villa:  villa.slug (string)     — "Villa Detayına Dön" butonu

   VERİ KAYNAĞI (DEĞİŞMEDİ):
     - getCachedSettings → whatsapp_link / phone (WhatsApp butonu).
     Cache zaten public sayfalardan kullanılıyor; ek DB hit yok.

   `metadata` (title + robots noindex) route dosyalarında KALDI.
   =============================================================== */

type SearchParams = Promise<{ ref?: string; villa?: string }>;

type Props = {
  searchParams: SearchParams;
  /** 🛡️ Verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
};

export default async function ReservationSuccessBody({
  searchParams,
  locale = DEFAULT_LOCALE,
}: Props) {
  const sp = (await searchParams) || {};
  const dict = getDictionary(locale).reservation.success;

  /* 🛡️ TR'de prefix YOK → href'ler BİREBİR eskisi gibi ("/",
     "/kiralik-villa/<slug>"). EN/DE'de mevcut gerçek route'lara
     işaret eder. Yeni routing sistemi kurulmadı. */
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const refNumber =
    typeof sp.ref === "string" && sp.ref.trim().length > 0
      ? sp.ref.trim()
      : null;
  const villaSlug =
    typeof sp.villa === "string" && sp.villa.trim().length > 0
      ? sp.villa.trim()
      : null;

  /* 🛡️ WhatsApp link öncelik sırası (FloatingSocial paterni AYNEN):
       1) settings.whatsapp_link (admin'in girdiği tam URL)
       2) https://wa.me/<phoneDigits> (settings.phone'dan türetilir)
       3) null → WhatsApp butonu gizli */
  const settings = await getCachedSettings().catch(() => null);
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  return (
    <section
      className="
        min-h-[70vh]
        flex items-center justify-center
        px-5 md:px-10 py-16 md:py-24
      "
    >
      <div className="max-w-2xl w-full text-center">
        {/* Yeşil check ikonu — luxury success badge */}
        <div className="flex justify-center mb-7 md:mb-9">
          <div
            className="
              w-24 h-24 md:w-28 md:h-28 rounded-full
              bg-emerald-50
              ring-2 ring-emerald-100
              flex items-center justify-center
              text-emerald-600
              shadow-[0_20px_44px_-16px_rgba(16,185,129,0.28)]
            "
            aria-hidden
          >
            <CheckCircle2 size={56} strokeWidth={1.5} />
          </div>
        </div>

        {/* Eyebrow */}
        <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium text-[var(--brand-coral)]">
          {dict.eyebrow}
        </p>

        {/* Başlık */}
        <h1
          className="
            font-display
            text-[32px] md:text-[44px]
            text-[var(--color-stone-900)]
            mt-4
            tracking-[-0.02em]
            leading-[1.05]
          "
        >
          {dict.title}
        </h1>

        {/* Açıklama */}
        <p
          className="
            text-[15px] md:text-[16.5px]
            text-[var(--color-stone-600)]
            mt-5 md:mt-6
            max-w-xl mx-auto
            leading-[1.75]
          "
        >
          {dict.description}
        </p>

        {/* Referans kartı — yalnız ref varsa render */}
        {refNumber && (
          <div
            className="
              mt-8 md:mt-10
              inline-flex flex-col items-center
              rounded-2xl
              border border-[var(--color-stone-100)]
              bg-[var(--color-sand-50)]
              px-6 py-4 md:px-8 md:py-5
            "
          >
            <p className="text-[10.5px] tracking-[0.22em] uppercase font-medium text-[var(--color-stone-500)]">
              {dict.referenceLabel}
            </p>
            <p
              className="
                font-display text-[18px] md:text-[20px]
                text-[var(--color-stone-900)]
                mt-2 tracking-[-0.01em]
                select-all break-all
              "
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {refNumber}
            </p>
            <p className="text-[11.5px] text-[var(--color-stone-500)] mt-2 max-w-xs">
              {dict.referenceHint}
            </p>
          </div>
        )}

        {/* Aksiyon butonları */}
        <div
          className="
            mt-10 md:mt-12
            flex flex-col sm:flex-row items-stretch sm:items-center justify-center
            gap-3
          "
        >
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center justify-center gap-2
                px-6 py-3 rounded-full
                bg-emerald-600 text-white
                text-[13.5px] font-medium tracking-[0.02em]
                shadow-[0_18px_36px_-14px_rgba(16,185,129,0.55),0_4px_12px_-6px_rgba(16,185,129,0.35)]
                hover:bg-emerald-700
                hover:-translate-y-[1px]
                transition-[transform,box-shadow,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-emerald-500/40
              "
            >
              <MessageCircle size={15} strokeWidth={1.75} />
              {dict.whatsappCta}
            </a>
          )}

          <Link
            href={localePrefix === "" ? "/" : localePrefix}
            className="btn-primary !px-6 !py-3 text-[13.5px]"
          >
            <Home size={15} strokeWidth={1.75} />
            {dict.homeCta}
          </Link>

          {villaSlug && (
            <Link
              href={`${localePrefix}/kiralik-villa/${villaSlug}`}
              className="
                inline-flex items-center justify-center gap-2
                px-6 py-3 rounded-full
                border border-[var(--color-stone-200)]
                text-[var(--color-stone-700)]
                text-[13.5px] font-medium tracking-[0.02em]
                hover:border-[var(--brand-coral)]
                hover:text-[var(--color-stone-900)]
                hover:bg-[var(--brand-coral-tint)]
                hover:-translate-y-[1px]
                transition-[transform,border-color,color,background-color] duration-300
                motion-reduce:transition-none motion-reduce:hover:translate-y-0
                focus:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--brand-coral)]/30
              "
            >
              <ArrowLeft size={15} strokeWidth={1.75} />
              {dict.villaCta}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
