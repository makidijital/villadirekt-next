# Fiyat / İndirim Doğruluk Denetimi

**Başlangıç noktası:** `/arama?start=2026-10-08&end=2026-10-15&guests=1`
**Tarih:** 2026-09-20 · **Yöntem:** %100 statik kaynak analizi.
**Erişim sınırı:** Production veritabanına erişim YOK — `villa_prices` / `villa_discounts` satırları görülemedi. Hiçbir sayısal sonuç tahmin edilmedi; yalnız kod yolu değerlendirildi. Gerçek veriye bağlı noktalar UNKNOWN işaretlendi.
**Değişiklik:** Hiçbir dosya değiştirilmedi, migration oluşturulmadı, commit/push yapılmadı.

---

## 1. ANA AKIŞ — `/arama?start=2026-10-08&end=2026-10-15&guests=1`

| # | Adım | Dosya:satır | Server/Client | Hesap mı, gösterim mi? |
|---|---|---|---|---|
| 1 | Route | `app/(public)/arama/page.tsx:21` `export const dynamic = "force-dynamic"` | Server | — |
| 2 | searchParams parse | `AramaPageBody.tsx:251-255` — `firstString(sp.start)` → `isValidYmd` → `hasDateRange = start && end && start < end` | Server | — |
| 3 | `guests` | `AramaPageBody.tsx` → repo `.gte("guests", opts.guests)` | Server | **Yalnız filtre — fiyata etkisi YOK** |
| 4 | Villa sorgusu | `lib/db/villa.repository.server.ts:466-484` `findSearchResults` | Server | `villa_prices` embed edilir, **`villa_discounts` EDİLMEZ** |
| 5 | Kur | `AramaPageBody.tsx:781-792` — cookie `currency` + `getExchangeRatesMap` | Server | Yalnız sıralama anahtarı için |
| 6 | Sıralama anahtarı | `AramaPageBody.tsx:828-837` — `calculateGrandTotal(...)`, **`discounts` YOK** | Server | **Hesap** |
| 7 | Karta prop geçişi | `AramaPageBody.tsx:1209-1258` — `stayStart`, `stayEnd`, `prices`, `cleaningFee/Currency/Limit` | Server→Client | — |
| 8 | Kart fiyat hesabı | `app/components/villa/VillaCard.tsx:330-348` — `calculateGrandTotal(...)`, **`discounts` YOK** | **Client** | **Hesap** |
| 9 | Kur dönüşümü | `VillaCard.tsx:191-198` `useCurrency()` + `convertPrice` | Client | — |
| 10 | Ekran | `VillaCard.tsx:607-673` — "Toplam X · 7 gece" | Client | **Gösterim** |

**Doğrulanan gerçek (CONFIRMED):** `grep -c "discount" app/components/search/AramaPageBody.tsx` → **0**. Arama sayfası indirim kelimesini hiç geçmiyor.

---

## 2. FİYAT MOTORU — tek source of truth var mı?

**Formül olarak EVET, uygulama olarak HAYIR.**

`lib/price.engine.ts` (732 satır) tek merkezdir ve gecelik fiyat / indirim / toplam matematiğinin **ikinci bir implementasyonu yoktur**. Ana fonksiyonlar:

| Fonksiyon | Satır | Tarih kullanır mı? | İndirim kullanır mı? |
|---|---|---|---|
| `getStartingPrice(prices)` | `:67-80` | **HAYIR** (tip tanımında tarih alanı bile yok, `:62-65`) | Hayır |
| `getDailyPrice(date, prices, currency, rates)` | `:102-145` | Evet (gece bazında `.find()`) | Hayır |
| `getActiveDiscount(date, discounts)` | `:183-201` | Evet (`d >= s && d <= e`) | — |
| `applyDiscountToDailyPrice(daily, discount, ...)` | `:243-294` | — | Evet |
| `calculateStayTotal(start, end, prices, currency, rates, discounts?)` | `:297-413` | Evet | **Opsiyonel** |
| `calculateGrandTotal({...})` | `:530-695` | Evet | **`discounts = null` DEFAULT** (`:543`) |

**Kritik tasarım detayı** (`lib/price.engine.ts:543`):
```ts
  pool_heating_months = null,
  discounts = null,          // ← "indirim yok" varsayılanı
}: {
```
Yorum bunu açıkça yazıyor: *"OPSİYONEL, default null … eskiden bu parametreyi vermeyen TÜM çağrılarda davranış BYTE-IDENTICAL kalır."* Yani **motor doğru, ama çağıranların yarısı indirim katmanını hiç açmıyor.**

**`calculateGrandTotal`'ın dönüşünde "indirim öncesi / üstü çizili" alanı YOKTUR.** `original_stay` (`:681`) "indirim öncesi" değil, **"orijinal para biriminde"** demektir — ve zaten indirim uygulanmış değerdir (`:370-372`). Bu yüzden her tüketici "eski fiyat"ı kendi yöntemiyle üretmek zorunda kalmış (§7).

---

## 3. ARAMA SONUÇLARI — ayrıntılı cevaplar

| Soru | Cevap | Kanıt |
|---|---|---|
| VillaCard hangi fiyatı kullanıyor? | Tarih varsa `calculateGrandTotal().total` (konaklama toplamı + temizlik); tarih yoksa `getStartingPrice` (MIN gecelik) | `VillaCard.tsx:330-348`, `:607-673` |
| Tarih aralığı karta gidiyor mu? | **Evet** — `stayStart`/`stayEnd`/`prices` geçiliyor | `AramaPageBody.tsx:1238-1258` |
| Kart fiyatı kendi içinde mi hesaplıyor? | **Evet, client'ta** | `VillaCard.tsx:333` |
| Server'da mı client'ta mı? | Hesap **client**; yalnız sıralama anahtarı server'da (ayrı hesap) | `AramaPageBody.tsx:828-837` vs `VillaCard.tsx:333` |
| Arama ile detay aynı motordan mı? | **Aynı fonksiyon, farklı argüman** — detay `discounts` geçiyor, arama geçmiyor | `useBookingEngine.ts:773` `discounts,` vs `VillaCard.tsx:333-342` |

