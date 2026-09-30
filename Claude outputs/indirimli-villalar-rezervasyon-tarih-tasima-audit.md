# İndirimli Kiralık Villalar → "Hemen Rezervasyon Yap" Tarih Taşıma — SALT-OKUMA AUDIT

**Tarih:** 2026-09-22 · **Repo HEAD:** `92c8e08` · `git status` temiz
**Kapsam:** Ana sayfa "İndirimli Kiralık Villalar" bölümü (public)
**Yöntem:** Yalnız repo kodu. DB'ye / production'a / Supabase'e / Coolify'a **erişilmedi**.

---

## 1) İlgili component / dosyalar (veri akışı zinciri)

| # | Dosya | Rol |
|---|-------|-----|
| 1 | `app/components/home/HomePageBody.tsx:139` | `<DiscountCollection locale={locale} />` render eder |
| 2 | `app/components/home/DiscountCollection.tsx` | **RSC.** `getCachedDiscountCollectionVillas()` çağırır, her villa için `<VillaCard variant="discount" ... discount={c.discount} />` render eder |
| 3 | `lib/cache.helpers.ts:459-679` | `getCachedDiscountCollectionVillas` — `unstable_cache`, tag `["discount","villa-reviews"]`, `revalidate: 600` |
| 4 | `lib/db/discount.repository.ts > findActivePublicCards` | `discount_collections` + embed `villa.villa_discounts` |
| 5 | `app/components/villa/VillaCard.tsx` | `discount` prop'unu tüketen tek yer; CTA burada |
| 6 | `app/components/short-gaps/ShortGapsPageBody.tsx:461-468` | **Mevcut, kanıtlanmış tarih taşıma deseni** (`reserveInfo.href`) |
| 7 | `app/(public)/rezervasyon/[slug]/page.tsx` | Rezervasyon route'u, searchParams sözleşmesi |
| 8 | `app/components/reservation/ReservationPageBody.tsx:105-152` | searchParams → `ReservationForm` prop'ları |
| 9 | `app/components/reservation/ReservationForm.tsx` | `start`/`end` prop'larını tüketir |

---

## 2) Fırsat (indirim) tarihinin GERÇEK veri kaynağı

**Kaynak: `villa_discounts` tablosu → `start_date` / `end_date`.**

Zincir (kanıt):

```
db: villa_discounts (migration 079)
  └─ discount.repository.ts > findActivePublicCards   (embed: villa_discounts)
     └─ lib/cache.helpers.ts:545-567  normalizedDiscounts (null-safe normalize)
        └─ :613-622  visibleDiscounts  (end_date >= today)
           └─ :628-631 selectedDiscount (start_date ASC, ilki)
              └─ :664-672  result.discount = { start_date, end_date, discount_type, discount_value, currency }
                 └─ DiscountCollection.tsx  discount={c.discount}
                    └─ VillaCard.tsx:147-152  discount prop
```

➡️ **Tarihler ZATEN backend'den (RSC + cache) geliyor. Yeni DB sorgusu GEREKMİYOR.**
➡️ Kartta gösterilen "İndirim geçerli: …" etiketi (`VillaCard.tsx:274` `discountDateRangeLabel`) de **aynı iki alandan** üretiliyor.

### 2.1 Tarih semantiği — KANIT (bu, işin kritik noktası)

`villa_discounts.start_date` / `end_date` = **KAPALI interval, İKİSİ DE DAHİL — GECE bazlı.**

* `db/migrations/079_villa_discounts.sql` "TARİH MANTIĞI" bölümü:
  *"`start_date`/`end_date` — KAPALI interval, İKİSİ DE DAHİL"*, `villa_prices` ile aynı.
* `lib/price.engine.ts:193-198` `getActiveDiscount`: `d >= s && d <= e`.
* Admin UI `app/components/admin/villa-form/DiscountsSection.tsx:94-100`:
  `nightsInclusive = (e - s)/gün + 1` → ekranda **"N gece"**.
  → `end_date`, indirimin **son GECESİ**dir.

Rezervasyon tarafı ise **çıkış (checkout) hariç**:

* `lib/price.engine.ts:345` `while (current < endD)` → `end` günü ücretlendirilmez.
* `db/migrations/055_...sql:100` `gap_nights = gap_end - gap_start` → `gap_end` = **checkout**.
* `ReservationForm.tsx:214-221` `getNights()` = `(end - start)/gün`.

**Sonuç:** indirim penceresinin tamamı rezervasyona taşınacaksa
`check-in = start_date`, **`check-out = end_date + 1 gün`**.
(`?start=end_date` verilirse **son indirimli gece kaybolur**.)

---

## 3) Mevcut "Hemen Rezervasyon Yap" navigation yapısı

`VillaCard.tsx:1119-1133` — discount variant CTA:

