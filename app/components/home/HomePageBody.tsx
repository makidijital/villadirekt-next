import Hero from "@/app/components/ui/Hero";
/* 🛡️ Hero'nun HEMEN altındaki "güven/avantaj" kartları — saf
   presentational, Hero'nun kendi kodu/prop'ları/mantığı DEĞİŞMEDİ. */
import HeroAdvantageCards from "@/app/components/home/HeroAdvantageCards";
import VillaTypeCarousel from "@/app/components/villa/VillaTypeCarousel";
import LocationCollection from "@/app/components/villa/LocationCollection";
import VillaList from "@/app/components/villa/VillaList";
/* 🛡️ İndirimli Koleksiyon (migration 062) — VillaList paraleli, AYRI
   section. Enabled + aktif villa yoksa null döner; diğerlerini etkilemez. */
import DiscountCollection from "@/app/components/home/DiscountCollection";
import FaqSection from "@/app/components/ui/FaqSection";
/* 🛡️ FAZ 34 — Homepage testimonial section (approved reviews) */
import HomepageReviewsSection from "@/app/components/home/HomepageReviewsSection";
/* 🛡️ Kısa Süreli Tarihler — takvimdeki iç boşluklar (053/054).
   Salt-okuma; boş veride null döner. Diğer section'ları etkilemez. */
import ShortGapsSection from "@/app/components/home/ShortGapsSection";

import {
  JsonLd,
  buildWebsite,
  buildOrganization,
  buildFaqJsonLd,
} from "@/app/components/seo/StructuredData";
import {
  getCachedSettings,
  getCachedFaqs,
  getCachedGlobalReviewStats,
} from "@/lib/cache.helpers";
import { resolveHeroContent } from "@/lib/hero.helpers";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ PHASE 11 — ANA SAYFA GÖVDESİ (TR / EN / DE ORTAK)
   ===============================================================
   `app/(public)/page.tsx` (TR), `app/(public)/en/page.tsx` ve
   `app/(public)/de/page.tsx` bu TEK component'i render eder —
   üç ayrı kopya YOKTUR. Locale dışında hiçbir davranış değişmez;
   gövde, section sırası ve JSON-LD üretimi TR sayfasından
   BİREBİR taşındı.

   ÇEVİRİ KAYNAKLARI (yeniden icat edilmedi):
     • Statik UI metni      → dictionary (`home.*`)
     • Hero admin içeriği   → settings + settings_translations (mig. 085)
     • Villa tipi adları    → villa_type_translations (Phase 10H helper)
     • Villa kart rozeti    → villa_translations.badge
     • SSS soru/cevap       → faq_translations (locale başına ayrı cache)
     • Villa ADI / BÖLGE    → CANONICAL (çevrilmez — proje kararı)
   =============================================================== */