**Kullanıcı 08.10.2026 → 15.10.2026 seçtiğinde kartta gösterilen fiyat gerçekten o aralığın fiyatı mı?**

**Kısmen — üç koşulla HAYIR:**
1. **İndirim uygulanmıyor.** O aralığı kapsayan bir `villa_discounts` kaydı varsa kart **indirimsiz** (daha yüksek) tutarı gösterir. → Bulgu **P1**
2. **O aralığı kapsayan `villa_prices` satırı yoksa**, kart 7 gecelik değil **1 gecelik** fiyat gösterir. → Bulgu **P3**
3. **Aralığın bir kısmı kapsanmıyorsa**, kapsanmayan geceler **ücretsiz** sayılır. → Bulgu **P3**

---

## 4. İNDİRİM/FİYAT GÖSTEREN TÜM PUBLIC YÜZEYLER

| Yüzey | Dosya:satır | Fiyat kaynağı | Tarih? | İndirim? | "Eski fiyat" kaynağı |
|---|---|---|---|---|---|
| Anasayfa villa listesi | `villa/VillaList.tsx:104-124` | `getStartingPrice` (MIN) | ❌ | ❌ | — |
| **Anasayfa İndirimli Koleksiyon** | `home/DiscountCollection.tsx:66-84` | `cache.helpers.ts:638-641` `referencePrice` | ❌ | ✅ (tek yer) | **İndirim `start_date`'indeki SEZON gecelik fiyatı**; bulunamazsa **global MIN** |
| `/arama` | `AramaPageBody.tsx:1209-1258` | `calculateGrandTotal` | ✅ | ❌ | — |
| `/arama` esnek (±3 gün) | `AramaPageBody.tsx:1315-1337` | fiyat gösterilmez | ✅ | — | — |
| `/kiralik-villalar` | `KiralikVillalarPageBody.tsx:392-412` | `getStartingPrice` | ❌ | ❌ | — |
| Villa detay — sezon listesi | `villa/PriceList.tsx:344-499` | `villa_prices` segmenti | segment | ✅ | Aynı segmentin indirimsiz **gecelik** fiyatı |
| Villa detay — rezervasyon özeti | `booking/BookingSummary.tsx:148-175` | `calculateGrandTotal(+discounts)` | ✅ | ✅ | **✅ DOĞRU** — aynı stay, `discounts:null` ile 2. hesap (`useBookingEngine.ts:788-798`) |
| Villa detay — takvim gün hücresi | `useBookingEngine.ts:420-434` | ham `villa_prices` lookup | gün | ❌ | — |
| Villa detay — inline takvim | `AvailabilityInlineCalendar.tsx:233-243` | ham lookup | gün | ❌ | — |
| Benzer villalar | `SimilarVillasSection.tsx:172-186` | `getStartingPrice` | ❌ | ❌ | — |
| **Kart içi rezervasyon modalı** | `VillaCardBookingModal.tsx:438-452` | `useBookingEngine` — `discounts` **YOK** | ✅ | ❌ | — |
| `/kisa-sureli-tarihler/[ay]/[gece]` | `ShortGapsPageBody.tsx:436-472` | `calculateGrandTotal(gap_start..gap_end)` | ✅ | ❌ | — |
| `/liste/[token]` | `SharedListPageBody.tsx:306-340` | koşullu `calculateGrandTotal` | koşullu | ❌ | — |
| `/v/[token]` özel villa | `PrivateVillaPageBody.tsx:471-475, 755-774` | PriceList + Sidebar, `discounts` **YOK** | ✅ | ❌ | — |
| `/favoriler`, `/favoriler/paylas`, 404 önerileri | ilgili dosyalar | `getStartingPrice` | ❌ | ❌ | — |
| `/rezervasyon/[slug]` | `ReservationForm.tsx:232,281,662` | `calculateGrandTotal(+discounts)` | ✅ | ✅ | **✅ DOĞRU** — `resultWithoutDiscount.stay` |

**Sonuç:** `VillaCard`'ın `discount` prop'u repoda **yalnız 1 çağrı yerinden** geçiliyor (anasayfa İndirimli Koleksiyon). Diğer **10 public çağrı yeri** indirim bilgisi taşımıyor.

---

## 5. ESKİ/YANLIŞ FİYAT NEREDEN GELİYOR — kod ile kanıtlanmış nedenler

Soru listesindeki hipotezlerin **kodla doğrulanan** olanları:

