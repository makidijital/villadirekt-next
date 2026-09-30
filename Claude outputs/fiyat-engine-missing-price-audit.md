# Fiyat Motoru — Eksik Sezon Fiyatı Derin Denetimi

**Tarih:** 2026-09-20 · **Kapsam:** `lib/price.engine.ts` ve onu besleyen/tüketen tüm yollar
**Yöntem:** Statik kod analizi **+ gerçek motorun çalıştırılması.** `lib/price.engine.ts` saf bir modül olduğu için repo **dışında**, salt-okunur bir harness'ta (esbuild ile repo'nun kendi `tsconfig` alias'ları kullanılarak) derlenip koşturuldu. Aşağıdaki tüm sayılar **gerçek üretim kodunun çıktısıdır**, tahmin değildir. Harness repo dışındaydı ve denetim sonunda silindi.
**Erişim sınırı:** Production veritabanına erişim YOK — `villa_prices` tablosunda fiilen boşluk olup olmadığı **bilinemez**. "Kod buna izin veriyor mu" ile "şu an oluyor mu" ayrımı korunmuştur.
**Değişiklik:** Hiçbir kaynak/test/migration dosyası değiştirilmedi, DB'ye yazılmadı, commit/push yapılmadı.

---

## 1. Executive Summary

1. **İddia DOĞRULANDI — ve tek değil, iki ayrı hata var.** Bir konaklama aralığındaki bazı geceler `villa_prices` ile kapsanmıyorsa o geceler **0 TL** sayılır. Hiçbir gece kapsanmıyorsa toplam **tek gecelik** fiyata eşitlenir (gece sayısıyla çarpılmaz).
2. Ölçülen: 7 gecelik konaklamada 1 gece eksikse **70.000 → 60.000**; yalnız 1 gece kapsanıyorsa **70.000 → 10.000**; hiç kapsanmıyorsa **10.000**; `prices=[]` ise **0 TL**.
3. **Sunucu bunu yakalamıyor.** `price-verify.ts` bağımsız bir kontrol değil, **aynı motorun ikinci kez çalıştırılmasıdır**. İki taraf da aynı yanlış sayıyı üretir, `comparison.match === true` olur ve sunucu bu tutarı `authoritative` olarak DB'ye **yazar**.
4. Rezervasyon oluşturmadan önce `total_price_try > 0` kontrolü, minimum tutar kontrolü veya "her gecenin fiyatı var mı" kontrolü **kod tabanının hiçbir yerinde yoktur**.
5. **Daha da kötüsü:** `getVillaPrices` bir DB hatasında `throw` etmeyip `[]` döner. Bu durumda sunucu, client'ın **doğru** hesapladığı tutarı **stay=0** ile ezer → konaklama bedeli tamamen sıfır bir rezervasyon.
6. Fiyatlandırılmamış bir gece rezervasyon takviminde **seçilebilir** — `disabled` kriterleri arasında fiyat kapsaması yok.
7. Boşluk oluşması mümkün: kayıt yolu tam **replace-all**, admin'de tek gün silmek o günle kesişen **tüm sezonu** siler, `villa_prices` üzerinde (indirim tablosunun aksine) **hiçbir DB constraint'i tanımlı değil**.
8. `nights = 0` (aynı gün giriş/çıkış) ve `nights = NaN` (bozuk tarih) durumlarında da fallback tetikleniyor → **10.000 TL** üretiyor.
9. **Test kapsamı sıfır:** kısmi kapsamayı assert eden tek bir test yok; üstelik `price-engine.test.ts:186` tek-gecelik fallback'i **doğru davranış olarak kilitliyor**.
10. **Sonuç:** Bu bir "potansiyel risk" değil, **kesin kod hatası**. Üretimde tetiklenip tetiklenmediği yalnızca `villa_prices` verisine bağlıdır ve DB erişimi olmadan bilinemez.

---

## 2. Gerçek fiyat hesaplama akışı

