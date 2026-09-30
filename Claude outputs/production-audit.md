# Tatilin Yeri — Production-Grade Teknik Audit

**Tarih:** 2026-09-19 · **Commit:** `8d7230d` (`main`) · **Kapsam:** salt-okunur
**Ölçek:** `app/` 602 dosya / 116.853 satır · `lib/` 196 dosya / 31.930 satır · 79 API route · 44 server-action dosyası · 158 unit test dosyası
**Stack:** Next.js 16.2.4 · React 19.2.4 · native `pg` 8 · Cloudflare R2 (S3 SDK) · native JWT (jose) + Argon2 + TOTP · Upstash Redis (rate-limit) · Sentry · Hetzner + Coolify

> Bu audit sırasında hiçbir dosya değiştirilmedi, migration çalıştırılmadı, commit/push yapılmadı.
> Üretim veritabanına ve canlı siteye erişim **yoktu** (egress allowlist); bu nedenle runtime doğrulaması gerektiren maddeler `DOĞRULANAMADI` olarak işaretlendi.

---

### Executive Summary

**Production durumu:** `Needs Attention`
Temel mimari sağlam ve disiplinli — katman ayrımı net, rezervasyon fiyatı server-authoritative, double-booking DB seviyesinde EXCLUDE constraint ile atomik olarak korunuyor, admin endpoint'lerinin **tamamında** yetki kontrolü var. Ancak üç yapısal sorun yüksek trafikte gerçek arıza üretir: cache invalidation fiilen çalışmıyor, en çok trafik alan sayfa tamamen dinamik ve sınırsız bir katalog sorgusu her yerde tüketiliyor.

**En kritik 3 problem**
1. `revalidateTag(tag, "max")` — 8 invalidation fonksiyonunun tamamı cache'i **temizlemiyor**, son kullanma tarihini 1 yıl ileri atıyor (`app/services/revalidate.actions.ts:31-76`).
2. `villaAdminRepository.listPublic()` — **LIMIT yok**: ~1595 aktif villa + tüm görselleri + tüm fiyat satırları tek sorguda çekiliyor; anasayfa, liste sayfası **ve 404 sayfası** bunu tüketiyor (`lib/db/villa.repository.server.ts:402-427`).
3. Villa detay sayfası tamamen dinamik (SSR, `generateStaticParams` yok) + istek başına ~11 sorgu + `PG_POOL_MAX` varsayılanı **10** → connection pool doygunluğu (`app/(public)/kiralik-villa/[slug]/page.tsx:252`, `lib/db/pg.client.ts:61`).

**En önemli 3 performans bulgusu**
1. Hiçbir route'ta `loading.tsx` yok + villa detay dinamik → kullanıcı ~11 sorgu bitene kadar **beyaz ekran** görüyor (streaming/skeleton yok).
2. Çeviri okumaları cache'lenmiyor (`lib/i18n/get-translation.server.ts:73`) → her EN/DE isteği ek DB turu.
3. EN/DE villa detayda **4 ardışık `await` dalgası** (`app/(public)/en/kiralik-villa/[slug]/page.tsx:211 → 221 → 236 → 254`) — paralelleştirilebilir waterfall.

**En önemli 3 güvenlik bulgusu**
1. `/api/auth/login` üzerinde **IP bazlı rate-limit yok**; koruma yalnızca hesap-başı kilitleme → credential spraying ve hesap-kilitleme DoS mümkün.
2. Rate-limit **fail-open**: `UPSTASH_REDIS_REST_*` tanımlı değilse tüm limitler sessizce devre dışı (`lib/rate-limit.ts:25-28`).
3. Upload route'unda **boyut / MIME / path doğrulaması yok**; dosya `arrayBuffer()` ile tamamen belleğe alınıyor (`app/api/admin/storage/upload/route.ts:100-112`).

**En önemli 3 mimari bulgu**
1. **Çekirdek şema (`villa`, `reservations`, `settings`, `villa_images`, `villa_prices` …) hiçbir migration'da tanımlı değil**; aktif çağrılan 18 RPC'nin tanımı ise `_archive/legacy/` altında. Migration runner ve `schema_migrations` ledger'ı da yok → veritabanı repo'dan yeniden kurulamaz.
2. Hiçbir `error.tsx` / `global-error.tsx` yok — tüm ağaçta error boundary sıfır.
3. `vercel.json` içindeki 4 cron Coolify'da **çalışmıyor** (repo'nun kendi dokümanı doğruluyor: `docs/coolify-scheduled-tasks.md:3-7`).

**Genel teknik risk:** Orta-Yüksek. Kod kalitesi ve güvenlik disiplini ortalamanın belirgin üzerinde; risk kod kalitesinden değil **çalışma zamanı/ölçek kararlarından** geliyor.

**İlk yapılması gerekenler:** (1) cache invalidation düzeltmesi, (2) katalog sorgusuna LIMIT, (3) villa detayın ISR'e alınması + `loading.tsx`, (4) login rate-limit, (5) Coolify cron kurulumu.

---

## 1. Mimari — `Production Ready`

