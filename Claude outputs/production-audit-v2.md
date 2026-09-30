# Production A–Z Audit

**Proje:** tatilin-yeri-next (Next.js 16.2.4 / React 19.2.4 / native PostgreSQL / Cloudflare R2 / Coolify+Hetzner)
**Tarih:** 2026-09-19 · **Commit:** `8915658`
**Yöntem:** %100 statik kaynak kod analizi. **Production sunucusuna, production veritabanına, Coolify paneline, Sentry dashboard'una ve gerçek loglara erişim YOKTUR.** Bu nedenle şema drift'i, gerçek index varlığı, cron'ların fiilen çalışıp çalışmadığı ve Sentry'nin event alıp almadığı **doğrulanamamıştır**; ilgili maddeler UNKNOWN olarak işaretlenmiştir.
**Değişiklik:** Hiçbir kaynak dosyası değiştirilmedi, hiçbir migration çalıştırılmadı, DB'ye yazılmadı, commit/push yapılmadı.

---

## Executive Summary

1. **Veri katmanı ve kriptografi mühendisliği gerçekten iyi.** GiST `EXCLUDE` overlap koruması (mig 001/030), external-calendar trigger'ı (031), Argon2id + TOTP + `__Host-` cookie + pinned-HS256 JWT, parametreli QueryBuilder (SQL injection **yok**, CONFIRMED), DNS-resolve sonrası IP doğrulayan SSRF guard'ı. Bunlar çoğu ticari projede bulunmayan kalite.
2. **Ama yetkilendirme yarısı eksik.** 46/46 admin API route'u korunuyor — buna karşılık **29 server action dosyasında hiçbir auth kontrolü yok** ve altlarındaki service/repository katmanlarında da yok. Silme, ödeme hesabı değiştirme ve PII okuma bu yoldan erişilebilir durumda. **Bu, raporun 1 numaralı bulgusudur.**
3. **Fiyat doğrulaması fail-open.** Sunucu fiyatı yeniden hesaplayıp client değerlerini eziyor (doğru) — fakat recompute **throw ederse** client'ın gönderdiği finansal alanlar aynen DB'ye yazılıyor. Kod bunu bilinçli bir tercih olarak belgeliyor (`price-verify.ts:581`).
4. **Rezervasyon iş kuralları sunucuda eksik.** Geçmiş tarih kontrolü, kapasite (misafir sayısı) kontrolü ve minimum konaklama kontrolü **server tarafında yok** — yalnız UI'da. `paid_amount` client'tan geliyor ve onay eşiğini besliyor.
5. **`reservations` ↔ `manual_reservations` çakışması DB'de garanti altında değil.** EXCLUDE tablo-içidir; çapraz koruma yalnız uygulama kodunda ve kodda `BEGIN/COMMIT/connect()` **hiç yok** (CONFIRMED) → klasik TOCTOU.
6. **Gözlemlenebilirlik kurulmuş ama bağlanmamış.** `withSentryConfig` `next.config.ts`'e wire edilmemiş, `/api/health` DB'ye hiç bakmıyor, 449 `console.error`'a karşılık 5–6 `captureException` var. Postgres tamamen ölü olsa Coolify "healthy" gösterir.
7. **Cron'lar muhtemelen hiç çalışmıyor.** Zamanlama `vercel.json`'da tanımlı; deployment Coolify. Projenin kendi dokümanı (`docs/coolify-scheduled-tasks.md`) bunu açıkça yazıyor. Etkisi doğrudan iş riski: iCal sync durursa Airbnb/Booking doluluğu sisteme girmez → **gerçek çift rezervasyon**.
8. **Hiçbir `error.tsx` / `loading.tsx` yok** (tüm `app/` ağacında 0). Herhangi bir server hatası kullanıcıya çıplak Next hata ekranı olarak gidiyor; layout'taki settings okuması patlarsa 404 sayfası dahil tüm site çöker.
9. **Test suite dekoratif hale gelmiş.** 2303 test, sıfır integration/E2E, %23'ü dosya metnini/AST'yi donduran source-lock testi, ve suite 8 commit'tir 51 hatayla kırmızı. Double booking, admin auth bypass ve uçtan uca rezervasyon akışı **hiç test edilmiyor**.
10. **Önceki düzeltmeler doğru uygulanmış** (aşağıda ayrı bölüm): `revalidateTag(..., { expire: 0 })` 8/8 tam ve tag kapsaması simetrik; HeaderWrapper/FooterWrapper cached helper'lara geçmiş; mobil CTA ve TopBar UI değişiklikleri yerinde.

---

## Önceki Düzeltmelerin Re-Verification'ı

| Düzeltme | Durum | Kanıt |
|---|---|---|
| `revalidateTag(tag, { expire: 0 })` | ✅ **DOĞRU ve TAM** | `app/services/revalidate.actions.ts:49,53,57,61,71,78,85,94` — 8/8. Kullanılan 8 tag ↔ invalidate edilen 8 tag **birebir simetrik**; yetim tag yok, karşılıksız invalidation yok. |
| HeaderWrapper → cached helper | ✅ **DOĞRU** | `HeaderWrapper.tsx:15,165,184` — `getCachedSettings()` + `getCachedMenu()`. Sarmalayıcılar aynı fonksiyonu argümansız çağırıyor → veri/tip/null davranışı değişmemiş. |
| FooterWrapper → cached settings | ✅ **DOĞRU (kısmi, bilinçli)** | `FooterWrapper.tsx:16,89`. Taksonomi çağrıları kasten değiştirilmemiş (farklı ORDER BY + `.slice(0,7)`); gerekçe dosyada belgeli. **Ancak** footer'ın 3 cache'siz sorgusu hâlâ her dynamic sayfada ödeniyor → bkz. P3. |
| `public_default_locale` cache invalidation | ✅ **ÇALIŞIYOR** | `unstable_cache` prerender bağlamında tag'ini çevreleyen route cache girdisine yazıyor (`next/dist/.../unstable-cache.js:101-129`), tag push'u DB okumasından önce senkron → `.catch()` tag'i düşürmüyor. `revalidateSettings()` `/`, `/tr`, layout ve sitemap'i temizler. **Tek zayıflık:** admin sayfalarında `revalidateSettings().catch(() => {})` (fire-and-forget) → RPC patlarsa admin "kaydedildi" görür, public 1 saate kadar bayat kalır. |
| BottomNav 4 öğe + gerçek WhatsApp/Phone ikonu | ✅ **YERİNDE** | `BottomNav.tsx:120` `grid-cols-4`; `:304-325` inline `WhatsappGlyph`; `:6,176` lucide `Phone`. "Teklif Al/Öneri Al" yok. |
| MobileBookingCta 3 parçalı, fiyatsız, düz turuncu | ✅ **YERİNDE** | `MobileBookingCta.tsx:125-173`; `:151` `bg-[#ED7926]`, gradient yok, fiyat render'ı yok. |
| TopBar bayrak + kur sembolü (kapalı + açık) | ✅ **YERİNDE** | `:565-567` (kapalı kur), `:600-606` (dropdown kur), `:646-650` (kapalı dil), `:240-244`/`:258-262` (dropdown dil). |