```
villa_prices (DB)
  └─ villa.repository.server.ts    findVillaPrices / findSearchResults embed
      └─ villa-price.service.ts    getVillaPrices()   ← HATA'da [] döner, throw ETMEZ
          └─ price.engine.ts
               calculateGrandTotal({start,end,prices,currency,rates,cleaning_*,pool_*,discounts?})
                 ├─ calculateNights(start,end)                    → Math.ceil(ms/86400000)
                 └─ calculateStayTotal(...)
                      while (current < endD):
                        ├─ getDailyPrice(gece, prices, ...)       → EŞLEŞME YOKSA {0,0,"TRY"}   ⚠️
                        ├─ getActiveDiscount(gece, discounts)
                        └─ applyDiscountToDailyPrice(...)         → stay += converted
                      if (stay===0 && !hadMatchingPrice && prices.length)
                        return prices[0] fiyatı  ×1  (nights ile ÇARPILMAZ)                      ⚠️
  └─ tüketiciler (HEPSİ AYNI MOTOR):
       /arama          → VillaCard (client)
       villa detay     → useBookingEngine → BookingSidebar (client)
       /rezervasyon    → ReservationForm (client)
       SUNUCU          → price-verify.ts → recomputePublicReservationPrice   ← AYNI MOTOR
       admin rezervasyon → ekle/page.tsx, computeReservationPriceRecalc      ← AYNI MOTOR
  └─ POST /api/public/reservations
       route.ts:109  if (verification.authoritative) { body.total_price_try = ... }
       create.service.ts:73-86  (5 validasyon — hiçbiri fiyata bakmaz)
       → INSERT
```

`lib/price.engine.ts` dosyasında `import "server-only"` **yok** → tek dosya hem tarayıcıda hem sunucuda bundle'lanıyor. Bu, "sunucu doğrulaması" katmanını motordaki hatalara karşı **tautolojik** kılıyor.

---

## 3. Kritik bulgular

### 🔴 B1 — Kapsanmayan gece toplama 0 TL olarak ekleniyor
- **Severity:** CRITICAL · **Güven:** CONFIRMED (çalıştırılarak ölçüldü)
- **Dosya:** `lib/price.engine.ts:118-126` (`getDailyPrice`), `:351-353` + `:370` (`calculateStayTotal`)
```ts
  if (!found) {
    return { converted: 0, original: 0, original_currency: "TRY" };
  }
```
```ts
      if (daily.original > 0) { hadMatchingPrice = true; }
      ...
      stay += finalDaily.converted;          // 0 eklenir, uyarı YOK
```
- **Gerçek davranış:** 08–15 Ekim (7 gece), gecelik 10.000 TL, 12 Ekim'in fiyat satırı yok → **stay = 60.000**. Kapsanmayan gece bedava.
- **Production etkisi:** Villa 7 gece yerine 6 gece ücretine satılır. Komisyon da bu düşük tutardan snapshot'lanır (`create.service.ts:114-117`). Fark hiçbir yere loglanmaz.

### 🔴 B2 — Hiç eşleşme yoksa toplam tek gecelik fiyata eşitleniyor
- **Severity:** CRITICAL · **Güven:** CONFIRMED (ölçüldü)
- **Dosya:** `lib/price.engine.ts:385-406`
```ts
  if (stay === 0 && !hadMatchingPrice && prices?.length) {
    const original = Number(prices[0].price || 0);
    return {
      stay: convertPrice(original, originalCurrency, currency, rates),  // × nights YOK
      original_stay: original,
      original_currency: originalCurrency,
    };
  }
```
- **Gerçek davranış:** 7 gecelik sezon-dışı aralık → **10.000 TL** (1 gece). 14 gecelik olsaydı yine 10.000.
- **Ek bulgu:** Bu dal `return` ettiği için **indirim katmanını da atlar** — %20 indirimli olması gereken senaryoda 8.000 yerine 10.000 üretir (ölçüldü: G3).
- **Production etkisi:** ~7–14× altında fiyat; rezervasyon `pending` olarak oluşur ve EXCLUDE constraint ile takvimi bloklar.