Katmanlar net ve tutarlı: `page.tsx` → `services/*` → `lib/db/*.repository*` → `lib/db/native provider` → `pg`. `server-only` sınırı repository ve rate-limit modüllerinde uygulanmış. UI'a DB sorgusu sızmamış; server-action'lar kendi dosyalarında toplanmış.

**Güçlü yanlar (kanıtlı)**
- 79 API route'un admin/cron olan **tamamında** yetki çağrısı var (makine ile tarandı, istisna yok).
- Fiyat güvenliği: `app/api/public/reservations/route.ts:109-135` — client'ın gönderdiği 16 finansal alan server'da yeniden hesaplanıp **eziliyor**.
- `lib/i18n/` locale çekirdeği saf ve test edilmiş; URL tek locale kaynağı.

**Zayıf noktalar**
| Bulgu | Kanıt | Risk |
|---|---|---|
| RPC tanımları arşivde, kullanım aktif | `db/migrations/_archive/legacy/039_availability_rpc.sql` ↔ çağıran `app/services/reservation/_helpers/conflict.ts` | Şema kaynağı "arşiv" etiketli; yeni geliştirici siler/görmez |
| Migration runner yok | `package.json` scripts'te migrate yok; `schema_migrations` tablosu yok | Hangi migration'ın uygulandığı **DOĞRULANAMADI**; rollback prosedürü yok |
| `VillaCard.tsx` 1491 satır client component | `app/components/villa/VillaCard.tsx` | Liste sayfalarında N kez hydrate; bakım maliyeti |
| `not-found.tsx` tam katalog çekiyor | `app/not-found.tsx:45` → `getCachedVillas()` | Her 404 (bot taraması dahil) ağır cache okuması tetikliyor |

**Mimari nereden kırılır:** Katalog 5.000 villaya çıktığında `listPublic()` payload'ı ve `unstable_cache` serialize maliyeti doğrusal büyür; `/kiralik-villalar` JS tarafında slice ettiği için sayfalama bu maliyeti azaltmaz.

---

## 2. Performance — `High Risk`

### CRITICAL — Katalog sorgusunda satır LIMIT'i yok
**Dosya:** `lib/db/villa.repository.server.ts:402-438`

