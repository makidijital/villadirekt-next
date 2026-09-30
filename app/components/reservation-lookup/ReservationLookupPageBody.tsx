import PageHero from "@/app/components/ui/PageHero";
import { JsonLd, buildBreadcrumb } from "@/app/components/seo/StructuredData";
import ReservationLookup from "@/app/(public)/rezervasyon-kontrol/ReservationLookup";
import ReservationShareView from "@/app/(public)/rezervasyon-kontrol/ReservationShareView";
import { resolveReservationShare } from "@/app/(public)/rezervasyon-kontrol/share.resolve";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`reservationLookup` + `search.breadcrumbHome` REUSE). Token/share
   çözümleme akışı (`resolveReservationShare`) DEĞİŞTİRİLMEDİ —
   yalnız ödeme yöntemi etiketi için `locale` geçirilir. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /rezervasyon-kontrol — ORTAK GÖVDE
   ===============================================================
   `app/(public)/rezervasyon-kontrol/page.tsx`'in GERÇEK gövdesinin
   TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN) —
   `/en|de/rezervasyon-kontrol` AYNI gövdeyi render eder.
   =============================================================== */

export default async function ReservationLookupPageBody({
  searchParams,
  locale = DEFAULT_LOCALE,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
  locale?: Locale;
}) {
  const dictionary = getDictionary(locale);
  const dict = dictionary.reservationLookup;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  const homeHref = localePrefix === "" ? "/" : localePrefix;

  /* 🛡️ ADDITIVE — `?token=` ile gelen güvenli paylaşım linki. Token YOKSA
     mevcut Rezervasyon No + E-posta akışı BİREBİR çalışır. */
  const firstString = (v: unknown): string | null =>
    typeof v === "string"
      ? v
      : Array.isArray(v) && typeof v[0] === "string"
        ? v[0]
        : null;

  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dictionary.search.breadcrumbHome, url: "/" },
      { name: dict.breadcrumbCurrent },
    ],
    locale === DEFAULT_LOCALE ? undefined : locale
  );

  const sp = await searchParams;
  const token = firstString(sp?.token);
  /* 🛡️ Ödeme yöntemi ETİKETİ locale-aware çözülür (canonical
     `payment_methods.name` + `payment_method_translations`); token/
     snapshot/tutar akışı DEĞİŞMEDİ. */
  const share = token ? await resolveReservationShare(token, locale) : null;
  const isShareOk = share?.kind === "ok";

  return (
    <>
      <JsonLd data={breadcrumbLd} />

      <PageHero
        breadcrumb={[
          { name: dictionary.search.breadcrumbHome, href: homeHref },
          { name: dict.breadcrumbCurrent },
        ]}
        eyebrow={dict.heroEyebrow}
        title={isShareOk ? dict.heroTitleShare : dict.heroTitle}
        description={
          isShareOk ? dict.heroDescriptionShare : dict.heroDescription
        }
      />

      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1100px] mx-auto">
          {share?.kind === "ok" ? (
            <ReservationShareView data={share.data} locale={locale} />
          ) : share?.kind === "cancelled" ? (
            <div className="max-w-xl mx-auto rounded-2xl border border-[var(--color-stone-100)] bg-white px-6 py-14 text-center">
              <h2 className="font-display text-[26px] md:text-[32px] text-[var(--color-stone-900)] tracking-[-0.02em]">
                {dict.cancelledTitle}
              </h2>
              <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
                {dict.cancelledBody}
              </p>
            </div>
          ) : share?.kind === "invalid" ? (
            <>
              <div className="max-w-xl mx-auto rounded-2xl border border-[var(--color-stone-100)] bg-white px-6 py-10 text-center mb-10">
                <h2 className="font-display text-[24px] md:text-[30px] text-[var(--color-stone-900)] tracking-[-0.02em]">
                  {dict.invalidTitle}
                </h2>
                <p className="text-[var(--color-stone-500)] mt-3 text-[14.5px]">
                  {dict.invalidBody}
                </p>
              </div>
              <ReservationLookup locale={locale} />
            </>
          ) : (
            <ReservationLookup locale={locale} />
          )}
        </div>
      </section>
    </>
  );
}