### 🔴 B3 — Sunucu doğrulaması aynı hatayı "authoritative" yapıyor; hiçbir guard yok
- **Severity:** CRITICAL · **Güven:** CONFIRMED
- **Dosya:** `app/services/reservation/_helpers/price-verify.ts` (aynı `@/lib/price.engine` import'u), `app/api/public/reservations/route.ts:109-136`, `app/services/reservation/create.service.ts:73-86`
- **Gerçek davranış:** Client düşük tutarı hesaplar → sunucu **aynı motorla** aynı düşük tutarı hesaplar → `comparison.match === true` → `"[price-verify] OK (client == server)"` loglanır → `route.ts:111` bu tutarı `body.total_price_try`'a yazar → `create.service.ts` fiyata bakmayan 5 validasyondan geçer → INSERT.
- **AÇIKÇA VAR OLMAYANLAR** (grep ile doğrulandı): `total_price_try > 0` kontrolü **yok**; "fiyat hesaplanamadı" dalı **yok**; minimum tutar / `nights × min` kontrolü **yok**; `hadMatchingPrice` motor dışına **hiç sızmıyor** (yalnız `price.engine.ts` içinde, export edilmiyor); `missingPrice|uncovered|priceMissing|fiyat bulunamadı` → **0 isabet**.
- **Production etkisi:** Mevcut mimari yalnızca **client manipülasyonuna** karşı korur; **veri boşluğuna** karşı sıfır koruma sağlar.

### 🔴 B4 — `villa_prices` okunamazsa sunucu DOĞRU fiyatı sıfırla eziyor
- **Severity:** CRITICAL · **Güven:** CONFIRMED
- **Dosya:** `app/services/villa-price.service.ts:23-30`
```ts
  if (error) {
    console.error("getVillaPrices:", error.message);
    return [];            // throw YOK
  }
```
- **Gerçek davranış:** `[]` döndüğü için `price-verify.ts`'teki `Promise.all` **başarılı** sayılır → `authoritative` **dolu** üretilir. `prices?.length` falsy olduğundan B2 fallback'i de çalışmaz → **stay = 0** (ölçüldü: D2). `route.ts:111` bunu client'ın doğru hesabının üzerine yazar.
- **Production etkisi:** Geçici bir DB/okuma hatası, konaklama bedeli **tamamen sıfır** bir rezervasyon üretir. B5'teki fail-open bu durumda koruma sağlamaz, çünkü recompute "başarılı" sayılmıştır.

### 🟠 B5 — `price-verify` fail-open
- **Severity:** HIGH · **Güven:** CONFIRMED · **Dosya:** `price-verify.ts:576-590`, caller guard `route.ts:109`
- Recompute throw ederse `{authoritative: null}` döner; `if (verification.authoritative)` bloğu hiç çalışmaz ve **client'ın gönderdiği ham finansal alanlar** aynen kaydedilir. Yalnız `console.error` iz bırakır (Sentry'ye gitmez).

### 🟠 B6 — Fiyatsız gece rezervasyon takviminde seçilebilir
- **Severity:** HIGH · **Güven:** CONFIRMED · **Dosya:** `app/components/villa/booking/BookingCalendar.tsx:251-256`
```tsx
        disabled={[
          { before: today },
          ...mergedBlockedDates,
          isIntersection,
        ]}
```
- Fiyat kapsaması **disabled kriteri değil**. Fiyatsız gün normal, tıklanabilir hücre olarak render edilir; yalnız fiyat etiketi sessizce gizlenir (`:328` `{!isBlocked && price && (...)}`). `useBookingEngine.ts:420-434` `getPriceForDate` `null` döner ama bu `null` hiçbir seçim engeline dönüşmez.
- **Production etkisi:** Kullanıcının hatalı kod yoluna ulaşmasının mekanizması tam olarak budur.

### 🟠 B7 — `nights = 0` ve `nights = NaN` de fallback tetikliyor
- **Severity:** HIGH · **Güven:** CONFIRMED (ölçüldü) · **Dosya:** `price.engine.ts:95-98` + `:385`
- Aynı gün giriş/çıkış → `nights = 0`, döngü hiç dönmez, `stay = 0`, `hadMatchingPrice = false` → fallback → **10.000 TL** (ölçüldü: I1). Bozuk tarih (`"abc"`) → `nights = NaN` → aynı sonuç (ölçüldü: I4).

### 🟠 B8 — Boşluk üretme mekanizmaları: replace-all + aşırı geniş silme + sıfır constraint
- **Severity:** HIGH · **Güven:** CONFIRMED (kod) / DB'de fiilen boşluk var mı: **UNKNOWN**
- `db/migrations/002_atomic_replace_helpers.sql:39-66` `replace_villa_prices` → villanın **tüm** satırlarını `DELETE` edip payload'ı yazar. Payload'da olmayan aralık kalıcı olarak silinir. RPC'de tek bir doğrulama yok.
- `app/components/admin/villa/pricing-calendar/_helpers/range-math.ts:89-97` `applyRangeDelete` → seçilen günle **kesişen aralığın tamamını** siler (kısmi bölme yok). Admin 15 Temmuz'u silerse 01.06–30.09 sezonunun tamamı düşer.
- `app/services/villa-admin/update.service.ts:129-132` → villa güncellemesi **her zaman** `setVillaPrices(id, prices ?? [])` çağırır; boş dizi tüm fiyatları siler.
- `app/(admin)/maki-admin/villas/_helpers/payload.ts:105` → `p.price > 0` filtresi, 0 girilen aralığı **sessizce düşürür**.

