# TATİLİN YERİ — PERFORMANS / HIZ AUDİTİ

| | |
|---|---|
| **Tarih** | 21 Eylül 2026 |
| **Commit** | `54c5935` (çalışma ağacı: yalnız 2 authz dosyası + audit raporları) |
| **Stack** | Next.js **16.3.5** (App Router) · React 19.2.4 · Tailwind v4 (CSS-first) · native PostgreSQL (`pg`) |
| **Tip** | **SALT OKUNUR** — hiçbir dosya değiştirilmedi, kod yazılmadı, paket/DB/migration/config'e dokunulmadı |
| **Tek çıktı** | Bu dosya |

> ⚠️ **Ölçüm ortamı uyarısı.** Bu makinede `fonts.googleapis.com` ve production DB **egress politikası ile engelli**. Bu yüzden:
> • Bundle rakamları, mevcut `.next` **webpack** build'inden (21 Eyl 13:08) okundu. Production **Turbopack** kullanıyor; chunk bölünmesi farklı olabilir, **paket→route eşlemeleri ve büyüklük sıralaması geçerlidir**.
> • **Gerçek sorgu süreleri, index'ler, `EXPLAIN` planları ve production yanıt süreleri ÖLÇÜLEMEDİ.** Aşağıdaki DB bulguları *koddan türetilmiş yapısal maliyet*tir, ölçülmüş yavaşlık değildir. Her birinde bu ayrım belirtilmiştir.

---

## KAPSAM

| | |
|---|---:|
| İncelenen `.ts/.tsx` (test hariç) | **802** |
| Public sayfa (`page.tsx`) | **51** |
| Admin sayfa | **54** |
| API route | **79** |
| Build route tablosu | **163 dinamik (ƒ) · 24 statik (○)** |
| `"use client"` toplam | **152** (public tarafta **49**) |
| `"use server"` dosya | 55 |
| `next/dynamic` | **8** · `<Suspense>` **2** · `loading.tsx` **0** |
| `force-dynamic` | **95** |
| `select("*")` | **63** |

---

# 🔴 P0 — ÇOK YÜKSEK ETKİ

## P0-1 · Sentry'nin 444 KB'lık client chunk'ı HER sayfada yükleniyor

**1. Sorun** — Paylaşılan (shared) client bundle 772 KB ve bunun **444 KB'ı (%58) Sentry**. Ana sayfa dahil her public sayfa bunu indiriyor.

