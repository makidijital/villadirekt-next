import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { resolveVillaImageUrl } from "@/lib/storage.helpers";

import ReservationForm from "@/app/components/reservation/ReservationForm";
import PageHero from "@/app/components/ui/PageHero";

/* 🛡️ REZERVASYON ÇOKLU DİL — statik UI metinleri MEVCUT public
   dictionary'den (`reservation.page` + `search.breadcrumbHome` +
   `villasArchive.breadcrumbCurrent` REUSE). Yeni i18n sistemi
   KURULMADI. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /rezervasyon/[slug] — ORTAK GÖVDE
   ===============================================================
   Bu dosya `app/(public)/rezervasyon/[slug]/page.tsx`'in GERÇEK
   gövdesinin TAŞINMIŞ hâlidir (DOM/CSS/veri akışı DEĞİŞTİRİLMEDEN)
   — `/en/rezervasyon/[slug]` ve `/de/rezervasyon/[slug]` AYNI
   gövdeyi render eder; kodun ikinci/üçüncü kopyası YOKTUR
   (`ContactPageBody` / `KiralikVillalarPageBody` deseni).

   🔒 İŞ MANTIĞI DEĞİŞMEDİ:
     • 4 servis çağrısı (villa / prices / discounts / images) AYNI
       sırada, AYNI imzayla.
     • `getParam` searchParams normalizasyonu BİREBİR.
     • `poolHeatingSelected={poolHeating === "1"}` BİREBİR.
     • `children` prop'u (misafir sayısı, React.children DEĞİL)
       ve `eslint-disable react/no-children-prop` BİREBİR.
     • Fiyat/snapshot/ödeme/pool heating hesaplaması bu dosyada YOK
       ve hiçbir yerde değiştirilmedi.

   Tek EKLEME: `locale` prop'u → metinler dictionary'den, breadcrumb
   href'leri locale-aware. `locale="tr"` çıktısı eski hardcoded
   metinlerle BİREBİR aynıdır.
   =============================================================== */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    start?: string | string[];
    end?: string | string[];
    adults?: string | string[];
    children?: string | string[];
    // 🛡️ HAVUZ ISITMA — 6. adım. useBookingEngine.handleReservation
    // hard-navigation (window.location.href) URL'ine ekliyor; burada
    // parse edilip ReservationForm'a prop olarak geçiyor.
    poolHeating?: string | string[];
  }>;
  /** 🛡️ Verilmezse "tr" → TR çıktısı BİREBİR eskisi gibi. */
  locale?: Locale;
};

export default async function ReservationPageBody({
  params,
  searchParams,
  locale = DEFAULT_LOCALE,
}: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const dictionary = getDictionary(locale);
  const dict = dictionary.reservation.page;

  /* 🛡️ TR'de prefix YOK → href'ler BİREBİR eskisi gibi ("/",
     "/kiralik-villalar"). EN/DE'de mevcut gerçek route'lara işaret
     eder. Yeni routing sistemi kurulmadı. */
  const localePrefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  if (!slug) {
    return (
      <section className="section-narrow py-32 text-center">
        <h2 className="font-display text-3xl text-[var(--color-stone-900)]">
          {dict.invalidUrl}
        </h2>
      </section>
    );
  }

  const villa = await getVillaBySlug(slug);

  if (!villa) {
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">
          {dict.notFoundEyebrow}
        </p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          {dict.notFoundTitle}
        </h2>
      </section>
    );
  }

  const prices = await getVillaPrices(villa.id);
  const discounts = await getVillaDiscounts(villa.id);
  const images = await getVillaImages(villa.id);
  /* 🛡️ Bucket-fix — resolveVillaImageUrl: villa-images bucket'ından URL
     üretir. Legacy FULL URL pass-through, Phase B path → URL. */
  const coverImage = resolveVillaImageUrl(images?.[0]?.image_url);

  const getParam = (param?: string | string[]) => {
    if (!param) return undefined;
    return Array.isArray(param) ? param[0] : param;
  };

  const start = getParam(sp.start);
  const end = getParam(sp.end);
  const adults = getParam(sp.adults);
  const children = getParam(sp.children);
  const poolHeating = getParam(sp.poolHeating);

  /* 🔒 CLIENT PAYLOAD SINIRI — `ReservationForm` bir client component;
     verilen prop'lar RSC ile HTML'e serileştirilir. Tam `VillaDTO`
     (ör. `private_access_token`, `commission_rate`, açıklama/SEO/harita)
     tarayıcıya GÖNDERİLMEZ; yalnız formun ve
     `buildPublicReservationPayload`'ın okuduğu alanlar AYNEN (dönüşüm
     YOK) geçirilir. Komisyon server'da DB'den okunur
     (reservation.repository) — client değerine ihtiyaç yok. */
  const reservationVilla = {
    id: villa.id,
    slug: villa.slug,
    title: villa.title,
    deposit: villa.deposit,
    cleaning_fee: villa.cleaning_fee,
    cleaning_currency: villa.cleaning_currency,
    cleaning_limit: villa.cleaning_limit,
    pool_heating_fee: villa.pool_heating_fee,
    pool_heating_currency: villa.pool_heating_currency,
    pool_heating_months: villa.pool_heating_months,
    custom_prepayment_rate: villa.custom_prepayment_rate,
  };

  return (
    <>
      {/* HERO — paylaşılan premium PageHero (kompakt editorial band) */}
      <PageHero
        breadcrumb={[
          {
            name: dictionary.search.breadcrumbHome,
            href: localePrefix === "" ? "/" : localePrefix,
          },
          {
            name: dictionary.villasArchive.breadcrumbCurrent,
            href: `${localePrefix}/kiralik-villalar`,
          },
          { name: dict.breadcrumbCurrent },
        ]}
        title={dict.title}
        description={dict.description}
        badge={{
          eyebrow: dict.badgeEyebrow,
          lines: [dict.badgeLine1, dict.badgeLine2, dict.badgeLine3],
        }}
      />

      <div className="section-narrow pt-12 md:pt-16 pb-20">
        <ReservationForm
          villa={reservationVilla}
          prices={prices}
          discounts={discounts}
          start={start}
          end={end}
          image={coverImage}
          adults={adults}
          poolHeatingSelected={poolHeating === "1"}
          locale={locale}
          /* 🛡️ false-positive: `children` burada misafir sayısı
             (rezervasyon domain prop'u), React.children DEĞİL. */
          // eslint-disable-next-line react/no-children-prop
          children={children}
        />
      </div>
    </>
  );
}