### 🟠 B9 — `villa_prices` üzerinde hiçbir DB constraint'i tanımlı değil (indirim tablosuyla asimetri)
- **Severity:** HIGH · **Güven:** CONFIRMED (repo) / DB'deki fiili durum **UNKNOWN**
- `db/migrations/` içinde `villa_prices` için **hiçbir** `CREATE TABLE`/`CONSTRAINT`/`INDEX` yok. Buna karşılık `villa_discounts` (migration 079) çakışmaya karşı `EXCLUDE USING gist (villa_id WITH =, daterange(start_date,end_date,'[]') WITH &&)` (`079:215-220`), `CHECK (start<=end)` (`:149`) ve `CHECK (value>0)` (`:153`) ile korunuyor. Migration 079'un kendi yorumu bunu itiraf ediyor (`:176-177`: *"villa_prices'ta ayrı bir aralık index'i yok"*).

### 🟡 B10 — "fiyat yok" ile "fiyat 0" ayırt edilemiyor
- **Severity:** MEDIUM · **Güven:** CONFIRMED (ölçüldü)
```
eşleşen satır YOK : {"converted":0,"original":0,"original_currency":"TRY"}
satır VAR, price=0: {"converted":0,"original":0,"original_currency":"TRY"}
→ AYNI MI? true
```
- `hadMatchingPrice` mantığı `daily.original > 0` koşuluna dayandığı için, **saklanmış bir 0 TL satırı** "fiyat yok" gibi davranır ve koruma fallback'ini yanlış tarafa düşürür. Drawer 0'ı reddeder (`PricingCalendarCanvas.tsx:336-339`) ama RPC/servis katmanı kabul eder.

### 🟡 B11 — Karışık para birimli konaklamada `original_stay` bozuk
- **Severity:** MEDIUM · **Güven:** CONFIRMED (ölçüldü: H4) · **Dosya:** `price.engine.ts:372-375`
- `original_stay` farklı currency'lerdeki gecelerin **ham toplamı**, `original_currency` ise **son gecenin** para birimidir (her iterasyonda üzerine yazılır). Bu değer `reservations.original_price` / `original_currency` olarak **DB'ye yazılıyor**.

### 🟡 B12 — Fiyat kaydında hiçbir cache invalidation yok
- **Severity:** MEDIUM · **Güven:** CONFIRMED · **Dosya:** `app/components/admin/villa/pricing.action.ts` (93 satırın tamamında `revalidate` **yok**)
- Karşıt kanıt: aynı ekranın indirim tarafı yapıyor (`DiscountsSection.tsx:230` `await revalidateDiscount()`). Admin bir boşluğu **kapattıktan sonra bile** public kart/liste 10 dakikaya kadar eski hâli servis eder.

### 🟡 B13 — DST'li sunucu saat diliminde `nights` sapması
- **Severity:** MEDIUM (koşullu) · **Güven:** CONFIRMED (ölçüldü) · **Dosya:** `price.engine.ts:95-98` (`Math.ceil` ham ms farkı üzerinde)
- Ölçüm (TZ=Europe/Berlin, 24→27 Ekim 2026 saat değişimi): `nights = 4` ama `calculateStayTotal` 3 gece dönüyor → **nights ile stay birbirini tutmuyor**. TZ=UTC ve TZ=Europe/Istanbul'da sapma **yok** (Türkiye 2016'dan beri DST kullanmıyor; Coolify container'ları genelde UTC — `docs/coolify-scheduled-tasks.md:62`). Yani mevcut deploy'da muhtemelen tetiklenmiyor, ama TZ DST'li bir bölgeye ayarlanırsa tetiklenir.

### 🔵 B14 — `getStartingPrice` geçmiş sezonu ve karışık para birimini eliyor
- **Severity:** LOW · **Güven:** CONFIRMED (ölçüldü) · **Dosya:** `price.engine.ts:67-80`
- 2024 sezonundan kalmış 500 EUR satırı ile 2026'nın 10.000 TRY satırı verildiğinde **`{price: 500, currency: "EUR"}`** döner — ham sayı karşılaştırması, tarih filtresi yok.

---

## 4. Eksik fiyat senaryoları — GERÇEK ÇIKTILAR

Koşullar: 08.10.2026 → 15.10.2026 (**7 gece**), temizlik 0, TRY, kur EUR=45.
Tüm sayılar **gerçek `calculateGrandTotal` çıktısıdır.**