| Hipotez | Durum | Kanıt |
|---|---|---|
| **B) VillaCard tarih parametresini almıyor** | ❌ **YANLIŞ** — tarih geçiliyor | `AramaPageBody.tsx:1238-1258` |
| **C) Server sonuçları tarih bağımsız fiyatla dönüyor** | ⚠️ **KISMEN** — server fiyat hesaplamıyor, ham `villa_prices` dönüyor; hesap client'ta | `villa.repository.server.ts:466-484` |
| **D) Bir component eski `villa.price` alanını kullanıyor** | ⚠️ **KISMEN** — `villa.price` okunmuyor, ama `villa.currency` hâlâ okunuyor (`villa.repository.server.ts:1383`) ve `AramaPageBody.tsx:650`'de legacy `v.currency` fallback'i duruyor | CONFIRMED / kolonun DB'de varlığı UNKNOWN |
| **E) Cache tarih parametresini key'e dahil etmiyor** | ✅ **DOĞRU** (anasayfa indirim kartı) | `cache.helpers.ts:517` + `:678` |
| **F) Currency conversion eski fiyat üzerinden** | ❌ **YANLIŞ** — sıra doğru (§10) | `price.engine.ts:261-293` |
| **G) İndirim hesaplanıyor ama gösterilen originalPrice farklı kaynaktan** | ✅ **DOĞRU** (anasayfa indirim kartı) | `cache.helpers.ts:638-641` |
| **H) Search ile VillaDetail farklı engine** | ⚠️ **Aynı engine, farklı argüman** — asıl sorun bu | `VillaCard.tsx:333` vs `useBookingEngine.ts:773` |
| **I) Short-gap ile normal sezon karışıyor** | ❌ **YANLIŞ** — short-gap kendi `gap_start/gap_end`'ini kullanır, "eski fiyat" hiç göstermez | `ShortGapsPageBody.tsx:452-457` |
| **J) Admin fiyat değişikliği cache'te eski kalıyor** | ✅ **DOĞRU ve CRITICAL** | `pricing.action.ts` — `revalidate` **hiç yok** |
| **A) Discount eski minPrice üzerinden** | ✅ **KISMEN DOĞRU** — yalnız sezon bulunamayınca fallback | `cache.helpers.ts:641` |

---

## 6. CACHE DENETİMİ

`lib/cache.helpers.ts` — 14 helper. **Hiçbirinin cache key'inde tarih, currency veya misafir sayısı YOK.** Key'e argüman giren yalnız `getCachedFaqs` (locale) ve review helper'ları (villaId).

**Doğrudan cevap: "Tarih bazlı fiyat, tarih bağımsız cache'leniyor mu?" → EVET, bir yerde.**

`getCachedDiscountCollectionVillas` (TTL 600s, key `["discount-collection:get"]`):
```ts
const today = parseLocalDate(formatLocalDate(new Date()));   // :517 — closure İÇİNDE
...
const visibleDiscounts = normalizedDiscounts.filter((d) => {
  const end = parseLocalDate(d.end_date);
  if (Number.isNaN(end.getTime())) return false;
  return end >= today;                                        // :610-617
});
if (visibleDiscounts.length === 0) continue;
```
"Bugün" kararı entry'ye çakılıyor → dün biten bir indirim ≤10 dk daha kartta durabilir.

`getCachedVillas` ve `getCachedHomepageCollectionVillas` fiyat taşır ama **tarih kararı cache dışında** (client `VillaCard`) verilir — bu tasarım doğru.

**Tag kapsaması — asıl problem:**

| Mutasyon | Çağrılan revalidate | Temizlenen tag | Etkilenen ama temizlenmeyen cache |
|---|---|---|---|
| **`villa_prices` kaydet** (`pricing.action.ts`) | **HİÇBİRİ** | **YOK** | `getCachedVillas` (`villas`), `getCachedHomepageCollectionVillas` (`homepage`), `getCachedDiscountCollectionVillas` (`discount`) |
| `villa_discounts` ekle/sil | `revalidateDiscount()` (`DiscountsSection.tsx:233,264`) | `discount` | `villas`, `homepage` |

`app/services/revalidate.actions.ts` içinde **`revalidatePricing` diye bir fonksiyon yok** (8 export: settings/menu/villas/taxonomy/homepage/discount/faqs/villa-reviews). `pricing.action.ts` ve `discount.action.ts` dosyalarında `revalidate` kelimesi **hiç geçmiyor** (grep: 0).

**Route render modları:** anasayfa ve villa detay **statik prerender** (segment config yok); `/arama` `force-dynamic`; `/kiralik-villalar` `cookies()` nedeniyle dinamik. Statik rotalarda `unstable_cache` TTL'inin dolması route'u yeniden render **ettirmez** — yalnız tag invalidation veya deploy eder. Bu yüzden `villa_prices` değişikliğinin anasayfada görünme süresi TTL'den **uzun** olabilir (gerçek süre UNKNOWN — production gözlemi gerekir).

**React `cache()`**: yalnız request-scoped (`kiralik-villa/[slug]/page.tsx:101` `getVillaBySlugCached`) — istekler arası staleness riski **yok**. Villa detayın fiyat verisi her istekte taze.

---

## 7. İNDİRİM HESABI — uçtan uca

```
villa_prices satırı (ham, kendi currency'sinde)
  → getDailyPrice(gece)                      → { converted, original, original_currency }
  → getActiveDiscount(gece, discounts)       → o geceye denk gelen İLK kayıt (.find)
  → applyDiscountToDailyPrice                → percent: original × (1 - v/100)
                                               fixed  : original = v  (ÇIKARMA YOK)
  → convertPrice(indirimli, kaynak→görüntü)  → gösterilecek değer
  → geceler toplanır (calculateStayTotal)
```

**Doğrulamalar:**

- **İndirim gece bazında eşleştiriliyor** (`price.engine.ts:361`) → kısmi örtüşme doğru çalışır, yalnız kapsanan geceler indirimli. ✅
- **Tarih semantiği SQL ile uyumlu:** JS `d >= s && d <= e` (`:193-198`) ↔ migration `079:219` `daterange(start_date, end_date, '[]')` kapalı aralık. ✅
- **`discount_type: "fixed"` bir indirim TUTARI değil, o gecenin NİHAİ FİYATIdır.** Kod bunu bilinçli bir semantik düzeltme olarak belgeliyor (`price.engine.ts:209-213`). **Ancak migration 079'un kendi yorumu (`:48` "sabit TL/gecelik indirim") bu semantiğe aykırı** → dokümantasyon çelişkisi, admin'i yanıltabilir.
- **Eski fiyat gerçekten aynı aralığın indirimsiz fiyatı mı?** — Yüzeye göre değişiyor:

