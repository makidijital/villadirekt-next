import { getCachedDiscountCollectionVillas } from "@/lib/cache.helpers";
import VillaCard from "../villa/VillaCard";
import HorizontalCarousel from "../villa/HorizontalCarousel";
/* 🛡️ PHASE 11 — section başlığı dictionary'den; villa ADI ve BÖLGESİ
   CANONICAL kalır. Kart rozeti (badge) locale'e göre çözülür. */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { getVillaBadgesByLocale } from "@/lib/i18n/get-villa-badge-translations.server";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION — anasayfa "İndirimli Koleksiyon" section
   ===============================================================
   homepage_collections paritesi: SETTINGS BAĞIMLILIĞI YOK.
     - Veri: getCachedDiscountCollectionVillas (tag "discount")
     - Görünürlük OTOMATİK: aktif villa varsa render, yoksa null.
       (Manuel aç-kapa toggle YOK.)
     - Başlık/alt başlık: hardcoded (DISCOUNT_COLLECTION_DEFAULTS).
     - Kart: VillaCard variant="discount" (İndirimli badge + accent).
   Mevcut homepage collection / VillaList / settings'e SIFIR dokunuş.

   🛡️ PREMIUM DISCOUNT CAROUSEL (bu revizyon)
   ---------------------------------------------------------------
   Statik grid → yatay HorizontalCarousel (mevcut altyapı, CategoryCollection/
   VillaTypeCarousel ile aynı generic component — yeni dependency YOK).
   Mobilde native touch/scroll-snap swipe; desktop'ta showArrows.
   Kart tasarımı (VillaCard variant="discount" branch) tamamen yeniden
   ele alındı — normal public karttan görsel olarak belirgin şekilde
   farklı, premium "özel fırsat" hissi. Veri akışı (props) BİREBİR
   aynı — sadece görsel katman değişti.

   Bu dosyadaki <style> bloğu, VillaCard'ın discount branch'inde
   kullanılan .dc-badge-shimmer / .dc-badge-pulse / .dc-glow-ring
   class'larının keyframe/animasyon tanımlarını taşır — component
   seviyesinde çözüm, globals.css'e dokunulmadı. Yalnız bu section
   render olduğunda (collection.length > 0) bir kez basılır.
   prefers-reduced-motion: reduce → tüm animasyonlar kapanır/azalır.
=============================================================== */

