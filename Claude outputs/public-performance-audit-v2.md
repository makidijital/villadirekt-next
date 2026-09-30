# PUBLIC TARAF — PERFORMANS + MİMARİ AUDIT (v2)

- Tarih: 2026-09-23
- Commit: `9dc4566` (fix: sync admin reservation discount snapshots)
- Kapsam: yalnızca public sayfalar, public API'ler, public'i etkileyen ortak altyapı (root layout, CSS, font, DB client, cache helper'lar). Admin'e girilmedi.
- Yöntem: salt-okunur kod okuma, offline `next build --webpack` çıktısının analizi, repository metotlarının DB'ye bağlanmadan SQL yakalanması (`nativeDbProvider` metotları repo DIŞINDA bir script ile override edildi).
- Önceki audit raporlarına güvenilmedi; her iddia yeniden test edildi (bkz. §14).

## 0. Ölçüm / Tahmin ayrımı ve kısıtlar

| Etiket | Anlamı |
|---|---|
| **[ÖLÇÜLDÜ]** | Build çıktısı, dosya boyutu, gzip, HTML script tag'leri veya yakalanan SQL üzerinden gerçekten ölçüldü |
| **[KOD KANITI]** | Kaynak kodda dosya:satır olarak gösterildi, çalışma zamanında ölçülmedi |
| **[TAHMİN]** | Mekanizmadan türetilmiş beklenen etki; ölçülmedi |
| **[ÖLÇÜLEMEDİ]** | Erişim yok; §21'de ölçüm scripti verildi |

**Çalıştırılamayanlar:**
- **DB EXPLAIN / pg_indexes:** Supabase pooler'a (`aws-0-eu-west-1.pooler.supabase.com:5432`) çalışma ortamından DNS çözümlenemedi (`EAI_AGAIN`). `psql` yok; node `pg` ile `BEGIN READ ONLY; SELECT 1` denemesi DNS'te düştü. **Hiçbir DB sorgusu çalışmadı**, yani hiçbir EXPLAIN planı yok. Tüm plan beklentileri [TAHMİN] olarak işaretlendi.
- **Canlı site (villayagel.com, cdn/assets):** Egress proxy'si 403 döndü. Bu nedenle TTFB, LCP, CDN cache header'ları ve gerçek font boyutları ölçülemedi. Engeli aşmak için başka bir yol denenmedi.
- **Offline build:** Google Fonts mock'landı (`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`), bu yüzden font byte'ları ölçülemedi. DB olmadan build alındığı için static HTML içindeki veri boş; HTML/RSC boyutları **alt sınırdır**. EN/DE rotaları, `requirePublicLocaleEnabled` → `notFound()` nedeniyle 404 olarak prerender edildi (build artefaktı, prod davranışı değil).

**Git durumu:** Audit boyunca repo'da hiçbir dosya değişmedi. Tek yeni dosya bu rapor. `Claude outputs/` **gitignore'da değil** (klasördeki diğer raporlar tracked), dolayısıyla `git status` bu dosyayı `?? Claude outputs/public-performance-audit-v2.md` olarak gösterir. Bunun dışında status temiz.

---

## 1. Public Architecture Map

```
Stack: Next 16.3.5 (App Router, webpack build) · React 19.2.4 · Node 22 · Tailwind 4 · pg ^8.13.1
DB   : Supabase Postgres, session-mode pooler eu-west-1:5432, PG_POOL_MAX=10 (lib/db/pg.client.ts:61-63)
Cache: unstable_cache (lib/cache.helpers.ts) — React cache() yalnız villa detayında
MW   : middleware.ts matcher = "/maki-admin/:path*"  → public rotalar middleware'den GEÇMEZ [KOD KANITI]

app/layout.tsx  (ROOT — tüm public + admin)
 ├─ 4 Google font (Outfit, Inter, Fraunces[opsz,SOFT], Geist_Mono)  → 4 font preload
 ├─ import "leaflet/dist/leaflet.css"   (yalnız admin kullanıyor)
 ├─ getCachedSettings() ×2 (L81 metadata, L150 body)
 ├─ GTM afterInteractive + customHead (dangerouslySetInnerHTML) + analyticsScript
 └─ <CurrencyProvider> (client) → useEffect: fetch /api/exchange-rates (her full load)
     │
     ├─ app/(public)/layout.tsx
     │   ├─ getCachedSettings (L46)
     │   ├─ HeaderWrapper (server): settings → menu → Promise.all(3 isim)   [sıralı]
     │   │    └─ Header (client, 561 satır), TopBar (client, 671, tek Suspense)
     │   ├─ FooterWrapper (server): allSettled → villaTypeNames → pageTitles [sıralı]
     │   │    └─ Footer (client, 570)
     │   ├─ CookieConsent (client), MaintenanceScreen, FloatingSocial (server)
     │   └─ BottomNav (client, 326), ScrollToTopButton (client)
     │
     │   Sayfalar (TR kök + /en, /de ayna — 34 EN/DE sayfa):
     │   /                        ISR 600s  (tek statik public sayfa)
     │   /kiralik-villalar        dynamic (cookies + searchParams)
     │   /arama                   force-dynamic
     │   /kiralik-villa/[slug]    dynamic (searchParams start/end)
     │   /rezervasyon/[slug]      dynamic
     │   /rezervasyon/basarili, /rezervasyon-kontrol, /teklif-al, /iletisim
     │   /blog                    dynamic   /blog/[slug]  force-dynamic
     │   /kisa-sureli-tarihler/[ay]/[gece]  force-dynamic
     │   /favoriler, /favoriler/paylas/[token], /liste/[token], /v/[token]
     │
     └─ app/p/layout.tsx → /p/[slug] (CMS)  dynamic, generateStaticParams yok

Public API (app/api/...):
 exchange-rates · public/villas/[id]/blocked-ranges · public/villas/[id]/availability
 public/payment-methods · public/taxonomies · public/reservations (POST)
 public/contact (POST) · public/offer-requests (POST) · public/reservation-lookup (POST)
 mail/reservation-request (POST) · voucher/[id] · villa-zip/[token]
```

**Mimari gözlemler [KOD KANITI]:**
- **Hiçbir public rota `generateStaticParams` kullanmıyor.** Dinamik segmentler (villa, blog, CMS) için on-demand ISR yok.
- Tek ISR sayfa `/`: `prerender-manifest` içinde revalidate 600 **[ÖLÇÜLDÜ]**.
- `loading.tsx` ve Suspense streaming yok. Uygulamadaki tek Suspense, TopBar'daki `useSearchParams` çevresinde.
- Public'te tek veri erişim yolu `lib/db/query-compiler.ts`. Embed'ler, parent satır başına çalışan **correlated scalar subquery**'ye (`json_agg`) derleniyor: tek round-trip, ama maliyet child FK index'ine bağlı.

---

## 2. Sayfa sayfa data flow

### 2.1 Homepage
```
PAGE: Homepage
URL: /  (+ /en, /de)
Render: ISR, revalidate 600 [ÖLÇÜLDÜ: prerender-manifest]; headers()/cookies() yok
Data flow: HomePageBody.tsx → getCachedSettings (L62) → getCachedFaqs (L70) → getCachedGlobalReviewStats (L75)
           çocuklar: Hero, HeroAdvantageCards, DiscountCollection (2 await), VillaTypeCarousel,
           VillaList (getCachedVillas fallback), LocationCollection, ShortGapsSection, FaqSection,
           HomepageReviewsSection
DB queries: hepsi unstable_cache arkasında; yalnızca ISR regenerate sırasında çalışır
Sequential: HomePageBody 3 await sıralı (yalnız regenerate'i etkiler, kullanıcı TTFB'sini değil)
Parallel: getCachedVillas içinde Promise.all([listPublic, getVillaReviewStatsBatch])
Cache: ISR 600s + unstable_cache tag'leri (villas, villa-reviews, faqs, homepage, discount, settings)
Client JS: 280 KB gz [ÖLÇÜLDÜ] — react-datepicker (HeroSearchPanel), embla, date-fns, 3 sözlük
Bottlenecks: (1) JS 280 KB gz; (2) 4 font preload; (3) CurrencyProvider → /api/exchange-rates (no-store, Upstash + DB);
             (4) getCachedVillas LIMIT'siz → 2MB limit riski
```

### 2.2 Villa listesi
```
PAGE: Kiralık villalar
URL: /kiralik-villalar
Render: dynamic (cookies() + searchParams) — her istekte SSR
Data flow: KiralikVillalarPageBody.tsx L177 Promise.all([getCachedVillas, getCachedVillaLocations,
           getCachedVillaTypes, cookies()]) → JS sort → slice (L222) → badges (L228) → typeNames (L261, EN/DE)
DB queries: cache hit'te 0; miss'te listPublic (LIMIT yok) + tüm onaylı review'lar
Sequential: badges → typeNames (EN/DE)
Parallel: ilk 4'lü Promise.all
Cache: unstable_cache 600s (villas, villa-reviews)
Client JS: 273 KB gz [ÖLÇÜLDÜ] (FilterSidebar → react-datepicker, date-fns)
Bottlenecks: JSON-LD ItemList TÜM villaları basıyor (L296-305) — sayfalanmış liste değil;
             tüm liste her istekte cache'ten deserialize edilip JS'te sıralanıyor
```

### 2.3 Arama
```
PAGE: Arama
URL: /arama?start&end&guests&location&type&features&flex...
Render: force-dynamic, server component (AramaPageBody.tsx, 1.895 satır)
Data flow (dalgalar):
  W1 L287  Promise.all(locations, types, features)            [cached]
  W2 L419  category relations                                  [sıralı]
  W3 L486  feature relations                                   [sıralı]
  W4 L589  Promise.all(findSearchResults, getVillaReviewStatsBatch())   [İKİSİ DE CACHE'SİZ]
  W5 L885  getBlockedVillaIds(tüm adaylar)  (RPC)              [tarih varsa]
  W6 L926  flexible: Promise.all(6 kaydırılmış pencere RPC)    [flex modunda]
  W7 L969  Promise.all(cookies(), ratesMap)
  W8 L1004-1010 calculateGrandTotal tüm görünür villalar için (yalnız fiyat sıralaması + tarih)
  W9 L1055 JS sort → slice (sayfalama JS'te)
  W10 L1061 badges → W11 L1112 typeNames
DB queries: findSearchResults (LIMIT yok, fiyat + indirim embed'li), villa_reviews (tüm onaylılar),
            get_blocked_villa_ids ×1 veya ×7 (flex)
Sequential: 7–10 dalga; W2→W3 ve W10→W11 bağımsız görünüyor
Parallel: W1, W4, W6, W7
Cache: YOK (findSearchResults ve review stats batch cache'siz)
Client JS: 273 KB gz [ÖLÇÜLDÜ]
Bottlenecks: en ağır public sorgu yolu; LIMIT'siz + cache'siz + tüm review'lar + 7'ye kadar RPC
```

### 2.4 Villa detay
```
PAGE: Villa detay
URL: /kiralik-villa/[slug]?start&end
Render: dynamic (searchParams start/end booking range'i seed ediyor, L178-192)
Data flow: cache(getVillaBySlug) (L101) → metadata + page dedupe ✓
           metadata ayrıca getCachedSettings (L147)
           L252 Promise.all(11):
             cache'siz: getVillaImages (DUPLICATE — findBySlug zaten tüm görselleri embed ediyor),
                        prices, discounts, distances, features, rules, priceIncludes,
                        fetchExternalCalendarStringsForVilla
             cached   : getCachedSettings, getCachedVillaReviews, getCachedVillaReviewStats
           VillaDetailBody → SimilarVillasSection (async, Suspense YOK):
             findSimilarCards(aynı lokasyon, 3) → <3 ise ikinci findSimilarCards → EN/DE getTranslationsForParents
DB queries: 1 (slug) + 8 cache'siz + 1–3 similar = 10–12 sorgu / istek
Sequential: slug → Promise.all(11) → similar (1–3 sıralı)
Parallel: 11'li Promise.all ✓
Cache: sadece settings/reviews; villa verisi her istekte DB'den
Client JS: 258 KB gz [ÖLÇÜLDÜ] (react-day-picker, date-fns)
Client fetch: blocked-ranges ×2 (AvailabilityInlineCalendar + BookingSidebar, ikisi de no-store) + exchange-rates
Bottlenecks: her istek SSR + 10–12 sorgu; duplicate images; similar villalar stream edilmiyor; 2× blocked-ranges
Not: villa yoksa inline 404 bölümü render ediliyor ama HTTP 200 dönüyor (soft-404)
```

### 2.5 Rezervasyon
```
PAGE: Rezervasyon formu
URL: /rezervasyon/[slug]
Render: dynamic
Data flow: ReservationPageBody.tsx getVillaBySlug (L83) → getVillaPrices (L98) → getVillaDiscounts (L99) → getVillaImages (L100)
DB queries: 4, TAMAMI SIRALI; son 3'ü birbirinden bağımsız; images duplicate (findBySlug embed ediyor)
Cache: yok
Client JS: 356 KB gz [ÖLÇÜLDÜ] — en ağır public rota
Client fetch: /api/public/payment-methods (ReservationForm L211), /api/exchange-rates
Bottlenecks: country-state-city (~135 KB gz, ReservationForm L124-160); 4 sıralı await
```

### 2.6 Blog
```
PAGE: Blog index / Blog detay
URL: /blog , /blog/[slug]
Render: /blog dynamic; /blog/[slug] force-dynamic (L14)
Data flow index: getBlogPosts → resolveBlogListContent
Data flow detay: generateMetadata (blog-metadata.ts L71,79) getBlogPostBySlug + resolveBlogContent
                 page (BlogDetailPageBody.tsx L44,47) AYNI ikili → React cache() yok → DUPLICATE
                 sanitizeHtml her istekte
Cache: yok
Client JS: 213 KB gz [ÖLÇÜLDÜ] (taban)
Bottlenecks: içerik neredeyse statik olduğu halde force-dynamic; metadata+page sorgu tekrarı
```

### 2.7 CMS sayfaları
```
PAGE: CMS (KVKK, hakkımızda vb.)
URL: /p/[slug]
Render: dynamic, generateStaticParams/revalidate yok
Data flow: cms-page-metadata.ts L45,57 getPageBySlug + resolvePageContent; page.tsx L44,71 AYNI → DUPLICATE
Cache: yok
Client JS: 213 KB gz [ÖLÇÜLDÜ]
Bottlenecks: statik içerik her istekte 2× sorgu; bulunamazsa soft-404 (HTTP 200)
```

### 2.8 Diğer public rotalar
| Rota | Render | JS gz [ÖLÇÜLDÜ] | Not |
|---|---|---|---|
| `/teklif-al` | dynamic | 272 KB | OfferRequestForm → HeroSearchPanel → react-datepicker |
| `/kisa-sureli-tarihler/[ay]/[gece]` | force-dynamic | 217 KB | kısa boşluk hesabı her istekte |
| `/v/[token]` | dynamic | 250 KB | react-day-picker |
| `/rezervasyon/basarili` | dynamic | 213 KB | taban |
| `/iletisim` | — | — | static HTML 60 KB raw / 12 KB gz (alt sınır) |
| `/favoriler`, `/liste/[token]`, `/rezervasyon-kontrol` | dynamic | ölçülmedi ayrıca | client ağırlıklı |

---
## 3. DB Audit

> **Hiçbir EXPLAIN çalıştırılamadı** (DB erişilemez, §0). Aşağıdaki SQL'ler repository metotları gerçekten çağrılarak **yakalandı [ÖLÇÜLDÜ]**. Index bilgisi `db/migrations/**` taranarak çıkarıldı [KOD KANITI]. `villa_prices`, `villa_images`, `villa_reviews` vb. tablolar `db/migrations`'tan eski, dolayısıyla prod'da baseline'dan gelen index'ler olabilir: **doğrulanamadı**. PLAN satırları [TAHMİN].

### 3.1 listPublic (getCachedVillas)
```
QUERY: SELECT *,
  (SELECT json_build_object('name',e0.name) FROM villa_locations e0 WHERE e0.id=villa.location_id) AS location,
  (SELECT coalesce(json_agg(__lim.__row),'[]') FROM (SELECT json_build_object(image_url,is_cover,sort_order) AS __row
     FROM villa_images e1 WHERE e1.villa_id=villa.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) __lim) AS villa_images,
  (SELECT coalesce(json_agg(json_build_object(price,currency,start_date)),'[]') FROM villa_prices e2 WHERE e2.villa_id=villa.id) AS villa_prices
FROM villa WHERE is_active=$1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at DESC      -- LIMIT YOK
CURRENT INDEX: villa(sort_order), villa(deleted_at) migrations'ta var. villa_images(villa_id) ve villa_prices(villa_id) migrations'ta YOK — prod doğrulanamadı
PLAN: [TAHMİN] villa Seq/Index Scan + her satır için 3 SubPlan; child FK index yoksa her SubPlan Seq Scan → O(villa × child_rows)
PROBLEM: SELECT * (46 kolon, description + seo_description dahil) + tüm fiyat satırları; sonuç tek unstable_cache girdisi
ÖNERİLEN INDEX: villa_images(villa_id, is_cover DESC, sort_order); villa_prices(villa_id, start_date)  — ÖNCE pg_indexes ile var mı bak
BEKLENEN ETKİ: [TAHMİN] index yoksa SubPlan'lar Seq Scan → Index Scan; villa sayısı × child satır oranında kazanç
RİSK: Düşük (CREATE INDEX CONCURRENTLY, yazma yükü küçük tablolar). Bu audit'te oluşturulmadı.
```

### 3.2 findSearchResults (/arama)
```
QUERY: listPublic şekli + villa_prices(price,currency,start_date,end_date) + villa_discounts (ORDER BY start_date)
       WHERE is_active AND deleted_at IS NULL AND guests >= $2 [AND id IN (...)] [AND location_id IN (...)]   -- LIMIT YOK, cache YOK
CURRENT INDEX: villa_discounts(villa_id) ve (villa_id,start_date,end_date) VAR; villa_prices(villa_id) migrations'ta YOK
PLAN: [TAHMİN] villa filtre + 4 SubPlan / satır
PROBLEM: Her /arama isteği tüm uygun villaları + tüm fiyat/indirim satırlarını çekiyor; sayfalama JS'te (L1055)
ÖNERİLEN INDEX: villa_prices(villa_id, start_date) (3.1 ile aynı); villa(is_active, guests) WHERE deleted_at IS NULL — villa sayısı büyükse
BEKLENEN ETKİ: [TAHMİN] asıl kazanç index'ten değil, sonucu cache'lemek/daraltmaktan gelir (bkz. P0-2)
RİSK: Düşük
```

### 3.3 findBySlug (villa detay, rezervasyon)
```
QUERY: SELECT *, location, (tüm villa_images json_agg ORDER BY is_cover DESC, sort_order ASC)
       FROM villa WHERE slug=$1 AND is_active=$2 AND deleted_at IS NULL
CURRENT INDEX: migrations'ta villa(slug) index/unique YOK — prod doğrulanamadı
PLAN: [TAHMİN] unique index yoksa Seq Scan on villa (villa küçükse ms altı)
PROBLEM: Her villa detay / rezervasyon isteğinin ilk (kritik yol) sorgusu
ÖNERİLEN INDEX: UNIQUE villa(slug) WHERE deleted_at IS NULL — ÖNCE duplicate slug kontrolü (§21 script)
BEKLENEN ETKİ: [TAHMİN] villa sayısı yüzlerle sınırlıysa küçük; ama unique constraint doğruluk da sağlar
RİSK: Orta — mevcut veride duplicate slug varsa unique index oluşturma başarısız olur
```

### 3.4 findSimilarCards
```
QUERY: ... WHERE is_active AND deleted_at IS NULL AND location_id=$2 AND NOT (id IN ($3)) LIMIT $4
CURRENT INDEX: villa(location_id) migrations'ta görülmedi
PLAN: [TAHMİN] küçük tabloda Seq Scan + filtre; LIMIT 3
PROBLEM: 1–2 kez sıralı çalışıyor, cache'siz
ÖNERİLEN INDEX: Gerekli değil (villa tablosu küçükse). Önce ölç.
BEKLENEN ETKİ: düşük
RİSK: —
```

### 3.5 Villa detay child sorguları
```
QUERY: SELECT * FROM villa_images WHERE villa_id=$1 ORDER BY sort_order ASC     (duplicate)
       SELECT * FROM villa_prices WHERE villa_id=$1 ORDER BY start_date ASC
       SELECT * FROM villa_discounts WHERE villa_id=$1
       + distances / features / rules / price_includes (villa_id=$1)
CURRENT INDEX: yalnız villa_discounts(villa_id) migrations'ta var; diğerleri doğrulanamadı
PLAN: [TAHMİN] FK index yoksa her biri Seq Scan
PROBLEM: 8 cache'siz sorgu / istek; bunlar pool'dan 8 connection ister (PG_POOL_MAX=10)
ÖNERİLEN INDEX: villa_images(villa_id, sort_order), villa_prices(villa_id, start_date),
                villa_distances(villa_id), villa_features(villa_id), villa_rules(villa_id), villa_price_includes(villa_id)
BEKLENEN ETKİ: [TAHMİN] tablo boyutuna bağlı; asıl kazanç sorgu sayısını azaltmak/cache'lemek
RİSK: Düşük
```
**Pool notu [KOD KANITI + TAHMİN]:** Tek bir villa detay isteği Promise.all ile 8 cache'siz sorguyu aynı anda başlatıyor. PG_POOL_MAX=10 ile birkaç eşzamanlı detay isteği pool'u doldurur ve sorgular kuyrukta bekler. Bu ölçülemedi.

### 3.6 Review istatistikleri
```
QUERY: SELECT villa_id, rating FROM villa_reviews WHERE is_approved=$1            (getVillaReviewStatsBatch)
       findAllApprovedRatings (getGlobalReviewStats)
CURRENT INDEX: villa_reviews için migrations'ta index YOK
PLAN: [TAHMİN] Seq Scan, tüm onaylı satırlar uygulamaya taşınıyor, JS'te aggregate
PROBLEM: /arama'da (L589) CACHE'SİZ çalışıyor → her aramada tüm review tablosu okunuyor
ÖNERİLEN INDEX: Index yerine SQL aggregate: SELECT villa_id, avg(rating), count(*) ... GROUP BY villa_id;
                opsiyonel villa_reviews(is_approved, villa_id) INCLUDE (rating)
BEKLENEN ETKİ: [TAHMİN] transfer satır sayısı → villa sayısına düşer
RİSK: Düşük (aggregate sonucu JS aggregate ile birebir karşılaştırılmalı: yuvarlama)
```

### 3.7 get_blocked_villa_ids (RPC)
```
QUERY: language sql STABLE SECURITY DEFINER (db/migrations/_archive/legacy/039_availability_rpc.sql)
  SELECT villa_id FROM reservations WHERE status IN ('pending','confirmed') AND start_date < p_end AND end_date > p_start
         AND (p_villa_ids IS NULL OR villa_id = ANY(p_villa_ids))
  UNION manual_reservations (...) UNION external_calendar_events (... AND is_active)
CURRENT INDEX: reservations(villa_id,start_date,end_date) WHERE status IN(...) ✓; manual_reservations(villa_id,start_date,end_date) ✓;
               external_calendar_events 4 index ✓
PLAN: [TAHMİN] SECURITY DEFINER → inline edilmez; generic plan'da "p_villa_ids IS NULL OR ..." index kullanımını bozabilir
PROBLEM: /arama flex modunda 7 kez çağrılıyor
ÖNERİLEN INDEX: Index değil — önce EXPLAIN (§21). Gerekirse OR-null yerine iki dal (IF) — FONKSİYON DEĞİŞİKLİĞİ, dikkat
BEKLENEN ETKİ: NEEDS MEASUREMENT
RİSK: YÜKSEK — müsaitlik doğruluğunu etkiler; yalnız ölçümle ve testle değiştirilmeli
```

---

## 4. Next.js Cache Audit

| # | Konu | Dosya:Satır | Durum | Etiket |
|---|---|---|---|---|
| C1 | Tek ISR sayfa `/` revalidate 600 | `app/(public)/page.tsx` + prerender-manifest | ✓ doğru | [ÖLÇÜLDÜ] |
| C2 | `unstable_cache` 2MB/girdi limiti | `node_modules/next/dist/server/lib/incremental-cache/index.js:517-524` ("items over 2MB can not be cached") | custom cacheHandler yok → aktif | [KOD KANITI] |
| C3 | `getCachedVillas` LIMIT'siz, 46 kolon + tüm fiyatlar | `lib/cache.helpers.ts:111-115` | 2MB'ı aşarsa **sessizce her istekte DB'ye gider** | Mekanizma [KOD KANITI], boyut [ÖLÇÜLEMEDİ] |
| C4 | React `cache()` yok | `lib/cache.helpers.ts` (yalnız unstable_cache) | getCachedSettings ~10 çağrı/istek; her biri incremental-cache lookup + JSON parse | [KOD KANITI] |
| C5 | Blog detay duplicate | `blog-metadata.ts:71,79` + `BlogDetailPageBody.tsx:44,47` | cache() yok → 2× | [KOD KANITI] |
| C6 | CMS duplicate | `cms-page-metadata.ts:45,57` + `app/p/[slug]/page.tsx:44,71` | 2× | [KOD KANITI] |
| C7 | Villa detay dedupe | `app/(public)/kiralik-villa/[slug]/page.tsx:101` `cache(getVillaBySlug)` | ✓ doğru | [KOD KANITI] |
| C8 | `/arama` sonuçları + review batch | `AramaPageBody.tsx:589` | cache yok | [KOD KANITI] |
| C9 | Blog detay `force-dynamic` | `app/(public)/blog/[slug]/page.tsx:14` | ISR mümkünken kapalı | [KOD KANITI] |
| C10 | `generateStaticParams` | tüm public | hiçbir yerde yok | [KOD KANITI] |
| C11 | exchange-rates | `app/api/exchange-rates/route.ts` | force-dynamic + `Cache-Control: no-store`; veri günde 1 (06:00 cron) değişiyor | [KOD KANITI] |
| C12 | not-found | `app/not-found.tsx:40` | tüm villa listesi → `.slice(0,3)` | [KOD KANITI] |
| C13 | Tag invalidation | `settings, menu, villas, villa-reviews, faqs, homepage, discount, taxonomy` | yapı doğru, DOKUNMA | [KOD KANITI] |

---

## 5. Server / Client Audit

| Bileşen | Tür | Satır | Gözlem |
|---|---|---|---|
| `AramaPageBody.tsx` | server | 1.895 | ✓ ağır iş server'da; ama cache'siz |
| `KiralikVillalarPageBody.tsx` | server | 784 | ✓ |
| `VillaCard.tsx` | client | 1.720 | Dar explicit props ✓ (DTO'nun tamamı değil). Tarih varsa `prices` + `stayDiscounts` alıyor ve client'ta **tekrar** `calculateGrandTotal` çalıştırıyor |
| `Gallery.tsx` | client | 513 | 8 raw `<img>`, next/image yok |
| `Header.tsx` / `TopBar.tsx` / `Footer.tsx` / `BottomNav.tsx` | client | 561 / 671 / 570 / 326 | Layout'ta her sayfada; Footer'ın client olması gerekip gerekmediği ayrıca incelenmeli |
| `CurrencyContext.tsx` | client | — | provider value memo'suz → 8 public `useCurrency` tüketicisi her state değişiminde re-render; `console.log("KURLAR GELDİ")` prod'da |
| `ReservationForm` | client | — | country-state-city'i statik import ediyor (L124-160) |
| 43 client dosyası | client | — | `get-dictionary` import ediyor → 3 dilin tamamı client bundle'a giriyor |

**Doğruluk riski [KOD KANITI]:** `CurrencyContext` `/api/exchange-rates` 429 veya hata döndürdüğünde `Number(undefined)` ile NaN kur set ediyor. Rate limit 30/dk/IP (`lib/rate-limit.ts:92`). NAT arkasındaki bir kullanıcı grubu (ofis, otel wifi) limiti aşarsa fiyatlar "NaN" görünebilir. Bu ölçülmedi; mekanizma kodda.

---

## 6. JS Bundle Audit

**Yöntem [ÖLÇÜLDÜ]:** Her rota için layout + page + not-found'dan başlayan import grafiğinde, `"use client"` sınırında duran bir BFS yapıldı. Sınır modülleri `clientModules` ile chunk'lara, oradan `rootMainFiles` ile gzip boyuta eşlendi. Doğrulama: `/blog` HTML script tag'leri 214 KB, hesap 213 KB; `/` 281 KB, hesap 280 KB. Polyfill'ler (38.5 KB gz) `noModule` olduğu için modern tarayıcıda yüklenmiyor; hariç tutuldu.

| Rota | Browser JS (gz) | Tabana göre fark | Ağır kütüphaneler |
|---|---|---|---|
| `/blog`, `/blog/[slug]`, `/p/[slug]`, `/rezervasyon/basarili` | **213 KB** | taban | — |
| `/kisa-sureli-tarihler/...` | 217 KB | +4 | — |
| `/v/[token]` | 250 KB | +37 | react-day-picker |
| `/kiralik-villa/[slug]` | 258 KB | +45 | react-day-picker, date-fns |
| `/teklif-al` | 272 KB | +59 | react-datepicker |
| `/kiralik-villalar`, `/arama` | 273 KB | +60 | react-datepicker, date-fns |
| `/` | 280 KB | +67 | react-datepicker, embla, date-fns |
| `/rezervasyon/[slug]` | **356 KB** | **+143** | **country-state-city** |

**Taban (213 KB) kırılımı [ÖLÇÜLDÜ]:** React/Next ~126 KB (`3794` 64 + `4bd1b696` 61.9), **sözlük chunk `3563` 39.7 KB** (TR+EN+DE string'leri doğrulandı), uygulama kodu ~48 KB.

**Chunk atfı [ÖLÇÜLDÜ, kütüphaneye özgü string imzalarıyla]:**
| Chunk | Raw / gz | İçerik | Yüklendiği public rota |
|---|---|---|---|
| `3e344cd8` | 543 KB / 119.5 KB | country-state-city states | yalnız `/rezervasyon/[slug]` (×3 dil) |
| `5204` | 101 KB / 15.5 KB | country-state-city countries | yalnız `/rezervasyon/[slug]` |
| `3563` | 121.6 KB / 39.7 KB | 3 sözlüğün tamamı | tüm public rotalar |
| `13633bf0` | 106 KB / 25.7 KB | react-datepicker | `/`, `/arama`, `/kiralik-villalar`, `/teklif-al` |
| `8918` | 43.5 KB / 13 KB | react-day-picker | villa detay, `/v` |
| `4306` | 19 KB / 7.7 KB | embla | `/` |
| `8853` (+ küçükler) | — / 19.8 KB | date-fns | tarih seçicili rotalar |
| `d0deef33` | — | Leaflet JS | **0 public rota** |
| `4524`, `70e0d97a`, `54a60aa6` | — | TipTap/ProseMirror | **0 public rota** |

---

## 7. Image / Font Audit

### Fontlar [KOD KANITI + ÖLÇÜLDÜ]
- `app/layout.tsx:2` dört fontu tanımlıyor; `:158` dördünün değişkenini de `<html>`'e basıyor. `blog.html`'de **4 adet `<link rel="preload" as="font">`** var **[ÖLÇÜLDÜ]**.
- Public yalnız **Outfit**'i kullanıyor (`globals.css:113-114` `--font-display`, `--font-sans`), mono tek dosyada.
- **Inter ve Fraunces yalnız admin'de** (`globals.css:1010-1011`, `.admin-shell` içinde). Fraunces `opsz` + `SOFT` eksenleriyle geliyor, yani büyük bir variable font.
- Sonuç: public'te en az 2 gereksiz font preload, LCP sırasında bant genişliği için yarışıyor. Byte boyutu, mock nedeniyle **[ÖLÇÜLEMEDİ]**.

### Görseller [KOD KANITI]
- `Gallery.tsx`: 8 raw `<img>`, `next/image` yok, `srcset` yok. Hero grid `images[0..2]` eager ama `fetchPriority` yok. Thumbnail'ler `loading="lazy"` ✓.
- Upload hattı (`AdminGallery.tsx:202-228`) max 1600px WebP q0.8'e çeviriyor. Yani orijinal ~1600px, ama mobil de **1600px dosyayı indiriyor**.
- Eski `**.supabase.co` görselleri (remotePatterns'ta hâlâ var) bu hattan geçmemiş olabilir. Boyutları **[ÖLÇÜLEMEDİ]**.
- `VillaCard`: next/image + `sizes` ✓, `priority` yok (liste sayfasında ilk kart LCP olabilir).
- `Hero`, `HeroImageCard`: `priority` + `sizes` ✓.
- `next.config.ts`: images için yalnız `remotePatterns` var. Next 16 varsayılanları: `formats: ['image/webp']` (AVIF yok), `minimumCacheTTL: 14400`, `qualities: [75]`.
- R2 upload `CacheControl` option'dan geliyor (`s3-storage.provider.ts:122`). Villa görsellerinin gerçek cache header'ı **[ÖLÇÜLEMEDİ]** (curl 403).

---

## 8. Network / Request Audit

**Villa detay, bir full page load'da browser'ın yaptığı istekler [KOD KANITI]:**
| İstek | Kaynak | Cache | Maliyet |
|---|---|---|---|
| HTML (SSR) | — | yok (dynamic) | 10–12 DB sorgusu |
| `/api/exchange-rates` | CurrencyContext useEffect | no-store | Upstash REST (harici hop) + DB |
| `/api/public/villas/{id}/blocked-ranges` | AvailabilityInlineCalendar (`lib/villa-availability.helper.ts:125`) | no-store | Upstash + RPC |
| `/api/public/villas/{id}/blocked-ranges` | BookingSidebar (`useBookingEngine.ts:574`) | no-store | **DUPLICATE** — Upstash + RPC |
| Galeri görselleri | Gallery raw `<img>` | CDN | srcset yok |
| 4 font preload | root layout | — | 2'si gereksiz |
| GTM + analytics | afterInteractive | — | 3. parti |

**Rezervasyon:** HTML (4 sıralı sorgu) + `/api/public/payment-methods` (rate limit yok, cache header yok) + exchange-rates.

**Rate-limit etkileşimi [KOD KANITI]:** blocked-ranges 30/dk/IP (availability bucket). Her villa detay açılışı bunun **2'sini** tüketiyor, yani bir kullanıcı ~15 villa detayı açınca limite takılabilir. Karşılaştırma yapan kullanıcı veya paylaşımlı IP için gerçekçi bir senaryo **[TAHMİN]**.

---

## 9. JSON / RSC / HTML boyutu

| Dosya | HTML raw / gz | RSC | Not |
|---|---|---|---|
| `index.html` | 77 KB / 15 KB | 24 KB | **alt sınır** — DB'siz build, veri boş |
| `blog.html` | 39 KB / 8 KB | 10 KB | alt sınır |
| `iletisim` | 60 KB / 12 KB | — | alt sınır |
| `_not-found` | 26 KB / 6 KB | — | — |
| CSS (her sayfa) | 259 KB raw / 38 KB gz (3 dosya; ana dosya `d36d491afad4b508.css` 245.7 KB) | — | [ÖLÇÜLDÜ] |

CSS içeriği [ÖLÇÜLDÜ, selector taraması]:
- admin selector'leri: 12.2 KB raw (%4.7)
- leaflet.css: 10.8 KB (%4.2)
- react-day-picker: 4.3 KB
- backdrop-filter kuralları: 3.5 KB
- react-datepicker: 2.5 KB

Tailwind tek global stylesheet üretiyor. Admin-only utility payı Coverage ile **[ÖLÇÜLEMEDİ]**.

**Risk [KOD KANITI + TAHMİN]:** `/kiralik-villalar` JSON-LD ItemList'i tüm villaları HTML'e basıyor (L296-305). Villa sayısıyla doğrusal büyür. Prod HTML boyutu ölçülemedi. Ayrıca VillaCard client props'u tarih varsa fiyat satırlarını RSC payload'a taşıyor; boyut, sayfadaki kart × fiyat dönemi ile orantılı.

---
## 10. i18n Audit

- **3 sözlüğün tamamı her public rotada [ÖLÇÜLDÜ]:** Chunk `3563`, 121.6 KB raw / 39.7 KB gz; TR, EN ve DE string'lerinin üçü de chunk içinde doğrulandı. Sebep: 43 client dosyası `get-dictionary`'yi doğrudan import ediyor ve bundler 3 dili de statik olarak içeri alıyor.
- **Beklenen kazanç [TAHMİN]:** Sadece aktif dili göndermek yaklaşık 2/3'ü, yani ~26 KB gz'yi keser. Bu tabanın ~%12'si ve her rotaya yansır.
- EN/DE rotaları ayrı sayfa dosyaları (34 ayna), `requirePublicLocaleEnabled` gate'i var. EN/DE'de ek olarak `getTranslationsForParents` / type-name / badge sorguları sıralı çalışıyor (`/kiralik-villalar` L228→L261, `/arama` L1061→L1112, SimilarVillas).
- Build'de EN/DE'nin static/404 görünmesi DB'siz build artefaktı; prod davranışı değil.

---

## 11. Search / Filter Audit

| Konu | Kanıt | Durum |
|---|---|---|
| SQL'de LIMIT | `findSearchResults` yakalanan SQL | **YOK** [ÖLÇÜLDÜ] |
| Sayfalama | `AramaPageBody.tsx:1055` JS slice | JS'te [KOD KANITI] |
| Sıralama | JS; fiyat + tarih sıralamasında tüm görünür villalar için `calculateGrandTotal` (L1004-1010, `needsStayTotalSort`) | CPU, villa × gece ile orantılı |
| Filtreler | location/type/feature ilişkileri L419, L486 sıralı; guests SQL'de | kısmen SQL |
| Müsaitlik | tüm adaylar için tek RPC (L885); flex modunda +6 paralel RPC (L926) | 1 veya 7 RPC |
| Review | `getVillaReviewStatsBatch()` cache'siz (L589) | her aramada tüm onaylı review'lar |
| Cache | yok | force-dynamic |
| `/kiralik-villalar` | `getCachedVillas` (cache'li) + JS sort/slice (L222) | ✓ cache'li ama JSON-LD tüm villalar |

**Değerlendirme:** Villa sayısı yüzlerle sınırlıysa bu tasarım (hepsini çek, JS'te filtrele) kabul edilebilir; sorunun kaynağı cache'siz olması. En ucuz kazanç sırası şöyle:
1. `findSearchResults` + review stats'ı, arama parametrelerinden bağımsız "aktif villa + fiyat + indirim" snapshot'ı olarak `unstable_cache`'e almak (tag `villas`, `discount`, `villa-reviews`).
2. Review'ları SQL aggregate'e çevirmek.
3. Müsaitlik RPC'si cache'siz ve doğru kalmalı (**DOKUNMA**).

---

## 12. Villa Detail Audit

| # | Bulgu | Kanıt | Etiket |
|---|---|---|---|
| VD1 | Her istek SSR, çünkü searchParams start/end okunuyor | `page.tsx:178-192` | [KOD KANITI] |
| VD2 | `getVillaImages` duplicate; `findBySlug` tüm görselleri zaten embed ediyor | yakalanan SQL + `page.tsx:252` | [ÖLÇÜLDÜ] |
| VD3 | 8 cache'siz sorgu Promise.all'da | `page.tsx:252` | [KOD KANITI] |
| VD4 | SimilarVillasSection async, Suspense yok, 1–3 sıralı sorgu, HTML'in tamamını bekletiyor | `VillaDetailBody` | [KOD KANITI] |
| VD5 | blocked-ranges client'ta 2 kez | `villa-availability.helper.ts:125`, `useBookingEngine.ts:574` | [KOD KANITI] |
| VD6 | Gallery raw img, srcset yok, fetchPriority yok | `Gallery.tsx` | [KOD KANITI] |
| VD7 | Villa yoksa HTTP 200 (soft-404) | inline 404 section | [KOD KANITI] |
| VD8 | `cache(getVillaBySlug)` metadata/page dedupe | `page.tsx:101` | ✓ doğru |
| VD9 | JS 258 KB gz | BFS | [ÖLÇÜLDÜ] |

**Hedef mimari (öneri, uygulanmadı):**
- Villa detayı `start`/`end` searchParams'ı server'da okumadan, ISR'lı olarak render etmek. Booking range, client'ta `useSearchParams` ile seed edilir (Suspense içinde).
- Villa verisi, fiyat, indirim ve özellikler `unstable_cache` ile `villa:{id}` tag'ine alınır.
- Müsaitlik client'ta no-store kalır (**DOKUNMA**) ama tek istekle, ortak bir hook/context üzerinden paylaşılır.
- Similar villalar Suspense ile stream edilir.

---

## 13. Public API Audit

| Endpoint | Method | Rate limit | Dynamic | Cache header | Gözlem |
|---|---|---|---|---|---|
| `/api/exchange-rates` | GET | ✓ exchange (Upstash) | force-dynamic | no-store | Veri günde 1 değişiyor; her full load'da Upstash + DB. 429'da client NaN |
| `/api/public/villas/[id]/blocked-ranges` | GET | ✓ availability 30/dk | force-dynamic | no-store | Villa detayında 2× çağrılıyor. no-store DOĞRU |
| `/api/public/villas/[id]/availability` | GET | ✓ | — | no-store | doğru |
| `/api/public/payment-methods` | GET | **✗** | force-dynamic | **yok** | 3 çağrı noktası; nadiren değişen veri, CDN/browser cache'i yok |
| `/api/public/taxonomies` | GET | ✗ | force-dynamic | — | 3 çağrı noktası |
| `/api/public/reservations` | POST | ✓ (4 çağrı) | — | — | **DOKUNMA** — server fiyat doğrulaması + overlap |
| `/api/public/contact` | POST | ✓ ×2 | — | — | doğru |
| `/api/public/offer-requests` | POST | — | — | — | — |
| `/api/public/reservation-lookup` | POST | — | — | — | — |
| `/api/mail/reservation-request` | POST | — | — | — | — |
| `/api/voucher/[id]` | GET | — | — | no-store | doğru (kişisel veri) |
| `/api/villa-zip/[token]` | GET | — | — | — | — |

Not: POST endpoint'lerinin rate-limit ve validation davranışı **performans için gevşetilmemeli**. Bu rapor bunu önermiyor.

---

## 14. Önceki iddiaların yeniden testi

| # | Önceki iddia | Sonuç | Kanıt / düzeltme |
|---|---|---|---|
| R1 | "Home First Load JS 953 KB, rezervasyon 1.624 KB" | **NOT CONFIRMED (yöntem hatası)** | Önceki sayılar client-reference-manifest chunk listesinden alınmıştı; manifest, rotada render edilmeyen modülleri de listeliyor (ör. `/blog` manifestinde HeroSearchPanel ve VillaCard var). Doğrulanmış BFS + HTML script tag yöntemiyle: **/ = 280 KB gz, /rezervasyon = 356 KB gz** |
| R2 | country-state-city public bundle'da | **CONFIRMED** | Yalnız `/rezervasyon/[slug]` (×3 dil); ~135 KB gz |
| R3 | 3 sözlük her sayfada | **CONFIRMED** | Chunk `3563` 39.7 KB gz; tüm public rotalar |
| R4 | react-datepicker tüm rotalarda | **NOT CONFIRMED** | Yalnız 4 rota (`/`, `/arama`, `/kiralik-villalar`, `/teklif-al`); `/blog` HTML'inde yok. "54 rota" iddiası manifest şişmesiydi |
| R5 | Leaflet / TipTap public JS'te | **NOT CONFIRMED** | 0 public rota. Yalnız leaflet **CSS**'i root layout'ta (10.8 KB raw) |
| R6 | Homepage sıralı await'ler kullanıcı TTFB'sini artırıyor | **NOT CONFIRMED** | `/` ISR 600s; sıralı await yalnız regenerate'te çalışır |
| R7 | Currency fetch her navigasyonda | **PARTIALLY CONFIRMED** | Her **full page load**'da bir kez; root layout kalıcı olduğu için client-side navigasyonda tekrar etmiyor |
| R8 | Admin CSS public'e sızıyor | **PARTIALLY CONFIRMED** | Admin selector'leri 12.2 KB raw (%4.7); küçük. Utility payı ölçülmedi |
| R9 | Galeri görselleri çok büyük | **PARTIALLY CONFIRMED** | Upload hattı 1600px WebP'ye sınırlıyor; ama srcset yok, mobil 1600px indiriyor. Legacy supabase görselleri ölçülemedi |
| R10 | getCachedVillas 2MB'ı aşıyor | **PARTIALLY CONFIRMED** | Mekanizma doğru (LIMIT'siz, 46 kolon, 2MB limit aktif); gerçek boyut NEEDS MEASUREMENT |
| R11 | not-found tüm villa listesini çekiyor | **CONFIRMED** | `app/not-found.tsx:40` → `.slice(0,3)` |
| R12 | JSON-LD tüm villaları basıyor | **CONFIRMED (yalnız /kiralik-villalar)** | L296-305; `/arama` doğru şekilde `villasOnPage` kullanıyor (L1085) |
| R13 | /arama SQL sayfalaması yok | **CONFIRMED** | LIMIT'siz SQL + JS slice + cache yok |
| R14 | Villa detay her istekte SSR | **CONFIRMED** | searchParams start/end |
| R15 | villa_id FK index'leri eksik | **NEEDS MEASUREMENT** | Migrations'ta yok; prod baseline doğrulanamadı |
| R16 | LCP = avatar / font | **NEEDS MEASUREMENT** | Canlı ölçüm yapılamadı |

---
## 15. Bulgular (P0–P3)

> Öncelik = kullanıcı etkisi × kapsam × kanıt gücü. "Tahmini etki" satırları **[TAHMİN]**, "Ölçüm" satırları **[ÖLÇÜLDÜ]** ya da **[ÖLÇÜLEMEDİ]**. Hiçbir çözüm uygulanmadı.

### P0-1 — country-state-city dönüşüm sayfasında +135 KB gz
- **Problem:** Public'in en ağır rotası, ödeme/dönüşüm sayfası olan `/rezervasyon/[slug]`.
- **Neden:** `ReservationForm` `Country` ve `State`'i statik import ediyor. Tüm dünya il/eyalet verisi bundle'a giriyor.
- **Kanıt:** Chunk `3e344cd8` (543 KB raw / 119.5 KB gz) + `5204` (101 / 15.5); yalnız bu rotada yükleniyor.
- **Dosya / Satır:** `ReservationForm` L124-160 (`Country.getAllCountries`, `State.getStatesOfCountry`).
- **Ölçüm:** [ÖLÇÜLDÜ] rota 356 KB gz; taban 213 KB.
- **Tahmini etki:** [TAHMİN] −135 KB gz ile ~221 KB; mobilde parse/execute süresinde belirgin düşüş.
- **Çözüm:** Ülke listesini küçük bir statik JSON'a (isim + ISO kodu, ~5–10 KB) indirmek. Eyalet listesi gerçekten gerekiyorsa seçilen ülkeye göre `import()` ile ya da bir API'den lazy yüklemek.
- **Risk:** Düşük–orta. Form validasyonu ve kayıtlı alan formatı (ülke adı mı, kod mu) korunmalı; mevcut rezervasyonlardaki değerlerle uyum test edilmeli.
- **Zorluk:** Orta.
- **BEFORE:** 356 KB gz → **AFTER TARGET:** ≤ 230 KB gz.

### P0-2 — /arama: LIMIT'siz, cache'siz sorgu + tüm review'lar
- **Problem:** Her arama isteği tüm uygun villaları, tüm fiyat ve indirim satırlarını ve tüm onaylı review'ları DB'den çekiyor; sonra JS'te filtreleyip sıralıyor ve sayfalıyor.
- **Neden:** `force-dynamic` + `findSearchResults` ve `getVillaReviewStatsBatch()` `unstable_cache` dışında.
- **Kanıt:** Yakalanan SQL'de LIMIT yok; `AramaPageBody.tsx:589` (Promise.all, cache yok), `:1055` (JS slice).
- **Dosya / Satır:** `app/components/search/AramaPageBody.tsx` 287, 419, 486, 589, 885, 926, 969, 1004-1010, 1055.
- **Ölçüm:** [ÖLÇÜLEMEDİ] DB süresi; [ÖLÇÜLDÜ] SQL şekli.
- **Tahmini etki:** [TAHMİN] Cache hit'te ≥2 ağır sorgu yerine 0; TTFB'nin DB payı müsaitlik RPC'sine iner.
- **Çözüm:** (a) Parametreden bağımsız "aktif villa + fiyat + indirim + review özeti" snapshot'ını tag'li `unstable_cache`'e almak (mevcut `villas`/`discount`/`villa-reviews` tag'leri). (b) Review'ları SQL `GROUP BY`'a çevirmek. (c) L419→L486 bağımsızsa paralelleştirmek. (d) **Müsaitlik RPC'si cache'siz kalmalı.**
- **Risk:** Orta. Snapshot'ın 2MB limitine takılmaması gerekir (bkz. P1-10). İndirim ve fiyat invalidation tag'leri doğru bağlanmalı.
- **Zorluk:** Orta.
- **BEFORE:** her istekte 2 büyük sorgu + 1–7 RPC → **AFTER TARGET:** cache hit'te yalnız 1–7 RPC.

### P0-3 — Child FK index'leri doğrulanamadı (correlated subquery'lerin tamamı bunlara dayanıyor)
- **Problem:** Tüm liste/detay sorguları `villa_images`, `villa_prices`, `villa_reviews` vb. üzerinde `WHERE villa_id = parent.id` SubPlan'ları çalıştırıyor. Index yoksa maliyet villa × child satır olur.
- **Neden:** Bu tablolar `db/migrations`'tan eski; migrations'ta index tanımı **0**. `villa.slug` için de index yok.
- **Kanıt:** Migrations taraması (multi-line regex); yakalanan SQL'ler (§3).
- **Dosya:** `lib/db/query-compiler.ts`, `db/migrations/**`.
- **Ölçüm:** [ÖLÇÜLEMEDİ] — §21'deki `pg_indexes` + EXPLAIN script'i ile 5 dakikada doğrulanır.
- **Tahmini etki:** Index'ler prod'da varsa etki 0 (bulgu kapanır); yoksa tüm public sayfaların DB süresi etkilenir.
- **Çözüm:** ÖNCE ölç. Eksikse `CREATE INDEX CONCURRENTLY` ile migration (§3'teki önerilen index'ler).
- **Risk:** Düşük (CONCURRENTLY). `villa.slug` UNIQUE için duplicate kontrolü şart.
- **Zorluk:** Düşük.
- **BEFORE:** bilinmiyor → **AFTER TARGET:** tüm child SubPlan'lar Index Scan.
- **Not:** P0 olarak işaretlendi çünkü kanıt eksik ama olası etki en geniş kapsamlı olan bu. Ölçüm index'lerin varlığını gösterirse P3'e düşer.

### P1-1 — Villa detay her istekte SSR + 8 cache'siz sorgu
- **Problem:** SEO ve trafik açısından en kritik sayfa hiç cache'lenmiyor.
- **Neden:** searchParams `start`/`end` server'da okunuyor (L178-192), bu yüzden dynamic; villa verisi `unstable_cache` dışında.
- **Kanıt:** `app/(public)/kiralik-villa/[slug]/page.tsx:178-192, 252`.
- **Ölçüm:** [ÖLÇÜLEMEDİ] TTFB. [KOD KANITI] 10–12 sorgu/istek.
- **Tahmini etki:** [TAHMİN] ISR + client seed ile TTFB ≈ CDN/edge cache; DB yükü istek başına ~0.
- **Çözüm:** start/end'i client'ta `useSearchParams` ile seed etmek (Suspense içinde). Villa, fiyat, indirim ve özellikleri `unstable_cache` + `villa:{id}` tag'ine almak. `generateStaticParams` + `revalidate`. Müsaitlik client'ta no-store kalır.
- **Risk:** Orta. Admin'de fiyat/indirim değişince doğru tag'in invalidate edilmesi gerekir. Aksi halde eski fiyat görünür; ama rezervasyon POST server'da yeniden doğruladığı için yanlış fiyattan rezervasyon oluşmaz.
- **Zorluk:** Orta–yüksek.
- **BEFORE:** her istek SSR, 10–12 sorgu → **AFTER TARGET:** ISR, 0 sorgu/istek (cache hit).

### P1-2 — Rezervasyon sayfasında 4 sıralı await + duplicate images
- **Problem / Neden:** `getVillaBySlug` → `getVillaPrices` → `getVillaDiscounts` → `getVillaImages` sırayla çalışıyor. Son üçü sadece `villa.id`'ye bağlı ve birbirinden bağımsız; images zaten `findBySlug` içinde embed.
- **Kanıt / Dosya / Satır:** `app/components/reservation/ReservationPageBody.tsx:83, 98, 99, 100`.
- **Ölçüm:** [ÖLÇÜLEMEDİ] RTT. [KOD KANITI] 4 sıralı round-trip.
- **Tahmini etki:** [TAHMİN] 4 RTT → 2 RTT. eu-west-1 pooler RTT'si sunucu konumuna bağlı.
- **Çözüm:** `Promise.all([prices, discounts])` ve images'ı embed'den kullanmak.
- **Risk:** Düşük (davranış aynı). **Zorluk:** Düşük.
- **BEFORE:** 4 sıralı sorgu → **AFTER TARGET:** 1 + 1 paralel dalga (2 RTT).

### P1-3 — Villa detayda duplicate images + stream edilmeyen similar villalar
- **Problem:** `getVillaImages` ayrı bir sorgu olarak çalışıyor, oysa görseller zaten embed ediliyor. SimilarVillasSection Suspense'siz ve 1–3 sıralı sorgu yapıyor, bu yüzden HTML'in tamamı onu bekliyor.
- **Kanıt:** Yakalanan `findBySlug` SQL'i (tüm görseller) + `page.tsx:252`; `VillaDetailBody` → `SimilarVillasSection`.
- **Tahmini etki:** [TAHMİN] −1 sorgu; similar villalar için 1–3 RTT'lik gecikme HTML'in kritik yolundan çıkar.
- **Çözüm:** Embed'deki görselleri kullanmak (sıralama `is_cover DESC, sort_order` ile `sort_order` farkı kontrol edilmeli). `<Suspense>` ile stream etmek.
- **Risk:** Düşük; görsel sırası görsel regresyon testiyle doğrulanmalı. **Zorluk:** Düşük.
- **BEFORE:** 10–12 sorgu, similar kritik yolda → **AFTER TARGET:** 9–11 sorgu, similar stream.

### P1-4 — blocked-ranges client'ta 2 kez
- **Problem:** Aynı veri iki bileşende ayrı ayrı fetch ediliyor; her biri Upstash + RPC ve rate-limit bütçesini ikiye katlıyor.
- **Kanıt / Dosya / Satır:** `lib/villa-availability.helper.ts:125` (AvailabilityInlineCalendar), `useBookingEngine.ts:574` (BookingSidebar).
- **Tahmini etki:** [TAHMİN] −1 istek, −1 RPC, −1 Upstash çağrısı / detay açılışı. Rate-limit'e takılma eşiği ~15 → ~30 villa/dk.
- **Çözüm:** Tek bir paylaşılan hook/context (in-flight promise dedupe). **no-store korunmalı.**
- **Risk:** Düşük. **Zorluk:** Düşük–orta.
- **BEFORE:** 2 istek → **AFTER TARGET:** 1 istek.

### P1-5 — exchange-rates: her full load'da Upstash + DB, no-store; 429'da NaN
- **Problem:** Günde bir değişen veri için her sayfa açılışında harici Redis çağrısı ve DB sorgusu yapılıyor. Rate limit aşılırsa fiyatlar NaN oluyor.
- **Kanıt:** `app/api/exchange-rates/route.ts` (force-dynamic, `no-store`, `applyRateLimit(req,"exchange")`); `lib/rate-limit.ts:92` (30/dk); `app/context/CurrencyContext.tsx` (koşulsuz `useEffect`, `Number(undefined)`).
- **Tahmini etki:** [TAHMİN] Public GET trafiğinin büyük kısmı bu endpoint'ten geliyor olabilir; CDN cache'i ile ~0 origin isteğine iner.
- **Çözüm:** (a) Kurları server'da `unstable_cache` ile (tag `exchange-rates`, cron'da revalidate) okuyup layout'tan initial prop olarak geçmek → client fetch'e gerek kalmaz. Ya da (b) `Cache-Control: public, s-maxage=3600, stale-while-revalidate` ile rate limit'i kaldırmak/gevşetmek (GET, kişisel veri yok). (c) Hata/429'da mevcut kurları korumak, NaN set etmemek.
- **Risk:** Düşük. Kur değerleri rezervasyon POST'ta server'da yeniden hesaplanıyorsa gösterim amaçlı cache güvenli (doğrula). **Zorluk:** Düşük.
- **BEFORE:** her full load 1 istek + Upstash + DB → **AFTER TARGET:** 0 client isteği ya da CDN hit.

### P1-6 — 3 sözlük her rotada (39.7 KB gz)
- **Kanıt:** Chunk `3563`; 43 client dosyası `get-dictionary` import ediyor. **Ölçüm:** [ÖLÇÜLDÜ].
- **Çözüm:** Sözlüğü server'da seçip provider/props ile yalnız aktif dili geçirmek, ya da dil başına dinamik `import()`.
- **Tahmini etki:** [TAHMİN] ~−26 KB gz tüm public rotalarda. **Risk:** Orta (43 dosya; eksik anahtar riski). **Zorluk:** Orta.
- **BEFORE:** 39.7 KB gz → **AFTER TARGET:** ≤ 14 KB gz.

### P1-7 — Public'te 2 gereksiz font preload (Inter, Fraunces)
- **Kanıt:** `app/layout.tsx:2, 158`; `globals.css:113-114` (public = Outfit), `:1010-1011` (Inter/Fraunces yalnız `.admin-shell`). `blog.html`'de 4 preload [ÖLÇÜLDÜ].
- **Çözüm:** Inter ve Fraunces'i admin layout'una taşımak ya da `preload: false`. Root'ta Outfit (+ gerekiyorsa mono `preload:false`) kalır.
- **Tahmini etki:** [TAHMİN] LCP sırasında 2 font dosyası daha az (Fraunces opsz+SOFT büyük). Byte'lar [ÖLÇÜLEMEDİ].
- **Risk:** Düşük; admin görünümü kontrol edilmeli. **Zorluk:** Düşük.
- **BEFORE:** 4 font preload → **AFTER TARGET:** 1–2 font preload.

### P1-8 — Galeri: raw `<img>`, srcset yok, fetchPriority yok
- **Kanıt:** `app/components/villa/Gallery.tsx` (8 `<img>`); upload 1600px WebP (`AdminGallery.tsx:202-228`).
- **Çözüm:** Hero grid için `next/image` + `sizes` + ilk görselde `priority`/`fetchPriority="high"`; lightbox'ta tam boy kalabilir.
- **Tahmini etki:** [TAHMİN] Mobilde LCP görseli 1600px → ~640–828px; byte olarak ~%60–75 azalma. **Risk:** Düşük–orta (layout/aspect ratio). **Zorluk:** Orta.
- **BEFORE:** mobil 1600px → **AFTER TARGET:** viewport'a uygun srcset.

### P1-9 — Blog detay ve CMS: duplicate sorgu + force-dynamic + ISR yok
- **Kanıt:** `blog-metadata.ts:71,79` + `BlogDetailPageBody.tsx:44,47`; `cms-page-metadata.ts:45,57` + `app/p/[slug]/page.tsx:44,71`; `app/(public)/blog/[slug]/page.tsx:14` force-dynamic.
- **Çözüm:** Getter'ları React `cache()` ile sarmak (hemen 2× → 1×). `force-dynamic`'i kaldırıp `revalidate` + tag (`blog`, `pages`). `generateStaticParams` opsiyonel.
- **Tahmini etki:** [TAHMİN] Sorgu 2× → 1×; ISR ile cache hit'te 0. **Risk:** Düşük; admin'de blog/sayfa kaydında revalidateTag çağrılmalı. **Zorluk:** Düşük.
- **BEFORE:** 2×(fetch + resolve) / istek → **AFTER TARGET:** ISR hit, 0 sorgu.

### P1-10 — getCachedVillas 2MB limit riski
- **Kanıt:** `lib/cache.helpers.ts:111-115`; LIMIT'siz `SELECT *` (46 kolon, description + seo_description) + tüm fiyat satırları; `incremental-cache/index.js:517-524`.
- **Ölçüm:** [ÖLÇÜLEMEDİ] — §21 boyut sorgusu + prod loglarında "items over 2MB" araması.
- **Etki:** Limit aşılırsa cache **sessizce devre dışı** kalır: `/`, `/kiralik-villalar` ve not-found her istekte tam listeyi DB'den çeker.
- **Çözüm:** Liste için dar bir kolon seti (kartın kullandığı alanlar). `description`/`seo_description` hariç tutulur.
- **Risk:** Düşük–orta (kartta kullanılan alan atlanmamalı). **Zorluk:** Düşük–orta.
- **BEFORE:** bilinmiyor → **AFTER TARGET:** girdi < 1 MB (tampon payıyla).

### P2-1 — /kiralik-villalar JSON-LD tüm villaları basıyor
- `KiralikVillalarPageBody.tsx:296-305` `villas.map`. **Çözüm:** `/arama` gibi sayfadaki villaları kullanmak (`villasOnPage`, bkz. `AramaPageBody.tsx:1085`). **Etki:** [TAHMİN] HTML boyutu villa sayısıyla artmaz. **Risk:** Düşük (SEO: ItemList sayfalı olabilir). **Zorluk:** Düşük. **BEFORE:** N villa → **AFTER:** sayfa boyutu (ör. 12).

### P2-2 — not-found tüm villa listesini çekiyor
- `app/not-found.tsx:40` → `.slice(0,3)`. **Çözüm:** Sabit ya da `LIMIT 3` bir cached sorgu. **Etki:** [TAHMİN] 404 trafiğinde (bot taramaları) ve 2MB aşımında büyük. **Risk/Zorluk:** Düşük. **BEFORE:** tam liste → **AFTER:** 3 kart.

### P2-3 — getCachedSettings istek başına ~10 çağrı, React cache() yok
- `app/layout.tsx:81,150`, `app/(public)/layout.tsx:46`, HeaderWrapper, FooterWrapper, sayfalar. **Çözüm:** `cache(getCachedSettings)` sarmalayıcısı. **Etki:** [TAHMİN] Her çağrı incremental-cache lookup + deserialize; birkaç ms. **Risk/Zorluk:** Düşük. **BEFORE:** ~10 lookup → **AFTER:** 1.

### P2-4 — HeaderWrapper / FooterWrapper sıralı adımlar
- `HeaderWrapper.tsx:165` settings → `:184` menu → `:203` Promise.all; `FooterWrapper` `:88` → `:123` → `:171`. Settings ve menu bağımsız. **Çözüm:** İlk iki adımı Promise.all. **Etki:** [TAHMİN] Cache hit'te küçük, miss'te 1 RTT. **Risk/Zorluk:** Düşük. **BEFORE:** 3 dalga → **AFTER:** 2 dalga.

### P2-5 — get_blocked_villa_ids: OR-null + SECURITY DEFINER
- `db/migrations/_archive/legacy/039_availability_rpc.sql`. **Ölçüm:** NEEDS EXPLAIN (§21). **Çözüm:** EXPLAIN index kullanımını gösteriyorsa dokunma. **Risk:** YÜKSEK (müsaitlik doğruluğu). **Zorluk:** Orta. **BEFORE/AFTER:** ölçüme bağlı.

### P2-6 — Dinamik rotalarda streaming yok
- Hiçbir public rotada `loading.tsx` yok; tek Suspense TopBar'da. **Çözüm:** `/arama`, villa detay ve rezervasyon için `loading.tsx` ya da bölüm bazlı Suspense. **Etki:** [TAHMİN] Algılanan hız (FCP) artar; TTFB değişmez. **Risk:** Düşük (CLS'e dikkat). **Zorluk:** Düşük–orta.

### P2-7 — /api/public/payment-methods ve taxonomies cache header'sız
- force-dynamic, cache header yok, payment-methods rate limit'siz. **Çözüm:** Server'da `unstable_cache`, ya da sayfaya prop olarak geçmek; en azından `s-maxage`. **Etki:** [TAHMİN] Rezervasyon sayfasında −1 client isteği. **Risk/Zorluk:** Düşük.

### P2-8 — react-datepicker + date-fns ilk yüklemede (/ , /arama, /kiralik-villalar, /teklif-al)
- `HeroSearchPanel.tsx`, `FilterSidebar.tsx`, `OfferRequestForm.tsx`. Chunk `13633bf0` 25.7 KB gz + date-fns. **Çözüm:** Takvimi etkileşimde `next/dynamic` ile yüklemek. **Etki:** [TAHMİN] ~−25–45 KB gz ilk yükleme. **Risk:** Düşük–orta (ilk açılışta gecikme). **Zorluk:** Orta.

### P3-1 — leaflet.css root layout'ta
- `app/layout.tsx:4`; 10.8 KB raw, public'te kullanılmıyor. **Çözüm:** Admin harita bileşenlerine taşımak. **Risk/Zorluk:** Düşük.

### P3-2 — CurrencyContext `console.log("KURLAR GELDİ")`
- Prod konsolu kirleniyor. **Çözüm:** Kaldırmak. **Risk/Zorluk:** Çok düşük.

### P3-3 — AVIF kapalı
- `next.config.ts` → `formats` varsayılan (webp). **Çözüm:** `formats: ['image/avif','image/webp']`. **Etki:** [TAHMİN] next/image görsellerinde ~%20 daha küçük. **Risk:** Encode CPU'su, ilk istek gecikmesi. **Zorluk:** Düşük.

### P3-4 — CurrencyContext value memo'suz
- 8 tüketici gereksiz re-render. **Çözüm:** `useMemo`. **Risk/Zorluk:** Düşük.

### P3-5 — Soft-404 (HTTP 200)
- Villa detay ve `/p/[slug]` bulunamayınca 200 dönüyor. Performans değil, SEO/crawl-budget konusu. **Çözüm:** `notFound()`. **Risk:** Düşük. **Zorluk:** Düşük.

### P3-6 — VillaCard client'ta calculateGrandTotal'ı tekrar hesaplıyor
- Server `/arama` sıralama için zaten hesaplıyor (L1004-1010), kart tekrar hesaplıyor ve bunun için fiyat satırları RSC payload'a giriyor. **Çözüm:** Server sonucunu prop olarak geçmek. **Risk:** Orta (fiyat gösterimi, para birimi). **Zorluk:** Orta. **Not:** Etki ölçülmeden önceliklendirme yapılmamalı.

---
## 16. DOKUNMA listesi

Performans uğruna **değiştirilmemesi** gerekenler:
1. `/api/public/reservations` POST: server-side fiyat yeniden hesaplama, indirim doğrulaması, validation, rate limit (4 çağrı).
2. Rezervasyon overlap / EXCLUDE constraint'leri ve `get_blocked_villa_ids` / `get_villa_blocked_ranges` RPC mantığı (ölçüm olmadan).
3. Müsaitlik endpoint'lerinin `no-store` olması (blocked-ranges, availability). Dedupe edilebilir, cache'lenemez.
4. POST endpoint'lerindeki rate limit'ler (contact ×2, offer-requests, reservation-lookup).
5. İndirim snapshot mantığı (`buildStayDiscountSnapshot`, `calculateGrandTotal`, `applyDiscountToDailyPrice`) — son commit `9dc4566` ile senkronlandı.
6. `unstable_cache` tag isimleri ve admin tarafındaki `revalidateTag` çağrıları (yeni tag eklenebilir, mevcutlar değiştirilmemeli).
7. Villa detaydaki `cache(getVillaBySlug)` + 11'li `Promise.all` deseni (doğru; yalnız images duplicate'i çıkarılabilir).
8. Upload hattının 1600px WebP dönüşümü (`AdminGallery.tsx`).
9. `/voucher/[id]` no-store (kişisel veri).
10. `middleware.ts` matcher (public'i hariç tutması performans açısından doğru).

---

## 17. Roadmap

### FAZ 1 — Ölçüm (kod değişikliği yok, 1 gün)
- §21 script'leri: `pg_indexes`, EXPLAIN (ANALYZE, BUFFERS), getCachedVillas boyutu, "items over 2MB" log araması, CDN `curl -I`, app↔DB RTT, Lighthouse/WebPageTest (mobil, 4G) → `/`, `/kiralik-villalar`, `/arama?...`, villa detay, rezervasyon.
- Çıktıya göre P0-3, P1-10 ve P2-5'i kapat ya da önceliğini yükselt.

### FAZ 2 — Düşük risk, yüksek getiri (hızlı kazançlar)
- P0-1 country-state-city → küçük JSON / lazy
- P1-2 rezervasyon Promise.all + images embed
- P1-3 duplicate images + similar Suspense
- P1-4 blocked-ranges dedupe
- P1-5 exchange-rates cache + NaN fix
- P1-7 font preload
- P1-9 blog/CMS `cache()` + ISR
- P2-1, P2-2, P2-3, P2-4, P2-7
- P3-1, P3-2, P3-4
- (FAZ 1 eksik gösterirse) P0-3 index'leri `CONCURRENTLY` ile

### FAZ 3 — Orta risk, mimari
- P0-2 `/arama` snapshot cache + SQL review aggregate
- P1-1 villa detay ISR + client-side start/end seed + villa bazlı tag
- P1-10 liste için dar kolon seti
- P1-8 Galeri next/image + srcset
- P2-6 streaming / loading.tsx

### FAZ 4 — Bundle ve ince ayar
- P1-6 tek dil sözlük
- P2-8 datepicker lazy load
- P3-3 AVIF
- P3-6 VillaCard server-side toplam
- P3-5 soft-404 → `notFound()`
- P2-5 (yalnız EXPLAIN gerektiriyorsa) RPC iyileştirmesi, kapsamlı müsaitlik testleriyle

Her fazdan sonra: `npm test` (tam suite), `npm run lint` (baseline 0 error / 198 warning), `next build`, §6 BFS ile JS yeniden ölçümü ve Lighthouse karşılaştırması.

---

## 18. Final Tablo

| ID | Öncelik | Problem | Kanıt | Etkilenen Public Route | Etki | Risk | Zorluk |
|---|---|---|---|---|---|---|---|
| P0-1 | P0 | country-state-city bundle'da | chunk 3e344cd8+5204, 135 KB gz [ÖLÇÜLDÜ] | /rezervasyon/[slug] (TR/EN/DE) | 356→~221 KB gz | Düşük–Orta | Orta |
| P0-2 | P0 | /arama LIMIT'siz + cache'siz + tüm review'lar | yakalanan SQL, AramaPageBody:589,1055 | /arama | Her istekte 2 ağır sorgu → 0 (hit) | Orta | Orta |
| P0-3 | P0* | Child FK + slug index'leri doğrulanamadı | migrations'ta 0 index | tüm liste/detay | Bilinmiyor (ölç) | Düşük | Düşük |
| P1-1 | P1 | Villa detay her istek SSR + 8 cache'siz sorgu | page.tsx:178-192,252 | /kiralik-villa/[slug] | TTFB + DB yükü | Orta | Orta–Yüksek |
| P1-2 | P1 | Rezervasyon 4 sıralı await + duplicate images | ReservationPageBody:83,98-100 | /rezervasyon/[slug] | 4→2 RTT | Düşük | Düşük |
| P1-3 | P1 | Duplicate images + similar Suspense'siz | page.tsx:252, SimilarVillasSection | /kiralik-villa/[slug] | −1 sorgu, −1–3 RTT kritik yoldan | Düşük | Düşük |
| P1-4 | P1 | blocked-ranges 2× | helper:125, useBookingEngine:574 | /kiralik-villa/[slug] | −1 istek/RPC/Upstash | Düşük | Düşük–Orta |
| P1-5 | P1 | exchange-rates no-store + Upstash + DB; 429→NaN | route.ts, rate-limit.ts:92, CurrencyContext | tüm public | her full load −1 istek; doğruluk | Düşük | Düşük |
| P1-6 | P1 | 3 sözlük her rotada | chunk 3563 39.7 KB gz [ÖLÇÜLDÜ] | tüm public | ~−26 KB gz | Orta | Orta |
| P1-7 | P1 | Inter + Fraunces preload public'te | layout.tsx:2,158; globals.css:1010 | tüm public | −2 font isteği | Düşük | Düşük |
| P1-8 | P1 | Galeri raw img, srcset yok | Gallery.tsx | /kiralik-villa/[slug] | mobil LCP byte ~−%60 [TAHMİN] | Düşük–Orta | Orta |
| P1-9 | P1 | Blog/CMS duplicate + force-dynamic | blog-metadata:71,79; cms-page-metadata:45,57 | /blog/[slug], /p/[slug] | 2×→1×→0 | Düşük | Düşük |
| P1-10 | P1 | getCachedVillas 2MB riski | cache.helpers:111-115; incremental-cache:517 | /, /kiralik-villalar, 404 | cache sessizce kapanabilir | Düşük–Orta | Düşük–Orta |
| P2-1 | P2 | JSON-LD tüm villalar | KiralikVillalarPageBody:296-305 | /kiralik-villalar | HTML boyutu | Düşük | Düşük |
| P2-2 | P2 | not-found tam liste | not-found.tsx:40 | tüm 404'ler | 404 maliyeti | Düşük | Düşük |
| P2-3 | P2 | getCachedSettings ~10×, cache() yok | layout.tsx:81,150 vb. | tüm public | birkaç ms | Düşük | Düşük |
| P2-4 | P2 | Header/FooterWrapper sıralı | HeaderWrapper:165,184,203 | tüm public | miss'te 1 RTT | Düşük | Düşük |
| P2-5 | P2 | RPC OR-null + SECURITY DEFINER | 039_availability_rpc.sql | /arama, detay | NEEDS EXPLAIN | Yüksek | Orta |
| P2-6 | P2 | Streaming / loading.tsx yok | tek Suspense TopBar'da | dinamik rotalar | algılanan hız | Düşük | Düşük–Orta |
| P2-7 | P2 | payment-methods/taxonomies cache'siz | route dosyaları | /rezervasyon, filtreler | −1 istek | Düşük | Düşük |
| P2-8 | P2 | datepicker ilk yüklemede | chunk 13633bf0 25.7 KB gz | /, /arama, /kiralik-villalar, /teklif-al | ~−25–45 KB gz | Düşük–Orta | Orta |
| P3-1 | P3 | leaflet.css root'ta | layout.tsx:4 | tüm public | −10.8 KB raw CSS | Düşük | Düşük |
| P3-2 | P3 | console.log prod'da | CurrencyContext | tüm public | temizlik | Çok düşük | Çok düşük |
| P3-3 | P3 | AVIF kapalı | next.config.ts | next/image kullananlar | ~−%20 görsel | Düşük | Düşük |
| P3-4 | P3 | Context value memo'suz | CurrencyContext | tüm public | re-render | Düşük | Düşük |
| P3-5 | P3 | Soft-404 HTTP 200 | detay + /p | /kiralik-villa/[slug], /p/[slug] | SEO | Düşük | Düşük |
| P3-6 | P3 | VillaCard client'ta toplam yeniden hesaplıyor | VillaCard.tsx, Arama:1004 | /arama, liste | RSC payload | Orta | Orta |

\* P0-3 ölçüm sonucuna göre P3'e düşebilir.

---

## 19. Özet listeler

### CONFIRMED
- country-state-city yalnız `/rezervasyon/[slug]`'da, ~135 KB gz
- 3 sözlük tüm public rotalarda (39.7 KB gz)
- not-found tüm villa listesini çekip 3'ünü kullanıyor
- JSON-LD tüm villalar — yalnız `/kiralik-villalar`
- `/arama` SQL sayfalaması yok, cache yok, JS sort/slice
- Villa detay her istekte SSR (searchParams)
- Leaflet JS ve TipTap public JS'te **yok**

### NOT CONFIRMED
- Önceki First Load JS rakamları (953 KB / 1.624 KB) — yöntem hatası; doğru değerler 280 / 356 KB gz
- react-datepicker tüm rotalarda (yalnız 4 rota)
- Leaflet/TipTap public bundle'da
- Homepage sıralı await'lerinin kullanıcı TTFB'sini etkilemesi (ISR)

### PARTIALLY CONFIRMED
- Currency fetch: her full load'da, client navigasyonda değil
- Admin CSS sızıntısı: var ama küçük (12.2 KB raw, %4.7)
- Büyük galeri görselleri: 1600px sınırlı, ama srcset yok
- getCachedVillas 2MB: mekanizma doğru, boyut ölçülmedi

### NEW FINDINGS
- Villa detay ve rezervasyonda duplicate `villa_images` sorgusu
- Rezervasyon sayfasında 4 sıralı await
- Villa detayda blocked-ranges 2× client isteği
- Blog detay + CMS'de metadata/page duplicate sorgu (cache() yok)
- Blog detay `force-dynamic`; hiçbir public rotada `generateStaticParams` yok
- `/arama`'da cache'siz, tüm review'ları okuyan stats batch
- leaflet.css root layout'ta
- Public'te 2 gereksiz font preload (Inter, Fraunces opsz+SOFT)
- exchange-rates: Upstash + DB + no-store her full load'da; 429'da NaN kur (doğruluk)
- getCachedSettings ~10×/istek, React cache() yok
- HeaderWrapper settings→menu sıralı
- `get_blocked_villa_ids` OR-null + SECURITY DEFINER
- Session-mode pooler eu-west-1, PG_POOL_MAX=10; villa detay tek istekte 8 paralel sorgu
- Villa detay ve `/p` soft-404 (HTTP 200)
- `/api/public/payment-methods` rate limit ve cache header'sız

### NEEDS MEASUREMENT
- Child FK index'leri (`villa_images`, `villa_prices`, `villa_reviews`, `villa_distances`, `villa_features`, `villa_rules`, `villa_price_includes`) ve `villa.slug`
- Tüm EXPLAIN planları (§3)
- getCachedVillas serialized boyutu (2MB)
- `get_blocked_villa_ids` generic plan
- App sunucusu ↔ DB RTT (bölge)
- Gerçek TTFB / LCP / CLS / INP (mobil)
- LCP elementi (avatar mı, hero görsel mi, font mu)
- Font byte boyutları
- CDN görsel cache-control ve legacy supabase görsel boyutları
- Tailwind admin-only utility oranı (Coverage)
- Prod HTML/RSC boyutları (DB'li)

---

## 20. Audit sırasında yapılanlar / yapılmayanlar

- ✅ Yalnız okuma: kaynak kod, `node_modules/next` kaynakları, `.next` build çıktısı.
- ✅ Offline `next build --webpack` (font mock'lu). `.next/` gitignore'da, repo durumunu değiştirmez.
- ✅ SQL yakalama script'i repo **dışında** (`$HOME/sqlcap/capture.ts`); DB'ye bağlanmadı.
- ❌ DB sorgusu çalışmadı (DNS `EAI_AGAIN`); INSERT/UPDATE/DELETE/DDL yok.
- ❌ Canlı siteye erişilemedi (proxy 403); başka bir yol denenmedi.
- ❌ Kod, config, env, package.json, migration değişikliği yok. Commit ve push yok.
- ℹ️ `git status`: yalnız `?? Claude outputs/public-performance-audit-v2.md`. Klasör gitignore'da değil; bu, istenen rapor dosyasının kendisi.

---
## 21. Hazır salt-okunur ölçüm script'leri (FAZ 1)

> Hepsi **salt-okunur**. DB script'leri `BEGIN READ ONLY; ... ROLLBACK;` içinde. `EXPLAIN ANALYZE` yalnız SELECT'leri çalıştırır; veri değiştirmez. Prod'da yoğun saat dışında çalıştırılması önerilir. `:slug`, `:villa_id` gibi yer tutucuları gerçek değerlerle değiştirin.

### 21.1 Index envanteri
```sql
BEGIN READ ONLY;
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('villa','villa_images','villa_prices','villa_discounts','villa_reviews',
                    'villa_distances','villa_features','villa_rules','villa_price_includes',
                    'villa_locations','reservations','manual_reservations','external_calendar_events',
                    'pages','settings','exchange_rates')
ORDER BY tablename, indexname;

-- Tablo boyutları
SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) AS total
FROM pg_stat_user_tables
WHERE relname IN ('villa','villa_images','villa_prices','villa_discounts','villa_reviews',
                  'reservations','manual_reservations','external_calendar_events')
ORDER BY pg_total_relation_size(relid) DESC;

-- Seq scan baskısı (index eksikliği göstergesi)
SELECT relname, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY seq_tup_read DESC LIMIT 20;

-- villa.slug UNIQUE yapılabilir mi? (0 satır dönmeli)
SELECT slug, count(*) FROM villa WHERE deleted_at IS NULL GROUP BY slug HAVING count(*) > 1;
ROLLBACK;
```

### 21.2 EXPLAIN — liste (listPublic / getCachedVillas)
```sql
BEGIN READ ONLY;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT v.*,
  (SELECT json_build_object('name', e0.name) FROM villa_locations e0 WHERE e0.id = v.location_id) AS location,
  (SELECT coalesce(json_agg(l.r), '[]') FROM (
     SELECT json_build_object('image_url', e1.image_url, 'is_cover', e1.is_cover, 'sort_order', e1.sort_order) AS r
     FROM villa_images e1 WHERE e1.villa_id = v.id ORDER BY e1.is_cover DESC, e1.sort_order ASC LIMIT 1) l) AS villa_images,
  (SELECT coalesce(json_agg(json_build_object('price', e2.price, 'currency', e2.currency, 'start_date', e2.start_date)), '[]')
     FROM villa_prices e2 WHERE e2.villa_id = v.id) AS villa_prices
FROM villa v
WHERE v.is_active = true AND v.deleted_at IS NULL
ORDER BY v.sort_order ASC, v.created_at DESC;
ROLLBACK;
```
Bakılacak: SubPlan'larda `Seq Scan on villa_images/villa_prices` var mı, `loops=` değeri, toplam süre.

### 21.3 getCachedVillas serialized boyutu (2MB limiti)
```sql
BEGIN READ ONLY;
SELECT count(*) AS villa_count,
       pg_size_pretty(sum(octet_length(row_to_json(v)::text))::bigint) AS villa_rows_json,
       (SELECT count(*) FROM villa_prices p JOIN villa v2 ON v2.id = p.villa_id
         WHERE v2.is_active AND v2.deleted_at IS NULL) AS price_rows
FROM villa v WHERE v.is_active = true AND v.deleted_at IS NULL;

-- Tam liste sorgusunun JSON boyutu (21.2 sorgusu sarılarak)
SELECT pg_size_pretty(octet_length(json_agg(t)::text)::bigint) AS list_json_size
FROM ( /* BURAYA 21.2'deki SELECT'i EXPLAIN satırı olmadan yapıştırın */ ) t;
ROLLBACK;
```
Karar: `list_json_size` + review stats > ~1.5 MB ise P1-10 kritik. Ayrıca prod loglarında şunu arayın:
```bash
# Vercel / sunucu logları
grep -i "items over 2MB" <log-dosyası>      # ya da log paneline "over 2MB" araması
```

### 21.4 EXPLAIN — villa detay
```sql
BEGIN READ ONLY;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa WHERE slug = ':slug' AND is_active = true AND deleted_at IS NULL;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_images   WHERE villa_id = ':villa_id' ORDER BY sort_order ASC;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_prices   WHERE villa_id = ':villa_id' ORDER BY start_date ASC;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_discounts WHERE villa_id = ':villa_id';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_features WHERE villa_id = ':villa_id';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_distances WHERE villa_id = ':villa_id';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_rules WHERE villa_id = ':villa_id';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM villa_price_includes WHERE villa_id = ':villa_id';
EXPLAIN (ANALYZE, BUFFERS)
  SELECT * FROM villa WHERE is_active AND deleted_at IS NULL AND location_id = ':location_id'
    AND NOT (id IN (':villa_id')) LIMIT 3;
ROLLBACK;
```

### 21.5 EXPLAIN — review istatistikleri
```sql
BEGIN READ ONLY;
EXPLAIN (ANALYZE, BUFFERS) SELECT villa_id, rating FROM villa_reviews WHERE is_approved = true;
-- Önerilen aggregate alternatifi (karşılaştırma için)
EXPLAIN (ANALYZE, BUFFERS)
  SELECT villa_id, avg(rating), count(*) FROM villa_reviews WHERE is_approved = true GROUP BY villa_id;
ROLLBACK;
```

### 21.6 EXPLAIN — get_blocked_villa_ids iç sorgusu (custom vs generic plan)
```sql
BEGIN READ ONLY;
-- Custom plan (literal parametreler)
EXPLAIN (ANALYZE, BUFFERS)
WITH src AS (
  SELECT r.villa_id FROM reservations r
   WHERE r.status IN ('pending','confirmed') AND r.start_date < DATE '2026-10-10' AND r.end_date > DATE '2026-10-03'
  UNION
  SELECT m.villa_id FROM manual_reservations m
   WHERE m.start_date < DATE '2026-10-10' AND m.end_date > DATE '2026-10-03'
  UNION
  SELECT e.villa_id FROM external_calendar_events e
   WHERE e.is_active = true AND e.start_date < DATE '2026-10-10' AND e.end_date > DATE '2026-10-03'
) SELECT DISTINCT villa_id FROM src WHERE villa_id IS NOT NULL;

-- Generic plan (OR-null deseniyle) — PREPARE veri değiştirmez; oturum sonunda DEALLOCATE
SET LOCAL plan_cache_mode = force_generic_plan;
PREPARE gbv(date, date, uuid[]) AS
  SELECT r.villa_id FROM reservations r
   WHERE $1 < $2 AND r.status IN ('pending','confirmed') AND r.start_date < $2 AND r.end_date > $1
     AND ($3 IS NULL OR r.villa_id = ANY($3));
EXPLAIN (ANALYZE, BUFFERS) EXECUTE gbv('2026-10-03', '2026-10-10', NULL);
DEALLOCATE gbv;
ROLLBACK;
```
Bakılacak: generic planda `reservations_..._idx` kullanılıyor mu, yoksa Seq Scan mı? Satır sayısı küçükse fark önemsiz olabilir; o durumda **dokunmayın**.

### 21.7 App sunucusu ↔ DB RTT (prod ortamında, salt-okunur)
```bash
node -e '
const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await c.connect();await c.query("BEGIN READ ONLY");const t=[];for(let i=0;i<20;i++){const s=process.hrtime.bigint();await c.query("SELECT 1");t.push(Number(process.hrtime.bigint()-s)/1e6)}
await c.query("ROLLBACK");await c.end();t.sort((a,b)=>a-b);console.log("p50",t[10].toFixed(1),"ms  p95",t[18].toFixed(1),"ms")})()'
```
Yorum: p50 > 20 ms ise sıralı her await (P1-2, P2-4, similar villalar) doğrudan TTFB'ye eklenir. Değişken adı projedeki gerçek connection env'ine göre uyarlanmalı.

### 21.8 CDN / HTTP header'ları
```bash
curl -sI "https://cdn.villayagel.com/<bir-villa-görseli>.webp" | grep -iE "cache-control|content-length|content-type|age|cf-cache-status"
curl -sI "https://villayagel.com/"                          | grep -iE "cache-control|x-nextjs-cache|age|x-vercel-cache"
curl -sI "https://villayagel.com/kiralik-villa/<slug>"      | grep -iE "cache-control|x-nextjs-cache"
curl -s -o /dev/null -w "%{http_code} %{size_download}B ttfb=%{time_starttransfer}s\n" "https://villayagel.com/api/exchange-rates"
curl -s -o /dev/null -w "%{http_code} %{size_download}B ttfb=%{time_starttransfer}s\n" "https://villayagel.com/kiralik-villalar"
# Eski supabase görsellerinin boyutu:
curl -sI "https://<proje>.supabase.co/storage/v1/object/public/<yol>" | grep -i content-length
```

### 21.9 Lab ölçümü (Lighthouse, mobil)
```bash
for u in / /kiralik-villalar "/arama?start=2026-10-03&end=2026-10-10&guests=4" /kiralik-villa/<slug> /rezervasyon/<slug> /blog; do
  npx lighthouse "https://villayagel.com$u" --only-categories=performance --form-factor=mobile \
    --output=json --output-path="./lh-$(echo $u | tr '/?&=' '____').json" --quiet --chrome-flags="--headless"
done
# JSON'dan: largest-contentful-paint, server-response-time, total-blocking-time,
#           largest-contentful-paint-element, unused-javascript, font-display
```
> Not: `lh-*.json` çıktıları repo dışında bir klasöre yazılmalı; aksi halde git status kirlenir.

### 21.10 CSS Coverage (admin-only utility payı)
Chrome DevTools → Coverage → `/kiralik-villa/<slug>` ve `/` yüklenir → ana CSS dosyasının "Unused bytes" oranı kaydedilir.

---

*Rapor sonu. Hiçbir kod, config, env, migration veya DB değişikliği yapılmadı; commit veya push yok.*