```tsx
{reserveInfo ? (
  reserveBlock                       // kısa-süreli tarihler sayfası
) : (
  <button type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation();
                      router.push(detailHref); }}   // ← ANA SAYFA BURAYA DÜŞÜYOR
    className="... bg-[#ED7926] ...">
    {dict.card.bookNow}
  </button>
)}
```

* `detailHref` (`VillaCard.tsx:452-461`) = `/kiralik-villa/<slug>` (+ `?start&end` **yalnız** `stayStart`/`stayEnd` prop'ları verilmişse).
* Ana sayfa `DiscountCollection` **`stayStart`/`stayEnd` göndermiyor** → CTA **tarihsiz** villa detayına gidiyor. **Tespit edilen eksik bu.**
* `dict.card.bookNow` = `"Hemen Rezervasyon Yap"` (`lib/i18n/dictionaries/tr.ts:372`).

### 3.1 Projede ZATEN VAR OLAN tarih taşıma deseni

`ShortGapsPageBody.tsx:466`:

```ts
href: `${localePrefix}/rezervasyon/${villa.slug}?start=${gap.gap_start}&end=${gap.gap_end}`
```

→ **Aynı URL standardı kullanılacak. Yeni bir sistem/rota/parametre icat edilmiyor.**

---

## 4) Rezervasyon sayfasının URL / query parametreleri

`app/(public)/rezervasyon/[slug]/page.tsx:23-30` (TR; `en`/`de` aynı gövdeyi render eder):

```ts
searchParams: Promise<{
  start?: string | string[];        // check-in   "YYYY-MM-DD"
  end?: string | string[];          // check-out  "YYYY-MM-DD" (hariç)
  adults?: string | string[];
  children?: string | string[];
  poolHeating?: string | string[];  // "1" | diğer
}>
```

İkinci üretici (kanıt, aynı sözleşme): `useBookingEngine.ts:995`
`/rezervasyon/${villaSlug}?start=${start}&end=${end}&adults=...&children=...&poolHeating=...`

Locale önekleri: `/rezervasyon/...`, `/en/rezervasyon/...`, `/de/rezervasyon/...` (üç route da mevcut).

---

## 5) Tarih rezervasyon sayfasında nasıl initialize ediliyor?

`ReservationPageBody.tsx:105-152`:

```ts
const getParam = (p?: string | string[]) => (!p ? undefined : Array.isArray(p) ? p[0] : p);
const start = getParam(sp.start);
const end   = getParam(sp.end);
...
<ReservationForm villa={villa} prices={prices} discounts={discounts}
                 start={start} end={end} ... />
```

`ReservationForm` içinde:

* `getNights()` (`:214`) — `start`/`end` yoksa `0`.
* Fiyat: `start && end ? calculateGrandTotal({ start, end, prices, ..., discounts }) : …` (`:231`, `:280`, `:334`) → **indirim otomatik uygulanır** (aynı `villa_discounts` kayıtları `getVillaDiscounts(villa.id)` ile server'dan geliyor).
* Özet paneli (`:594-620`) tarih aralığını `Europe/Istanbul` TZ ile basar.

➡️ **Sayfa tarafında HİÇBİR değişiklik gerekmiyor.** Sözleşme hazır ve çalışıyor.

---

## 6) Yapılması gereken MİNİMUM kod değişikliği

**Tek dosya, tek fonksiyonel ekleme:** `app/components/villa/VillaCard.tsx`

1. `formatLocalDate`'i mevcut `@/lib/date-format` import satırına ekle (`parseLocalDate` zaten import edilmiş).
2. `detailHref` bloğunun hemen ardına saf (yan etkisiz) bir `discountReserveHref` türetimi ekle:
   * yalnız `variant === "discount"` iken,
   * `discount.start_date` / `discount.end_date` geçerliyse (`parseLocalDate` NaN guard, `end >= start`),
   * `slug` boş değilse,
   * `check-out = end_date + 1 gün` (bkz. §2.1),
   * URL: `buildLocaleAlternates('/rezervasyon/<slug>', effectiveLocale).canonical + ?start=&end=`
     (aynı helper `detailHref` için de kullanılıyor — locale öneki ShortGaps'teki `localePrefix` ile birebir aynı sonucu verir),
   * aksi halde `null`.
3. CTA'da yalnız hedefi değiştir: `router.push(discountReserveHref ?? detailHref)`.

**Değişmeyenler:** buton JSX'i, `className`, metin, `type`, `preventDefault`/`stopPropagation` deseni, `reserveInfo` dalı, `detailHref`'in kendisi, kart tasarımı.

### 6.1 DÜZELTME (ürün sahibi geri bildirimi — `+1 gün` KALDIRILDI)

İlk uygulamada check-out `end_date + 1 gün` olarak taşınıyordu (migration 079'un
"kapalı interval / gece" semantiğinden türetilmişti). **Bu üründe doğru davranış bu değil.**

Ürün sahibi doğruladı: `villa_discounts.end_date` bu üründe **kullanıcıya gösterilen ÇIKIŞ tarihidir.**
Kartta "10 – 17 Ekim" yazıyorsa rezervasyon sayfasında da **10 – 17 Ekim** görünmelidir.

Gerekçe (kod üzerinden doğrulandı):
* Kart etiketi `discountDateRangeLabel` (`VillaCard.tsx:277`) `start_date`/`end_date`'i **aynen** basar.
* `/rezervasyon` özet paneli (`ReservationForm.tsx:594-620`) `start`/`end` param'larını **aynen** basar.
* ⇒ İki ekranın birebir aynı görünmesi için değerler **değiştirilmeden** taşınmalı.

**Uygulanan son hâl:** `?start=start_date&end=end_date` — **gün ekleme/çıkarma YOK.**
Gece sayısı frontend'de yeniden hesaplanmaz; `/rezervasyon` sayfası kendi mevcut
mantığıyla (`getNights` / `price.engine`) hesaplar, o mantığa dokunulmadı.

| İndirim | Üretilen URL |
|---|---|
| 10 – 17 Ekim | `?start=2026-10-10&end=2026-10-17` |
| 1 – 5 Kasım | `?start=2026-11-01&end=2026-11-05` |
| 28 Aralık – 2 Ocak | `?start=2026-12-28&end=2027-01-02` |

### 6.2 Bilinen sınır durumu (uygulanmadı — kararınıza bırakıldı)

`visibleDiscounts` filtresi yalnız `end_date >= bugün` şartı arıyor (`cache.helpers.ts:613-622`).
Dolayısıyla **başlangıcı geçmişte, bitişi gelecekte** olan bir indirim kartta görünebilir; bu durumda CTA
`start` olarak **geçmiş bir tarih** taşır. Rezervasyon backend'i bunu bugüne çekmez.

Bilerek **clamp yapılmadı**: (a) kartın gösterdiği etiketle CTA'nın taşıdığı tarih ayrışırdı,
(b) client component'te `new Date()` ile "bugün" hesaplamak SSR/hydration uyuşmazlığı riski taşır,
(c) kullanıcı kuralı: *"Tarihleri frontend'de yeniden tahmin etme"*.
İstenirse doğru yer **`lib/cache.helpers.ts`** (server, `today` zaten orada hesaplanıyor) — ayrı bir iş olarak yapılabilir.

Ayrıca: bu akış müsaitlik kontrolü yapmaz (ShortGaps akışında olduğu gibi). Tarihler doluysa
kullanıcı formu gönderdiğinde backend **HTTP 409 → `dict.form.errorDatesUnavailable`** döner
(`ReservationForm.tsx:501-505`). Mevcut, değişmeyen davranış.

---

## 7) DEĞİŞMESİ GEREKEN dosyalar

| Dosya | Değişiklik |
|---|---|
| `app/components/villa/VillaCard.tsx` | `formatLocalDate` import + `discountReserveHref` türetimi + CTA `router.push` hedefi |
| `tests/unit/discount-card-reserve-href.test.tsx` | **YENİ** — davranış kilidi (regresyon testi) |

## 8) DEĞİŞMEMESİ GEREKEN dosyalar (ve neden)

| Dosya | Neden |
|---|---|
| `app/components/home/DiscountCollection.tsx` | Veri zaten `discount` prop'uyla akıyor; `stayStart`/`stayEnd` eklenirse kartın **fiyat gösterimi** (konaklama toplamı) değişir → tasarım bozulur |
| `lib/cache.helpers.ts` | Yeni sorgu/alan gerekmiyor |
| `lib/db/discount.repository.ts` | Sorgu değişmiyor |
| `lib/price.engine.ts` | Fiyat/indirim matematiği ve tarih semantiği aynen korunuyor |
| `app/(public)/rezervasyon/[slug]/page.tsx`, `en`, `de` | searchParams sözleşmesi zaten hazır |
| `app/components/reservation/ReservationPageBody.tsx`, `ReservationForm.tsx` | Tarih hidrasyonu zaten çalışıyor |
| `app/components/short-gaps/ShortGapsPageBody.tsx` | Diğer rezervasyon akışı — dokunulmadı |
| `app/components/villa/booking/useBookingEngine.ts`, `BookingSidebar.tsx` | Villa detay rezervasyon akışı — dokunulmadı |
| `VillaCard` `reserveInfo` / `reserveBlock` | Kısa-süreli tarihler sayfasının CTA'sı — dokunulmadı |
| Admin tarafı, DB migration, R2/storage | Kapsam dışı |

---

## Doğrulama notu

Production DB'ye **erişilemedi** (kural gereği denenmedi de). Tüm tarih semantiği iddiaları
migration dosyaları, `price.engine.ts` ve admin UI kodundan **alıntıyla** kanıtlanmıştır;
şema hakkında varsayım yapılmamıştır.
