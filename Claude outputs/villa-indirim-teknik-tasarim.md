# Villa Gecelik İndirim Sistemi — Netleşmiş Teknik Tasarım (READ-ONLY)

**Durum:** Bu bir uygulama değil, tasarım dokümanıdır. Hiçbir kod değiştirilmedi, migration oluşturulmadı, DB'ye yazılmadı, commit/push yapılmadı. Önceki iki audit turunda çıkarılan tespitler (villa_prices mimarisi, `lib/price.engine.ts` zinciri, reservation snapshot mekanizması, kısa süreli ücret/havuz ısıtma izolasyonu) buradaki tasarımın temelini oluşturuyor; burada tekrar keşif yapılmadı, doğrudan **netleşmiş modele göre karar** üretildi.

**Netleşen model (sizin son mesajınızdan):** İndirim tarih mantığı `villa_prices` ile **birebir aynı** — başlangıç/bitiş ikisi de dahil (kapalı interval). Aşağıdaki tasarımın her maddesi bu kurala sadık kalır; yeni bir tarih yorumu icat edilmedi.

---

## 1. `villa_discounts` tablosunun en güvenli yapısı

`villa_prices` ile satır satır simetrik, ayrı tablo:

```
villa_discounts
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid()
  villa_id        uuid        NOT NULL REFERENCES villa(id) ON DELETE CASCADE
  start_date      date        NOT NULL   -- villa_prices.start_date ile AYNI semantik: DAHİL
  end_date        date        NOT NULL   -- villa_prices.end_date ile AYNI semantik: DAHİL
  discount_type   text        NOT NULL   -- 'percent' | 'fixed'
  discount_value  numeric     NOT NULL   -- percent: 0-100 arası; fixed: pozitif tutar
  currency        text        NULL       -- yalnız discount_type='fixed' iken anlamlı (Madde 5)
  created_at      timestamptz NOT NULL DEFAULT now()

  CONSTRAINT villa_discounts_valid_range CHECK (start_date <= end_date)
  CONSTRAINT villa_discounts_type_check  CHECK (discount_type IN ('percent','fixed'))
  CONSTRAINT villa_discounts_percent_range
    CHECK (discount_type <> 'percent' OR (discount_value > 0 AND discount_value <= 100))
  CONSTRAINT villa_discounts_value_positive CHECK (discount_value > 0)
```

**Neden `villa_prices`'a kolon değil, ayrı tablo:** Bir villada birden fazla, tarihen farklı indirim dönemi olabilmesi gerekiyor (01-10 Haz %10, 15-25 Haz %20 gibi) — bu "1 villa → çok satır" ilişkisi `villa_prices`'ın zaten çözdüğü şeklin birebir aynısı. `villa_prices` satırına kolon eklemek bir fiyat satırına yalnız 1 indirim sığdırır ve fiyat/indirim yaşam döngülerini yapay olarak birbirine bağlar (biri değişirken diğerinin de "replace-all" akışına dahil olması gerekir) — sizin "indirim ayrı bir katman, eskisi bozulmasın" ilkenizle doğrudan çelişir.

**RLS:** `villa_prices` ile birebir aynı — public SELECT açık (anon+authenticated), yazma yalnız service-role/admin RPC üzerinden. Public tarafta fiyat hesaplaması indirimi görebilmeli.

**Yazma yolu:** `replace_villa_discounts(p_villa_id uuid, p_discounts jsonb) RETURNS void` — migration 002'deki `replace_villa_prices` fonksiyonunun yapısal ikizi: `pg_advisory_xact_lock(hashtext('villa_discounts:'||p_villa_id::text))` ile concurrent yazmaları serileştirir, `DELETE FROM villa_discounts WHERE villa_id=p_villa_id` + toplu `INSERT ... SELECT FROM jsonb_array_elements`. Bu, "Fiyatlar" akışının **tıpatıp aynısı** — admin "İndirimler" bölümünde kaydet dediğinde bu RPC villa'nın tüm `villa_discounts` satırlarını atomically yeniler; `villa_prices` bu işleme hiç girmez, hiç okunmaz bile.

