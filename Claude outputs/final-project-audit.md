# Tatilin Yeri — Kapsamlı Son Audit (SEC-01/03/05/06 sonrası)

**Tarih:** 25 Eylül 2026 · **Kapsam:** mevcut çalışma ağacı (HEAD `2015332` + uygulanmış SEC-06 değişiklikleri) · **Mod:** salt-okunur (hiçbir kod/DB/env/config/R2 değişikliği yapılmadı)

**Yöntem:** Kod okunarak davranışsal inceleme. Kritik/High bulguların tamamı dosya + satır seviyesinde ayrıca elle doğrulandı. Kanıt olarak kullanılanlar:
- Mevcut production build çıktısı (`.next`: route tablosu, bundle istatistikleri),
- Yerel test veritabanı (yalnızca SELECT/EXPLAIN),
- Tam test suite koşusu.

Production DB, Coolify env değerleri, Traefik/Cloudflare ayarları ve R2 bucket ayarlarına erişim yok. Bunlara bağlı her şey **"doğrulanamadı"** olarak işaretlendi.

---

## 1. Executive Summary

**Genel görünüm.** Proje, Supabase + Vercel'den native PostgreSQL + R2 + Coolify'a geçişi büyük ölçüde başarıyla tamamlamış, çalışan bir production uygulaması. En kritik iş akışı olan public rezervasyon ve fiyat zinciri, SEC-06 sonrası sunucu otoritesinde ve fail-closed.

**Güçlü temeller:**
- Kimlik doğrulama sağlam:
  - Argon2id,
  - `__Host-` httpOnly cookie,
  - refresh token hash + rotasyon,
  - AES-GCM şifreli TOTP.
- Kimliği doğrulanmamış bir saldırganın doğrudan istismar edebileceği **Critical** bir açık bulunmadı.
- SQL injection'a dayanıklı bir query builder var.
- Aynı tablo içinde çift rezervasyon DB seviyesinde (EXCLUDE constraint) engelleniyor.
- 3.846 testlik geniş bir test takımı var.

**Asıl risk, "sınırlı yetkili admin" senaryosunda toplanıyor.** Server action'ların tamamı izin kontrollü, ama 81 API route'undan yaklaşık 70'i yalnızca "aktif admin mi?" diye bakıyor. Sonuç olarak, örneğin sadece `blog` yetkisi olan bir personel:
- başka bir admin hesabını silebilir,
- Resend API anahtarını okuyabilir,
- villa kalıcı silebilir,
- tüm müşteri PII'ını okuyabilir,
- CDN'deki logo/görselleri değiştirebilir,
- admin paneli üzerinden SSRF yapabilir.

**Supabase → native geçişten kalan bir regresyon var.** Yayında olmayan (taslak) blog yazıları ve pasif CMS sayfaları, slug'ı bilen herkese açık ve indekslenebilir. Önceden bunu RLS gizliyordu.

**İkincil riskler:**
- Operasyonel belirsizlikler:
  - rate-limit'in Upstash'e bağlı olup fail-open çalışması,
  - `NEXT_PUBLIC_*` build değişkenleri için koruma olmaması,
  - cron dokümanının eksik olması.
- DB şeması repodan yeniden kurulamıyor.
- Manuel blok ↔ rezervasyon çakışmasına DB garantisi yok.
- Bakım yükü yüksek:
  - kodun ~%33–47'si yorum,
  - 18 dosya 1.000+ satır.

**Genel Production Skoru: 6/10.** Site bugün çalışıyor ve dışarıdan kritik açık yok. Ancak yetki modeli API'de uygulanmadığı, taslak içerik sızdığı ve bazı production ayarları doğrulanamadığı için "güvenle ölçeklenebilir" seviyede değil.

---

## 2. Production Readiness

| Alan | Durum |
|---|---|
| Public rezervasyon + fiyat bütünlüğü | ✅ Hazır (SEC-06 regresyonu doğrulandı) |
| Admin kimlik doğrulama (login/2FA/session) | ✅ Güçlü (revocation eksikleri var) |
| Admin yetkilendirme (API) | ❌ Eksik (SEC-03 Faz 2 yapılmadı) |
| XSS / JSON-LD / tracking script izolasyonu | ✅ Hazır (SEC-05 regresyonu doğrulandı) |
| İçerik yayın kontrolü (taslak sızıntısı) | ❌ Regresyon (blog/CMS `is_active` filtresi yok) |
| Çift rezervasyon (aynı tablo) | ✅ DB EXCLUDE ile atomik |
| Çift rezervasyon (rezervasyon ↔ manuel blok) | ⚠️ Yalnız uygulama seviyesinde, admin update yollarında hiç kontrol yok |
| Rate limiting / abuse | ⚠️ Upstash yoksa kapalı; XFF spoof edilebilir (production **doğrulanamadı**) |
| Security headers | ⚠️ Yalnız CSP Report-Only; XFO/HSTS/nosniff yok (Traefik ekliyor mu **doğrulanamadı**) |
| Deploy / cron / migration | ⚠️ Çalışıyor ama dokümantasyon eksik, şema baseline yok |
| SEO / i18n | ⚠️ Temel sağlam; noindex/hreflang/OG kusurları, `html lang` sabit TR |
| Test | ⚠️ Çok test var ama E2E/CI/gerçek DB/concurrency testi yok |

---

## 3. Puanlama Tablosu

| Kategori | Puan /10 | Kritik Bulgular |
|---|---:|---|
| Security | **6.5/10** | Admin API yetki boşluğu (H-01), ZIP SSRF (H-03), IPv6 SSRF bypass (M-01), security header yok, rate-limit fail-open |
| Performance | **6/10** | Villa detay tamamen dynamic (~10 sorgu/istek), ana sayfa ~291 KB gz JS, react-datepicker eager, admin listesi sayfalamasız |
| Architecture | **6.5/10** | Katmanlama iyi (repo/service/helper); API route'larda yetki mantığı dağınık, tekrar eden tarih/fiyat helper'ları |
| Code Quality | **5.5/10** | %33–47 yorum oranı, eskimiş/yanıltıcı yorumlar, 18 dosya 1.000+ satır, 207 "eski sağlayıcı" kalıntı yorumu |
| TypeScript | **6.5/10** | `strict: true`, 0 ts-ignore; ama 132 `any`, 45 `as unknown as`, Zod/şema doğrulama yok, 14 `req.json() as X` |
| Database | **5.5/10** | Şema repodan kurulamıyor, migration ledger yok, `reservations`'da CHECK/UNIQUE yok, çapraz tablo overlap guard yok |
| Reservation / Pricing | **7.5/10** | Public zincir sunucu otoriteli ve fail-closed; manuel blok açığı, komisyon güncellenmiyor, kur bayatlığı kontrolsüz |
| Auth / Admin | **6/10** | AuthN güçlü; AuthZ API'de eksik, logout/şifre değişiminde session revoke yok, PATCH şifre yanlış kolona |
| API | **6/10** | Public route'lar iyi doğrulanmış; admin route'lar izinsiz, public mail/geocode endpoint'leri gereksiz açık |
| SEO | **6/10** | Taslak içerik indekslenebilir, token'lı lookup sayfası index, EN/DE villa noindex'i yok sayıyor, OG image kayboluyor |
| i18n | **6/10** | Sözlükler %100 eksiksiz (942 anahtar); `html lang="tr"` sabit, çevirisiz EN/DE URL'leri TR içerikle indekslenir, mailler hep TR |
| R2 / Storage | **5.5/10** | Upload/remove izinsiz + MIME/boyut/path kontrolü yok, Cache-Control geçersiz, orphan temizliği yok |
| Env / Config | **6/10** | Secret uzunluk kontrolleri iyi; başlangıç env doğrulaması yok, `NEXT_PUBLIC_*` sessiz başarısız |
| Coolify / Deployment | **5.5/10** | Dockerfile yok (Nixpacks varsayımı), cron dokümanı eksik, derin health check yok, graceful shutdown yok |
| Testing | **6/10** | 3.846 test (1 flaky), 63/196 dosya kaynak-metni testi; E2E/CI/gerçek DB/eşzamanlılık testi yok |
| Maintainability | **4.5/10** | Aşırı yorum/değişiklik günlüğü anlatımı, büyük dosyalar, tekrar eden helper/kütüphaneler, kullanılmayan dependency'ler |

### Genel Production Skoru: **6/10**

Bu puan matematiksel ortalama değil (ortalama ~6.0). Gerekçe:

- **Neden daha düşük değil:**
  - Müşteri tarafındaki para akışı (fiyat, ödeme, depozito) artık manipüle edilemez.
  - Kimlik doğrulama güçlü.
  - Kimliği doğrulanmamış saldırgan için kritik bir yol yok.
- **Neden daha yüksek değil:**
  - (a) Birden fazla yetki seviyesinde admin kullanılıyorsa, yetki modeli API'de fiilen uygulanmıyor.
  - (b) Taslak içerik sızıyor.
  - (c) Rate-limit, env ve header gibi üretim güvenlik kontrollerinin varlığı doğrulanamıyor ve koddan zorunlu kılınmıyor.
- **8/10'a çıkış yolu:** "Öncelikli 10 İş"in ilk 6 maddesi.

---

### Puan gerekçeleri (her kategori)

**Security 6.5**
- **İyi:**
  - Parametreli SQL; identifier regex doğrulaması.
  - Tüm server action'lar izin kontrollü (136 action'dan 129'u guard'lı; 7'si kasıtlı public okuma).
  - Paylaşım/ZIP/private-villa token'ları yüksek entropili, hash'li/süreli.
  - E-posta/voucher şablonları escape'li.
  - SEC-05 ve SEC-06 sağlam.
  - iCal için DNS + manuel redirect'li SSRF guard.
  - Cron fail-closed.
- **Eksik:**
  - API yetki boşluğu.
  - ZIP ve IPv6 SSRF.
  - Clickjacking koruması yok.
  - Rate-limit fail-open ve XFF'e güveniyor.
  - Login'de IP rate-limit yok; lockout sayacı yarışlı.
  - Public mail tekrar tetiklenebiliyor.
- **9–10 için:**
  - H-01/H-03/M-01/M-05 düzelt.
  - Header'lar + CSP enforce.
  - Upstash + güvenilir IP kaynağını production'da zorunlu kıl.
  - Turnstile + pending TTL.

**Performance 6**
- **İyi:**
  - `unstable_cache` yaygın; villa detayda `Promise.all` ile paralel veri çekimi.
  - `country-state-city` public tarafta lazy.
  - ISR'lı statik sayfalar (ana sayfa 10 dk, diğerleri 1 saat).
- **Eksik:**
  - Villa detay, arama ve kiralık-villalar dynamic.
  - Villa detayında görsel/fiyat/indirim/özellik vb. ~10 sorgu önbelleksiz.
  - Ana sayfa first-load 992 KB ham / 291 KB gz; hero'daki `react-datepicker` + `date-fns` (170 KB ham) eager yükleniyor.
  - Fiyat sıralamasında tüm aday villalar için JS'te `calculateGrandTotal`.
  - Admin rezervasyon listesi sayfalamasız (yerel 45k satırda ~4.9 sn).
- **9–10 için:**
  - Villa detayını ISR + `revalidateTag` ile statikleştir.
  - Datepicker'ı etkileşimde yükle.
  - Admin listelerine sayfalama ekle.
  - Fiyat sıralamasını önceden hesaplanmış "başlangıç fiyatı" ile yap.