| # | Senaryo | `nights` | `stay` | `TOTAL` | Doğru olması gereken | Sapma |
|---|---|---:|---:|---:|---:|---|
| **A** | 7/7 kapsanıyor (10.000/gece) | 7 | 70.000 | **70.000** | 70.000 | ✅ doğru |
| **B** | 6/7 — 12 Ekim eksik | 7 | 60.000 | **60.000** | 70.000 | **−10.000 (1 gece bedava)** |
| **C** | 1/7 — yalnız 8 Ekim | 7 | 10.000 | **10.000** | 70.000 | **−60.000** |
| **D1** | 0/7 — satır var, hiçbiri eşleşmiyor | 7 | 10.000 | **10.000** | 70.000 veya RED | **fallback: 1 gece** |
| **D2** | `prices = []` | 7 | 0 | **0** | RED | **sıfır TL** |
| **D3** | 0/7 + temizlik 1.500 | 7 | 10.000 | **11.500** | RED | total>0 olduğu için kartta da görünür |
| **E** | Sezon geçişi (1-10 Eki=10.000, 11-20 Eki=20.000) | 7 | 110.000 | **110.000** | 3×10.000 + 4×20.000 = 110.000 | ✅ **doğru** |
| **F** | Sezonlar arası 1 gün boşluk (11 Ekim yok) | 7 | 90.000 | **90.000** | 110.000 | **−20.000** |
| **G1** | Tam kapsam + %20 indirim | 7 | 56.000 | **56.000** | 56.000 | ✅ doğru |
| **G2** | 12 Ekim eksik + %20 indirim | 7 | 48.000 | **48.000** | 56.000 | **−8.000** (indirim gece bazında; eksik gece zaten 0) |
| **G3** | 0/7 + %20 indirim | 7 | 10.000 | **10.000** | — | **fallback indirimi ATLIYOR** (8.000 değil) |
| **H1** | EUR 200/gece, tam kapsam | 7 | 63.000 | **63.000** | 7×200×45 | ✅ doğru |
| **H2** | EUR + 12 Ekim eksik | 7 | 54.000 | **54.000** | 63.000 | **−9.000** |
| **H3** | EUR + hiç eşleşme | 7 | 9.000 | **9.000** | — | fallback (200×45) |
| **H4** | Karışık: 8-11 EUR, 13-31 TRY, 12 boş | 7 | 56.000 | **56.000** | — | `original_currency` = son gecenin (TRY) → snapshot bozuk |
| **I1** | Aynı gün giriş/çıkış | **0** | 10.000 | **10.000** | 0 | **0 gece → 10.000 TL** |
| **I2** | 1 gece | 1 | 10.000 | 10.000 | 10.000 | ✅ doğru |
| **I3** | 30 gece | 30 | 300.000 | 300.000 | 300.000 | ✅ doğru |
| **I4** | Bozuk tarih (`"abc"`) | **NaN** | 10.000 | **10.000** | RED | fallback |

**"7 gecelik rezervasyonun tek gecelik fiyata düşmesi" iddiası: DOĞRULANDI** — D1/D3/G3/H3/I1/I4 senaryolarında gerçekleşiyor. **Kısmi kapsamada ise düşmez**, eksik gece kadar eksilir (B/C/F).

**Ham `calculateStayTotal` (B senaryosu):** `{"stay":60000,"original_stay":60000,"original_currency":"TRY"}` — dönüş değerinde "eksik gece vardı" bilgisi **yok**.

---

## 5. Server-side doğrulama — client vs server

**Soru: "Kullanıcıya yanlış düşük fiyat gösterilse bile sunucu rezervasyon oluştururken tekrar hesaplıyor mu?"**

**Hesaplıyor — ama AYNI hatalı motorla, dolayısıyla yakalamıyor.**

| Soru | Cevap | Kanıt |
|---|---|---|
| Server tekrar hesaplıyor mu? | Evet | `price-verify.ts` → `recomputePublicReservationPrice` |
| Aynı engine mi? | **Evet** — `@/lib/price.engine`, `server-only` guard'ı yok | grep: 0 isabet |
| DB'den fiyatı tekrar çekiyor mu? | Evet — `getVillaPrices` + `getVillaDiscounts` | `price-verify.ts:177-186` |
| Client fiyatını kabul ediyor mu? | Hayır (normalde) — 16 finansal alanı eziyor | `route.ts:110-135` |
| Ama fail-open var mı? | **Evet** — recompute throw ederse client değerleri aynen gider | `price-verify.ts:576-590` |
| Sıfır/minimum guard var mı? | **Hayır** | `create.service.ts:73-86` |
| Drift enforce ediliyor mu? | **Hayır** — `cmp.match` false ise yalnız `console.warn("LOG-MODE — enforce edilmiyor")` | `price-verify.ts:483-493` |

