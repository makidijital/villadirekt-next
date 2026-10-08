import OfferRequestForm from "@/app/(public)/teklif-al/OfferRequestForm";
import PublicBreadcrumb from "@/app/components/ui/PublicBreadcrumb";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`offer` namespace). Taxonomy verisi, API endpoint'i, honeypot/
   time-trap ve submit payload'ı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { localeHref } from "@/lib/i18n/locale-href";
/* 🎨 Yardım kartı — public layout / FloatingSocial'ın ZATEN okuduğu
   cache'li settings (aynı request'te dedupe → ek DB sorgusu YOK). */
import { getCachedSettings } from "@/lib/cache.helpers";

/* ===============================================================
   🛡️ /teklif-al — ORTAK GÖVDE
   ===============================================================
   `/teklif-al`, `/en/teklif-al`, `/de/teklif-al` AYNI gövdeyi render
   eder (`ContactPageBody` deseni).

   🎨 REDESIGN (yalnız UI): PublicBreadcrumb + kompakt başlık; güven
   satırları form içindeki sağ kolona (özet/CTA/yardım) taşındı.
   Telefon/WhatsApp href'leri FloatingSocial ile BİREBİR aynı türetilir.
   =============================================================== */

export default async function OfferPageBody({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const dictionary = getDictionary(locale);
  const dict = dictionary.offer;

  const settings = await getCachedSettings().catch(() => null);
  const phoneHref = settings?.phone?.trim()
    ? `tel:${settings.phone.trim()}`
    : null;
  const phoneDigits = (settings?.phone || "").replace(/\D/g, "");
  const whatsappHref =
    settings?.whatsapp_link?.trim() ||
    (phoneDigits ? `https://wa.me/${phoneDigits}` : null);

  return (
    <div className="bg-[#F7F9FC]">
      <div className="section-narrow pt-6 md:pt-10 pb-16 md:pb-24">
        <PublicBreadcrumb
          className="mb-6 md:mb-8"
          items={[
            {
              name: dictionary.search.breadcrumbHome,
              href: localeHref("/", locale),
            },
            { name: dictionary.header.offer },
          ]}
        />

        {/* HEADER — kompakt */}
        <header className="max-w-2xl">
          <p className="text-[10.5px] md:text-[11px] font-bold uppercase tracking-[0.18em] text-[#1B4EF5]">
            {dictionary.header.offer}
          </p>
          <h1 className="mt-2 font-display font-bold text-[27px] sm:text-[30px] md:text-[36px] lg:text-[40px] leading-[1.12] tracking-[-0.025em] text-[#0A1633]">
            {dict.heroTitle}
          </h1>
          <p className="mt-3 text-[13.5px] md:text-[14.5px] leading-relaxed text-[#5B6478]">
            {dict.heroDescription}
          </p>
        </header>

        {/* FORM (client island) — sol bölümler + sağ özet/CTA/yardım */}
        <div className="mt-6 md:mt-8">
          <OfferRequestForm
            locale={locale}
            phoneHref={phoneHref}
            whatsappHref={whatsappHref}
          />
        </div>
      </div>
    </div>
  );
}