| Yüzey | Eski fiyat = ? | Doğru mu? |
|---|---|---|
| BookingSidebar özeti | Aynı stay, `discounts:null` ile 2. `calculateGrandTotal` (`useBookingEngine.ts:788-798`) | ✅ **DOĞRU** |
| `/rezervasyon/[slug]` | `resultWithoutDiscount.stay` (`ReservationForm.tsx:281,662`) | ✅ **DOĞRU** |
| Villa detay PriceList | Aynı segmentin indirimsiz **gecelik** fiyatı | ✅ Tutarlı (toplam değil, gecelik — kasıtlı) |
| **Anasayfa indirim kartı** | İndirimin `start_date`'indeki **tek gecelik** sezon fiyatı; sezon yoksa **global MIN** | ⚠️ **Farklı taban** |

- **Yüzde doğru mu?** `percent` tipte doğrudan `discount_value`. `fixed` tipte `((normal − indirimli)/normal)×100` (`VillaCard.tsx:286-291`) — taban yanlışsa yüzde de yanlış olur.
- **Gecelik mi toplam mı?** Anasayfa indirim kartı **gecelik**; `/arama`, short-gap, paylaşılan liste **toplam**; villa detay özeti **toplam**. Aynı `VillaCard` bileşeni iki farklı semantikte fiyat basıyor.

---

## 8. ARAMA ↔ VILLA DETAY KARŞILAŞTIRMASI

| Adım | `/arama` | Villa detay | Aynı mı? |
|---|---|---|---|
| Tarih parse | `isValidYmd` + `start < end` | aynı helper | ✅ |
| Gece sayısı | `calculateNights` → 7 | `calculateNights` → 7 | ✅ |
| Gecelik fiyat kaynağı | `villa_prices` embed (**ORDER BY yok**) | `findVillaPrices` `ORDER BY start_date ASC` | ⚠️ Sıra farklı |
| **`villa_discounts` çekiliyor mu?** | **HAYIR** | **EVET** (`page.tsx:255`) | ❌ **KÖK FARK** |
| Engine fonksiyonu | `calculateGrandTotal` (discounts YOK) | `calculateGrandTotal` (`discounts,`) | ⚠️ Aynı fonksiyon, farklı argüman |
| Kur dönüşüm noktası | Client, gece bazında | Client, gece bazında | ✅ |
| Temizlik ücreti | Dahil | Dahil | ✅ |
| Havuz ısıtma | Hiç yok (0) | Opsiyonel, başlangıç false | ✅ (ilk yüklemede) |
| Yuvarlama | Aynı | Aynı | ✅ |
| Min-stay / orphan-gap kapısı | **YOK** | `minimumStayValid && orphanGapValid` (`useBookingEngine.ts:750-751`) | ❌ |

**Nihai tahsil edilen tutar doğru.** `app/services/reservation/_helpers/price-verify.ts:29` `getVillaDiscounts` okuyor ve `calculateGrandTotal`'a `discounts` geçiyor; sunucu client değerlerini eziyor. Yani bu **yanlış tahsilat değil, yanlış GÖSTERİM** problemidir — kullanıcıya gerçekte ödeyeceğinden **yüksek** fiyat gösteriliyor.

---

## 9. TARİHSİZ ALANLAR