export default async function HomePageBody({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale);

  /* 🛡️ SEO structured data — WebSite + Organization.
     getCachedSettings: tag "settings", TTL 1 saat. Admin settings
     save sonrası revalidateSettings() ile invalidate. Aynı render
     lifecycle'da farklı yerlerden çağrı dedupe edilir. */
  const settings = await getCachedSettings().catch(() => null);
  const brandName = settings?.site_name?.trim() || "Villa Kiralama";

  /* 🛡️ FAZ 25 — Global SSS cached fetch.
     Tag: "faqs", TTL 1 saat; admin replaceFaqs sonrası invalidate.
     🛡️ PHASE 11 — locale BAŞINA AYRI cache key'i (çapraz-dil sızıntısı
     yapısal olarak imkânsız; bkz. lib/cache.helpers.ts).
     Boş array dönerse section + JSON-LD render YOK (caller guard). */
  const faqs = await getCachedFaqs(locale).catch(() => []);

  /* 🛡️ FAZ 39F — Hero floating review card real-data wiring.
     Tek query global aggregate (cached, tag villa-reviews); admin
     moderation invalidate eder. N+1 yok; client fetch yok. */
  const heroReviewStats = await getCachedGlobalReviewStats().catch(
    () => ({ count: 0, average: 0 })
  );

  /* 🛡️ HERO CACHE-KEY — settings.updated_at varsa onu kullan, yoksa
     stable bucket'a düş (12-saatlik). Bkz. TR sayfasındaki orijinal
     gerekçe (davranış DEĞİŞMEDİ). */
  const settingsUpdatedAt = (
    settings as { updated_at?: string | null } | null
  )?.updated_at;
  /* 🛡️ React 19 react-hooks/purity rule `Date.now()` during render
     is impure — burada kasıtlı: 12-saatlik bucket fallback. */
  // eslint-disable-next-line react-hooks/purity
  const stableBucket = Math.floor(Date.now() / (12 * 3600 * 1000));
  const heroCacheKey = settingsUpdatedAt ?? stableBucket;
  /* 🛡️ PHASE 11 — hero metinleri locale'e göre: çeviri (mig. 085) →
     yoksa TR canonical → yoksa dictionary default. CTA href'leri ve
     hero görseli DİL BAĞIMSIZ. */
  const heroContent = resolveHeroContent(settings, {
    cacheKey: heroCacheKey,
    locale,
    translations: settings?.translations ?? null,
  });

  const websiteLd = buildWebsite(
    {
      name: brandName,
      description: dict.home.seo.websiteDescription,
    },
    /* 🛡️ PHASE 7D desteği — `inLanguage` yalnız locale geçilirse eklenir. */
    locale
  );

  const organizationLd = buildOrganization({
    name: brandName,
    legalName: settings?.company_legal_name || null,
    logo: settings?.site_logo || null,
    phone: settings?.phone || null,
    email: settings?.email || null,
    address: settings?.address || null,
    sameAs: [
      settings?.instagram,
      settings?.facebook,
      settings?.youtube,
      settings?.tiktok,
    ],
  });

  return (
    <>
      <JsonLd data={websiteLd} />
      <JsonLd data={organizationLd} />
      {/* 🛡️ FAZ 25 — FAQPage structured data (rich snippets için).
         FAQ varsa render edilir; boşsa hiç JSON-LD basılmaz.
         🛡️ PHASE 11 — `faqs` zaten locale'e göre çözülmüş geliyor. */}
      {faqs.length > 0 && <JsonLd data={buildFaqJsonLd(faqs, locale)} />}
      <Hero
        content={heroContent}
        reviewStats={heroReviewStats}
        locale={locale}
      />
      <HeroAdvantageCards locale={locale} />
      {/* 🛡️ "İndirimli Koleksiyon" — küratörlü fırsat villaları. Enabled
         + aktif villa yoksa null döner; Homepage Collection'ın ÜSTÜNDE. */}
      <DiscountCollection locale={locale} />
      {/* 🛡️ "Villa Tiplerini Keşfedin" — premium carousel, VillaList
         ("Sizin için seçtiklerimiz") bölümünün HEMEN ÜSTÜNDE. */}
      <VillaTypeCarousel locale={locale} />
      <VillaList locale={locale} />
      {/* 🛡️ "Bölgeler" — VillaList altı, Footer üstü. Bölge ADLARI her
         dilde CANONICAL kalır (Phase 10I kararı). */}
      <LocationCollection locale={locale} />
      {/* 🛡️ "Kısa Süreli Tarihler" — takvimdeki dolu-boş-dolu iç boşluklar.
         Veri yoksa component null döner; layout etkilenmez. */}
      <ShortGapsSection locale={locale} />
      {/* 🛡️ FAZ 25 — Global SSS section (testimonials ÜSTÜNE taşındı). */}
      <FaqSection faqs={faqs} locale={locale} />
      {/* 🛡️ FAZ 34 — "Misafir Yorumları" testimonial section. */}
      <HomepageReviewsSection locale={locale} />
    </>
  );
}