**2. Dosya** — `instrumentation-client.ts` · `next.config.ts` (tree-shaking define'ı yok) · chunk `static/chunks/1djq-djfbkjb8.js`

**3. Kanıt (koddan)**
```
app/(public)/page/build-manifest.json → 7 dosya, toplam 772 KB
  444 KB  static/chunks/1djq-djfbkjb8.js   ← içinde 'browserTracingIntegration' imzası VAR
  126 KB  static/chunks/0ohz4q2znrd78.js
  110 KB  static/chunks/0cz1d0mv5g_q7.js
  … (4 küçük dosya)
```
```ts
// instrumentation-client.ts:46-47
tracesSampleRate: 0,
replaysSessionSampleRate: 0,
```

**4. Teknik neden** — Tracing ve Replay **kapalı** (`0`), ama SDK'nın tracing kodu bundle'a giriyor: chunk içinde `browserTracingIntegration` bulundu (replay/feedback/httpClient bulunmadı). `next.config.ts` `withSentryConfig` ile sarılmadığı için Sentry'nin tree-shaking define'ları (`__SENTRY_TRACING__`, `__SENTRY_DEBUG__`) **hiç enjekte edilmiyor** → ölü kod atılamıyor.

**5. Tahmini etki** — Paylaşılan JS'te **~150–300 KB** azalma potansiyeli (tracing + debug kodu). Mobil 4G'de her sayfa için ~0,5–1 sn indirme + parse. **Tüm site geneline yayılan tek en büyük kazanç.**

**6. Uygulama zorluğu** — Orta. `withSentryConfig` ile sarmak veya webpack/turbopack `DefinePlugin` ile `__SENTRY_TRACING__: false` vermek.

**7. Risk** — Düşük–orta. `withSentryConfig` eklemek `next.config.ts`'i değiştirir; yanlış yapılandırma **source map yükleme** davranışını etkileyebilir (şu an zaten yok).

**8. Güvenlik etkisi** — **Yok.** Hata yakalama (error-only) korunur; yalnız kullanılmayan tracing kodu atılır. Sentry'yi kaldırmayı ÖNERMİYORUM — gözlemlenebilirlik zaten zayıf.

**9. Önerilen çözüm** — (a) `__SENTRY_TRACING__ = false` define'ı ile tracing kodunu tree-shake et; (b) alternatif olarak `@sentry/nextjs` yerine yalnız `browserApiErrorsIntegration` + minimal `Sentry.init` ile "lite" client kurulumu değerlendir; (c) **önce ölç**: `next build` sonrası chunk boyutunun gerçekten düştüğünü doğrula.

---

## P0-2 · `country-state-city` (640 KB) public rezervasyon sayfasında

**1. Sorun** — Ülke/eyalet veri setinin tamamı, dönüşümün en kritik sayfasına statik import ile giriyor.

**2. Dosya** — `app/components/reservation/ReservationForm.tsx:11`

**3. Kanıt**
```ts
import { Country, State } from "country-state-city";
```
```
chunk static/chunks/28_j6lgp95ym0.js = 640 KB, 'isoCode' imzası VAR
→ yüklendiği route'lar:
   /(public)/rezervasyon/[slug]        ← ⚠️ PUBLIC, dönüşüm sayfası
   /(public)/en/rezervasyon/[slug]
   /(public)/de/rezervasyon/[slug]
   /(admin)/maki-admin/reservations/ekle
   /(admin)/maki-admin/reservations/[id]
node_modules/country-state-city = 17 MB
```

**4. Teknik neden** — Paket veriyi JSON olarak modülün içinde taşır; tree-shake edilemez. Statik import → sayfa açılır açılmaz iner.

**5. Tahmini etki** — Rezervasyon sayfasında **−640 KB** (paylaşılan 772 KB'ın üstüne gelen ek yük). Mobil 4G'de ~2–4 sn ek indirme+parse; doğrudan LCP/INP ve dönüşüm kaybı.

**6. Uygulama zorluğu** — Kolay (lazy) → orta (sunucudan liste).

**7. Risk** — Düşük. Form alanının davranışı korunmalı; ülke/şehir seçimi aynı kalır.

**8. Güvenlik etkisi** — **Yok.** Bu paket yalnız statik referans verisi; PII veya DB erişimi ile ilgisi yok. PHASE 3 PII-safe akışına dokunulmaz.

**9. Önerilen çözüm** — Etkisi artan sırayla: (a) ülke/şehir adımını `next/dynamic` ile lazy'le; (b) ülke listesini sunucudan `{code,name}` olarak (~5 KB) ver, eyalet/şehri ülke seçilince bir route handler'dan çek; (c) hedef pazar TR ağırlıklıysa desteklenen ülkeleri allow-list'e indir.

---

## P0-3 · `/arama`: tüm villalar + tüm fiyat/indirim satırları her istekte çekiliyor, sayfalama JS'te

**1. Sorun** — Arama sorgusunda **SQL `LIMIT`/`OFFSET` yok**; eşleşen tüm villalar dört embed'iyle birlikte belleğe çekiliyor, filtre/sıralama/dilimleme JavaScript'te yapılıyor. Sayfa `force-dynamic` → **her istekte** tekrar.

**2. Dosya / fonksiyon** — `lib/db/villa.repository.server.ts:466 findSearchResults` · `app/components/search/AramaPageBody.tsx:871,1031-1034`

**3. Kanıt**
```ts
// villa.repository.server.ts:471-505  — top-level LIMIT/OFFSET/COUNT YOK
.from("villa").select(`
    *,                                  ← 44 kolon
    location:villa_locations(name),
    villa_images ( image_url, is_cover, sort_order ),   ← limit 1 (iyi)
    villa_prices ( price, currency, start_date, end_date ),      ← TÜM satırlar
    villa_discounts ( start_date, end_date, discount_type, ... ) ← TÜM satırlar
  `)
```
```ts
// AramaPageBody.tsx
871:  const total = visibleVillas.length;                       // JS'te sayım
1031: const totalPages = Math.max(1, Math.ceil(total/pageSize));
1034: const villasOnPage = sortedVillas.slice(sliceStart, sliceStart + pageSize);
```
```ts
// app/(public)/arama/page.tsx:21
export const dynamic = "force-dynamic";
```

**4. Teknik neden** — Availability, kur dönüşümlü fiyat sıralaması ve esnek tarih JS'te hesaplandığı için veri kümesi daraltılmadan çekilmek zorunda. `villa_prices` sezonluk tarih aralıklarıyla villa başına onlarca satır olabilir → transfer = villa × fiyat satırı.

**5. Tahmini etki** — İstek maliyeti **villa sayısıyla doğrusal**. ⚠️ **Gerçek villa sayısı ve `/arama` yanıt süresi ÖLÇÜLEMEDİ** — bu bulgunun aciliyeti tamamen buna bağlı. 100 villada fark edilmez, 1.000'de belirgin, 5.000'de kabul edilemez olur.

**6. Uygulama zorluğu** — Zor (aşamalı).

**7. Risk** — Orta–yüksek. `/arama` URL kontratı, filtre semantiği ve SEO `ItemList` davranışı korunmalı. `findSearchResults`'ın "boş `categoryVillaIds` = filtre yok" tuzağı var (kod içinde belgeli).

**8. Güvenlik etkisi** — Yok (okuma yolu, `dbAdmin` sunucu tarafında kalır).

**9. Önerilen çözüm** — Sırayla: **(0) ÖNCE ÖLÇ** — villa sayısı + p50/p95 yanıt süresi. (1) `villa_prices`/`villa_discounts` embed'lerini yalnız görünen sayfa için çek (iki aşamalı: önce id listesi, sonra sayfa villaları için detay). (2) Kategori/bölge/özellik kesişimi zaten ID listesi olarak hesaplanıyor → `WHERE id = ANY($1)` ile SQL'e ver. (3) Availability `getBlockedVillaIds` zaten toplu → `NOT IN` olarak sorguya girebilir. (4) En son SQL `LIMIT/OFFSET` + ayrı `COUNT(*)`.

---

## P0-4 · Ana sayfada 172 KB'lık tarih seçici (react-datepicker + date-fns)

**1. Sorun** — Hero arama panelindeki tarih alanı için `react-datepicker` **statik** import ediliyor; kullanıcı tarih alanına hiç dokunmasa da ana sayfada iniyor.

**2. Dosya** — `app/components/ui/hero/_components/HeroSearchPanel.tsx:14-15`

**3. Kanıt**
```ts
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
```
```
chunk static/chunks/0yjvy1b6wqco-.js = 172 KB → imza: react-datepicker + date-fns
→ yüklendiği route'lar: /(public)  ← ANA SAYFA
                        /(public)/arama, /kiralik-villalar, /teklif-al (+ en/de)
node_modules/react-datepicker = 32 MB, date-fns = 36 MB
```

**4. Teknik neden** — Statik import + CSS import → hero bileşeni client bundle'ına giriyor, ana sayfanın ilk yüklemesine ekleniyor.

**5. Tahmini etki** — Ana sayfada **−172 KB** potansiyeli (paylaşılan 772 KB'ın üstüne). LCP/INP'de doğrudan iyileşme. **En kolay büyük kazanç.**

**6. Uygulama zorluğu** — **Kolay.**

**7. Risk** — Düşük. Tarih seçme davranışı, locale (TR/EN/DE) ve URL tarih hidrasyonu korunmalı — bunlar yakın zamanda düzeltildi, bozulmamalı.

**8. Güvenlik etkisi** — Yok.

**9. Önerilen çözüm** — `next/dynamic(..., { ssr: false })` ile takvimi yalnız alan odaklandığında/tıklandığında yükle. Aynı desen `FilterSidebar.tsx:38` ve `OfferRequestForm.tsx:19` için de geçerli.

---

# 🟠 P1 — YÜKSEK ETKİ

## P1-1 · Villa detay: istek başına 12 cache'siz DB sorgusu, tamamen dinamik render

**Sorun** — `/kiralik-villa/[slug]` build tablosunda **ƒ (dinamik)**. Her ziyarette 1 + 11 = **12 sorgu**, hiçbiri `unstable_cache` ile sarılmamış.

**Dosya / fonksiyon** — `app/(public)/kiralik-villa/[slug]/page.tsx:203,252-266`

**Kanıt**
```ts
203: const villa = await getVillaBySlugCached(slug);   // React cache() = yalnız istek-içi dedupe
252: const [ images, prices, discounts, distances, features, rules,
        priceIncludes, externalBlocks, settings, reviews, reviewStats ]
      = await Promise.all([ …11 çağrı… ]);
```
Servislerin konumu (hiçbiri `lib/cache.helpers.ts` içinde **değil**, yani cache'siz):
`villa-image.read.ts` · `villa-price.service.ts` · `villa-discount.service.ts` · `villa-distance.service.ts` · `villa-feature.service.ts` · `rule-item.service.ts` · `price-include-item.service.ts`
Sayfanın dinamik olma nedeni: `192: const sp = searchParams ? await searchParams : {};`

**Teknik neden** — `Promise.all` paralel olduğu için latency = en yavaş sorgu, ama **DB yükü 12 sorgu/ziyaret**. Bu verilerin çoğu (görseller, mesafeler, özellikler, kurallar, fiyata dahiller) villa başına **nadiren** değişir ve zaten `revalidateTag("villas")` altyapısı mevcut.

**Tahmini etki** — Cache'lenirse villa detayda DB sorgusu **12 → 1-2**'ye düşer (yalnız availability/dinamik olanlar kalır). ⚠️ Gerçek sorgu süreleri ölçülemedi; etki DB gecikmesine bağlı.

**Zorluk** — Orta. **Risk** — Orta: **fiyat / indirim / availability cache'lenirse yanlış fiyat gösterme riski** doğar.

**Güvenlik etkisi** — Yok.

**Önerilen çözüm** — Yalnız **statik-benzeri** olanları `unstable_cache` + `tags:["villas"]` ile sar: `images`, `distances`, `features`, `rules`, `priceIncludes`. **`prices`, `discounts`, `externalBlocks` (availability) CACHE'LENMEMELİ** — fiyat ve müsaitlik doğruluğu ticari olarak kritik. `searchParams` bağımlılığı kaldırılabiliyorsa sayfa ISR'a da alınabilir (ayrı değerlendirme).

## P1-2 · Streaming yok: `loading.tsx` 0, `<Suspense>` 2

**Sorun** — Projede **hiç** `loading.tsx` yok, yalnız 2 `<Suspense>` var. 163 dinamik route'un tamamı, sunucu tüm veriyi toplayana kadar **tek parça** bekliyor; tarayıcı bu sürede hiçbir şey boyamıyor.

**Kanıt** — `find app -name 'loading.tsx'` → **0** · `<Suspense>` → **2**

**Teknik neden** — App Router'da `loading.tsx`/`Suspense` olmadan RSC streaming devreye girmez; TTFB = en yavaş sorgu.

**Tahmini etki** — Algılanan performansta (FCP) **büyük** iyileşme; teknik olarak toplam süre değişmez ama kullanıcı boş/donuk ekran görmez. Özellikle `/arama` (P0-3) ve villa detay (P1-1) için.

**Zorluk** — **Kolay.** **Risk** — Çok düşük (yalnız eklenir). **Güvenlik etkisi** — Yok.

**Önerilen çözüm** — En az `arama/`, `kiralik-villalar/`, `kiralik-villa/[slug]/` için iskelet (skeleton) `loading.tsx`; ağır alt bölümleri (yorumlar, benzer villalar, SSS) `<Suspense>` ile stream'e al.

## P1-3 · Ana sayfada 3 sıralı `await` + her alt bölüm kendi verisini çekiyor

**Sorun** — `HomePageBody` üç veriyi **ardışık** bekliyor; ayrıca 6 alt bölüm kendi sorgularını yapıyor.

**Dosya** — `app/components/home/HomePageBody.tsx:62,70,75`

**Kanıt**
```ts
62: const settings        = await getCachedSettings().catch(() => null);
70: const faqs            = await getCachedFaqs(locale).catch(() => []);
75: const heroReviewStats = await getCachedGlobalReviewStats().catch(…);
```
Alt bölümler (hepsi **Server Component**, iyi) ve kendi veri çağrıları:
`VillaTypeCarousel`(6) · `LocationCollection`(7) · `VillaList`(6) · `DiscountCollection`(3) · `HomepageReviewsSection`(4) · `ShortGapsSection`(1)

**Teknik neden** — Üçü de cache'li (`settings`/`faqs` 3600 sn, reviews 600 sn) → **cache HIT'te maliyet yok**. Ancak cache MISS/revalidate anında 3 ardışık RTT oluşur.

**Tahmini etki** — Cache miss'te ~2 RTT tasarrufu. Küçük ama bedava.

**Zorluk** — Kolay. **Risk** — Düşük (sıra bağımlılığı yok gibi görünüyor, doğrulanmalı). **Güvenlik** — Yok.

**Öneri** — Üçünü tek `Promise.all` dalgasına al. ✅ **Olumlu not:** ana sayfanın tüm ağır bölümleri zaten Server Component; yalnız `FaqSection` client — bu doğru bir tercih (accordion).

## P1-4 · İki ayrı takvim kütüphanesi aynı anda pakette

**Sorun** — `react-datepicker@9` (32 MB) **ve** `react-day-picker@8.10.2` birlikte kullanılıyor.

**Kanıt** — `react-datepicker`: HeroSearchPanel, FilterSidebar, OfferRequestForm, AdminDateRangePicker · `react-day-picker`: `app/components/villa/booking/BookingCalendar.tsx:30`

**Tahmini etki** — Birleştirme ile public bundle'da kayda değer düşüş + UI tutarlılığı.

**Zorluk** — **Zor.** **Risk** — **Orta–yüksek:** booking takvimi yakın zamanda indirimli günlük fiyat, locale ve kırmızı üstü-çizili fiyat özellikleriyle elden geçirildi; taşıma bunları riske atar.

**Öneri** — P0-4'teki lazy-load ile çoğu kazanç zaten elde edilir. Birleştirme ancak ayrı ve testli bir fazda düşünülmeli. **Şimdilik önerilmez.**

## P1-5 · 4 Google font ailesi yükleniyor, public tarafta pratikte 1 tanesi kullanılıyor

**Kanıt** — `app/layout.tsx:2` → `Outfit, Inter, Fraunces, Geist_Mono`; hepsi `subsets:["latin"]`, `display:"swap"`.
Kullanım (layout.tsx hariç): `--font-outfit` 4 · `--font-inter` 4 · `--font-fraunces` 2 · `--font-geist-mono` 2.
Kod yorumu: *"Inter — YALNIZ admin gövde tipografisi için"*, *"public gövde Outfit'e geçti"*.

**Teknik neden** — 4 aile `app/layout.tsx`'te (kök layout) tanımlı → **admin fontları public sayfalarda da** font dosyası + preload üretiyor. `Fraunces` üstelik variable + 2 ekstra eksen (`opsz`, `SOFT`) → daha büyük dosya.

**Tahmini etki** — Public'te 2–3 font ailesinin indirilmesi önlenir; LCP'ye olumlu.

**Zorluk** — Orta (font tanımlarını admin layout'una taşımak). **Risk** — Düşük–orta: admin tipografisi bozulmamalı. **Güvenlik** — Yok.

✅ **Olumlu:** `next/font` self-host + `display:swap` + `adjustFontFallback` doğru kullanılmış → CLS riski düşük. Google Fonts'a runtime bağımlılık yok.

---

# 🟡 P2 — ORTA ETKİ

## P2-1 · `VillaCard` — 1.641 satırlık client component, liste sayfalarında N kez

**Kanıt** — `app/components/villa/VillaCard.tsx` = **1.641 satır**, `"use client"`. `/arama` ve `/kiralik-villalar` sayfa başına 12–100 kart render ediyor (`ALLOWED_PUBLIC_PAGE_SIZES = [12,30,50,100]`).

**Teknik neden** — Kartın tamamı (fiyat hesaplama, favori state, modal tetikleyici, tarih gösterimi) client'a gidiyor → hydration maliyeti kart sayısıyla çarpılıyor. `React.memo` **hiç kullanılmamış** (projede 0).

**Tahmini etki** — INP/TBT'de orta düzey iyileşme; özellikle `pageSize=50/100` seçildiğinde belirgin.

**Zorluk** — Zor. **Risk** — **Orta–yüksek**: fiyat/indirim gösterimi yakın zamanda elden geçirildi.

**Öneri** — Tümünü refactor etmek yerine: (a) kartın statik kısmını (görsel, başlık, konum, rozet) Server Component'e ayır, yalnız favori butonu + modal tetikleyici client kalsın; (b) kısa vadede `React.memo` + kart içi `useMemo` ile yeniden render'ı azalt. **Ölçmeden yapılmamalı.**

## P2-2 · `Header` / `Footer` / `TopBar` her sayfada client component

**Kanıt** — `TopBar.tsx` 671 · `Header.tsx` 561 · `Footer.tsx` 570 satır, hepsi `"use client"`.

**Teknik neden** — Üçü de kök layout üzerinden **her sayfada** var; içlerindeki statik markup (menü linkleri, footer sütunları, sosyal ikonlar) client bundle'ına ve hydration ağacına giriyor. Gerçek interaktivite genelde mobil menü aç/kapa + dil/para birimi seçici ile sınırlı.

**Tahmini etki** — Orta; her sayfaya yayıldığı için toplamda anlamlı.

**Zorluk** — Orta. **Risk** — Düşük–orta (menü/dil değiştirme davranışı korunmalı). **Güvenlik** — Yok.

**Öneri** — "İslands" deseni: gövdeyi Server Component yap, yalnız `MobileMenuToggle`, `LocaleSwitcher`, `CurrencySelector` gibi küçük parçaları client bırak.

## P2-3 · 63 adet `select("*")`

**Kanıt** — `grep 'select("*")'` → **63**. Öne çıkanlar: `villa.repository.server.ts:966,988,1255`, `payment.repository.server.ts:40,126,235`, `villa-discount.repository.server.ts:58`, `blog.repository.server.ts:78`, `offer-request.repository.ts:40,47`.
`/arama`'daki `findSearchResults` de `select("*")` ile **44 kolon** çekiyor (villa payload'ında 44 alan olduğu Faz 1'de doğrulandı).

**Teknik neden** — Eski PostgREST sağlayıcısından "byte-identical" taşınırken projeksiyon daraltılmamış (kod yorumlarında belgeli).

**Tahmini etki** — Ağ + bellek + JSON parse maliyetinde düşüş; `/arama` gibi çok satırlı sorgularda çarpan etkisi.

**Zorluk** — Orta. **Risk** — Orta: kolon listesi daraltılırken bir tüketicinin kullandığı alan atlanırsa **sessiz bozulma** olur. Tip sistemi yardımcı olur ama runtime embed'lerde garanti yok.

**Öneri** — Public yola en yakın 3-4 repository'den başla (`findSearchResults`, villa detay, ödeme yöntemleri). Her değişiklikte ilgili contract testleri çalıştırılmalı.

## P2-4 · `force-dynamic` çok yaygın (95 kullanım) — blog detayı cache'lenebilir

**Kanıt** — `force-dynamic` **95** kullanım; public tarafta 15 dosya. Build tablosu: `/blog/[slug]`, `/de/blog/[slug]`, `/en/blog/[slug]` → **ƒ (dinamik)**; buna karşılık `/blog` (liste), `/kiralik-villalar`, `/rezervasyon-kontrol` → **○ (statik, 10 dk revalidate)**.

**Teknik neden** — Token'lı/kullanıcı durumlu sayfalar (`/favoriler`, `/liste/[token]`, `/v/[token]`) için `force-dynamic` **doğru**. Ancak **blog detayı** nadiren değişen içerik ve `revalidateTag` altyapısı zaten mevcut (`app/api/admin/blog/[id]/route.ts` 3 yerde `revalidatePath` çağırıyor).

**Tahmini etki** — Blog detayda DB sorgusu ≈ 0, TTFB CDN seviyesine düşer.

**Zorluk** — Kolay. **Risk** — Düşük: admin bir yazıyı güncellediğinde invalidation'ın çalıştığı doğrulanmalı.

**Öneri** — Blog detayını `unstable_cache` + `tags:["blog"]` ile sar, `force-dynamic`'i kaldır; admin blog CRUD'unda `revalidateTag("blog")` çağır (şu anki `revalidatePath` yerine daha isabetli).

## P2-5 · `next/image`: `formats` / `qualities` yapılandırılmamış

**Kanıt** — `next.config.ts` içinde `formats`, `qualities`, `deviceSizes`, `imageSizes`, `minimumCacheTTL` **hiçbiri tanımlı değil** → Next 16 varsayılanları geçerli. Kod tabanında `quality=` **0 kullanım**.

**Teknik neden** — Next 16 varsayılanında AVIF üretimi devrede olabilir. **⚠️ DOĞRULANAMADI** — sunucuya erişim yok. AVIF kodlaması WebP'ye göre belirgin şekilde daha CPU-yoğundur; Hetzner VPS'te ilk istekte yavaş optimize + yüksek CPU anlamına gelebilir. Ayrıca `minimumCacheTTL` varsayılanı düşükse optimize görseller sık sık yeniden üretilir.

**Tahmini etki** — Sunucu CPU'sunda ve ilk-görsel gecikmesinde orta düzey.

**Zorluk** — Kolay. **Risk** — Düşük–orta: `formats`'ı WebP'ye sabitlemek görsel boyutunu biraz büyütür (kalite/boyut takası).

**Öneri** — **Önce ölç**: production'da bir villa görselinin `content-type`'ına ve ilk-istek süresine bak. AVIF üretimi CPU'yu yoruyorsa `formats: ["image/webp"]` + `minimumCacheTTL` artırımı değerlendir. Ayrıca `qualities` ile tek bir kalite seviyesine sabitlemek optimize varyant sayısını düşürür.

## P2-6 · Esnek tarih aramasında 6'ya kadar ek paralel sorgu

**Kanıt** — `AramaPageBody.tsx:901-907`
```ts
const shifts = [-3,-2,-1,1,2,3].filter(s => Math.abs(s) <= flexDays);
const blockedSets = await Promise.all(windows.map(w => getBlockedVillaIds(w.s, w.e, poolIds)));
```
**Teknik neden** — `?flexible=3` ile **6 ek availability sorgusu** paralel çalışır (paralel olduğu için latency artmaz, ama DB yükü 6 kat).

**Tahmini etki** — Yalnız esnek arama kullanıldığında; DB bağlantı havuzu `PG_POOL_MAX` varsayılanı **10** olduğundan eşzamanlı esnek aramalarda havuz baskısı yaratabilir. ⚠️ Production `PG_POOL_MAX` değeri **doğrulanamadı**.

**Zorluk** — Orta. **Risk** — Orta (arama sonuç kümesi değişmemeli).

**Öneri** — 6 pencereyi tek bir aralık sorgusuna indirmeyi değerlendir (min shift ile max shift arası tüm blokları bir kez çek, pencereleri JS'te kesiştir). Ayrıca `PG_POOL_MAX`'ı gözden geçir.

---

# 🟢 P3 — KÜÇÜK OPTİMİZASYON

| # | Bulgu | Kanıt | Öneri | Risk |
|---|---|---|---|---|
| P3-1 | `Footer.tsx` 5 adet `fill` kullanıyor, `sizes` **yok** | `grep fill/sizes` | `sizes` ekle → mobilde gereksiz büyük varyant inmez | Yok |
| P3-2 | `globals.css` **1.813 satır** | `wc -l` | Tailwind v4 CSS-first; kullanılmayan `@theme` token/utility'leri gözden geçir | Düşük |
| P3-3 | `React.memo` **0 kullanım** (buna karşılık `useMemo` 115, `useCallback` 69) | grep | Liste kartlarında ölçüp uygula | Düşük |
| P3-4 | `next/dynamic` yalnız **8** yerde, 5 dosyada | grep | Leaflet zaten dynamic ✅; tiptap/editör ve modal'lar için genişlet | Düşük |
| P3-5 | `instrumentation-client.ts:8-12` — **geçici tanı `console.log`** üretime gidiyor (DSN varlığını basıyor) | kodun kendi yorumu: *"çözüm sonrası bu 3 satır geri çıkarılmalı"* | Kaldır | Yok |
| P3-6 | Sentry **source map yüklenmiyor** (`withSentryConfig` yok) | `next.config.ts` | Performans değil ama teşhis süresi; P0-1 ile birlikte ele alınabilir | Düşük |

---

# BÖLÜM BAZINDA DEĞERLENDİRME

## 1 · Bundle — paket envanteri

| Paket | node_modules | Nereden geliyor | Client/Server | Chunk | Fırsat | Risk |
|---|---:|---|---|---:|---|---|
| **`@sentry/*`** | 97 MB | `instrumentation-client.ts` | **CLIENT — her sayfa** | **444 KB** | 🔴 tracing tree-shake | Düşük |
| **`country-state-city`** | 17 MB | `ReservationForm.tsx:11` | **CLIENT — public rezervasyon** | **640 KB** | 🔴 lazy / sunucudan liste | Düşük |
| **`react-datepicker`** | 32 MB | `HeroSearchPanel:14`, `FilterSidebar:38`, `OfferRequestForm:19` | **CLIENT — ana sayfa dahil** | **172 KB** (date-fns ile) | 🔴 `next/dynamic` | Düşük |
| `@tiptap/*` | 9 MB | admin blog/villa editörü | CLIENT — **yalnız admin** | 472 KB | 🟢 zaten izole; dynamic edilebilir | Düşük |
| `leaflet` + `react-leaflet` | 3,9 MB | `MapPicker.tsx` | CLIENT — **yalnız admin, `next/dynamic` ile** ✅ | 148 KB | ✅ sorun yok | — |
| `lucide-react` | 40 MB | yaygın ikon kullanımı | CLIENT | ayrı chunk görünmedi | ✅ per-icon import tree-shake ediliyor | — |
| `date-fns` | 36 MB | takvim + tarih formatlama | CLIENT | datepicker chunk'ı içinde | 🟡 P0-4 ile birlikte düşer | Düşük |
| `react-day-picker` | — | `BookingCalendar.tsx:30` | CLIENT — villa detay | — | 🟡 P1-4 (önerilmez) | Orta-yüksek |
| `embla-carousel` | — | carousel bileşenleri | CLIENT | küçük | ✅ hafif | — |
| `@dnd-kit/*` | — | admin sıralama | CLIENT — **yalnız admin** | küçük | ✅ | — |
| `@aws-sdk/client-s3` | 11 MB | `lib/storage/s3-storage.provider.ts` | **SERVER-ONLY** ✅ | — | ✅ client'a sızmıyor | — |
| `pg`, `jose`, `argon2`, `otplib`, `archiver` | — | server | **SERVER-ONLY** ✅ | — | ✅ | — |

> ✅ **Önemli olumlu bulgu:** Sunucuya ait hiçbir ağır paket (S3 SDK, pg, argon2, sanitize-html) client bundle'ına sızmıyor. `import "server-only"` disiplini (133 dosya) çalışıyor.

## 2 · Client Component analizi (public taraf — 49 dosya)

| Dosya | Satır | Client olmalı mı? | Not |
|---|---:|---|---|
| `VillaCard.tsx` | 1.641 | **Kısmen** | Statik kısım server'a ayrılabilir (P2-1) |
| `FilterSidebar.tsx` | 1.245 | **Evet** | URL state + accordion + datepicker |
| `ReservationForm.tsx` | 1.166 | **Evet** | Form state; ama CSC lazy'lenmeli (P0-2) |
| `OfferRequestForm.tsx` | 925 | Evet | datepicker lazy'lenmeli |
| `VillaCardBookingModal.tsx` | 773 | Evet | ✅ zaten `next/dynamic` ile |
| `HeroSearchPanel.tsx` | 679 | **Kısmen** | datepicker lazy'lenmeli (P0-4) |
| `TopBar / Header / Footer` | 671/561/570 | **Kısmen** | Islands deseni (P2-2) |
| `VillaReviewsSection.tsx` | 668 | Evet | Form + pagination |
| `BookingSidebar / PriceList / BookingCalendar` | 610/577/502 | Evet | Fiyat motoru etkileşimli |
| `Gallery.tsx` | 513 | Evet | Lightbox |

✅ **Ana sayfa mimarisi doğru:** Hero, HeroAdvantageCards, VillaTypeCarousel, LocationCollection, VillaList, DiscountCollection, HomepageReviewsSection, ShortGapsSection → **hepsi Server Component**. Yalnız `FaqSection` client (accordion) — yerinde.

## 3 · Database

| Dosya / fonksiyon | Sorun | Neden yavaş | Öneri | Etki | Risk |
|---|---|---|---|---|---|
| `villa.repository.server.ts:466 findSearchResults` | `select("*")` + 4 embed, **LIMIT yok** | Tüm villa × tüm fiyat/indirim satırı transferi | P0-3 | Yüksek | Orta-yüksek |
| `kiralik-villa/[slug]/page.tsx:252` | 11 paralel **cache'siz** sorgu | Nadiren değişen veri her istekte | P1-1 | Yüksek | Orta |
| `HomePageBody.tsx:62-75` | 3 ardışık `await` | Cache miss'te 3 RTT | `Promise.all` | Düşük | Düşük |
| `AramaPageBody.tsx:901` | Esnek tarihte 6 ek sorgu | Havuz baskısı | P2-6 | Orta | Orta |
| Geneli (63 yer) | `select("*")` | Aşırı veri çekimi | P2-3 | Orta | Orta |
| `lib/admin-route-auth.ts:60-105` | Her admin isteğinde 1-2 `admin_users` sorgusu | 44 admin route × istek | 30-60 sn bellek cache | Düşük-orta | Düşük |

### ✅ N+1 bulunamadı
Taramada döngü içinde `await` yapan **yalnız 1** yer var (`storage-cleanup.ts:53`, bucket bazlı gruplanmış — kabul edilebilir). `.map(async …)` kalıbı **hiç yok**. **102 `Promise.all`** kullanımı var. `getBlockedVillaIds(start, end, candidateIds)` villa başına değil **toplu** çalışıyor. Bu, veri erişiminde bilinçli bir paralelleştirme disiplini gösteriyor — **bu alanda bulgu yok.**

### ⚠️ Index'ler — DOĞRULANAMADI
DB erişimi yok. Repo'nun **aktif** migration'larında yalnız 22 index tanımı var ve bunlar `villa`(6), `admin_sessions`(3), `villa_discounts`(2), `villa_types`(2), `villa_locations`(2), `homepage_collections`(2), `reservation_share_links`(2), `admin_users`(1), `admin_totp_recovery_codes`(1), `villa_zip_links`(1) tablolarına ait. **`villa_prices`, `villa_images`, `villa_feature_relations`, `villa_type_relations`, `villa_distances`, `reservations` için aktif migration'larda index tanımı YOK** (bazıları `_archive/legacy` altında). Bunlar `/arama` ve villa detayın en sık sorguladığı tablolar.

**Yapılması gereken (salt okuma, risksiz):**
```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public' ORDER BY 2,3;

SELECT relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 20;
```
Özellikle şunların varlığı doğrulanmalı: `villa_prices(villa_id)`, `villa_images(villa_id, is_cover, sort_order)`, `villa_feature_relations(villa_id)` ve `(feature_id)`, `villa_type_relations(villa_id)` ve `(type_id)`, `villa_distances(villa_id)`, `reservations(villa_id, start_date, end_date)`.

## 4 · `/arama` — uçtan uca akış

```
URL /arama?…  →  page.tsx (force-dynamic)  →  AramaPageBody (Server Component)
  ① Promise.all: getCachedVillaLocations + getCachedVillaTypes + loadHeroFeatures      (3, cache'li)
  ② koşullu: findVillaTypeRelationsByTypeIds                                            (kategori filtresi varsa)
  ③ koşullu: findVillaFeatureRelationsByFeatureIds                                      (özellik filtresi varsa)
  ④ Promise.all: findSearchResults + reviewStatsMap        ← 🔴 ANA MALİYET (LIMIT yok)
  ⑤ getBlockedVillaIds(start,end,candidateIds)                                          (tarih varsa, toplu ✅)
  ⑥ koşullu: 6× getBlockedVillaIds (esnek tarih)                                        (flexible=3 ise)
  ⑦ Promise.all: cookies + exchangeRates
  ⑧ getVillaBadgesByLocale
  ⑨ locale≠tr: getVillaTypeNamesByLocale + feature çevirileri
  →  JS'te: filtre → sırala → slice(page)  →  VillaCard × pageSize (client hydration)
```
**Cevaplar:** Sorgu dalgası ≈ **8–12**. Sayfa başına çekilen kayıt: **eşleşen TÜM villalar** (sayfa boyutu kadar değil). Gereksiz veri: evet — görünmeyen villaların fiyat/indirim satırları. Pagination **DB seviyesinde DEĞİL**. Filtreler kısmen SQL'e aktarılıyor (kategori/bölge/misafir ✅; availability, kur dönüşümlü sıralama ve esnek tarih JS'te ❌). `ORDER BY sort_order, created_at` — index kullanımı **doğrulanamadı**. `COUNT` sorgusu **yok** (JS'te `.length`) — bu yönüyle COUNT maliyeti yok ama tüm satırları çekme maliyeti var. Villa görselleri `limit 1` ile slim ✅. Aynı villa için tekrar sorgu **yok** ✅.

## 5 · Ana sayfa
Server-side render ✅ (tüm ağır bölümler Server Component). Gereksiz client component **yok** (yalnız FaqSection). Büyük JS: **772 KB paylaşılan + 172 KB datepicker** → P0-1 + P0-4. Gereksiz API çağrısı yok; veriler `unstable_cache` ile (600–3600 sn) korunuyor ✅. Aynı verinin tekrar çekilmesi gözlenmedi. Lazy-load fırsatı: hero datepicker.

## 6 · Villa detay
İlk açılışta **12 sorgu** (1 + 11 paralel). İlk ekranda gerçekten gerekenler: villa, görseller (ilk 1-2), fiyat, settings. **Lazy-load edilebilir:** yorumlar (`reviews`, `reviewStats`), mesafeler, kurallar, fiyata dahiller, benzer villalar → `<Suspense>` ile stream'e alınabilir. Booking/calendar bileşenleri (`BookingSidebar`, `BookingCalendar`, `PriceList`, `AvailabilityInlineCalendar`) client — **bu doğru**, fiyat motoru etkileşimli. `VillaCardBookingModal` zaten `next/dynamic` ✅.

## 7 · Image
`next/image` 12 dosyada, 34 kullanım. `priority` 15 · `sizes` 14 · `loading="lazy"` 16 · `placeholder` 174 · `quality` **0**. `fill` kullanıp `sizes` vermeyen: **Footer** (public) + 2 admin dosyası. CDN: `cdn.villayagel.com` / `assets.villayagel.com` (R2) + legacy `**.supabase.co` wildcard. `next.config.ts`'te `formats/qualities/minimumCacheTTL` tanımlı değil → P2-5.

## 8 · Cache
**18 `unstable_cache`**, 8 tag: `settings`(3600) · `menu`(3600) · `taxonomy`(3600) · `faqs`(3600) · `villas`(600) · `homepage`(600) · `discount`(600) · `villa-reviews`(600/3600). `revalidateTag` 18, `revalidatePath` 6. Tag ↔ helper eşlemesi dosya başında belgeli — **iyi tasarlanmış**.

| Cache'lenebilir ✅ | Cache'lenmemeli ❌ |
|---|---|
| Villa görselleri, mesafeler, özellikler, kurallar, fiyata dahiller | **Fiyatlar (`villa_prices`)** |
| Taksonomi, ayarlar, menü, SSS, blog | **İndirimler (`villa_discounts`)** |
| Yorumlar / yorum istatistikleri | **Availability / external calendar blokları** |
| Ana sayfa koleksiyonları | **Rezervasyon verisi · tüm admin verisi** |

## 9 · Next.js mimarisi
App Router ✅ · Server Components doğru kullanılmış ✅ · Server Actions **authz korumalı** (önceki faz) ✅ · Route Handlers ✅ · **Streaming/Suspense yok** ❌ (P1-2) · `generateStaticParams` **0** → dinamik route'lar on-demand · `generateMetadata` 62 ✅ · **Middleware yalnız `/maki-admin/:path*`** → **public sayfalarda middleware maliyeti SIFIR** ✅

## 10 · Font / CSS
4 aile (Outfit/Inter/Fraunces/Geist Mono), hepsi `latin` subset + `display:swap`, `next/font` self-host ✅. Fraunces 2 ekstra variable eksen. Tümü kök layout'ta → public'e admin fontları da sızıyor (P1-5). `globals.css` 1.813 satır, Tailwind v4 `@import "tailwindcss"` + `@theme` (config dosyası yok).

## 11 · Third-party
| Servis | Yükleme şekli | Değerlendirme |
|---|---|---|
| **Google Tag Manager** | `next/script` `strategy="afterInteractive"`, **`gtmId` varsa koşullu** | ✅ Doğru strateji. GTM yine de ana iş parçacığını meşgul eder; `worker` stratejisi (Partytown) değerlendirilebilir — **risk: GTM'in DOM erişimi bozulabilir** |
| **custom_head_scripts** (admin) | `dangerouslySetInnerHTML`, `<head>` içinde, koşullu | ⚠️ Ne konduğu admin'e bağlı; render-blocking olabilir. **İçerik doğrulanamadı** |
| **analytics_script** (admin) | `dangerouslySetInnerHTML`, `<body>` içinde, koşullu | ⚠️ Aynı |
| **Google Maps iframe** | İletişim + private villa sayfası, `loading="lazy"` | ✅ Sadece o sayfalarda |
| **WhatsApp / sosyal** | `wa.me` linkleri (script değil) | ✅ Maliyet yok |
| **Sentry** | `instrumentation-client.ts` | 🔴 P0-1 |

---

# 🚀 SİTEYİ HIZLANDIRMA ROADMAP

| # | Madde | ETKİ | ZORLUK | RİSK | TAHMİNİ KAZANÇ |
|---|---|---|---|---|---|
| **1** | **ÖNCE ÖLÇ** — production'da villa sayısı, `/arama` p50/p95, DB index envanteri (`pg_indexes`, `pg_stat_user_tables`), `PG_POOL_MAX`, görsel `content-type` | — | Kolay | **Yok** (salt okuma) | Diğer 9 maddenin önceliğini belirler |
| **2** | Hero datepicker'ı `next/dynamic` ile lazy'le (P0-4) | **Çok yüksek** | **Kolay** | Düşük | Ana sayfada **−172 KB** |
| **3** | Sentry tracing kodunu tree-shake et (P0-1) | **Çok yüksek** | Orta | Düşük | Her sayfada **−150…300 KB** |
| **4** | `country-state-city`'yi rezervasyon sayfasından çıkar (P0-2) | **Çok yüksek** | Kolay-orta | Düşük | Checkout'ta **−640 KB** |
| **5** | `loading.tsx` + `<Suspense>` ekle (arama, liste, villa detay) (P1-2) | **Yüksek** (algılanan) | **Kolay** | Çok düşük | Boş ekran süresi ~0 |
| **6** | Villa detayda **yalnız statik** verileri cache'le — fiyat/indirim/availability HARİÇ (P1-1) | **Yüksek** | Orta | **Orta** | 12 → 1-2 sorgu/ziyaret |
| **7** | Madde 1'de eksik çıkan index'leri ekle (`villa_prices`, `villa_images`, `*_relations`, `reservations`) | **Yüksek** (muhtemel) | Kolay | Düşük | ⚠️ ölçüme bağlı |
| **8** | `/arama`'da embed'leri yalnız görünen sayfaya indir, sonra SQL `LIMIT/OFFSET` (P0-3) | **Yüksek** | **Zor** | **Orta-yüksek** | İstek maliyeti villa sayısından bağımsızlaşır |
| **9** | Blog detayını cache'le + `force-dynamic` kaldır; Footer'a `sizes`; `formats`/`minimumCacheTTL` ayarla (P2-4, P3-1, P2-5) | Orta | Kolay | Düşük | TTFB ↓, görsel bant ↓ |
| **10** | Header/Footer/TopBar "islands"; `select("*")` daraltma; `React.memo` (P2-2, P2-3, P2-1) | Orta | Orta-zor | Orta | Hydration + transfer ↓ |

---

# GÜVENLİ / RİSKLİ AYRIMI

### ✅ Güvenli (güvenlik veya iş mantığı etkisi YOK)
Madde 1 (ölçüm) · 2 (datepicker lazy) · 3 (Sentry tree-shake) · 4 (CSC lazy) · 5 (loading/Suspense) · 9 (blog cache, `sizes`, image formats) · P3-1…P3-6

### ⚠️ Dikkatli ilerlenmeli
- **Madde 6** — villa detay cache: **fiyat / indirim / availability KESİNLİKLE cache'lenmemeli.** Yanlış fiyat gösterimi ticari zarar demektir.
- **Madde 7** — index ekleme migration gerektirir; büyük tabloda `CREATE INDEX CONCURRENTLY` tercih edilmeli.
- **Madde 8** — `/arama` URL kontratı, filtre semantiği, `forceEmpty` tuzağı ve SEO `ItemList` korunmalı.
- **Madde 10** — `VillaCard` fiyat/indirim gösterimi yakın zamanda elden geçirildi; contract testleri ile doğrulanmalı.

### ❌ Önerilmeyen
- **P1-4** takvim kütüphanesi birleştirme — booking takvimi yeni elden geçirildi, kazanç/risk oranı kötü.
- **Client'a geri taşıma** — hiçbir öneri PHASE 3 PII-safe akışını, Server Action authorization'ı, admin permission enforcement'ı veya server-side DB erişimini geri almaz. `/api/public/reservations`, `adminFetch` delegasyonu ve `import "server-only"` sınırları **aynen korunmalıdır**.

---

# DOĞRULANAMAYANLAR

1. Production DB index envanteri ve `EXPLAIN` planları — **en kritik eksik**
2. Gerçek villa sayısı ve `/arama` yanıt süreleri
3. `PG_POOL_MAX` production değeri
4. `next/image` varsayılan `formats` davranışı ve görsel optimizasyon CPU maliyeti
5. `custom_head_scripts` / `analytics_script` içeriği (admin'e bağlı)
6. Turbopack build'inin gerçek chunk bölünmesi (bu rapor webpack build'inden okundu)
7. CDN cache politikaları (Cloudflare/R2)
8. Gerçek Core Web Vitals (LCP/INP/CLS) alan verisi

---

*Bu rapor salt okunur bir analizdir. Repository'de bu dosya dışında hiçbir değişiklik yapılmamıştır; kod, paket, migration, DB, config ve production'a dokunulmamıştır. Commit/push yapılmamıştır.*