`getStartingPrice` (`price.engine.ts:67-80`) girdisi **tarih filtresiz tüm `villa_prices` satırları**dır (`listPublic` embed'inde tarih koşulu yok, `villa.service.ts:391-392` de filtrelemez). Dolayısıyla:

- "…'den başlayan" = **tüm sezonların global minimumu, geçmiş sezonlar dahil.** 2024 kışından kalmış ucuz bir satır bugün hâlâ başlangıç fiyatını belirler.
- **Mixed currency karşılaştırması:** `:74-77` ham sayı karşılaştırır (`v < best.price`). Bir villanın satırları hem EUR hem TRY ise "500 EUR" < "10.000 TRY" olduğu için EUR kazanır ve kartta "500 EUR'dan başlayan" yazar.
- İndirim rozeti yalnız anasayfa `variant="discount"` kartlarında. Görünürlük filtresi yalnız `end_date >= bugün` → **henüz başlamamış bir indirim de rozetle gösterilir** (`cache.helpers.ts:610-626`; `getActiveDiscount` bilinçli olarak devre dışı bırakılmış).

---

## 10. CURRENCY

**Sıra DOĞRU: kaynak currency'de fiyat → indirim → dönüşüm.**
```ts
// price.engine.ts:261-290
if (discount.discount_type === "percent") {
  discountedOriginal = daily.original * (1 - value / 100);   // ORİJİNAL currency'de
} else { ...convertPrice(value, discountCurrency, daily.original_currency, rates); }
discountedOriginal = Math.max(0, discountedOriginal);
return { converted: convertPrice(discountedOriginal, daily.original_currency, currency, rates), ... };
```
Zaten çevrilmiş `daily.converted` üzerinde oransal işlem **yapılmıyor** — `converted` sıfırdan yeniden hesaplanıyor. Bu, yuvarlama birikmesini önleyen doğru desen. "100 EUR indirim, TRY gecelik fiyat" senaryosunda sessiz birim karışması **yok**; önce `convertPrice` ile hizalanıyor.

**Kaynak:** TCMB `today.xml`, `ForexSelling` (`lib/exchange-rate.tcmb.ts:42,50-57`), cron `0 6 * * *`, `exchange_rates` tablosu. **Stale-lik hiç kontrol edilmiyor** — `getExchangeRatesMap` `updatedAt` döndürüyor ama fiyat yollarında kullanılmıyor.

**Riskli fallback:** `lib/currency.ts:29-37` `resolveRate` — kur finite ve >0 değilse **1** döner:
```ts
return Number.isFinite(num) && num > 0 ? num : fallback;   // fallback = 1
```
`AramaPageBody.tsx:787-792` `Number(ratesMap.rates.USD) || 0` → satır yoksa 0 → `resolveRate` → **1**. EUR fiyatlı villa, kur satırı eksikse **1.000 EUR yerine 1.000 ₺** gösterilir. Client tarafında da `CurrencyContext.tsx:38-41` başlangıcı `{ TRY: 1 }` ve fetch hatası yalnız `console.error` (`:110-116`).

**Yuvarlama:** `convertPrice` her dönüşümde `.toFixed(2)`, gösterim `maximumFractionDigits: 0`. Üç değer bağımsız yuvarlandığı için "üstü çizili − tasarruf = yeni fiyat" eşitliği 1 birim kayabilir.

---

## 11. SHORT-GAP / FIRSAT

`lib/short-gaps.helpers.ts` **saf tarih/slug matematiğidir — içinde tek bir fiyat satırı yoktur** (`price`/`discount` grep: 0). Fiyat tamamen `ShortGapsPageBody.tsx`'te üretilir.

- **Geçerli aralık:** her kartın kendi `gap_start → gap_end`'i (`:452-453`).
- **Hesap:** `/arama` ile **birebir aynı** — `calculateGrandTotal`, `discounts` **YOK**.
- **"Eski fiyat" kavramı yok** — `variant="discount"` almaz, üstü çizili fiyat/rozet hiç render edilmez.
- **Normal sezon fiyatıyla karışıyor mu?** Hayır — gap kendi aralığını kullanır. **Ama** indirimli bir gap için bile indirimsiz toplam gösterir ve CTA doğrudan `/rezervasyon/<slug>?start=gap_start&end=gap_end`'e gider; orada sunucu indirimi uygular → tutar değişir.
- Anasayfa `ShortGapsSection.tsx` yalnız **villa sayısı** gösterir, fiyat yok.

---

## 12. DUPLICATE PRICE LOGIC

Motor **dışında** ikinci bir gecelik-fiyat/indirim formülü **yok** — bu iyi. Bulunan kopyalar:

| Dosya:satır | Ne | Engine ile uyum | Risk |
|---|---|---|---|
| `lib/cache.helpers.ts:432-457` `getSeasonPriceForDiscountStart` | `getDailyPrice`'ın tarih eşleştirmesinin conversion'sız kopyası | Mantık aynı, **çıktı farklı semantikte** | MEDIUM |
| `kiralik-villa/[slug]/page.tsx:295-303` + `en`/`de` kopyaları | 3 kopya inline `reduce` min-price (JSON-LD `priceFrom`) | `getStartingPrice` ile mantıken aynı | LOW |
| `reservations/ekle/page.tsx:877,893` + 3 helper | `Math.round((x*rate)/100)` — `calculatePrepayment`'ın 4 elle kopyası | Formül birebir aynı, motor çağrılmıyor | MEDIUM (drift riski) |
| `VillaCard.tsx:286-291`, `PriceList.tsx:387-392` | Rozet yüzdesi türetmesi | Motor değerlerinden türetilmiş, tutarlı | — |

**Şu an refactor önerilmiyor.** Mevcut davranış: kopyalar bugün doğru sonuç üretiyor; risk gelecekte motor değişirse sessiz drift.

---

## 13. SENARYO MATRİSİ (yalnız kod akışı — sayısal tahmin YOK)

| # | Senaryo | `/arama` kartı | Villa detay | Anasayfa kartı |
|---|---|---|---|---|
| 1 | 08.10.2026 → 15.10.2026 | `calculateGrandTotal` 7 gece, **indirimsiz** | `calculateGrandTotal` 7 gece, **indirimli** | — |
| 2 | 15.07.2026 → 22.07.2026 | Aynı yol (sezon satırına bağlı) | Aynı yol | — |
| 3 | Tarih yok | `getStartingPrice` (global MIN, geçmiş sezon dahil) | — | `getStartingPrice` |
| 4 | İndirim VAR | **Uygulanmaz** → yüksek fiyat | Uygulanır | `referencePrice` üstü çizili + indirimli gecelik |
| 5 | İndirim YOK | Doğru | Doğru | Kart hiç görünmez (`continue`) |
| 6 | Short-gap | `gap_start..gap_end` toplamı, indirimsiz | — | Yalnız villa sayısı |
| 7 | Currency EUR | Kur varsa doğru; kur satırı eksikse **1:1** | Aynı | Aynı |

---

## 14. BULGULAR

### 🔴 CRITICAL

**P1 — Tarihli tüm kart yüzeyleri `villa_discounts`'ı hiç okumuyor**
- **Dosya:satır:** `lib/db/villa.repository.server.ts:466-484` (embed yok) · `app/components/villa/VillaCard.tsx:333-342` (`discounts` geçilmiyor) · `AramaPageBody.tsx` (`discount` grep = **0**) · karşı taraf: `useBookingEngine.ts:773` `discounts,`
- **Etki:** İndirimli bir villa `/arama`'da **indirimsiz (yüksek)** fiyatla listelenir ve sıralanır. Kullanıcı karta tıklayınca detayda fiyat düşer. İndirim listede hiç görünmediği için tıklama da kaybedilir. Aynı sorun `/kisa-sureli-tarihler`, `/liste/[token]`, `/v/[token]` ve kart içi rezervasyon modalında da var.
- **Risk:** CRITICAL · **Güven:** CONFIRMED

**P2 — `villa_prices` kaydı HİÇBİR cache tag'ini temizlemiyor**
- **Dosya:satır:** `app/components/admin/villa/pricing.action.ts` (`revalidate` grep = **0**) · çağıran `PricingCalendarCanvas.tsx:149` (revalidate yok) · `app/services/revalidate.actions.ts` (`revalidatePricing` **yok**)
- **Etki:** Admin gecelik fiyatı değiştirir; `getCachedVillas` (tag `villas`, TTL 600) ve `getCachedHomepageCollectionVillas` (tag `homepage`, TTL 600) eski fiyatı tutmaya devam eder. Anasayfa **statik prerender** olduğu için full route cache TTL ile kendiliğinden yenilenmez → ilgili tag'e bir `revalidateTag` gelene kadar eski fiyat **süresiz** görünebilir. **Bu, "eski fiyat gösteriliyor" şikâyetinin en birebir karşılığıdır.**
- **Risk:** CRITICAL · **Güven:** CONFIRMED (kod); gerçek süre UNKNOWN (production gözlemi gerekir)

**P3 — Eşleşmeyen geceler ÜCRETSİZ; hiç eşleşme yoksa toplam TEK GECEye eşitleniyor**
- **Dosya:satır:** `lib/price.engine.ts:120-126` (eşleşmeyen gece → `{converted: 0}`) · `:385-406` (fallback)
```ts
if (stay === 0 && !hadMatchingPrice && prices?.length) {
  const original = Number(prices[0].price || 0);
  return { stay: convertPrice(original, originalCurrency, currency, rates), ... };
}
```
Gece sayısıyla **çarpılmaz**. 7 gecelik sezon-dışı bir sorgu 1 gecelik fiyat döndürür. Kısmi kapsamada (bazı geceler eşleşiyor) fallback hiç tetiklenmez ve eksik geceler bedava sayılır.
- **Etki:** Kullanıcı gerçekte olmayan düşük bir toplam görür. Sunucu da aynı motoru kullandığı için bu tutar doğrulamadan geçer → **eksik tahsilat.**
- **Risk:** CRITICAL · **Güven:** CONFIRMED (kod). Üretimde tetiklenip tetiklenmediği `villa_prices` kapsamına bağlı → **UNKNOWN**

### 🟠 HIGH

- **P4 — Anasayfa indirim kartının üstü çizili fiyatı farklı tabandan.** `cache.helpers.ts:638-641` — karşılaştırma fiyatı indirimin `start_date`'indeki **tek gecelik** sezon fiyatı; sezon bulunamazsa **global MIN**'e düşer ve rozet yüzdesi (`VillaCard.tsx:286-291`) gerçekte olmayan bir tasarrufu duyurabilir. CONFIRMED.
- **P5 — Kart içi rezervasyon modalı indirimsiz.** `VillaCardBookingModal.tsx:438-452` — `useBookingEngine`'e `discounts` verilmiyor; besleyen `/api/public/villas/[id]/availability` endpoint'i indirim **döndürmüyor** (grep: 0). Aynı villa, aynı tarih, iki farklı tutar. CONFIRMED.
- **P6 — `/v/[token]` özel villa sayfası indirimleri hiç göstermiyor.** `PrivateVillaPageBody.tsx:471-475, 755-774` — hem PriceList hem BookingSidebar `discounts`'suz. CONFIRMED.
- **P7 — Fiyat sıralaması indirimsiz anahtarla.** `AramaPageBody.tsx:828-837`. "Düşükten yükseğe" sıralama ağır indirimli villaları alta atar. CONFIRMED.
- **P8 — Eksik kur satırı → sessiz 1:1 dönüşüm.** `lib/currency.ts:29-37`, `AramaPageBody.tsx:787-792`. ~40× yanlış fiyat, hiçbir uyarı yok. CONFIRMED (kod); kur tablosunun dolu olup olmadığı UNKNOWN.
- **P9 — Kart min-stay/orphan-gap kapısını bilmiyor.** `useBookingEngine.ts:750-751` vs `/arama`'da hiç kontrol yok. `minimum_stay_nights > 7` olan villa aramada net fiyatla listelenir, detayda hiç fiyat görünmez. CONFIRMED.

### 🟡 MEDIUM

- **P10** — `getStartingPrice` geçmiş sezonları da MIN'e dahil ediyor **ve mixed-currency'de ham sayı karşılaştırıyor** (`price.engine.ts:67-80`). CONFIRMED.
- **P11** — "Bugün" 600s TTL'li cache entry'sine çakılı (`cache.helpers.ts:517, 610-617`). Dün biten indirim ≤10 dk daha görünür; statik route nedeniyle daha uzun olabilir. CONFIRMED.
- **P12** — `villa_discounts` mutasyonu yalnız `discount` tag'ini temizliyor; `villas`/`homepage` kirli kalıyor (`DiscountsSection.tsx:233,264`). CONFIRMED.
- **P13** — Takvim gün hücreleri indirimsiz gecelik fiyat gösteriyor (`useBookingEngine.ts:420-434`, `AvailabilityInlineCalendar.tsx:233-243`) — aynı sayfada iki farklı gecelik fiyat. CONFIRMED.
- **P14** — Henüz başlamamış indirim rozetle gösteriliyor (`cache.helpers.ts:610-626`; `getActiveDiscount` bilinçli devre dışı). Ürün kararı olabilir ama yüzeyler arası çelişki üretiyor. CONFIRMED.
- **P15** — Revalidate çağrılarının çoğu fire-and-forget + `.catch(() => {})`; admin "kaydedildi" görür, invalidation hiç olmayabilir. CONFIRMED.
- **P16** — Arama embed'inde `villa_prices` **sırasız**, detayda `ORDER BY start_date ASC`. `getDailyPrice` `.find()` ile ilk eşleşeni aldığı için, çakışan iki sezon satırı varsa iki yüzey farklı fiyat seçebilir. `villa_prices` için overlap engelleyen EXCLUDE constraint **yok** (`villa_discounts`'ta var). LIKELY.
- **P17** — `calculatePrepayment` formülünün 4 elle kopyası (admin rezervasyon akışı). CONFIRMED.

