import Link from "next/link";
import {
  CheckCircle2,
  Check,
  Home,
  MessageCircle,
  ArrowLeft,
  Phone,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";

import PublicBreadcrumb from "@/app/components/ui/PublicBreadcrumb";
import CopyReferenceButton from "@/app/components/reservation/CopyReferenceButton";

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
  const dictionary = getDictionary(locale);
  const dict = dictionary.reservation.success;

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

  /* Telefon — WhatsApp ile AYNI settings kaynağı (yeni veri YOK). */
  const phoneDisplay = (settings?.phone || "").trim();
  /* tel: deseni villa detay CTA ile AYNI (`tel:${phone.trim()}`). */
  const phoneHref = phoneDisplay ? `tel:${phoneDisplay}` : null;

  /* 🎨 UI REDESIGN — /rezervasyon checkout ile AYNI dil: #F7F9FC zemin,
     ortak PublicBreadcrumb, beyaz kartlar. ref / villa / WhatsApp /
     ana sayfa / villa detay href'leri ve koşulları BİREBİR AYNI. */
  const homeHref = localePrefix === "" ? "/" : localePrefix;

  return (
    <div className="bg-[#F7F9FC]">
      <div className="section-narrow pt-6 md:pt-10 pb-16 md:pb-24">
        {/* Villa adı bu sayfada bilinmiyor (yalnız slug) → yeni veri
            çekilmez; breadcrumb: Ana sayfa → Rezervasyon. */}
        <PublicBreadcrumb
          className="mb-6 md:mb-8"
          items={[
            { name: dictionary.search.breadcrumbHome, href: homeHref },
            { name: dictionary.reservation.page.breadcrumbCurrent },
          ]}
        />

        {/* SUCCESS HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div
            aria-hidden
            className="flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-full bg-[#E6F6EF] text-[#00A86B]"
          >
            <CheckCircle2 size={28} strokeWidth={1.9} className="md:hidden" />
            <CheckCircle2 size={32} strokeWidth={1.9} className="hidden md:block" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#00A86B]">
              {dict.eyebrow}
            </p>
            <h1 className="mt-1 font-display font-bold text-[26px] md:text-[32px] leading-tight tracking-[-0.02em] text-[#0A1633]">
              {dict.title}
            </h1>
          </div>
        </header>
        <p className="mt-3 md:mt-4 max-w-2xl text-[13.5px] md:text-[14.5px] leading-relaxed text-[#5B6478]">
          {dict.description}
        </p>

        {/* ANA İÇERİK — sol özet / sağ sonraki adım */}
        <div
          className={
            "mt-6 md:mt-8 grid grid-cols-1 gap-4 md:gap-5 items-start " +
            (refNumber ? "lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" : "")
          }
        >
          {/* SOL — REZERVASYON ÖZETİ (yalnız ref varsa; davranış aynı) */}
          {refNumber && (
            <section className={SUCCESS_CARD_CLASS} aria-labelledby="success-summary-title">
              <h2
                id="success-summary-title"
                className="flex items-center gap-2 font-display font-bold text-[16px] text-[#0A1633]"
              >
                <ClipboardCheck size={16} strokeWidth={1.9} className="text-[#1B4EF5]" aria-hidden />
                {dict.summaryTitle}
              </h2>
              <div className="mt-4 rounded-[12px] border border-[#E5E7EB] bg-[#F7F9FC] p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#64708A]">
                  {dict.referenceLabel}
                </p>
                <div className="mt-1.5 flex items-center gap-2.5 min-w-0">
                  <p
                    className="min-w-0 flex-1 font-display font-bold text-[15px] md:text-[17px] leading-snug text-[#0A1633] select-all break-all"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {refNumber}
                  </p>
                  <CopyReferenceButton
                    value={refNumber}
                    label={dict.copyRef}
                    copiedLabel={dict.copiedRef}
                  />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-[#64708A]">
                  {dict.referenceHint}
                </p>
              </div>
            </section>
          )}

          {/* SAĞ — SONRAKİ ADIM / İLETİŞİM */}
          <section className={SUCCESS_CARD_CLASS} aria-labelledby="success-next-title">
            <h2
              id="success-next-title"
              className="flex items-center gap-2 font-display font-bold text-[16px] text-[#0A1633]"
            >
              <ArrowRight size={16} strokeWidth={1.9} className="text-[#1B4EF5]" aria-hidden />
              {dict.nextStepTitle}
            </h2>
            {/* Güven maddeleri — mevcut açıklamadaki bilgilerden türetildi
                (yeni garanti YOK); WhatsApp maddesi yalnız link varsa. */}
            <ul className="mt-4 space-y-2.5">
              {[
                dict.trustSaved,
                dict.trustContact,
                ...(whatsappHref ? [dict.trustWhatsapp] : []),
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[13px] text-[#0A1633]">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E6F6EF] text-[#00A86B]"
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            {phoneHref && phoneDisplay && (
              <a
                href={phoneHref}
                className="mt-4 flex items-center gap-2.5 rounded-[12px] border border-[#E5E7EB] px-3.5 py-3 text-[13px] text-[#0A1633] hover:border-[#C9D3E3] transition-colors motion-reduce:transition-none"
              >
                <Phone size={15} strokeWidth={1.9} className="text-[#1B4EF5]" aria-hidden />
                <span className="text-[#64708A]">{dict.phoneLabel}</span>
                <span className="ml-auto font-semibold tabular-nums truncate">{phoneDisplay}</span>
              </a>
            )}
          </section>
        </div>

        {/* AKSİYON BUTONLARI — üçü de AYNI koşul/href ile */}
        <div className="mt-6 md:mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3">
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={BTN_BASE + " bg-[#00A86B] text-white hover:bg-[#009160] focus-visible:ring-[#00A86B]/40"}
            >
              <MessageCircle size={16} strokeWidth={1.9} />
              {dict.whatsappCta}
            </a>
          )}

          <Link
            href={homeHref}
            className={BTN_BASE + " bg-[#1B4EF5] text-white hover:bg-[#1640CC] focus-visible:ring-[#1B4EF5]/40"}
          >
            <Home size={16} strokeWidth={1.9} />
            {dict.homeCta}
          </Link>

          {villaSlug && (
            <Link
              href={`${localePrefix}/kiralik-villa/${villaSlug}`}
              className={BTN_BASE + " border border-[#E5E7EB] bg-white text-[#0A1633] hover:border-[#C9D3E3] hover:bg-[#FBFCFE] focus-visible:ring-[#1B4EF5]/30"}
            >
              <ArrowLeft size={16} strokeWidth={1.9} />
              {dict.villaCta}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const SUCCESS_CARD_CLASS =
  "min-w-0 rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(10,22,51,0.04)] p-5 md:p-6";

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 h-[50px] px-5 w-full sm:w-auto rounded-[12px] text-[14px] font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2";