**Server override eden alanlar:** `total_price`, `total_price_try`, `original_price`, `original_currency`, `exchange_rate`, `original_cleaning_fee/currency`, `cleaning_fee_try`, `prepayment_amount`, `remaining_payment`, `custom_price`→false, `custom_price_note`→null, `discount_applied/_type/_value/_currency`, `original_stay_total_try`, `stay_discount_amount_try`, pool-heating 4 alanı, `status`→`"pending"`, komisyon.
**Client'tan aynen kaydedilenler:** `villa_id`, tarihler, ad/telefon/email/kimlik/adres, `guests`, `guest_names`, `note`, `payment_method_id`, **`paid_amount`**, `payment_preference`, **`damage_deposit`**.

**Admin rezervasyon yolu:** `app/api/admin/reservations/route.ts` `price-verify`'ı **hiç import etmiyor** — admin UI ne hesapladıysa doğrudan INSERT edilir. Ayrıca admin `calculateGrandTotal` çağrılarında `discounts` **geçilmiyor** (`ekle/page.tsx:584-605`, `computeReservationPriceRecalc.ts:197+`).

**`verifyPublicReservationStayRules`** yalnız orphan-gap kuralına bakar; `villa_prices`'ı **hiç okumaz** (`stay-verify.ts:124-144`) ve o da fail-open.

---

## 6. Admin fiyat veri bütünlüğü — eksik sezon oluşabilir mi?

**EVET, oluşabilir.** (DB'de şu an var mı: **UNKNOWN** — production erişimi yok.)

| Soru | Cevap |
|---|---|
| Bitişiklik (gap-siz) zorunlu mu? | **HAYIR** — hiçbir katmanda yok |
| Çakışma engelli mi? | **DB'de HAYIR** (079'un aksine); yalnız UI akışı emergent olarak önler |
| `start > end` engelli mi? | **DB'de HAYIR**; UI swap'lar (`PricingCalendarCanvas.tsx:259-262`) |
| Minimum gelecek ufku şartı? | **HAYIR** |
| Silmede kapsam kontrolü? | **HAYIR** — üstelik silme kesişen tüm aralığı kaldırıyor |
| UI uyarısı ("boşluk var") var mı? | **HAYIR** — admin UI'da `boşluk\|eksik\|kapsanmayan` araması 0 sonuç |
| Fiyatsız gün görsel ayrımı | Var ama **zayıf**: beyaz hücre + `#cbd5e1` renkte `—` (`DayCell.tsx:242-249`) |
| `price = 0` saklanabilir mi? | Drawer reddeder; RPC/servis **kabul eder** |
| Fiyat değişiminde revalidate? | **Hiçbiri** |

**Boşluk zinciri (CONFIRMED):** aşırı geniş silme veya `prices ?? []` replace → `replace_villa_prices` boşluğu kalıcılaştırır (constraint yok) → admin UI boşluğu neredeyse görünmez kılar → public takvim o geceyi seçtirir → motor 0 TL sayar → sunucu aynı sonucu authoritative yazar.

---

## 7. Test kapsamı

| Senaryo | Test var mı | Nerede |
|---|---|---|
| 7/7 fiyat mevcut | ✅ VAR | `price-engine.test.ts:135-149` |
| 6/7 fiyat mevcut | ❌ **YOK** | — |
| 1/7 fiyat mevcut | ❌ **YOK** | — |
| 0/7 fiyat mevcut | ✅ VAR — ama **hatalı davranışı kilitliyor** | `price-engine.test.ts:186-200` |
| `prices = []` | ❌ **YOK** | — |
| Sezon geçişi | 🟡 dolaylı | `price-engine.test.ts:974-1008` |
| 1 günlük boşluk | ❌ **YOK** | — |
| İndirim + eksik fiyat | ❌ **YOK** | — |
| Farklı para birimi | 🟡 yalnız USD | `price-engine.test.ts:151-170` |
| Eksik/0 kur | ❌ gerçek anlamda YOK | `rates:{}` hep TRY→TRY |
| `calculateNights` NaN | ❌ **YOK** | yalnız boş string |
| Aynı gün giriş-çıkış | 🟡 yalnız `calculateNights` seviyesinde | `:40-42` |
| 30 gece | ❌ **YOK** | en uzun gerçek koşu 7 gece |
| Server verification | ✅ VAR | `price-verify.discount.test.ts:108-317` |
| Rezervasyon uçtan uca | 🟡 **sahte** — motor çalıştırılmıyor | `reservation-create-helpers/_fixtures.ts:70` |

**Doğrudan cevap: kısmi kapsamayı assert eden HİÇBİR test yok.** Repodaki her fiyat fixture'ı konaklama aralığını ya tam kapsar ya hiç kapsamaz. Motor bugün eksik geceyi 0 TL sayıyor olmasına rağmen **88/88 test yeşil**.