**Architecture 6.5**
- **İyi:**
  - Net katmanlar: `app/services` (iş mantığı), `lib/db` (repository'ler), `lib/*.helper`.
  - Fiyat motoru tek dosyada ve public/admin ortak.
  - `server-only` işaretleri ile sınır koruması.
  - Storage provider soyutlaması.
- **Eksik:**
  - Yetkilendirme route'lara dağılmış, merkezi bir route→izin haritası yok.
  - Supabase API'sini taklit eden query builder transaction desteklemiyor ve `undefined`'ı NULL olarak bağlıyor (davranış farkı).
  - `useBookingEngine`'da kendi `parseLocalDate`/`formatDate` kopyaları var.
  - İki WebP dönüştürücü, yedi kopya `NEXT_PUBLIC_SITE_URL` normalizer'ı, iki date-picker kütüphanesi.
  - Admin layout client component.
- **9–10 için:** merkezi yetki katmanı, transaction API, tek tarih/URL helper'ı, büyük sayfa bileşenlerinin bölünmesi.

**Code Quality 5.5**
- **İyi:**
  - Tutarlı hata zarfları.
  - Sadece 32 TODO/FIXME (çoğu eski).
  - ESLint 0 hata.
- **Eksik:**
  - Kritik dosyalarda yorum oranı %33–47 (ör. `route.ts` %47, `cache.helpers.ts` %40). Yorumların önemli kısmı "FAZ 38 / BYTE-IDENTICAL / DAVRANIŞ DEĞİŞMEDİ" türü değişiklik günlüğü.
  - Bazı yorumlar artık yanlış ve yanıltıcı:
    - `blog.service.ts`: "yayında değilse RLS gizler"
    - storage route'ları: "DORMANT"
    - ZIP: "SEQUENTIAL"
  - 136 `eslint-disable`.
- **9–10 için:** yorumları "neden" açıklamasına indir, değişiklik günlüğünü git'e bırak, 1.000+ satırlık dosyaları böl.

**TypeScript 6.5**
- **İyi:**
  - `strict: true`, 0 `@ts-ignore` / `@ts-expect-error`.
  - Sözlük tipi sayesinde eksik çeviri anahtarı derleme hatası oluyor.
  - `tsc` 0 hata.
- **Eksik:**
  - 132 `any`, 45 `as unknown as`, 33 `as Record<string, unknown>`.
  - API girdileri `(await req.json()) as X` ile tipleniyor (14 yer); Zod veya şema doğrulaması yok.
  - `noUncheckedIndexedAccess` kapalı.
- **9–10 için:** API/server action girdilerine şema doğrulama, repository dönüşlerini tipli satır tiplerine bağlama.

**Database 5.5**
- **İyi:**
  - `reservations_no_overlap` EXCLUDE (pending + confirmed, `[)`).
  - Dış takvim trigger'ı (031).
  - SECURITY DEFINER fonksiyonlarda `search_path` sabit.
  - Atomik replace helper'ları + advisory lock.
  - Çeviri tablolarında UNIQUE + CHECK.
- **Eksik:**
  - `reservations`/`villa`/`villa_prices` CREATE TABLE ve `reservation_no` trigger'ı repoda yok → şema sıfırdan kurulamıyor.
  - Migration ledger/runner yok.
  - `reservations`'da status/tarih/tutar CHECK'i ve `reservation_no` UNIQUE/index yok.
  - `villa.slug` UNIQUE yok.
  - Rezervasyon ↔ manuel blok çakışmasına DB guard yok.
  - Hard delete transaction dışında.
- **9–10 için:** `pg_dump --schema-only` baseline + ledger, eksik constraint'ler, çapraz tablo occupancy guard, transaction helper.

**Reservation / Pricing 7.5**
- **İyi:**
  - Public akışta 22+ finansal alan sunucuda yeniden hesaplanıyor.
  - Tarih sıkı doğrulanıyor.
  - Eksik fiyat, eksik kur veya okunamayan config → red.
  - `paid_amount` ve depozito sunucu otoritesinde.
  - İndirim snapshot'ı public/admin ortak.
  - 34 senaryo parity kilidi.
- **Eksik:**
  - Manuel blok çakışması (H-05).
  - Komisyon admin düzenlemesinde yeniden hesaplanmıyor.
  - Kur bayatlığı kontrol edilmiyor.
  - Pending rezervasyonlar süresiz tarih tutuyor.
  - Silinmiş villalar doğrudan POST ile rezerve edilebiliyor.
  - Min-stay, kapasite ve geçmiş check-in sunucuda yok (kullanıcı kararıyla ertelendi).
- **9–10 için:** H-05, M-11, kur max-age kontrolü, pending TTL, ertelenen F6 kararları, tek paylaşılan ön ödeme fonksiyonu.

**Auth / Admin 6**
- **İyi:**
  - Argon2id + bcrypt'ten yükseltme yolu; timing-safe dummy verify.
  - `typ` claim'i ile pending-2FA token'ı access olarak kullanılamıyor.
  - Recovery code'lar hash'li ve atomik tüketiliyor.
  - Origin kontrolü var.
  - Self-delete ve self-2FA-reset engelleri var.
- **Eksik:**
  - API izinleri (H-01).
  - PATCH şifre alanı hash'lenmeden `password` kolonuna yazılıyor (H-04).
  - Logout, şifre değişimi ve deaktivasyonda session revoke yok.
  - Login'de IP rate-limit yok, lockout sayacı yarışlı.
  - Minimum şifre 6 karakter.
  - Audit log istemci tarafından yazılıyor.
- **9–10 için:** SEC-03 Faz 2, `revokeAllForAdmin` bağlantıları, atomik sayaç + login rate-limit, sunucu tarafı audit.

**API 6**
- **İyi:**
  - Public route'larda rate-limit grupları, honeypot, genel 404'ler, alan beyaz listeleri.
- **Eksik:**
  - Admin route'larda izin yok.
  - `settings` GET `SELECT *` (Resend anahtarı dahil).
  - `mail/reservation-request` ve `geocode` public.
  - Bazı public hatalarda ham DB mesajı dönüyor.
  - Gövde boyut limitleri yok.
- **9–10 için:** route izin haritası, kolon beyaz listeleri, public mail endpoint'ini kaldırma, genel hata mesajları.

**SEO 6**
- **İyi:**
  - Tek URL kaynağı (`buildLocaleAlternates`); canonical'lar query'siz.
  - Private/token sayfaları noindex + robots Disallow + sitemap dışı.
  - JSON-LD escape'li.
- **Eksik:** SEO-01..11 (bkz. §14).
- **9–10 için:** listedeki düzeltmeler + bölge/tip landing sayfaları + üretilmiş HTML'i doğrulayan CI kontrolü.

**i18n 6**
- **İyi:**
  - Üç sözlük eksiksiz (942 anahtar, 0 eksik).
  - Locale-aware tarih/para formatları.
  - Dil değiştirici doğru.
- **Eksik:**
  - `html lang` her zaman `tr`.
  - Çevirisiz içerik EN/DE URL'lerinde Türkçe olarak indeksleniyor.
  - Mail ve voucher her zaman Türkçe.
  - 404 başlığı TR.
- **9–10 için:** locale bazlı root layout, çeviri tamlığına bağlı noindex, rezervasyona locale kolonu.

**R2 / Storage 5.5**
- **İyi:**
  - S3 secret yalnız sunucuda.
  - Bucket adları tek sabitte.
  - Galeri anahtarları rastgele son ekli.
  - Silme işlemleri DB-first + retry + orphan log.
  - ZIP linkleri 192-bit, süreli ve iptal edilebilir.
- **Eksik:**
  - Upload/remove route'larında izin, path, MIME ve boyut kontrolü yok.
  - WebP dönüşümü yalnız tarayıcıda; başarısız olursa orijinal dosya yükleniyor.
  - `Cache-Control: 3600` geçersiz.
  - Orphan sweeper yok.
  - `**.supabase.co` remotePatterns'ta geniş.
- **9–10 için:** S-01..S-04/S-07 düzeltmeleri, sunucuda magic-byte kontrolü (opsiyonel `sharp`), reconcile job'ı.

**Env / Config 6**
- **İyi:**
  - `AUTH_JWT_SECRET` ve `TOTP_ENCRYPTION_SECRET` ≥32 karakter kontrolü.
  - Cookie varsayılanı Secure.
  - Localhost veya eski domain fallback'i yok.
- **Eksik:**
  - Başlangıç doğrulaması (`instrumentation.ts` / şema) yok.
  - `NEXT_PUBLIC_SITE_URL` ve CDN değişkenleri build'de yoksa sessizce göreli URL veya null üretiyor.
  - `PGSSLMODE=require` sertifika doğrulamıyor.
  - Resend varsayılan gönderici `no-reply@example.com` / "Maki Dijital".
  - `.env.example` yok.
- **9–10 için:** production'da build/start fail-fast, env referans dokümanı.

**Coolify / Deployment 5.5**
- **İyi:**
  - Vercel'e özgü aktif mekanizma kalmamış.
  - 7 cron route'u Bearer secret ile, Node runtime.
  - Tek-instance için tutarlı.
- **Eksik:**
  - Dockerfile yok.
  - `engines >=22` açık uçlu, `@types/node ^20`.
  - Cron dokümanı eksik: 7 route'tan 2'si hiç dokümante değil, 1'i "henüz yok" olarak geçiyor.
  - Health check DB'yi yoklamıyor, Node/Next sürümünü açıkça veriyor.
  - SIGTERM'de pg pool kapanmıyor.
  - ISR cache yerel diskte; tek replica varsayımı dokümante değil.
- **9–10 için:** standalone Dockerfile, derin health, graceful shutdown, güncel cron + env dokümanı, migration runner.

**Testing 6**
- **İyi:**
  - 196 dosya / 3.846 test.
  - SEC-06 parity kilidi, güvenlik regresyon testleri.
  - Route seviyesinde mock'lu entegrasyon testleri.
- **Eksik:**
  - 63 test dosyası (%32) kaynak kodu metin olarak okuyup `toContain` ile doğruluyor. Kırılgan ve davranışı değil yazımı kilitliyor.
  - E2E yok (Playwright yok).
  - CI yok (`.github` yok).
  - Coverage aracı kurulu değil.
  - Gerçek DB ile concurrency/çift rezervasyon testi yok.
  - Admin API izin matrisi testi yok.
  - 1 flaky test: `locale-routes.test.tsx`, tam suite'te 5 sn timeout; tek başına geçiyor.
- **9–10 için:** CI (tsc + eslint + vitest + build), Playwright ile rezervasyon/admin akışı, testcontainers-PG ile EXCLUDE/concurrency testleri, izin matrisi testi.

**Maintainability 4.5**
- **İyi:**
  - İsimlendirme konvansiyonları (`.server.ts`, `.action.ts`, `.helper.ts`).
  - Sözlük tipleme.
  - Güçlü regresyon kültürü.
- **Eksik:**
  - Yorum hacmi ve eskimiş yorumlar.
  - 18 dosya 1.000+ satır: `AramaPageBody` 1.966, `villa.repository.server` 1.925, `VillaCard` 1.807, `users/page` 1.503.
  - "Claude outputs/" (1,1 MB AI raporu) repoda.
  - README create-next-app şablonu.
  - Kullanılmayan dependency ve export'lar.
- **9–10 için:** yorum temizliği, dosya bölme, ölü kod/dependency temizliği, gerçek README + mimari dokümanı.

---

## 4. Critical / High Bulgular

> 🔴 Critical: **yok.** Kimliği doğrulanmamış bir saldırganın doğrudan para, veri veya hesap ele geçirmesine yol açan bir açık bulunmadı.

### 🟠 H-01 — Admin API'lerinin çoğunda izin kontrolü yok (SEC-03 yarım)
- **Dosyalar:**
  - `app/api/admin-users/[id]/route.ts:152` (DELETE — yalnız `authorizeAdminCaller`),
  - `app/api/admin/settings/route.ts:27-47` (GET, `findSingletonStrict()` → `select("*")`, `resend_api_key` dahil),
  - `app/api/admin/storage/{upload,remove}`,
  - `admin/villas/**` (hard-delete dahil),
  - `admin/reservations/**`,
  - `mail/*`, vb.
- `callerHasPermission` yalnız 6 route dosyasında.
- **Problem:** Server action'lar izin kontrollü, ancak aynı verilere erişen API route'larının ~70'i sadece "aktif admin" kontrolü yapıyor.
- **Gerçek etki:** Sadece `blog` yetkisi olan bir admin:
  - sahibinin hesabını silebilir (session'lar cascade düşer),
  - Resend anahtarını okuyup markanız adına mail atabilir,
  - villa kalıcı silebilir,
  - tüm müşteri PII'ını okuyabilir,
  - ödemeyi onaylı işaretleyip mail tetikleyebilir,
  - CDN görsellerini ezebilir.
- **Exploit:** Evet, oturum açmış herhangi bir admin, tarayıcı konsolundan `fetch('/api/admin-users/<id>',{method:'DELETE'})` ile.
- **Production etkisi:** Tek admin kullanılıyorsa pratik risk düşük. Farklı yetkili personel varsa yüksek. Admin sayısı ve yetki dağılımı **doğrulanamadı**.
- **Çözüm:** Route → izin haritası + `requireRoutePermission(perm)` helper'ı (server action'larla aynı anahtarlar). Önce admin-users DELETE, settings GET (veya `resend_api_key`'i çıkar) ve storage.
- **Bozma riski:** Orta. Mevcut adminlerin izinleri eksikse erişim kaybı olur; önce izin backfill'i yapılmalı.
- **Karar:** **FIX NOW** (ilk 3 route) / **FIX LATER** (geri kalanı, SEC-03 Faz 2).

### 🟠 H-02 — Taslak blog yazıları ve pasif CMS sayfaları herkese açık ve indekslenebilir
- **Dosyalar:**
  - `lib/db/blog.repository.ts:64` `findBySlug`,
  - `lib/db/pages.repository.ts:33` `findBySlug` (`is_active` filtresi yok),
  - `app/services/blog.service.ts:25` (yorum: "yayında değilse RLS gizler"; native PG'de RLS devrede değil).
- **Problem:** Supabase RLS'nin sağladığı gizleme native geçişte kayboldu.
- **Gerçek etki:** Yayınlanmamış içerik slug ile erişilebilir. CMS sayfaları açık `index:true` gönderdiği için indekslenebilir. `published_at` gelecekteyse de yayında.
- **Exploit:** Evet, kimlik doğrulamasız (slug tahmini veya sızması gerekir).
- **Production etkisi:** İçerik/itibar riski.
- **Çözüm:** `findBySlug`'a `.eq("is_active", true)` (blog için `published_at <= now()` da). Admin önizleme için ayrı yol.
- **Bozma riski:** Düşük.
- **Karar:** **FIX NOW**.

### 🟠 H-03 — Villa ZIP indirmesi üzerinden tam-okuma SSRF
- **Dosyalar:**
  - `app/(admin)/maki-admin/villas/[id]/galeri/gallery.action.ts:48` `addGalleryImage` herhangi bir string'i kaydediyor,
  - `lib/storage.helpers.ts:286` `resolveVillaImageUrl` http(s) URL'leri aynen geçiriyor,
  - `app/api/villa-zip/[token]/route.ts:149` doğrulamasız `fetch(urlStr)` (timeout yok, redirect takip ediliyor) ve cevabı ZIP'e koyuyor.
- **Exploit:** `villas` yetkili bir admin (veya ele geçirilmiş admin hesabı) görsel olarak `http://169.254.169.254/...` ya da iç Docker servis URL'i ekler, ZIP linki oluşturur ve yanıtı indirir.
- **Production etkisi:** İç ağ/metadata servislerinden secret okunabilir (ağ topolojisi **doğrulanamadı**).
- **Çözüm:**
  - Görsel eklemede yalnız göreli R2 anahtarı veya CDN host'u kabul et.
  - ZIP'te host allow-list, `redirect:"manual"`, `AbortSignal.timeout`.
  - Mevcut `ssrf.server.ts` guard'ını kullan.
- **Bozma riski:** Düşük (eski `supabase.co` URL'leri allow-list'e alınmalı).
- **Karar:** **FIX NOW**.

### 🟠 H-04 — Admin düzenlemede şifre hash'lenmeden yanlış kolona yazılıyor
- **Dosya:** `app/api/admin-users/[id]/route.ts:115-129`. `payload.password = input.password.trim()` → `admin_users.update(payload)`. Native auth ise `password_hash` kullanıyor (068).
- **Gerçek etki:**
  - `password` kolonu varsa: şifre **düz metin** saklanır ve yeni şifre hiç çalışmaz.
  - Kolon yoksa: panelden şifre değiştirme 500 + ham DB hatası verir.
  - Production şemada hangisinin geçerli olduğu **doğrulanamadı** (repoda `admin_users` baseline yok).
- **Ek:** `users` yetkisi olan biri kendine tüm izinleri verebilir (fiilen süper-admin; dokümante edilmeli).
- **Çözüm:** `hashPassword` → `password_hash` güncelle → `revokeAllForAdmin`.
- **Bozma riski:** Düşük.
- **Karar:** **FIX NOW**.

### 🟠 H-05 — Rezervasyon ↔ manuel blok çakışmasına DB garantisi yok; admin update yolları hiç kontrol etmiyor
- **Dosyalar:**
  - `app/services/reservation/_helpers/conflict.ts:94` (`checkManualBlockConflict` no-op; kontrol yalnız ön kontrol RPC'sinde),
  - `update.service.ts` ve `status.service.ts` (tarih değişikliği veya `rejected → pending/confirmed` manuel bloğu kontrol etmiyor),
  - `manualReservation.service.ts:353` (uygulama seviyesi SELECT).
- **Doğrulama:**
  - Aynı tablo içi çift rezervasyon: **güvenli** (030 EXCLUDE, 23P01 → "Bu tarihler dolu").
  - Rezervasyon ↔ dış takvim: trigger 031 ile büyük ölçüde güvenli.
  - Rezervasyon ↔ manuel blok: eşzamanlı istekte veya admin güncellemesinde çakışma mümkün.
- **Gerçek etki:** Sahibin kapattığı veya telefonla satılan tarihe misafir rezervasyonu düşebilir (fiili çift konaklama).
- **Exploit:** Public tek başına ancak dar bir yarış penceresinde. Admin işlemiyle deterministik.
- **Çözüm:** 031 desenini izleyen BEFORE INSERT/UPDATE trigger'ları (`pg_advisory_xact_lock(villa_id)` + karşı tabloyu kontrol + 23P01). Uzun vadede tek "occupancy" tablosu. Önce mevcut çakışmaları raporla.
- **Bozma riski:** Orta.
- **Karar:** **FIX NOW** (plan + veri denetimi ile).

### 🟠 H-06 — Rezervasyon sorgulama sayfası token ile misafir PII'ı gösteriyor ve indekslenebilir
- **Dosyalar:**
  - `app/components/reservation-lookup/reservation-lookup-metadata.ts` (robots yok),
  - `app/(public)/rezervasyon-kontrol` + `ReservationShareView` (ad, telefon, e-posta),
  - robots.txt Disallow etmiyor.
- **Gerçek etki:**
  - URL sızarsa (paylaşım, referrer) PII indekslenebilir.
  - Public layout'ta GTM/GA yüklü olduğu için `?token=` içeren sayfa URL'i analitiğe gidiyor.
- **Exploit:** Token'a sahip olmayı gerektirir; sızıntı ve indeksleme riski gerçek.
- **Çözüm:** Token varsa (veya sayfa genelinde) `noindex,nofollow`, `Referrer-Policy: no-referrer`, GA'da query'yi temizle veya bu sayfada tracking'i kapat.
- **Bozma riski:** Düşük.
- **Karar:** **FIX NOW**.

### 🟠 H-07 — `NEXT_PUBLIC_SITE_URL` / CDN build değişkenleri için koruma yok
- **Dosyalar:** `lib/seo.ts:19-41`, `app/sitemap.ts`, `app/robots.ts`, `StructuredData.tsx`, `lib/storage/cdn.config.ts`, `next.config.ts:25-32`.
- **Problem:** Değer build anında yoksa:
  - canonical, hreflang, og:url, JSON-LD ve sitemap `<loc>` değerleri **göreli** olur,
  - görsel URL'leri `null` döner,
  - CSP/remotePatterns host'u eklenmez.
  - Yalnız `console.warn` basılır.
- **Production etkisi:** Coolify'da bu değişkenlerin **build-time** olarak tanımlı olup olmadığı **doğrulanamadı**. Tanımlı değilse SEO ve görseller sessizce bozulur.
- **Çözüm:** Production build'de eksik veya https olmayan değerde build'i durdur; tek `getSiteUrl()` helper'ı (7 kopyayı birleştir).
- **Bozma riski:** Düşük.
- **Karar:** **FIX NOW** (önce Coolify'da doğrulayın).

---

## 5. Medium / Low Bulgular

| ID | Seviye | Dosya / Fonksiyon | Problem → Etki | Çözüm | Bozma riski | Karar |
|---|---|---|---|---|---|---|
| M-01 | 🟡 | `lib/security/ssrf.ts:125` `isV6Literal`; `ssrf.server.ts:46` | `URL.hostname` köşeli parantezi korur (`[::1]`) → IPv6 literal'ler bloklanmıyor; server tarafı `:` içeren host'ta DNS'i atlıyor. `[::1]`, `[::ffff:7f00:1]` kabul ediliyor (**doğrulandı**). iCal kaynak URL'i ile (external_calendars yetkisi) iç servise istek. | Parantezleri soy, IPv4-mapped hex formları çöz, connect-time IP doğrulaması, 5 MB gövde limiti | Düşük | **FIX NOW** |
| M-02 | 🟡 | `next.config.ts` headers | Yalnız CSP Report-Only; X-Frame-Options/`frame-ancestors`, HSTS, nosniff, Referrer-Policy, Permissions-Policy yok → admin paneli iframe'lenebilir (clickjacking). Traefik/Cloudflare ekliyor mu **doğrulanamadı** | Statik header'lar (admin `DENY`, public `SAMEORIGIN`), `poweredByHeader:false` | Düşük | **FIX NOW** |
| M-03 | 🟡 | `lib/rate-limit.ts:144,191-252` | Upstash env yoksa veya hata verirse fail-open; IP ilk `X-Forwarded-For` öğesinden (istemci kontrollü). Production'da Upstash ve proxy topolojisi **doğrulanamadı** | Cloudflare varsa `cf-connecting-ip`, yoksa güvenilen proxy'nin eklediği en sağ öğe; kritik gruplarda (reservation/totp/zip) production'da fail-closed | Orta (topoloji bilinmeli) | **FIX NOW** (doğrulamadan sonra) |
| M-04 | 🟡 | `app/api/mail/reservation-request` | Public; rezervasyon id'si ile sınırsız yeniden gönderim (müşteri + admin maili, PII). Sahte e-postalı rezervasyonla mail bombalama | Maili rezervasyon route'u içinde gönder ve endpoint'i kaldır, ya da HMAC + `mail_logs` ile tek sefer | Düşük | **FIX NOW** |
| M-05 | 🟡 | `app/api/admin/storage/upload/route.ts:61-108`, `remove` | Path, MIME, boyut kontrolü yok; `contentType` istemciden; tüm gövde RAM'de; remove herhangi bir anahtarı silebilir. Admin HTML/SVG'yi CDN'e koyabilir | Prefix allow-list + `..` reddi, sunucuda WebP magic-byte kontrolü, ~10 MB limit, yol başına izin | Düşük–Orta | **FIX NOW** (H-01 ile) |
| M-06 | 🟡 | `lib/auth/native/login.service.ts:107`, `app/api/auth/login` | Login'de IP rate-limit yok; başarısız deneme sayacı oku-değiştir-yaz → paralel istekle lock aşılır; bilinen e-postaya sürekli lockout (DoS) | `login` rate-limit grubu + SQL'de atomik artırım | Düşük | FIX LATER |
| M-07 | 🟡 | `native-auth.server.ts:47`; `revokeAllForAdmin` hiç çağrılmıyor | Logout sonrası access token 15 dk geçerli; şifre değişimi / 2FA reset / deaktivasyonda 30 günlük refresh session'lar yaşıyor; refresh reuse tespiti yok | Bu olaylarda `revokeAllForAdmin`; opsiyonel `sid` kontrolü | Düşük | FIX LATER (H-04 ile birlikte kısmen NOW) |
| M-08 | 🟡 | `app/api/public/reservations/route.ts` + `findVillaCleaningConfig` | Soft-delete edilmiş (fiyatları duran) villa, UUID ile doğrudan POST'la rezerve edilebilir | `deleted_at IS NOT NULL` → red (inactive + `private_access_token` yoluna dokunma) | Düşük | **FIX NOW** |
| M-09 | 🟡 | DB (030 EXCLUDE pending+confirmed) | Pending rezervasyonlar süresiz tarih tutuyor; CAPTCHA yok → takvim bloklama abuse'u | Pending TTL cron (24–48 sa), Turnstile, villa/telefon başına limit | Orta (iş kuralı) | FIX LATER (yüksek öncelik) |
| M-10 | 🟡 | `db/migrations` | `reservations`/`villa`/`villa_prices`/`payment_methods` CREATE TABLE ve `reservation_no` trigger'ı repoda yok; ledger/runner yok; 001/052 idempotent değil | `pg_dump --schema-only` baseline + `schema_migrations` ledger | Düşük | FIX LATER (kısa vadede) |
| M-11 | 🟡 | `reservations` şeması | status CHECK, `start<end` CHECK, tutar ≥0 CHECK, `reservation_no` UNIQUE/index yok (lookup seq scan); `villa.slug` UNIQUE yok | NOT VALID CHECK → VALIDATE; `CREATE UNIQUE INDEX CONCURRENTLY` | Düşük–Orta (önce veri denetimi) | FIX LATER (index/unique NOW) |
| M-12 | 🟡 | `app/services/villa-admin/hard-delete.service.ts:56-76` | Önce storage + görsel + fiyat siliniyor, sonra villa DELETE FK yüzünden başarısız olabiliyor → villa görselsiz/fiyatsız kalır | Önce rezervasyon kontrolü, DB silmeleri tek transaction (plpgsql), storage commit sonrası | Düşük | **FIX NOW** |
| M-13 | 🟡 | `lib/db/query-compiler.ts:185-199` | `undefined` değerler NULL olarak bağlanıyor (PostgREST atlıyordu) → kısmi PATCH alanları null'lar veya DEFAULT'ları ezer (şu an latent) | compileInsert/Update'te `undefined` anahtarları atla | Düşük | FIX LATER |
| M-14 | 🟡 | `lib/db/reservation.repository.server.ts:333` | Admin rezervasyon listesi sayfalamasız + iç içe `villa_images` (yerel 45k satırda ~4.9 sn) | Sayfalama + yalnız kapak görseli | Düşük | FIX LATER (yakın) |
| M-15 | 🟡 | `commission.ts:249`, `payload-create.ts:195` | Komisyon yalnız oluşturmada hesaplanıyor; admin fiyat/tarih değişikliğinde güncellenmiyor; baz temizlik ve havuzu da içeriyor → finans KPI'ları sapar | Güncellemede yeniden hesapla; baz iş kararı | Orta (finansal) | FIX LATER (karar gerekli) |
| M-16 | 🟡 | `price-verify.ts` (`updatedAt` kullanılmıyor) | Kur cron'u günlerce çalışmazsa eski kurla fiyatlama (eksik kur red, bayat kur sessiz) | Max-age (ör. 72 sa) → alarm/red | Düşük | FIX LATER |
| M-17 | 🟡 | `lib/storage/*` callers | `cacheControl:"3600"` R2'ye aynen yazılıyor → geçersiz `Cache-Control`; galeri upload'larında hiç yok | Sunucuda normalize: rastgele anahtarlı için `public, max-age=31536000, immutable` | Düşük | **FIX NOW** |
| M-18 | 🟡 | `lib/image.helpers.ts:56` | WebP dönüşümü başarısızsa orijinal dosya `.webp` adıyla yükleniyor (EXIF/GPS sızabilir, yanlış MIME) | Fallback'i kaldır, sunucu tarafı doğrulama | Düşük | FIX NOW (M-05 ile) |
| M-19 | 🟡 | `docs/coolify-scheduled-tasks.md` | `short-gaps-refresh` "henüz yok" diye geçiyor; `villa-prices-cleanup` ve `villa-discounts-cleanup` hiç yok. Coolify'da görevlerin tanımlı olup olmadığı **doğrulanamadı** | 7 route'u schedule + method + auth ile listele | Yok | **FIX NOW** (doküman) |
| M-20 | 🟡 | Performans — `app/(public)/kiralik-villa/[slug]/page.tsx` | Villa detay tamamen dynamic; her istekte ~10 önbelleksiz sorgu (görsel, fiyat, indirim, mesafe, özellik, kural, dahil hizmetler) | ISR (`revalidate`) + `unstable_cache` tag'leri; tarih/para seçimi client'ta | Orta | FIX LATER |
| M-21 | 🟡 | SEO (bkz. §14) | EN/DE villa `noindex`'i yok sayıyor; sitemap noindex URL'leri listeliyor; ana sayfa hreflang'i gate'siz; soft-404'ler; OG image kayboluyor; `robots_index=false` bazı sayfalarda eziliyor | §14 | Düşük | **FIX NOW** (toplu) |
| M-22 | 🟡 | i18n — `app/layout.tsx:145` | EN/DE'de `<html lang="tr">`; çevirisiz EN/DE sayfaları TR içerikle self-canonical + hreflang | Locale bazlı root layout; çeviri yoksa noindex | Orta | FIX LATER (çok dil açılmadan NOW) |
| L-01 | 🔵 | `app/api/geocode` | Public (kod "admin-only" diyor), timeout yok → Nominatim açık proxy | Admin auth + timeout | Düşük | FIX LATER |
| L-02 | 🔵 | `searchVillas` action | İstemci kontrollü sınırsız `limit`; `real_title_search` ile gerçek villa adları oracle ile yoklanabilir | Limit tavanı; gerçek ad aramasının amacını teyit et | Düşük | FIX LATER / ACCEPT |
| L-03 | 🔵 | `public/payment-methods` | `SELECT *`, aktif filtresi yok | Kolon beyaz listesi + `is_active` | Düşük | FIX LATER |
| L-04 | 🔵 | Bazı public route'lar | Ham DB/sistem hata mesajları dönüyor | Genel mesaj + log | Düşük | FIX LATER |
| L-05 | 🔵 | Login | "inactive" 403 şifre kontrolünden önce, "locked" ayrı mesaj → hesap varlığı sızıyor | Tek genel mesaj | Düşük | FIX LATER |
| L-06 | 🔵 | Audit log | `admin/activity-logs/log` istemciden yazılıyor → doğrudan API çağrısı iz bırakmıyor, sahte kayıt eklenebilir | Kritik mutasyonlarda sunucu tarafı audit | Düşük | FIX LATER |
| L-07 | 🔵 | ZIP route | `for` döngüsü fetch başlıklarını bekleyip hemen append → tüm fetch'ler aynı anda açılıyor ("sequential" yorumu yanlış); timeout/abort yok | Entry bitince sıradakini aç, `AbortSignal` | Düşük | FIX LATER |
| L-08 | 🔵 | Status geçişleri | Onay/iptal last-write-wins; `payment-confirmed` çift tıklamada çift mail | `UPDATE … WHERE status=$expected` | Düşük | FIX LATER |
| L-09 | 🔵 | Transaction yok | Villa create/clone kısmi kalabilir | `withTransaction` helper | Orta | FIX LATER |
| L-10 | 🔵 | `price.engine.ts:83` `calculateNights` | DST'li tarayıcı saat dilimlerinde `Math.ceil` sonbahar geçişinde +1 gece (sunucu otoriter, yalnız gösterim) | UTC tarih matematiği (mantık değişikliği → önce inceleme) | Orta | FIX LATER |
| L-11 | 🔵 | Loglar | 617 `console.*`; alıcı e-postaları loglanıyor (KVKK) | Maskeleme; yapılandırılmış logger | Düşük | FIX LATER |
| L-12 | 🔵 | Health | DB yoklamıyor; Node/Next sürümünü açık veriyor | `?deep=1` + `SELECT 1`; sürüm alanlarını kaldır | Düşük | FIX LATER |
| L-13 | 🔵 | `next.config.ts:51` | `**.supabase.co` remotePatterns + CSP img-src → her Supabase projesi `/_next/image` ile işlenebilir | Tam host'a sabitle veya URL migrasyonu sonrası kaldır | Düşük | FIX LATER |
| L-14 | 🔵 | Test | `locale-routes.test.tsx` tam suite'te 5 sn timeout (tek başına geçiyor) | `testTimeout` veya ağır import'u mock'la | Yok | FIX LATER |
| I-01 | ⚪ | `middleware.ts` | Next 16'da `proxy.ts` olarak yeniden adlandırıldı (uyarı) | codemod | Düşük | FIX LATER |
| I-02 | ⚪ | Cron | Secret karşılaştırması sabit-zamanlı değil | `timingSafeEqual` | Yok | FIX LATER |
| I-03 | ⚪ | Cache | ISR/Data/Image cache container diskinde → yalnız tek replica güvenli | Tek replica'yı dokümante et / shared cacheHandler | — | ACCEPT / BY DESIGN |
| I-04 | ⚪ | `/v/[token]` | Pasif villaların token ile rezerve edilebilmesi | — | — | ACCEPT / BY DESIGN |
| I-05 | ⚪ | `exchange_rate` | Tek kolon karışık para birimlerini temsil edemez (TRY tutarları doğru) | — | — | ACCEPT / BY DESIGN |
| I-06 | ⚪ | F6 | Min-stay, kapasite, geçmiş check-in sunucuda yok (kullanıcı kararıyla ertelendi; indirim/kısa boşluk akışları bu kuralları bypass ediyor) | Akışlar incelendikten sonra | — | ACCEPT (şimdilik) |
| FP-01 | — | SQL injection | Query builder identifier regex + parametreli değerler; `.or()` yaprakları da parametreli | — | — | **FALSE POSITIVE** |
| FP-02 | — | `tsconfig.tsbuildinfo` | Git'te izlenmiyor | — | — | **FALSE POSITIVE** |
| FP-03 | — | Server action'lar | 136'dan 129'u guard'lı; 7'si kasıtlı public okuma | — | — | **FALSE POSITIVE** (açık yok) |

---

## 6. Security

**Envanter (auth):**
- Native JWT (jose HS256), `__Host-` httpOnly cookie'ler.
- Access token 15 dk, refresh token 30 gün (hash'li, rotasyonlu).
- Argon2id + bcrypt'ten yükseltme.
- TOTP 2FA: AES-GCM şifreli secret, hash'li recovery code'lar.
- `middleware.ts` yalnız `/maki-admin` yönlendirme kapısı. Asıl yetki kontrolü her istekte `authorizeAdminCaller` / `authorizeAdminSession` + `admin_users` lookup ile yapılıyor.

**OWASP kontrol özeti:**

| Konu | Durum |
|---|---|
| XSS (stored/reflected/DOM) | ✅ HTML `sanitize-html` ile (villa/blog/CMS/çeviri); JSON-LD `<` escape; tracking yalnız public layout. ⚠️ CSP hâlâ Report-Only. ⚠️ Admin SVG/HTML'i CDN'e yükleyebilir (M-05) |
| SQL injection | ✅ (FP-01) |
| Command injection | ✅ Shell çağrısı yok |
| SSRF | ❌ H-03 (ZIP), M-01 (IPv6), L-01 (geocode) |
| CSRF | ✅ SameSite=Lax/Strict + Origin kontrolü (login/logout/2FA) + Next server action Origin kontrolü |
| AuthN bypass | ✅ Bulunmadı |
| AuthZ bypass / privilege escalation | ❌ H-01; `users` izni = fiilen süper-admin (H-04 notu) |
| IDOR | ✅ voucher admin-only; share/lookup token'ları yüksek entropili; lookup kod + e-posta ister |
| Session | ⚠️ M-07 (revoke yok), I-01 |
| 2FA | ✅ Güçlü; ⚪ pencere içi TOTP tekrar kullanımı |
| Password flows | ❌ H-04; ⚠️ min 6 karakter; şifre sıfırlama (e-posta ile) akışı yok (admin tarafından atanıyor) |
| Rate limit / brute force | ⚠️ M-03, M-06 |
| Rezervasyon/ödeme/fiyat/kur/depozito manipülasyonu | ✅ SEC-06 sonrası public yolda kapalı (bkz. §11) |
| Mass assignment | ⚠️ `admin/settings` PUT tüm gövdeyi update'e veriyor (admin-only; izinli); public create alanları beyaz listeli |
| Unsafe redirect | ✅ Yok |
| Path traversal | ⚠️ Storage path doğrulaması yok (admin-only, S3 anahtarı olduğu için dosya sistemi riski yok; başka klasörün üzerine yazma riski var) |
| File upload / SVG / EXIF / image bomb | ❌ M-05, M-18 |
| Signed URL | ⚪ Kullanılmıyor (tüm objeler public CDN); özel obje yok |
| Secret exposure | ⚠️ `resend_api_key` DB'de düz metin ve her admine GET ile dönüyor (H-01); S3/JWT/TOTP secret'ları server-only ✅ |
| Env exposure | ✅ Yalnız `NEXT_PUBLIC_*` (site URL, CDN) istemcide |
| Response/error leakage | ⚠️ L-04; admin route'lar ham DB mesajı dönüyor |
| Logging PII | ⚠️ L-11 |
| CSP / headers / CORS | ⚠️ M-02; CORS başlığı yok (same-origin) ✅ |
| Webhook | ⚪ Webhook endpoint'i yok |
| Cron | ✅ Bearer secret, fail-closed; ⚪ I-02 |

**SEC regresyon kontrolü (yeniden doğrulandı):**

- **SEC-01 — ✅ Geçerli.**
  - Veri yükleyen her admin sunucu sayfası `authorizeAdminSession()` çağırıyor.
  - 34 test geçiyor.
  - Sayfa seviyesinde izin kontrolü yok; yalnız oturum kontrolü var.
- **SEC-03 — ⚠️ Kısmen geçerli.**
  - Faz 1 kapsamındaki 6 handler sağlam (48 test).
  - Geri kalan route'lar hiç kapsanmadı (H-01).
- **SEC-05 — ✅ Geçerli.**
  - `SiteTrackingScripts` yalnız public layout'larda.
  - `serializeJsonLd` tek ld+json kaynağı.
  - `sanitizeHtml` kullanımda.
  - Harita embed'leri `extractSafeMapEmbedSrc`'den geçiyor.
  - CSP Report-Only + `/api/csp-report` duruyor (41 test).
- **SEC-06 — ✅ Geçerli.**
  - Sıkı tarih doğrulaması.
  - `paid_amount = 0`.
  - Depozito villa kaydından.
  - Eksik fiyat/kur → red.
  - `recomputeFailed` → red.
  - 90 test + 34 senaryo parity.

---

## 7. Performance

**Rendering (build çıktısı):**
- 190 route: 25 ○ (statik/ISR), 165 ƒ (dynamic).
- Public ISR sayfaları: `/` (10 dk), `/blog`, `/iletisim`, `/teklif-al`, `/rezervasyon-kontrol`, `/favoriler`, EN/DE eşleri (1 sa), `sitemap.xml` (1 sa).
- **Dynamic public sayfalar:**
  - `/kiralik-villa/[slug]` (en çok trafik alan sayfa),
  - `/kiralik-villalar` (`cookies()` nedeniyle),
  - `/arama`,
  - `/blog/[slug]` (`force-dynamic`),
  - `/p/[slug]`,
  - `/kisa-sureli-tarihler/...`,
  - `/rezervasyon/[slug]`,
  - `/v/[token]`.

**İstemci JS (gerçek build istatistikleri, first-load):**

| Route | Ham | gzip |
|---|---:|---:|
| `/`, `/en`, `/de` | 992 KB | 291 KB |
| `/arama`, `/kiralik-villalar` | 968 KB | 283 KB |
| `/teklif-al` | 957 KB | 279 KB |
| `/kiralik-villa/[slug]` | ~852 KB | ~255 KB |
| Admin en büyük (`reservations/[id]`) | 1.470 KB | 376 KB |

- **Ortak framework payı:** ~466 KB ham (React/Next).
- **Ana sayfa, listeleme ve teklif sayfası:** `react-datepicker` + `date-fns` (170 KB ham / ~43 KB gz) ilk yüklemeye dahil. Hero tarih seçici tembel yüklenmiyor.
- **`country-state-city`** (636 KB) public tarafta lazy ✅, admin `reservations/[id]`'de eager.
- **TipTap/ProseMirror** (468 KB) yalnız admin chunk'larında ✅.
- **İki ayrı tarih seçici kütüphanesi:** `react-datepicker` + `react-day-picker`.

**Veri katmanı:**
- Villa detay (~10 paralel ama önbelleksiz sorgu/istek, M-20).
- Fiyat sıralamasında tüm aday villalar için JS'te `calculateGrandTotal` (villa sayısı × gece; ~1.600 villa ölçeğinde her istekte).
- Admin rezervasyon listesi sayfalamasız (M-14).
- Birçok repository `select("*")`: villa, settings, pages, blog, payment-methods.
- Pool: max 10, `search_path=public`; ortam değişkeniyle ayarlanabilir.

**Cache:**
- 18 `unstable_cache` sarmalayıcısı (`lib/cache.helpers.ts`), ~60 `revalidateTag/Path` kullanımı.
- Admin mutasyonlarından sonra invalidation genelde mevcut.
- Kullanıcıya özel veri önbelleğe alınmıyor ✅.
- Cache container diskinde (I-03).

**Görsel / font / 3. parti:**
- `next/image` + R2 CDN remotePatterns.
- `next/font` Google fontları, 4 aile (Fraunces, Inter, Outfit, Geist Mono) — font sayısı fazla.
- GTM yalnız public tarafta.

**Route bazında performans riski (Top 10):**

| # | Route | Neden |
|---|---|---|
| 1 | `/kiralik-villa/[slug]` | Dynamic + ~10 sorgu + 255 KB gz |
| 2 | `/arama` | Dynamic + JS'te toplu fiyat hesabı |
| 3 | `/kiralik-villalar` | `cookies()` ile dynamic + 283 KB gz |
| 4 | `/` | 291 KB gz, eager datepicker |
| 5 | `/maki-admin/reservations` | Sayfalamasız liste |
| 6 | `/maki-admin/reservations/[id]` | 376 KB gz, eager `country-state-city` |
| 7 | `/blog/[slug]` | `force-dynamic` (ISR yeterli olurdu) |
| 8 | `/api/villa-zip/[token]` | Tüm görsel fetch'leri aynı anda, timeout yok |
| 9 | `/rezervasyon/[slug]` | Dynamic + 4 sorgu |
| 10 | `/api/public/villas/[id]/availability` | Her takvim açılışında DB + iCal |

---

## 8. Architecture

**Katmanlar:**
- `app/(public)` + `app/(admin)/maki-admin` (106 sayfa, 6 layout).
- `app/api` (81 route).
- 46 dosyada 136 server action.
- `app/services/**`: iş mantığı; rezervasyon `create/update/status/delete` + `_helpers`.
- `lib/db/**`: ~40 repository; `query-builder` / `query-compiler` + pg client.
- `lib/**`: saf helper'lar (fiyat motoru, takvim, i18n, auth, storage, security).
- Bileşenler: 316 `.tsx`, 148 `"use client"` dosyası.

**Güçlü yanlar:**
- İş mantığı büyük ölçüde servislerde toplanmış.
- Fiyat motoru tek kaynak ve public/admin ortak.
- `server-only` sınırı tutarlı (build hatası ile korunuyor).
- Storage provider arayüzü var.
- Rezervasyon oluşturmada orchestrator + saf helper ayrımı.
- Paylaşılan metadata helper'ları (TR/EN/DE tek kaynak).

**Zayıf yanlar:**
- **Yetkilendirme:** route başına elle `authorizeAdminCaller` çağrılıyor; merkezi izin haritası yok. Server action'larla API'lerde tutarsız (H-01).
- **Supabase taklidi query builder:**
  - Transaction yok.
  - Semantik farklar (`undefined` → NULL, RLS varsayımları; H-02 bunun sonucu).
  - `.single()` hata kodu taklidi (PGRST116).
- **Tekrarlanan helper'lar:**
  - `useBookingEngine` içinde kendi `parseLocalDate` / `formatDate` kopyaları,
  - 7 site-URL normalizer'ı,
  - 2 WebP dönüştürücü,
  - 2 `ALLOWED_BUCKETS`,
  - 2 tarih seçici kütüphanesi.
- **UI'da iş mantığı:**
  - Sidebar, ReservationForm ve admin formu ön ödemeyi ayrı yuvarlama/para birimi mantığıyla hesaplıyor. Sunucu otoriter olduğu için tutar riski yok, ama gösterim farkı riski var.
- **Dev bileşenler:** `AramaPageBody` (1.966 satır), `VillaCard` (1.807), `users/page` (1.503).
- **Circular dependency:** Araç (madge) kurulu olmadığı için ölçülemedi. Build'de döngü hatası yok.

---

## 9. Code Quality (TypeScript dahil)

| Metrik | Değer |
|---|---:|
| Kaynak satır (app+lib+hooks) | 155.262 |
| `strict` | true |
| `@ts-ignore` / `@ts-expect-error` | 0 / 0 |
| `any` | 132 |
| `as unknown as` | 45 |
| `as Record<string, unknown>` | 33 |
| `(await req.json()) as X` (şemasız) | 14 |
| Zod / şema doğrulama | yok |
| `eslint-disable` | 136 |
| TODO/FIXME/HACK | 32 |
| Yorum oranı (örnek) | `route.ts` %47 · `cache.helpers.ts` %40 · `price-verify.ts` %37 · `price.engine.ts` %33 |
| 1.000+ satırlık dosya | 18 |
| tsc / ESLint | 0 hata / 0 hata (195 uyarı) |

**Değerlendirme:**
- Tip güvenliği temel düzeyde iyi, ancak veri sınırları (DB satırları, API girdileri) büyük ölçüde cast ile geçiliyor.
- Yorumlar değişiklik günlüğü gibi yazılmış. Kodu okuyanı gerçek mantıktan uzaklaştırıyor ve bazıları artık yanlış:
  - "RLS gizler",
  - "DORMANT",
  - "SEQUENTIAL",
  - 207 adet "eski sağlayıcı" ifadesi, var olmayan bir dosyaya referans dahil.
- Magic değerler çoğunlukla sabitlerde toplanmış. Örnekler: rate-limit grupları, prepayment varsayılanı 20, komisyon fallback'i 20.

---

## 10. Database

**Rezervasyonla ilgili şema (migration'lardan):**
- `reservations_no_overlap`:
  - EXCLUDE GiST `(villa_id =, daterange(start,end,'[)') &&) WHERE status IN ('pending','confirmed')`,
  - 030 ile güncel.
- `manual_reservations_no_overlap` EXCLUDE ve `start<end` CHECK (052).
- `check_external_calendar_no_overlap()` trigger'ı (031): reservations + manual, INSERT/UPDATE.
- RPC'ler:
  - `check_villa_availability_conflict`,
  - `get_villa_blocked_ranges`,
  - `get_blocked_villa_ids`.
  - SECURITY DEFINER, `search_path` sabit.
- Kısmi index'ler: `idx_reservations_avail`, `idx_manual_reservations_avail` (yerel EXPLAIN bitmap index scan, 0.06 ms).
- `villa_discounts`: CHECK'ler + EXCLUDE `[]`.
- Çeviri tabloları: `UNIQUE(x_id, locale)`.
- `reservation_share_links`: token hash UNIQUE + CASCADE.

**Eşzamanlı rezervasyon sorusu — "Aynı tarih iki farklı istekle aynı anda rezerve edilebilir mi?"**

| Senaryo | Sonuç |
|---|---|
| İki public/admin rezervasyon (pending/confirmed), aynı anda INSERT | **Hayır.** EXCLUDE constraint atomik; kaybeden 23P01 → "Bu tarihler dolu" (409) |
| Admin tarih değişikliği veya `cancelled → pending` | Diğer rezervasyonlara karşı **hayır** (EXCLUDE UPDATE'te de çalışır). UX: genel "Güncellenemedi" |
| Rezervasyon ↔ dış takvim (iCal) | Trigger ile büyük ölçüde **hayır**. Senkron transaction'ı commit olmadan önceki ms'lik pencere ve ters yön (senkronun mevcut rezervasyonun üstüne yazması) kabul edilmiş durumda |
| **Rezervasyon ↔ manuel blok** | **Evet, mümkün** (H-05): eşzamanlı istekte veya admin update/status yollarında |
| 0 gecelik kayıt | Uygulama seviyesinde engelli; DB CHECK yok |

Production'da 030/031'in uygulanmış olduğu **doğrulanamadı** (yerel kopya kısmi rekonstrüksiyon).

**Diğer:**
- M-10, M-11, M-12, M-13, M-14.
- Transaction API yok (L-09).
- `villa_prices` çakışan aralıklara izin veriyor; motor "ilk eşleşen" kuralına güveniyor.
- Rezervasyonlar hard-delete ediliyor; list route'unda sunucu tarafı audit yok.
- Supabase kalıntısı: yalnız yorumlar ve `admin_users.auth_user_id` indeksi. RLS politikaları native'de etkisiz; bu durum H-02'nin kök nedeni.

---

## 11. Reservation / Pricing

**Zincir:**
- Public: `useBookingEngine` / `BookingSidebar` → `/rezervasyon/[slug]` (`ReservationForm` + `buildPublicReservationPayload`) → `POST /api/public/reservations`.
- API tarafı sırasıyla:
  1. Rate-limit.
  2. Telefon doğrulaması.
  3. **date-verify.**
  4. `paid_amount = 0`.
  5. **price-verify** (sunucu `villa_prices` + `villa_discounts` + villa config + kur + settings) ve `pool-heating-verify`.
  6. Authoritative alanlar body'ye yazılır.
  7. Fiyat, kur ve recompute kapıları.
  8. `stay-verify` (orphan-gap).
  9. `createReservation` (RPC ön kontrol → komisyon → `payload-create` → INSERT, EXCLUDE ile).

**Finansal alan otoritesi:**

| Alan | Public'te kim hesaplar | Public istemci etkileyebilir mi? |
|---|---|---|
| `total_price`, `total_price_try` | Sunucu (motor + havuz) | Hayır |
| `original_price` / `currency` / `exchange_rate` | Sunucu (DB kuru) | Hayır (bayatlık kontrolsüz, M-16) |
| Temizlik (3 alan) | Sunucu (`cleaning_fee` / `limit`) | Hayır |
| Havuz ısıtma (4 alan) | Sunucu (ay kısıtı dahil) | Yalnız "seçtim" tercihi |
| `prepayment` / `remaining` | Sunucu (konaklama bazı × oran) | Hayır |
| `paid_amount` | Sunucu = 0 | Hayır |
| `damage_deposit` | Sunucu = `villa.deposit` | Hayır |
| Komisyon | Sunucu (`total_price_try × oran`) | Hayır (güncellemede hesaplanmıyor, M-15) |
| İndirim snapshot'ı (6 alan) | Sunucu (ortak fonksiyon) | Hayır |
| `custom_price` / note | Sunucu = false/null | Hayır |
| `status` | Sunucu = `pending` | Hayır |
| `payment_preference`, `payment_method_id`, `guests` | İstemci | Evet, ama parasal değil (kapasite ertelendi) |

**Frontend ↔ backend farkları:**
- Sidebar fiyatı görüntüleme para biriminde hesaplayıp orada yuvarlıyor; ReservationForm ve sunucu TRY kullanıyor. Fark ±1 TRY / %1 toleransla yalnız loglanıyor, sunucu kazanıyor.
- Admin normal payload tercih-duyarlı ön ödeme kullanıyor; public tarafta tercih bilerek yok sayılıyor.
- `calculateNights` DST'li saat dilimlerinde istemcide 1 gece fazla sayabilir (L-10).

**Admin özel fiyat:** kasıtlı; admin formu tutarları doğrudan gönderiyor. Yalnız admin erişebiliyor, ancak API izin kontrolü eksik (H-01).

**Private / off-market (`/v/[token]`):** pasif villa token ile rezerve edilebiliyor (kasıtlı). Soft-delete edilmiş villanın doğrudan POST ile rezerve edilebilmesi ise kasıtlı değil (M-08).

**Ertelenen (kullanıcı kararı):** sunucuda min-stay, kapasite ve geçmiş check-in kontrolü; devam eden indirim CTA'sının geçmiş check-in üretmesi.

---

## 12. Auth / Admin

- **Login:**
  - Origin kontrolü var.
  - Argon2id doğrulama, timing-safe dummy verify.
  - 5 deneme / 15 dk kilit; ancak sayaç yarışlı (M-06) ve IP rate-limit yok.
  - Hesap varlığı mesajlardan anlaşılabiliyor (L-05).
- **Session:**
  - Access 15 dk, refresh 30 gün, rotasyonlu.
  - Revoke eksik (M-07).
  - Admin `sub` yerine JWT e-posta claim'i ile çözümleniyor (native adminlerde `auth_user_id` null). `id = sub` ile arama önerilir.
- **2FA:** enroll/confirm/verify/disable/recovery; parola/kod ile yeniden doğrulama; `users` yetkisiyle reset (kendi hesabına engelli). ✅
- **Admin davet/oluşturma:**
  - Davet akışı yok; `users` yetkili admin doğrudan oluşturuyor.
  - Min şifre 6.
  - E-posta loglanıyor.
- **Şifre sıfırlama:** Self-service akış yok; admin PATCH ile değiştiriyor ve hatalı (H-04).
- **Rol / izin:** `sidebar_permissions` dizisi. Server action'larda `requirePermission` ✅; API'de eksik ❌.
- **UI gizleme ↔ gerçek yetki:** Sidebar izinleri UI'da menüyü gizliyor ve server action'lar bunu uyguluyor. Ancak ~70 API route'u uygulamıyor, yani UI'da gizlenen işlem doğrudan API ile yapılabiliyor.
- **Pasif / silinmiş admin:** Her istekte `is_active` lookup ile reddediliyor ✅. Silmede session'lar CASCADE ile düşüyor ✅.
- **Audit / activity log:** Bir kısmı sunucuda (admin silme vb.), bir kısmı istemcide yazılıyor (L-06).

---

## 13. API

**Public (kimlik doğrulamasız) endpoint'ler:**

| Endpoint | Yöntem | Rate limit | Değerlendirme |
|---|---|---|---|
| `/api/public/reservations` | POST | reservation (3/10 dk) | ✅ SEC-06; ⚠️ silinmiş villa (M-08), pending abuse (M-09) |
| `/api/public/reservation-lookup` | POST | 10/10 dk | ✅ kod + e-posta, genel 404 |
| `/api/public/contact`, `/offer-requests` | POST | 5/10 dk | ✅ honeypot; ⚠️ `elapsedMs` istemciden, uzunluk limiti yok |
| `/api/public/villas/[id]/availability`, `/blocked-ranges` | GET | 30/dk | ✅ PII yok (pasif villa dahil, kasıtlı) |
| `/api/public/payment-methods`, `/taxonomies` | GET | — | ⚠️ L-03 |
| `/api/exchange-rates` | GET | exchange | ⚠️ ham hata mesajı |
| `/api/mail/reservation-request` | POST | mail | ❌ M-04 |
| `/api/geocode` | GET | geocode | ❌ L-01 |
| `/api/villa-zip/[token]` | GET | zip | ⚠️ H-03 / L-07 |
| `/api/voucher/[id]` | GET | — | ✅ admin cookie veya token; escape'li |
| `/api/auth/login`, `/2fa/verify`, `/logout`, `/me`, `/refresh` | — | totp (yalnız 2FA) | ⚠️ M-06 |
| `/api/health` | GET | — | ⚠️ L-12 |
| `/api/csp-report` | POST | — | ✅ maskeleme, boyut limiti, dedupe |
| `/api/cron/*` (7) | GET | — | ✅ Bearer `CRON_SECRET`, fail-closed |

**Admin endpoint'leri (≈58):**
- Hepsi `authorizeAdminCaller` / `authorizeAdminSession` ile kimlik doğruluyor.
- İzin kontrolü yalnız şu 6 dosyada: `admin-users/[id]` PATCH, `create-user`, `settings` PUT, `2fa/reset`, `activity-logs/list`, `activity-logs/cleanup`.
- Diğerleri: blog, pages, menu, villa-locations, taxonomies, reservations(+share-link), manual-reservations, villas/** (11 route), storage, villa-zip, external-calendars, exchange-rates, mail-logs, mail/* (8), admin-users GET/DELETE, settings GET → **izin yok** (H-01).
- Admin route'lar ham `error.message` döndürüyor.
- Gövde boyut limiti yok.

---

## 14. SEO

| Route tipi | Metadata | Canonical | hreflang | robots | Sitemap |
|---|---|---|---|---|---|
| Ana sayfa | ✅ | ✅ | ❌ çok dil kapalıyken de basılıyor (SEO-05) | settings | ✅ |
| Villa detay TR | ✅ | ✅ | gate'li ✅ | `villa.noindex` ✅ | ✅ ama noindex villalar da listede |
| Villa detay EN/DE | ✅ | ✅ | gate'li ✅ | ❌ `noindex`'i yok sayıyor | alternates |
| `/kiralik-villalar` | ✅ | ✅ query'siz | ✅ | inherit | ✅ |
| `/arama` | ❌ metadata yok | – | – | yalnız robots.txt | hariç ✅ |
| Blog / CMS | ✅ | ✅ | ✅ | ❌ taslak açık (H-02); CMS `index:true` `robots_index`'i eziyor | noindex olanlar da listede |
| `/rezervasyon/[slug]` | – | – | – | EN/DE noindex, TR yalnız robots.txt | hariç ✅ |
| `/rezervasyon-kontrol?token` | ✅ | base | ✅ | ❌ index (H-06) | – |
| `/v/[token]`, favoriler, liste, admin | ✅ | yok | yok | noindex + Disallow ✅ | hariç ✅ |
| 404 | TR başlık EN/DE'de | – | – | noindex (2 meta) | – |

**Diğer SEO bulguları:**
- **SEO-06 (🟡):** Sayfa bazında `openGraph` / `twitter` tanımlanınca kök OG görseli kayboluyor (Next birleştirmiyor, değiştiriyor). EN/DE'de TR `twitter:title` miras kalıyor. `og:locale` yok.
- **SEO-09 (🟡):** EN/DE URL'leri sitemap'te ayrı `<url>` değil. `lastmod` statik sayfalarda "şimdi", villalarda `created_at`. DB hatasında 5 girişli sitemap 1 saat cache'leniyor.
- **SEO-10 (🟡):** Villa/CMS bulunamadığında HTTP 200 + "404" bloğu (soft-404). `notFound()` kullanılmalı.
- **SEO-11 (🔵):** JSON-LD URL'leri EN/DE'de TR. Breadcrumb ve SearchAction robots'ta engelli `/arama`'ya işaret ediyor. VacationRental şeması Google spesifikasyonuna tam uymuyor.
- **SEO-12 (🔵):** Organization logo'su göreli R2 path olabilir.
- **SEO-13 (🟡 fırsat):** Bölge/tip landing sayfaları yok. Kartlar robots'ta engelli `/arama?…`'ya gidiyor. "Kalkan kiralık villa" gibi aramalar için sayfa yok.
- **SEO-14..16 (🔵):** `/arama` metadata'sı yok; title template yok; kısa boşluk sayfaları indekslenebilir ama sitemap dışı.
- **Görsel alt'ları:** ✅ (`buildImageAlt`).
- **Heading yapısı:** Genel olarak tek h1 gözlendi. Tüm sayfalar için otomatik doğrulama yapılmadı.

---

## 15. i18n

- **Sözlükler:** 942 anahtar, EN/DE'de **0 eksik, 0 boş**. `Dictionary` tipi eksik anahtarı derleme hatası yapıyor ✅. TR ile aynı olan değerler (18 EN / 21 DE) meşru ("Blog", "Villa", yer adları).
- **Fallback:** DB çevirisi yoksa TR içerik gösteriliyor, ama sayfa self-canonical + hreflang en/de olarak kalıyor. Çok dil açılınca duplicate/yanlış dil indekslenir (I18N-02, 🟠 çok dil açılmadan önce).
- **`<html lang="tr">` sabit** (`app/layout.tsx:145`); `html-lang-layout.test.ts` bunu kilitliyor (I18N-01).
- **Mail/voucher her zaman TR:** rezervasyonda locale saklanmıyor (I18N-03).
- **404 `<title>` TR** (I18N-04).
- **Hardcoded TR metinler:** 70 satır tespit edildi; çoğu **hiç import edilmeyen ölü bileşenlerde**: `WhyUsSection`, `HeroTrustStrip`, `HeroCopy`, `HeroReviewCard`, `CheckInOutTimes`, `VillaVideoSection`, `CategoryCollection`, `PrepaymentBadge`.
- **URL segmentleri:** Yerelleştirilmemiş (`/en/kiralik-villa/…`), tutarlı → ACCEPT.
- **`multilingual_enabled` kapalıyken:** EN/DE 404 ve dil değiştirici gizli ✅. Tek istisna: ana sayfa hreflang'i (SEO-05).
- **Admin çeviri yönetimi:** Locale en/de ile sınırlı, trim + uzunluk limitleri, çevrilen HTML sanitize ✅.

---

## 16. R2 / Storage

- **Upload:** Tarayıcıda WebP dönüşümü (`image.helpers.ts`, `AdminGallery`) → `POST /api/admin/storage/upload` (formData, tamamı RAM'de) → `s3StorageProvider.upload`.
  - Sunucuda MIME, magic-byte, boyut ve path kontrolü yok (M-05).
  - SVG/HTML yüklenebilir.
  - EXIF yalnız dönüşüm başarılıysa siliniyor (M-18).
  - Image-bomb koruması yok (sunucuda işleme olmadığı için sunucu tarafında risk yok).
- **Delete:**
  - Galeri silmede DB önce, retry var, idempotent ✅.
  - `remove` route'u herhangi bir anahtarı iki bucket'ta da silebiliyor (izin kontrolü yok).
- **URL üretimi:** CDN base env'den, fallback domain yok ✅. Env yoksa `null` (H-07).
- **Public / private:** Tüm objeler public. Signed URL yok. Özel veri R2'de tutulmuyor (ZIP sunucu üzerinden stream ediliyor).
- **Cache:** M-17.
- **Orphan dosyalar:**
  - Editör görselleri, kategori/lokasyon kapakları ve başarısız silmeler temizlenmiyor.
  - Legacy Supabase URL'leri için `parseVillaStorageUrl` eski bucket adını döndürüyor, R2 silmesi sessizce başarısız oluyor.
  - Sweeper yok (S-08, 🔵).
- **Eski Supabase / ölü kod:**
  - Aktif Supabase storage kodu yok ✅.
  - Kullanılmayan export'lar: `isLegacyVillaImagePath`, `isNewVillaImagePath`, `getVillaImagePublicUrl`, `build{Logo,Watermark,Favicon,HeroBg,DefaultOg}Path`, `s3StorageProvider.getPublicUrl`, çift `StorageRemoveResult` tipi.
  - `**.supabase.co` remotePatterns (L-13).

---

## 17. Env / Config

| Değişken | Zorunlu | Fallback | Risk |
|---|---|---|---|
| `DATABASE_URL` | Evet | ilk kullanımda throw | Başlangıçta doğrulanmıyor |
| `PGSSLMODE` | Hayır | SSL yok | `require` → `rejectUnauthorized:false` (sertifika doğrulanmaz) |
| `PG_POOL_MAX` / `IDLE` / `CONNECT` | Hayır | 10 / 30000 / 10000 | NaN kontrolü yok |
| `AUTH_JWT_SECRET` | Evet | throw (<32) | ✅ |
| `AUTH_*_TTL`, `AUTH_JWT_KID` | Hayır | 900 / 2592000 / 300, v1 | refresh 30 gün |
| `AUTH_COOKIE_SECURE` | Hayır | **true** | ✅ güvenli varsayılan |
| `AUTH_LOGIN_*` / `AUTH_TOTP_*` | Hayır | 5 / 15 | ✅ |
| `TOTP_ENCRYPTION_SECRET` | Evet | throw (<32) | ✅ |
| `CRON_SECRET` | Evet | 503 (fail-closed) | Min uzunluk yok |
| `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Evet | throw | ✅ server-only |
| `S3_REGION` | Hayır | `auto` | ✅ |
| `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES` / `_SITE_ASSETS` | Pratikte evet | `null` + warn | **Build-time**, sessiz başarısız (H-07) |
| `NEXT_PUBLIC_SITE_URL` | Pratikte evet | `""` | **Build-time**, 7 kopya (H-07) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Olmalı | **fail-open** | M-03 |
| `RESEND_API_KEY` / `FROM` / `FROM_NAME` | Hayır | DB anahtarı / `no-reply@example.com` / "Maki Dijital" | Placeholder gönderici; anahtar DB'de düz metin |
| `MAIL_ADMIN_NOTIFY_TO` | Hayır | admin kopyası atlanır | ✅ (legacy cleanup) |

**Kalıntı taraması:**

| Aranan | Aktif kod | Aktif olmayan |
|---|---|---|
| supabase | `next.config.ts:51` + CSP `img-src` (L-13) | testler, `Claude outputs/` |
| vercel / `VERCEL_` | **yok** ✅ | README şablonu, docs, testler |
| villayagel | **yok** ✅ | 1 migration yorumu, testler, raporlar |
| yazvillam | yalnız `__yazVillamPgPool` (kasıtlı) | testler, raporlar |
| "eski sağlayıcı" | yok | **207 yorum / 122 dosya** (var olmayan dosyaya referans dahil) |
| Sentry | yok | 5 eski yorum |
| localhost fallback | **yok** ✅ | — |

- `.env.example` ve env referans dokümanı yok.
- `tatilinyeri.com` kodda hardcode değil ✅. Production değerleri **doğrulanamadı**.

---

## 18. Coolify / Deployment

- **Build / start:**
  - Dockerfile ve `nixpacks.toml` yok → Nixpacks varsayılanı (**doğrulanamadı**).
  - `next build` / `next start`; `output: "standalone"` yok.
  - `engines >=22` açık uçlu (`.nvmrc` 22).
  - `prod:start` script'i start anında yeniden build ediyor; Coolify'ın bunu kullanmadığını teyit edin (**doğrulanamadı**).
  - `prebuild: echo prebuild` gürültü.
- **Health:** `/api/health` yalnız liveness; DB yoklamıyor; sürüm bilgisi veriyor (L-12).
- **Cron:**
  - 7 route: `activity-logs-cleanup`, `exchange-rates-refresh`, `external-calendar-sync`, `mail-logs-cleanup`, `short-gaps-refresh`, `villa-discounts-cleanup`, `villa-prices-cleanup`.
  - Hepsi GET + Bearer; Coolify Scheduled Task ile tetiklenecek şekilde yazılmış ✅.
  - `vercel.json` yok → **Vercel'e özgü aktif mekanizma kalmadı** ✅.
  - Doküman eksik (M-19). Coolify'da görevlerin tanımlı olduğu **doğrulanamadı**.
  - Kur cron'u çalışmazsa fiyatlar bayat kurla hesaplanır (M-16).
- **Migration:** Elle psql ile uygulanıyor; runner/ledger yok (M-10).
- **Graceful shutdown:** `closePgPool()` hiç çağrılmıyor (SIGTERM hook'u yok). Next kendi in-flight isteklerini boşaltıyor.
- **Logging:** 617 düz `console.*`; yapılandırılmış log yok; PII var (L-11).
- **Cache / persistent storage:** `.next/cache` container'da, her deploy'da sıfırlanıyor. Tek replica varsayımı (I-03).
- **R2 / PostgreSQL:** Env ile bağlanıyor. PG SSL doğrulaması zayıf (`PGSSLMODE`).

---

## 19. Testing

- **Koşu (bu audit):**
  - Tam suite: 196 dosya, 3.846 test.
  - **3.845 geçti, 1 flaky timeout** (`locale-routes.test.tsx`, 5 sn; tek başına 76/76 geçiyor).
  - Önceki cihaz koşusunda 3.846/3.846 geçmişti.
  - Süre ~4,8 dk.
  - Konsolda gürültülü log'lar var (`DATABASE_URL tanımlı değil`, bilinçli hata senaryoları).
- **Kategoriler:**
  - Saf mantık (fiyat motoru, tarih, takvim, i18n helper'ları): güçlü.
  - Bileşen render (jsdom): orta.
  - Mock'lu route/servis entegrasyonu (SEC-03/06, rezervasyon helper'ları): iyi.
  - **Kaynak-metni ("contract") testleri: 63 dosya (%32)** `readFileSync` + `toContain` ile kodun yazımını kilitliyor. Refaktörde kırılır, davranışı kanıtlamaz, yanlış güven verir.
    - Örnek: `html-lang-layout.test.ts` hatalı `lang="tr"` davranışını kilitliyor.
    - Örnek: `legacy-brand-cleanup.test.ts` belirli string'leri arıyor.
  - Price parity: 34 senaryo baseline kilidi ✅.
- **Eksikler:**
  - E2E yok (Playwright yok).
  - CI yok (`.github` yok).
  - Coverage aracı yok (`@vitest/coverage-v8` kurulu değil).
  - Gerçek PostgreSQL ile EXCLUDE / trigger / eşzamanlılık testi yok.
  - Admin API izin matrisi testi yok (H-01'i yakalayacak test yok).
  - R2 upload doğrulama testi yok.
  - Auth uçtan uca akış testi (login → 2FA → refresh → logout) sınırlı.
- **Zayıf test örnekleri:**
  - `price-verify.discount.test.ts` başlığı "booking BLOKLANMAZ" diyor. Artık doğru değil (route reddediyor), ama test yalnız verify çıktısına baktığı için geçmeye devam ediyor → başlık yanıltıcı.

---

## 20. Technical Debt

- **Kullanılmayan dependency'ler:**
  - `embla-carousel-autoplay`.
  - `@tiptap/extension-underline`, `@tiptap/extension-link` (StarterKit v3 içeriyor).
  - `@tiptap/extension-table-cell` / `-header` / `-row` (TableKit içeriyor).
  - `@types/archiver` → devDependencies'e taşınmalı.
- **Çift kütüphane:**
  - `react-datepicker` + `react-day-picker`.
  - `bcryptjs` + `@node-rs/argon2`: meşru (legacy hash yükseltme); tüm hash'ler yenilenince kaldırılabilir.
- **Ölü bileşenler:** `WhyUsSection`, `HeroTrustStrip`, `HeroCopy`, `HeroReviewCard`, `CheckInOutTimes`, `VillaVideoSection`, `CategoryCollection`, `PrepaymentBadge` (hardcoded TR içeriyor).
- **Ölü export'lar:** §16'daki storage helper'ları, `closePgPool` (kullanılmıyor → aslında kullanılmalı).
- **Tekrarlar:** 7 site-URL normalizer'ı, 3 aynı `get*CoverPublicUrl`, 2 WebP dönüştürücü, 2 `ALLOWED_BUCKETS`, `useBookingEngine` içi tarih helper kopyaları.
- **Eskimiş / yanıltıcı yorumlar:** "RLS gizler", storage "DORMANT", ZIP "SEQUENTIAL", AdminGallery "8 MB/50 dosya" (kod 2 MB/80), 207 "eski sağlayıcı", 5 Sentry.
- **TODO/FIXME:** 32 (ör. `admin-user.service.ts:10` "TODO: bcrypt" eskimiş).
- **Repo hijyeni:**
  - `Claude outputs/` (23 dosya, 1,1 MB) ve `LEGACY_PROVIDER_PURGE_REPORT.md` kökte ve commit'li. İçlerinde eski marka adları geçiyor.
  - README create-next-app şablonu.
- **Migration'lar:**
  - Çalışan migration'lara dokunulmamalı.
  - 001/052 idempotent değil.
  - `_archive/README.md`'deki "070 `auth.uid()` çağırır" notu eskimiş.

---

## 21. Öncelikli 10 İş

| Öncelik | İş | Etki | Risk | Tahmini Zorluk |
|---|---|---|---|---|
| 1 | **SEC-03 Faz 2:** tüm admin API'lerine route→izin haritası. Önce `admin-users` DELETE, `settings` GET (`resend_api_key`'i çıkar), `storage/*`, `villas/*/hard-delete`, `reservations/*`, `mail/*` | Yüksek (privilege escalation, PII, secret) | Orta (izin backfill) | Orta (2–3 gün) |
| 2 | **Taslak blog / pasif CMS filtresi** (`is_active` + `published_at`) | Yüksek (içerik sızıntısı, SEO) | Düşük | Kolay (saatler) |
| 3 | **SSRF kapanışı:** görsel URL allow-list + ZIP host allow-list/timeout/redirect:manual + `ssrf.ts` IPv6 düzeltmesi | Yüksek (iç ağ) | Düşük | Kolay–Orta (1 gün) |
| 4 | **Admin şifre güncelleme** → hash + `password_hash` + tüm session'ları revoke; logout/2FA reset/deaktivasyonda revoke | Yüksek (düz metin şifre / hesap güvenliği) | Düşük | Kolay |
| 5 | **Production doğrulama + fail-fast:** Coolify'da `NEXT_PUBLIC_SITE_URL` / CDN build-time, Upstash, `CRON_SECRET`, 7 cron görevi; build/start'ta eksikse dur; güvenilir IP (`cf-connecting-ip` / Traefik) | Yüksek (sessiz SEO/görsel bozulması, rate-limit kapalı) | Orta (topoloji) | Kolay–Orta |
| 6 | **Security header'lar** (XFO/`frame-ancestors`, HSTS, nosniff, Referrer-Policy) + `/rezervasyon-kontrol` noindex + no-referrer + tracking temizliği | Orta–Yüksek (clickjacking, PII) | Düşük | Kolay |
| 7 | **Rezervasyon ↔ manuel blok DB guard'ı** (trigger + advisory lock) + update/status yollarında kontrol + silinmiş villa POST reddi | Yüksek (çift konaklama) | Orta | Orta (önce veri denetimi) |
| 8 | **Storage upload sertleştirme:** prefix/izin, magic-byte, boyut limiti, geçerli Cache-Control, WebP fallback kaldırma | Orta | Düşük | Kolay–Orta |
| 9 | **Abuse:** public `mail/reservation-request`'i kaldır / tek seferlik yap, login rate-limit + atomik sayaç, pending TTL + Turnstile | Orta | Orta (iş kuralı) | Orta |
| 10 | **DB baseline + ledger** (`pg_dump --schema-only`) + `reservation_no` UNIQUE/index + temel CHECK'ler; hard-delete transaction | Orta (DR, bütünlük) | Düşük–Orta | Orta |

Sonraki sıradakiler:
- SEO toplu düzeltmeler (EN/DE noindex, sitemap noindex filtresi, soft-404, OG, hreflang gate).
- CI (tsc + eslint + vitest + build) + Playwright smoke.
- Villa detay ISR.
- Hero datepicker lazy.
- Admin listesi sayfalama.
- Komisyon yeniden hesaplama kararı.
- Kur max-age.
- `html lang` / locale root layout.
- Yorum/ölü kod/dependency temizliği.
- Dockerfile + deep health + graceful shutdown.

---

## 22. Sonuç

Proje fonksiyonel olarak olgun, müşteri tarafındaki para akışı ise sağlam. Bu audit'in ana mesajı şu: **en büyük risk dışarıdan değil, admin paneli içinden.** Yetki modeli UI'da ve server action'larda var, ama API katmanında yarım kalmış. Supabase'den geçişte RLS'nin sağladığı örtük korumalar (taslak içerik, API yetkisi) kod seviyesine taşınmamış. İlk 6 iş yaklaşık 1 haftalık odaklı çalışmayla tamamlanabilir ve genel skoru ~8/10'a taşır.

### ŞU ANDA PRODUCTION'A ÇIKMAYI ENGELLEYENLER
(Site zaten yayında; bunlar "hemen kapatılması gereken" maddeler.)

1. **H-02 Taslak/pasif içerik herkese açık:** kimlik doğrulamasız erişilebilen tek High bulgu.
2. **H-01 Admin API izin boşluğu:** birden fazla, farklı yetkili admin kullanılıyorsa engelleyici. Tek admin varsa risk kabul edilebilir ama yine de kısa vadede kapatılmalı.
3. **H-04 Admin şifre güncelleme:** production şemasına göre düz metin şifre veya çalışmayan akış (**doğrulanması gerekli**).
4. **H-07 / M-03 / M-19 production ayarlarının doğrulanması:** `NEXT_PUBLIC_SITE_URL` ve CDN build-time, Upstash, cron görevleri. Koddan doğrulanamadı; biri eksikse SEO, görseller, rate-limit veya kur güncelliği sessizce bozulur.

### PRODUCTION'A ÇIKMAYI ENGELLEMEYENLER
- H-03 / M-01 SSRF (yalnız admin; kısa vadede kapatılmalı).
- H-05 manuel blok çakışması (admin süreciyle yönetilebilir; kısa vadede DB guard).
- H-06 lookup sayfası noindex.
- M-02 header'lar.
- M-05..M-22.
- Tüm SEO/i18n kusurları (çok dil kapalıyken etkisi sınırlı).
- Performans (dynamic villa detay, JS boyutu).
- Test altyapısı (CI/E2E yok).
- Teknik borç, yorum hacmi, ölü kod.
- F6 ertelenen kurallar (kullanıcı kararı).

### İYİ DURUMDA OLANLAR
- Public rezervasyon ve fiyat zinciri: sunucu otoriteli, fail-closed, 34 senaryo parity + 90 SEC-06 testi.
- Aynı tablo çift rezervasyonu DB EXCLUDE ile atomik.
- Kimlik doğrulama: Argon2id, `__Host-` cookie, refresh rotasyonu, AES-GCM TOTP, hash'li recovery code'lar.
- Server action yetkilendirmesi (136'dan 129'u guard'lı, kalanı kasıtlı public).
- SQL injection direnci, SECURITY DEFINER hijyeni.
- XSS korumaları (sanitize, JSON-LD escape, tracking izolasyonu) + CSP Report-Only altyapısı.
- Token tasarımları (share / ZIP / private / lookup).
- Vercel/Supabase/eski domain aktif kod kalıntısı yok (tek istisna `supabase.co` görsel host'u).
- Sözlükler %100 dolu; URL/canonical/hreflang altyapısı tek kaynakta.
- Geniş regresyon test kültürü.

### BİR SONRAKİ SPRINTTE YAPILMASI GEREKENLER
1. SEC-03 Faz 2 (tam route izin haritası + izin matrisi testi).
2. SSRF + storage upload sertleştirme.
3. Session revoke + login rate-limit + atomik sayaç.
4. Manuel blok DB guard'ı + silinmiş villa reddi + pending TTL / Turnstile.
5. Security header'lar + lookup noindex.
6. Env fail-fast + `.env.example` + güncel cron dokümanı + deep health + graceful shutdown.
7. DB baseline + migration ledger + `reservation_no` UNIQUE.
8. SEO toplu düzeltmeler (H-02 sonrası: EN/DE noindex, sitemap, soft-404, OG).
9. CI pipeline (tsc/eslint/vitest/build) + 3–5 Playwright smoke testi (rezervasyon, admin login, izin).
10. Teknik borç turu: kullanılmayan dependency/ölü bileşenleri kaldır, eskimiş yorumları temizle, `AramaPageBody` / `VillaCard` / `users/page`'i böl.