### 🟢 LOW

- **P18** — Yuvarlama: "üstü çizili − tasarruf ≠ yeni fiyat" 1 birim kayabilir (`lib/currency.ts:106-119`, `VillaCard.tsx:305-312`). CONFIRMED.
- **P19** — Migration `079:48` yorumu `fixed`'i "sabit TL/gecelik indirim" diye tanımlıyor; kod (`price.engine.ts:209-213`) "nihai gecelik özel fiyat" diyor. **Kod doğru ve bilinçli**, doküman eski — admin'i yanıltabilir. CONFIRMED.
- **P20** — `calculateNights` bozuk tarihte `NaN` döner, guard yok; `nights: NaN` dışarı sızar (`price.engine.ts:95-98`). CONFIRMED.
- **P21** — `guests` kart→detay href'inde düşüyor (`VillaCard.tsx:364-369`). Fiyat etkisi yok. CONFIRMED.

---

## 15. EN GÜVENLİ ÇÖZÜM (öneri — UYGULANMADI)

**İlke:** Fiyat motoruna **dokunma**. Motor zaten doğru ve `discounts` parametresini destekliyor. Yapılacak tek şey, **zaten var olan parametreyi beslemek** ve **zaten var olan revalidate fonksiyonunu çağırmak**.

### Adım 1 — P1: indirimleri kart yoluna bağla *(asıl düzeltme)*