**Fix planlaması için kritik:** `price-engine.test.ts:186-200` tek-gecelik fallback'i **doğru davranış olarak** sabitliyor:
```js
  expect(res.nights).toBe(7);
  expect(res.stay).toBe(1000); // fallback single price
```
Motoru düzeltmek **bu tek testi** kırar. Diğer testler (`%100 indirim → 0` gibi) `hadMatchingPrice` guard'ı korunduğu sürece kırılmaz.

---

## 8. Risk değerlendirmesi

```
CRITICAL: 4    (B1 kısmi kapsama 0 TL · B2 tek-gece fallback · B3 sunucu yakalamıyor + guard yok · B4 prices=[] → stay 0 ile doğru fiyatı ezme)
HIGH:     5    (B5 fail-open · B6 fiyatsız gece seçilebilir · B7 nights 0/NaN fallback · B8 boşluk üretme mekanizmaları · B9 villa_prices constraint yok)
MEDIUM:   4    (B10 "yok" vs "0" · B11 mixed currency snapshot · B12 revalidate yok · B13 DST nights sapması)
LOW:      1    (B14 getStartingPrice geçmiş sezon + mixed currency)
```

**Sınıflandırma:**
- **Kesin kod hatası:** B1, B2, B4, B7, B10, B11, B13, B14 — çalıştırılarak ölçüldü.
- **Potansiyel risk (veri bağımlı):** Üretimde bu yolların tetiklenip tetiklenmediği `villa_prices` tablosunda gerçekten boşluk olup olmamasına bağlıdır → **UNKNOWN**, production DB erişimi yok. **İlk yapılması gereken şey bunu ölçmektir** (§9, Ö0).
- **Sorun yok:** Sezon geçişi (E), tam kapsamlı hesaplar (A, G1, H1, I2, I3), indirimin gece bazında uygulanması, kur dönüşümünün indirimden sonra yapılması — hepsi doğru çalışıyor.

---

## 9. Çözüm önerileri (YALNIZCA ÖNERİ — hiçbiri uygulanmadı)

### Ö0 — Önce ÖLÇ (kod değişikliği yok, risk yok)
Production'da salt-okunur bir SQL ile "gelecek 12 ayda fiyatsız gecesi olan aktif villalar" listesini çıkarmak. Bu, sorunun teorik mi yoksa aktif mi olduğunu **tek başına** belirler ve hangi çözümün aciliyetle gerektiğini gösterir. **Kod değişikliği gerektirmez, hiçbir riski yoktur, ilk adım budur.**

### Ö1 — Motoru "kapsanmayan gece varsa hesap geçersiz" davranışına almak
`calculateStayTotal`'ın dönüşüne `uncoveredNights: number` gibi bir bilgi eklemek (mevcut alanlar korunarak), `calculateGrandTotal`'ın bunu yukarı taşıması, ve tüketicilerin `uncoveredNights > 0` ise fiyat **göstermemesi / reddetmesi**.
- **Güvenlik:** En yüksek — hatalı fiyatı hem gösterimde hem rezervasyonda keser.
- **Mevcut rezervasyonları bozma riski:** Yok (geçmiş kayıtlar dokunulmaz).
- **Fiyat hesaplama değişikliği:** Tam kapsamlı hesaplarda **sıfır** (aynı sayı). Yalnız hatalı senaryolarda davranış değişir.
- **Migration:** Gerekmez.
- **Performans:** Sıfır (zaten dönen döngüde bir sayaç).
- **Geriye dönük uyumluluk:** `price-engine.test.ts:186-200` **kırılır** — bilinçli güncellenmesi gerekir. Bu tek test dışında kırılan yok.
- **⚠️ Yan etki uyarısı:** Bugün fiyatsız gecesi olan villalar **anında rezervasyona kapanır**. Ö0 ölçümü yapılmadan uygulanırsa ciro kesintisi riski var. Ö0 → Ö1 sırası zorunludur.

### Ö2 — Fallback'i düzeltmek (`prices[0] × nights`)
- **Güvenlik:** Düşük — yanlış sezonun fiyatını meşrulaştırır, yalnızca büyüklük hatasını giderir.
- **Risk:** Düşük ama **yanlış yönde**: "rastgele bir sezon fiyatı" ile fiyatlamak, reddetmekten daha kötü bir ürün kararı.
- **Önerilmez** — tek başına yapılırsa asıl problemi (B1 kısmi kapsama) hiç çözmez.