**Sonuç:** Talep edilen 6 düzeltmenin tamamı doğru ve eksiksiz uygulanmış; hiçbiri regresyon üretmemiş. Bunları CRITICAL/HIGH listesine **tekrar almadım**.

---

## Scorecard

| Alan | Puan | Kısa gerekçe |
|---|---:|---|
| Architecture | 62/100 | Katmanlar tanımlı ama dayatılmıyor: 58/79 API route'u service'i atlayıp repository'ye gidiyor, `lib/` → `app/` ters bağımlılık var, i18n route ağacı 3 kez kopyalanmış. |
| Code Quality | 63/100 | Tutarlı hata zarfı ve okunabilir kod; ama 58 sessiz `catch`, 98 `Promise.all`'a karşı 3 `allSettled`, 4 ayrı slugify, 4 ayrı status allow-list. |
| TypeScript | 56/100 | `strict: true` ve 0 `@ts-ignore` — iyi; ama DB sınırı `Record<string, unknown>` + 44 `as unknown as` ile tip güvenliği tam orada kesiliyor. |
| Performance | 55/100 | Cache katmanı temiz kurulmuş (14 helper, ölü yok, tag simetrik). Ama villa detay her istekte 12 sorgu + tamamen dynamic, `select("*")` sınırsız okuma, pagination bellekte, pool max 10. |
| Database | 66/100 | EXCLUDE/trigger/index işçiliği güçlü. Ama **baseline şema dosyası yok** (migrations sıfırdan DB kuramaz), migration runner yok, transaction katmanı yok, `status` için CHECK constraint yok. |
| Security | 38/100 | Kriptografi/SQLi/SSRF/secret yönetimi örnek düzeyde; ancak 29 korumasız server action tek başına bu skoru aşağı çekiyor. Zod yok, güvenlik header'ı yok, login'de IP rate-limit yok. |
| Authentication / Authorization | 45/100 | Authentication ~90 (Argon2id, TOTP, rotation, `__Host-`, DB-backed lockout). Authorization ~25 (action katmanı boşta, rol hiyerarşisi yok). |
| Reservation / Business Logic | 55/100 | Server-authoritative fiyat ve 88 testli price engine güçlü; ama fail-open, cross-table TOCTOU, geçmiş tarih/kapasite/min-stay enforcement yok. |
| i18n | 70/100 | Sözlük paritesi tam (989 anahtar × 3, tip zorunlu), URL tek kaynak, dil değiştirici path+query koruyor. `<html lang="tr">` hardcoded ve route triplication düşürüyor. |
| SEO | 62/100 | hreflang/x-default/sitemap MOD A ve MOD B'de doğru. Soft-404, `/arama` metadata'sız, JSON-LD koşulsuz `InStock`. |
| Testing | 42/100 | 2303 test var ama sıfır integration/E2E, %23 source-lock, 8 commit'tir 51 kırmızı, kritik yolların 4'ünden 3'ü kapsanmıyor. |
| Error Handling | 30/100 | 0 `error.tsx`, 0 `global-error.tsx`, 0 `loading.tsx`, pratikte 0 Suspense. |
| Observability | 28/100 | Sentry wire edilmemiş, source map yok, health check DB'ye bakmıyor, structured logger/correlation ID yok, 449 `console.error` hiçbir yere gitmiyor. |
| DevOps | 32/100 | Dockerfile/.dockerignore/standalone yok, migration runner yok, cron'lar yanlış platformda tanımlı, backup otomasyonu repoda yok, güvenlik header'ı yok. |
| Accessibility | 48/100 | Semantik yapı fena değil; ama marka turuncusu beyaz üstünde **2.85:1** (AA'nın altında), 6 modalde focus trap yok, dropdown'larda klavye navigasyonu yok. |
| Maintainability | 55/100 | %22 yorum oranı ve detaylı belgeleme artı; 3× kopya route ağacı, 31 ölü export, 206 bayat "eski sağlayıcı" yorumu ve çelişen yorumlar eksi. |
| **Production Readiness** | **42/100** | Site çalışıyor ve para kazanıyor; ama bir olay anında **haber alma, teşhis etme ve geri dönme** yeteneği yok. |

---

## World-Class Readiness

**47/100**

Bu bir "kötü proje" notu değildir. Çekirdek mühendislik (DB constraint tasarımı, auth kriptografisi, fiyat motoru, cache mimarisi) 75–85 bandında. Skoru aşağı çeken şey, o çekirdeğin etrafındaki **operasyonel kabuğun** eksikliği: yetkilendirmenin sistematik dayatılmaması, gözlemlenebilirliğin bağlanmamış olması, deployment otomasyonunun bulunmaması ve test suite'inin sinyal üretmemesi.

---

## 🔴 Critical

### C1 — 29 server action'da yetkilendirme yok
- **Problem:** `"use server"` dosyalarının 29'unda auth guard yok; altlarındaki service ve repository katmanlarında da yok. Next.js server action'ları, action ID'sini bilen herkesin POST edebildiği RPC endpoint'leridir. Middleware yalnız `/maki-admin/:path*` yolunu kapatıyor (`middleware.ts:60-64`) — action çağrısı herhangi bir public path'e yapılabilir. DB tarafında RLS yok (tek app rolü).
- **Kod yolu (örnek, uçtan uca doğrulandı):** `app/(admin)/maki-admin/types/types.action.ts:44` `deleteVillaTypeAction` → `app/services/villa-type.service.ts` `deleteVillaType` (auth grep: **0**) → `lib/db/villa-type.repository.ts` `deleteRelationsByTypeId()` + `deleteById()` → `DELETE`.
- **Diğer korumasızlar:** `manual-reservation.action.ts` (sil), `messages.action.ts` (iletişim PII listele/sil), `offer-requests.action.ts` (teklif PII listele/sil), `payment-account.action.ts` / `western-union-account.action.ts` (banka hesabı güncelle/sil → **ödeme yönlendirme dolandırıcılığı**), `property-owner.action.ts`, `finance.action.ts` (ciro/komisyon), `system-logs.action.ts` (mail logları), `features/rules/price-includes/faqs/*.action.ts`, `homepage-collection` + `discount-collection` (`:31-57`), `ical-sync.action.ts`, `external-reservations.action.ts`, `villa-edit.action.ts`, `villa.action.ts` (`getTrashedVillasAction` — bu dosya public `favoriler` bileşeninden de import ediliyor).
- **Etki:** Kimlik doğrulamasız veri silme, ödeme hesabı manipülasyonu, müşteri PII + finansal KPI sızıntısı.
- **Risk:** CRITICAL · **Güven:** CONFIRMED (kod yolunda guard yok, uçtan uca doğrulandı) / LIKELY (canlı sunucuda POST denenmedi)
- **Öneri:** Kısa vade: her mutating/okuyan action'ın ilk satırına `authorizeAdminSession()`. Kalıcı: guard'ı service katmanına indirmek + `"use server"` dosyalarında guard zorunluluğu dayatan ESLint kuralı. **Doğru desen projede zaten var** (`pricing.action.ts`, `gallery.action.ts`, tüm `*-translations.action.ts` kullanıyor) — sorun tasarım değil, eksik uygulama.

### C2 — Fiyat doğrulaması fail-open
- **Problem:** `verifyPublicReservationPrice` herhangi bir hata/eksik veride `{ authoritative: null }` döner (`app/services/reservation/_helpers/price-verify.ts:581-589`). Route `if (verification.authoritative)` ile korunuyor (`app/api/public/reservations/route.ts:110`) → null durumunda **client'ın gönderdiği 16 finansal alan aynen DB'ye yazılır**. Komisyon da bu değerden hesaplanır.
- **Tetikleyici:** `getExchangeRatesMap` (TCMB), `getVillaPrices` veya `getPublicSettings`'ten biri throw eder. Kur cron'u zaten çalışmıyor olabilir (C4).
- **Etki:** `total_price_try: 1` ile rezervasyon oluşturulabilir.
- **Risk:** CRITICAL · **Güven:** CONFIRMED (fail-open kodda açıkça belgeli)
- **Öneri:** Fail-**closed**: recompute başarısızsa 503 + "fiyat doğrulanamadı".

### C3 — `reservations` ↔ `manual_reservations` çakışması DB'de garanti değil
- **Problem:** Tarih bloklayan 3 tablo var (`reservations`, `manual_reservations`, `external_calendar_events`). DB koruması: reservations↔reservations (EXCLUDE, mig 030), manual↔manual (EXCLUDE, mig 001), reservations/manual → external (trigger, mig 031). **reservations ↔ manual çapraz koruması yok** ve external → reservations/manual ters yönü de yok.
- **Kod yolu:** `app/services/reservation/create.service.ts:92-130` — `checkReservationConflict()` (RPC, `STABLE`, kilitsiz) bir `pool.query()`, `insert()` ayrı bir `pool.query()`. Arada `BEGIN` yok. `lib/db` + `app/services` genelinde `BEGIN/COMMIT/pool.connect()` araması **sıfır sonuç** (CONFIRMED). `conflict.ts:58-62` durumu kendisi "race-prone (TOCTOU)" diye yazıyor; `checkManualBlockConflict` ise tamamen NO-OP (`conflict.ts:95-101`).
- **Etki:** Müşteri POST ederken admin aynı villaya manuel blok girerse **her iki yazma da başarılı olur**.
- **Risk:** CRITICAL · **Güven:** CONFIRMED
- **Öneri:** Mig 031'deki trigger desenini `reservations` ↔ `manual_reservations` için simetrik yazmak (uygulama kodu değişmez, mevcut `23P01` catch'i zaten yakalar). Alternatif: create yolunu tek client üzerinde `BEGIN` + `pg_advisory_xact_lock(villa_id)` içine almak.

