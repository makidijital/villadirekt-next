# Villa Fiyatlarına Tarih Bazlı İndirim — READ-ONLY Audit Raporu

**Kapsam:** Bu doküman salt-okunur bir tespit raporudur. Hiçbir kod değiştirilmedi, migration oluşturulmadı, DB'ye yazma yapılmadı, commit/push yapılmadı. Repo: `tatilin-yeri-next`.

---

## 1. Mevcut fiyat sisteminin mimarisi

**Veri modeli — `villa_prices` tablosu** (`types/database.ts` → `VillaPriceRow`):

```
id, villa_id, price (numeric), currency (text, default "TRY"),
start_date (date), end_date (date)
```

- Migration klasöründe bu tabloyu oluşturan bir `CREATE TABLE` yok — tablo, migration sistemi başlamadan (migration 001'den önce) var olan orijinal şemanın parçası. `currency` serbest metin; DB seviyesinde CHECK/ENUM kısıtı yok, kod seviyesinde admin UI'da (`PricingRangeDrawer.tsx`) 4 sabit seçenek sunuluyor: TRY/USD/EUR/GBP.
- **Aralık tanımı: KAPALI interval, ikisi de dahil** — `pricing-calendar.ts` tip yorumunda açıkça yazıyor: *"[start_date, end_date] kapalı interval"*. `lib/price.engine.ts > getDailyPrice` bunu `d >= s && d <= e` ile uyguluyor.
- **Aynı villa için birden fazla fiyat dönemi:** Admin tarafında `PricingCalendarCanvas.tsx` + `range-math.ts > applyRangeUpsert` bunu **yapısal olarak çakışmasız** tutuyor: yeni bir aralık eklendiğinde, üzerine bindiği eski aralıklar otomatik olarak sol/sağ parçalara bölünüyor (split). Yani bugün itibarıyla bir villanın `villa_prices` satırları **birbiriyle asla overlap etmiyor** — her güne en fazla 1 fiyat satırı denk geliyor. Bu, indirim tasarımı için önemli bir referans noktası (bkz. Madde 4).
- **Yazma yolu:** Admin CRUD, satır satır INSERT/UPDATE değil; **atomic "replace-all" RPC** kullanıyor: `replace_villa_prices(p_villa_id uuid, p_prices jsonb)` (migration 002). Fonksiyon `pg_advisory_xact_lock(hashtext('villa_prices:'||villa_id))` ile aynı villa için concurrent yazmaları serileştiriyor, sonra `DELETE ... WHERE villa_id=` + toplu `INSERT ... SELECT FROM jsonb_array_elements`. Repository katmanında karşılığı: `villaAdminRepository.rpcReplaceVillaPrices()` (`lib/db/villa.repository.server.ts`).
- **Okuma yolu (public + admin):** `villa_prices` public RLS read açık (migration 037 — anon/authenticated SELECT). Public tarafta `getVillaPrices()` (`app/services/villa-price.service.ts`) ile çekiliyor, `lib/cache.helpers.ts` üzerinden cache'leniyor.
- **Listeleme fallback fiyatı:** `getStartingPrice()` (`lib/price.engine.ts`) — tarih seçilmemişken kart/arama sonucunda gösterilen "X TL'den başlayan fiyat"; `villa_prices` içindeki en düşük pozitif `price` + onun `currency`'si. Tarihten bağımsız, saf min() — herhangi bir dönemi/indirimi "temsil eden" bir hesap değil.

---

## 2. Fiyat hesaplama motoru — zincir

`lib/price.engine.ts` (537 satır, saf fonksiyonlar, DB bağımlılığı yok) merkez modül. Zincir:

```
calculateNights(start, end)
  → checkin DAHİL, checkout HARİÇ (klasik "gece" tanımı)

getDailyPrice(date, prices[], currency, rates)
  → o GÜN için hangi villa_prices satırı denk geliyor (start<=d<=end)
  → bulunamazsa {converted:0, original:0, original_currency:"TRY"}
  → bulunursa convertPrice() ile hedef currency'ye çevrilir

calculateStayTotal(start, end, prices[], currency, rates)
  → current=start'tan endD'ye (HARİÇ) kadar gün gün getDailyPrice toplanır
  → fallback: toplam 0 ve prices doluysa prices[0] kullanılır

calculateCleaningFee(nights, cleaning_fee, cleaning_limit)
  → "Kısa Süreli Konaklama Ücreti" AYNI alan — bkz. Madde 8

calculatePoolHeatingFee(nights, fee, selected)
isPoolHeatingActiveForRange(start, end, activeMonths)
  → bkz. Madde 9

calculateGrandTotal({...})
  → nights, stay, cleaning, poolHeating hesaplanır
  → total = stay + cleaning + poolHeating
  → return { nights, stay, cleaning, poolHeating, total,
             original_stay, original_cleaning, original_pool_heating,
             original_currency, original_cleaning_currency,
             original_pool_heating_currency, currency }

accommodationBase(total, cleaningFee, poolHeatingFee)
  → max(total - cleaning - poolHeating, 0)  (ön ödeme tabanı)

calculatePrepayment(base, rate) → Math.round(base*rate/100)
```

`calculateGrandTotal`'ın dönüş tipi (`ReturnType<typeof calculateGrandTotal>`) `useBookingEngine.ts`'de `BookingResult` olarak re-export ediliyor ve public villa detay sayfasındaki rezervasyon widget'ının TEK kaynağı bu. Admin tarafında da aynı fonksiyon; `PriceCard.tsx`, `PriceStep.tsx`, `LiveDatePriceSummary.tsx`, `computeReservationPriceRecalc.ts` hepsi aynı `calculateGrandTotal`'ı çağırıyor — **tek merkezi motor, iki tüketici (public + admin)**.

**İndirimin bu zincirde en güvenli noktası:** `calculateStayTotal` içinde, `getDailyPrice`'ın döndürdüğü günlük fiyatın hemen üzerine, gece bazında. Gerekçesi Madde 3'te.

---

## 3. İndirimin gece bazında uygulanabilirliği

**Evet, mevcut mimari buna zaten uygun — hatta bunun için tasarlanmış.** `calculateStayTotal` zaten gün gün (`while (current < endD)`) ilerleyip her gece için `getDailyPrice()` çağırıyor. Sizin senaryonuz:

```
Normal: 10 Haziran → 20 Haziran, 10.000 TL/gece
İndirim: 13 Haziran → 16 Haziran, %20
Konaklama: 12 Haziran → 18 Haziran
```

`calculateStayTotal`'ın döngüsü zaten 12, 13, 14, 15, 16, 17 gecelerini TEK TEK dolaşıyor (18'i checkout olduğu için hariç — mevcut nights tanımıyla birebir). Bu döngünün içine, her gece için "bu tarih bir indirim aralığına denk geliyor mu?" kontrolü eklemek yapısal olarak doğal bir uzantı:

