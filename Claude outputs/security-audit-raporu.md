# Aşama 8 — Kapsamlı Güvenlik Audit Raporu (YALNIZCA ANALİZ)

- **Proje:** tatilin-yeri-next (villa kiralama)
- **Stack:** Next.js 16.3.5 (App Router, Turbopack build) · React 19.2.4 (App Router'da Next'in vendored React'i: `19.3.0-canary-cbb046ab-20260731`) · native PostgreSQL (`pg` 8.22) + custom query builder · Cloudflare R2 (`@aws-sdk/client-s3`) · Upstash rate limit · `jose` HS256 JWT · Argon2id · TOTP 2FA · Coolify/Hetzner
- **İncelenen commit:** `a56bb78 perf(villa): lazy load booking modal` (452 commit, tree `3bef8eb8…`)
- **Tarih:** 2026-09-24
- **Yöntem:** statik kod analizi, config ve migration analizi, `npm audit --package-lock-only` (salt okunur), git geçmişinde kalıp taraması (değerler yazdırılmadı), `.env*` dosyalarında **yalnızca değişken adları**, CVE'lerin web üzerinden doğrulanması. Canlı sisteme saldırı denemesi **yapılmadı**. DB'ye bağlanılmadı, R2'ye erişilmedi, gerçek kullanıcı verisi okunmadı.
- **Kod değişikliği:** YOK. Bu dosya dışında hiçbir dosya oluşturulmadı ya da değiştirilmedi.

> **Doğrulama düzeyleri** (her bulguda belirtilir)
> - **KOD-KANITLI:** İlgili satırlar okundu; bulgu doğrudan koddan çıkıyor. Canlı istismar denenmedi.
> - **KOD-GÜÇLÜ:** Kod yolu okundu; sonucun kesinleşmesi için çalışma zamanı/DB durumu gerekiyor.
> - **POTANSİYEL / DOĞRULANMALI:** Koddan makul biçimde çıkan ama kesin kanıtlanamayan risk.
> - **DOĞRULANAMADI — server/infrastructure erişimi gerekiyor.**

---

## 0. Yönetici Özeti

| Seviye | Adet | Bulgular |
|---|---|---|
| **CRITICAL** | 2 | SEC-01 (admin sayfalarında kimlik doğrulaması yok, sahte refresh cookie yeterli), SEC-02 (admin şifre güncellemesi hash'lenmiyor; koşullu) |
| **HIGH** | 5 | SEC-03 izin (permission) kontrolü API katmanında yok · SEC-04 settings API secret sızdırıyor ve serbest kolon yazıyor · SEC-05 admin kaynaklı ham HTML/JS public sayfalarda (CSP yok) · SEC-06 public rezervasyonda client kontrollü finansal alanlar · SEC-07 sahte "pending" rezervasyonla takvim kilitleme |
| **MEDIUM** | 10 | SEC-08 … SEC-17 (güvenlik başlıkları, rate limit, upload, SSRF, bilgi ifşası, login, DB TLS, mail kötüye kullanımı, Next 30.09 sürümü) |
| **LOW** | 12 | SEC-18 … SEC-29 |
| **INFO** | 7 | SEC-30 … SEC-36 |

**Kısaca:** Kriptografik temel sağlam:
- Argon2id, `__Host-` cookie'ler, HS256 JWT'de `typ` ve `kid` kontrolü.
- TOTP 2FA ve recovery code'ların hash'lenmesi.
- Cron uçlarında fail-closed secret.
- `quoteIdent` ile SQL identifier whitelist'i.
- SSRF guard.
- Public rezervasyonda sunucu tarafında fiyat yeniden hesaplama.

Asıl zayıflık **yetkilendirme katmanında**:

1. **Middleware yalnızca cookie'nin var olup olmadığına bakıyor.** Admin sayfalarının bir kısmı sunucu tarafında ikinci bir kontrol yapmadan veritabanından okuyor. Sonuç: oturumu olmayan biri, rezervasyon müşteri adlarını ve tutarlarını görebilir (SEC-01).
2. **`sidebar_permissions` modeli yalnızca UI'da ve server action'larda uygulanıyor.** `app/api/**` altındaki 80 route'un hiçbiri izin kontrolü yapmıyor. "Aktif admin" olan her hesap tüm admin API'lerini kullanabiliyor: başka admin oluşturma, başka adminin şifresini ve izinlerini değiştirme, 2FA sıfırlama, site ayarları (SEC-03).
3. **Ayarlar üzerinden ham HTML/JS enjekte edilebiliyor ve CSP yok** (SEC-05, SEC-08). Bu, (2) ile birleşince tam bir **yetki yükseltme zinciri** oluşturuyor: en düşük yetkili admin → site genelinde stored XSS → süper-admin tarayıcısında aynı origin'de admin API çağrıları.
4. **Public rezervasyon akışında iş mantığı açıkları var:** anonim kullanıcı "pending" rezervasyonla takvimi kilitleyebilir (SEC-07) ve `paid_amount` gibi alanları client'tan yazdırabilir (SEC-06).

**Bağımlılıklar:**
- Next 16.3.5, Next'in Ağustos 2026 advisory'lerine karşı yamalı.
- 22 Eylül 2026 kritik advisory'si (`next/og` `ImageResponse`) bu projede **kullanılmıyor**.
- **30 Eylül 2026'da 1 critical ve 2 high içeren yeni bir Next güvenlik sürümü (16.3.7) duyuruldu.** Takip edilmeli.
- `npm audit`: 1 critical, 7 high, 36 moderate. Bunların çoğu dev/build-time; prod'a etkisi olanlar SEC-25 ve SEC-26'da.

---

## 1. Kapsam ve Kısıtlar

| Kısıt | Uygulandı mı |
|---|---|
| Dosya/kod/migration/package.json/config/.env değişikliği yok | ✅ Yalnız bu rapor dosyası oluşturuldu |
| DB'ye yazma/silme/güncelleme yok | ✅ DB'ye hiç bağlanılmadı |
| R2'ye yükleme/silme yok | ✅ R2'ye erişilmedi |
| Commit / push / deploy yok | ✅ |
| Gerçek secret değeri rapora yazılmadı | ✅ Yalnız değişken adı + durum. Git taramasında yalnız commit/dosya/tip |
| Paket güncellemesi yok | ✅ `npm audit --package-lock-only` (salt okunur) |
| Saldırı gerçekleştirilmedi | ✅ Yalnız statik analiz |

---

## 2. Saldırı Yüzeyi Haritası

```
                         ┌──────────────────────── İnternet ────────────────────────┐
                         │                                                          │
   Anonim ziyaretçi ─────┼─► Public sayfalar (SSR/RSC)  /, /villa/*, /arama, /blog…  │
                         │     • Server Actions (anonim): searchVillas, createVillaReviewAction,
                         │       createSharedFavoritesListAction, fiyat/müsaitlik okuma
                         │     • layout.tsx: settings.customHead / analyticsScript / gtmId  (ham HTML)
                         │     • villa.map_embed (ham HTML), JSON-LD
                         │
                         ├─► /api/public/*   reservations(POST) · reservation-lookup · contact
                         │                    offer-requests · villas/[id]/availability|blocked-ranges
                         │                    payment-methods · taxonomies
                         ├─► /api/mail/reservation-request (PUBLIC, RL)
                         ├─► /api/exchange-rates · /api/geocode (→ dış servis) · /api/health
                         ├─► /api/villa-zip/[token] (token'lı, → sunucu tarafı fetch → ZIP)
                         ├─► /api/auth/login · 2fa/verify · refresh · logout · me
                         ├─► /api/cron/*  (Bearer CRON_SECRET, fail-closed)
                         │
   Admin (her rol) ──────┼─► /maki-admin/*  (middleware: yalnız cookie VARLIĞI)
                         │     • bazı page.tsx doğrudan repository okur (auth YOK) ← SEC-01
                         │     • *.action.ts → requirePermission ✓
                         ├─► /api/admin/**, /api/admin-users/**, /api/mail/* (admin)
                         │     • yalnız authorizeAdminCaller (aktif admin) — İZİN YOK ← SEC-03
                         │     • storage/upload|remove → R2 (serbest path/type) ← SEC-10
                         │     • settings PUT (serbest kolon) ← SEC-04
                         │
                         └─► CDN: cdn.* / assets.* (R2 public)   Legacy: **.supabase.co (next/image)

   Sunucu içi çıkış: PostgreSQL (tek rol, RLS yok, sslmode=require → cert doğrulanmaz)
                     R2 (S3 API) · Upstash REST · Resend · TCMB XML · Geocode sağlayıcı
                     Harici iCal URL'leri (SSRF guard'lı) · villa-zip image fetch (guard'sız) ← SEC-11
```

**Güven sınırları:**
1. Tarayıcı ↔ Next (middleware + route handler + server action).
2. Admin rolleri arası: izin modeli bu sınırda **uygulanmıyor**.
3. Next ↔ PostgreSQL: tek rol olduğu için DB katmanında savunma yok.
4. Next ↔ dış servisler.

---

## 3. Bulgu Özet Tablosu

| ID | Seviye | Alan | Başlık | Doğrulama |
|---|---|---|---|---|
| SEC-01 | **CRITICAL** | Auth / Admin | Admin sayfaları sunucu tarafında yetki kontrolü yapmıyor; middleware herhangi bir `__Host-admin_rt` değerini geçerli oturum sayıyor | KOD-KANITLI |
| SEC-02 | **CRITICAL** (koşullu) | Auth / Admin | Admin kullanıcı güncelleme API'si şifreyi hash'lemeden `password` kolonuna yazıyor | KOD-KANITLI + DB şeması DOĞRULANAMADI |
| SEC-03 | **HIGH** | Authz | `app/api/**` altında 80 route'un hiçbiri `sidebar_permissions` kontrolü yapmıyor, her aktif admin her işlemi yapabiliyor | KOD-KANITLI |
| SEC-04 | **HIGH** | Secrets / Authz | `GET /api/admin/settings` `select("*")` ile `resend_api_key` döndürüyor; `PUT` ham body ile her kolonu yazıyor | KOD-KANITLI |
| SEC-05 | **HIGH** | XSS | `customHead`, `analyticsScript`, `gtmId`, `map_embed` public sayfalarda ham HTML/JS olarak basılıyor (admin panel ile aynı origin, CSP yok) | KOD-KANITLI |
| SEC-06 | **HIGH** | Rezervasyon | Public rezervasyonda `paid_amount`, `damage_deposit`, `guests`, `guest_names` client'tan yazılıyor; fiyat recompute hata verirse client fiyatı kalıyor (fail-open) | KOD-KANITLI (etkisi doğrulanmalı) |
| SEC-07 | **HIGH** | İş mantığı | Anonim "pending" rezervasyon takvimi kilitliyor; üst gece limiti yok, rate limit atlatılabilir | KOD-GÜÇLÜ / staging'de doğrulanmalı |
| SEC-08 | MEDIUM | Headers | Uygulama seviyesinde CSP, HSTS, X-Frame-Options/frame-ancestors, nosniff, Referrer-Policy yok | KOD-KANITLI; proxy katmanı DOĞRULANAMADI |
| SEC-09 | MEDIUM | Rate limit | IP `X-Forwarded-For`'un ilk değerinden alınıyor (sahte değer verilebilir); Upstash yoksa veya hata verirse fail-open; login ve server action'larda rate limit yok | KOD-KANITLI; proxy davranışı DOĞRULANAMADI |
| SEC-10 | MEDIUM | Upload / R2 | Storage upload/remove: path, content-type, boyut ve uzantı doğrulaması yok; izin kontrolü yok | KOD-KANITLI |
| SEC-11 | MEDIUM | SSRF | `villa-zip` indirme, `image_url`'i SSRF guard olmadan `fetch` ediyor ve yanıtı ZIP'e koyuyor | KOD-KANITLI |
| SEC-12 | MEDIUM | Bilgi ifşası | Public `searchVillas` server action'ı gizli `real_title` üzerinden arama yapıyor (oracle); `limit` client'tan geliyor | KOD-KANITLI |
| SEC-13 | MEDIUM | Auth | Login'de IP bazlı limit yok: hesap kilitleme ile DoS ve password spraying; "locked"/"inactive" mesajları hesap varlığını ele veriyor | KOD-KANITLI |
| SEC-14 | MEDIUM | PostgreSQL | `PGSSLMODE=require` → `rejectUnauthorized:false`; tek DB rolü, RLS yok; DEFINER fonksiyonlarda `REVOKE` yok | KOD-KANITLI; prod DB topolojisi DOĞRULANAMADI |
| SEC-15 | MEDIUM | SSRF | Harici takvim SSRF guard'ı: DNS doğrulaması ile fetch arasında TOCTOU (rebinding), IPv6 kontrolü string seviyesinde | POTANSİYEL / DOĞRULANMALI |
| SEC-16 | MEDIUM | Mail kötüye kullanımı | Anonim rezervasyon ile istenen e-posta adresine mail gönderilebiliyor; `reservation-request` idempotent değil | KOD-KANITLI |
| SEC-17 | MEDIUM | Bağımlılık | Next.js 30 Eylül 2026 planlı güvenlik sürümü (1 critical, 2 high). 16.3.5 büyük olasılıkla etkileniyor | Web doğrulandı; detaylar henüz yayımlanmadı |
| SEC-18 | LOW | Hata ifşası | DB `error.message` client'a dönüyor (public `/api/exchange-rates` dahil) | KOD-KANITLI |
| SEC-19 | LOW | Bilgi ifşası | `/api/health` Node/Next sürümü ve sunucu başlangıç zamanını döndürüyor | KOD-KANITLI |
| SEC-20 | LOW | Auth | Voucher için `?token=` query ile access JWT kabul ediliyor (log ve Referer'a sızma) | KOD-KANITLI |
| SEC-21 | LOW | XSS | JSON-LD `JSON.stringify` çıktısında `<` escape edilmiyor (kaynak yalnızca admin verisi) | KOD-KANITLI |
| SEC-22 | LOW | Config | `next.config.ts` içinde legacy `**.supabase.co` joker `remotePattern` | KOD-KANITLI |
| SEC-23 | LOW | Cron | `CRON_SECRET` karşılaştırması sabit zamanlı değil | KOD-KANITLI |
| SEC-24 | LOW | Spam | `createSharedFavoritesListAction` anonim ve rate limit'siz, DB'ye satır yazıyor | KOD-KANITLI |
| SEC-25 | LOW | Bağımlılık | `@tiptap/core` 3.27.1 (GHSA-cp6q-959q-f8rh, GHSA-j95f-988m-3j2f), `sanitize-html` 2.17.5 (GHSA-g8qq-57p8-ggw5, GHSA-jxwj-j7wr-gfrw) | npm audit + web |
| SEC-26 | LOW | Bağımlılık | `fast-xml-parser` 5.9.3 (GHSA-8r6m-32jq-jx6q), yalnızca TCMB XML'i için kullanılıyor | npm audit |
| SEC-27 | LOW | Git geçmişi | İlk commit'te `supabase/.temp/*` (project-ref, parolasız pooler URL). §7.1'deki "eski PG credential" iddiası kalıp taramasıyla **doğrulanamadı** | Git taraması |
| SEC-28 | LOW | Spam | Public yorum formu (`createVillaReviewAction`) rate limit'siz (moderasyonlu) | KOD-KANITLI |
| SEC-29 | LOW | Bağımlılık (dev) | `vitest` 2.1.9 (critical), `vite`, `esbuild`, `postcss`, `brace-expansion`, `js-yaml`, `browserslist`: build/test zamanı | npm audit |
| SEC-30 | INFO | Bağımlılık | React RSC CVE-2026-23869: App Router, Next'in vendored React'ini (19.3.0-canary 2026-07-31) kullanıyor, bu sürüm yamalı | Web + node_modules |
| SEC-31 | INFO | Bağımlılık | Next Ağustos 2026 (AVIF RCE, Windows RCE) → 16.3.5 yamalı; AVIF kapalı, sunucu Linux. 22 Eylül `next/og` RCE → `ImageResponse` kullanılmıyor | Web + kod |
| SEC-32 | INFO | Env | `.env.example` git'te takip edilmiyor (`.env*` ignore); içinde dolu `AUTH_JWT_SECRET`/`TOTP_ENCRYPTION_SECRET` örnek değerleri var (`.env.local`'dan farklı) | Cihazda doğrulandı |
| SEC-33 | INFO | Infra | `.env.local` içindeki `DATABASE_URL` legacy sağlayıcı pooler host'unu gösteriyor (dev). Prod `DATABASE_URL` hedefi DOĞRULANAMADI | Cihaz |
| SEC-34 | INFO | Bağımlılık | `date-fns` iki kopya (3.6.0 + 4.4.0, react-datepicker üzerinden) | lockfile |
| SEC-35 | INFO | DB | Migration 070 `is_active_admin()` `auth.uid()` çağırıyor (vanilla PG'de hata verir, koddan çağrılmıyor) | Migration |
| SEC-36 | INFO | Pozitif | Güçlü kontroller (bkz. §5) | — |

---

## 4. Bulgu Detayları

### SEC-01 — CRITICAL — Admin sayfaları, sahte refresh cookie ile oturumsuz görüntülenebiliyor

**Kanıt:**
- `middleware.ts:28-38`
  ```ts
  const hasRefresh = !!req.cookies.get(REFRESH_COOKIE)?.value;
  ...
  } else if (hasRefresh) {
    // access yok ama refresh var → downstream refresh eder.
    sessionOk = true;
  }
  ```
  Refresh token'ın **değeri doğrulanmıyor**; boş olmayan herhangi bir string yeterli. Access token süresi dolmuşsa (`reason === "expired"`) bile refresh cookie'nin varlığı kabul ediliyor.
- `app/(admin)/maki-admin/layout.tsx:1` → `"use client"`. Grup layout'unda **sunucu tarafında yetki kapısı yok**.
- `app/(admin)/maki-admin/page.tsx:1-25` → `import "server-only"`. `reservationServerRepository.findRecentForDashboard()`, `getOperationsSnapshot()` ve `getDailyReservationCounts()` doğrudan çağrılıyor; `authorizeAdminSession()` / `requirePermission()` **çağrılmıyor**.
- `lib/db/reservation.repository.server.ts:313-321` → `select("id, name, total_price, status, created_at, start_date, end_date, villa:villa_id(title)")`, yani **misafir adı, tutar ve tarihler**.
- Aynı desen (server `page.tsx`'in yetki kontrolü olmadan veri okuması) şu dosyalarda da doğrudan doğrulandı:
  - `villas/page.tsx` (`getVillasForAdminPage`)
  - `villa-listesi/page.tsx`
  - `villas/siralama/page.tsx`
  - `manual-reservations/ekle/page.tsx`
  - `settings/ceviriler/page.tsx`
- `*.action.ts` dosyaları ise `requirePermission` ile korunuyor (13 dosya). Sorun **page.tsx katmanında**.

**Senaryo:** Saldırgan `Cookie: __Host-admin_rt=x` başlığıyla `GET /maki-admin` isteği atar. Middleware geçirir ve RSC/HTML çıktısında son 5 rezervasyonun misafir adı, tutarı ve tarihleri ile operasyon özeti (giriş/çıkışlar) döner. `__Host-` öneki saldırganı engellemez; bu kısıt yalnızca tarayıcının cookie *set etmesi* için geçerlidir, elle gönderilen başlık için değil.

**Etki:** Kimlik doğrulaması olmadan kişisel veri (KVKK) ve ticari veri ifşası. Canlıda denenmedi; kod yolu kesin.

**Öneri:**
1. `app/(admin)/maki-admin/` için **sunucu layout'u** oluşturun: mevcut client layout'u bir alt bileşene taşıyın, server `layout.tsx` içinde `authorizeAdminSession()` çağırın ve başarısız olursa `redirect("/maki-admin/login")` yapın.
2. **Her** server `page.tsx` başında `requirePermission("<modül>")` çağırın. Layout tek başına yeterli değildir: RSC'de layout ve page paralel render edilir.
3. Middleware'de "yalnızca refresh cookie var" durumunda `NextResponse.next()` yerine `/api/auth/refresh?next=` akışına yönlendirin, ya da refresh token'ı DB'de doğrulayan bir kontrol ekleyin. Middleware'i asla tek yetki kapısı olarak kullanmayın.
4. Regresyon testi: auth'suz ve sahte cookie'li `GET /maki-admin/*` isteklerinde yanıtta veri olmadığını doğrulayan bir test.

---

### SEC-02 — CRITICAL (koşullu) — Admin şifre güncellemesi hash'lenmiyor

**Kanıt:**
- `app/api/admin-users/[id]/route.ts:98-101`
  ```ts
  if (input.password !== undefined && input.password.trim().length > 0) {
    payload.password = input.password.trim();
  }
  ```
- `lib/db/admin-user-panel.repository.server.ts:64-66` → `dbAdmin.from("admin_users").update(payload).eq("id", id)`. Arada hash işlemi yok.
- Native login, `password_hash` kolonunu kullanıyor (`db/migrations/068_native_auth.sql:38`; `lib/auth/native/login.service.ts`). `create-user` ise doğru şekilde Argon2id ile `password_hash` yazıyor (`create-user/route.ts:120-124`).

**İki olası durum** (DOĞRULANAMADI — DB şema erişimi gerekiyor):
- (a) `admin_users.password` kolonu **varsa** (eski sağlayıcı döneminden kalma): panelden girilen yeni şifre **düz metin olarak saklanıyor** → CRITICAL.
- (b) Kolon **yoksa**: güncelleme hata verir. Ama aynı payload'daki diğer alanlar da yazılamaz. Admin "şifreyi değiştirdim" sanarken eski şifre geçerli kalır (**başarısız rotasyon**) → HIGH.

**Doğrulama sorgusu** (salt okunur, kullanıcı verisi döndürmez):
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='admin_users' and column_name in ('password','password_hash');
```

**Öneri:**
- Route'ta `hashPassword()` (Argon2id) ile `password_hash` ve `password_changed_at` yazın.
- Şifre değişince hedef kullanıcının tüm refresh token'larını iptal edin.
- (a) doğrulanırsa kolonu sıfırlayın/kaldırın, etkilenen şifreleri rotate edin.
- Şifre değiştirme işlemi `users` izni + (başkası içinse) üst yetki gerektirmeli (bkz. SEC-03).

---

### SEC-03 — HIGH — İzin modeli API katmanında uygulanmıyor (dikey yetki yükseltme)

**Kanıt:**
- `grep -rln "callerHasPermission|requirePermission" app/api` → **0 dosya**.
- API route'larının tamamı yalnızca `authorizeAdminCaller` / `authorizeAdminSession` kullanıyor. `lib/admin-route-auth.ts:50-131` yalnızca "token geçerli + `is_active`" kontrolü yapıyor.
- Kritik uçlar:

| Route | Ne yapabiliyor | Kanıt |
|---|---|---|
| `POST /api/admin/create-user` | Yeni admin oluşturma, **istediği `sidebar_permissions`** ile | `create-user/route.ts:48,63-72,155` |
| `PATCH /api/admin-users/[id]` | **Başka** adminin e-posta, şifre, izin ve `is_active` alanlarını değiştirme | `admin-users/[id]/route.ts:94-107` |
| `DELETE /api/admin-users/[id]` | Başka admini silme | aynı dosya |
| `POST /api/admin/2fa/reset` | **Başka** adminin 2FA'sını ve recovery kodlarını sıfırlama (yalnızca kendine engel) | `2fa/reset/route.ts:33-67` |
| `GET/PUT /api/admin/settings` | Secret okuma, site geneli HTML/JS enjeksiyonu | SEC-04, SEC-05 |
| `POST /api/admin/storage/upload|remove` | R2'de istenen key'i yazma ya da silme | SEC-10 |
| `/api/admin/reservations/**`, `/api/admin/villas/**` (hard-delete dahil) | Tüm rezervasyon ve villa işlemleri | route matrisi §7 |

**Senaryo:** Yalnızca "yorumlar" izni olan bir admin, `PATCH /api/admin-users/<süper-admin-id>` isteğiyle `{ "email": "saldirgan@…" }` gönderir ve ardından `2fa/reset` ile hesabı ele geçirir. Daha basiti, kendine tüm izinleri verir.

**Etki:** `sidebar_permissions` bir güvenlik sınırı değil, yalnızca UI filtresi. Ele geçirilen herhangi bir admin hesabı veya kötü niyetli bir çalışan = tam yetki.

**Öneri:**
- Her admin route'una `requirePermission("<modül>")` ekleyin; route → modül eşlemesini tek bir tabloda tutun.
- Admin yönetimi, 2FA sıfırlama ve settings için ayrı bir "süper-admin" yetkisi (ör. `users` + `settings`) tanımlayın.
- `server-action-authz.test.ts` benzeri bir **route-authz testi** yazın: her `app/api/admin/**` handler'ı yetkisiz caller'da 403 dönmeli.

---

### SEC-04 — HIGH — Settings API: secret sızıntısı ve toplu atama (mass assignment)

**Kanıt:**
- `app/api/admin/settings/route.ts:33-44` → `findSingletonStrict()`, yani `select("*")` (`lib/db/settings.repository.server.ts:36-40` yorumu: "FULL row (resend_api_key dahil)") → `NextResponse.json({ ok: true, settings: data })`.
- `route.ts:84-103` → `values = await req.json()` → `updateById(id, values)`. Kolon whitelist'i **yok**. `quoteIdent` yalnızca identifier sözdizimini doğruluyor, kolon yetkisini değil.

**Etki:**
- Her aktif admin Resend API anahtarını okuyabilir (domain adına mail gönderebilir).
- Her aktif admin `customHead`/`analyticsScript` dahil tüm kolonları yazabilir (→ SEC-05).

**Öneri:**
- GET'te secret kolonlarını çıkarın, yerine `resend_api_key_set: boolean` döndürün.
- Secret'ı yalnızca env'de tutmayı değerlendirin.
- PUT'ta açık bir kolon whitelist'i uygulayın; secret ve HTML kolonları için ayrı izin isteyin.

---

### SEC-05 — HIGH — Admin kaynaklı ham HTML/JS public sayfalarda + CSP yok = yetki yükseltme zinciri

**Kanıt:**
- `app/layout.tsx:153-157` → `dangerouslySetInnerHTML={{ __html: customHead }}`
- `app/layout.tsx:173-177` → `dangerouslySetInnerHTML={{ __html: analyticsScript }}`
- `app/layout.tsx:163-169` → `gtmId` inline script içinde **string interpolasyonu** ile basılıyor: `'${gtmId}'`. Format doğrulaması yok; `');alert(1);//` gibi bir değer JS enjeksiyonu yapar.
- `app/services/villa-admin/_helpers/payload.ts:211-213` → `map_embed` olduğu gibi kaydediliyor. Render yerleri:
  - `app/components/private-villa/PrivateVillaPageBody.tsx:732` → `dangerouslySetInnerHTML={{ __html: villa.map_embed }}`
  - `VillaMapModal.tsx`

**Zincir:**
1. Düşük yetkili admin, settings veya villa haritası üzerinden script enjekte eder (SEC-03 nedeniyle izin gerekmez).
2. Script, admin panelle **aynı origin'deki** public sayfada çalışır.
3. Süper-admin siteyi ziyaret eder → `fetch("/api/admin-users/…", {credentials:"include"})`. `HttpOnly` cookie'ler JS'e görünmez ama aynı origin'den gönderilen isteklere eklenir.
4. Tam hesap ele geçirme. Ayrıca tüm ziyaretçilere yönelik skimming/phishing mümkün.

**Öneri:**
- `gtmId` için `/^GTM-[A-Z0-9]{4,10}$/` doğrulaması yapın (hem kayıtta hem render'da).
- `map_embed` → yalnızca `https://www.google.com/maps/embed?…` biçimindeki iframe `src`'sini saklayın, iframe'i kod üretsin.
- `customHead`/`analyticsScript` → ayrı ve sıkı bir izin; mümkünse yapılandırılmış alanlara (GA4 ID, Meta Pixel ID…) geçin.
- Nonce tabanlı CSP (SEC-08).
- Admin paneli ayrı bir subdomain'e taşımak bu zinciri kırar (uzun vadeli).

---

### SEC-06 — HIGH — Public rezervasyonda client kontrollü alanlar ve fail-open fiyat

**Kanıt:**
- `app/api/public/reservations/route.ts:145-171` → sunucu `verification.authoritative` doluysa `total_price*`, `original_*`, `cleaning_*`, `prepayment_amount`, `remaining_payment`, `custom_price*`, `discount_*` alanlarını **ezer** (iyi).
- **Ezilmeyen** alanlar `app/services/reservation/_helpers/payload-create.ts` üzerinden olduğu gibi yazılıyor:
  - `:157-159` → `paid_amount: Number(data.paid_amount) || 0` (client gönderirse)
  - `:184-186` → `damage_deposit`
  - `:137` → `guests: Number(data.guests) || 1` (üst sınır yok)
  - `:139` → `guest_names` (boyut/uzunluk sınırı yok)
  - `payment_method_id`, `note`, `identity_number` (uzunluk sınırı görünmüyor)
- Fail-open:
  - `price-verify.ts:589-603` → recompute sırasında exception olursa `authoritative: null` döner ve route body'yi **değiştirmez**, yani client'ın `total_price`/`prepayment_amount` değerleri DB'ye yazılır.
  - `:164` → `villa_id`/tarih boşsa `null`.

**Senaryo:** `POST /api/public/reservations` isteğinde `paid_amount = total_price` gönderilir. Admin panelde rezervasyon "ödenmiş" görünebilir; voucher, muhasebe ve komisyon ekranları bu alanı kullanıyorsa yanlış işlem riski doğar. **Etkinin boyutu, `paid_amount`'u okuyan ekranlara bağlı: doğrulanmalı.** Fail-open dalı yalnızca DB/recompute hatasında tetiklenir; saldırganın bunu tetikleyebildiği kanıtlanmadı: POTANSİYEL.

**Öneri:**
- Public route'ta **allowlist ile yeni obje** oluşturun (ör. `pickPublicReservationFields(body)`); `paid_amount=0`, `damage_deposit=villa.deposit` sunucuda belirlensin.
- `guests` değerini villa kapasitesiyle sınırlayın; string/array uzunluk limitleri koyun.
- Recompute başarısızsa public akışta **fail-closed** (400/503) yapın; admin akışı fail-open kalabilir.

---

### SEC-07 — HIGH — Anonim "pending" rezervasyonla takvim kilitleme (envanter DoS)

**Kanıt:**
- `db/migrations/030_reservations_status_allow_list.sql:23` → çakışma kısıtı `WHERE status IN ('pending','confirmed')`, yani **pending rezervasyon tarihi bloklar**.
- Public create `status: "pending"` yazar (`payload-create.ts:145`).
- Üst gece (max-stay) doğrulaması bulunamadı (`grep max_stay|maxNights` → sonuç yok). `priceUnavailable` kapısı yalnızca fiyatı tanımlı olmayan geceleri reddediyor; tüm sezon fiyatlıysa sezonun tamamı tek istekle bloklanabilir.
- Rate limit `reservation: 3 / 10 dk / IP` (`lib/rate-limit.ts`). IP sahte değer verilebilen XFF'den alınıyor ve Upstash yoksa limit tamamen kapalı (SEC-09).
- CAPTCHA yok.

**Etki:** Rakip veya bot, yüksek sezonda tüm villaları sahte pending rezervasyonlarla doldurabilir; gerçek müşteri "dolu" görür. Admin temizleyene kadar gelir kaybı olur.

**Öneri:**
- Public pending rezervasyonlara **TTL** ekleyin (ör. 24–48 saat içinde onaylanmazsa `expired` ve blok kalkar).
- Max-stay limiti.
- Aynı e-posta/telefon için eşzamanlı pending sınırı.
- Rezervasyon formunda **Turnstile** (bkz. §8).
- Rate limit anahtarını güvenilir IP'ye bağlayın.
- Doğrulama önerisi: staging'de 2 ardışık sahte rezervasyonla blok davranışını gözlemleyin.

---

### SEC-08 — MEDIUM — Güvenlik başlıkları yok (uygulama seviyesi)

**Kanıt:**
- `next.config.ts` içinde `headers()` yok.
- `middleware.ts` matcher'ı yalnızca `/maki-admin/:path*` ve yanıta başlık eklemiyor.
- Kod tabanında `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` tanımı bulunamadı.

**Etki:**
- Admin panel clickjacking'e açık.
- SEC-05 için hafifletici kontrol yok.
- `nosniff` olmadığı için R2'ye yüklenen dosyalar içerik koklamasına açık (SEC-10).

**Proxy katmanı:** Coolify/Traefik veya Cloudflare'de başlık eklenip eklenmediği **DOĞRULANAMADI — server/infrastructure erişimi gerekiyor.** Kontrol: `curl -sI https://<prod-domain>/` ve `/maki-admin/login`.

**Öneri:**
- `next.config.ts` → `headers()`: HSTS (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `/maki-admin/*` için `frame-ancestors 'none'`.
- CSP'yi önce `Content-Security-Policy-Report-Only` ile başlatın. GTM ve admin script'leri nedeniyle nonce tabanlı yaklaşım gerekir.

### SEC-09 — MEDIUM — Rate limit zayıflıkları

**Kanıt:**
- `lib/rate-limit.ts:191-204` → `x-forwarded-for`'un **ilk** değeri. Reverse proxy client'ın gönderdiği XFF'yi silmiyorsa saldırgan her istekte farklı IP bildirir ve limit etkisiz kalır.
- `:147-160` → env yoksa her şey serbest (production'da yalnızca `console.warn`).
- `:252-258` → Upstash hatasında fail-open.
- **Kapsam dışında kalanlar:**
  - `/api/auth/login` (yalnızca origin guard + hesap kilidi)
  - `/api/auth/refresh`
  - Tüm public **server action**'lar (`searchVillas`, `createVillaReviewAction`, `createSharedFavoritesListAction`)
  - `/api/public/payment-methods`, `/api/public/taxonomies`

**DOĞRULANAMADI:**
- Traefik'in `forwardedHeaders.trustedIPs` ayarı ve Cloudflare önünde olup olmadığı.
- Prod'da `UPSTASH_REDIS_REST_URL`/`TOKEN` tanımlı mı? `.env.example`'da var, `.env.local`'da yok.

**Öneri:**
- Cloudflare arkasındaysanız `cf-connecting-ip`, değilse Traefik'in eklediği **son** güvenilir hop'u kullanın.
- Production'da Upstash eksikse uygulamayı başlatmayın (fail-closed boot check).
- Login'e IP + e-posta bazlı limit ekleyin.
- Server action'lar için `headers()` ile IP okuyan bir yardımcı yazın.

### SEC-10 — MEDIUM — Storage upload/remove doğrulamasız

**Kanıt:**
- `app/api/admin/storage/upload/route.ts:61-114`: `bucket` allowlist'te (iyi). Ancak `path` serbest (yalnızca boş olmama kontrolü). `contentType` client'tan geliyor. Boyut limiti, uzantı ya da magic-byte kontrolü yok. İzin kontrolü yok.
- `storage/remove/route.ts:57-77` → serbest path listesi ile silme.
- `lib/storage/s3-storage.provider.ts:117-122` → verilen `ContentType` ile `PutObject`.

**Etki:**
- Herhangi bir admin başka villaların görsellerinin üzerine yazabilir ya da silebilir.
- `text/html` veya `image/svg+xml` dosyası yükleyip CDN domain'inde (`cdn.*`/`assets.*`) script çalıştırabilir.
- CDN, site ile aynı kayıtlı domain altındaysa (ör. `cdn.yazvillam.com` ↔ `yazvillam.com`) bu **same-site** sayılır; `SameSite=Lax` cookie'lerin CSRF korumasını zayıflatır. Admin API'lerinde origin guard olmadığı için POTANSİYEL bir zincir oluşur. Prod site domain'i DOĞRULANAMADI.

**Öneri:**
- Path'i sunucu üretsin (`villas/<villaId>/<uuid>.<ext>`).
- MIME allowlist (jpeg/png/webp/avif/pdf) + magic-byte kontrolü, boyut limiti, `Content-Disposition` ve `nosniff`.
- `remove`'u DB'de kayıtlı key'lerle sınırlayın.
- `requirePermission`.

### SEC-11 — MEDIUM — villa-zip: SSRF guard'sız sunucu tarafı fetch ve içerik yansıması

**Kanıt:**
- `app/api/villa-zip/[token]/route.ts:146-164` → `fetch(resolveVillaImageUrl(row.image_url))`.
- Tam URL'ler "legacy pass-through" ile olduğu gibi geçiyor (`lib/storage.helpers.ts:286`).
- Yanıt gövdesi ZIP'e ekleniyor, yani **içerik saldırgana geri dönüyor** (blind SSRF değil).
- `image_url` değeri admin villa-image mutasyonlarından geliyor (`lib/villa-image.helpers.ts:316-321`, `villa-image.mutations.ts:35-38`); URL host allowlist'i yok.

**Senaryo:** Admin (izin kontrolü yok, SEC-03) bir görselin `image_url`'ini `http://169.254.169.254/hetzner/v1/metadata` ya da Coolify iç servis adresi yapar, ardından ZIP linki oluşturup indirir. Metadata/user-data veya iç servis yanıtı ZIP'in içinde gelir.

**Öneri:**
- `lib/security/ssrf.server.ts` guard'ını buraya da uygulayın.
- Daha iyisi: yalnızca CDN host'ları + relative path kabul edin, R2'den **S3 API ile** (`GetObject`) okuyun.
- `redirect: "manual"`.

### SEC-12 — MEDIUM — Public villa aramasında `real_title` oracle'ı ve limitsiz sonuç

**Kanıt:**
- `app/components/layout/villa-search.action.ts:22-23` → `export async function searchVillas(term: string, limit = 5)`. Server action olduğu için `limit` **client'tan** geliyor.
- `lib/db/villa.repository.server.ts:1249` → `.or("search_title.ilike…, real_title_search.ilike…")`.

**Etki:**
- Villanın gerçek/özel adı public'te gösterilmiyor olsa da aranabiliyor. Saldırgan, bir adın hangi public villaya karşılık geldiğini doğrulayabilir; bu, acenteyi atlayıp mal sahibine doğrudan ulaşmayı sağlayan ticari bir ifşa.
- `limit=100000` ile tüm aktif villa kataloğu tek istekte çekilebilir (DoS/scraping).

**Öneri:** `real_title_search`'ü public aramadan çıkarın (yalnızca admin). `limit`'i `Math.min(Math.max(1, limit|0), 10)` ile sınırlayın.

### SEC-13 — MEDIUM — Login: hesap kilitleme DoS, password spraying, hesap tespiti

**Kanıt:**
- `lib/auth/native/login.service.ts:86-116` → `AUTH_LOGIN_MAX_ATTEMPTS` başarısız denemeden sonra `locked_until` konuyor.
- `/api/auth/login` rate limit'siz.
- `"locked"` ve `"inactive"` durumları ayrı mesaj döndürüyor ("Hesabınız pasif durumda"). Kullanıcı yoksa ya da şifre yanlışsa generic mesaj + timing parity var (iyi).

**Etki:**
- Admin e-posta adresini bilen biri, sürekli yanlış şifre deneyerek hesabı kilitli tutabilir.
- Farklı e-postalar üzerinden sınırsız spraying yapılabilir.
- Pasif veya kilitli hesapların varlığı sızar.

**Öneri:**
- IP bazlı limit (ör. 10/10 dk) + e-posta bazlı üstel gecikme.
- Kilit ve pasiflik durumlarında da generic mesaj.
- Admin girişine koşullu Turnstile (§8).

### SEC-14 — MEDIUM — PostgreSQL bağlantı ve rol modeli

**Kanıt:**
- `lib/db/pg.client.ts:44-45` → `PGSSLMODE=require` ise `ssl: { rejectUnauthorized: false }`. Bağlantı şifreli ama **sertifika doğrulanmıyor**; aradaki bir saldırgan araya girebilir (MITM). `.env.local` = `require`.
- Tek uygulama rolü, RLS yok (`pg.client.ts:12-13`; `native-db.provider.ts:28-31` `dbAdminNative = dbNative`). Uygulamadaki herhangi bir SQL/authz hatası tüm tablolara erişim demek.
- `SECURITY DEFINER` fonksiyonlarda (`055`, `056`, `070`, `081`) `REVOKE EXECUTE … FROM PUBLIC` yok. Tek rol olduğu için şu an etkisi düşük; ikinci bir rol eklenirse risk olur.

**Pozitif:**
- `query-compiler.ts:130-146` → identifier'lar `quoteIdent` regex whitelist'inden geçiyor.
- Değerler parametreli (`$n`).
- Raw SQL string birleştirme bulunamadı.

**Öneri:**
- DB aynı Hetzner host/Docker ağında değilse `verify-full` + CA.
- Salt okunur public rolü ve migration rolünü ayırın (uzun vade).
- DEFINER fonksiyonlarında `SET search_path` + `REVOKE … FROM PUBLIC`.

**DOĞRULANAMADI:** Prod DB'nin konumu, ağ yolu, `pg_hba` ve rol yetkileri.

### SEC-15 — MEDIUM (POTANSİYEL) — Harici takvim SSRF guard'ında TOCTOU

**Kanıt:**
- `lib/security/ssrf.server.ts:44-48` → hostname DNS ile çözülüp IP kontrol ediliyor, sonra `fetch(url)` **yeniden çözümlüyor**. DNS rebinding ile ikinci çözümleme iç IP'ye dönebilir.
- `lib/security/ssrf.ts:125-128` → IPv6 blok kontrolü string düzeyinde (IPv4-mapped `::ffff:a9fe:a9fe` gibi biçimlerin kapsanıp kapsanmadığı doğrulanmalı).
- `external-calendar.service.ts:128` → redirect davranışı doğrulanmalı.

**Öneri:** Çözümlenen IP'ye bağlanan özel bir `undici` `Agent`/`lookup` kullanın, `redirect:"manual"` ile her hop'u yeniden doğrulayın, IPv6 için `ipaddr.js` benzeri kanonik bir kontrol yapın.

### SEC-16 — MEDIUM — Rezervasyon akışı üzerinden mail kötüye kullanımı

**Kanıt:**
- Public rezervasyonda `email` serbest.
- `POST /api/mail/reservation-request` PUBLIC (`route.ts:30`); `reservationId` ile DB'deki e-postaya ve admin bildirim adresine (`:189-223`) mail gönderiyor. İdempotency (ör. `request_mail_sent_at`) yok.
- Rate limit `mail: 5/dk/IP` (XFF zayıflığı: SEC-09).

**Etki:** Üçüncü kişilere domain adına istenmeyen mail gönderilebilir (Resend itibarı, spam listeleri) ve admin gelen kutusu doldurulabilir. Rezervasyon ID'si UUID olduğu için tahmin edilemez; tekrar gönderim, ID'yi bilen biriyle sınırlı.

**Öneri:**
- Maili, rezervasyon oluşturma işleminin **sunucu tarafında** tek sefer gönderin; public mail endpoint'ini kaldırın ya da tek kullanımlık yapın.
- Rezervasyon formunda Turnstile.

### SEC-17 — MEDIUM — Next.js 30 Eylül 2026 planlı güvenlik sürümü

- Next ekibi 23.09.2026'da duyurdu: **1 critical, 2 high, 5 medium, 1 low**; 16.3.7 yayımlanacak.
- Etkilenen sürümler henüz açıklanmadı; 16.3.5'in etkilenme olasılığı yüksek.
- **Öneri:** 30.09'da advisory'leri okuyun ve etkileniyorsa 16.3.7'ye geçin (bu raporda güncelleme YAPILMADI).
- Ayrıca 16.3.6 (22.09) `next/og` `ImageResponse` RCE'sini kapatıyor. Projede `next/og` kullanılmadığı için doğrudan etki yok, ama 16.3.7'ye geçişte zaten kapsanır.

### LOW bulgular

| ID | Kanıt | Açıklama | Öneri |
|---|---|---|---|
| SEC-18 | `app/api/exchange-rates/route.ts:60`, `admin/settings/route.ts:40,105`, `admin-users/[id]/route.ts:115-119` | DB `error.message` yanıtta dönüyor. **Public** `/api/exchange-rates` şema/constraint adlarını sızdırabilir | Client'a generic mesaj, detay yalnızca log'a |
| SEC-19 | `app/api/health/route.ts:46-53` | `nodeVersion`, `nextVersion`, `serverStartTime` public | Yalnızca `{ok:true}`; detayı secret header ile |
| SEC-20 | `lib/admin-route-auth.ts:167-189` (`authorizeAdminCallerFlex`), `app/api/voucher/[id]/route.ts` | Cookie yoksa `?token=<access JWT>` kabul ediliyor → proxy log, tarayıcı geçmişi, Referer | Kaldırın (cookie same-origin GET'te zaten gidiyor) ya da tek kullanımlık kısa ömürlü voucher token'ı kullanın |
| SEC-21 | `app/components/seo/StructuredData.tsx:59-64` | `JSON.stringify(data)`, `</script>` içeren admin verisi (villa/blog başlığı) script'i kırar | `.replace(/</g,"\\u003c")` |
| SEC-22 | `next.config.ts:45-54` | `**.supabase.co` + `/storage/v1/object/public/**` → `/_next/image` üzerinden herhangi bir Supabase projesinin public görselleri optimize edilebilir (maliyet/abuse) | DB'de legacy URL kalmadıysa kaldırın (önceki raporlarda sorgu mevcut) |
| SEC-23 | `lib/cron-auth.ts:44-46` | `header !== expected` sabit zamanlı değil (pratikte ağ gürültüsü nedeniyle düşük risk) | `crypto.timingSafeEqual` |
| SEC-24 | `app/(public)/favoriler/shared-favorites.action.ts:20-24` | Anonim, rate limit'siz DB insert | IP limiti + `villaIds` üst sınırı (ör. 50) |
| SEC-25 | lockfile | `@tiptap/core` 3.27.1: `mergeAttributes` `__proto__` (GHSA-cp6q-959q-f8rh), Markdown ReDoS (GHSA-j95f-988m-3j2f); yalnızca admin editörü. `sanitize-html` 2.17.5: SVG SMIL (GHSA-g8qq-57p8-ggw5), `</textarea/>` mXSS (GHSA-jxwj-j7wr-gfrw); `lib/html-sanitize.ts:14-51` allowlist'inde `svg`/`textarea` yok, yani **pratik etki düşük** | tiptap ≥ 3.30.4, sanitize-html ≥ 2.17.7 (güncelleme bu aşamada yapılmadı) |
| SEC-26 | lockfile, `lib/exchange-rate.tcmb.ts:77` | `fast-xml-parser` 5.9.3: DOCTYPE entity limit reset (GHSA-8r6m-32jq-jx6q). Kaynak yalnızca HTTPS üzerinden TCMB (güvenilir) | ≥ 5.10.1 veya `processEntities:false` |
| SEC-27 | git geçmişi | `bfab0dd` (ilk commit) `supabase/.temp/{project-ref,pooler-url,linked-project.json,…}` içeriyor; pooler URL **parolasız**. Sonradan kaldırılmış. `LEGACY_PROVIDER_PURGE_REPORT.md` §7.1'deki "eski PostgreSQL credential" iddiası, kalıp taramasıyla (`postgres://u:p@`, `PGPASSWORD`, `*_KEY/SECRET/TOKEN=`, `AKIA`, `re_…`, JWT, private key) **bulunamadı**. Tek eşleşme `f2a199a` → `lib/db/pg.client.ts` yorumundaki `user:pass@host` placeholder'ı | `gitleaks detect --log-opts="--all"` ile tam tarama. Legacy DB parolası her durumda rotate edilmeli (proje hâlâ açıksa) |
| SEC-28 | `app/services/villa-review.action.ts:38-42`, `villa-review.service.ts:488-520` | Anonim yorum; uzunluk ve puan doğrulaması var, moderasyon var, rate limit yok | IP limiti; spam görülürse Turnstile |
| SEC-29 | lockfile (dev) | `vitest` 2.1.9 (critical, GHSA-5xrq-8626-4rwp; UI server açıkken), `@vitest/mocker`, `vite` 5.4.21, `vite-node`, `esbuild`, `postcss` 8.5.15/8.5.23, `browserslist`, `brace-expansion`, `js-yaml`, `baseline-browser-mapping`, `@tailwindcss/postcss`. Prod runtime'a girmiyor; geliştirici makinesi ve CI riski | `vitest` 5.x (major) planlanmalı; UI modunu açık ağda çalıştırmayın |

### INFO

| ID | Not |
|---|---|
| SEC-30 | React RSC DoS **CVE-2026-23869** (GHSA-479c-33wc-g2pg; 19.2.0–19.2.4 etkilenir, 19.2.5 yamalı). `package.json` react 19.2.4, ancak App Router RSC, Next'in vendored kopyasını kullanıyor: `next/dist/compiled/react` = `19.3.0-canary-cbb046ab-20260731` (Nisan yamasından sonra). **Pratikte yamalı**; yine de `react`/`react-dom` 19.2.5+ önerilir |
| SEC-31 | Next Temmuz 2026 (CVE-2026-64641…64649) → 16.3.0+ yamalı. Ağustos 2026 (GHSA-2xp9-vwfh-vxw4 AVIF RCE, CVE-2026-75604 Windows RCE) → 16.3.3+ yamalı; ayrıca `images.formats` tanımsız (AVIF kapalı) ve sunucu Linux. CVE-2026-64642 (tek locale i18n + Turbopack middleware bypass) → `i18n` config yok |
| SEC-32 | `.env.example` git'te **takip edilmiyor** (`.gitignore:34 .env*`). İçinde `AUTH_JWT_SECRET` (43 karakter) ve `TOTP_ENCRYPTION_SECRET` (53 karakter) dolu; "örnek" anahtar kelimeleri içeriyor, `.env.local` değeriyle **aynı değil**. Öneri: `!.env.example` ile commit'leyin, secret alanlarını boş bırakın |
| SEC-33 | `.env.local` `DATABASE_URL` host sınıfı: `aws-N-eu-west-N.pooler.supabase.com` (dev). `LEGACY_PROVIDER_PURGE_REPORT.md` §7.2 ile tutarlı. **Prod `DATABASE_URL` hedefi DOĞRULANAMADI — server/infrastructure erişimi gerekiyor** |
| SEC-34 | `date-fns` 3.6.0 (app) + 4.4.0 (react-datepicker nested): güvenlik değil, bakım/bundle notu |
| SEC-35 | `db/migrations/070_reservation_share_links.sql:49` `is_active_admin()` → `auth.uid()`: vanilla PG'de hata verir, uygulamadan çağrılmıyor |
| SEC-36 | Pozitif kontroller: §5 |

---

## 5. Mevcut Güçlü Kontroller (Pozitif Bulgular)

| Alan | Kontrol | Kanıt |
|---|---|---|
| Şifre saklama | Argon2id (+ bcrypt legacy → rehash) | `lib/auth/native/password.ts:35-39`, `login.service.ts` `needsRehash` |
| Kullanıcı tespiti | Olmayan kullanıcıda dummy verify (timing parity), generic mesaj | `login.service.ts:77-80` |
| JWT | HS256 sabit, `typ` ve `kid` kontrolü, secret en az 32 karakter | `lib/auth/native/jwt.ts:46-113`; test `jwt-access-typ.test.ts` |
| Cookie | `__Host-` öneki, HttpOnly, Secure, access `Lax` / refresh `Strict` | `lib/auth/native/cookies.ts:29-31,62-78` |
| 2FA | TOTP secret şifreli (`TOTP_ENCRYPTION_SECRET`), hesap bazlı kilit + IP limiti, recovery kodları Argon2id | `totp-verify.service.ts:152`, `077_admin_totp.sql:89` |
| CSRF | Auth uçlarında origin guard; admin API'lerde `SameSite=Lax` cookie | `lib/auth/native/origin-guard.ts:21` |
| Cron | `CRON_SECRET` yoksa fail-closed (503) | `lib/cron-auth.ts:33-42` |
| SQL | Parametreli değerler, `quoteIdent` identifier whitelist'i; ham SQL birleştirme yok | `lib/db/query-compiler.ts:130-146,375` |
| Çift rezervasyon | DB `EXCLUDE` kısıtı + harici takvim overlap trigger'ı + status `CHECK` | migration `030`, `031`, `052` |
| Fiyat | Public rezervasyonda sunucu tarafında fiyat, indirim ve havuz ısıtma yeniden hesabı ve client değerlerinin ezilmesi | `app/api/public/reservations/route.ts:114-171` |
| Rezervasyon sorgulama | Kod + e-posta birlikte, generic not-found, 10/10 dk | `app/api/public/reservation-lookup/route.ts` |
| Form spam | İletişim ve teklif: honeypot + time-trap + 5/10 dk | `app/api/public/contact/route.ts:14-54` |
| Zengin metin | `sanitize-html` sıkı allowlist (svg/iframe/script yok, şema `http/https/mailto`) | `lib/html-sanitize.ts:14-51` |
| SSRF | Harici takvim ve geocode için guard (özel IP blokları) | `lib/security/ssrf*.ts` |
| Open redirect | Middleware `?redirect=` ekliyor ama login sayfası bu parametreyi **kullanmıyor** (sabit `/maki-admin`) | `login/page.tsx:105,169` |
| CORS | Hiçbir route `Access-Control-Allow-*` set etmiyor → tarayıcı varsayılanı same-origin | grep |
| Secret'lar | Tüm secret modülleri `import "server-only"`. `NEXT_PUBLIC_*` yalnızca site ve CDN URL'leri | §8 |
| `.env` | `.env*` gitignore'da; git geçmişinde `.env` dosyası **hiç** yok | git taraması |

---

## 6. 27 Alan — Özet Değerlendirme

| # | Alan | Durum | İlgili bulgular |
|---|---|---|---|
| 1 | Authentication | Kriptografi sağlam; middleware kapısı kusurlu | SEC-01, SEC-13, SEC-20 |
| 2 | Authorization / IDOR | **Zayıf**: izin modeli API'de yok; public uçlarda IDOR yok (lookup kod+e-posta, share token, zip token) | SEC-03, SEC-01 |
| 3 | API matrisi | 80 route; §7 | SEC-03, SEC-09 |
| 4 | SQL / PostgreSQL | Injection riski düşük; savunma katmanı (rol/RLS/TLS doğrulama) zayıf | SEC-14, SEC-35 |
| 5 | Rezervasyon güvenliği | Fiyat server-authoritative; alan allowlist'i ve envanter koruması eksik | SEC-06, SEC-07, SEC-16 |
| 6 | Rate limiting | Kapsam iyi (21 route); IP kaynağı ve fail-open zayıf; login ve server action'lar dışarıda | SEC-09, SEC-13, SEC-24, SEC-28 |
| 7 | Turnstile/reCAPTCHA | Hiçbir formda yok; form bazlı karar §8 | SEC-07 |
| 8 | CSRF | Auth uçları origin guard'lı; admin API'ler SameSite'a dayanıyor (same-site subdomain riski) | SEC-10 |
| 9 | XSS | Kullanıcı girdisi React ile escape ediliyor + sanitize-html; **admin girdisi ham** | SEC-05, SEC-21 |
| 10 | SSR / Next.js | Server-only ayrımı iyi; admin RSC sayfalarında auth yok | SEC-01, SEC-12, SEC-17 |
| 11 | Env / secrets | Adlar §9; DB'de secret (`resend_api_key`) admin API'den okunabiliyor | SEC-04, SEC-32, SEC-33 |
| 12 | R2 / storage | Bucket allowlist var; path/type/boyut yok | SEC-10 |
| 13 | Upload | Aynı | SEC-10 |
| 14 | Security headers | Yok | SEC-08 |
| 15 | CORS | Varsayılan same-origin (OK) | — |
| 16 | SSRF | Takvim/geocode guard'lı (TOCTOU); zip guard'sız | SEC-11, SEC-15 |
| 17 | Open redirect | Bulunamadı | — |
| 18 | Error disclosure | DB mesajları dönüyor; health sürüm bilgisi veriyor | SEC-18, SEC-19 |
| 19 | Dependencies | §10 | SEC-17, SEC-25, SEC-26, SEC-29–31 |
| 20 | Admin panel | Kritik bulguların çoğu burada | SEC-01–05, SEC-10 |
| 21 | Business logic | Takvim kilitleme, `paid_amount`, mail kötüye kullanımı | SEC-06, SEC-07, SEC-16 |
| 22 | Enum/status manipülasyonu | Public create `status:"pending"` sabit ✓; `payment_preference` normalize ✓; DB `CHECK` (052) ✓. Admin tarafında izin yok (SEC-03) | — |
| 23 | Logging | Activity log + mail log mevcut, şifre loglanmıyor. **Başarısız login/yetkisiz erişim denemeleri için merkezi alarm yok**; XFF log'lara ham yazılıyor | öneri §14 (2.10) |
| 24 | Infrastructure | Coolify/Hetzner/Traefik/Cloudflare ayarları **DOĞRULANAMADI** | §13 |
| 25 | Mevcut güvenlik testleri | §12 | — |
| 26 | Saldırı yüzeyi haritası | §2 | — |
| 27 | Final rapor | Bu belge | — |

---

## 7. API Güvenlik Matrisi

Açıklama:
- **Admin** = `authorizeAdminCaller`/`authorizeAdminSession` (yalnızca aktif admin, **izin kontrolü yok**).
- **RL** = `applyRateLimit`.
- **Origin** = origin guard.

| Route | Metot | Auth | İzin | RL | Origin | Not |
|---|---|---|---|---|---|---|
| `admin-users` | GET | Admin | ✗ | ✗ | ✗ | Admin listesi |
| `admin-users/[id]` | PATCH, DELETE | Admin | ✗ | ✗ | ✗ | **SEC-02, SEC-03** |
| `admin/create-user` | POST | Admin | ✗ | ✗ | ✗ | **SEC-03** |
| `admin/2fa/enroll/start`, `enroll/confirm` | POST | Session | – (kendisi) | ✗ | ✗ | OK |
| `admin/2fa/disable`, `recovery-codes/regenerate` | POST | Session | – (kendisi) | ✓ | ✗ | OK |
| `admin/2fa/reset` | POST | Session | ✗ | ✗ | ✗ | Başkasının 2FA'sı: **SEC-03** |
| `admin/settings` | GET, PUT | Admin | ✗ | ✗ | ✗ | **SEC-04, SEC-05** |
| `admin/storage/upload`, `remove` | POST | Admin | ✗ | ✗ | ✗ | **SEC-10** |
| `admin/villa-zip`, `[id]/revoke` | GET, POST | Admin | ✗ | ✗ | ✗ | SEC-11 zinciri |
| `admin/villas/**` (full, active, clone, hard-delete, soft-delete, restore, private-token, prices, sort-orders) | GET/POST/PUT/PATCH | Admin | ✗ | ✗ | ✗ | SEC-03; `hard-delete` geri dönüşsüz |
| `admin/reservations/**` (+ share-link) | GET/POST/PATCH/DELETE | Admin | ✗ | ✗ | ✗ | SEC-03 |
| `admin/manual-reservations/**` | GET | Admin | ✗ | ✗ | ✗ | |
| `admin/blog/**`, `pages/**`, `menu`, `villa-locations`, `taxonomies` | CRUD | Admin | ✗ | ✗ | ✗ | SEC-03 |
| `admin/activity-logs/{list,log,cleanup}`, `mail-logs/{stats,cleanup}` | GET/POST | Admin | ✗ | ✗ | ✗ | Log silme (cleanup) herkese açık → iz silme riski |
| `admin/exchange-rates/{current,refresh}` | GET/POST | Admin | ✗ | ✗ | ✗ | |
| `admin/external-calendars/**` | POST | Admin | ✗ | ✗ | ✗ | SSRF guard'lı sync |
| `mail/{voucher,payment-link,payment-confirmed,reservation-approved,reservation-cancelled,bank-transfer-payment,western-union-payment,test}` | POST | Admin | ✗ | ✓ | ✗ | |
| `mail/reservation-request` | POST | **PUBLIC** | – | ✓ (5/dk) | ✗ | SEC-16 |
| `voucher/[id]` | GET | AdminFlex (`?token`) | ✗ | ✗ | ✗ | SEC-20 |
| `auth/login` | POST | – | – | **✗** | ✓ | SEC-13 |
| `auth/2fa/verify` | POST | pending token | – | ✓ | ✓ | OK |
| `auth/logout` | POST | cookie | – | ✗ | ✓ | OK |
| `auth/refresh` | POST | refresh cookie (Strict) | – | ✗ | ✗ | Strict cookie → CSRF düşük |
| `auth/me` | GET | cookie | – | ✗ | ✗ | |
| `cron/*` (7) | GET | Bearer `CRON_SECRET` | – | ✗ | ✗ | Fail-closed ✓; SEC-23 |
| `public/reservations` | POST | – | – | ✓ (3/10dk) | ✗ | SEC-06, SEC-07 |
| `public/reservation-lookup` | POST | kod + e-posta | – | ✓ (10/10dk) | ✗ | OK |
| `public/contact`, `public/offer-requests` | POST | – | – | ✓ (5/10dk) | ✗ | honeypot + time-trap |
| `public/villas/[id]/availability`, `blocked-ranges` | GET | – | – | ✓ (30/dk) | ✗ | |
| `public/payment-methods`, `public/taxonomies` | GET | – | – | ✗ | ✗ | Salt okunur public veri |
| `exchange-rates` | GET | – | – | ✓ | ✗ | SEC-18 |
| `geocode` | GET | – | – | ✓ (20/dk) | ✗ | Dış servis proxy'si, kota tüketimi |
| `health` | GET | – | – | ✗ | ✗ | SEC-19 |
| `villa-zip/[token]` | GET | token | – | ✓ (10/dk) | ✗ | SEC-11 |

**Public server action'lar** (auth yok, RL yok): `searchVillas` (SEC-12), `createVillaReviewAction` (SEC-28), `createSharedFavoritesListAction` (SEC-24). Admin server action'lar (`*.action.ts`, 13 dosya) → `requirePermission` ✓ (`server-action-authz.test.ts`).

---

## 8. Turnstile / reCAPTCHA — Form Bazlı Analiz

**Mevcut durum:** Kod tabanında **hiçbir** CAPTCHA entegrasyonu yok (`turnstile|recaptcha|hcaptcha` → 0 eşleşme). Şifre sıfırlama ve bülten formu **yok**.

**Karar ölçütleri:**
1. Form DB'ye kalıcı/iş etkili veri yazıyor mu, ya da dışarıya mail gönderiyor mu?
2. Kötüye kullanımın maliyeti ne (envanter, mail itibarı, admin zamanı)?
3. Mevcut koruma ne (rate limit, honeypot, moderasyon, gerekli sır)?
4. Dönüşüm maliyeti (misafir sürtünmesi).

| Form / Uç | Yazdığı / tetiklediği | Mevcut koruma | Karar | Gerekçe |
|---|---|---|---|---|
| **Rezervasyon formu** (`ReservationForm` → `POST /api/public/reservations` + `mail/reservation-request`) | `reservations` (pending, **takvimi bloklar**), müşteri ve admin maili | RL 3/10 dk (XFF zayıf), sunucu fiyat hesabı | **Gerekli** | Anonim tek istek envanteri kilitleyebiliyor (SEC-07) ve 3. kişiye mail gönderiyor (SEC-16). En yüksek iş etkisi. Görünmez/managed mod ile sürtünme minimal |
| **Admin login** (`/api/auth/login`) | Hesap kilidi sayacı | Origin guard, hesap kilidi, timing parity, 2FA | **Koşullu** | Önce IP rate limit (SEC-13). CAPTCHA yalnızca N başarısız denemeden sonra (ör. 3) ya da şüpheli IP'de. 2FA zaten ikinci faktör; her girişte CAPTCHA gereksiz sürtünme |
| **Teklif isteme** (`OfferRequestForm` → `/api/public/offer-requests`) | `offer_requests` + admin maili | RL 5/10 dk + honeypot + time-trap | **Rate limit yeterli olabilir** | Envanteri etkilemiyor; honeypot ve time-trap basit botları eliyor. Spam gözlenirse Turnstile eklenir (log'dan ölçün) |
| **İletişim** (`ContactForm` → `/api/public/contact`) | Mesaj + admin maili | RL 5/10 dk + honeypot + time-trap | **Rate limit yeterli olabilir** | Aynı gerekçe |
| **Yorum** (`createVillaReviewAction`) | `villa_reviews` (moderasyon bekler) | Uzunluk/puan doğrulaması, moderasyon; **RL yok** | **Şimdilik gerekli değil**, RL eklenmeli | Moderasyon public etkiyi engelliyor; asıl eksik rate limit. Moderasyon kuyruğu dolarsa Koşullu |
| **Paylaşılan favori listesi** (`createSharedFavoritesListAction`) | Paylaşım satırı | Yok | **Şimdilik gerekli değil**, RL + boyut limiti | Düşük değerli veri; CAPTCHA orantısız |
| **Rezervasyon sorgulama** (`/api/public/reservation-lookup`) | Okuma | Kod + e-posta birlikte, RL 10/10 dk, generic yanıt | **Rate limit yeterli** | Brute force alanı (kod × e-posta) çok büyük |
| **Villa arama** (`searchVillas`) | Okuma | Yok | **Gerekli değil**, RL + limit tavanı | CAPTCHA arama UX'ini bozar; sorun limit ve oracle (SEC-12) |
| **Müsaitlik / fiyat** (public GET) | Okuma | RL 30/dk | **Gerekli değil** | |

### Turnstile ve reCAPTCHA — teknik karşılaştırma

| Kriter | Cloudflare Turnstile | Google reCAPTCHA v3 / v2 |
|---|---|---|
| Kullanıcı deneyimi | Managed/invisible; çoğunlukla etkileşimsiz, görsel bulmaca yok | v3 görünmez skor; v2 checkbox/görsel bulmaca |
| Karar modeli | Sunucu `siteverify` → `success` (ikili) + `action`/`cdata` | v3: 0.0–1.0 **skor**, eşik ayarı sizde (yanlış pozitif ve negatif yönetimi gerekir) |
| Gizlilik / KVKK-GDPR | Reklam amaçlı izleme yapmadığını beyan ediyor; üçüncü taraf çerez yok | Google hesabı/çerez sinyalleri kullanır; çerez rızası ve aydınlatma metni gerekebilir |
| Maliyet | Ücretsiz katman geniş | reCAPTCHA artık Google Cloud projesine bağlı; ücretsiz kota sınırlı, üstü ücretli (güncel fiyat **doğrulanmalı**) |
| Altyapı bağımlılığı | Cloudflare DNS/proxy **gerekmez** | Google |
| Entegrasyon | `<script src=challenges.cloudflare.com/turnstile/v0/api.js>` + `POST /siteverify` (secret server-only) | `recaptcha/api.js` + `siteverify` / Enterprise `assessments` |
| CSP etkisi | `script-src`/`frame-src challenges.cloudflare.com` | `www.google.com`, `www.gstatic.com`, `www.recaptcha.net` |
| Token | Tek kullanımlık, ~300 sn | v3 token ~2 dk |

**Teknik öneri:**
- Bu proje için **Turnstile daha uygun**: ikili karar (eşik ayarı yok), KVKK açısından daha hafif, Türk misafir kitlesinde görsel bulmaca sürtünmesi yok, maliyet öngörülebilir.
- CDN zaten Cloudflare R2 üzerinde, ama bu bir gereklilik değil.
- **reCAPTCHA v3 şu durumda mantıklı olur:** skor tabanlı kademeli kararlar isteniyorsa (ör. düşük skorda rezervasyonu "manuel inceleme" kuyruğuna alma) ve Google Cloud zaten kullanılıyorsa.
- **Her iki durumda da sunucu tarafında doğrulama zorunlu:**
  - `siteverify`, `hostname`/`action` kontrolü, token tekrar kullanımının reddi.
  - Doğrulama servisi erişilemezse public rezervasyonda **fail-closed** (ya da manuel inceleme).
- CAPTCHA, SEC-07'nin **tek** çözümü değildir. Pending TTL, max-stay ve kişi başı pending limiti asıl kontrollerdir.

---

## 9. Ortam Değişkenleri ve Secret Durumu (yalnızca ADLAR)

Kaynak: kodda `process.env.*` kullanımları, cihazdaki `.env.local` ve `.env.example` (yalnızca `cut -d= -f1`; değerler okunmadı veya yazdırılmadı; yalnızca boş/dolu ve uzunluk sınıfı).

| Değişken | Kullanım yeri | Gizlilik | `.env.local` | `.env.example` | Durum |
|---|---|---|---|---|---|
| `DATABASE_URL` | `lib/db/pg.client.ts` (server-only) | **Secret** | var | boş | server-only ✓; dev host legacy pooler (SEC-33) |
| `PGSSLMODE` | pg.client | config | `require` | dolu | SEC-14 (`verify-full` önerilir) |
| `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECT_TIMEOUT_MS` | pg.client | config | var | dolu | OK |
| `AUTH_JWT_SECRET` | `lib/auth/native/jwt.ts` (server-only, en az 32) | **Secret** | var (≥32) | dolu örnek (local'den farklı) | server-only ✓; SEC-32 |
| `AUTH_JWT_KID`, `AUTH_ACCESS_TTL`, `AUTH_REFRESH_TTL`, `AUTH_COOKIE_SECURE`, `AUTH_LOGIN_MAX_ATTEMPTS`, `AUTH_LOGIN_LOCK_MINUTES` | auth | config | var | dolu | `AUTH_COOKIE_SECURE=true` ✓ |
| `TOTP_ENCRYPTION_SECRET` | `lib/auth/native/totp.ts` (server-only) | **Secret** | **yok** | dolu örnek | server-only ✓; prod'da tanımlı mı DOĞRULANAMADI |
| `AUTH_TOTP_PENDING_TTL`, `AUTH_TOTP_MAX_ATTEMPTS`, `AUTH_TOTP_LOCK_MINUTES` | totp | config | yok | dolu | Varsayılanlar kodda |
| `S3_ENDPOINT`, `S3_REGION` | `lib/storage/s3-storage.provider.ts` (server-only) | config | yok | **yok** | `.env.example`'da eksik |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | aynı | **Secret** | yok | **yok** | server-only ✓; `.env.example`'da eksik. R2 token kapsamının (tek bucket, gerekli izinler) **DOĞRULANAMADI** |
| `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_FROM_NAME` | `app/lib/mail/client.ts` (`server-only` direktifi yok ama server repository import ediyor) | **Secret** | yok | boş | Ayrıca DB `settings.resend_api_key` (SEC-04) |
| `MAIL_ADMIN_NOTIFY_TO` | mail route'ları | config | yok | **yok** | `.env.example`'da eksik |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `lib/rate-limit.ts` (server-only) | **Secret** | **yok** | boş | Prod'da yoksa RL kapalı (SEC-09) |
| `CRON_SECRET` | `lib/cron-auth.ts` (server-only) | **Secret** | yok | boş | Fail-closed ✓ |
| `NEXT_PUBLIC_SITE_URL` | 8 yer | Public | var | dolu | OK |
| `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS`, `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES` | next.config + helpers | Public | var | **yok** | Public URL, secret değil. Site ile same-site durumu SEC-10 |
| `NEXT_PUBLIC_VERCEL_URL` | 6 yer | Public | yok | yok | Legacy (Vercel), Coolify'da tanımsız → fallback. Temizlik önerisi |

**Sonuç:**
- `NEXT_PUBLIC_` önekli **secret yok** ✓.
- Tüm secret okuyan modüller server-only ✓.
- `.env.example` eksik (S3_*, MAIL_ADMIN_NOTIFY_TO, CDN) ve dolu örnek secret içeriyor (SEC-32).

---

## 10. Bağımlılık Güvenliği

`npm audit --package-lock-only`: **44 zafiyet** (critical 1, high 7, moderate 36). Toplam 865 paket (prod 300 / dev 511). **Güncelleme yapılmadı.**

| Paket | Kurulu | Advisory | Prod etkisi | Değerlendirme | Hedef sürüm |
|---|---|---|---|---|---|
| `next` | 16.3.5 | Tem. 2026 (9 CVE) ✓ yamalı · Ağu. 2026 AVIF/Windows RCE ✓ yamalı · **22 Eyl. GHSA-vcvr-r3jv-pc5j** (`next/og` `ImageResponse` RCE, `>=16.2.0 <16.3.6`) · **30 Eyl. planlı** (1 critical, 2 high) | `next/og` kullanılmıyor → 22 Eyl. doğrudan etkisiz; 30 Eyl. bilinmiyor | **MEDIUM** (SEC-17) | 16.3.6 → 16.3.7 (30.09) |
| `react`, `react-dom` | 19.2.4 | CVE-2026-23869 RSC DoS (19.2.5'te yamalı) | App Router, Next'in vendored React'ini (19.3.0-canary 2026-07-31) kullanıyor | INFO (SEC-30) | 19.2.5+ |
| `@tiptap/*` | 3.27.1 | GHSA-cp6q-959q-f8rh, GHSA-j95f-988m-3j2f | Yalnızca admin editörü | LOW (SEC-25) | ≥ 3.30.4 |
| `sanitize-html` | 2.17.5 | GHSA-g8qq-57p8-ggw5, GHSA-jxwj-j7wr-gfrw | Allowlist'te svg/textarea yok | LOW (SEC-25) | ≥ 2.17.7 |
| `fast-xml-parser` | 5.9.3 | GHSA-8r6m-32jq-jx6q | Yalnızca TCMB XML | LOW (SEC-26) | ≥ 5.10.1 |
| `postcss` | 8.5.15 / 8.5.23 (next nested) | GHSA-fxqj-rqcc-2cmp vb. (sourceMappingURL) | Build zamanı | LOW (SEC-29) | ≥ 8.5.24 |
| `vitest` / `vite` / `vite-node` / `@vitest/mocker` / `esbuild` | 2.1.9 / 5.4.21 / … | GHSA-5xrq-8626-4rwp (critical, UI server), GHSA-82fw-gwwq-j7x9, GHSA-4w7w-66w2-5vf9, GHSA-67mh-4wv8-2f99 | **Dev-only** | LOW (SEC-29) | vitest 5.x (major) |
| `browserslist`, `brace-expansion`, `js-yaml`, `baseline-browser-mapping`, `@tailwindcss/postcss` | transitive | DoS/ReDoS | Build/lint | LOW | `npm audit fix` (non-breaking) |
| `jose` | 5.10.0 | Bilinen açık advisory yok (npm audit temiz) | — | OK | — |
| `pg` | 8.22.0 | npm audit temiz | — | OK | — |
| `@aws-sdk/client-s3` | 3.1075.0 | npm audit temiz | — | OK | — |
| `archiver` | 7.0.1 | npm audit temiz | — | OK | — |
| `leaflet` / `react-leaflet` | 1.9.4 / 5.0.0 | npm audit temiz | — | OK | — |
| `country-state-city` | 3.2.1 | npm audit temiz | — | OK (statik veri) | — |
| `react-datepicker` + `date-fns` | 9.1.0 + 3.6.0/4.4.0 | npm audit temiz | — | INFO (SEC-34, çift kopya) | — |
| `otplib`, `@node-rs/argon2`, `bcryptjs`, `qrcode`, `@upstash/*` | — | npm audit temiz | — | OK | — |

> Not: "npm audit temiz", npm advisory veritabanında eşleşme olmadığı anlamına gelir; sıfır risk garantisi değildir.

---

## 11. Git Geçmişi Secret Taraması

- **Kapsam:** 452 commit, `git log --all -p` (cihazda, `GIT_OPTIONAL_LOCKS=0`, salt okunur). **Değerler yazdırılmadı**; yalnızca commit, dosya ve tip.
- **Aranan kalıplar:**
  - Parolalı Postgres URI
  - `PGPASSWORD=`, `POSTGRES_PASSWORD=`, `?password=`
  - AWS `AKIA…`, Resend `re_…`, `sk_live_`
  - Private key blokları, `eyJ…` JWT
  - `service_role`
  - `*_KEY|SECRET|TOKEN|PASSWORD|DSN = <16+ karakter>`
  - Sentry DSN

| Bulgu | Commit | Dosya | Tip | Değerlendirme |
|---|---|---|---|---|
| Parolalı PG URI kalıbı | `f2a199a` | `lib/db/pg.client.ts` (yorum) | Placeholder (`user:pass@host`, 4 karakter) | **Yanlış pozitif** |
| `supabase/.temp/*` | `bfab0dd` (ilk commit) | `project-ref`, `pooler-url`, `linked-project.json`, sürüm dosyaları | Proje kimliği + **parolasız** pooler URL | LOW (SEC-27); `3789af2`'de kaldırıldı |
| `*_KEY=` kalıpları | `1939b3c`, `3b4e11e`, `bfab0dd` | `BADGE_SOUND_BASELINE_KEY`, `ADMIN_LOCALE_STORAGE_KEY`, `LOOP_MARKER_KEY` | localStorage/marker sabitleri | Yanlış pozitif |
| `.env*` dosyası | — | — | Hiçbir commit'te yok | ✓ |
| Sentry DSN, JWT, AWS/Resend anahtarı, private key | — | — | Bulunamadı | ✓ |

**§7.1 iddiası** ("Git geçmişi bir eski PostgreSQL credential'ı içeriyor"): bu taramada **doğrulanamadı**. Credential farklı bir biçimde (ör. ayrı `password` alanı, base64, farklı ad) olabilir. **Öneri:** `gitleaks detect --log-opts="--all" --redact` ya da `trufflehog git file://. --only-verified` ile tam entropi taraması yapın. İddia doğru kabul edilerek legacy DB parolası **rotate edilmeli** (proje hâlâ aktifse).

Remote: `github.com/makidijital/tatilin-yeri-next` (public/private durumu DOĞRULANAMADI; public ise SEC-27'nin önemi artar).

---

## 12. Mevcut Güvenlik Testleri

- Toplam 185 test dosyası (vitest).
- Güvenlikle ilgili olanlar:
  - `tests/unit/auth/jwt-access-typ.test.ts`: access/refresh `typ` karışıklığı ✓
  - `tests/unit/auth/login-totp-gate.test.ts`: 2FA kapısı ✓
  - `tests/unit/auth/totp.test.ts`, `totp-admin-rate-limit.test.ts` ✓
  - `tests/unit/server-action-authz.test.ts`: admin server action'larda `requirePermission` ✓
  - `tests/unit/reservation-service/price-verify.*.test.ts`: sunucu fiyatı ve indirim snapshot'ı ✓
  - `villa-discounts-cleanup-cron.test.ts`: cron akışı

**Eksik testler (öncelik sırasıyla):**
1. Admin **page** erişimi: auth'suz / sahte `__Host-admin_rt` ile `/maki-admin/*` → veri yok (SEC-01).
2. Admin **API route** authz matrisi: izinsiz admin → 403 (SEC-03).
3. `admin-users` PATCH → `password_hash` yazılıyor, `password` yazılmıyor (SEC-02).
4. Public reservation allowlist: `paid_amount`/`damage_deposit`/`status` enjeksiyonu yok sayılıyor (SEC-06).
5. Settings GET secret içermiyor, PUT whitelist dışı kolonu reddediyor (SEC-04).
6. `gtmId` / `map_embed` doğrulaması (SEC-05).
7. SSRF: zip ve takvim için iç IP, IPv6-mapped, redirect ve rebinding (SEC-11, SEC-15).
8. Rate limit IP çözümleme (sahte XFF) ve prod'da fail-closed boot (SEC-09).
9. Upload MIME/boyut/path (SEC-10).
10. Güvenlik başlıkları snapshot'ı (SEC-08).

---

## 13. DOĞRULANAMAYAN Maddeler

| Madde | Neden | Nasıl doğrulanır |
|---|---|---|
| Prod'da güvenlik başlıkları (Traefik/Cloudflare) | **DOĞRULANAMADI — server/infrastructure erişimi gerekiyor** | `curl -sI https://<domain>/` ve `/maki-admin/login` |
| Traefik XFF güveni / Cloudflare önünde mi | Aynı | Coolify proxy config; `forwardedHeaders.trustedIPs` |
| Prod'da Upstash env tanımlı mı | Aynı | Coolify env ekranı (yalnız varlık) |
| `admin_users.password` kolonu | DB şema erişimi gerekiyor | §4 SEC-02 sorgusu |
| Prod `DATABASE_URL` hedefi, DB TLS, `pg_hba`, rol yetkileri | Aynı | Coolify env + `\du`, `SHOW ssl` |
| R2 API token kapsamı, bucket public erişim ve CORS politikası | Cloudflare hesabı gerekiyor | R2 dashboard |
| Hetzner firewall, SSH erişimi, Postgres portunun dışa açıklığı | Sunucu erişimi | `hcloud firewall describe`, `ss -tlnp` |
| Coolify panelinin erişimi ve 2FA | Aynı | Coolify ayarları |
| Yedekleme ve şifreleme politikası | Aynı | Coolify/Hetzner backup |
| GitHub repo görünürlüğü, branch protection, secret scanning | GitHub erişimi | Repo ayarları |
| SEC-07 blok davranışının canlı teyidi | Canlı test yasak | Staging'de iki sahte pending rezervasyon |
| `paid_amount`'u okuyan admin ekranları (SEC-06 etkisi) | Kapsamlı UI izi gerekiyor | Grep + staging |

---

## 14. Düzeltme Planı (öncelik sıralı; bu aşamada HİÇBİRİ uygulanmadı)

### Faz 0 — Acil (0–3 gün)

| # | İş | Bulgu | Efor | Not |
|---|---|---|---|---|
| 0.1 | Admin grubuna **server layout gate** + her server `page.tsx`'e `requirePermission` | SEC-01 | S | Mevcut client layout'u alt bileşene taşıyın |
| 0.2 | Middleware: yalnızca refresh cookie varsa `next()` yerine refresh akışına yönlendirme | SEC-01 | S | |
| 0.3 | `admin-users/[id]` PATCH → Argon2id `password_hash`; refresh token'ları iptal; `password` kolonunu DB'de kontrol | SEC-02 | S | Önce §13'teki şema sorgusu |
| 0.4 | `gtmId` regex doğrulaması (kayıt + render) | SEC-05 | XS | |
| 0.5 | Settings GET'ten `resend_api_key`'i çıkarma; PUT'a kolon whitelist'i | SEC-04 | S | |
| 0.6 | Next.js 16.3.7 advisory'lerini (30.09) değerlendirme ve yükseltme | SEC-17 | S | Ayrı aşamada |
| 0.7 | Prod'da Upstash env'lerinin varlığını ve proxy XFF davranışını kontrol | SEC-09 | XS | Infra |

### Faz 1 — Kısa vade (1–2 hafta)

| # | İş | Bulgu |
|---|---|---|
| 1.1 | Tüm `app/api/admin/**` + `admin-users/**` + admin `mail/*` route'larına `requirePermission`; "süper-admin" izni (kullanıcı yönetimi, 2FA reset, settings, log cleanup) | SEC-03 |
| 1.2 | Public rezervasyon **field allowlist**; `paid_amount`/`damage_deposit` sunucuda; `guests` ≤ kapasite; uzunluk limitleri; recompute hatasında fail-closed | SEC-06 |
| 1.3 | Pending rezervasyon **TTL** + max-stay + kişi başı eşzamanlı pending limiti | SEC-07 |
| 1.4 | Rezervasyon formuna **Turnstile** (sunucu `siteverify`, fail-closed) | SEC-07, SEC-16 |
| 1.5 | Rezervasyon talep mailini sunucu tarafında tek sefer gönderme; public mail endpoint'ini kaldırma veya idempotent yapma | SEC-16 |
| 1.6 | `map_embed` → yalnızca Google Maps embed URL'si | SEC-05 |
| 1.7 | Güvenilir IP çözümleme; prod'da Upstash yoksa fail-closed boot; login'e IP + e-posta limiti; generic kilit mesajı | SEC-09, SEC-13 |
| 1.8 | `searchVillas`: `real_title_search` çıkarma, `limit` tavanı | SEC-12 |
| 1.9 | Upload: sunucu tarafından üretilen path, MIME allowlist + magic-byte, boyut limiti; remove yalnızca kayıtlı key'ler | SEC-10 |
| 1.10 | villa-zip: yalnızca R2 `GetObject` / CDN host allowlist'i | SEC-11 |
| 1.11 | Güvenlik başlıkları (HSTS, nosniff, Referrer-Policy, Permissions-Policy, admin `frame-ancestors 'none'`) | SEC-08 |

### Faz 2 — Orta vade (2–6 hafta)

| # | İş | Bulgu |
|---|---|---|
| 2.1 | CSP (önce Report-Only, sonra enforce; nonce'lu GTM) | SEC-05, SEC-08 |
| 2.2 | `customHead`/`analyticsScript` → yapılandırılmış alanlar (GA4/GTM/Pixel ID) | SEC-05 |
| 2.3 | SSRF guard: IP'ye bağlanan lookup, manuel redirect, kanonik IPv6 | SEC-15 |
| 2.4 | DB TLS `verify-full` (ağ yoluna göre); DEFINER fonksiyonlara `REVOKE`/`search_path` | SEC-14 |
| 2.5 | Hata mesajlarını generic yapma; `/api/health` sadeleştirme; `?token=` fallback'ini kaldırma | SEC-18–20 |
| 2.6 | Bağımlılık güncellemeleri: sanitize-html, tiptap, fast-xml-parser, `npm audit fix` (non-breaking), react 19.2.5+ | SEC-25, SEC-26, SEC-30 |
| 2.7 | §12'deki eksik güvenlik testleri | — |
| 2.8 | `gitleaks`/`trufflehog` tam tarama + legacy DB parolası rotasyonu | SEC-27 |
| 2.9 | Server action'lara RL (yorum, favori listesi) | SEC-24, SEC-28 |
| 2.10 | Güvenlik log'ları: başarısız login, 403, rate-limit ihlali → alarm | Alan 23 |

### Faz 3 — Uzun vade

- Admin paneli ayrı bir origin'e taşıma (ör. `admin.<domain>`). SEC-05 zincirini yapısal olarak kırar.
- DB rol ayrımı (public read-only / app / migration) ve kritik tablolarda RLS veya view katmanı.
- vitest 5.x major geçişi (SEC-29), `NEXT_PUBLIC_VERCEL_URL` ve `**.supabase.co` legacy temizliği (SEC-22).
- Periyodik güvenlik audit'i ve bağımlılık takibi (Dependabot/Renovate + Next güvenlik bülteni).

---

## 15. Sonuç

- **Kriptografik temel ve SQL katmanı olgun**; önceki aşamalardaki sertleştirmeler (Argon2id, 2FA, fiyatın sunucuda hesaplanması, SSRF guard, cron fail-closed, server action authz testi) açıkça görülüyor.
- En önemli açıklar **yetkilendirme sınırlarında** toplanıyor:
  - Middleware'e güvenen admin sayfaları (SEC-01).
  - API katmanında uygulanmayan izin modeli (SEC-03).
  - Admin girdisinin ham HTML olarak public sayfalara basılması (SEC-05).
- Bu üçü birlikte düşünülmeli. Faz 0 ve 1.1 tamamlanmadan panel üzerinden yetki yükseltme zinciri açık kalır.
- Public tarafta en yüksek iş riski **takvim kilitleme** (SEC-07) ve **client kontrollü finansal alanlar** (SEC-06).

---

## Kaynaklar

- [Next.js — July 2026 Security Release](https://nextjs.org/blog/july-2026-security-release)
- [Next.js — August 2026 Security Release](https://nextjs.org/blog/august-2026-security-release)
- [Next.js — Security Update, September 22 2026](https://nextjs.org/blog/nextjs-security-update-september-22-2026)
- [Next.js — Upcoming September Security Release (30.09.2026)](https://nextjs.org/blog/upcoming-nextjs-security-release-september-2026)
- [React — GHSA-479c-33wc-g2pg / CVE-2026-23869](https://github.com/react/react/security/advisories/GHSA-479c-33wc-g2pg)
- [sanitize-html — GHSA-g8qq-57p8-ggw5](https://github.com/apostrophecms/apostrophe/security/advisories/GHSA-g8qq-57p8-ggw5)
- `npm audit --package-lock-only` çıktısındaki GitHub Advisory bağlantıları (GHSA-cp6q-959q-f8rh, GHSA-j95f-988m-3j2f, GHSA-8r6m-32jq-jx6q, GHSA-5xrq-8626-4rwp, GHSA-82fw-gwwq-j7x9, GHSA-fxqj-rqcc-2cmp, GHSA-4w7w-66w2-5vf9, GHSA-67mh-4wv8-2f99, GHSA-jxwj-j7wr-gfrw)
