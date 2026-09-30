# Villa Fiyat Bölümü — Tarih Bazlı Gecelik İndirim Sistemi (Katman Modeli) — READ-ONLY Audit

**Kapsam:** Salt-okunur tespit raporu. Kod değiştirilmedi, migration oluşturulmadı, DB'ye yazılmadı, commit/push yapılmadı. Aşağıdaki analiz, sizin tarif ettiğiniz **"normal fiyat asla değişmez, indirim hesap anında üzerine uygulanan ayrı bir katmandır"** modeline göre yapılmıştır.

---

## 1. Mevcut fiyat hesaplama akışı

`lib/price.engine.ts` (saf, DB'den bağımsız fonksiyonlar) — zincir:

```
calculateNights(start, end)
  → check-in DAHİL, check-out HARİÇ

getDailyPrice(date, villa_prices[], currency, rates)
  → o GÜNE denk gelen villa_prices satırını bulur (start<=d<=end, kapalı interval)
  → bulamazsa 0 döner; bulursa convertPrice() ile hedef currency'ye çevirir

calculateStayTotal(start, end, villa_prices[], currency, rates)
  → current=start'tan (start dahil) endD'ye (checkout HARİÇ) kadar
    GÜN GÜN ilerler; her gün için getDailyPrice çağrılır ve toplanır

calculateCleaningFee(nights, cleaning_fee, cleaning_limit)
  → "Kısa Süreli Konaklama Ücreti" — nights < cleaning_limit ise TEK
    SEFERLİK cleaning_fee uygulanır; stay hesabından tamamen BAĞIMSIZ

calculatePoolHeatingFee / isPoolHeatingActiveForRange
  → nights × pool_heating_fee; stay hesabından tamamen BAĞIMSIZ

calculateGrandTotal({...})
  → nights, stay (=calculateStayTotal sonucu), cleaning, poolHeating hesaplanır
  → total = stay + cleaning + poolHeating
```

**15.06 → 22.06 rezervasyonu için "her gece nasıl fiyat buluyor" sorunuzun kesin cevabı:** `calculateStayTotal` içindeki `while (current < endD)` döngüsü — her iterasyonda `current` bir sonraki güne (`setDate(+1)`) ilerler ve o günün fiyatı `getDailyPrice(current, prices, ...)` ile **ayrı ayrı, günlük olarak** bulunup `stay` değişkenine eklenir. Yani "15.06→10.000, 16.06→10.000, ..." dediğiniz mantık **zaten birebir bu şekilde çalışıyor** — sistem şu an bile gecelik/günlük granülerlikte çalışıyor, haftalık/aylık toplu bir hesap yapmıyor.

`calculateGrandTotal`'ın dönüş şekli (`ReturnType<typeof calculateGrandTotal>`), `useBookingEngine.ts`'de `BookingResult` olarak public villa detay sayfasındaki rezervasyon widget'ının tek veri kaynağı; admin tarafında da (`PriceCard.tsx`, `PriceStep.tsx`, `LiveDatePriceSummary.tsx`, `computeReservationPriceRecalc.ts`) aynı fonksiyon kullanılıyor — **tek merkezi motor.**

---

## 2. İndirimin uygulanabileceği en güvenli nokta

**`getDailyPrice`'ın ürettiği günlük fiyatın hemen üzerinde, `calculateStayTotal`'ın döngüsü içinde — `villa_prices` satırına HİÇ dokunmadan.**

Gerekçe: `getDailyPrice` zaten "bu gün için hangi fiyat geçerli" sorusunu cevaplıyor (`found.price`). İndirim kontrolü, tam bu noktada, `found`'un normal fiyatını **okuma-sonrası bir dönüşüm** olarak ele alınabilir:

```
dailyBase = getDailyPrice(date, villa_prices, ...)     // DEĞİŞMEZ, mevcut fonksiyon
discount  = getDailyDiscount(date, villa_discounts)     // YENİ, ayrı, saf fonksiyon
dailyFinal = applyDiscount(dailyBase.original, discount) // YENİ, ayrı fonksiyon
```

Bu tasarımın güvenli olmasının nedeni: `getDailyPrice` fonksiyonunun kendisi **hiç değişmez** (imzası, davranışı, return şekli aynı kalır) — sadece `calculateStayTotal`'ın onu çağırdıktan SONRA sonucu isteğe bağlı olarak indirimden geçiren bir adım eklenir. `villa_discounts` parametresi verilmezse/boşsa, `applyDiscount` no-op olur → **mevcut tüm davranış byte-identical korunur** (pool heating'in migration 076'da izlediği "yeni opsiyonel parametre, default'ta eski davranış" deseniyle birebir aynı disiplin).

---

## 3. Gecelik/tarih bazlı indirimin mevcut yapıyla uyumu — simülasyon

**Senaryo (sizin verdiğiniz):** Normal fiyat 01.06-30.06 → 10.000 TL (tek dönem). İndirim 10.06-20.06 → %20. Konaklama 08.06 → 23.06 (checkout 23.06 hariç → geceler: 08,09,...,22 = 15 gece).

`calculateStayTotal` döngüsü mevcut kodla **hiçbir değişiklik olmadan** her gece için `getDailyPrice` çağırır; ben buna paralel olarak indirim aralığını (10.06-20.06, villa_prices ile AYNI "kapalı interval, ikisi de dahil" mantığıyla) her gece için kontrol edip simüle ettim:

| Gece | villa_prices sonucu | 10.06-20.06 aralığına denk mi? | İndirimli sonuç |
|---|---|---|---|
| 08.06 | 10.000 | Hayır | 10.000 |
| 09.06 | 10.000 | Hayır | 10.000 |
| 10.06 | 10.000 | **Evet** | 8.000 |
| 11-19.06 | 10.000 | Evet | 8.000 |
| 20.06 | 10.000 | Evet (bitiş DAHİL varsayımıyla) | 8.000 |
| 21.06 | 10.000 | Hayır | 10.000 |
| 22.06 | 10.000 | Hayır | 10.000 |

**⚠️ KRİTİK TESPİT — sizin kendi örneklerinizde bir tutarsızlık var:** Madde 3'teki örneğinizde siz `20.06 → 10.000` (yani indirim bitiş günü NORMAL fiyata dönmüş) yazmışsınız — bu, indirim aralığının **bitiş tarihinin HARİÇ** tutulduğu anlamına gelir. Ama Madde 4'teki örneğinizde `16-20 Haziran: 12.000 → 9.600` yazmışsınız — yani **20.06 indirimli**, bitiş tarihi DAHİL. Bu iki örnek birbiriyle çelişiyor. Bu, uygulamaya geçmeden önce **kesinleştirilmesi gereken tek bir karar noktası**: indirim aralığının bitiş tarihi dahil mi hariç mi?

Benim önerim (Madde 14'te gerekçesiyle birlikte): **villa_prices ile birebir aynı mantık — bitiş tarihi DAHİL** (kapalı interval). Bu hem sistemdeki mevcut tek emsal davranışla tutarlı olur hem de Madde 4'teki örneğinizle (20.06 indirimli) uyuşur. Ama son karar sizin — implementasyon öncesi bu netleşmeli, aksi halde hangi varsayımla gidilirse gidilsin bir tarafta "beklenmedik" bir gece ortaya çıkar.

**Sonuç:** Teknik olarak **tamamen güvenli şekilde yapılabilir** — `calculateStayTotal`'ın zaten gün-gün çalışan döngüsü, ek bir mimari değişiklik gerektirmeden bu granülerliği destekliyor.

---

## 4. Farklı fiyat dönemleriyle çalışma — simülasyon

**Senaryo:** 01.06-15.06 → 10.000 TL, 16.06-30.06 → 12.000 TL. İndirim 10.06-20.06 → %20. Konaklama 08.06 → 23.06 (geceler: 08...22).

| Gece aralığı | villa_prices'tan gelen taban | İndirim uygulanır mı | Sonuç |
|---|---|---|---|
| 08-09.06 | 10.000 (01-15 dönemi) | Hayır | 10.000 |
| 10-15.06 | 10.000 (01-15 dönemi) | Evet | **8.000** |
| 16-20.06 | 12.000 (16-30 dönemi) | Evet | **9.600** |
| 21-22.06 | 12.000 (16-30 dönemi) | Hayır | 12.000 |

Bu tam olarak sizin Madde 4'te beklediğiniz sonuçla birebir örtüşüyor. Neden çalışır: `getDailyPrice` her gece için **kendi fiyat dönemini bağımsız olarak buluyor** (`found.price`); indirim kontrolü bu bulunmuş değerin üzerine, hangi fiyat döneminden geldiğinden tamamen habersiz şekilde uygulanıyor. Yani **fiyat dönemi ile indirim dönemi birbirinden habersiz iki ayrı sorgu** — kesişimleri otomatik ve doğru şekilde gün-gün çözülüyor, ekstra bir "hangi fiyat + hangi indirim eşleşiyor" mantığı yazmaya gerek yok.

---

## 5. `villa_prices` kayıtlarına dokunmadan yapılabilirlik

**Evet, mevcut mimariye en güvenli yaklaşım tam olarak budur ve zaten sistemin kendi felsefesiyle örtüşüyor:**

- `villa_prices` yazma yolu tek bir noktadan geçiyor: `replace_villa_prices(p_villa_id, p_prices jsonb)` RPC'si — admin "Fiyatlar" ekranında kaydet dediğinde bu RPC villa'nın TÜM `villa_prices` satırlarını silip yeniden yazıyor (`DELETE ... WHERE villa_id=` + toplu `INSERT`). İndirim sistemi bu akışa **hiç dahil olmamalı** — ayrı bir tablo + ayrı bir RPC (`replace_villa_discounts`) kullanılırsa, `villa_prices`'ın "10.000 TL" kaydı fiziksel olarak asla değişmez, silinmez, üzerine yazılmaz.
- Hesaplama tarafında da aynı ilke geçerli: `getDailyPrice` fonksiyonunun kendisi **indirimden habersiz** kalmalı (imzası/davranışı değişmemeli); indirim, `getDailyPrice`'ın döndürdüğü değerin üzerinde, çağıran taraftaki (`calculateStayTotal`) yeni bir adımda uygulanmalı. Bu sayede "indirim aktif değilse otomatik olarak eski fiyat geçerli" davranışı **hiçbir ekstra kod gerektirmeden, doğal olarak** sağlanır — çünkü zaten `villa_discounts` boşsa/uygun tarih yoksa hesaplanan taban fiyattan farksız kalır.
- Bu yaklaşımın DB tarafındaki emsali: sistemde zaten `cleaning_fee`/`pool_heating_fee` gibi villa-level alanlar `villa_prices`'tan bağımsız ayrı kolonlarda tutulup hesap anında birleştiriliyor — indirim de kavramsal olarak aynı "ayrı veri, hesap anında birleşim" ailesine ait.

---

## 6. Önerilen `villa_discounts` veri yapısı

`villa_prices` ile birebir paralel, **ayrı tablo**:

```
villa_discounts (
  id uuid PK,
  villa_id uuid FK → villa(id) ON DELETE CASCADE,
  start_date date NOT NULL,     -- villa_prices ile AYNI semantik (bkz. Madde 14)
  end_date   date NOT NULL,
  discount_type  text NOT NULL,  -- 'percent' | 'fixed' (Madde 7)
  discount_value numeric NOT NULL,
  currency text,                 -- yalnız 'fixed' tipte anlamlı (Madde 8)
  created_at timestamptz DEFAULT now()
)
```

Gerekçe villa_prices'a kolon eklemeye karşı: bir villa_prices satırına yalnız 1 indirim sığar — sizin Madde 6'da tarif ettiğiniz "aynı villada birden fazla, farklı tarihli indirim" (01-10 Haz %10, 15-25 Haz %20, 01-15 Tem %15) senaryosu villa_prices'ın kendisinin zaten çözdüğü "1 villa → çok satır" ilişkisiyle birebir aynı şekli gerektiriyor; bu yüzden **ayrı tablo doğru cevap**, villa_prices'a kolon eklemek çok-satırlı indirimi desteklemez ve fiyat/indirim yaşam döngülerini (birbirinden bağımsız eklenip silinebilmeleri gerekiyor) yapay olarak birbirine bağlar.

**Yazma yolu (öneri):** `villa_prices`'ın izlediği desenin birebir klonu — `replace_villa_discounts(p_villa_id uuid, p_discounts jsonb)` RPC + `pg_advisory_xact_lock(hashtext('villa_discounts:'||villa_id))` (migration 002'deki `replace_villa_prices` fonksiyonunun yapısal ikizi).

**RLS:** `villa_prices` gibi public SELECT açık olmalı (public tarafta indirimli fiyat hesaplanabilsin diye); yazma yalnız admin/service-role.

---

## 7. % ve sabit gecelik indirim desteği

| | Formül | Price engine'e oturma |
|---|---|---|
| **Yüzde (A)** | `dailyFinal = dailyBase × (1 - value/100)` | Currency-agnostic — hangi para biriminde olursa olsun aynı oranı uygular, `getDailyPrice`'ın zaten döndürdüğü `original` (henüz convert edilmemiş) değere doğrudan uygulanabilir. |
| **Sabit gecelik (B)** | `dailyFinal = max(dailyBase - value, 0)` | Currency EŞLEŞMESİ gerektirir (Madde 8) + **0'ın altına düşmeme guard'ı şart** (indirim, gecelik fiyattan büyükse negatif fiyat oluşmasın diye — `calculatePoolHeatingFee`'nin `nights<=0 → 0` guard disipliniyle aynı aile). |

**İkisini birden desteklemek ileride sorun yaratır mı?** Teknik olarak hayır — `discount_type` alanı zaten şemada bir `switch`/if-else ile ayrışıyor, iki path birbirini etkilemiyor. Ama **şimdiden ikisini birden implemente etmek**, ilk sürüm için gereksiz karmaşıklık + gereksiz test yüzeyi demek (özellikle sabit tutarın currency riski, madde 8). Öneri: şema `discount_type` kolonunu baştan `'percent'|'fixed'` olarak tutsun (gelecekte migration'sız genişleyebilsin) ama **ilk implementasyon yalnız `'percent'` path'ini çalıştırsın** — sizin verdiğiniz örneklerin tamamı zaten yüzde üzerinden.

---

## 8. Currency riskleri

- Yüzde indirim **tamamen currency-agnostic** — `dailyBase × 0.8` işlemi hangi para biriminde olursa olsun (TRY/EUR/GBP) aynı şekilde doğru çalışır, ek bir dönüşüm/eşleştirme gerektirmez. **En düşük riskli seçenek bu.**
- Sabit gecelik indirimde risk gerçek: `villa_prices` **her satırın kendi `currency` kolonu var** (villa-level tek bir "currency" alanı sadece admin formunda "yeni satır eklerken varsayılan değer" olarak kullanılıyor — `PricingCalendarCanvas.tsx`'te `villa?.currency` sadece drawer'ın ön-doldurma varsayılanı, DB'de satır satır farklı currency teorik olarak mümkün). Eğer indirim "2.000 TL/gece" gibi sabit bir değerse ve o gece için geçerli `villa_prices` satırı **EUR** ise, 2.000 TL'yi doğrudan EUR'dan düşmek yanlış olur — ya kur çevrimi (convertPrice, cleaning/poolHeating'in izlediği yöntem) ya da **indirimin currency'sinin o günün villa_prices satırının currency'siyle eşleşmesi zorunluluğu** gerekir.
- Risk raporu (karar verilmiyor): Sabit tutar indirim eklenecekse en güvenli yol, indirimin kendi `currency` alanını taşıması VE hesap anında `convertPrice(discountValue, discount.currency, dailyBase.original_currency, rates)` ile aynı para birimine çevrildikten SONRA çıkarma işleminin yapılması — cleaning_fee/pool_heating_fee'nin zaten izlediği "raw hesap kendi currency'sinde, convert en sonda" deseniyle birebir aynı.

---

## 9. Kısa süreli konaklama ücreti ile sıralama — kesin tespit

Sorduğunuz "önce indirimli gecelik toplam mı hesaplanıyor, sonra mı kısa süreli ücret hesaplanıyor" sorusunun **kesin cevabı: HAYIR, ikisi birbirine bağımlı DEĞİL, paralel/bağımsız iki hesap.**

`calculateGrandTotal` içindeki gerçek sıra:
```
1. nights = calculateNights(start, end)                         // yalnız tarihten
2. stayResult = calculateStayTotal(start, end, prices, ...)     // yalnız villa_prices'tan
3. rawCleaning = calculateCleaningFee(nights, cleaning_fee, cleaning_limit)
                 // yalnız `nights` VE villa'nın cleaning_fee/cleaning_limit
                 // alanlarından — stayResult'a HİÇ bakmıyor, HİÇ bağımlı değil
4. total = stay + cleaning + poolHeating
```

`calculateCleaningFee`'nin imzasına bakıldığında (`nights, cleaning_fee, cleaning_limit`) **`stay`/`prices` parametresi hiç almıyor** — yani indirim ister uygulansın ister uygulanmasın, kısa süreli konaklama ücreti eşiği (`nights < cleaning_limit`) ve tutarı (`cleaning_fee`, sabit) **hiçbir şekilde etkilenmiyor, etkilenemiyor**. İndirim `stay` içinde (`calculateStayTotal`'ın döngüsünde) uygulanırsa, `cleaning` bu değişiklikten **yapısal olarak izoledir** — ek bir önlem almaya gerek kalmadan.

---

## 10. Havuz ısıtma ile etkileşim — kesin tespit

Aynı izolasyon `poolHeating` için de geçerli: `calculatePoolHeatingFee(nights, pool_heating_fee, selected)` → yalnız `nights × pool_heating_fee` (villa'nın kendi sabit gecelik ısıtma ücreti); `stay`/`villa_prices`'a hiç bakmıyor. `isPoolHeatingActiveForRange` de yalnız tarih aralığını villa'nın `pool_heating_months` kısıtına karşı kontrol ediyor, fiyatla ilgisi yok.

**Evet, indirim yalnız `getDailyPrice`/`calculateStayTotal` seviyesinde (yani yalnız `stay` hesabında) uygulanırsa, havuz ısıtma bundan otomatik olarak ve hiçbir ek kod gerekmeden bağımsız kalır** — çünkü `calculatePoolHeatingFee` zaten `stay`'in sonucunu hiç parametre olarak almıyor.

---

## 11. Rezervasyon snapshot'a dahil edilmesi

**Mevcut snapshot mekanizması — kesin tespit:** Rezervasyon oluşurken hesaplanan `total_price_try`, `original_price`, `original_currency` gibi alanlar `reservations` tablosuna **donmuş (frozen) değer** olarak yazılıyor; sonrasında villa_prices değişse bile bu satırlar **otomatik olarak güncellenmiyor**. Var olan bir rezervasyon yalnız admin panelinde **tarih veya villa değiştirildiğinde** (`computeReservationPriceRecalc.ts` → `hasDateChanged || hasVillaChanged`) yeniden hesaplanıyor; aksi halde DB'deki snapshot alanları aynen gösteriliyor. Havuz ısıtma bu deseni migration 075/076'da 4 ayrı snapshot kolonuyla (`pool_heating_selected`, `original_pool_heating_total`, `original_pool_heating_currency`, `pool_heating_total_try`) uyguladı.

**Sizin örneğiniz (70.000 → %20 indirim → 56.000, admin sonra indirimi silerse eski rezervasyon 56.000 kalmalı) için gereken:** İndirim tutarı da **aynı şekilde donmuş kolonlara yazılmalı**, canlı `villa_discounts` sorgusuna asla bağımlı kalmamalı. Önerilen (pool heating'in 4-kolonlu desenine paralel, yalnız analiz — migration önerisi değil):

```
discount_applied boolean              -- indirim uygulandı mı (havuz ısıtmanın "selected" karşılığı)
original_discount_total  numeric      -- indirim TUTARI, orijinal fiyat currency'sinde (donmuş)
original_discount_currency text
discount_total_try numeric            -- TRY snapshot
```

Bu 4 kolon, `calculateGrandTotal` her çalıştığında (yalnız oluşturma anında VE explicit recalc'te) o anki `villa_discounts` durumuna göre hesaplanıp rezervasyon satırına yazılır; sonrasında admin indirimi değiştirse/silse bile bu satırlar **fiziksel olarak dokunulmadığı için** eski rezervasyonun tutarı asla değişmez — tam olarak istediğiniz garanti.

**⚠️ Ayrıca kritik güvenlik notu (mevcut sistemin bir açığı, indirim eklenirse daha da önemli hale gelir):** `price-verify.ts` incelemesi gösterdi ki public rezervasyon oluşturmada `total_price_try` vb. alanlar şu an **client'tan geliyor**; sunucu yalnız LOG/COMPARE modunda karşılaştırıyor, uyuşmazlıkta booking'i **reddetmiyor** (istisna: havuz ısıtma — o server-authoritative). İndirim eklenirse, kötü niyetli bir client sahte "%80 indirim uygulandı" tutarı gönderebilir; bu yüzden indirim tutarının da **havuz ısıtmanın izlediği server-authoritative desen** ile (sunucu villanın gerçek `villa_discounts` kaydından bağımsız olarak yeniden hesaplayıp client değerini override etmesi) hesaplanması güvenlik açısından şart, opsiyonel değil.

---

## 12. Public fiyat gösterimi — etkilenebilecek noktalar (yalnız tespit)

- **Villa detay sayfası** — `useBookingEngine.ts` (merkezi hook, tarih seçiliyken) + `PriceList.tsx` ("Sezon Fiyatları" tablosu — kendi doc-comment'inde bilinçli olarak `calculateGrandTotal`'dan ayrık tutulmuş, ham `villa_prices` listeliyor; indirim eklenirse bu tablo "üstü çizili/indirimli" gösterip göstermeyeceği ayrı bir ürün kararı).
- **Villa kartı** — `VillaCard.tsx` (tarihsiz `getStartingPrice()` fallback'i + tarihli aramada `calculateGrandTotal`).
- **Arama sonuçları** — `app/(public)/arama/page.tsx`.
- **Rezervasyon özeti** — `BookingSidebar.tsx`, `ReservationForm.tsx`, `BookingSummary.tsx`, `VillaCardBookingModal.tsx`.
- **Paylaşılan liste (share/token)** — `app/(public)/liste/[token]/page.tsx`.
- **Kısa süreli tarihler sayfası** — `app/(public)/kisa-sureli-tarihler/[ay]/[gece]/page.tsx`.
- **Admin taraf** — `PriceCard.tsx`, `PriceStep.tsx`, `LiveDatePriceSummary.tsx`, `villa-listesi` sayfası.
- ⚠️ **İsim çakışması uyarısı:** Var olan `discount_collections` (`lib/db/discount.repository.ts`) gerçek bir fiyat indirimi DEĞİL, anasayfada elle küratörlüğü yapılan "öne çıkan villalar" koleksiyonu — hiçbir gerçek fiyat hesabı yapmıyor. Yeni özellikle terminoloji çakışması admin kafa karışıklığına yol açabilir.

Hiçbiri bu turda değiştirilmedi.

---

## 13. Admin Fiyat bölümüne nasıl oturur

Mevcut "Fiyat" bölümü `PricingCalendarCanvas.tsx` (496 satır) — görsel takvim + `PricingRangeDrawer.tsx` modal (tarih aralığı seç → fiyat/currency gir → kaydet). Kendi doc-comment'i **"mevcut tasarım bozulmasın"** ilkesini defalarca vurguluyor.

Sizin önerdiğiniz "Fiyatlar / İndirimler" iki ayrı bölüm modeli, mevcut mimariyle **doğrudan uyumlu** çünkü:
- `pricing-calendar/` klasöründeki paylaşılan yardımcılar (`date-math.ts`, `range-math.ts`'in overlap/split mantığı, `range-predicate.ts`) indirim UI'ı için de **yeniden kullanılabilir** — aynı "aralık seç, düzenle, sil" etkileşim dilini indirim tarafında tekrar yazmaya gerek kalmaz.
- Yeni bölüm, mevcut `PricingCalendarCanvas`'a **hiç dokunmadan**, yanına paralel yeni bir component olarak eklenebilir (örn. `DiscountCalendarCanvas.tsx` veya daha basit bir liste/tablo UI — takvim görselleştirmesi indirim için şart değil, sizin örneğinizdeki "Tarih] [Tarih] [%/Sabit] [Değer]" satır listesi daha sade bir başlangıç olabilir).
- CREATE mode (villa henüz kaydedilmemişken) / EDIT mode (villaId var) ayrımı `PricingCalendarCanvasProps`'ta zaten var — aynı pattern indirim component'i için de uygulanabilir.

---

## 14. Tarih sınırları — kesin tespit + indirime nasıl taşınmalı

| Bağlam | Başlangıç | Bitiş | Kaynak |
|---|---|---|---|
| **`villa_prices` bir güne denk geliyor mu** | dahil | **dahil** (kapalı interval) | `getDailyPrice`: `d >= s && d <= e`; `pricing-calendar.ts` tip yorumu: "kapalı interval" |
| **Rezervasyon gece sayısı** | check-in dahil | check-out **HARİÇ** | `calculateNights`, `calculateStayTotal`: `while (current < endD)` |
| **Havuz ısıtma ay kısıtı gece taraması** | check-in dahil | check-out **HARİÇ** | `isPoolHeatingActiveForRange` doc-comment: "check-in DAHİL, check-out HARİÇ" |

**Check-out gecesi dahil mi?** Hayır — check-out günü hiçbir yerde "gece" sayılmıyor (standart otel mantığı, sistemde tutarlı).

**İndirim hangi mantığı izlemeli?** İndirim kavramsal olarak `villa_prices` ile aynı aileden (ikisi de "bu TARİH için hangi kural geçerli" sorusu, rezervasyon gecesi değil) — bu yüzden **indirimin start_date/end_date'i villa_prices ile BİREBİR aynı semantikte olmalı: ikisi de dahil.** Madde 3'te tespit ettiğim gibi, sizin kendi örnekleriniz bu noktada birbiriyle çelişiyor (Madde 3'te bitiş hariç davranmış, Madde 4'te dahil davranmış) — **implementasyon öncesi netleştirilmesi gereken tek somut karar bu.**

**Off-by-one hatasının önlenmesi için öneri:** `getDailyDiscount(date, discounts)` fonksiyonu, `getDailyPrice`'ın `d >= s && d <= e` karşılaştırmasının **aynısını, aynı `parseLocalDate` fonksiyonuyla** kullanmalı (yeni/farklı bir tarih parse mantığı YAZILMAMALI — `parseLocalDate` zaten UTC drift'ine karşı kanıtlanmış tek kaynak). İki fonksiyon farklı karşılaştırma operatörü (`<=` vs `<`) kullanırsa, iki farklı geliştirici farklı varsayımla ilerlerse veya UI'da "bitiş tarihi" farklı yorumlanırsa off-by-one riski doğar — tek çözüm, tarih karşılaştırma mantığının **tek bir yerden** (`date-math.ts`/`price.engine.ts`) gelmesi ve ikisinin de aynı semantiği paylaşması.

---

## 15. Çakışan indirimler — davranış önerisi (karar verilmiyor)

**Senaryo:** 10.06-20.06 → %20 ve 15.06-25.06 → %10 aynı villada, örtüşen tarihlerle.

Mevcut mimaride bunun doğrudan bir emsali yok çünkü `villa_prices` çakışmayı **yapısal olarak imkansız** kılıyor (`applyRangeUpsert` yeni aralığı eklerken eskiyi otomatik bölüyor/kesiyor). İndirim için üç seçenek, güvenlik sırasına göre:

1. **Çakışmayı engellemek (önerilir, en güvenli):** `villa_prices`'ın UI seviyesinde zaten yaptığı gibi, admin ikinci bir çakışan indirim eklemeye çalıştığında ya otomatik böl/kes (aynı `range-math.ts > applyRangeUpsert` mantığı yeniden kullanılabilir) ya da hata verip engelle. Belirsizlik hiç oluşmaz, hesaplama tarafında ek bir "hangi indirim kazanır" mantığı yazmaya gerek kalmaz.
2. **DB seviyesinde engellemek:** `EXCLUDE` constraint (`daterange` + `gist`) — sistemde zaten `reservations_no_overlap` (migration 001) aynı tekniği kullanıyor, kanıtlanmış bir emsal var.
3. **Öncelik/kural tanımlamak (en riskli, önerilmez ilk sürüm için):** "en yüksek indirim kazanır" veya "en son eklenen kazanır" gibi bir kural — hem admin için tahmin edilmesi zor bir davranış hem de test yüzeyi büyük; sizin de "şimdilik karar verme" dediğiniz gibi bu, ilk implementasyonun kapsamı dışında tutulmalı.

**Öneri:** İlk sürüm için (1) — çakışmayı UI/DB seviyesinde engellemek — hem en az sürpriz yaratan hem de mevcut `villa_prices` felsefesiyle en tutarlı seçenek.

---

## Değişmesi gerekecek dosyalar (yalnız tespit)

**Çekirdek motor:** `lib/price.engine.ts` (yeni `getDailyDiscount`/`applyDiscount` saf fonksiyonları + `calculateStayTotal`/`calculateGrandTotal`'a opsiyonel parametre), `lib/villa-row.types.ts` (yeni `DiscountRange` tipi).

**DB/repository:** Yeni migration (tablo + RLS + `replace_villa_discounts` RPC), `lib/db/villa.repository.server.ts` (yeni metodlar, mevcutlar dokunulmadan), yeni/genişletilmiş `villa-discount.service.ts`, `lib/cache.helpers.ts` (yeni cache anahtarı).

**Admin UI:** `PricingCalendarCanvas.tsx`'in yanına paralel yeni bir component; `pricing-calendar/_helpers/` içindeki paylaşılan yardımcılar yeniden kullanılabilir.

**Rezervasyon snapshot:** `types/database.ts > ReservationRow` (yeni 4 kolon, Madde 11), `app/services/reservation/_helpers/price-verify.ts` (server-authoritative indirim hesabı — pool heating deseni), `buildPublicReservationPayload.ts`, admin tarafında `computeReservationPriceRecalc.ts`, `buildCreateCustomPricePayload.ts`, `computeCustomPriceToggle.ts`.

**Public gösterim (ileride, Madde 12'de listelenenler):** `useBookingEngine.ts`, `PriceList.tsx`, `VillaCard.tsx`, `BookingSidebar.tsx`, `ReservationForm.tsx`, `BookingSummary.tsx`.

**Test:** `tests/unit/price-engine.test.ts` — yeni `describe` bloğu, mevcut testler dokunulmadan.

---

## En küçük ve en güvenli implementasyon planı (öneri, uygulanmadı)

1. **Additive migration** — yeni `villa_discounts` tablosu + `replace_villa_discounts` RPC + public RLS SELECT. `villa_prices`/`reservations` şemasına sıfır dokunuş.
2. **Saf fonksiyon, izole** — `lib/price.engine.ts`'e yalnız yeni fonksiyon(lar); mevcut `getDailyPrice`/`calculateStayTotal`/`calculateGrandTotal` imzaları opsiyonel parametre ile genişler, parametre verilmezse davranış byte-identical.
3. **Tarih semantiği netleştirilir** — Madde 3/14'teki çelişki (bitiş dahil mi hariç mi) implementasyon öncesi karara bağlanır; `villa_prices` ile aynı "ikisi de dahil" önerilir.
4. **Çakışma engellenir** — Madde 15'teki (1) numaralı seçenek, ilk sürüm kapsamı.
5. **Server-authoritative snapshot** — indirim tutarı, pool heating'in `computeAuthoritativePoolHeatingSnapshot` desenini izleyerek sunucuda hesaplanıp donmuş snapshot kolonlarına yazılır; client değerine güvenilmez.
6. **Admin UI en son** — motor + DB + snapshot güvenliği birim testleriyle kanıtlandıktan sonra, mevcut `PricingCalendarCanvas`'a dokunmadan yanına yeni bölüm eklenir.
7. Her adımda hedef: indirim tanımlanmamış villalarda sistem **tamamen mevcut haliyle** davranır (migration 076'nın `pool_heating_months=NULL` için yaptığı gibi — yeni özellik "tanımsız" durumda görünmez/etkisiz).

---

## Riskler / Edge-case'ler

- **🔴 Tarih sınırı çelişkisi (Madde 3 vs Madde 4):** Sizin kendi örnekleriniz indirimin bitiş tarihinin dahil mi hariç mi olduğu konusunda birbiriyle çelişiyor — implementasyon öncesi netleştirilmeli, aksi halde off-by-one hatası kaçınılmaz.
- **Negatif/sıfır fiyat riski:** Sabit gecelik indirim (Madde 7-B), gecelik fiyattan büyükse negatif toplam üretebilir — `max(..., 0)` guard'ı şart.
- **Currency uyuşmazlığı:** Sabit tutar indirimde, indirimin currency'si ile o günün villa_prices satırının currency'si farklıysa (Madde 8) yanlış tutar düşülür; yüzde indirim bu riski taşımaz.
- **Client-trust açığı:** Public booking'de finansal alanlar şu an yalnız log/compare ile doğrulanıyor, enforce edilmiyor (havuz ısıtma istisna) — indirim eklenirse aynı server-authoritative disiplin **şart**.
- **Çakışan indirimler:** Madde 15'te detaylandı — engellenmezse davranış tanımsız kalır.
- **"İndirimli Koleksiyon" isim çakışması:** Var olan `discount_collections` gerçek bir fiyat indirimi değil; admin tarafında terminoloji netleştirilmeli.
- **Fiyat dönemi/indirim dönemi hizasızlığı optimizasyon riski:** Şu an gün-gün döngü (`while`) ile çalışıyor; ileride performans için "toplu/SQL aralık kesişimi" optimizasyonu yapılırsa, bu optimizasyonun gün-gün referans davranışla birebir eşleştiği testlerle kanıtlanmalı — aksi halde sessiz bir davranış farkı (silent regression) riski oluşur.
