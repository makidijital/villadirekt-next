/* ===============================================================
   🛡️ PHASE 10G — TR BYTE-IDENTITY REGRESYON KİLİDİ
   ===============================================================
   Phase 10G'de TR villa detay gövdesi ortak bir component'e
   (`VillaDetailBody`) taşındı ve hardcoded TR metinlerin YERİNE
   i18n dictionary anahtarları geçti.

   Bu dosya, TR public çıktısının DEĞİŞMEDİĞİNİ kilitler: her
   dictionary anahtarının TR değeri, refactor ÖNCESİNDE ilgili
   dosyada duran METNİN BİREBİR (byte-identical) KENDİSİDİR.
   Buradaki beklenen değerler `git show HEAD~` ile değil, refactor
   öncesi kaynaktan ELLE kopyalanmıştır ve TR görünümünün sözleşmesidir.

   Bir anahtarın TR değeri "iyileştirilirse" bu test KIRILIR —
   kasıtlı bir TR metin değişikliği yapılmadıkça düzeltilmemelidir.
   =============================================================== */

import { describe, it, expect } from "vitest";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDictionaryString } from "@/lib/i18n/format-dictionary-string";

const tr = getDictionary("tr");

describe("TR byte-identity — villa detay sayfası (kiralik-villa/[slug])", () => {
  it.each([
    [tr.villa.notFoundTitle, "Villa bulunamadı"],
    [tr.villa.notFoundBody, "Aradığın villa kaldırılmış veya taşınmış olabilir."],
    [tr.villa.notFoundCta, "Tüm villalara dön"],
    [tr.villa.aboutTitle, "Villa hakkında"],
    [tr.villa.descriptionEmpty, "Açıklama bulunmuyor"],
    [tr.villa.seasonPricesTitle, "Sezon Fiyatları"],
    [tr.price.noPriceInfo, "Fiyat bilgisi yok"],
    [tr.villa.calendarTitle, "Takvim"],
    [tr.villa.distancesEyebrow, "ÇEVREYİ KEŞFEDİN"],
    [tr.villa.distancesTitle, "Yakındaki Noktalar"],
    [
      tr.villa.distancesSubtitle,
      "Villaya yürüme ve araçla ulaşım mesafesindeki başlıca noktalar.",
    ],
    [tr.villa.distancesEmpty, "Bilgi yok"],
    [tr.villa.featuresTitle, "Ne sunuyor?"],
    [tr.villa.featuresEmpty, "Özellik bilgisi bulunmuyor"],
    [tr.pool.sectionTitle, "Havuz Bilgileri"],
    [tr.pool.width, "Genişlik"],
    [tr.pool.length, "Uzunluk"],
    [tr.pool.depth, "Derinlik"],
    [tr.pool.noDimensions, "Ölçü bilgisi yok"],
    [tr.villa.priceIncludesTitle, "Konaklama ücretine dahil"],
    [tr.villa.rulesTitle, "Konaklama kuralları"],
    [tr.villa.checkInOutTitle, "Villa Giriş & Çıkış Saatleri"],
    [tr.villa.checkInLabel, "Giriş · Check-in"],
    [tr.villa.checkOutLabel, "Çıkış · Check-out"],
    [tr.villa.similarVillasTitle, "Benzer Villalar"],
  ])("%s === %s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});

describe("TR byte-identity — VillaDetailTabs", () => {
  it("sekme etiketleri ve nav aria-label'ı değişmedi", () => {
    expect(tr.villaTabs.prices).toBe("Fiyatlar");
    expect(tr.villaTabs.availability).toBe("Müsaitlik");
    expect(tr.villaTabs.location).toBe("Konum & Mesafeler");
    expect(tr.villaTabs.features).toBe("Özellikler");
    expect(tr.villaTabs.navAriaLabel).toBe("Villa detay sekmeleri");
  });
});

describe("TR byte-identity — VillaMapModal", () => {
  it("buton/başlık/fallback metinleri değişmedi", () => {
    expect(tr.map.openMap).toBe("Harita");
    expect(tr.map.directions).toBe("Yol Tarifi");
    expect(tr.map.directionsUnavailableTitle).toBe(
      "Yol tarifi için konum bilgisi yok"
    );
    expect(tr.map.modalAriaLabelFallback).toBe("Villa haritası");
    expect(tr.map.closeAriaLabel).toBe("Haritayı kapat");
    expect(tr.map.whereTitle).toBe("Nerede?");
    expect(tr.map.poweredByGoogle).toBe(
      "Harita Google Maps üzerinden sağlanmaktadır"
    );
    expect(tr.map.noLocation).toBe("Konum bilgisi bulunamadı");
  });

  it("modal aria-label şablonu eski template literal ile aynı çıktıyı verir", () => {
    const villaTitle = "Villa In Love";
    expect(
      formatDictionaryString(tr.map.modalAriaLabel, { title: villaTitle })
    ).toBe(`${villaTitle} — Harita`);
  });

  it("Google Maps embed dil parametresi TR'de 'tr' kalır", () => {
    expect(tr.map.embedLanguage).toBe("tr");
    expect(getDictionary("en").map.embedLanguage).toBe("en");
    expect(getDictionary("de").map.embedLanguage).toBe("de");
  });
});

describe("TR byte-identity — ShortStayFeeNotice", () => {
  it("uyarı metni ve aria-label eski çıktıyla aynı", () => {
    const limit = 5;
    expect(formatDictionaryString(tr.shortStay.body, { n: limit })).toBe(
      `Tüm villalarımızda geçerli olmak üzere ${limit} gece altı kiralamalarda ekstra kısa süreli konaklama ücreti bulunmaktadır.`
    );
    expect(formatDictionaryString(tr.shortStay.ariaLabel, { n: limit })).toBe(
      `Kısa süreli konaklama ücreti detayı — ${limit} gece altı konaklamalarda uygulanır`
    );
    expect(tr.shortStay.hint).toBe("Ücreti görmek için üzerine gelin / dokunun");
  });
});

describe("TR byte-identity — FavoriteButton", () => {
  it("etiketler değişmedi", () => {
    expect(tr.favorites.remove).toBe("Favorilerden kaldır");
    expect(tr.favorites.add).toBe("Favorilere ekle");
    expect(tr.favorites.saved).toBe("Favorilerimde");
    expect(tr.favorites.save).toBe("Favorilere Kaydet");
  });
});

describe("TR byte-identity — VillaReviewsSection", () => {
  it("statik metinler değişmedi", () => {
    expect(tr.reviews.eyebrow).toBe("Yorumlar");
    expect(tr.reviews.title).toBe("Misafir Yorumları");
    expect(tr.reviews.outOfFive).toBe("/ 5");
    expect(tr.reviews.empty).toBe(
      "Henüz onaylanmış yorum yok. İlk yorumu siz bırakabilirsiniz."
    );
    expect(tr.reviews.featuredAriaLabel).toBe("Öne çıkan yorum");
    expect(tr.reviews.featuredBadge).toBe("Öne çıkan");
    expect(tr.reviews.formOpen).toBe("Yorum Yap");
    expect(tr.reviews.formClose).toBe("Formu Kapat");
    expect(tr.reviews.ratingPickerAriaLabel).toBe("Puanınız");
    expect(tr.reviews.formTitle).toBe("Yorumunuzu paylaşın");
    expect(tr.reviews.formSubtitle).toBe(
      "Yorumunuz admin onayı sonrası bu sayfada yayınlanır."
    );
    expect(tr.reviews.nameLabel).toBe("Adınız");
    expect(tr.reviews.namePlaceholder).toBe("Örn. İlhan D.");
    expect(tr.reviews.ratingLabel).toBe("Puanınız");
    expect(tr.reviews.commentLabel).toBe("Yorumunuz");
    expect(tr.reviews.commentPlaceholder).toBe("Konaklama deneyiminiz nasıldı?");
    expect(tr.reviews.successMessage).toBe(
      "Yorumunuz inceleme sonrası yayınlanacaktır. Teşekkürler."
    );
    expect(tr.reviews.submitting).toBe("Gönderiliyor…");
    expect(tr.reviews.submit).toBe("Yorumumu gönder");
  });

  it("şablonlu metinler eski template literal çıktısıyla aynı", () => {
    expect(formatDictionaryString(tr.reviews.countLabel, { n: 12 })).toBe(
      "12 misafir yorumu"
    );
    expect(
      formatDictionaryString(tr.reviews.ratingAriaLabel, { value: "4.5" })
    ).toBe("4.5 / 5");
    expect(formatDictionaryString(tr.reviews.starAriaLabel, { n: 3 })).toBe(
      "3 yıldız"
    );
    /* Eski hardcoded metin "En az 10 karakter" idi; MIN_COMMENT_LEN=10. */
    expect(formatDictionaryString(tr.reviews.minChars, { n: 10 })).toBe(
      "En az 10 karakter"
    );
  });
});

describe("TR byte-identity — VillaInfoBar", () => {
  it("bilgi etiketleri ve belge metni değişmedi", () => {
    expect(tr.card.person).toBe("Kişi");
    expect(tr.card.bedroom).toBe("Yatak Odası");
    expect(tr.card.bathroom).toBe("Banyo");
    expect(tr.villa.tourismCertificate).toBe("Turizm Belgesi");
    expect(formatDictionaryString(tr.villa.documentNumber, { n: "12345" })).toBe(
      "Belge No: 12345"
    );
  });
});

describe("TR byte-identity — VillaCard", () => {
  it("statik metinler değişmedi", () => {
    expect(tr.card.villaAlt).toBe("Villa");
    expect(tr.card.imageComing).toBe("Görsel yakında");
    expect(tr.card.noLocation).toBe("Lokasyon yok");
    expect(tr.card.priceOnRequest).toBe("Fiyat sorunuz");
    expect(tr.card.startingFromUpper).toBe("Başlayan Fiyatlarla");
    expect(tr.card.startingFromLower).toBe("başlayan fiyatlarla");
    expect(tr.card.total).toBe("Toplam");
    expect(tr.card.nightly).toBe("Gecelik");
    expect(tr.card.cleaningIncluded).toBe("Temizlik dahil");
    expect(tr.card.cleaningIncludedSuffix).toBe(" · Temizlik dahil");
    expect(tr.card.availabilityCta).toBe("Müsaitlik / Tarih Seç");
    expect(tr.card.availabilityAriaLabel).toBe(
      "Müsaitlik ve tarih seçimi modalını aç"
    );
    expect(tr.card.bookNow).toBe("Hemen Rezervasyon Yap");
    expect(tr.card.bookNowAriaLabel).toBe("Hemen rezervasyon yap");
    expect(tr.card.flexibleTitle).toBe("Esnek Tarih Fırsatı");
    expect(tr.card.flexibleSubtitle).toBe("±3 gün içinde müsait");
  });

  it("şablonlu metinler eski template literal çıktısıyla aynı", () => {
    expect(formatDictionaryString(tr.card.nights, { n: 4 })).toBe("4 gece");
    expect(formatDictionaryString(tr.card.reviewCount, { n: 9 })).toBe(
      "9 yorum"
    );
    expect(
      formatDictionaryString(tr.card.ratingAriaLabel, {
        value: "4.8",
        count: 9,
      })
    ).toBe("Ortalama puan 4.8 / 5, 9 misafir yorumu");
    expect(formatDictionaryString(tr.card.guestsValue, { n: 6 })).toBe(
      "6 Kişi"
    );
    expect(formatDictionaryString(tr.card.bedroomsValue, { n: 3 })).toBe(
      "3 Yatak Odası"
    );
    expect(formatDictionaryString(tr.card.bathroomsValue, { n: 2 })).toBe(
      "2 Banyo"
    );
    expect(formatDictionaryString(tr.card.guestsAriaLabel, { n: 6 })).toBe(
      "6 kişi kapasitesi"
    );
    expect(formatDictionaryString(tr.card.bedroomsAriaLabel, { n: 3 })).toBe(
      "3 yatak odası"
    );
    expect(formatDictionaryString(tr.card.bathroomsAriaLabel, { n: 2 })).toBe(
      "2 banyo"
    );
    expect(formatDictionaryString(tr.card.discountBadge, { percent: 15 })).toBe(
      "%15 İNDİRİM"
    );
    expect(
      formatDictionaryString(tr.card.discountBadgeAriaLabel, { percent: 15 })
    ).toBe("Yüzde 15 indirim");
    expect(
      formatDictionaryString(tr.card.nightlySavings, { amount: "1.500 ₺" })
    ).toBe("Gecelik 1.500 ₺ indirimli");
    expect(formatDictionaryString(tr.card.reserveNights, { n: 3 })).toBe(
      "3 Gece"
    );
  });
});

describe("TR byte-identity — CollapsibleDescription", () => {
  it("aç/kapa buton metinleri değişmedi", () => {
    expect(tr.villa.readMore).toBe("Devamını Oku");
    expect(tr.villa.readLess).toBe("Daha Az Göster");
  });
});

describe("TR byte-identity — VillaVideoModal", () => {
  it("erişilebilirlik etiketleri değişmedi", () => {
    expect(tr.gallery.closeVideoAriaLabel).toBe("Videoyu kapat");
    expect(tr.gallery.otherVideosAriaLabel).toBe("Diğer videolar");
  });
});

describe("TR byte-identity — VillaCardBookingModal", () => {
  it("modal metinleri değişmedi", () => {
    expect(tr.booking.modalEyebrow).toBe("Müsaitlik / Rezervasyon");
    expect(tr.booking.modalAriaLabel).toBe("Müsaitlik ve rezervasyon");
    expect(tr.booking.modalLoadingAriaLabel).toBe(
      "Müsaitlik ve rezervasyon yükleniyor"
    );
    expect(tr.booking.modalLoading).toBe("Müsaitlik yükleniyor…");
    expect(tr.booking.dateLabel).toBe("Tarih");
    expect(tr.booking.perNightSuffix).toBe("/ gece");
    /* Mevcut (Phase 10B) anahtarlar reuse edildi — değerleri
       modal'ın eski hardcoded metinleriyle BİREBİR aynı olmalı. */
    expect(tr.common.close).toBe("Kapat");
    expect(tr.booking.selectDatePlaceholder).toBe("Tarih seç");
    expect(tr.booking.guestsLabel).toBe("Misafir");
    expect(tr.booking.adultsLabel).toBe("Yetişkin");
    expect(tr.booking.childrenLabel).toBe("Çocuk");
    expect(tr.booking.confirm).toBe("Tamam");
    expect(tr.booking.bookNow).toBe("Rezervasyon Yap");
    expect(tr.booking.feeAutoCalculated).toBe(
      "Ücret seçilen tarihlere göre otomatik hesaplanır"
    );
    expect(tr.booking.gapOverrideNotice).toBe(
      "Kısa süreli boşluk fırsatı nedeniyle bu tarih aralığı rezerve edilebilir."
    );
    expect(
      formatDictionaryString(tr.booking.guestsSummary, {
        adults: 2,
        children: 1,
      })
    ).toBe("2 yetişkin · 1 çocuk");
  });
});

describe("EN/DE — Türkçe hardcoded metin kalmadı (regresyon kilidi)", () => {
  /* Bu anahtarların TR değerleri, EN/DE değerlerinden FARKLI olmalı;
     aynıysa çeviri atlanmış (TR metin sızmış) demektir. */
  const en = getDictionary("en");
  const de = getDictionary("de");

  const KEYS: Array<[string, string, string, string]> = [
    ["villa.aboutTitle", tr.villa.aboutTitle, en.villa.aboutTitle, de.villa.aboutTitle],
    ["villa.seasonPricesTitle", tr.villa.seasonPricesTitle, en.villa.seasonPricesTitle, de.villa.seasonPricesTitle],
    ["villa.calendarTitle", tr.villa.calendarTitle, en.villa.calendarTitle, de.villa.calendarTitle],
    ["villa.distancesTitle", tr.villa.distancesTitle, en.villa.distancesTitle, de.villa.distancesTitle],
    ["villa.distancesEyebrow", tr.villa.distancesEyebrow, en.villa.distancesEyebrow, de.villa.distancesEyebrow],
    ["villa.distancesSubtitle", tr.villa.distancesSubtitle, en.villa.distancesSubtitle, de.villa.distancesSubtitle],
    ["villa.distancesEmpty", tr.villa.distancesEmpty, en.villa.distancesEmpty, de.villa.distancesEmpty],
    ["villa.featuresTitle", tr.villa.featuresTitle, en.villa.featuresTitle, de.villa.featuresTitle],
    ["villa.featuresEmpty", tr.villa.featuresEmpty, en.villa.featuresEmpty, de.villa.featuresEmpty],
    ["villa.priceIncludesTitle", tr.villa.priceIncludesTitle, en.villa.priceIncludesTitle, de.villa.priceIncludesTitle],
    ["villa.rulesTitle", tr.villa.rulesTitle, en.villa.rulesTitle, de.villa.rulesTitle],
    ["villa.checkInOutTitle", tr.villa.checkInOutTitle, en.villa.checkInOutTitle, de.villa.checkInOutTitle],
    ["villa.checkInLabel", tr.villa.checkInLabel, en.villa.checkInLabel, de.villa.checkInLabel],
    ["villa.checkOutLabel", tr.villa.checkOutLabel, en.villa.checkOutLabel, de.villa.checkOutLabel],
    ["villa.similarVillasTitle", tr.villa.similarVillasTitle, en.villa.similarVillasTitle, de.villa.similarVillasTitle],
    ["villa.tourismCertificate", tr.villa.tourismCertificate, en.villa.tourismCertificate, de.villa.tourismCertificate],
    ["villaTabs.prices", tr.villaTabs.prices, en.villaTabs.prices, de.villaTabs.prices],
    ["villaTabs.availability", tr.villaTabs.availability, en.villaTabs.availability, de.villaTabs.availability],
    ["villaTabs.location", tr.villaTabs.location, en.villaTabs.location, de.villaTabs.location],
    ["villaTabs.features", tr.villaTabs.features, en.villaTabs.features, de.villaTabs.features],
    ["map.openMap", tr.map.openMap, en.map.openMap, de.map.openMap],
    ["map.directions", tr.map.directions, en.map.directions, de.map.directions],
    ["map.whereTitle", tr.map.whereTitle, en.map.whereTitle, de.map.whereTitle],
    ["map.noLocation", tr.map.noLocation, en.map.noLocation, de.map.noLocation],
    ["shortStay.hint", tr.shortStay.hint, en.shortStay.hint, de.shortStay.hint],
    ["favorites.add", tr.favorites.add, en.favorites.add, de.favorites.add],
    ["favorites.save", tr.favorites.save, en.favorites.save, de.favorites.save],
    ["reviews.title", tr.reviews.title, en.reviews.title, de.reviews.title],
    ["reviews.submit", tr.reviews.submit, en.reviews.submit, de.reviews.submit],
    ["card.availabilityCta", tr.card.availabilityCta, en.card.availabilityCta, de.card.availabilityCta],
    ["card.bookNow", tr.card.bookNow, en.card.bookNow, de.card.bookNow],
    ["card.priceOnRequest", tr.card.priceOnRequest, en.card.priceOnRequest, de.card.priceOnRequest],
    ["card.imageComing", tr.card.imageComing, en.card.imageComing, de.card.imageComing],
    ["card.bedroom", tr.card.bedroom, en.card.bedroom, de.card.bedroom],
    ["card.bathroom", tr.card.bathroom, en.card.bathroom, de.card.bathroom],
    ["card.person", tr.card.person, en.card.person, de.card.person],
    ["villa.readMore", tr.villa.readMore, en.villa.readMore, de.villa.readMore],
    ["villa.readLess", tr.villa.readLess, en.villa.readLess, de.villa.readLess],
    ["gallery.closeVideoAriaLabel", tr.gallery.closeVideoAriaLabel, en.gallery.closeVideoAriaLabel, de.gallery.closeVideoAriaLabel],
    ["gallery.otherVideosAriaLabel", tr.gallery.otherVideosAriaLabel, en.gallery.otherVideosAriaLabel, de.gallery.otherVideosAriaLabel],
    ["booking.modalEyebrow", tr.booking.modalEyebrow, en.booking.modalEyebrow, de.booking.modalEyebrow],
    ["booking.modalLoading", tr.booking.modalLoading, en.booking.modalLoading, de.booking.modalLoading],
    ["booking.dateLabel", tr.booking.dateLabel, en.booking.dateLabel, de.booking.dateLabel],
    ["booking.perNightSuffix", tr.booking.perNightSuffix, en.booking.perNightSuffix, de.booking.perNightSuffix],
  ];

  it.each(KEYS)("%s — EN ve DE, TR metninden farklı", (_k, trv, env, dev) => {
    expect(env).not.toBe(trv);
    expect(dev).not.toBe(trv);
  });
});
