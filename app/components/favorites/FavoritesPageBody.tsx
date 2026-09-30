import PageHero from "@/app/components/ui/PageHero";
import FavoritesGrid from "@/app/(public)/favoriler/FavoritesGrid";

/* 🛡️ PUBLIC ÇOKLU DİL — statik metinler MEVCUT public dictionary'den
   (`favoritesPage` + `search.breadcrumbHome` REUSE). Favori mantığı
   (localStorage) ve veri akışı DEĞİŞTİRİLMEDİ. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /favoriler — ORTAK GÖVDE
   ===============================================================
   `app/(public)/favoriler/page.tsx`'in GERÇEK gövdesinin TAŞINMIŞ
   hâlidir (DOM/CSS DEĞİŞTİRİLMEDEN) — `/en|de/favoriler` AYNI gövdeyi
   render eder.
   =============================================================== */

export default function FavoritesPageBody({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
}) {
  const dictionary = getDictionary(locale);
  const dict = dictionary.favoritesPage;
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  return (
    <>
      <PageHero
        breadcrumb={[
          {
            name: dictionary.search.breadcrumbHome,
            href: localePrefix === "" ? "/" : localePrefix,
          },
          { name: dict.heroTitle },
        ]}
        eyebrow={dict.heroEyebrow}
        title={dict.heroTitle}
        description={dict.heroDescription}
      />

      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-24 md:pb-32">
        <div className="max-w-[1280px] mx-auto">
          <FavoritesGrid locale={locale} />
        </div>
      </section>
    </>
  );
}