```
12 Haz → normal (indirim aralığı dışı)
13 Haz → indirim aralığına denk (13-16 dahil) → indirimli
14 Haz → indirimli
15 Haz → indirimli
16 Haz → indirim aralığının SON günü — dahil mi hariç mi, bkz. Madde 5
17 Haz → normal
```

Yani "gece bazlı kısmi indirim" **mevcut motorun doğal bir genişlemesi**; yeni bir mimari gerektirmiyor, sadece `getDailyPrice`'a paralel bir `getDailyDiscount(date, discounts[])` fonksiyonu ve `calculateStayTotal` döngüsünün içinde bu ikisini birleştiren bir adım gerekiyor.

---

## 4. Mevcut fiyat dönemleriyle çakışma

Sizin senaryonuz:
```
1-15 Haziran → 8.000 TL
15-30 Haziran → 10.000 TL
İndirim: 10-20 Haziran → %20
```

Madde 1'de belirtildiği gibi, **villa_prices satırları birbirleriyle asla çakışmıyor** (admin UI bunu yapısal olarak engelliyor) — ama **indirim, fiyat dönemleriyle KESİŞMESİ gereken ayrı bir boyut**, dolayısıyla bu çakışma kısıtı indirime uygulanmamalı/uygulanamaz. Yukarıdaki senaryoda 10-20 Haziran indirimi hem 8.000 TL'lik döneme (10-14) hem 10.000 TL'lik döneme (15-20) denk geliyor — **bu istenen davranış**, çünkü indirim "üzerine geldiği fiyatın" değeri değil, geldiği GECENİN üzerinde bir yüzde/miktar.