export default async function DiscountCollection({
  locale = DEFAULT_LOCALE,
}: {
  locale?: Locale;
} = {}) {
  const dict = getDictionary(locale).home.discount;
  const carouselDict = getDictionary(locale).home.carousel;
  const collection = await getCachedDiscountCollectionVillas();

  /* Görünürlük kuralı: küratörlü aktif villa yoksa render edilmez. */
  if (collection.length === 0) return null;

  /* 🛡️ PHASE 11 — TR'de `DISCOUNT_COLLECTION_DEFAULTS.title` ile BİREBİR
     aynı metin (dictionary'ye taşındı); EN/DE'de çevirisi kullanılır. */
  const title = dict.title;

  /* Rozet çevirileri TEK batch sorguda (N+1 YOK); TR'de sorgu atılmaz. */
  const badgeByVillaId = await getVillaBadgesByLocale(
    collection.map((c) => c.id),
    locale
  );

  /* 🔄 KÖK NEDEN DÜZELTMESİ (bu tur) — kart JSX'i TEK yerde tanımlanır,
     hem mobile carousel hem desktop grid AYNI render fonksiyonunu
     kullanır (kopya/drift riski yok). VillaCard'ın kendisi/prop'ları
     HİÇ değişmedi — yalnızca hangi container'a yerleştirildiği değişti. */
  const renderCard = (c: (typeof collection)[number]) => (
    <VillaCard
      variant="discount"
      id={c.id}
      slug={c.slug}
      title={c.display_title}
      location={c.location}
      price={c.price ?? 0}
      currency={c.currency || "TRY"}
      images={c.images}
      badge={badgeByVillaId.get(c.id) ?? c.badge ?? undefined}
      bedrooms={c.bedrooms || 1}
      bathrooms={c.bathrooms || 1}
      guests={c.guests || 2}
      reviewAverage={c.review_average}
      reviewCount={c.review_count}
      discount={c.discount}
      /* 🛡️ İndirim penceresinin TAMAMI müsait mi? (cache.helpers >
         getCachedDiscountCollectionVillas, toplu get_blocked_villa_ids).
         `undefined` → kontrol yok → VillaCard MEVCUT davranışını korur.
         Yalnız CTA hedefini etkiler; tasarım/fiyat/veri akışı AYNI. */
      discountAvailable={c.discount_available}
      /* 🛡️ PHASE 11 — VillaCard'ın mevcut locale desteği (Phase 10G). */
      locale={locale}
    />
  );

  return (
    <section className="px-5 md:px-10 lg:px-16 py-14 md:py-20">
      {/* 🛡️ Component-scoped premium effect styles — globals.css'e
          dokunulmadı; yalnız bu section'daki .dc-* class'larını
          hedefler (VillaCard discount branch bu class'ları kullanır). */}
      <style>{`
        .dc-badge-shimmer::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent);
          transform: skewX(-20deg);
          animation: dc-shimmer-sweep 3.6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes dc-shimmer-sweep {
          0% { left: -60%; opacity: 0; }
          12% { opacity: 0.9; }
          55% { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }
        .dc-badge-pulse::before {
          content: "";
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(237,121,38,0.38), rgba(9,115,186,0.24) 60%, transparent 72%);
          animation: dc-badge-glow 2.8s ease-in-out infinite;
          z-index: -1;
          pointer-events: none;
        }
        @keyframes dc-badge-glow {
          0%, 100% { opacity: 0.35; transform: scale(0.94); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        .dc-glow-ring {
          background: linear-gradient(135deg, rgba(237,121,38,0.55), rgba(9,115,186,0.55));
          background-size: 200% 200%;
          animation: dc-glow-shift 7s ease-in-out infinite;
        }
        @keyframes dc-glow-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dc-badge-shimmer::after { animation: none; opacity: 0; }
          .dc-badge-pulse::before { animation: none; opacity: 0.45; transform: scale(1); }
          .dc-glow-ring { animation: none; background-position: 30% 50%; }
        }
        /* 🔄 KÖŞE DÜZLEŞTİRME (bu tur) — yalnız bu carousel'ın '<li>'
           öğelerine eklenen '.dc-flat-card' sınıfı altındaki VillaCard
           discount branch'inin İKİ iç içe yuvarlatılmış katmanını
           (dış "glow ring" sarmalayıcı + iç beyaz article gövdesi)
           köşesiz yapar. VillaCard.tsx DEĞİŞTİRİLMEDİ; bu, yalnız bu
           section'a özel, dıştan uygulanan bir CSS override'dır — başka
           hiçbir sayfadaki VillaCard'ı etkilemez (seçici '.dc-flat-card'
           ile scope'lu). */
        .dc-flat-card .rounded-\\[28px\\],
        .dc-flat-card .rounded-\\[26\\.5px\\] {
          border-radius: 0;
        }
      `}</style>

      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {title}
          </h2>
        </div>

        {/* 🔄 GRID → CAROUSEL DÜZELTMESİ (bu tur) — ÖNCEKİ turda "sağda
            boşluk kalmasın" derdine CSS Grid (`auto-fit`/`minmax(270px,1fr)`)
            ile çözüm arandı, ama bu YANLIŞ yaklaşımdı: `1fr` az sayıda villa
            varken mevcut kart(lar)ı container genişliğine kadar
            GEREĞİNDEN FAZLA GERDİ (tek villa ~1200px'e, kart devasa
            görünecek şekilde büyüdü). Bu section GRID DEĞİL — projede
            zaten var olan, VillaTypeCarousel.tsx / CategoryCollection.tsx
            ile AYNI generic `HorizontalCarousel` (native CSS scroll-snap,
            yeni kütüphane YOK) ile TEK satırlık, SABİT genişlikli kart
            carousel'ı olmalı — kartlar `1fr` ile ASLA esnemez, her zaman
            kendi sabit genişliğinde kalır, taşan villa'lar yatay
            kaydırma/ok butonlarıyla (showArrows, yalnız md+ ve gerçek
            overflow varsa görünür — HorizontalCarousel'in kendi mantığı)
            gezilir. Mobil davranış (touch swipe + snap) ve masaüstü
            (showArrows) TEK container'da, TEK responsive tanımla birlikte
            çalışır — artık ayrı mobile/desktop container'ları YOK. Kart
            verisi/prop'ları (`renderCard`, VillaCard'ın kendisi) HİÇ
            değişmedi — yalnızca kartların DIŞINDAKİ carousel/item genişlik
            sarmalayıcısı değişti.

            KART GENİŞLİĞİ: masaüstü item genişliği (bu tur) 300px'ten
            320px'e büyütüldü — hâlâ SABİT (`1fr`/`auto-fit`/`minmax(...,1fr)`
            YOK, kart ASLA esnemez/container'ı doldurmaz). 1280px konteynerde
            + `gap-5` (20px) ile: 4×320 + 3×20 = 1340px > 1280px → artık tam
            4 kart yerine ~3 tam kart + 4.kartın belirgin bir kısmı görünür
            (kalan taşma yatay kaydırma/ok butonlarıyla gezilir — bu,
            "yaklaşık 4 kart" hedefiyle hâlâ tutarlı, sadece kartlar biraz
            daha ferah). Mobilde genişlik ÖNCEKİ (onaylanmış) `w-[82vw]
            max-w-[320px] sm:w-[340px]` değerleriyle AYNEN korundu — yalnızca
            `md:` ve üzeri için `md:w-[300px]` → `md:w-[320px]` güncellendi.
            Tek villa varsa (veya az villa varsa) kart bu SABİT 320px'te
            kalır, container'ın kalanı basitçe boş kalan alan olarak
            GÖRÜNMEZ (flex-nowrap içeriği sola hizalar, kart kendi doğal
            genişliğinde durur — devasa/gerili kart YOK).

            KÖŞELER (bu tur): "İndirimli Kiralık Villalar" kartlarının DIŞ
            radius'u `rounded-none` (0) yapıldı — ANCAK VillaCard.tsx'e HİÇ
            dokunulmadı (kullanıcı talebi). VillaCard'ın discount branch'i
            kendi içinde iki iç içe yuvarlatılmış katman kullanıyor: dış
            sarmalayıcı `div.rounded-[28px]` (gradient "glow ring" kenarlığı,
            `dc-glow-ring`) ve onun içindeki `article.rounded-[26.5px]`
            (asıl beyaz kart gövdesi + görsel `overflow-hidden` ile buraya
            clip'leniyor). Bu component dosyasından bunları KAPATMAK için
            `<li>`'ye eklenen `dc-flat-card` class'ı + aşağıdaki `<style>`
            bloğuna eklenen scoped CSS kuralı kullanıldı (Tailwind'in kendi
            ürettiği tam class adları hedeflenip `border-radius: 0` ile
            override edildi) — YENİ bir component/kütüphane YOK, yalnız bu
            section'a özel bir CSS override. `dc-flat-card` seçicisi
            SADECE bu carousel'ın `<li>`'lerinde var olduğu için normal
            sayfalardaki (arama, villa detay "benzer villalar" vb.)
            VillaCard kullanımları bu kuraldan ETKİLENMEZ. */}
        <HorizontalCarousel
          showArrows
          ariaLabel={dict.carouselAriaLabel}
          prevLabel={carouselDict.previous}
          nextLabel={carouselDict.next}
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-5">
            {collection.map((c) => (
              <li
                /* 🛡️ P3 (MIGRATION 092) — aynı villa, seçilen her indirim
                   dönemi için AYRI bir kart üretir; villa slug/id tek
                   başına BENZERSİZ DEĞİLDİR. `card_key` server tarafında
                   `${villa_id}|${start_date}|${end_date}` olarak üretilir
                   (lib/cache.helpers). Alan yoksa (eski/başka tüketici)
                   MEVCUT davranışa düşer. */
                key={c.card_key || c.slug || c.id}
                className="dc-flat-card snap-start shrink-0 w-[82vw] max-w-[320px] sm:w-[340px] md:w-[320px]"
              >
                {renderCard(c)}
              </li>
            ))}
          </ul>
        </HorizontalCarousel>
      </div>
    </section>
  );
}