| Dosya | Değişiklik |
|---|---|
| `lib/db/villa.repository.server.ts:466-484` | `findSearchResults` select'ine `villa_discounts (discount_type, discount_value, currency, start_date, end_date)` embed'i ekle — `villa_prices` ile **aynı mekanizma**, tek blok |
| `app/components/search/AramaPageBody.tsx` | `v.villa_discounts`'ı satır shape'ine map et; `<VillaCard discounts={...}>` geç; `_sortPrice` hesabına (`:828-837`) aynı diziyi ver |
| `app/components/villa/VillaCard.tsx:333-342` | Yeni opsiyonel `discounts` prop'u ekle ve mevcut `calculateGrandTotal` çağrısına **tek satır** olarak ilet |

Prop verilmeyen tüm mevcut çağrı yerlerinde `discounts` `undefined` kalır → motorun `null` default'u devreye girer → **davranış birebir korunur.**

### Adım 2 — P2: fiyat kaydından sonra cache'i temizle

`app/components/admin/villa/pricing.action.ts` içinde, başarılı kayıttan sonra **mevcut** `revalidateVillas()` + `revalidateHomepage()` çağrılarını ekle (`app/services/revalidate.actions.ts`'te zaten var). Yeni cache mekanizması, yeni tag, yeni fonksiyon **yok**.

### Adım 3 — P3: fallback'i güvenli hale getir

`lib/price.engine.ts:385-406` — bu **motor değişikliğidir**, bu yüzden ayrı ve en dikkatli adımdır. Seçenekler ölçülmeli: (a) fallback'i `× nights` ile çarpmak, (b) eşleşmeyen gece varsa `stay` yerine "fiyat hesaplanamadı" sinyali döndürüp kartın fiyat göstermemesini sağlamak. **(b) daha güvenli** — yanlış fiyat göstermektense hiç göstermemek. Bu adım ayrı bir kararla ve mutlaka testle yapılmalı.

**Sıralama önerisi:** Adım 1 ve 2 birlikte (düşük risk, asıl şikâyeti çözer) → ölçüm → Adım 3 ayrı kararla.

---

## SONUÇ ÖZETİ

**1. GERÇEK PROBLEM**
Public kart yüzeylerinde gösterilen fiyat, aynı villa ve aynı tarih için villa detayında ve rezervasyon adımında gösterilenden **farklı** (genellikle daha yüksek). Ayrı ve bağımsız bir problem olarak, admin'in değiştirdiği gecelik fiyat public tarafta cache'te eski kalıyor.

**2. PROBLEMİN KÖK NEDENİ**
İki bağımsız kök neden:
(a) `calculateGrandTotal`'ın `discounts` parametresi **opsiyonel ve default `null`**; `/arama` sorgusu `villa_discounts`'ı hiç embed etmiyor ve `VillaCard` bu parametreyi hiç geçmiyor → indirim katmanı kart yüzeylerinde tamamen kapalı.
(b) `villa_prices` kaydeden admin action'ı **hiçbir `revalidateTag` çağırmıyor** → fiyat cache'i temizlenmiyor.
Ek olarak (c) sezon satırı bulunmayan geceler ücretsiz sayılıyor ve hiç eşleşme yoksa toplam tek geceye eşitleniyor.

**3. HANGİ SAYFALAR ETKİLENİYOR**
`/arama` · `/kisa-sureli-tarihler/[ay]/[gece]` · `/liste/[token]` · `/v/[token]` · anasayfa (İndirimli Koleksiyon + villa listesi) · `/kiralik-villalar` · `/favoriler` ve paylaşımı · 404 önerileri · her sayfadaki kart içi rezervasyon modalı.
**Etkilenmeyen:** villa detay rezervasyon özeti, `/rezervasyon/[slug]` — ikisi de indirimi doğru uyguluyor.

**4. HANGİ COMPONENTLER ETKİLENİYOR**
`VillaCard.tsx` (merkez) · `AramaPageBody.tsx` · `ShortGapsPageBody.tsx` · `SharedListPageBody.tsx` · `PrivateVillaPageBody.tsx` · `VillaCardBookingModal.tsx` · `useBookingEngine.ts` (takvim hücreleri) · `AvailabilityInlineCalendar.tsx` · `lib/cache.helpers.ts` (indirim koleksiyonu).

**5. HANGİ FİYAT HESAPLAMA MOTORU KULLANILIYOR**
Tek motor: `lib/price.engine.ts` → `calculateGrandTotal` / `calculateStayTotal` / `getDailyPrice` / `applyDiscountToDailyPrice`. Motorun **ikinci bir implementasyonu yok**; sorun motorun kendisi değil, **indirim parametresinin beslenmemesi**.

**6. ESKİ FİYAT NEREDEN GELİYOR**
Üç ayrı kaynaktan: (a) cache'te temizlenmemiş `villa_prices` (P2) · (b) anasayfa indirim kartında indirimin `start_date`'indeki tek gecelik sezon fiyatı, bulunamazsa global MIN (`cache.helpers.ts:638-641`) · (c) tarihsiz yüzeylerde geçmiş sezonları da içeren `getStartingPrice`.

**7. İNDİRİMLİ FİYAT NEREDEN GELİYOR**
Yalnız 3 yerden doğru geliyor: villa detay rezervasyon özeti (`useBookingEngine.ts:788-798`), `/rezervasyon/[slug]` (`ReservationForm.tsx:281`), ve sunucu-otoritatif hesap (`price-verify.ts:29`). Anasayfa indirim kartı `applyDiscountToDailyPrice`'ı **tek gecelik** değer üzerinde çalıştırır. Diğer tüm yüzeylerde indirimli fiyat **hiç üretilmez**.

**8. CACHE PROBLEMİ VAR MI**
**EVET, iki tane.** (a) `villa_prices` mutasyonu hiçbir tag temizlemiyor — CRITICAL. (b) `getCachedDiscountCollectionVillas` "bugün"ü 600s TTL'li entry'ye çakıyor ve cache key'inde tarih yok — HIGH. Ayrıca indirim mutasyonu `villas`/`homepage` tag'lerini temizlemiyor — MEDIUM.

**9. SEARCH VE VILLA DETAIL FİYATLARI AYNI MI**
**HAYIR.** Aynı fonksiyonu çağırıyorlar ama arama tarafı `villa_discounts`'ı ne çekiyor ne geçiyor. İndirimi olan her villada iki yüzey farklı tutar gösterir. Tarih parse, gece sayısı, kur dönüşüm noktası, temizlik ücreti ve yuvarlama **aynıdır**.

**10. RİSK SEVİYESİ**
**CRITICAL** — ama **para kaybı/yanlış tahsilat değil, yanlış gösterim.** Sunucu tahsilatı indirimi doğru uyguluyor; kullanıcıya gerçekte ödeyeceğinden **yüksek** fiyat gösteriliyor (dönüşüm kaybı + güven sorunu). Tek istisna P3: sezon kapsamı eksikse **eksik tahsilat** mümkün ve bunu sunucu da yakalamaz.

**11. EN GÜVENLİ ÇÖZÜM**
`findSearchResults` select'ine `villa_discounts` embed'ini ekleyip, `AramaPageBody` üzerinden `VillaCard`'a yeni bir opsiyonel `discounts` prop'u geçirmek ve bu prop'u **mevcut** `calculateGrandTotal` çağrısına iletmek. Ayrıca `pricing.action.ts`'e **mevcut** `revalidateVillas()`/`revalidateHomepage()` çağrılarını eklemek. Motor, migration, DB ve rezervasyon akışı **değişmez**; prop geçilmeyen tüm mevcut çağrı yerleri `null` default'u ile birebir aynı davranır.

**12. ÇÖZÜMDE KAÇ DOSYA DEĞİŞMESİ BEKLENİYOR**
**Adım 1+2 için 4 dosya:** `villa.repository.server.ts`, `AramaPageBody.tsx`, `VillaCard.tsx`, `pricing.action.ts`. (Aynı desen sonradan `ShortGapsPageBody`, `SharedListPageBody`, `PrivateVillaPageBody`, `VillaCardBookingModal` + availability API'sine genişletilirse +5 dosya.) Adım 3 ayrı karar: +1 dosya (`price.engine.ts`) ve mutlaka test.

**13. FİYAT/REZERVASYON MOTORUNA DOKUNMAK GEREKİYOR MU**
**Adım 1 ve 2 için HAYIR.** Motor `discounts` parametresini zaten destekliyor; yapılacak tek şey onu beslemek. Rezervasyon akışına, `price-verify`'a, availability'ye, migration'lara ve DB şemasına **hiç dokunulmuyor**.
**Yalnız Adım 3 (P3 fallback'i) motoru değiştirmeyi gerektirir** — bu yüzden ayrı, en dikkatli ve test gerektiren adım olarak işaretlenmiştir; Adım 1-2 ile birlikte yapılmamalıdır.