---

## 2. Admin → Villa → Fiyat ekranına eklenme şekli

Mevcut "Fiyat" bölümü `PricingCalendarCanvas.tsx` (496 satır) + `pricing-calendar/` klasöründeki alt component'ler (`DayCell`, `MonthBlock`, `PricingCalendarNav`, `PricingRangeDrawer`) ve saf yardımcılar (`date-math.ts`, `range-math.ts`, `range-predicate.ts`, `color-tone.ts`). Bu component'in kendi doc-comment'i "mevcut tasarım bozulmasın" ilkesini defalarca vurguluyor — **bu dosyaya hiç dokunulmayacak.**

**Önerilen yerleşim:** `PricingCalendarCanvas`'ın render çıktısının hemen altına, **kendi başına yeni bir component** (`DiscountSection.tsx` veya benzeri) eklenir — tıpkı `ShortStayFeeNotice.tsx`'in "PriceList'ten TAMAMEN bağımsız, ayrı dosya" yaklaşımını izleyerek. İki alt seçenek:

- **A) Basit liste/tablo (önerilir — ilk sürüm için en az risk):** Sizin örneğinizdeki `[Başlangıç] [Bitiş] [%/Sabit] [Değer]` satır listesi. Takvim görselleştirmesi indirim için şart değil — fiyat takviminin "hangi güne kaç TL" görselleştirme ihtiyacı var, indirimin ise yalnızca birkaç ayrık dönemi olacak (villa_prices'a göre çok daha az satır beklenir). `PricingRangeDrawer.tsx`'teki "tarih aralığı seç + değer gir + kaydet" modal deseni (state parent'ta, drawer pure presentational) doğrudan kopyalanıp indirim alanları için uyarlanabilir.
- **B) Aynı takvim üzerinde ikinci katman (daha karmaşık, ilk sürüm için önerilmez):** Fiyat takviminin günlerini indirimli günlerde farklı renkte/ikonla işaretlemek — `color-tone.ts`'in genişletilmesini gerektirir, `PricingCalendarCanvas`'a (dokunulmaması istenen dosyaya) entegrasyon riski taşır.

**CREATE/EDIT mode ayrımı:** `PricingCalendarCanvasProps`'taki `villaId?` opsiyonel prop deseni (villaId yoksa local-state + `onPricesChanged`, varsa DB-sync) indirim component'i için de birebir uygulanabilir — villa henüz kaydedilmemişken (`ekle` sayfası) indirimler local state'te tutulur, `createVillaFull` payload'ına eklenir; edit modunda `getVillaDiscounts(villaId)` + `replace_villa_discounts` RPC.

---

## 3. Mevcut fiyat dönemlerini bozmadan indirim tarih aralığı kontrolü

**Kritik ayrım:** İndirim aralığının **villa_prices ile çakışıp çakışmadığını kontrol etmeye gerek YOK** — tam tersine, indirim bilinçli olarak fiyat dönemleriyle kesişecek şekilde tasarlanıyor (10 Haziran'da hem "01-30 Haziran → 10.000 TL" fiyat dönemi hem "10-20 Haziran → %20" indirim dönemi aynı anda geçerli olacak, bu **istenen davranış**). Yani indirim tarih kontrolü, `villa_prices` satırlarına **hiç bakmadan**, sadece kendi tablosunun içinde çalışır:

1. **İndirim ↔ İndirim çakışması (aynı villada iki indirim dönemi üst üste binerse):** Önerilen — `range-math.ts > applyRangeUpsert`'in izlediği "yeni aralık ekleniyorsa eskiyi otomatik sol/sağ böl" mantığı, indirim tablosu için de **yeniden kullanılabilir** (fonksiyon zaten jenerik: `start_date`/`end_date`/rastgele payload alanları üzerinden çalışıyor, `price` alanına özel bir bağımlılığı yok). Bu sayede admin ikinci bir çakışan indirim eklediğinde, ilk indirim otomatik olarak kesilir/bölünür — davranış hiçbir zaman belirsiz kalmaz, `villa_prices`'ın zaten kanıtladığı UX ile birebir tutarlı olur.
2. **İndirim ↔ villa_prices ilişkisi:** Kontrol YOK, kesişim İSTENEN — bu, Madde 4'te (farklı fiyat dönemleri) detaylandırılan "katman" modelinin doğrudan sonucu.

**Mevcut fiyat dönemlerinin bozulmaması nasıl garanti edilir:** `replace_villa_discounts` RPC'si yalnız `villa_discounts` tablosuna `DELETE`/`INSERT` yapar; `villa_prices` tablosuna hiçbir SQL ifadesi dokunmaz (RPC'nin gövdesinde `villa_prices` kelimesi bile geçmez). Fiziksel olarak ayrı tablo + ayrı RPC + ayrı repository metodu olduğu için, indirim akışının `villa_prices`'ı bozma **olasılığı mimari olarak sıfırlanmış olur** (aynı fonksiyonun içinde iki farklı tabloya yazma riski yok).

---

## 4. Price engine'de indirimin uygulanacağı tam nokta

`lib/price.engine.ts > calculateStayTotal` fonksiyonunun döngüsü:

```
let current = parseLocalDate(start);
const endD = parseLocalDate(end);

while (current < endD) {
  const daily = getDailyPrice(current, prices, currency, rates);   // ① DEĞİŞMEZ
  stay += daily.converted;
  ...
  current.setDate(current.getDate() + 1);
}
```

**Tam müdahale noktası — ①'in HEMEN SONRASI, `stay +=` satırından ÖNCE:**

```
① daily = getDailyPrice(current, prices, currency, rates)      // MEVCUT — dokunulmaz
② discountPct = getDailyDiscountFactor(current, discounts)      // YENİ, saf fonksiyon
③ dailyFinal = applyDiscount(daily, discountPct)                 // YENİ, saf fonksiyon
   stay += dailyFinal.converted                                  // ① yerine ③ toplanır
```

**Neden burası ve başka bir yer değil:**
- `getDailyPrice` (①), o günün **hangi villa_prices satırına ait olduğunu** zaten çözmüş, `original` (henüz currency-convert edilmemiş) değeri üretmiş durumda — indirim tam olarak bu "orijinal, ham gecelik fiyat" üzerine uygulanmalı (yüzde indirim currency-agnostic olduğu için convert öncesi/sonrası fark etmez, ama tutarlılık için convert-öncesi = `original` üzerinde uygulanması, sabit tutar indirimde currency eşleştirmesini kolaylaştırır — Madde 5).
- `getDailyPrice`'ın kendisi **hiç değişmez** — imzası, iç mantığı, dönüş şekli byte-identical kalır. Bu, `getDailyPrice`'ı çağıran başka hiçbir yerin (varsa) etkilenmemesini garanti eder.
- İndirim, `calculateStayTotal`'ın zaten var olan gün-gün döngüsüne (`while` loop) **ek bir adım** olarak eklenir — yeni bir döngü, yeni bir tarih iterasyonu YOK. Bu, off-by-one riskini de azaltır çünkü tarih ilerletme (`current.setDate(+1)`) mantığı tek bir yerden, tek sefer çalışır.
- `calculateGrandTotal` seviyesine kadar hiçbir değişiklik gerekmez — `stay` zaten indirimli toplamı taşıyarak yukarı akar; `cleaning`/`poolHeating`/`total` formülleri **aynen kalır** (Madde 8).

**`discounts` parametresi opsiyonel olmalı** (pool heating'in migration 076'daki `pool_heating_months?: number[] | null` deseniyle birebir aynı disiplin): `calculateStayTotal(start, end, prices, currency, rates, discounts?: DiscountRange[])` — parametre verilmezse veya `[]`/`undefined` ise `getDailyDiscountFactor` her zaman "indirim yok" (`factor=1` / `discount=0`) döner → **indirim tanımlanmamış her villada, her eski çağrıda davranış byte-identical kalır.**

---

## 5. `%` ve sabit TL/gecelik indirim desteği

```
getDailyDiscountFactor(date, discounts[]) →
  eşleşen villa_discounts satırı bulunur (start<=date<=end, villa_prices ile AYNI kapalı-interval kontrolü)
  bulunamazsa → { type: null }  (indirim yok)

applyDiscount(dailyOriginal: number, dailyCurrency: string, discount): number
  discount yoksa            → dailyOriginal                                    (DEĞİŞMEZ)
  discount.type === 'percent' → dailyOriginal * (1 - discount.value / 100)     (currency-agnostic)
  discount.type === 'fixed'   → Math.max(dailyOriginal - convertedFixedValue, 0)
                                 (convertedFixedValue = discount.currency !== dailyCurrency
                                    ? convertPrice(discount.value, discount.currency, dailyCurrency, rates)
                                    : discount.value)
```

- **Yüzde:** `original × (1 - value/100)` — o günün hangi fiyat döneminden geldiğinden ve hangi currency'de olduğundan tamamen bağımsız çalışır. En düşük riskli, ilk sürüm için önerilen tek path.
- **Sabit TL/gecelik:** `max(original - value, 0)` — **guard şart** (indirim tutarı gecelik fiyattan büyükse negatif olmasın); ayrıca currency eşleşmesi gerekir (Madde 8'de detay). `discount_value`'nun büyük olduğu edge-case'te sonucun 0 olması (ücretsiz gece değil, "0 TL'lik bir hesaplama hatası" anlamına gelmemesi için) ayrıca admin tarafında bir validasyon/uyarı ile desteklenmeli (yalnız analiz, karar değil).
- **İkisini de desteklemek** şema seviyesinde (`discount_type` kolonu) bugünden hazırlanır ama **ilk implementasyon yalnız `'percent'` path'ini aktif eder** — sizin verdiğiniz tüm örnekler zaten yüzde üzerinden, sabit tutar Madde 8'deki currency riskini taşıdığı için ikinci faza bırakılması en güvenli sıralama.

---

## 6. Her gecenin kendi fiyatından indirim hesaplanması (farklı dönemli senaryo)

Senaryo: 01-15 Haz → 10.000 TL, 16-30 Haz → 12.000 TL, indirim 10-20 Haz → %20.

Bu, Madde 4'teki mimarinin **otomatik sonucu** — ekstra bir mantık yazmaya gerek yok, çünkü:

```
while (current < endD) {
  daily = getDailyPrice(current, prices, ...)   // current=10 Haz iken 10.000 TL bulur
                                                  // current=16 Haz iken 12.000 TL bulur
  discountFactor = getDailyDiscountFactor(current, discounts)  // current=10..20 Haz için 0.20 bulur
  dailyFinal = daily.original * (1 - discountFactor)
  // 10 Haz: 10.000 × 0.8 = 8.000
  // 16 Haz: 12.000 × 0.8 = 9.600
  stay += convertPrice(dailyFinal, ...)
}
```

`getDailyPrice` ve `getDailyDiscountFactor` **birbirinden habersiz iki bağımsız sorgu** — biri "bu gün hangi fiyat" sorusunu, diğeri "bu gün indirim var mı, ne kadar" sorusunu cevaplıyor. Döngü her iterasyonda ikisini de tazeden çağırdığı için, gün 10.000'den 12.000'e geçse bile indirim oranı **her zaman o anki günün kendi fiyatına** uygulanmış olur — iki fonksiyonun sonuçlarının çarpılması/birleştirilmesi dışında bir "senkronizasyon" mekanizmasına gerek yok.

---

## 7. Reservation snapshot'a kaydedilmesi gereken indirim bilgileri

Pool heating'in migration 075/076'da izlediği 4-kolonlu desenin birebir indirim karşılığı:

```
reservations tablosuna eklenecek (yalnız öneri, migration oluşturulmadı):
  discount_applied            boolean       -- indirim uygulandı mı (rezervasyon aralığında ≥1 gece indirimliyse true)
  original_discount_total     numeric       -- toplam indirim TUTARI, orijinal fiyat currency'sinde (donmuş)
  original_discount_currency  text
  discount_total_try          numeric       -- TRY snapshot (raporlama/admin listesi için)
```

**Neden tutar (total), oran (%) değil saklanmalı:** Bir rezervasyon birden fazla geceyi kapsayabilir ve her gece **farklı bir indirim yüzdesine/hiç indirime** denk gelebilir (Madde 6). Tek bir "%20" saklamak yanlış olur (hangi geceye ait olduğu belirsizleşir); bunun yerine `calculateStayTotal`'ın ürettiği **indirimsiz toplam ile indirimli toplam arasındaki fark**, tek bir TUTAR olarak donuk şekilde saklanır — tıpkı `original_pool_heating_total`'ın "nights × fee" sonucunu bir oran değil, hazır tutar olarak saklaması gibi.

**Snapshot garantisi nasıl sağlanır (sizin 70.000→56.000 örneğiniz):** Rezervasyon oluşturulduğu anda `calculateGrandTotal` çağrılırken o anki `villa_discounts` durumuna göre hesaplanan indirim tutarı yukarıdaki 4 kolona yazılır. Sonrasında `computeReservationPriceRecalc.ts`'in izlediği kural (yalnız tarih/villa değişince yeniden hesapla, aksi halde `no_recalc` — DB'deki snapshot dokunulmadan gösterilir) **indirim için de aynen geçerli olur** — admin `villa_discounts`'u değiştirse/silse bile, bu 4 kolon fiziksel olarak yazılmış olduğu için eski rezervasyonun `total_price_try`'ı **asla otomatik değişmez.**

**Public + admin authoritative hesaplama (sizin son isteğiniz):** İndirim tutarının hesaplanması **tek bir merkezi fonksiyondan** (yeni `getDailyDiscountFactor`/`applyDiscount`, `lib/price.engine.ts` içinde) geçmeli; hem public rezervasyon oluşturma (`price-verify.ts > recomputePublicReservationPrice`) hem admin manuel rezervasyon oluşturma/recalc (`computeReservationPriceRecalc.ts`) **aynı bu fonksiyonu** çağırmalı — havuz ısıtmanın izlediği "server-authoritative, client'a güvenilmez" deseniyle birebir aynı disiplin. Bu, hem tutarlılığı hem güvenliği aynı anda sağlar: iki farklı hesaplama yolu olursa (biri public'te, biri admin'de farklı yazılmış) er ya da geç birbirinden sapar — tek merkezi fonksiyon bunu yapısal olarak imkansız kılar.

---

## 8. Kısa süreli konaklama ve havuz ısıtma neden etkilenmez — kanıt

`calculateGrandTotal` içindeki gerçek çağrı sırası (Madde 4'ten sonrasıyla birleştirilmiş):

```
1. nights       = calculateNights(start, end)                                  // yalnız tarihten
2. stayResult   = calculateStayTotal(start, end, prices, ..., discounts)       // ①②③ burada — YENİ
3. rawCleaning  = calculateCleaningFee(nights, cleaning_fee, cleaning_limit)   // DEĞİŞMEZ
4. rawPoolHeat  = calculatePoolHeatingFee(nights, pool_heating_fee, selected)  // DEĞİŞMEZ
5. total        = stay + cleaning + poolHeating
```

`calculateCleaningFee`'nin imzası `(nights, cleaning_fee, cleaning_limit)` — **`prices` veya `stay` parametresi hiç almıyor.** `calculatePoolHeatingFee`'nin imzası `(nights, pool_heating_fee, selected)` — o da **`prices`/`stay`'i hiç almıyor.** İkisi de yalnız `nights` (ham gece sayısı, tarihten hesaplanır, indirimle hiçbir ilişkisi yok) ve villa'nın kendi sabit alanlarını (`cleaning_fee`, `pool_heating_fee`) kullanıyor.

Bu, "neden etkilenmeyecek" sorusuna **kod seviyesinde kanıtlanmış bir cevap**: İndirim yalnız adım 2'nin (`calculateStayTotal`) içine, `getDailyPrice`'ın çıktısının üzerine eklendiği sürece, adım 3 ve 4 **fiziksel olarak indirimin sonucunu hiç görmüyor** — parametre listelerinde yer almadığı için değiştirilmeleri bile gerekmiyor, dokunulmadan otomatik izole kalıyorlar.

---

## 9. Public fiyat gösterimlerinin değişmesi gereken noktalar (tespit — bu turda değiştirilmiyor)

- **Villa detay sayfası** — `useBookingEngine.ts` (merkezi hook, `BookingResult = ReturnType<typeof calculateGrandTotal>`) → indirim `stay` içine gömülü geleceği için, ~~üstü çizili eski fiyat~~ göstermek istenirse `BookingResult`'a `original_stay_before_discount` gibi ek bir alan (additive, mevcut alanları bozmadan) eklenmesi gerekir.
- **"Sezon Fiyatları" tablosu** (`PriceList.tsx`) — kendi doc-comment'inde bilinçli olarak `calculateGrandTotal`'dan ayrık, ham `villa_prices` listeliyor; indirimli/normal iki fiyatı yan yana göstermek istenirse bu component'in ayrıca `villa_discounts`'u da fetch etmesi gerekir (şu an hiç haberi yok).
- **Villa kartı** (`VillaCard.tsx`) — tarihsiz `getStartingPrice()` fallback'i şu an yalnız `villa_prices`'ın min'ini alıyor; "indirimli fiyattan başlayan" göstermek istenirse bu fonksiyonun da genişletilmesi gerekir (opsiyonel, tarih bağlamı olmadığı için "hangi indirim" belirsiz — ayrı bir ürün kararı).
- **Arama sonuçları** (`app/(public)/arama/page.tsx`) — tarihli aramada `calculateGrandTotal` zaten kullanılıyor, indirim otomatik yansır; ekstra UI (üstü çizili fiyat) eklenmek istenirse ayrı iş.
- **Rezervasyon özeti** — `BookingSidebar.tsx`, `ReservationForm.tsx`, `BookingSummary.tsx`, `VillaCardBookingModal.tsx` — hepsi `BookingResult`'ı tüketiyor, indirim tutarı ayrı bir alan olarak eklenirse bu component'ler "X TL indirim uygulandı" satırını gösterebilir.
- **Paylaşılan liste (share/token)** — `app/(public)/liste/[token]/page.tsx`.
- **Admin taraf** — `PriceCard.tsx`, `PriceStep.tsx`, `LiveDatePriceSummary.tsx` — admin manuel rezervasyon oluştururken de indirim otomatik uygulanmalı ve görünür olmalı (Madde 7'deki authoritative merkezi fonksiyon sayesinde otomatik gelir).

Bu turda hiçbiri değiştirilmedi; yalnızca "ileride dokunması gereken yüzey" olarak işaretlendi.

---

## 10. Minimum müdahale — dosya listesi ve dokunma derecesi

| Dosya | Müdahale türü | Risk |
|---|---|---|
| Yeni migration (`0XX_villa_discounts.sql`) | Yeni tablo + RLS + `replace_villa_discounts` RPC | Additive, sıfır risk — mevcut şemaya dokunmuyor |
| `lib/price.engine.ts` | `getDailyDiscountFactor`/`applyDiscount` YENİ saf fonksiyonlar + `calculateStayTotal`/`calculateGrandTotal`'a **opsiyonel** `discounts` parametresi | Düşük — parametre verilmezse mevcut davranış byte-identical (test edilebilir garanti) |
| `lib/villa-row.types.ts` | Yeni `DiscountRange` tipi eklenir | Sıfır — mevcut `PriceRange` tipine dokunulmuyor |
| `lib/db/villa.repository.server.ts` | Yeni metodlar (`rpcReplaceVillaDiscounts`, `findDiscountsByVillaId`) mevcut metodların **yanına** eklenir | Sıfır — mevcut price metodları dokunulmuyor |
| Yeni `app/services/villa-discount.service.ts` | Yeni dosya — public fetch + cache | Sıfır |
| `lib/cache.helpers.ts` | Yeni cache anahtarı eklenir | Düşük — mevcut anahtarlara dokunulmuyor |
| Yeni admin component (`DiscountSection.tsx` + drawer) | Yeni dosya(lar), `PricingCalendarCanvas.tsx`'in **yanına** | Sıfır — mevcut fiyat canvas'ı dokunulmuyor |
| `app/services/reservation/_helpers/price-verify.ts` | `recomputePublicReservationPrice` içine indirim hesabı eklenir (pool heating deseninde, server-authoritative) | Orta — mevcut fonksiyonun içine ekleme, dikkatli test gerektirir |
| `types/database.ts > ReservationRow` | 4 yeni opsiyonel/nullable kolon (Madde 7) | Düşük — mevcut alanlara dokunulmuyor, yalnız ekleme |
| `computeReservationPriceRecalc.ts`, `buildPublicReservationPayload.ts`, `buildCreateCustomPricePayload.ts` | İndirim snapshot alanlarının payload'a eklenmesi | Orta — mevcut "custom_price"/"no_recalc" path'lerinin davranışı korunarak dikkatli ekleme |
| `tests/unit/price-engine.test.ts` | Yeni `describe` bloğu | Sıfır — mevcut testler dokunulmuyor |

**Hiç dokunulmayacaklar (bilinçli sınır):** `PricingCalendarCanvas.tsx`, `pricing-calendar/` klasörünün tamamı, `range-math.ts > applyRangeUpsert/applyRangeDelete` (villa_prices'ın kendi mantığı), `villa.repository.server.ts` içindeki mevcut price metodları, `replace_villa_prices` RPC'si, `calculateCleaningFee`, `calculatePoolHeatingFee`, `isPoolHeatingActiveForRange` (imzaları/gövdeleri).

---

## Özet — uygulama sırası (öneri, uygulanmadı)

1. Migration: `villa_discounts` tablo + RLS + `replace_villa_discounts` RPC (additive).
2. `lib/price.engine.ts`: `getDailyDiscountFactor` + `applyDiscount` saf fonksiyonları + `calculateStayTotal`/`calculateGrandTotal`'a opsiyonel parametre — birim testleriyle "parametre yoksa byte-identical" garantisi kanıtlanır.
3. `price-verify.ts`'e server-authoritative indirim hesabı + `ReservationRow`'a snapshot kolonları.
4. Admin UI: `DiscountSection.tsx` — mevcut Fiyat canvas'ının yanına, `PricingRangeDrawer` deseni uyarlanarak.
5. Public gösterim (Madde 9) — ayrı, sonraki bir faz.

Her adımda hedef sabit: **indirim tanımlanmamış hiçbir villada, hiçbir hesaplamada, hiçbir yerde davranış bir bit bile değişmeyecek.**