### C4 — Cron'lar yanlış platformda tanımlı; iCal sync muhtemelen hiç çalışmıyor
- **Problem:** 4 cron `vercel.json`'da tanımlı; deployment **Coolify**. `docs/coolify-scheduled-tasks.md:3-6` birebir şunu yazıyor: *"`vercel.json` içindeki `crons[]` yalnız Vercel platformunda çalışır → bu ortamda hiçbiri tetiklenmiyor."* Ayrıca repoda var olan `short-gaps-refresh` ve `villa-prices-cleanup` route'ları `vercel.json`'da listelenmemiş bile.
- **Etki:** iCal sync durursa Airbnb/Booking doluluğu sisteme girmez → **gerçek çift rezervasyon**. Kur tablosu bayatlar → yanlış fiyat (ve C2'yi tetikleyebilir). Log tabloları sınırsız şişer.
- **Risk:** CRITICAL · **Güven:** CONFIRMED (repo + projenin kendi dokümanı) / **UNKNOWN** (Coolify panelinde manuel task eklenmiş olabilir — **doğrulanması gereken 1 numaralı madde**)
- **Öneri:** Coolify Scheduled Tasks'ı doğrula/kur (doküman hazır reçete içeriyor); ek olarak `last_success_at` yaşını kontrol eden bir alarm.

### C5 — Observability zinciri kopuk: bir olay olduğunda haber alınmıyor
- **Problem (üç ayrı kırık halka, tek sonuç):**
  1. `next.config.ts`'te `withSentryConfig` **yok** → `sentry.client.config.ts` bilinçli boşaltılmış (`export {}`), source map upload yok, client Sentry'nin çalıştığı doğrulanmamış (`instrumentation-client.ts:8-11`'de hâlâ production'a çıkmış debug `console.log` var).
  2. `app/api/health/route.ts:48-55` — dönen `{ ok, serverStartTime, nodeVersion, ... }`; kendi yorumu "Hiçbir DB query yapmaz" diyor (`:33`). **Postgres tamamen ölü olsa Coolify "healthy" gösterir.**
  3. 449 `console.error` / 71 `console.warn` / 43 `console.log`'a karşılık **5–6** `Sentry.captureException`. Yakalanan hataların neredeyse tamamı yalnız container stdout'una düşüyor; `onRequestError` bunları görmez. Structured logger, correlation ID yok.
- **Etki:** iCal sync durması, pool doyması, cron'un çalışmaması ve rezervasyon kaydedilememesi — dördü de **müşteri arayana kadar** fark edilmez.
- **Risk:** CRITICAL · **Güven:** CONFIRMED (kod) / UNKNOWN (Sentry dashboard'una erişim yok)
- **Öneri:** `withSentryConfig` ile wire et; server DSN'i `NEXT_PUBLIC_SENTRY_DSN` yerine non-public `SENTRY_DSN`'e taşı (şu an build-time'a çivili → rebuild'siz değiştirilemez); `/api/health/ready`'ye `SELECT 1` + pool `waitingCount` ekle ve Coolify healthcheck'ini ona bağla.

---

## 🟠 High

### H1 — Hiçbir `error.tsx` / `global-error.tsx` / `loading.tsx` yok
Tüm `app/` ağacında 0 adet (tek istisna markalı `app/not-found.tsx`). Suspense pratikte yok (tek kullanım `TopBar.tsx:656`, `fallback={null}`). Bir server hatası → çıplak "Application error" ekranı, Türkçe değil, marka yok. `app/layout.tsx:150` `getCachedSettings().catch(() => null)` ile korunmuş ama alt bileşenler değil. `/arama` ve `/kiralik-villalar` `force-dynamic` olduğu halde hiç iskelet yok → navigasyonda beyaz bekleme.
**Risk:** HIGH · **Güven:** CONFIRMED · **Öneri:** `app/global-error.tsx` + `(public)/error.tsx` + `(admin)/error.tsx` + kritik route'lara `loading.tsx`.

### H2 — Rezervasyon iş kuralları sunucuda dayatılmıyor
`create.service.ts:70-86` yalnız `villa_id`, tarih varlığı, ad/telefon ve `start < end` kontrol ediyor.
- **Geçmiş tarih:** kontrol **yok** → 2020 tarihli rezervasyon açılabilir ve o aralığı bloklar.
- **Kapasite:** `guests: Number(data.guests) || 1` client'tan (`payload-create.ts:136`); `villa.guests` ile karşılaştırma **hiçbir yerde yok**.
- **Minimum konaklama:** sunucuda yok. Tek gate `verifyPublicReservationStayRules` ve o yalnız *orphan gap* bakıyor; `evaluateOrphanGap` (`lib/stay-rules.helper.ts:105-149`) gece sayısını min-stay ile karşılaştırmıyor.
- **`paid_amount`:** client'tan geliyor (`payload-create.ts:156-158`) ve `assertCanConfirm` tam bu kolonu okuyor → onay eşiği bypass edilebilir. `damage_deposit` de client'tan.
**Risk:** HIGH · **Güven:** CONFIRMED · **Öneri:** Public route'ta `paid_amount`'ı 0'a sabitle, `guests <= villa.guests` ve `start_date >= today` doğrula, min-stay'i server'a taşı.

### H3 — Villa detay sayfası tamamen dynamic, her istekte 12 DB round-trip
`app/(public)/kiralik-villa/[slug]/page.tsx:192` `await searchParams` route'u request-time dynamic'e zorluyor — üstelik `start`/`end` yalnız `BookingSidebar`'ın başlangıç state'i için okunuyor. `:252` Promise.all'da 8 ayrı ilişki sorgusu (images, prices, discounts, distances, features, rules, priceIncludes, externalCalendar) + slug + footer 3. `generateStaticParams` ve `export const revalidate` **hiçbir public route'ta yok** (grep: 0). Sitenin en çok trafik alan SEO sayfası full route cache dışında.
**Not (olumlu):** `generateMetadata` çift-fetch yapmıyor — `page.tsx:102` React `cache()` ile dedupe edilmiş. Doğru yapılmış.
**Risk:** HIGH · **Güven:** CONFIRMED (kod) / etkinin büyüklüğü LIKELY (metrik yok)

### H4 — Connection pool 10 slot; tek sayfa render'ı 9'a kadarını tutabiliyor
`lib/db/pg.client.ts:61-63` — `max: PG_POOL_MAX || 10`, `connectionTimeoutMillis: 10000`. Explicit checkout yok; `Promise.all` içindeki N sorgu **aynı anda** N slot ister. Ölçülen eşzamanlılık tepe noktaları: villa detay 9, `/arama?flexible=3` 6 (`AramaPageBody.tsx:738-740`, 6 paralel RPC), `getMenu` 4, footer 3.
**Asıl tehlike:** Pool doyduğunda timeout hatası `runQuery`'de yakalanıp `{data:null,error}`'a çevriliyor ve repository'ler bunu sessizce `[]`/`null`'a düşürüyor (`cache.helpers.ts:286`, `availability.helper.ts:159`) → sayfa hata vermez, **boş içerik veya yanlış müsaitlik** render eder **ve bu boş sonuç cache'e yazılabilir**.
**Risk:** HIGH · **Güven:** yapı CONFIRMED, eşik değerleri UNKNOWN (prod metrik yok)

### H5 — `select("*")` + LIMIT'siz okuma + bellekte pagination
`lib/db/villa.repository.server.ts:402` (`listPublic`) ve `:461-508` (`findSearchResults`) top-level LIMIT'siz; `villa` tablosunda ~45 kolon var (uzun HTML `description`, `map_embed`, `private_access_token` dahil). Sayfalama DB'de değil JS'te (`AramaPageBody.tsx:876` `sortedVillas.slice(...)`), availability filtresi de JS-side (`:699`).
**Risk:** HIGH · **Güven:** CONFIRMED (kolon listesi + LIMIT yokluğu) / satır sayısı UNKNOWN

### H6 — Migration seti sıfırdan DB kuramaz; runner yok
`db/migrations/` içinde çekirdek tabloların (`villa`, `reservations`, `manual_reservations`, `villa_prices`, `villa_images`, `settings`, `admin_users` …) **hiçbir `CREATE TABLE`'ı yok**; `001` ilk satırdan `ALTER TABLE reservations` diyor. `package.json`'da migration script'i, `schema_migrations` ledger'ı ve CI adımı yok — `db/migrations/_archive/README.md` bunu kendisi itiraf ediyor. 63 dosyanın yalnız 42'si `IF NOT EXISTS` içeriyor.
**Etki:** Disaster recovery ve staging kurulumu imkânsız; deploy'da yeni kod eski şemaya karşı servis verebilir; rollback yolu yok.
**Risk:** HIGH · **Güven:** CONFIRMED (repo) / prod şema drift'i UNKNOWN
**Öneri:** Prod'dan `pg_dump --schema-only` ile `000_baseline.sql` üret (salt kayıt amaçlı), ledger + runner ekle.

### H7 — Katman sınırları dayatılmıyor + ters bağımlılık
58/79 API route'u `@/lib/db/*`'yi doğrudan import ediyor (service'i atlıyor); `app/components/**` içinden 11, `app/(admin)/**` içinden 7 ihlal daha. Ters yönde `lib/` → `app/` 10 import (`lib/cache.helpers.ts:24-27,43`, `lib/db/reservation.repository.server.ts:12` …) → döngüsel import riski.
**Etki:** İş kuralı (status allow-list, komisyon, fiyat) service'te ama çağıranlar repository'ye gidiyor → kural atlanabiliyor. Yeni geliştirici hangi kapıyı kullanacağını bilemiyor.
**Risk:** HIGH · **Güven:** CONFIRMED · **Öneri:** ESLint `no-restricted-imports` ile sınırı dayat, 76 ihlali kademeli taşı.

### H8 — Test suite sinyal üretmiyor
2303 test / 160 dosya, **sıfır integration, sıfır E2E, gerçek DB'ye dokunan tek test yok**. 37 dosya (%23) `readFileSync` ile kaynak metni veya TypeScript AST'sini donduruyor — bunlar refactor yakalar, bug yakalamaz. Suite **8 commit'tir 51 hatayla kırmızı** (doğrulandı: `createReservationOrchestrationContract.test.ts` → "expected +0 to be 1", yani AST'de artık bulunmayan bir çağrıyı arıyor; kod refactor edildi, fixture güncellenmedi). CI workflow'u yok.
**Kritik yol kapsaması:** double booking ❌ · yanlış fiyat ✅ (88 testli price engine — suite'in en güçlü yeri) · admin auth bypass ❌ (middleware için **hiç test yok**) · uçtan uca rezervasyon ❌.
**Risk:** HIGH · **Güven:** CONFIRMED

### H9 — `<html lang="tr">` üç locale'de de sabit
`app/layout.tsx:157`. `/en/*` ve `/de/*` sayfalar Türkçe etiketleniyor → ekran okuyucu yanlış dilde telaffuz eder, hreflang sinyaliyle çelişir, WCAG 3.1.1 ihlali.
**Risk:** HIGH · **Güven:** CONFIRMED

### H10 — Marka turuncusu kontrast AA'nın altında
`#ED7926` beyaz üstünde **2.85:1** (AA normal metin 4.5:1, büyük metin/UI 3:1 — ikisini de geçmiyor). Etkilenen: `MobileBookingCta.tsx:151-152` ana CTA, `BottomNav.tsx:214` aktif sekme, `TopBar.tsx:427`.
**Risk:** HIGH · **Güven:** CONFIRMED (hesaplanmış) · **Öneri:** Dolgu rengi kalabilir; üzerindeki beyaz metin için tonu ~`#B8590F` seviyesine koyult.

### H11 — Soft-404: silinmiş villa 200 dönüyor
`app/(public)/kiralik-villa/[slug]/page.tsx:205-215` `notFound()` yerine `<section>Villa bulunamadı</section>` render ediyor (`en`/`de` kopyaları ve TR `app/p/[slug]` aynı; EN/DE `p/[slug]` **doğru** yapıyor — tutarsız). `generateMetadata` `noindex` veriyor, bu hafifletici ama Google "Soft 404" raporlar ve crawl bütçesi yenir. Ayrıca slug-history/redirect yok → slug değişince eski URL kalıcı soft-404.
**Risk:** HIGH · **Güven:** CONFIRMED

### H12 — JSON-LD `availability` koşulsuz `InStock`
`app/components/seo/StructuredData.tsx:274-283`. Tamamen dolu villa bile "stokta" görünüyor; `price` tüm `villa_prices` içindeki minimum gecelik ama `Offer`'da `priceSpecification`/`unitCode`/`validThrough` yok → toplam fiyat sanılabilir. Google "fiyat uyuşmazlığı" manuel işlem riski.
**Risk:** HIGH · **Güven:** CONFIRMED

### H13 — `map_embed` sanitize edilmeden render ediliyor
`PrivateVillaPageBody.tsx:732` ve `VillaMapModal.tsx:209` — ham `dangerouslySetInnerHTML`. Aynı dosyadaki `description` `sanitizeHtml()`'den geçiyor, `map_embed` geçmiyor. Yazma yolu admin-gated (`PUT /api/admin/villas/[id]/full` korumalı) ama C1 ile birleşince yükseliyor.
**Risk:** HIGH · **Güven:** CONFIRMED · **Öneri:** iframe-only allow-list (`google.com/maps` src'li).

### H14 — Çeviri yoksa TR metin `hreflang="en"` altında servis ediliyor
`lib/i18n/taxonomy-name.helper.ts:47-60` fallback = canonical TR; villa **adı** hiçbir locale'de çevrilmiyor (bilinçli). Çeviri satırı olmayan kayıtlar için `/en/...` sayfası İngilizce etiketle Türkçe gövde sunuyor.
**Risk:** HIGH · **Güven:** CONFIRMED · **Öneri:** Çeviri kapsaması eşiğin altındaki kayıtlarda o locale'i hreflang setinden düşür veya `noindex`.

### H15 — Rezervasyon e-postası client'tan tetikleniyor
**İyi kısım (CONFIRMED):** Rezervasyon önce DB'ye yazılıyor; mail `/api/public/reservations` içinde değil → Resend çökse bile rezervasyon kaybolmaz.
**Kötü kısım:** Mail `dispatchPublicReservationRequestMail.ts:36-58` ile tarayıcıdan fire-and-forget POST ediliyor. Kullanıcı sekmeyi kapatır, ağ düşer veya bir eklenti isteği keserse mail hiç gitmez; sunucu tarafında kuyruk/telafi yok, hata yalnız tarayıcı konsoluna `console.warn` olarak düşer. Ayrıca Resend `fetch`'inde timeout ve retry yok (`app/lib/mail/client.ts:158`).
**Risk:** HIGH · **Güven:** CONFIRMED

### H16 — Docker/deploy altyapısı repoda yok
`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `nixpacks.toml` — hiçbiri yok. `output: 'standalone'` yok. `.dockerignore` olmadığı için `node_modules` ve `.next/` build context'e giriyor. `next.config.ts`'te `headers()` yok → CSP/HSTS/X-Frame-Options/X-Content-Type-Options/Referrer-Policy **hiçbiri** tanımlı değil (Cloudflare/Coolify proxy'sinde olabilir — UNKNOWN). Backup otomasyonu repoda yok (Hetzner snapshot olabilir — **doğrulanmalı**).
**Olumlu:** `eslint.ignoreDuringBuilds` ve `typescript.ignoreBuildErrors` **yok** → TS hatası ve ESLint error build'i kırıyor. Bozuk kod bu kanaldan sızmıyor.
**Risk:** HIGH · **Güven:** CONFIRMED (repo) / UNKNOWN (Coolify tarafı)

---

## 🟡 Medium

- **M1 — Login'de IP rate-limit yok.** `app/api/auth/login/route.ts` `applyRateLimit` çağırmıyor (diğer public route'larda var). Tek koruma DB-backed per-account lockout (`login.service.ts:32-37` — bu **iyi**, restart ve çoklu replikaya dayanıklı). Eksik olan: password-spraying, hedefli hesap kilitleme DoS, ve Argon2id (19 MiB) + her başarısızlıkta `timingSafeDummyVerify` ile bellek tüketimi. **CONFIRMED.**
- **M2 — Rate-limit env yoksa sessizce kapanıyor.** `lib/rate-limit.ts` Upstash Redis kullanıyor (paylaşımlı, doğru seçim) ama `UPSTASH_REDIS_REST_URL/TOKEN` yoksa "open mode" — tüm limitler devre dışı, yalnız `console.warn`. **Prod'da bu env'lerin set olduğu doğrulanmalı (UNKNOWN).**
- **M3 — Zod / şema doğrulaması hiç yok.** Repo genelinde `zod` import'u 0. Tüm mutating route ve action'lar gövdeyi `as SomeType` ile cast ediyor. Mass assignment örneği: `app/api/admin/villas/[id]/full/route.ts:70` `updateVillaFull({ id, ...body })`. **Olumlu:** public rezervasyonda `status` sabit `"pending"` ve finansal alanlar eziliyor. **CONFIRMED.**
- **M4 — Admin rol hiyerarşisi yok.** `app/api/admin-users/[id]/route.ts:93-107` payload'u whitelist'liyor ama herhangi bir aktif admin başka bir admin'in şifresini değiştirebilir veya silebilir. **CONFIRMED.**
- **M5 — Upload'da MIME/boyut/magic-byte doğrulaması yok.** `app/api/admin/storage/upload/route.ts:69-112` — `path` (R2 key) ve `contentType` tamamen istemci kontrolünde, `upsert=true`. Auth-gated ama C1 ile birleşince yükselir; HTML/SVG yüklemesi CDN origin'inde stored XSS üretir. **CONFIRMED.**
- **M6 — `reservations.status` için CHECK constraint yok.** Bloklayan set yalnız EXCLUDE'un `WHERE status IN (...)` predikatında. `'Confirmed'` gibi bir tipo DB'ye girer ve **bloklayıcı sayılmaz** → sessiz çift rezervasyon. **CONFIRMED.**
- **M7 — Hard-delete transaction dışı, kısmi silme bırakıyor.** `app/services/villa-admin/hard-delete.service.ts:55-80` önce R2 dosyalarını ve 7 ilişki tablosunu siliyor, sonra `villa` satırını. Son adım `23503` ile reddedilirse (rezervasyonu olan villa) görseller/fiyatlar/özellikler **zaten silinmiştir** ve geri dönüş yok. **CONFIRMED.**
- **M8 — Ödeme hesabı "tek aktif" invariant'ı atomik değil.** `lib/db/payment.repository.server.ts:211,323` — yorum aynen "atomicity yok (intentional)". İki IBAN aynı anda aktif kalabilir veya hiçbiri kalmaz. **CONFIRMED.**
- **M9 — iCal sync hata durumunda `last_success_at`'i yine güncelliyor.** `app/services/external-calendar.service.ts:310-345` — `deactivateStale` patlasa bile "son başarı: şimdi" yazılıyor → iptal edilmiş rezervasyonlar aktif kalır, izleme yeşil görünür. **CONFIRMED.**
- **M10 — Footer'ın 3 sorgusu her dynamic sayfada ödeniyor.** `FooterWrapper.tsx:90,91,95` (`findAllVillaLocations`, `findAllVillaTypes`, `findActivePages`) cache'siz — site geneli sabit vergi. Aynı şekilde `getExchangeRatesMap` her arama isteğinde, `getShortGapCounts` her ana sayfa build'inde cache'siz. **CONFIRMED.**
- **M11 — `/arama` üç locale'de de `generateMetadata`'sız.** Canonical yok, tüm filtre kombinasyonları aynı başlık, sayfa düzeyinde `noindex` yok (yalnız `robots.txt` Disallow — bu indexlenmemeyi garanti etmez). Arşiv sayfalaması da tek canonical'a çöküyor (`kiralik-villalar-metadata.ts:52-58`). **CONFIRMED.**
- **M12 — JSON-LD ve breadcrumb MOD B'de redirect eden URL'e işaret ediyor.** `StructuredData.tsx:110,143` `url: abs("/")` sabit; villa breadcrumb'ının 2. adımı `/arama` (robots.txt'te Disallow) ve adları TR hardcoded. **CONFIRMED.**
- **M13 — 58 sessiz `catch`, 449 `console.error`.** Çoğu bilinçli ("audit hatası login akışını bozmaz") ama kayıp hiçbir yere raporlanmıyor. 17 `console.*` satırı müşteri e-postası/telefon ile aynı satırda (`app/lib/mail/send.ts:39-44`, `client.ts:161-166`) → container loglarında düz PII. API key maskeleniyor, `DATABASE_URL` hiç loglanmıyor (iyi). **CONFIRMED.**
- **M14 — Sentry'ye PII gönderiliyor.** `app/lib/mail/send.ts:118-121` `extra` alanına alıcı e-posta ve konu. `beforeSend`'de scrubbing yok. KVKK açısından değerlendirilmeli. **CONFIRMED.**
- **M15 — Admin token query string'den kabul ediliyor.** `lib/admin-route-auth.ts:174` `?token=`. Voucher route'u `Referrer-Policy: no-referrer` + `no-store` ile azaltmış ama token tarayıcı geçmişine ve sunucu access log'una yazılır. **CONFIRMED.**
- **M16 — `PGSSLMODE=require` → `rejectUnauthorized: false`.** `lib/db/pg.client.ts:46`; `.env.example:22` varsayılanı `require`. Sertifika doğrulanmıyor → MITM yüzeyi. `verify-full` önerilir. **CONFIRMED.**
- **M17 — `/api/mail/reservation-request` IDOR.** `route.ts:55-64` rastgele `reservationId` alıyor, sahiplik kontrolü yok → enumerate edilen UUID ile müşteriye rezervasyon detaylı mail gönderilebilir. Rate-limit 5/dk/IP var ama IP rotasyonu ile aşılır. **CONFIRMED.**
- **M18 — Root layout'ta gereksiz ağırlık.** `app/layout.tsx:4` Leaflet CSS (yalnız admin kullanıyor) her public sayfada; 4 next/font ailesi yükleniyor (Inter + Fraunces yorumda "yalnız admin" deniyor). `next.config.ts` `images`'ta `formats` yok → AVIF kapalı. `react-datepicker` + `date-fns` hero'da statik import, `next/dynamic` public tarafta tek yerde. **CONFIRMED.**
- **M19 — `<head>` içine `<div>` enjekte ediliyor.** `app/layout.tsx:164-169` — geçersiz HTML; tarayıcı `<div>`'i body'ye taşır, `</head>` erken kapanabilir. **CONFIRMED.**
- **M20 — Modal/dropdown klavye erişimi.** Focus trap yalnız `SearchBottomSheet.tsx`'te; `SuccessModal`, `VillaMapModal`, `VillaVideoModal`, `VillaCardBookingModal`, `Gallery` — `role="dialog"` + Escape var, focus trap ve focus geri verme yok. TopBar dropdown'larında Escape ve ok tuşu yok; `role="option"` öğeleri `<li>` içinde sarılı → geçersiz ARIA. **CONFIRMED.**
- **M21 — TopBar tamamen client-fetch.** `TopBar.tsx:275-287` mount'ta fetch, `:330` `if (!settings) return null` → dil/kur seçicileri JS yüklenene kadar DOM'da yok (CLS). Currency context `localStorage` erişimi try/catch'siz (`CurrencyContext.tsx:47,58`) ve H1 nedeniyle throw ederse sayfa çöker. `:95-98`'de production `console.log` kalmış. **CONFIRMED.**
- **M22 — Tarih hydration riski.** `AvailabilityInlineCalendar.tsx:254` render gövdesinde `new Date()`; `BookingCalendar.tsx:149`, `BookingSidebar.tsx:201,268`, `HeroSearchPanel.tsx:284` benzer. Sunucu UTC / istemci UTC+3 sınırında gece yarısı civarı "bugün" farklı hesaplanır. Ayrıca `stay-verify.ts:126` sunucunun yerel saatini kullanıyor. **LIKELY.**
- **M23 — Admin FK'leri eksik.** `admin_sessions.admin_id`, `admin_totp_recovery_codes.admin_id`, `reservation_share_links.created_by` için FK yok (`070:51` "FK YOK — soft ref"). Admin silinince yetim satırlar kalır; `admin_id` yeniden kullanılırsa geçersiz refresh token canlanabilir. **CONFIRMED.**
- **M24 — Deploy'da cache soğuk + graceful shutdown yok.** 33 `unstable_cache` kullanımı `.next/cache` dosya sistemine yazıyor → yeni container'da boş, deploy sonrası thundering herd. `closePgPool()` var ama SIGTERM/SIGINT handler'ı yok → uçuştaki istekler yarıda kalır. **CONFIRMED.**
- **M25 — i18n route ağacı 3 kez kopyalanmış.** `app/(public)/` (TR) + `en/` + `de/`; en+de'de 34 `page.tsx` / 2080 LOC, dosya başına fark 8–38 satır (≈%95 kopya). 4. dil = 17 dosya daha; her bug fix 3 yerde. **CONFIRMED** — bu, 3–5 yıllık ufuktaki en büyük bakım borcu.

---

## 🔵 Low

- **L1 — Aynı iş kuralının çoklu tanımı.** Availability status allow-list 4 yerde (`lib/availability.validator.ts:31` canonical, `conflict.ts:51` bağımsız ikinci tanım, `manualReservation.service.ts:36`, mig 030). Slugify 4 divergent implementasyon: `lib/slug.ts:45` (TR map + NFKD), `BlogPostForm.tsx:38` (NFKD yok), `villa-zip/[token]/route.ts:41` (TR map yok → `ı/ş/ğ` kaybolur), `lib/villa-image.helpers.ts:97`. **CONFIRMED.**
- **L2 — 31 ölü export + ölü soyutlama.** `lib/db/index.ts`, `lib/db/server.ts`, `lib/db/db.provider.ts` yalnız bir type re-export ediyor; `lib/db/server.ts:14`'te bozuk yol kalmış (`./eski sağlayıcı-db.server`). `closePgPool` hiç çağrılmıyor. **CONFIRMED.**
- **L3 — 206 bayat "eski sağlayıcı" yorumu ve çelişen yorumlar.** `app/(public)/layout.tsx:26-29` "MaintenanceScreen.tsx … dosya SİLİNDİ" diyor; dosya duruyor ve `:14`'te import ediliyor. `admin-user.service.ts:10` "TODO: bcrypt + salt" diyor; gerçek implementasyon Argon2id. Yorum oranı %22,1 (33.162 satır) — büyük kısmı tamamlanmış migration anlatısı. Yeni geliştiriciyi aktif yanlış yönlendiriyor. **CONFIRMED.**
- **L4 — İki ölü public bileşen.** `WhyUsSection.tsx` ve `HeroTrustStrip.tsx` hiçbir yerden import edilmiyor, içlerinde hardcoded TR metin var. **CONFIRMED.**
- **L5 — Cron secret karşılaştırması constant-time değil.** `lib/cron-auth.ts:46` `header !== expected`. Secret yoksa 503 (fail-closed, doğru). Ağ üzerinden timing sızıntısı pratikte sömürülemez. **LIKELY.**
- **L6 — Hata mesajı sızıntısı.** ~60 yerde ham `pg` hata metni yanıta konuyor (`app/api/admin/settings/route.ts:39,107` vb.) → kolon/constraint adları sızıyor. **CONFIRMED.**
- **L7 — Sitemap `lastModified: now`.** `app/sitemap.ts:174` — dört statik girdide her üretimde "şimdi" → lastmod sinyali değersiz. EN/DE'nin kendi URL girdisi yok, yalnız `alternates.languages` içinde. **CONFIRMED.**
- **L8 — ~90 admin `<button>`'da `type` eksik** (308 içinden ~217'sinde var) → form içinde yanlışlıkla submit. **LIKELY.**

---

## 💪 Strong Areas

1. **DB constraint tasarımı.** GiST `EXCLUDE` + status-predicate (mig 030), external-calendar BEFORE trigger'ı (031), `villa_discounts` overlap koruması (079), availability index'leri (039). Çoğu rezervasyon sistemi bu seviyede değil.
2. **Authentication kriptografisi.** Argon2id (m=19456, t=2, p=1 — OWASP minimum), TOTP 2FA + recovery codes, HS256 pinned + `typ` doğrulaması (type-confusion kapalı), `__Host-` prefix + httpOnly + Strict refresh cookie, refresh rotation, DB-backed lockout.
3. **SQL injection ve SSRF savunması.** `lib/db/query-compiler.ts:130-146` identifier whitelist + tüm değerler `$n` parametreli; repoda template-literal SQL **0**. `lib/security/ssrf.server.ts:33-89` DNS resolve sonrası her IP için private/reserved kontrolü + her redirect hop'unda yeniden doğrulama.
4. **API route guard kapsaması.** 46/46 admin route + 6/6 cron route korunuyor; guard'lar erken `return` ile çıkıyor, yalnız loglayan sahte guard yok.
5. **Cache mimarisi.** 14 helper, **ölü helper yok**, tag↔invalidation simetrisi tam, `unstable_cache` + `revalidateTag(..., {expire:0})` doğru kurulmuş. `generateMetadata` React `cache()` ile dedupe edilmiş.
6. **Fiyat motoru.** Server-authoritative override + 88 testli `price-engine.test.ts` + indirim/pool-heating doğrulama testleri. Suite'in gerçek değer üreten çekirdeği burası.
7. **iCal servisi.** `external-calendar.service.ts:76-146` — AbortController + 10s deadline + manual redirect + SSRF re-validation + asla throw etmeyen `{ok,error,stage}` sözleşmesi. Repodaki en dayanıklı dış bağımlılık.
8. **Tarih tipi seçimi.** `start_date`/`end_date` `date` tipinde ve `pg-type-parsers.ts:76` DATE'i ham `YYYY-MM-DD` string'e çeviriyor → sürücü katmanında UTC kayması yok.
9. **Secret hijyeni.** `.gitignore` `.env*` kapsıyor, `git ls-files | grep -i env` boş, hassas `NEXT_PUBLIC_*` yok, S3 kimlik bilgileri server-only.
10. **i18n sözlük disiplini.** 989 anahtar × 3 dil, `Dictionary` kapalı bir tip (opsiyonel alan 0) → eksik anahtar **derleme hatası**. Runtime "missing key" yapısal olarak imkânsız.

---

## ⚠️ What Actually Needs Work

Önem sırasına göre, gerçekten yapılması gerekenler:

1. **Server action yetkilendirmesi** (C1) — tek maddede en büyük risk azaltımı.
2. **Coolify cron'larının doğrulanması/kurulması** (C4) — doğrudan çift rezervasyon riski.
3. **Fiyat fail-open → fail-closed** (C2) ve cross-table overlap trigger'ı (C3).
4. **Rezervasyon iş kurallarının sunucuya taşınması** (H2): geçmiş tarih, kapasite, min-stay, `paid_amount`.
5. **Observability'nin bağlanması** (C5): `withSentryConfig`, gerçek health check, structured logger.
6. **`error.tsx` / `loading.tsx`** (H1).
7. **Şema baseline + migration runner** (H6).
8. **Villa detay sayfasının ISR'a döndürülmesi ve sorgu sayısının düşürülmesi** (H3, H4, H5).
9. **Test suite'in yeşile çekilmesi + en az iki gerçek test** (H8): DB constraint'ini çalıştıran bir double-booking testi, admin endpoint'e auth'suz istek atıp 401 bekleyen bir test.
10. **i18n route ağacının tekilleştirilmesi** (M25) — acil değil ama ertelendikçe pahalılaşan tek kalem.

---

## 🛡️ What Should NOT Be Touched

Bunlar çalışıyor ve dokunulması net risk üretir:

- **`db/migrations/001`, `030`, `031`, `039`, `079`** — EXCLUDE constraint'leri, status predicate'i, external-calendar trigger'ı ve availability index'leri. Yeni trigger **eklenebilir**; mevcutlar değiştirilmemeli.
- **`lib/auth/native/**`** — JWT/Argon2/TOTP/cookie katmanı. Parametreler OWASP uyumlu, `typ` doğrulaması type-confusion'ı kapatıyor.
- **`lib/db/query-builder.ts` + `query-compiler.ts`** — parametreleme ve identifier whitelist'i doğru. Yeni DSL özelliği eklemek injection yüzeyi açar.
- **`app/services/revalidate.actions.ts` ve `lib/cache.helpers.ts` tag şeması** — simetri tam. `updateTag`'e geçme veya tag yeniden adlandırma denemesi yapılmamalı.
- **`lib/security/ssrf.server.ts`** ve iCal fetch akışı.
- **`lib/i18n/public-home.ts`** — MOD A/MOD B saf çözümleyicisi; iki sayfa da aynı fonksiyonu okuduğu için redirect döngüsü yapısal olarak imkânsız.
- **TR prefix'siz URL mimarisi ve `DEFAULT_LOCALE`** — SEO değeri burada; `[locale]` tekilleştirmesi yapılırsa TR URL'leri **aynen** korunmalı.
- **`app/api/public/reservations` içindeki authoritative override bloğu** — yalnız fail-open dalı düzeltilmeli, override mantığı doğru.
- **Header/Footer cached helper geçişi ve footer'ın taksonomi çağrıları** — taksonomi swap'i bilinçli olarak yapılmadı (farklı ORDER BY + `slice(0,7)`); geri alınmamalı.

---

## 📈 Recommended Roadmap

| # | Öncelik | Madde | Neden | Tahmini risk | Değişiklik kapsamı |
|---|---|---|---|---|---|
| 1 | P0 | 29 server action'a `authorizeAdminSession()` | Kimlik doğrulamasız silme + ödeme hesabı manipülasyonu + PII sızıntısı | Düşük (additive guard, mevcut desen kopyalanıyor) | 29 dosya, dosya başına 2–3 satır |
| 2 | P0 | Coolify Scheduled Tasks doğrula/kur; `vercel.json`'ı kaldır | iCal sync durursa gerçek çift rezervasyon | Yok (repo dışı konfig) | 1 doküman + panel |
| 3 | P0 | `price-verify` fail-closed + `paid_amount`/`guests`/geçmiş tarih server enforcement | Para manipülasyonu ve onay eşiği bypass'ı | Orta (rezervasyon akışına dokunuyor — test şart) | 2–3 dosya |
| 4 | P0 | `reservations` ↔ `manual_reservations` cross-table trigger (mig 031 deseni) | Tek kalan DB-garantisiz double booking yolu | Düşük (uygulama kodu değişmiyor, `23P01` catch'i mevcut) | 1 migration |
| 5 | P1 | `/api/health/ready` (`SELECT 1` + pool durumu) + Coolify healthcheck'e bağla | Ölü DB'yi hiçbir şey fark etmiyor | Düşük | 1 route + panel |
| 6 | P1 | `withSentryConfig` + server DSN'i non-public'e taşı + debug log temizliği | Hataların %99'u hiçbir yere gitmiyor | Düşük | `next.config.ts` + 2 config |
| 7 | P1 | `global-error.tsx` + `(public)/error.tsx` + `(admin)/error.tsx` + kritik `loading.tsx` | Kullanıcı çıplak Next hata ekranı görüyor | Düşük (additive) | 4–6 yeni dosya |
| 8 | P1 | `000_baseline.sql` + `schema_migrations` ledger + runner script | DB sıfırdan kurulamıyor, deploy sırası garantisiz | Düşük (salt kayıt + script; mevcut DB'ye dokunmaz) | `db/` + `package.json` |
| 9 | P2 | Villa detayı ISR'a döndür (`searchParams`'ı client'a al) + 8 ilişki sorgusunu tek embed'e indir; footer/exchange-rate cache'le | En çok trafikli sayfa full-cache dışında; pool 10 slot | Orta–yüksek (sorgu şekli değişiyor) | 3–5 dosya + 1 repository metodu |
| 10 | P2 | 51 kırmızıyı temizle + 2 gerçek test ekle (DB constraint'li double-booking, admin 401) + CI gate | Suite şu an sinyal üretmiyor | Düşük | `tests/` + 1 workflow |

---

## Final Verdict

Bu proje, **çekirdeği güçlü ama kabuğu tamamlanmamış** bir sistem. Veri modeli, constraint tasarımı, auth kriptografisi, SQL/SSRF savunması ve fiyat motoru gerçekten iyi mühendislik ürünü — bu katmanlar tek başına değerlendirilse 75–85 bandında ve çoğu ticari villa platformunun üstünde. Sorun, bu çekirdeğin etrafındaki operasyonel katmanın hiç kurulmamış olması: yetkilendirme API route'larında sistematik ama server action'larda yok; gözlemlenebilirlik paketleri kurulu ama hiçbiri bir alarma bağlı değil; cron'lar yanlış platformun formatında tanımlı; test suite'i 2303 testle etkileyici görünüyor ama sekiz commit'tir kırmızı ve en pahalı üç bug sınıfının ikisini hiç kapsamıyor. **World-class seviyeye mesafe teknik derinlik eksikliği değil, disiplin ve operasyonel tamamlanmışlık eksikliği** — ki bu, mimari borçtan çok daha ucuz kapanır: yukarıdaki ilk dört madde birkaç günlük odaklı işle risk profilini tamamen değiştirir.

**En büyük üç teknik eksik:** (1) Server action katmanında yetkilendirme yokluğu — tek başına en yüksek istismar riski. (2) Bağlanmamış gözlemlenebilirlik + DB'ye bakmayan health check + çalışmayan cron üçlüsü — bir olay olduğunda haber alma yeteneği sıfır. (3) Rezervasyon iş kurallarının (kapasite, geçmiş tarih, min-stay, `paid_amount`) ve fiyat doğrulamasının fail-open olması — doğrudan para ve envanter riski.

**Mevcut sistem genel olarak sağlam mı? Evet — ama şartlı.** Sistem doğru çalıştığında doğru sonuç üretiyor; tasarım kararlarının çoğu bilinçli ve belgelenmiş. Kırılganlık "normal akışta" değil, **hata anında** ortaya çıkıyor: bir şey ters gittiğinde sistem sessizce yanlış davranıyor (fail-open fiyat, boş sonuç cache'leme, `last_success_at` yalanı, çıplak hata ekranı) ve bunu kimse görmüyor. Production'da tutulabilir, ama şu an bir olayı **önleyen** değil, olduktan sonra **müşteriden öğrenen** bir sistem.