`calculateStayTotal`'ın gün-gün döngüsü zaten her gece için `getDailyPrice` ile o günün fiyat dönemini buluyor; indirim kontrolü aynı döngüde, o günün BULUNMUŞ fiyatına ayrıca uygulanırsa, hangi fiyat dönemine denk geldiğinden bağımsız doğru çalışır — yani **"katman" (layer) modeli teknik olarak doğrudan uygulanabilir**: fiyat dönemi WHERE gecelik fiyatı belirler, indirim dönemi WHERE o fiyata indirim uygulanıp uygulanmayacağını belirler; ikisi birbirinden bağımsız, birbirini "override" etmeyen iki ayrı sorgu/lookup.

**Birden fazla indirim döneminin KENDİ ARASINDA çakışması** ayrı bir konu ve mevcut sistemde bir emsal yok (villa_prices çakışmayı yapısal olarak engelliyor ama bu, indirimler için henüz karar verilmemiş bir tasarım sorusu — bkz. Madde 10/11'in sonundaki risk notu).

---

## 5. Giriş/çıkış sınırları — kesin tespit

| Bağlam | Başlangıç | Bitiş | Kod referansı |
|---|---|---|---|
| **Fiyat dönemi (`villa_prices`) bir güne uyuyor mu** | dahil (`d >= s`) | **dahil** (`d <= e`) | `getDailyPrice`, `pricing-calendar.ts` tip yorumu: "kapalı interval" |
| **Rezervasyon gece sayısı** | check-in dahil | check-out **HARİÇ** | `calculateNights`, `calculateStayTotal` döngüsü (`while (current < endD)`) |
| **Havuz ısıtma ay kısıtı gece taraması** | check-in dahil | check-out **HARİÇ** | `isPoolHeatingActiveForRange` — doc-comment'te açıkça "check-in DAHİL, check-out HARİÇ" |
| **Admin fiyat aralığı silme/bölme (`applyRangeUpsert`/`applyRangeDelete`)** | dahil | dahil | `range-math.ts` — string karşılaştırma `r.end_date < fromStr` |

**Sonuç:** Sistemde İKİ farklı "aralık" semantiği bir arada yaşıyor: (a) **fiyat/tarih dönemleri** → kapalı interval, ikisi de dahil; (b) **rezervasyon/konaklama** → check-in dahil, check-out hariç (half-open, otel mantığı). İndirim, kavramsal olarak (a) grubuna ait — yani **`villa_prices` ile birebir aynı mantıkta olmalı: `discount_start` ve `discount_end` ikisi de dahil.** Sizin örneğinizde "10 Haziran → 15 Haziran" demek, hem 10 Haziran hem 15 Haziran gecesi indirimli demektir (villa_prices ile tutarlı kalması için). Bu, `villa_short_gaps` (migration 053) ve rezervasyon nights gibi half-open [start,end) mantığından **kasıtlı olarak farklı** — karıştırılırsa off-by-one riski oluşur (bkz. Madde 12 riskler).

---

## 6. Etkilenebilecek public fiyat gösterim noktaları (yalnız tespit, değişiklik yok)

- **Villa detay sayfası** — `useBookingEngine.ts` (merkezi hook) → `BookingSidebar.tsx` (rezervasyon widget'ı) ve `PriceList.tsx` ("Sezon Fiyatları" tablosu — kendi doc-comment'inde *"PRICING ENGINE DOKUNULMADI"* diyerek bilinçli olarak `calculateGrandTotal`'dan ayrık, sadece `villa_prices` satırlarını ham listeliyor — indirim eklenirse bu tablonun da güncellenip güncellenmeyeceği ayrı bir ürün kararı).
- **Villa kartı** — `VillaCard.tsx`, `getStartingPrice()` fallback (tarihsiz "X'den başlayan fiyat") + tarihli aramada `calculateGrandTotal`.
- **Arama sonuçları** — `app/(public)/arama/page.tsx`.
- **Kısa süreli tarihler sayfası** — `app/(public)/kisa-sureli-tarihler/[ay]/[gece]/page.tsx`.
- **Rezervasyon formu / fiyat özeti** — `ReservationForm.tsx`, `BookingSummary.tsx`, `VillaCardBookingModal.tsx`.
- **Paylaşılan liste (token) sayfası** — `app/(public)/liste/[token]/page.tsx` (favori listesi paylaşım linki, villa kartları içeriyor).
- **"İndirimli Koleksiyon" (`discount_collections`)** — ⚠️ **ÖNEMLİ İSİM ÇAKIŞMASI UYARISI:** Bu tablo/özellik, sizin planladığınız tarih bazlı fiyat indiriminden **tamamen bağımsız**; anasayfada elle küratörlüğü yapılan bir "öne çıkan villalar" koleksiyonu (`lib/db/discount.repository.ts`) — gerçek bir fiyat indirimi hesaplamıyor, sadece görsel bir küme. İsimlendirmede ("indirim" kelimesi) kafa karışıklığı riski var; yeni özelliğe farklı bir admin terimi (örn. "Fiyat İndirimi" / "Dönemsel İndirim") kullanmak karışıklığı önler.
- **Admin taraf:** `PriceCard.tsx`, `PriceStep.tsx`, `LiveDatePriceSummary.tsx`, `villa-listesi` sayfası (villa listesinde fiyat gösterimi olabilir).

Hiçbiri bu turda değiştirilmedi; yalnızca "indirim eklenirse dokunması muhtemel yüzey" olarak listelendi.

---

## 7. Rezervasyon güvenliği — snapshot mekanizması

**Mevcut sistemin en kritik tespiti — iki katmanlı gerçek:**

1. **Public rezervasyon oluşturma:** Fiyat, **client tarafında** (`ReservationForm.tsx` → `useBookingEngine.ts` → `calculateGrandTotal`) hesaplanıp `total_price_try`, `cleaning_fee_try`, `prepayment_amount`, `remaining_payment` gibi alanlarla `reservations` tablosuna snapshot olarak yazılıyor. Sunucu tarafında `price-verify.ts > verifyPublicReservationPrice()` bu değerleri **yeniden hesaplayıp karşılaştırıyor ama SADECE LOG/COMPARE modunda** (`TOLERANCE_TRY=1`, `TOLERANCE_PCT=%1`) — uyuşmazlık olsa bile booking **reddedilmiyor**, sadece `console.warn` ile drift loglanıyor. **İstisna: havuz ısıtma** — migration 075/076 sonrası pool heating alanları için sunucu **authoritative** (client'ın gönderdiği tutarlara güvenilmiyor, sunucu villanın gerçek `pool_heating_fee`'siyle yeniden hesaplayıp route seviyesinde override ediyor).
2. **Var olan rezervasyonun tekrar hesaplanması (admin):** `computeReservationPriceRecalc.ts` — rezervasyon detay sayfasında **yalnız tarih veya villa değiştiğinde** (`hasDateChanged || hasVillaChanged`) `calculateGrandTotal` tekrar çağrılıyor; aksi halde (`no_recalc` path) DB'deki snapshot alanları **hiç dokunulmadan** gösteriliyor. Ayrıca `custom_price=true` ise (admin elle fiyat girmişse) `calculateGrandTotal` **hiç çalışmıyor**, snapshot tamamen data'dan geliyor.

**Bu iki mekanizma birlikte şunu garanti ediyor:** Bugün admin bir villa fiyatını değiştirse bile, **daha önce oluşmuş rezervasyonların DB'deki `total_price_try` vb. alanları asla otomatik olarak değişmiyor** — çünkü bu alanlar rezervasyon satırına yazılmış "donmuş" değerler, canlı `villa_prices` sorgusu değil. İndirim de **aynı prensibe tabi olmak zorunda**: indirim hesaba katıldıktan sonra üretilen `total_price_try` (ve varsa yeni bir `original_discount_total`/`discount_amount_try` benzeri alan) rezervasyon satırına snapshot olarak yazılmalı; admin daha sonra indirimi değiştirir/silerse, mevcut rezervasyonlar **bu snapshot alanları sayesinde** etkilenmeyecek — pool heating'in migration 075/076'da izlediği desen (`original_pool_heating_total`, `pool_heating_total_try` — ayrı, donmuş snapshot kolonları) **indirim için doğrudan şablon** olarak kullanılabilir.

**Önerilen snapshot alanları (yalnız analiz, migration önerisi değil):** `original_discount_total`, `original_discount_currency`, `discount_total_try` (pool heating'in üç-alanlı desenine paralel) + belki `applied_discount_id`/`applied_discount_percent` (hangi indirim kuralının uygulandığının izlenebilirliği için, opsiyonel).

---

## 8. Kısa süreli konaklama ücreti ile etkileşim

"Kısa Süreli Konaklama Ücreti", ayrı bir tablo/alan değil — **`cleaning_fee` + `cleaning_limit` alanlarının yeniden yorumlanması**: `calculateCleaningFee(nights, cleaning_fee, cleaning_limit)` → `nights < cleaning_limit` ise `cleaning_fee` tam olarak (gecelik değil, TEK SEFERLİK) uygulanıyor, aksi halde 0. `ShortStayFeeNotice.tsx` bunun salt-okunur bir UI bildirimi.

**Hesaplama sırasındaki konumu:** `calculateGrandTotal` içinde `cleaning` (= kısa süreli ücret dahil), `stay`'den **bağımsız ayrı bir kalem** olarak hesaplanıp `total = stay + cleaning + poolHeating` formülüne ekleniyor.

**İndirimle olası etkileşim — henüz karar verilmeyecek, sadece seçenekler:**
- **Seçenek A (önerilir — en az sürpriz):** İndirim yalnız `stay` (gecelik konaklama toplamı) üzerinde çalışır; `cleaning` (kısa süreli ücret dahil) ve `poolHeating` bundan **tamamen bağımsız** kalır. Bu, mevcut mimarinin zaten "cleaning ve poolHeating, stay'den ayrı kalemler" ilkesiyle birebir tutarlı.
- **Seçenek B:** İndirim `cleaning`'i de etkiler (örn. kısa süreli ücrete de yüzde uygulanır) — bu, mevcut "cleaning bağımsız kalem" tasarımına ek bir bağımlılık ekler, daha fazla test yüzeyi gerektirir.
- Şu an sistemde bu iki kalemin birbirini etkilediği hiçbir yer yok; bu ayrışıklık indirimi yalnız `stay`'e uygulamayı (Seçenek A) hem en güvenli hem en az kod değişikliği gerektiren yol yapıyor.

---

## 9. Havuz ısıtma ile etkileşim (bozmadan analiz)

`pool_heating_fee`, `pool_heating_currency`, `pool_heating_months`, `isPoolHeatingActiveForRange` — `calculateGrandTotal` içinde **tamamen ayrı bir toplama kalemi**: `rawPoolHeating = calculatePoolHeatingFee(nights, pool_heating_fee, selected && isActive)`, sonra `convertPrice` ile kullanıcı para birimine çevrilip `total`'e eklenir. `stay` hesabına hiç karışmıyor; kendi `nights × fee` çarpımı var (gece bazlı gecelik villa fiyatından tamamen bağımsız bir sabit gecelik ücret).

**Evet, indirim gecelik konaklama (`stay`) fiyatına uygulanırsa, havuz ısıtma bundan doğal olarak ve hiçbir ek önlem gerekmeden bağımsız kalır** — çünkü zaten mimari olarak `poolHeating` hesap zincirinde `stay`/`getDailyPrice` çıktısını hiç kullanmıyor, kendi ayrı `pool_heating_fee` sabitini çarpıyor. Bu, Madde 8'deki "Seçenek A" ile birebir aynı gerekçe: indirim `getDailyPrice`/`calculateStayTotal` seviyesinde uygulanırsa, `calculatePoolHeatingFee` ve `calculateCleaningFee` fonksiyonlarına hiç dokunmadan otomatik olarak izole kalır.

---

## 10. Önerilen DB yapısı (yalnız öneri — migration oluşturulmadı)

**Ayrı tablo: `villa_discounts` (çoğul) — `villa_prices` ile birebir paralel mimari.** Gerekçeler:

- Sizin belirttiğiniz gibi bir villanın **birden fazla indirim dönemi** olabilmeli (1-15 Haz %10, 20-30 Haz %20, 1-15 Tem %15) — bu, `villa_prices`'ın zaten çözdüğü "bir villa, çok satır" ilişkisiyle birebir aynı şekil; ayrı tablo + `villa_id` FK bunun doğal karşılığı.
- `villa_prices` içine kolon eklemek (örn. `discount_percent`, `discount_start`, `discount_end`) çok satırlı indirim senaryosunu **desteklemez** (bir fiyat satırına yalnız 1 indirim sığar) ve daha önemlisi, indirim aralığı ile fiyat aralığı **kavramsal olarak farklı yaşam döngülerine sahip** (biri "bu tarihte gecelik kaç TL", diğeri "bu tarihte % kaç indirim var" — bağımsız olarak eklenip/silinip/değiştirilebilmeliler). `villa_prices`'a gömmek, mevcut `applyRangeUpsert`'ın "yeni aralık eskisini böler" mantığını indirimle karıştırma riski taşır (Madde 4'te açıklanan "indirim bir katman, fiyat dönemiyle çakışması gerekiyor" ilkesiyle çelişir).
- Önerilen şekil (villa_prices'ın mevcut kolonlarıyla simetrik):
  ```
  villa_discounts (
    id uuid PK,
    villa_id uuid FK → villa(id),
    start_date date NOT NULL,   -- dahil (villa_prices ile aynı semantik)
    end_date   date NOT NULL,   -- dahil
    discount_type  text NOT NULL,   -- 'percent' | 'fixed' (bkz. Madde 11)
    discount_value numeric NOT NULL,
    is_active boolean DEFAULT true, -- admin'in migration'sız aç/kapa yapabilmesi için (opsiyonel)
    created_at timestamptz DEFAULT now()
  )
  ```
- **Yazma yolu:** `villa_prices` ile birebir aynı desen — `replace_villa_discounts(p_villa_id, p_discounts jsonb)` RPC + `pg_advisory_xact_lock` (migration 002'deki `replace_villa_prices` fonksiyonunun neredeyse birebir klonu olabilir).
- **RLS:** `villa_prices` gibi public SELECT açık olmalı (public fiyat hesaplaması indirimi görebilmeli); yazma yalnız admin/service-role.
- **Aynı villada birden fazla indirim döneminin KENDİ ARASINDA çakışması:** Şu an karar verilmemiş bir alan — iki güvenli seçenek: (a) `villa_prices`'taki gibi UI seviyesinde yapısal olarak çakışmayı engelle (yeni indirim eskisini böler/keser), (b) DB'de EXCLUDE constraint (`daterange` + `gist`) ile çakışmayı veritabanı seviyesinde engelle (migration 001'in `reservations_no_overlap` deseniyle aynı teknik). İkisi de mevcut mimaride emsali olan, kanıtlanmış yaklaşımlar.

---

## 11. İndirim türleri — artı/eksi (henüz karar verilmiyor)

| Seçenek | Artı | Eksi |
|---|---|---|
| **Yalnız yüzde (%)** | En basit; `getDailyPrice`'ın ürettiği `original` değerine `* (1 - percent/100)` — tek satırlık, para birimi karışıklığı yok (yüzde currency-agnostic). Mevcut motorun "convert en son yapılır" ilkesiyle uyumlu (indirim orijinal fiyata uygulanır, sonra convertPrice çalışır — cleaning/poolHeating'in izlediği "raw→convert" sırayla birebir aynı desen). | Sabit tutar indirim isteği gelirse ikinci bir tip eklemek gerekir. |
| **Yalnız sabit gecelik indirim (örn. 2.000 TL)** | Öngörülebilir tutar. | **Currency uyuşmazlığı riski taşır** — villa_prices satırının `currency`'si (örn. EUR) ile indirimin sabit tutarının hangi para biriminde olduğu ayrıca belirlenmeli; ayrıca gecelik fiyattan büyük bir sabit indirim negatif fiyat üretebilir (0'a clamp gerekir — `calculatePoolHeatingFee`'deki `!nights || nights<=0 → 0` gibi bir guard ile aynı disiplin gerekir). |
| **İkisini birden desteklemek (`discount_type: 'percent'|'fixed'`)** | Gelecekte esneklik. | Şimdiden hem UI hem hesap motorunda 2 path'lik dallanma — en küçük/en güvenli ilk adım için gereksiz karmaşıklık. |

**Analiz notu (karar değil):** Mevcut mimarideki en yakın emsal — cleaning_fee sabit tutar, pool_heating_fee sabit tutar/gece — sistemde zaten "sabit tutar" tipi rahatça destekleniyor; ama sizin verdiğiniz örnek (%20) ve "villa fiyatının X TL/gece'sinden bağımsız, oransal indirim" ifadeniz **yüzde tipinin birincil senaryo** olduğunu gösteriyor. En küçük/en güvenli ilk adım için `discount_type` kolonunu şimdiden şemaya koyup (gelecekte 'fixed' eklemeyi migration'sız yapabilmek için) yalnız `'percent'` path'ini implemente etmek, mimari değişikliği ileriye ertelerken bugünün karmaşıklığını en aza indirir.

---

## 12. Değişmesi muhtemel dosyaların listesi (yalnız tespit)

**Çekirdek motor:**
- `lib/price.engine.ts` — yeni `getDailyDiscount()`/`applyDiscountToDaily()` benzeri saf fonksiyon(lar) + `calculateStayTotal`/`calculateGrandTotal` içine entegrasyon.
- `lib/villa-row.types.ts` — `PriceRange` yanına yeni bir `DiscountRange` tipi (muhtemelen).

**Yeni DB/repository katmanı:**
- Yeni migration (`db/migrations/0XX_villa_discounts.sql`) — tablo + RLS + `replace_villa_discounts` RPC.
- `lib/db/villa.repository.server.ts` — `rpcReplaceVillaDiscounts`, `findDiscountsByVillaId` benzeri yeni metodlar (mevcut price metodlarının yanına, mevcutları değiştirmeden).
- `app/services/villa-price.service.ts` / yeni `villa-discount.service.ts` — `getVillaDiscounts()` public fetch + cache.
- `lib/cache.helpers.ts` — yeni cache anahtarı.

**Admin UI:**
- Yeni bir "İndirim" bölümü — muhtemelen `PricingCalendarCanvas.tsx`'in yanına paralel yeni bir component (mevcut price canvas'a KARIŞTIRILMADAN — kendi doc-comment'i zaten "mevcut tasarım bozulmasın" ilkesini vurguluyor); `pricing-calendar/` klasöründeki `range-math.ts`/`date-math.ts` gibi paylaşılan yardımcılar yeniden kullanılabilir.
- `app/api/admin/villas/[id]/prices/route.ts`'e paralel yeni bir `.../discounts/route.ts` (opsiyonel, RPC zaten villa update akışına gömülebilir).

**Rezervasyon snapshot:**
- `types/database.ts > ReservationRow` — yeni snapshot kolonları (`original_discount_total` vb., pool heating deseninde).
- `app/services/reservation/_helpers/price-verify.ts` — indirim server-authoritative hesaplanmalı (pool heating'in izlediği yol — client'a güvenilmemeli).
- `app/components/reservation/_helpers/buildPublicReservationPayload.ts`, admin tarafında `buildCreateCustomPricePayload.ts`, `computeReservationPriceRecalc.ts`, `computeCustomPriceToggle.ts`, `computeCustomPriceAmountChange.ts`.

**Public gösterim (yalnız Madde 6'da listelenenler — ileride):**
- `useBookingEngine.ts`, `PriceList.tsx`, `VillaCard.tsx`, `BookingSidebar.tsx`, `ReservationForm.tsx`, `BookingSummary.tsx`, `VillaCardBookingModal.tsx`.

**Test:**
- `tests/unit/price-engine.test.ts` — yeni indirim testleri (mevcut testler dokunulmadan, ek `describe` bloğu).

---

## En küçük ve en güvenli implementasyon yaklaşımı (öneri, uygulanmadı)

1. **Additive migration:** Yeni `villa_discounts` tablosu + `replace_villa_discounts` RPC + public RLS SELECT. Mevcut `villa_prices`/`reservations` şemasına SIFIR dokunuş.
2. **Saf fonksiyon önce:** `lib/price.engine.ts`'e yalnız yeni, izole fonksiyon(lar) eklenir (`getDailyDiscount`, vb.); mevcut `getDailyPrice`/`calculateStayTotal`/`calculateGrandTotal` imzaları **opsiyonel parametre** olarak genişletilir (pool heating'in migration 076'da izlediği "yeni parametre default'u eskiyle BYTE-IDENTICAL davranış" deseni) — `discounts` parametresi verilmezse/`[]` ise mevcut davranış birebir korunur.
3. **Server-authoritative snapshot:** İndirim tutarı, pool heating'in `computeAuthoritativePoolHeatingSnapshot` desenini izleyerek sunucuda (client'a güvenmeden) hesaplanıp yeni snapshot kolonlarına yazılır.
4. **Admin UI en son:** Önce motor+DB+snapshot güvenliği kanıtlanır (birim testleriyle), UI en son eklenir — mevcut `PricingCalendarCanvas`'a hiç dokunmadan, yanına yeni bir bölüm.
5. Her adım, mevcut villa fiyatları/price engine/rezervasyon/kısa süreli/havuz ısıtma/admin ekranı/public gösterim davranışını **hiç indirim tanımlanmamış villalarda BYTE-IDENTICAL** bırakacak şekilde tasarlanmalı (tıpkı migration 076'nın `pool_heating_months=NULL` için yaptığı gibi: yeni özellik "tanımlanmamış" durumda tamamen görünmez/etkisiz).

---

## Riskler / Edge-case'ler

- **Off-by-one riski (Madde 5):** İndirim aralığı `villa_prices` ile aynı "ikisi de dahil" semantiğinde tutulmazsa (örn. yanlışlıkla rezervasyonun half-open [start,end) mantığıyla karıştırılırsa), indirimin son günü ya fazladan uygulanır ya da eksik kalır. Bu, mevcut sistemin zaten barındırdığı iki farklı "aralık" felsefesinin (Madde 5 tablosu) bir sonraki geliştiricide karışabileceği gerçek bir tuzak.
- **Negatif/sıfır fiyat riski:** Sabit tutar indirim türü (Madde 11) seçilirse, indirim gecelik fiyattan büyük olduğunda negatif toplam oluşabilir — guard gerekir.
- **Currency tutarsızlığı:** İndirim yüzdesi currency-agnostic olduğu için görece güvenli; ama sabit tutar seçilirse hangi para biriminde olduğu villa_prices satırının currency'siyle uyuşmayabilir.
- **Client-trust açığı (Madde 7):** Bugün `total_price_try` public booking'de yalnız LOG modunda doğrulanıyor (enforce edilmiyor) — indirim eklenirse, kötü niyetli bir client sahte bir "indirim uygulanmış" tutar gönderebilir. Havuz ısıtmanın aldığı server-authoritative önlem indirim için de **şart**, "iyi olur" değil.
- **Fiyat dönemi + indirim dönemi hizasızlığı:** Madde 4'te gösterildiği gibi indirim bir fiyat döneminin ortasından başlayıp bitebiliyor — `calculateStayTotal`'ın gün-gün döngüsü buna doğal olarak uyumlu, ama eğer ileride performans için "toplu/aralık bazlı" bir optimizasyon yapılırsa (gün-gün yerine SQL'de aralık kesişimi), bu kesişim mantığının gün-gün referans davranışla bire bir eşleştiği testlerle kanıtlanmalı.
- **Çoklu indirim çakışması (Madde 10):** Aynı villada aynı tarihe denk gelen 2 farklı indirim dönemi tanımlanırsa (örn. admin hata yapar) davranış tanımsız kalır — ya UI'da yapısal olarak engellenmeli ya da DB EXCLUDE constraint ile.
- **"İndirimli Koleksiyon" isim çakışması (Madde 6):** Var olan `discount_collections` özelliğiyle terminoloji çakışması admin kafa karışıklığına yol açabilir; farklı bir isimlendirme önerilir.