### Ö3 — Sunucuya bağımsız bir sanity guard'ı
`create.service.ts`'e INSERT öncesi: `total_price_try > 0` **ve** `stay > nights × MIN_NIGHTLY` gibi bir eşik.
- **Güvenlik:** Orta — B2/B4'ü yakalar, B1'i (6/7 kapsama) **yakalamaz**.
- **Risk:** Çok düşük, tamamen additive.
- **Migration:** Gerekmez. **Ö1'in tamamlayıcısı olarak değerli, ikamesi değil.**

### Ö4 — `getVillaPrices` fail-open'ını kapatmak
DB hatasında `[]` yerine throw → `price-verify` catch'ine düşer → mevcut fail-open davranışı (client değerleri) devreye girer.
- **Not:** Bu tek başına B4'ü "sıfır fiyat"tan "client'a güven"e çevirir — biri kadar kötü. **Ö3 ile birlikte** anlamlı.

### Ö5 — Takvimde fiyatsız günü seçilemez yapmak
`BookingCalendar` `disabled` dizisine fiyat kapsaması eklemek.
- **Güvenlik:** Yüksek (kullanıcı hatalı yola hiç giremez), **ama** doğrudan rezervasyon linkleri (`/rezervasyon/<slug>?start&end`) bu kapıyı atlar → tek başına yetmez.
- **Risk:** Orta — UI davranışı değişir, fiyatsız günler görünür şekilde kapanır.

### Ö6 — Veri katmanında önlem
`villa_prices` için `villa_discounts`'takine benzer `EXCLUDE` + `CHECK` constraint'leri, ve admin UI'da kapsam boşluğu uyarısı.
- **Migration:** **Gerekir.** Mevcut veride çakışan satır varsa `ALTER TABLE` **başarısız olur** → Ö0 ölçümü olmadan denenmemeli.
- **Not:** Constraint çakışmayı engeller, **boşluğu engellemez** (boşluk için DB constraint'i pratik değildir).

### 🏆 EN GÜVENLİ YOL (öneri — uygulanmadı)
**Ö0 → Ö3 → Ö1 → Ö5 → Ö6** sırası:
1. **Ö0** ile problemin gerçekte var olup olmadığını ölç (sıfır risk).
2. **Ö3** ile sunucuya additive bir taban guard koy (sıfır davranış değişikliği, B2/B4'ü anında keser).
3. Ölçüm sonucuna göre **Ö1**'i planla — asıl düzeltme budur, ama tek kırılacak testi (`price-engine.test.ts:186`) ve ciro etkisini bilerek.
4. Ö5 ve Ö6 sonraki turlarda.

---

## Nihai cevap

> **"Villa fiyatlarında herhangi bir gece için fiyat bulunmadığında sistem gerçekten yanlış toplam fiyat üretebiliyor mu? Üretebiliyorsa tam olarak hangi koşulda, hangi kod yolunda ve rezervasyon sırasında da bu hata devam ediyor mu?"**

**EVET — üretiyor, ölçülerek doğrulandı.**

- **Koşul 1 (kısmi kapsama):** Aralığın bazı geceleri `villa_prices` ile kapsanmıyorsa, o geceler **0 TL** sayılır. Kod yolu: `price.engine.ts:118-126` (`getDailyPrice` → `{converted:0}`) → `:370` (`stay += 0`). Ölçüm: 7 gecede 1 eksik → **70.000 yerine 60.000**.
- **Koşul 2 (hiç kapsama yok):** `stay===0 && !hadMatchingPrice && prices.length` → `price.engine.ts:385-406` fallback'i `prices[0]`'ın **tek gecelik** fiyatını döndürür, gece sayısıyla çarpmaz. Ölçüm: 7 gece → **10.000**. Bu dal indirimi de atlar. `nights=0` ve `nights=NaN` durumları da bu dala düşer.
- **Koşul 3 (`prices` boş):** `stay = 0` → **toplam 0 TL**. `getVillaPrices` bir DB hatasında `[]` döndüğü için bu, sunucunun client'ın **doğru** hesabını sıfırla ezmesine yol açar.

**Rezervasyon sırasında hata devam ediyor: EVET.** `price-verify.ts` aynı `@/lib/price.engine` modülünü kullanır; iki taraf aynı yanlış sayıyı üretir, `comparison.match` **true** olur, `route.ts:111` bu tutarı authoritative olarak yazar, `create.service.ts:73-86`'daki 5 validasyonun hiçbiri fiyata bakmaz ve rezervasyon **oluşur**. Komisyon da bu yanlış tutardan hesaplanır. Zinciri kesen **tek bir kontrol yoktur**.

**Üretimde fiilen gerçekleşiyor mu?** Bu yalnızca `villa_prices` verisine bağlıdır ve production DB erişimi olmadan **bilinemez** — §9 Ö0 tam olarak bunu ölçmek içindir.