`villa_images` doğru şekilde villa başına 1 cover'a indirilmiş (`.limit(1, { referencedTable: "villa_images" })`) ✅. Sorun diğer üç noktada:
- **Top-level satır limiti yok** → ~1595 aktif villanın (`Claude outputs/coklu-dil-mimari-audit-raporu.md:12`) tamamı tek seferde geliyor.
- **`select("*")`** → kart için gereken ~10 kolon yerine villa tablosunun tüm kolonları (açıklama metinleri, SEO alanları, harita embed'i dahil).
- **`villa_prices` limitsiz** → villa başına tüm sezon fiyat satırları.

Sonuç `getCachedVillas()` ile Data Cache'e serialize ediliyor (TTL 600s), sayfalama ise **JS tarafında** yapılıyor (`KiralikVillalarPageBody.tsx:127`) — yani DB yükünü azaltmıyor.
**Tüketiciler:** anasayfa `VillaList`, `/kiralik-villalar`, **`app/not-found.tsx:45`**, admin homepage-collection.
**Repo'nun kendi uyarısı** (`villa.repository.server.ts:399-400`): *"PERF (WARNING): N villa × 3 korelasyon-subquery; villa_images/villa_prices `.villa_id` FK index'i CI'de doğrulanmalı (ölçek)."* — Bu index'in varlığı **DOĞRULANAMADI**: ilgili tablolar hiçbir migration'da tanımlı değil (bkz. Bölüm 4). Index yoksa 1595 villa × 3 korelasyon alt-sorgusu sequential scan'e döner.
**Risk:** Cache miss anında tek istek çok büyük bir sorgu + serialize yapar; eşzamanlı birkaç miss Node heap'ini ve connection pool'u doldurur. 404 sayfasının da bunu tetiklemesi, bot taramalarını bir yük vektörüne çeviriyor.
**Öneri:** kart için açık kolon projeksiyonu + DB-seviyesi pagination; `not-found` için küçük ayrı cache; `villa_images`/`villa_prices` üzerinde `villa_id` index'ini doğrula.

### CRITICAL — Villa detay tamamen dinamik + pool 10
**Dosyalar:** `app/(public)/kiralik-villa/[slug]/page.tsx:192,252` · `lib/db/pg.client.ts:61`
**Mevcut davranış:** `searchParams` kullanıldığı için route dinamik; `generateStaticParams` **hiçbir route'ta yok** (makine ile doğrulandı). Her istek `Promise.all` ile 11 kaynak çekiyor; bunların yalnız 3'ü cache'li (`settings`, `reviews`, `reviewStats`). Pool varsayılanı `max: 10`, `connectionTimeoutMillis: 10_000`.
**Risk:** Sitenin en çok trafik alan ve SEO'su en değerli sayfası ISR'den yararlanmıyor. ~8 cache'siz sorgu × eşzamanlı istek, 10 bağlantılık havuzu hızla doyurur; doygunlukta istekler 10 sn bekleyip 500 döner. TTFB doğrudan DB latency'sine bağlı.
**Öneri:** `searchParams` yalnız tarih ön-doldurma için kullanılıyorsa bu işi client'a taşıyıp route'u ISR'e almak (`revalidate` + `generateStaticParams` ile popüler slug'lar); `PG_POOL_MAX` production'da CPU/RAM'e göre yükseltmek (Coolify'da **DOĞRULANAMADI**).

### HIGH — Error/loading boundary yok
**Kanıt:** Tüm ağaçta `error.tsx`, `global-error.tsx`, `loading.tsx` **sıfır**; yalnız `app/not-found.tsx` var. `Suspense` yalnız 1 dosyada (`TopBar.tsx`).
**Risk:** (a) Dinamik villa detayda kullanıcı sorgular bitene kadar beyaz ekran görür — streaming yok. (b) Herhangi bir render hatası branded fallback yerine Next'in varsayılan hata ekranına düşer. (c) Sentry kurulu ama UI tarafında kurtarma yok.

### HIGH — Çeviri okumaları cache'siz
**Dosya:** `lib/i18n/get-translation.server.ts:73` (`unstable_cache` KULLANILMAZ — dosyanın kendi notu)
**Risk:** Her EN/DE sayfa render'ı villa/özellik/kural/fiyat-dahil çevirileri için ek DB turları atıyor. TR'de short-circuit var, EN/DE'de yok. Çok dilli trafik arttıkça DB yükü doğrusal artar.

### MEDIUM — EN/DE villa detayda ardışık dalga
**Dosya:** `app/(public)/en/kiralik-villa/[slug]/page.tsx:211 → 221 → 236 → 254`
4 ayrı `await` dalgası; her biri ayrı RTT. `211`'deki tekil `await` `221`'deki `Promise.all` ile birleştirilebilir.

### MEDIUM — Public ağaçta 30 ham `<img>`
`grep`: public tarafta 30, admin'de 24 ham `<img>`. `VillaCard` doğru şekilde `next/image` + `sizes` + `loading="lazy"` kullanıyor (`VillaCard.tsx:449-450`), sorun diğer public yüzeylerde — otomatik AVIF/WebP, responsive srcset ve CLS koruması yok.

**Doğru yapılmış olanlar:** `Promise.all` ile paralel veri toplama, `next/image` + `sizes` (kart), leaflet ve tiptap'in public bundle'a girmemesi (yalnız admin), MapPicker'ın `next/dynamic` ile ayrılması.

---

## 3. Cache — `Critical`

### CRITICAL — `revalidateTag(tag, "max")` cache'i temizlemiyor
**Dosya:** `app/services/revalidate.actions.ts:31, 35, 39, 43, 53, 60, 67, 76` (**8 fonksiyonun tamamı**)

Next.js 16.2.4 kaynak kodu üzerinden zincir:
1. `next/dist/server/web/spec-extension/revalidate.js:130` → `incrementalCache.revalidateTag(tags, durations)`
2. `next/dist/server/config-shared.js:167-171` → `max: { stale: 300, revalidate: 2592000, expire: 31536000 }`
3. `next/dist/server/lib/incremental-cache/file-system-cache.js:56-74`
   ```js
   if (durations) { updates.stale = now;
                    updates.expired = now + durations.expire*1000; }  // → now + 1 YIL
   else           { updates.expired = now; }                          // → ANINDA geçersiz
   ```
4. `next/dist/server/lib/incremental-cache/tags-manifest.external.js` → `areTagsExpired`: `expiredAt <= now && expiredAt > timestamp` → `now+1yıl <= now` = **false** → entry geçersiz sayılmaz.

**Mevcut davranış:** Admin kaydettikten sonra tag yalnız "stale" işaretleniyor; ilk public istek **eski veriyi** alıyor, yenileme arka plana atılıyor. Değer en geç `unstable_cache` TTL'i (600s / 3600s) dolunca düzeliyor.
**Etkilenen 13 cache:** `settings:get`, `menu:get`, `villas:get`, `faqs:get·locale`, `villa-reviews:*` (4 adet), `discount-collection:get`, `villa-locations:get`, `category-covers:get`, `location-villa-counts:get`, `villa-types:get`.
**Risk:** Admin'in her değişikliği (fiyat/ayar/menü/villa/indirim) public tarafa gecikmeli yansıyor. Bu, "varsayılan dil DE seçtim ama site EN göstermiyor" tipi şikâyetlerin doğrudan sebebi.
**Öneri:** `revalidateTag(tag, { expire: 0 })` — kaynak koddan doğrulandı: `expired = now + 0 = now` → anında purge, deprecation uyarısı da çıkmaz. Tek dosya, 8 satır.

### Cache envanteri

| Key | Tag(ler) | TTL | Not |
|---|---|---|---|
| `settings:get` | settings | 3600s | Tüm public sayfalar okuyor |
| `menu:get` | menu | 3600s | |
| `villas:get` | villas, **villa-reviews** | 600s | Tam katalog (bkz. CRITICAL) |
| `faqs:get`+locale | faqs | 3600s | Locale başına ayrı key ✅ |
| `villa-reviews:*` (4) | villa-reviews | 3600s | |
| `discount-collection:get` | discount, **villa-reviews** | 600s | |
| `villa-locations/types/covers/counts` | taxonomy, villas | 600–3600s | |

**MEDIUM — aşırı invalidation:** `villas:get` ve `discount-collection:get` `villa-reviews` tag'ini de taşıyor → tek bir yorum onayı tüm katalog cache'ini (yukarıdaki ağır sorguyu) düşürüyor.

**Full Route Cache:** 15 public route `force-dynamic`; kalanlar varsayılan (static/ISR). `sitemap.ts` `revalidate = 3600`. Villa detay `searchParams` yüzünden fiilen dinamik.
**CDN cache:** `next.config.ts`'te `headers()` yok; Cloudflare/Coolify tarafı **DOĞRULANAMADI**.

---

## 4. Database — `Needs Attention`

**Güçlü:** 48 index, 33 FK, `btree_gist` + GiST EXCLUDE constraint'leri, half-open `[)` daterange semantiği tutarlı, availability için partial index (`idx_reservations_avail`).

### "İki kullanıcı aynı anda aynı villayı rezerve ederse ne olur?"

**Cevap: aynı tabloda güvenli, tablolar arasında değil.**

- `reservations` ↔ `reservations`: **atomik olarak korunuyor.**
  `db/migrations/001_reservations_no_overlap.sql:91-98` → `EXCLUDE USING gist (villa_id WITH =, daterange(start_date,end_date,'[)') WITH &&) WHERE status <> 'rejected'` (migration 030 ile `IN ('pending','confirmed')` allow-list'ine daraltılmış). İkinci INSERT `23P01` alır → `app/services/reservation/_helpers/errors.ts` "Bu tarihler dolu" → route 409. **Bu doğru çözüm.**
- `reservations` ↔ `external_calendar_events`: **korunuyor** — trigger `db/migrations/031_...sql:217-230`.
- **`reservations` ↔ `manual_reservations`: KORUNMUYOR.** İki ayrı tablo, iki ayrı EXCLUDE; aralarında hiçbir constraint/trigger yok (tarandı). Tek koruma `check_villa_availability_conflict` RPC'si — ki bu bir **INSERT öncesi okuma**, yani TOCTOU. Migration'ın kendi yorumu da bunu kabul ediyor: *"Bu RPC yalnız INSERT öncesi hızlı feedback için"* (`_archive/legacy/039_availability_rpc.sql:111-112`).
  **Risk (HIGH):** Public rezervasyon ile admin manuel bloğu aynı anda yazılırsa DB'de çakışan iki kayıt kalıcı olur. Admin manuel kaydı düşük frekanslı olduğu için pencere dar, ama gerçek.
  **Öneri:** 031'deki trigger desenini çoğaltarak çapraz kontrol eklemek (reservations→manual_reservations ve tersi), aynı `23P01` + aynı mesaj formatı ile — app tarafı hiç değişmez.

### Diğer DB bulguları
| Bulgu | Kanıt | Seviye |
|---|---|---|
| Migration ledger'ı ve runner yok | `package.json`, `db/migrations/` | HIGH |
| Aktif RPC tanımları `_archive/legacy/` altında | 18 RPC, `lib/db/rpc-metadata.ts` | HIGH |
| `select("*")` public listelemede | `villa.repository.server.ts:407` | MEDIUM |
| 29 × `ON DELETE CASCADE` | migrations | MEDIUM — villa silinince rezervasyon geçmişi de gider; arşivleme stratejisi **DOĞRULANAMADI** |
| Full-text search yok, `ILIKE` kullanılıyor | `getVillasForAdminPage` | LOW (admin, 1595 satır) |

---

## 5. Security — `Needs Attention`

### HIGH — `/api/auth/login` IP rate-limit'i yok
**Kanıt:** `app/api/auth/login/route.ts` içinde `applyRateLimit` yok; `RateLimitGroup` listesinde (`lib/rate-limit.ts:73-85`) login bucket'ı yok.
**Mevcut koruma:** yalnız hesap-başı kilit (`lib/auth/native/login.service.ts:107-115`, `AUTH_LOGIN_MAX_ATTEMPTS`).
**Risk:** (a) Farklı hesaplara dağıtılmış credential spraying sınırsız denenebilir. (b) Saldırgan bilinen bir admin e-postasına ardışık hatalı şifre göndererek o hesabı **kalıcı kilitleyebilir** (DoS). TOTP'nin kendi kilidi var ama o da IP limiti taşımıyor (`totp` bucket'ı yalnız bazı 2FA route'larında).

### HIGH — Rate limit fail-open
**Kanıt:** `lib/rate-limit.ts:25-28,67` — `UPSTASH_REDIS_REST_URL`/`TOKEN` yoksa `null` döner, tüm istekler geçer. Yerel `.env.local`'de bu iki değişken **yok**.
**Risk:** Coolify'da bu env'ler set değilse rezervasyon/iletişim/teklif/mail/zip endpoint'lerinin **hiçbirinde** limit çalışmıyor — ve bu sessizce olur. `zip` bucket'ı egress-pahalı olduğu için (villanın tüm görselleri stream) fatura riski de var. Coolify env durumu **DOĞRULANAMADI** — kontrol edilmeli.

### HIGH — Upload doğrulaması eksik
**Dosya:** `app/api/admin/storage/upload/route.ts:80-112`
- Bucket allow-list **var** ✅ (`ALLOWED_BUCKETS`)
- **Boyut limiti yok** — `await blob.arrayBuffer()` (satır 102) dosyanın tamamını RAM'e alır; büyük dosya Node process'ini OOM ile düşürür (tüm site etkilenir).
- **MIME allow-list yok** — `contentType` client form alanından alınıyor (satır 108); public R2 bucket'ına `text/html` yazılabilir → CDN origin'inde saklı XSS.
- **`path` sanitize edilmiyor** (satır 71) — admin, bucket içinde herhangi bir key'i (`logo/logo.webp`, başka villanın görseli) üzerine yazabilir.
Admin-only olduğu için privilege escalation değil, ama OOM ve iç yetki sınırı açısından gerçek.

### MEDIUM — Admin JWT query string'de
**Dosya:** `app/api/voucher/[id]/route.ts:13,18` — `?token=<access_token>` destekleniyor ("yeni sekme" UX'i için).
**Risk:** Token reverse-proxy erişim loglarına, tarayıcı geçmişine ve dış linklere giden `Referer` başlığına düşer.

### MEDIUM — Güvenlik header'ı yok
`next.config.ts`'te `headers()` yok; CSP, HSTS, X-Frame-Options, Referrer-Policy tanımlı değil. Admin panel raw HTML inject ediyor (`app/layout.tsx` `custom_head_scripts`, `dangerouslySetInnerHTML`) — CSP'nin yokluğu bunu daha riskli kılıyor.

### Doğru yapılmış olanlar
- Admin/cron route'ların **tamamında** yetki (makine taraması, istisna yok).
- SQL injection: tüm erişim parametreli query-compiler üzerinden; ham string concat bulunamadı.
- `reservation-lookup`: kod+e-posta birlikte + generic 404 + rate limit (`app/api/public/reservation-lookup/route.ts:55,103-106`) — enumeration'a kapalı.
- Rezervasyon response'unda PII yok (yalnız `id` + `reservation_no`).
- `sanitize-html` bağımlılığı mevcut; Argon2 + TOTP + hesap kilidi doğru kurulmuş.
- **Açık madde (önceki audit'ten):** Git geçmişi bir eski PostgreSQL credential'ı içeriyor; rotasyon gerekiyor.

---

## 6. SEO — `Production Ready` (bir istisna ile)

**Doğru:** Locale başına `canonical` + `hreflang` (tr/en/de/x-default) `lib/i18n/seo-alternates.ts:134-138`; `sitemap.ts` (`revalidate=3600`) dil varyantlarını `alternates.languages` ile veriyor; `robots.ts` locale prefix'lerini türetiyor; JSON-LD `VacationRental` + `BreadcrumbList` gerçek veriden üretiliyor (uydurma rating yok); `multilingual_enabled=false` iken `/en`,`/de` 404 ve hreflang hiç eklenmiyor — tutarlı.

**MEDIUM — `**.supabase.co` legacy image host**
`next.config.ts:45` — `remotePatterns`'te eski sağlayıcı host'u duruyor. DB'deki asset alanları hâlâ mutlak legacy URL tutuyorsa kaldırılması `next/image` hard error üretir; tutmuyorsa gereksiz. Hangisi olduğu **DOĞRULANAMADI** (DB erişimi yok). Raporun sonundaki roadmap'te salt-okuma sayım sorgusu var.

**LOW:** `generateStaticParams` hiçbir yerde yok → villa detay sayfaları build'de prerender edilmiyor; SEO açısından sorun değil (SSR yeterli) ama TTFB'yi doğrudan etkiliyor (bkz. Performance).

---

## 7. i18n — `Production Ready`

- Dictionary parite: **tr 924 / en 924 / de 924** anahtar — eksik çeviri yok (makine ile sayıldı).
- Locale tek kaynağı URL; cookie/Accept-Language/middleware yok → yanlış dile yönlenme riski yapısal olarak yok.
- Cache key'leri locale taşıyor (`faqs:get`+locale) → çapraz-dil sızıntısı engellenmiş.
- `public_default_locale` artık `/` girişine bağlı (`lib/i18n/public-home.ts`), TR ana sayfa `/tr`'de indexlenebilir kalıyor.

**Tek gerçek eksik:** çeviri okumalarının cache'siz olması (bkz. Performance/HIGH).

---

## 8. Responsive / Mobile — `Production Ready`

`BottomNav` ve `MobileBookingCta` `env(safe-area-inset-bottom)` kullanıyor; z-index katmanları dokümante ve tutarlı (modal 1000+ > header/cookie 50 > bottom-nav 40 > booking CTA 30); villa detayda çift alt bar çakışması `basePath.startsWith("/kiralik-villa/")` ile engellenmiş; dokunma hedefleri 44px. Belirgin bir sorun bulunamadı.

---

## 9. Reservation System — `Needs Attention`

Akış: `ReservationForm` → `POST /api/public/reservations` → rate-limit (3/10dk) → `verifyPublicReservationPrice` (server-authoritative override) → `verifyPublicReservationStayRules` (orphan-gap) → `createReservation` → conflict fast-path RPC → INSERT → EXCLUDE constraint.

| Kontrol | Durum | Kanıt |
|---|---|---|
| Client fiyat manipülasyonu | ✅ Engellendi | `route.ts:109-135` — 16 finansal alan server'da eziliyor |
| Havuz ısıtma manipülasyonu | ✅ Engellendi | `route.ts:79-87` |
| İndirim snapshot manipülasyonu | ✅ Engellendi | `route.ts:128-135` |
| Double booking (aynı tablo) | ✅ Atomik | GiST EXCLUDE, migration 001/030 |
| Double booking (reservations↔manual) | ❌ **Açık** | Bölüm 4 |
| Rate limit | ✅ 3/10dk/IP | ⚠️ Upstash env'e bağımlı (fail-open) |
| PII sızıntısı | ✅ Yok | yalnız `{id, reservation_no}` |
| Server-side validation | ✅ | 5 throw + stay rules |
| Idempotency | ❌ Yok | Aynı payload iki kez POST edilirse iki kayıt (tarih çakışırsa ikincisi 409 alır; **farklı tarihlerde** duplicate mümkün) |

**MEDIUM — fail-open fiyat doğrulaması:** `verification.authoritative` boşsa (server recompute başarısız) client değerleri **olduğu gibi** kullanılıyor (`route.ts:109` koşulu). Bu bilinçli bir tercih ve yorumda açıklanmış, ama recompute'u bozan bir hata sessizce fiyat güvenliğini kapatır. En azından Sentry'ye uyarı gitmeli.

---

## 10. Storage / R2 — `Production Ready`

Tek implementasyon (`lib/storage/s3-storage.provider.ts`), dual-write/fallback yok. CDN host'ları env'den türetiliyor, fallback sabitleri var (`next.config.ts:19-25`). Supabase kod bağımlılığı **tamamen kaldırılmış** — `git grep -in supabase` tüm ağaçta yalnız `next.config.ts:45`'teki legacy image host'unu döndürüyor.

**Açık maddeler:** upload doğrulaması (Bölüm 5), orphan dosya temizliği için bir mekanizma bulunamadı (villa silinince R2 nesneleri **DOĞRULANAMADI**).

---

## 11. Admin Panel — `Needs Attention`

Yetki disiplini iyi; tüm route'lar `authorizeAdminCaller`/`authorizeAdminSession` geçiyor, 2FA tam kurulmuş, activity log altyapısı var.

**Ana sorun cache invalidation** (Bölüm 3 CRITICAL): admin'in yaptığı değişiklik public tarafa anında yansımıyor. Admin ekranları kendi verilerini cache'siz okuduğu için (`GET /api/admin/settings` → `findSingleton()`) admin "kaydettim, panelde görünüyor" der ama public site eski veriyi gösterir — bu tam olarak bu oturumda yaşanan semptom.

---

## 12. Tests — `Needs Attention`

**158 unit test dosyası. E2E / integration testi yok** (`playwright`/`cypress` dizini yok).

**Gerçekten koruyan testler:** locale routing ve hreflang (40 dosya, 1186 test), cache key izolasyonu, public çeviri sızıntısı, navigation locale persistence'ın yapısal invariant testi (dosya ağacını tarayıp prefix'siz link arıyor — bu iyi bir tasarım).

**Implementation'ı kilitleyen testler:** `*OrchestrationContract` ailesi — kaynak dosyayı **metin olarak** okuyup çağrı sırasını regex ile doğruluyor. Davranışı değil yazım biçimini kilitliyor; refactor'ı pahalılaştırıyor ve gerçek bug yakalamıyor.

**Kapsam boşlukları (kritik yollar):** rezervasyon concurrency/double-booking testi yok, auth/authorization endpoint testi yok, rate-limit testi yok, upload validasyon testi yok.

**Bilinen baseline failure: 51 test / 15 dosya** — tamamı `*OrchestrationContract` + fixture-şekli admin testleri (reservation-create-helpers, reservation-helpers, reservation-service ×3, villa-admin-helpers ×4, villas-form-helpers ×3, public-reservation-form). Bunlar bu audit'ten önce de kırıktı ve düzeltilmedikleri sürece "tüm testler yeşil" sinyali alınamıyor — regresyon tespitini kalıcı olarak zayıflatıyor.

---

## 13. Deployment / Production — `High Risk`

| Bulgu | Kanıt | Risk |
|---|---|---|
| **4 cron production'da çalışmıyor** | `vercel.json` Coolify'da yok sayılır; `docs/coolify-scheduled-tasks.md:3-7` bunu açıkça yazıyor | HIGH — iCal senkronizasyonu, döviz kuru yenileme, log temizliği durmuş durumda |
| Dockerfile / compose / Coolify config repo'da yok | `ls` | MEDIUM — build reprodüksiyonu repo'dan doğrulanamıyor |
| `output: "standalone"` yok | `next.config.ts` | MEDIUM — image'a tüm `node_modules` (~1.2 GB) giriyor |
| Healthcheck DB'ye bakmıyor | `app/api/health/route.ts` — "Hiçbir DB query yapmaz" | MEDIUM — DB çökünce healthcheck yeşil kalır, restart tetiklenmez |
| Env doğrulaması yok | 25 farklı `process.env.*`, merkezi şema yok | MEDIUM — eksik env sessiz degradasyon (rate-limit open mode, mail sessiz fail) |
| `PG_POOL_MAX` varsayılan 10 | `lib/db/pg.client.ts:61` | Bkz. Performance CRITICAL |

Monitoring tarafı iyi: Sentry client/server/edge config'leri mevcut, `ignoreErrors` ile beklenen validation hataları filtreleniyor.
Backup / restore / rollback prosedürü **DOĞRULANAMADI** (repo'da yok).

---

## 14. Dependencies — `Needs Attention`

| Bulgu | Detay | Seviye |
|---|---|---|
| **Çift datepicker** | `react-datepicker@9` **ve** `react-day-picker@8` ikisi de dependency | MEDIUM — public bundle'a ikisi de girebiliyorsa gereksiz ~40-60 KB |
| **Çift password lib** | `bcryptjs` **ve** `@node-rs/argon2` | MEDIUM — native auth Argon2 kullanıyor; `bcryptjs` muhtemelen eski geçiş kalıntısı |
| `country-state-city` | ~1 MB'lık gömülü veri seti | MEDIUM — public formda kullanılıyorsa bundle'a ağır yük; dynamic import adayı |
| `@types/archiver` `dependencies`'te | devDependency olmalı | LOW |

Sürümler güncel (Next 16.2.4, React 19.2.4); bilinen kritik CVE taraması **DOĞRULANAMADI** (`npm audit` çalıştırılmadı — salt-okunur kapsam).

---

## 15. Dead Code / Teknik Borç

- `CURRENCY_OPTIONS.flag` alanı artık hiçbir yerde render edilmiyor (`TopBar.tsx`) — LOW.
- `vercel.json` Coolify ortamında ölü konfigürasyon, ama yanıltıcı: cron'ların çalıştığı izlenimi veriyor — MEDIUM (operasyonel).
- Yorum yoğunluğu çok yüksek: bazı dosyalarda yorum/kod oranı 1:1'e yakın ve yorumlar tarihsel faz anlatıyor. Bir kısmı **artık yanlış** (örn. `revalidate.actions.ts:11` "revalidateTag(tag) KULLANILIR" derken kod 2 argümanlı çağırıyor) — MEDIUM, çünkü yanlış yorum yanlış varsayım üretiyor.
- `TODO/FIXME`: yalnız 1 — temiz.
- TS: `: any` 78, `as any` 22, `as unknown as` 44, `@ts-ignore` **0**. 150k satır için düşük yoğunluk; `as unknown as` çoğunluğu repository sonuç cast'leri. LOW.

---

# Sonuç

## 🔴 CRITICAL

**1. Cache invalidation fiilen çalışmıyor**
`app/services/revalidate.actions.ts:31-76` — 8 fonksiyonun tamamı `revalidateTag(tag, "max")` çağırıyor; Next 16'da bu purge etmiyor, son kullanmayı 1 yıl ileri atıyor. Admin'in hiçbir değişikliği public'e anında yansımıyor.

**2. Sınırsız katalog sorgusu**
`lib/db/villa.repository.server.ts:402-427` — ~1595 villa + tüm görseller + tüm fiyatlar, LIMIT'siz, `select("*")`. Anasayfa, liste sayfası ve **404 sayfası** tüketiyor.

**3. Villa detay dinamik + pool 10**
`app/(public)/kiralik-villa/[slug]/page.tsx:192,252` + `lib/db/pg.client.ts:61` — en değerli sayfa her istekte ~11 sorgu; 10 bağlantılık havuz yüksek trafikte doyar.

## 🟠 HIGH

**4.** Coolify cron'ları kurulu değil — iCal sync, döviz kuru, log temizliği çalışmıyor (`docs/coolify-scheduled-tasks.md:3-7`).
**5.** `/api/auth/login` IP rate-limit'i yok + rate-limit fail-open (`lib/rate-limit.ts:25-28`).
**6.** `reservations` ↔ `manual_reservations` çapraz çakışması DB'de engellenmiyor (TOCTOU).
**7.** `error.tsx` / `global-error.tsx` / `loading.tsx` hiç yok — error boundary sıfır, dinamik sayfalarda beyaz ekran.
**8.** Upload'da boyut/MIME/path doğrulaması yok; `arrayBuffer()` OOM riski (`app/api/admin/storage/upload/route.ts:100-112`).
**9.** Çeviri okumaları cache'siz — her EN/DE isteği ek DB turu (`lib/i18n/get-translation.server.ts:73`).
**10.** **Çekirdek şema versiyon kontrolünde değil** — `villa`/`reservations`/`settings` vb. hiçbir migration'da yok; DB repo'dan kurulamaz, index kapsamı doğrulanamıyor.
**11.** Migration runner + `schema_migrations` ledger'ı yok; aktif RPC tanımları `_archive/legacy/` altında.

## 🟡 MEDIUM

**11.** Güvenlik header'ları yok (CSP/HSTS/X-Frame-Options) — `custom_head_scripts` raw inject'i ile birlikte.
**12.** Admin JWT query string'de (`/api/voucher/[id]?token=`).
**13.** Healthcheck DB'ye bakmıyor; env doğrulaması yok; `output: "standalone"` yok.
**14.** `villa-reviews` tag'i katalog cache'ini de düşürüyor (aşırı invalidation).
**15.** EN/DE villa detayda 4 ardışık await dalgası.
**16.** Public ağaçta 30 ham `<img>`.
**17.** Çift datepicker + çift password lib + `country-state-city` bundle yükü.
**18.** Rezervasyon fiyat doğrulaması fail-open; idempotency yok.
**19.** `next.config.ts:45` legacy image host — veri bağımlı, karar bekliyor.

## 🟢 LOW

**20.** `VillaCard.tsx` 1491 satır client component.
**21.** TS: 78 `any`, 44 `as unknown as`.
**22.** Yanlış/eskimiş yorumlar (özellikle `revalidate.actions.ts:11`).
**23.** `vercel.json` ölü konfigürasyon; `@types/archiver` yanlış bölümde.
**24.** E2E test yok; 51 baseline failure temizlenmemiş.

---

## 🚀 ÖNERİLEN ROADMAP

**1. Cache invalidation düzeltmesi**
*Problem:* `revalidateTag(tag,"max")` purge etmiyor. · *Neden önemli:* Admin'in her değişikliği gecikmeli yansıyor; şu anda yaşanan somut şikâyetlerin kaynağı. · *Dosya:* `app/services/revalidate.actions.ts` (8 satır). · *Çözüm:* İkinci argümanı `{ expire: 0 }` yap. · *Risk:* Çok düşük — purge yönünde, veri kaybı yok. Tek turda yapılabilir.

**2. Coolify cron kurulumu**
*Problem:* 4 zamanlanmış iş çalışmıyor. · *Neden önemli:* iCal senkronizasyonu durduğu için **dış kanallardan (Airbnb/Booking) gelen doluluklar sisteme girmiyor** — bu, double-booking'in en olası gerçek sebebi. · *Dosya:* kod değişikliği yok; `docs/coolify-scheduled-tasks.md` adım adım anlatıyor. · *Risk:* Yok (operasyonel).

**3. Katalog sorgusu + villa detay rendering**
*Problem:* LIMIT'siz `select("*")` ve tamamen dinamik detay sayfası. · *Neden önemli:* Trafik arttığında ilk kırılacak yer burası. · *Dosyalar:* `lib/db/villa.repository.server.ts:402`, `app/components/search/KiralikVillalarPageBody.tsx`, `app/not-found.tsx:45`, `app/(public)/*/kiralik-villa/[slug]/page.tsx`. · *Çözüm:* kart projeksiyonu + DB pagination; `not-found` için küçük ayrı cache; detay sayfasını ISR'e almak; `PG_POOL_MAX` yükseltmek. · *Risk:* Orta — sorgu şekli değişiyor, kapsamlı test gerekir. Aşamalı yapılmalı.

**4. Login rate-limit + Upstash env doğrulaması**
*Problem:* Brute-force/lockout-DoS açık; limitler sessizce kapalı olabilir. · *Dosyalar:* `lib/rate-limit.ts` (yeni `login` bucket), `app/api/auth/login/route.ts`. · *Çözüm:* login bucket'ı (ör. 10/10dk/IP) + Coolify'da Upstash env'lerini doğrula; env yoksa **production'da fail-closed** davran. · *Risk:* Düşük.

**5. Error/loading boundary + healthcheck**
*Problem:* Hata kurtarma ve yükleme durumu yok; DB çökünce container sağlıklı görünüyor. · *Dosyalar:* `app/(public)/error.tsx`, `app/global-error.tsx`, `app/(public)/kiralik-villa/[slug]/loading.tsx`, `app/api/health/route.ts`. · *Risk:* Çok düşük, tamamen additive.

**6. reservations ↔ manual_reservations çapraz trigger**
*Problem:* Çapraz çakışma DB'de engellenmiyor. · *Çözüm:* 031'deki trigger desenini çoğalt (aynı `23P01`, aynı mesaj) → app kodu değişmez. · *Risk:* Orta — production'da mevcut çakışan satırlar varsa trigger eklenmeden önce temizlenmeli.

**7. Upload sertleştirme + güvenlik header'ları**
*Dosyalar:* `app/api/admin/storage/upload/route.ts`, `next.config.ts` (`headers()`). · *Risk:* Düşük.

**8. Şema baseline'ı + index doğrulaması**
*Problem:* Çekirdek şema repo'da yok; en sıcak tabloların index'i bilinmiyor. · *Neden önemli:* Hem felaket kurtarmanın hem de 3. maddedeki performans işinin ön koşulu. · *Çözüm:* `pg_dump --schema-only` → `db/migrations/000_baseline.sql` (uygulanmaz, referans) + `pg_indexes` çıktısını repo'ya almak. · *Risk:* Yok (salt-okuma).

**9. Açık güvenlik maddeleri**
Git geçmişindeki eski PostgreSQL credential'ının rotasyonu; `next.config.ts:45` legacy host kararı için şu salt-okuma sayımı:
```sql
select count(*) from public.villa_images where image_url like '%.supabase.co/%';
```
Hepsi 0 ise blok silinebilir.
