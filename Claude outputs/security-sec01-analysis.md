# SEC-01 Admin Authentication Analysis

- **Kapsam:** Admin authentication/session katmanının salt okunur kaynak kodu ve veri akışı analizi
- **İncelenen kod:** `a56bb78 perf(villa): lazy load booking modal` (tree `3bef8eb8…`). Analiz edilen çalışma kopyasının tree hash'i cihazdaki HEAD ile birebir aynı.
- **Tarih:** 2026-09-24
- **Yöntem:**
  - Statik kod okuma ve istek/veri akışı takibi.
  - Next.js'in pakete gömülü resmi dokümantasyonu (`node_modules/next/dist/docs`) ve `jose` kaynak kodu.
  - Canlı veya yerel HTTP isteği **gönderilmedi**, cookie forge **denenmedi**, DB'ye bağlanılmadı.
- **Değişiklik:** Proje dosyalarında hiçbir değişiklik yok. Yalnızca bu rapor dosyası oluşturuldu.

> **Kesinlik seviyeleri** (her bulguda belirtilir)
> - **KESİN:** Kod satırları okundu; davranış doğrudan koddan çıkıyor.
> - **KOD-GÜÇLÜ:** Kod + framework davranışından çıkıyor; çalışma zamanında denenmedi.
> - **DB/CONFIG GEREKİYOR:** Sonuç prod env/DB durumuna bağlı.
> - **DOĞRULANAMAZ:** Koddan çıkarılamıyor.

---

## Executive Summary

**SEC-01 doğrulandı.** Ancak önceki raporun tanımına göre **daha dar kapsamlı**, bir noktada ise **daha geniş etkili**.

1. **Middleware refresh cookie'yi doğrulamıyor** (KESİN).
   - `middleware.ts:36-38`: access cookie **yoksa** ve refresh cookie **boş olmayan herhangi bir değer** taşıyorsa `sessionOk = true`.
   - Refresh token'ın imzası/hash'i/DB kaydı middleware'de hiç kontrol edilmiyor.
   - Bu durum, özellikle **access cookie gönderilmediğinde** geçerli. Sahte access + sahte refresh birlikte gönderilirse istek login'e yönlenir (bkz. Bypass B3).
2. **54 admin sayfasının 12'si Server Component; bunların hiçbiri kendi auth kontrolünü yapmıyor** (KESİN).
   - 6 tanesi sunucu tarafında veritabanından veri çekiyor. Bunlar önceki rapordaki "6 sayfa" ile **aynı** (doğrulandı).
   - Diğer 6 server sayfa yalnızca başlık + client bileşen içeren iskeletler, veri sızdırmıyor.
3. **Tek "koruma" client-side** (`AdminSessionGuard` → `return null`), bu sunucudan veri çıkışını **engellemiyor** (KOD-GÜÇLÜ).
   - Server Component çıktısı ve client bileşenlere geçen prop'lar RSC payload'ına serialize edilir.
   - Next.js dokümantasyonu bu kalıbı açıkça "önerilmez" olarak işaretliyor.
4. **Sızan veri** (KESİN, kod akışından):
   - Dashboard: son 5 rezervasyonun misafir adı, tutarı, tarihleri, villa adı; yaklaşan giriş/çıkış listesi (misafir adı, kişi sayısı, tarihler).
   - `/maki-admin/villas` ve `/maki-admin/manual-reservations/ekle`: villa DTO'larıyla birlikte **`private_access_token`** (off-market/VIP villa sayfası `/v/[token]` erişimi), `commission_rate`, `tourism_document_number`. **Bu önceki raporda yoktu, yeni tespit.**
5. **Etkilenmeyenler** (KESİN):
   - 55 admin API route'unun tamamı, 128 admin server action'ın tamamı ve `/api/auth/*` uçları **access JWT'yi kriptografik olarak doğruluyor**. Sahte refresh cookie ile bunlara **erişilemez**.
   - Yazma, hesap ele geçirme veya yetki yükseltme bu bulgu ile mümkün değil.
6. **Yan bulgular** (KESİN):
   - Access token'daki `sid` hiçbir yerde DB'ye karşı kontrol edilmiyor: logout/revoke edilmiş oturumun access token'ı TTL bitene kadar (varsayılan 15 dk) geçerli.
   - `revokeAllForAdmin()` hiçbir yerden çağrılmıyor.
   - Kimlik çözümlemesi `sub` yerine `email` claim'i üzerinden yapılıyor.
7. **Severity:** Önceki raporun **CRITICAL** seviyesi yerine **HIGH (CVSS 3.1 ≈ 7.5: AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)** öneriyorum.
   - Gerekçe: kimlik doğrulamasız, tek başlıkla yapılabilen, KVKK kapsamındaki veri ifşası; ama salt okuma, sınırlı veri kümesi, yazma yok.
   - **Öncelik yine P0 (acil)**: `private_access_token` ifşası kalıcı etkili (token'lar rotate edilene kadar geçerli).
   - Bu, önceki rapordan **farklı** bir sonuç; gerekçesi aşağıda.

---

## Mevcut Authentication Akışı

### Bileşenler ve ilişkileri

```
TARAYICI                                   EDGE (middleware.ts)                 NODE (route/RSC/action)
────────                                   ────────────────────                 ───────────────────────
/maki-admin/login (client)
  └─ POST /api/auth/login ───────────────────────────────────────────────────► login route
       (origin guard, rate: hesap kilidi)                                       lib/auth/native/login.service.ts
                                                                                  Argon2id verify, lockout
                                                                                  ├─ totp_enabled → __Host-admin_2fa_pending (typ=totp_pending, 5 dk)
                                                                                  │     └─ POST /api/auth/2fa/verify → issueSession
                                                                                  └─ issueSession (native/session.service.ts:62)
                                                                                        admin_sessions INSERT (refresh SHA-256 hash, expires_at)
                                                                                        __Host-admin_at = JWT HS256 {sub,email,sid,perms,typ:access} 15 dk
                                                                                        __Host-admin_rt = 32 byte opaque (rotation'lı)

GET /maki-admin/** ──────────────────► middleware (edge, jose)
                                         access var → verifyAccessToken (imza+exp+typ)
                                         access yok & refresh VAR (herhangi değer) → GEÇİR  ◄── SEC-01
                                         access expired & refresh var → GEÇİR
                                         aksi → 302 /maki-admin/login
                                                   │
                                                   ▼
                                       app/(admin)/layout.tsx (server, force-dynamic, auth YOK)
                                       app/(admin)/maki-admin/layout.tsx ("use client")
                                         └─ AdminSessionGuard (client) → /api/auth/me (+ /api/auth/refresh retry)
                                              loading/admin yok → return null (yalnız GÖRSEL)
                                       page.tsx
                                         • 12 server page → HİÇBİRİ auth çağırmıyor; 6'sı DB okuyor  ◄── SEC-01
                                         • 42 client page → veri: server action / adminFetch(API)

Client adminFetch / server action ─────────────────────────────────────────► authorizeAdminCaller / authorizeAdminSession
                                                                              (lib/admin-route-auth.ts)
                                                                              readAccessCookie → verifyAccessToken (jose)
                                                                              → admin_users (auth_user_id | email) → is_active
                                                                            requirePermission / callerHasPermission
                                                                              (lib/auth/action-authz.ts) → sidebar_permissions (DB)
```

### Dosya ve abstraction haritası

| Kavram (isteğe göre) | Projedeki karşılığı | Dosya | Rol |
|---|---|---|---|
| AuthProvider | `authProvider` = `nativeAuthProvider` (client) | `lib/auth/index.ts:47`, `lib/auth/native/native-auth.provider.ts` | Client: `/api/auth/me`, `/api/auth/refresh`, signOut, `onAuthStateChange` |
| Server auth provider | `authVerifier` = `nativeAuthVerifier` | `lib/auth/server.ts:30`, `lib/auth/native/native-auth.server.ts:46-58` | Access JWT doğrulama (`verifyAccessToken`) |
| AdminGatewayProvider | **Auth bileşeni değil.** `lib/admin-gateway/*` audit-log abstraction'ı | `lib/admin-gateway/audit-admin-gateway.ts` | Yalnızca audit kaydı; oturum doğrulamaz |
| Admin session (DB) | `admin_sessions` | `db/migrations/068_native_auth.sql:54-84`, `lib/db/admin-session.repository.server.ts` | Refresh hash, `expires_at`, `revoked_at` |
| Session servis | `issueSession` / `readAccessClaims` / `refreshSession` / `revokeCurrentSession` | `lib/auth/native/session.service.ts` | Yaşam döngüsü (dosyadaki "HENÜZ WIRE EDİLMEDİ" yorumu **bayat**; aktif kullanılıyor) |
| Login | `POST /api/auth/login` → `login.service.ts` | `app/api/auth/login/route.ts` | Origin guard, Argon2id, lockout, 2FA dallanması |
| 2FA | `POST /api/auth/2fa/verify`, pending cookie | `lib/auth/native/totp-verify.service.ts`, `jwt.ts:141-220` | `typ:"totp_pending"`; access yerine geçemez (`jwt.ts:110-113`) |
| Logout | `POST /api/auth/logout` → `revokeCurrentSession` | `app/api/auth/logout/route.ts` | Origin guard; mevcut oturumu revoke + cookie temizleme |
| Refresh | `POST /api/auth/refresh` → `refreshSession` | `app/api/auth/refresh/route.ts` | DB'de hash + revoked + expires + `is_active`, rotation |
| Current admin | `GET /api/auth/me`, `getCurrentAdmin()` | `app/api/auth/me/route.ts`, `lib/admin-auth.ts` | Access JWT + `admin_users.findByIdForSession(sub)` |
| Middleware helper | `verifyAccessToken`, cookie adları | `lib/auth/native/jwt.ts`, `cookie-names.ts` | Edge-safe |
| Server-side auth helper | `authorizeAdminToken/Caller/Session/CallerFlex` | `lib/admin-route-auth.ts` | API route + server action kimlik doğrulaması |
| Permission | `requirePermission`, `callerHasPermission`, `requireAdminAction` | `lib/auth/action-authz.ts` | `sidebar_permissions` DB'den (fail-closed) |
| Client guard | `AdminSessionGuard` | `app/components/admin/AdminSessionGuard.tsx` | UX yönlendirmesi + inactivity; **güvenlik sınırı değil** |
| Re-export | `lib/auth/session.service.ts` | — | `lib/admin-auth.ts` ince re-export |

### Soruların cevapları

- **Middleware ile gerçek auth sistemi aynı doğrulamayı mı kullanıyor?**
  - Access token için **evet**: aynı `verifyAccessToken` (`middleware.ts:3,33`; `native-auth.server.ts:48`).
  - Refresh token için **hayır**: middleware yalnızca varlığa bakıyor (`middleware.ts:29,36-38`). Gerçek sistem ise hash'i DB'de arıyor, `revoked_at IS NULL` ve `expires_at > now` kontrol ediyor (`session.service.ts:117-124`, `admin-session.repository.server.ts:52-60`).
  - Server sayfaları middleware'den sonra **hiçbir doğrulama yapmıyor**.
- **İkinci bir bypass yolu var mı?**
  - Sayfa katmanı dışında bulunamadı.
  - `?token=` fallback'i (`admin-route-auth.ts:167-189`) yine access JWT'yi kriptografik olarak doğruluyor.
  - 2FA pending token `typ` kontrolü nedeniyle access yerine geçmiyor (`jwt.ts:110-113`).
  - Middleware matcher'ı `/api/**`'yi kapsamıyor. Ama API'ler kendi kontrolünü yapıyor (55/55).
- **Client-side auth ile server-side auth farklı mı?**
  - **Evet.** Client guard `/api/auth/me` üzerinden gerçek doğrulama yapıyor ama yalnızca **görüntülemeyi** engelliyor.
  - Server sayfaları hiçbir şey doğrulamıyor.
  - API/action katmanı ise tam doğrulama (access JWT + `is_active`, action'larda ayrıca izin) yapıyor.

---

## Middleware Analizi

**Dosya:** `middleware.ts` (66 satır). `proxy.ts` **yok**.
- Next 16'da `middleware` adı deprecated oldu ve `proxy` olarak yeniden adlandırıldı (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:612-627`). Edge runtime isteyenler için `middleware` hâlâ destekleniyor.
- Bu yapı **çalışıyor**; güvenlik açığı değil, INFO.

| Soru | Cevap | Kanıt | Kesinlik |
|---|---|---|---|
| Korunan path | Yalnız `/maki-admin/:path*` (`/maki-admin` dahil). `/api/**` kapsam **dışında** | `middleware.ts:60-65` | KESİN |
| Cookie nasıl okunuyor | `req.cookies.get(ACCESS_COOKIE)?.value`, `!!req.cookies.get(REFRESH_COOKIE)?.value` | `middleware.ts:28-29` | KESİN |
| Adlar | `COOKIE_SECURE` true ise `__Host-admin_at` / `__Host-admin_rt`, değilse `admin_at` / `admin_rt` (`AUTH_COOKIE_SECURE`, varsayılan true) | `lib/auth/native/cookie-names.ts:12-16` | KESİN |
| Refresh için yalnızca varlık mı? | **Evet.** Boolean'a çevriliyor, değer hiç kullanılmıyor | `middleware.ts:29,36-38` | KESİN |
| Access token doğrulanıyor mu? | Evet: jose `jwtVerify`, `algorithms:["HS256"]`, `typ==="access"`, `sub` zorunlu | `jwt.ts:92-136` | KESİN |
| Expiration | jose `exp` (jwtVerify içinde). `expired` sonucu **imza doğrulandıktan sonra** üretilir (`compactVerify` → `jwtPayload`) | `node_modules/jose/dist/node/esm/jwt/verify.js:4-9` | KESİN |
| İmza doğrulaması | HS256, `AUTH_JWT_SECRET` (en az 32 karakter). `alg` whitelist'i var, `none` reddediliyor. `kid` doğrulanmıyor (tek anahtar, INFO) | `jwt.ts:46-54,95-97,128-133` | KESİN |
| Session DB'de doğrulanıyor mu? | **Hayır.** Middleware DB'ye erişmiyor (edge) | `middleware.ts` tamamı | KESİN |
| Revoke edilmiş oturum | Middleware'de kontrol yok. Access JWT'nin `sid` claim'i **hiçbir katmanda** DB'ye karşı kontrol edilmiyor | `grep "claims.sid"` → 0 kullanım | KESİN |
| Cookie manipülasyonu | Access: imza, alg ve typ kontrolü (sağlam). Refresh: **hiçbir kontrol yok** | yukarıdaki satırlar | KESİN |

### Karar tablosu (`middleware.ts:31-39`)

| access cookie | refresh cookie | `verifyAccessToken` | `sessionOk` | Sonuç |
|---|---|---|---|---|
| yok | yok | – | false | 302 → login |
| yok | **herhangi bir değer** | – | **true** | **Sayfaya geçer** |
| geçerli | * | ok | true | Geçer |
| süresi dolmuş (imza geçerli) | var | expired | true | Geçer |
| süresi dolmuş | yok | expired | false | 302 → login |
| sahte / bozuk / yanlış imza / `alg` hatası | var veya yok | malformed / bad_signature / bad_alg | false | 302 → login |

Middleware'in üst yorumu (`middleware.ts:14-18`) varsayımı açıkça yazıyor: "Gerçek yetki … her istekte server-side `authorizeAdminCaller/Session` içinde … doğrulanır; middleware yalnızca redirect kapısıdır."
- Bu varsayım **API ve server action'lar için doğru**.
- **Server Component `page.tsx`'ler için yanlış**: bu sayfalar `authorizeAdmin*` çağırmıyor.

Next.js'in kendi dokümantasyonu da middleware/proxy'nin tek savunma hattı olmaması gerektiğini söylüyor: "it should not be your only line of defense … as close as possible to your data source" (`01-app/02-guides/authentication.md:1121`).

---

## Admin Route Matrisi

### Sayfa route'ları (54 `page.tsx`)

Açıklama:
- **MW** = middleware (A = geçerli access veya refresh cookie varlığı; bypass edilebilir: bkz. B1).
- **Kendi auth** = sunucu tarafında `authorizeAdmin*` / `requirePermission` / `requireAdminAction` çağrısı.
- **Client guard** = `AdminSessionGuard` (yalnız görsel).

#### Server Component sayfalar (12)

| Route | Server/Client | Middleware | Kendi auth | Permission | Sunucuda çekilen veri → client'a giden | Risk |
|---|---|---|---|---|---|---|
| `/maki-admin` | Server | A | **YOK** | **YOK** | `reservationServerRepository.findRecentForDashboard()` (misafir adı, `total_price`, status, tarihler, villa adı: `reservation.repository.server.ts:313-321`); `getOperationsSnapshot()` (misafir adı, kişi sayısı, giriş/çıkış: `operations.service.ts:45,150-232`); `getDailyReservationCounts(30)`. Prop olarak `UpcomingOperations`/`ReservationsChart`/`HideableSection` (client) bileşenlerine gidiyor (`page.tsx:19-38,54-60,75-100`) | **HIGH** (PII) |
| `/maki-admin/villas` | Server | A | **YOK** | **YOK** | `getVillasForAdminPage()` → `villaAdminRepository.listForAdmin` (`select *`, aktif ve pasif villalar: `villa.repository.server.ts:819-835`) → `mapVilla` (**`private_access_token`**, `commission_rate`, `tourism_document_number`, `deposit`…) → `VillaOperationsList initialVillas` (client) (`villas/page.tsx:95,167-176`). `?q=&page=&pageSize=` ile sayfalanabilir | **HIGH** (token + ticari) |
| `/maki-admin/manual-reservations/ekle` | Server | A | **YOK** | **YOK** | `getVillas()` → `listPublic()` (`select *`, aktif villalar) → `mapVilla` (**`private_access_token`**, `commission_rate`…) → `ManualReservationForm villas` (client) (`ekle/page.tsx:26,51-54`) | **MEDIUM-HIGH** |
| `/maki-admin/villas/siralama` | Server | A | **YOK** | **YOK** | `getVillasForSortOrder()` → `id, title, sort_order` (tüm villalar, pasifler dahil: `villa.repository.server.ts:917-920`) → `VillaSortPanel` | LOW |
| `/maki-admin/villa-listesi` | Server | A | **YOK** | **YOK** | Aktif villa kartları (public'e eşdeğer alanlar), lokasyon ve tipler → `VillaListesiClient` | LOW |
| `/maki-admin/settings/ceviriler` | Server | A | **YOK** | **YOK** | `getPublicSettings()` (public alanlar) + `getSettingsTranslations()` | LOW |
| `/maki-admin/activity-logs` | Server | A | YOK | YOK | Veri yok: başlık + `<ActivityLogList/>` (client → action/API) | INFO |
| `/maki-admin/blog/new` | Server | A | YOK | YOK | Veri yok | INFO |
| `/maki-admin/external-reservations` | Server | A | YOK | YOK | Veri yok | INFO |
| `/maki-admin/offer-requests` | Server | A | YOK | YOK | Veri yok | INFO |
| `/maki-admin/reviews` | Server | A | YOK | YOK | Veri yok (veri client'ta, guard'lı action ile) | INFO |
| `/maki-admin/settings` | Server | A | YOK | YOK | Yalnız `redirect("/maki-admin/settings/genel")` | INFO |

Ek olarak `settings/layout.tsx` (server) veri çekmiyor, yalnızca `SettingsNav` render ediyor.

#### Client Component sayfalar (42)

Bu sayfaların hiçbirinde sunucu tarafında veri çekimi yok. Veri, tarayıcıdan `adminFetch` (→ guard'lı API) veya server action (→ guard'lı) ile geliyor. Sahte refresh cookie ile HTML iskeleti/JS alınabilir ama veri çağrıları 401 döner.

Route'lar:
- `/maki-admin/blog`, `blog/[id]`, `discount-collection`, `faqs`, `features`, `homepage-collection`, `locations`
- `login`, `maki-finans`, `manual-reservations`, `manual-reservations/[id]`, `menu`, `menu/new`, `messages`
- `pages`, `pages/new`, `pages/[id]`, `payment-accounts`, `payment-methods`, `price-includes`, `property-owners`
- `reservations`, `reservations/[id]`, `reservations/ekle`, `rules`
- `settings/entegrasyonlar`, `settings/gelismis`, `settings/genel`, `settings/iletisim`, `settings/odeme`, `settings/rezervasyon`, `settings/seo`, `settings/sosyal-medya`
- `system-logs`, `types`, `users`
- `villas/ekle`, `villas/[id]`, `villas/[id]/galeri`, `villas/[id]/calendar`, `villas/trash`, `webmaster`

| Ortak özellik | Değer |
|---|---|
| Server/Client | Client (`"use client"`) |
| Middleware | A |
| Kendi auth | Sunucuda yok (gerek yok); veri çağrıları kendi auth'unu yapıyor |
| Permission | Action'larda var (`requirePermission`); API'lerde yok (ayrı bulgu: SEC-03) |
| Risk | INFO (SEC-01 kapsamında sızıntı yok) |

İstekte adı geçen `/admin/dashboard`, `/admin/2fa` gibi route'lar **yok**:
- Admin kökü `/maki-admin`; dashboard = `/maki-admin`.
- 2FA ayrı bir sayfa değil: `users` ekranı + `/api/admin/2fa/*` + `/api/auth/2fa/verify`.

### API route'ları

| Grup | Dosya sayısı | Middleware | Kendi auth | Permission | Sahte refresh ile erişim |
|---|---|---|---|---|---|
| `/api/admin/**` | 44 | Kapsam dışı | **44/44** `authorizeAdminCaller` / `authorizeAdminSession` (her handler, otomatik tarama) | Yok (SEC-03) | **Hayır** → 401 "Oturum bulunamadı" (`admin-route-auth.ts:143-146`) |
| `/api/admin-users/**` | 2 | Kapsam dışı | **2/2** | Yok | Hayır |
| `/api/mail/*` (admin) | 8 | Kapsam dışı | **8/8** | Yok | Hayır |
| `/api/mail/reservation-request` | 1 | Kapsam dışı | Public (bilinçli) | – | SEC-01 dışı |
| `/api/voucher/[id]` | 1 | Kapsam dışı | `authorizeAdminCallerFlex` (cookie veya `?token=` access JWT, imza doğrulanıyor) | Yok | Hayır |
| `/api/auth/me` | 1 | – | `readAccessClaims` (JWT) + DB `is_active` | – | Hayır → 401 |
| `/api/auth/refresh` | 1 | – | Refresh hash DB'de, revoke/expires/`is_active` | – | Sahte değer → 401 "Oturum bulunamadı…" |
| `/api/auth/logout` | 1 | – | Origin guard; idempotent | – | Zararsız |
| `/api/auth/login`, `/api/auth/2fa/verify` | 2 | – | Origin guard, credential/TOTP | – | – |

**Toplam:** admin korumalı API route dosyası **55**, kendi auth'unu yapan **55**.

### Server Action'lar

- 46 `"use server"` dosyasında **136** export edilmiş action var.
- **128**'i ilk satırlarında `requirePermission` / `requireAdminAction` / `authorizeAdminSession` + `callerHasPermission` çağırıyor.
- **8**'i bilinçli olarak public: `searchVillas`, `createVillaReviewAction`, `createSharedFavoritesListAction`, `getPublicSettingsAction`, `getVillasByIdsAction`, `getVillaBadgesAction`, `loadHeroFeatures`, `loadHeroFilters`.
- Mevcut `tests/unit/server-action-authz.test.ts` "KAYIT TARAMASI" bloğu (`:415+`) bunu registry olarak kilitliyor.
- **Server action'lar SEC-01'den etkilenmiyor.**

---

## Session / Cookie Doğrulaması

Yalnızca koddan (`lib/auth/native/cookies.ts:55-124`, `cookie-names.ts`, `session.service.ts`, migration `068`):

| Özellik | `__Host-admin_at` (access) | `__Host-admin_rt` (refresh) | Değerlendirme |
|---|---|---|---|
| HttpOnly | ✓ (`:63`) | ✓ (`:71`) | OK |
| Secure | `COOKIE_SECURE` (varsayılan true; `AUTH_COOKIE_SECURE=false` ise kapalı ve `__Host-` öneki düşer) (`:64,72`) | aynı | Prod değeri **DB/CONFIG GEREKİYOR** (`.env.local`=true) |
| SameSite | `Lax` (`:65`) | `Strict` (`:73`) | OK |
| Path | `/` (`:66`) | `/` (`:74`) | `__Host-` gereği |
| Domain | Yok (host-only) | Yok | OK |
| Süre | `maxAge = AUTH_ACCESS_TTL` (varsayılan 900 sn) (`:67`) | `remember` ise `maxAge = AUTH_REFRESH_TTL` (varsayılan 30 gün), değilse session cookie (`:76`) | DB `expires_at` her iki durumda 30 gün (`session.service.ts:68-70`). Session cookie tarayıcı açık kaldıkça sunucuda 30 gün geçerli (LOW) |
| Token biçimi | JWT HS256 `{sub,email,sid,perms,typ}` | 32 byte `randomBytes` base64url; DB'de SHA-256 hash, unique index | OK (`refresh-token.ts:15-22`, `068:75-76`) |
| Rotation | Refresh sırasında yenilenir | **Her refresh'te rotate** (`session.service.ts:142-151`) | OK. Eski token tekrar kullanılırsa sadece 401; **reuse detection yok** (tüm oturum ailesi iptal edilmiyor) (LOW) |
| Refresh doğrulaması | – | Hash + `revoked_at IS NULL` + `expires_at > now` + `admin.is_active` (`admin-session.repository.server.ts:52-60`, `session.service.ts:132-140`) | OK (yalnız `/api/auth/refresh` içinde) |
| Logout / revocation | Cookie `maxAge=0` | Mevcut oturum `revoked_at` + cookie temizleme (`session.service.ts:169-183`) | Access JWT revoke edilmiyor (`sid` kontrolü yok) → **≤ 15 dk geçerli kalır** |
| Toplu iptal | – | `revokeAllForAdmin` tanımlı (`admin-session.repository.server.ts:89-95`) ama **hiç çağrılmıyor** | Şifre değişimi / pasifleştirmede diğer cihaz oturumları sürer. Pasifleştirme `is_active` kontrolüyle API/refresh'te etkili, **ama korumasız server sayfalarda değil** |
| Middleware'de doğrulama | İmza, exp, typ | **YOK (yalnız varlık)** | **SEC-01 kök nedeni** |

**Eksikler (özet):**
- Middleware'de refresh doğrulaması yok.
- Server sayfalarda auth yok.
- Access JWT ↔ `admin_sessions` bağlantısı (`sid`) yok.
- Toplu revoke çağrılmıyor.
- Refresh reuse detection yok.
- Session cookie ile DB `expires_at` arasında 30 günlük fark.

---

## Bypass Senaryoları

Hepsi yalnızca kod akışından değerlendirildi; hiçbir istek gönderilmedi. "Veri döner mi" sütunu 6 veri çeken server sayfa (bkz. matris) içindir.

| # | Durum | Middleware | Sayfaya ulaşır mı | Sayfa kendi auth'u | Hassas veri döner mi | API / Action | Kesinlik |
|---|---|---|---|---|---|---|---|
| **A** | Hiç cookie yok | `sessionOk=false` → 302 `/maki-admin/login?redirect=…` (`:50-55`) | Hayır | – | Hayır | 401 | KESİN |
| **B1** | Access **yok**, refresh = rastgele değer | `hasRefresh=true` → `sessionOk=true` (`:36-38`) | **Evet** | **Yok** | **Evet** (RSC payload'ında) | 401 (access yok) | Middleware ve sayfa: KESİN. Payload içeriği: KOD-GÜÇLÜ |
| B2 | Access = rastgele, refresh yok | verify → `malformed` → false → 302 | Hayır | – | Hayır | 401 | KESİN |
| B3 | Access = rastgele **ve** refresh = rastgele | `malformed` ≠ `expired` → false → 302 (`:35`) | Hayır | – | Hayır | 401 | KESİN |
| **C** | Süresi dolmuş gerçek access (+ refresh) | `expired` + refresh var → true (`:35`) | Evet | Yok | Evet | 401 (`authorizeAdminToken` → verify başarısız) | KESİN. Saldırganın B1 varken buna ihtiyacı yok |
| C2 | Süresi dolmuş access, refresh yok | false → 302 | Hayır | – | Hayır | 401 | KESİN |
| **D** | Logout/revoke edilmiş oturum: eski **access** hâlâ TTL içinde | verify ok → geçer | Evet | Yok | Evet | **Evet, ≤ 15 dk** (`sid` DB'de kontrol edilmiyor) | KESİN |
| D2 | Revoke edilmiş oturumun **refresh**'i (access yok) | Varlık yeterli → geçer (B1 ile aynı) | Evet | Yok | Evet | `/api/auth/refresh` → 401 (`revoked_at` filtresi) | KESİN |
| D3 | Admin `is_active=false` yapılmış, access TTL içinde | Geçer | Evet | Yok | **Evet** | API/action → 403 (`is_active` her istekte) | KESİN |
| **E** | Başka bir admin'in geçerli oturumu (çalınmış/paylaşılmış) | Geçer | Evet | Yok | Evet | O admin'in yetkisiyle her şey | Doğası gereği (session hijack). SEC-01'e özgü kısım: **izin kontrolü olmadığı için** yalnızca örn. `blog` izni olan bir admin de dashboard PII'sini ve villa token'larını sunucudan alır | KESİN |
| **F** | Manipüle edilmiş access (payload değişik, imza eski / `alg:none` / farklı `alg` / `typ:"totp_pending"`) | `bad_signature` / `bad_alg` / `malformed` → false → 302 (refresh olsa bile) | Hayır | – | Hayır | 401 | KESİN (`jwt.ts:95-134`) |
| F2 | Manipüle edilmiş refresh | Değer hiç okunmuyor → (access yoksa) geçer = B1 | Evet | Yok | Evet | 401 | KESİN |

### B1 zincirinin kod kanıtı

1. **İstek:** `GET /maki-admin` (veya `/maki-admin/villas?page=1&pageSize=…`) + `Cookie: __Host-admin_rt=<herhangi>`. `AUTH_COOKIE_SECURE=false` ise ad `admin_rt`.
   - `__Host-` öneki yalnızca *tarayıcının* cookie kabul kuralıdır; elle gönderilen `Cookie` başlığını kısıtlamaz.
2. **`middleware.ts:28`:** `access = undefined`.
3. **`middleware.ts:29`:** `hasRefresh = true`.
4. **`middleware.ts:36-38`:** `sessionOk = true`.
5. **`middleware.ts:50`:** koşul false olduğu için redirect yok → **`:57` `NextResponse.next()`**.
6. **`app/(admin)/layout.tsx:41,58-64`:** auth yok, `children` döner (`force-dynamic`: her istekte taze render).
7. **`app/(admin)/maki-admin/layout.tsx:571-576`** (`"use client"`): `<AdminSessionGuard>…{children}</AdminSessionGuard>`.
   - Server Component `page.tsx`'in çıktısı bu client layout'a **`children` prop'u** olarak, sunucuda render edilmiş hâlde verilir.
8. **`app/(admin)/maki-admin/page.tsx:13-38`:** auth çağrısı olmadan `findRecentForDashboard()`, `getDailyReservationCounts(30)`, `getOperationsSnapshot()` çalışır.
   - Sonuçlar JSX'e ve client bileşen prop'larına (`UpcomingOperations snapshot`, `HideableSection` children) yerleşir.
9. **`AdminSessionGuard.tsx`:** ilk render'da `loading=true` → `return null` (SSR HTML'inde görsel içerik yok).
   - **Ancak** App Router, server ağacını ve client bileşenlere geçen prop'ları **RSC payload** olarak yanıtın içine (`self.__next_f.push(...)` script'leri, ya da `RSC: 1` başlıklı isteklerde `text/x-component` gövdesi) serialize eder.
   - `return null` bu serileştirmeyi engellemez.
   - Next.js dokümantasyonu: "A common pattern in SPAs is to `return null` in a layout … This pattern is **not recommended** … which will not prevent nested route segments and Server Actions from being accessed." (`01-app/02-guides/authentication.md:1458`)
10. **Sonuç:** Yanıt gövdesinde misafir adları, tutarlar ve tarihler bulunur.

**Kesinlik:**
- Adım 1-8 **KESİN**.
- Adım 9'un "payload'da veri var" kısmı React Server Components'in belgelenmiş davranışına dayanıyor: **KOD-GÜÇLÜ**. Kısıt gereği çalışma zamanında denenmedi.
- Aynı zincir `/maki-admin/villas` için `VillaOperationsList initialVillas` prop'u üzerinden `private_access_token` dahil villa DTO'larını taşır (`villa.service.ts` `mapVilla`, `villas/page.tsx:167-176`).

**Production'da erişilebilirlik:** Cloudflare/Traefik katmanında `/maki-admin` için IP kısıtı, Basic Auth veya WAF kuralı olup olmadığı **DOĞRULANAMAZ** (koddan çıkarılamıyor). Böyle bir kontrol varsa pratik risk azalır.

---

## Kanıtlanan Bulgular

### F-01 — Middleware refresh cookie'yi doğrulamadan geçiriyor

| | |
|---|---|
| **Dosya / satır** | `middleware.ts:29,35-38` |
| **Kod özeti** | `hasRefresh = !!cookie`. Access yoksa `sessionOk = true`; access `expired` + refresh varsa `true` |
| **Akış** | İstek → middleware → `NextResponse.next()` → segment ağacı render |
| **Risk** | Tek başına düşük (middleware bir redirect kapısı). F-02 ile birleşince HIGH |
| **Kesinlik** | KESİN |

### F-02 — 6 Server Component admin sayfası sunucu tarafında kimlik/izin doğrulaması yapmadan DB'den veri çekiyor

| | |
|---|---|
| **Dosyalar** | `app/(admin)/maki-admin/page.tsx:13-38`, `villas/page.tsx:78-100`, `manual-reservations/ekle/page.tsx:20-54`, `villas/siralama/page.tsx:43,76`, `villa-listesi/page.tsx`, `settings/ceviriler/page.tsx:49-51` |
| **Kod özeti** | `authorizeAdminSession` / `requirePermission` / `requireAdminAction` çağrısı **0** (otomatik tarama + okuma) |
| **Akış** | page.tsx → repository/service (`dbAdmin`, tek rol, RLS yok) → JSX / client prop → RSC payload |
| **Risk** | Dashboard: PII. villas + manual-reservations/ekle: `private_access_token` + ticari alanlar. Diğer 3: LOW |
| **Kesinlik** | KESİN (sayfalar), KOD-GÜÇLÜ (payload'a çıkış) |

### F-03 — Client guard bir güvenlik kontrolü değil

| | |
|---|---|
| **Dosya / satır** | `app/components/admin/AdminSessionGuard.tsx` (render bloğu: `if (!isLoginPath && loading) return null; if (!admin) return null;`), `maki-admin/layout.tsx:1,571-576` |
| **Kod özeti** | Doğrulama `/api/auth/me` ile tarayıcıda yapılıyor; sonuç yalnızca render'ı saklıyor |
| **Risk** | F-02'nin telafi edici kontrolü sanılıyor; değil |
| **Kesinlik** | KESİN (kod) + resmi doküman |

### F-04 — `private_access_token` admin DTO'larında client'a gönderiliyor (yeni)

| | |
|---|---|
| **Dosya / satır** | `app/services/villa.service.ts` `mapVilla` (çıktı alanları arasında `private_access_token`, `commission_rate`, `tourism_document_number`), `lib/db/villa.repository.server.ts:298-317` (`findByPrivateToken`, `is_active` filtresi yok) → `app/(public)/v/[token]` |
| **Akış** | SEC-01 bypass → `/maki-admin/villas` (tüm villalar, sayfalı) veya `/manual-reservations/ekle` (aktif villalar) → token → `/v/<token>` ile off-market/VIP villa sayfası |
| **Risk** | Kalıcı: token'lar rotate edilene kadar geçerli. Normal admin kullanımında da bu alanın ilgili client bileşenlerine gönderilmesi gereksiz olabilir (en az ayrıcalık) |
| **Kesinlik** | KESİN (alan ve akış). Token'ın public sayfada neyi açtığı: KESİN (`findByPrivateToken`) |

### F-05 — Access token revocation gecikmesi (sid kontrolü yok)

| | |
|---|---|
| **Dosya / satır** | `lib/admin-route-auth.ts:50-132` (`sid` kullanılmıyor), `session.service.ts:100-105` (`readAccessClaims` DB'siz), `jwt.ts:32` (claim var) |
| **Akış** | Logout → `admin_sessions.revoked_at` set, cookie silinir. Aynı access JWT'yi elinde tutan biri (log, XSS, paylaşılan cihaz) TTL bitene kadar API/action/sayfa kullanır |
| **Risk** | LOW-MEDIUM (varsayılan TTL 15 dk; `AUTH_ACCESS_TTL` prod değeri DB/CONFIG GEREKİYOR) |
| **Kesinlik** | KESİN |

### F-06 — `revokeAllForAdmin` hiç çağrılmıyor

| | |
|---|---|
| **Dosya / satır** | `lib/db/admin-session.repository.server.ts:89-95` (tanım); `grep` → tek kullanım yok |
| **Akış** | Admin şifresi değiştirilse (bkz. SEC-02) veya pasifleştirilse bile diğer cihazlardaki refresh oturumları DB'de aktif kalır. `refreshSession` `is_active`'i kontrol ettiği için pasifleştirmede refresh reddedilir; şifre değişiminde **reddedilmez** |
| **Risk** | MEDIUM (hesap ele geçirme sonrası kurtarma zayıf) |
| **Kesinlik** | KESİN |

### F-07 — Kimlik çözümlemesi `sub` yerine `email` üzerinden

| | |
|---|---|
| **Dosya / satır** | `lib/admin-route-auth.ts:84-110`: önce `admin_users.auth_user_id = sub`, sonra `email = claim.email`. Native admin'ler `insertNative` ile `auth_user_id` olmadan oluşturuluyor (`admin-user.repository.server.ts:146-155`) → pratikte kimlik = `email` claim'i |
| **Akış** | Admin A'nın e-postası değiştirilip B'ye A'nın eski e-postası verilirse, A'nın TTL içindeki access token'ı B olarak çözülür. `/api/auth/me` ise `findByIdForSession(sub)` kullanıyor, iki yol **tutarsız** |
| **Risk** | LOW (özel koşul + ≤ TTL) |
| **Kesinlik** | KESİN (kod); `auth_user_id` doluluğu DB/CONFIG GEREKİYOR |

---

## Kanıtlanamayan Bulgular

| İddia | Durum | Neden | Nasıl doğrulanır |
|---|---|---|---|
| Rastgele cookie ile RSC yanıtında verinin **fiilen** döndüğü | KOD-GÜÇLÜ, çalışma zamanında doğrulanmadı | Kısıt: HTTP isteği / cookie forge yasak | Yalnızca **yerel/staging** build + fixture DB'de, sentinel müşteri adıyla, yetkili bir test (Test Planı T-10) |
| Prod'da `/maki-admin` önünde ek kontrol (Cloudflare Access, IP allowlist, WAF) | DOĞRULANAMAZ | Infra koddan görünmüyor | Cloudflare/Coolify/Traefik ayarları |
| `AUTH_COOKIE_SECURE`, `AUTH_ACCESS_TTL`, `AUTH_REFRESH_TTL` prod değerleri | DB/CONFIG GEREKİYOR | Env | Coolify env ekranı (yalnız değer sınıfı) |
| `admin_users.auth_user_id` doluluğu (F-07) | DB/CONFIG GEREKİYOR | DB | Aşağıdaki sorgu |
| Aktif/iptal edilmiş oturum sayıları | DB/CONFIG GEREKİYOR | DB | Aşağıdaki sorgu |
| Önceki raporun "canlıda denenmedi; kod yolu kesin" ifadesi | Kısmen düzeltme | "Kod yolu kesin" middleware ve sayfa için doğru; payload'a çıkış framework davranışı (KOD-GÜÇLÜ) | – |

### DB — tablo adları (yalnızca proje dosyalarından)

| Tablo | Kaynak | Alanlar (auth ile ilgili) |
|---|---|---|
| `public.admin_users` | legacy + `068_native_auth.sql:30-42`, `077_admin_totp.sql:56-71` | `id`, `email`, `auth_user_id`, `is_active`, `sidebar_permissions`, `password_hash`, `failed_attempts`, `locked_until`, `last_login_at`, `password_changed_at`, `totp_secret`, `totp_enabled`, `totp_enrolled_at`, `totp_failed_attempts`, `totp_locked_until` |
| `public.admin_sessions` | `068_native_auth.sql:54-84` | `id`, `admin_id` (FK, CASCADE), `refresh_token_hash` (unique), `user_agent`, `ip`, `remember`, `created_at`, `last_used_at`, `expires_at`, `revoked_at` |
| `public.admin_totp_recovery_codes` | `077_admin_totp.sql:77-89` | Argon2id hash'li kodlar |
| Refresh token tablosu | Ayrı tablo **yok**: refresh = `admin_sessions.refresh_token_hash` | – |

### Çalıştırılması önerilen READ-ONLY SQL

Kişisel veri döndürmez, yalnızca sayım ve şema bilgisi verir. **Bu analizde ÇALIŞTIRILMADI.**

```sql
-- 1) admin_sessions şeması prod'da migration ile aynı mı?
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'admin_sessions'
order by ordinal_position;

-- 2) Oturum durumu dağılımı (sayım)
select
  count(*) filter (where revoked_at is null and expires_at > now())  as aktif,
  count(*) filter (where revoked_at is not null)                     as iptal,
  count(*) filter (where revoked_at is null and expires_at <= now()) as suresi_dolmus,
  count(*) filter (where remember = false and revoked_at is null and expires_at > now()) as aktif_remember_false
from public.admin_sessions;

-- 3) F-07: native admin'lerde auth_user_id doluluğu (sayım)
select
  count(*)                                  as toplam_admin,
  count(*) filter (where auth_user_id is null) as auth_user_id_bos,
  count(*) filter (where auth_user_id = id)    as auth_user_id_esit_id
from public.admin_users;

-- 4) Pasif admin'e ait hâlâ aktif oturum var mı (F-06)
select count(*) as pasif_admin_aktif_oturum
from public.admin_sessions s
join public.admin_users u on u.id = s.admin_id
where u.is_active = false and s.revoked_at is null and s.expires_at > now();

-- 5) (SEC-02 ile bağlantılı) password kolonu var mı
select column_name from information_schema.columns
where table_schema='public' and table_name='admin_users'
  and column_name in ('password','password_hash');
```

---

## Severity Değerlendirmesi

| Kriter | Değer | Kaynak |
|---|---|---|
| Kimlik doğrulama gereksinimi | **Yok** (B1) | KESİN |
| Karmaşıklık | Çok düşük (tek `Cookie` başlığı; access cookie gönderilmemeli) | KESİN |
| Etkilenen yüzey | 6 sayfa (3'ü anlamlı veri). **API, server action ve yazma işlemleri etkilenmiyor** | KESİN |
| Gizlilik | Misafir adı, tutar, tarih, kişi sayısı (son 5 + yaklaşan 7 gün); tüm villaların `private_access_token`, komisyon ve belge numaraları | KESİN / KOD-GÜÇLÜ |
| Bütünlük / erişilebilirlik | Yok | KESİN |
| Kalıcılık | `private_access_token` rotate edilene kadar geçerli | KESİN |
| Önkoşul (infra) | `/maki-admin` internete açık olmalı | DOĞRULANAMAZ |

**CVSS 3.1:** `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` → **7.5 (HIGH)**

**Sonuç:** Önceki raporun **CRITICAL** etiketi yerine **HIGH (P0 öncelik)** öneriyorum.

CRITICAL'den ayrılma gerekçeleri:
1. Yazma, hesap ele geçirme veya RCE yok.
2. API/server action katmanı sağlam.
3. Sızan PII kümesi sayfalama ile sınırlı: dashboard'da son 5 + yakın operasyonlar; tam rezervasyon listesi API arkasında.

Bununla birlikte düzeltme **acil** olmalı:
- Kimlik doğrulamasız KVKK verisi ifşası söz konusu.
- Villa token'ları kalıcı zarar yaratıyor.
- Kurum politikası "kimlik doğrulamasız PII = CRITICAL" diyorsa CRITICAL korunabilir. Bu bir politika kararıdır; teknik sınıflandırma HIGH.

| Önceki rapor iddiası | Bu analiz |
|---|---|
| "Middleware herhangi bir `__Host-admin_rt` değerini geçerli sayıyor" | **Doğru, bir kısıtla:** yalnızca access cookie **yokken** ya da access **gerçek ve süresi dolmuşken**. Sahte access + sahte refresh → login'e yönlenir (B3) |
| "6 server-side admin page" | **Doğru**: aynı 6 sayfa. Ayrıca veri çekmeyen 6 server iskelet sayfa daha var (zararsız) |
| Sızan veri: dashboard PII | **Doğru** |
| Sızan veri: villa listesi | **Eksikti**: `private_access_token` ifşası eklenmeli (F-04) |
| Seviye CRITICAL | **HIGH (7.5) önerilir**, P0 aciliyet korunur |

---

## En Küçük Güvenli Düzeltme Planı

**İlke:** Mevcut native auth mimarisi korunur. Yeni bir auth sistemi yok. Mevcut `authorizeAdminSession` + `callerHasPermission` + `refreshSession` yeniden kullanılır. **Bu aşamada kod yazılmadı.**

### Adım 1 (P0, zorunlu) — Sayfa seviyesinde server-side gate (Data Access Layer ilkesi)

- **Yeni yardımcı** (server-only), ör. `lib/auth/admin-page-guard.ts` → `requireAdminPage(permission, nextPath)`. İçerik:
  1. `authorizeAdminSession()` (**mevcut**) → başarısızsa:
     - refresh cookie **varsa** → `redirect("/api/auth/refresh-bounce?next=<nextPath>")` (Adım 2);
     - yoksa → `redirect("/maki-admin/login")`.
  2. `callerHasPermission(caller.id, permission)` (**mevcut**, DB'den, fail-closed) → yoksa `redirect("/maki-admin")`, `notFound()` ya da sade bir "yetkiniz yok" bileşeni. `forbidden()` yalnızca `experimental.authInterrupts` açıkken kullanılabilir (`03-api-reference/04-functions/forbidden.md:17-24`); config değişikliği gerektirdiği için önerilmez.
     - Dashboard için `redirect("/maki-admin")` döngü yaratır; orada "yetkiniz yok" bileşeni kullanılmalı.
- **Uygulanacak sayfalar** (her birinin **ilk satırı**, veri çekiminden **önce**, `Promise.all`'ın dışında `await`):

| Sayfa | Önerilen izin anahtarı (mevcut `SIDEBAR_PERMISSIONS` kataloğundan) |
|---|---|
| `/maki-admin` | `dashboard` |
| `/maki-admin/villas` | `villas` |
| `/maki-admin/villas/siralama` | `villas` |
| `/maki-admin/manual-reservations/ekle` | `manual_reservations` |
| `/maki-admin/villa-listesi` | `villa_lists` |
| `/maki-admin/settings/ceviriler` | `settings` |

- **Defense-in-depth (önerilir):** Veri çekmeyen 6 server iskelet sayfaya da aynı gate eklenmeli (gelecekte veri eklenirse korumasız kalmasın). Registry testi (T-7) bunu kilitler.
- **Neden layout değil sayfa:**
  - Next.js dokümantasyonu: layout'lar client navigasyonda yeniden render edilmez (Partial Rendering), bu yüzden kontrol her route değişiminde çalışmaz (`authentication.md:1350-1358`).
  - Ayrıca mevcut `maki-admin/layout.tsx` bir client component. Server layout eklemek büyük bir refactor olur.
  - Sayfa seviyesinde gate en küçük ve en güvenli değişiklik.
- **Servis katmanına gate eklenmemeli:** `getVillas()` / `listPublic()` gibi fonksiyonlar public sayfalarda da kullanılıyor; oraya gate eklemek public'i kırar.

### Adım 2 (P0, UX ve middleware için gerekli) — Refresh bounce route + middleware sıkılaştırması

- **Sorun:** Adım 1 tek başına uygulanırsa, access'i süresi dolmuş ama refresh'i geçerli bir admin server sayfalarına giderken login'e düşer.
  - Bugün bu durumu client guard'ın `/api/auth/refresh` retry'ı (`lib/admin-auth.ts` `tryRefreshAccess`) çözüyor.
  - Server Component cookie **yazamaz**; bu nedenle bir route handler gerekir.
- **Yeni route handler** (Node runtime): `GET /api/auth/refresh-bounce?next=`
  - Mevcut `refreshSession()`'ı çağırır.
  - Başarılıysa `302 next`, değilse `clearAuthCookies()` + `302 /maki-admin/login`.
  - `next` yalnızca `/maki-admin` ile başlayan, `//` ve `\` içermeyen relatif path olabilir (open redirect koruması).
  - Refresh cookie `SameSite=Strict` olduğu için cross-site GET ile tetiklenemez.
- **`middleware.ts` değişikliği** (DB'siz kalır, edge uyumlu):
  - `access yok && refresh var` → `sessionOk = true` **yerine** `302 /api/auth/refresh-bounce?next=<pathname+search>`.
  - `access expired && refresh var` → aynı bounce.
  - Diğer durumlar değişmez.
  - Böylece middleware yalnızca imzası doğrulanmış bir access token ile geçirir. Refresh'in DB doğrulaması Node tarafında yapılır.
- **Döngü koruması:** Bounce sonrası middleware access'i hâlâ geçersiz görürse (ör. edge/node farklı `AUTH_JWT_SECRET`, saat kayması) sonsuz döngü oluşur. Bunu önlemek için bounce yalnızca bir kez denenmeli: `rb=1` işareti veya bounce içinde başarısızlıkta login'e yönlendirme.
- **`middleware` → `proxy` geçişi bu değişiklikle birleştirilmemeli** (ayrı iş, edge → nodejs runtime farkı var).

### Adım 3 (P1) — Veri minimizasyonu

- `private_access_token`'ı listeleme DTO'larından (`VillaOperationsList`, `ManualReservationForm`) çıkarın. Yalnızca token üretme/gösterme ekranında, guard'lı `POST /api/admin/villas/[id]/private-token` ile alınsın.
- `commission_rate` ve `tourism_document_number` için de ihtiyaç analizi yapın.
- **Bypass'ın prod'da gerçekleştiği varsayımıyla** mevcut tüm `private_access_token`'ları rotate etmeyi değerlendirin.
  - Bu bir DB işlemi; ayrı onayla yapılmalı.
  - Paylaşılmış VIP linkler kırılır, iş kararı gerektirir.

### Adım 4 (P2, defense-in-depth) — Oturum bütünlüğü

| # | İş | Bulgu | Not |
|---|---|---|---|
| 4a | `authorizeAdminToken` içinde `sid` → `admin_sessions` (`revoked_at IS NULL AND expires_at > now()`) kontrolü | F-05 | Zaten istek başına `admin_users` sorgusu var; tek JOIN/sorgu eklenir. Performans etkisi: +1 index'li sorgu |
| 4b | Kimlik çözümlemesi `findByIdForSession(sub)` ile (email fallback'ini legacy için arkaya al) | F-07 | `/api/auth/me` ile tutarlılık sağlar |
| 4c | Şifre değişimi, pasifleştirme ve 2FA reset'te `revokeAllForAdmin(adminId)` | F-06 | SEC-02/SEC-03 düzeltmeleriyle birlikte |
| 4d | Refresh reuse detection | – | Eski hash kullanılırsa o admin'in tüm oturumlarını iptal etmek. Opsiyonel |

### API permission sistemiyle kesişim (SEC-03)

- Adım 1'deki `callerHasPermission` server action'larla **aynı** modeli (`sidebar_permissions`, DB, fail-closed) kullanır. Tutarlılık artar.
- API route'ları hâlâ yalnızca "aktif admin" kontrolü yapar. SEC-03 ayrı bir iş, aynı `callerHasPermission` ile route bazında ele alınmalı.
- İzin anahtarı eşlemesi (tablo yukarıda) SEC-03 için de tek kaynak olarak kullanılabilir.

---

## Regression Riskleri

| Alan | Etki | Risk | Azaltma |
|---|---|---|---|
| Normal (public) kullanıcı login'i | Public tarafta kullanıcı login'i **yok**; yalnızca admin auth var | Yok | – |
| Admin login | `/maki-admin/login` client sayfa; gate uygulanmaz. Middleware'in "login + oturum → panel" kuralı bounce ile değişir (yalnızca refresh varsa önce bounce) | Düşük | Login path'i bounce kuralından muaf tutun (mevcut davranış korunur) |
| Admin logout | Değişmez (`revokeCurrentSession`). 4a sonrası access anında geçersiz olur (**davranış iyileşmesi**) | Düşük | T-5 |
| Session refresh | En büyük risk. Server sayfaları artık cookie yenilemesine ihtiyaç duyar. Bounce yoksa idle (> 15 dk) sonrası server sayfalarında login'e düşülür | **Orta** | Adım 2 zorunlu; T-4 |
| 2FA | Pending cookie akışı değişmez. Bounce yalnızca gerçek refresh cookie ile çalışır | Düşük | `login-totp-gate.test.ts` |
| Admin invite / create-user | Invite akışı yok; `create-user` API route'u değişmez | Yok | – |
| Admin API'leri | Değişmez (`/api/**` middleware dışı). 4a/4b eklenirse tüm API'ler etkilenir | 1-2: Yok. 4: Orta | 4'ü ayrı PR'da yapın |
| SSR | Gate `redirect()` fırlatır; Next bunu 307/303 veya RSC redirect'e çevirir. Veri çekimi gate'ten **sonra** başlamalı | Düşük | T-2 ("repository çağrılmadı" spy'ı) |
| Middleware | Bounce yönlendirmesi eklenir; edge'de DB yok. Döngü riski | Orta | Döngü koruması; T-1 |
| Public route'lar | Matcher `/maki-admin/:path*` değişmez | Yok | T-9 smoke |
| RSC / client navigasyon | Client-side `<Link>` navigasyonunda middleware'in `/api/...` adresine redirect'i RSC fetch'ini **hard navigation**'a çevirebilir (tam sayfa yüklemesi) | Düşük-Orta (UX) | Kabul edilebilir; Playwright ile gözlemleyin (T-8) |
| Prefetch | Admin `<Link>` prefetch'leri artık gate'e takılır; yetkisiz sayfa prefetch'i redirect alır | Düşük | – |
| Caching | `(admin)` zaten `force-dynamic` (`app/(admin)/layout.tsx:41`). Gate `cookies()` okuduğu için zaten dinamik. `unstable_cache`'li servisler gate'ten sonra çağrılır | Düşük | – |
| Redirect davranışı | Login sayfası `?redirect=` parametresini kullanmıyor (sabit `/maki-admin`). Bounce `next` parametresi yeni bir open-redirect yüzeyi oluşturur | Orta | `next` doğrulaması; T-6 |
| İzin (permission) etkisi | Şu an izni olmayan admin (ör. `dashboard` yok) de sunucu verisini alıyordu; gate sonrası alamaz. `dashboard` iznine sahip olmayan adminler için ana sayfa boş/yasak olur | **Orta** (iş etkisi) | Prod'daki admin izin dağılımı kontrol edilmeli. Dashboard için "izin yoksa boş karşılama" varyantı düşünülebilir |
| Mevcut testler | `villa-sort-order-panel.test.ts:142` (`getVillasForSortOrder()` string'i) bozulmaz. Sayfa render eden test yok (6 sayfa için) | Düşük | – |

---

## Test Planı

**Kod değiştirilmedi.** Aşağıdakiler düzeltme PR'ı için önerilen testlerdir.

### Çalıştırılması gereken mevcut testler

- Tam suite: `npm test` (vitest, 185 dosya).
- Özellikle:
  - `tests/unit/server-action-authz.test.ts` (28 test + registry taraması)
  - `tests/unit/auth/jwt-access-typ.test.ts`
  - `tests/unit/auth/login-totp-gate.test.ts`
  - `tests/unit/auth/totp.test.ts`
  - `tests/unit/auth/totp-admin-rate-limit.test.ts`
  - `tests/unit/villa-sort-order-panel.test.ts`
  - `tests/unit/admin-pages-i18n.test.tsx`
  - `tests/unit/settings-translations-action.test.ts`
  - `tests/unit/page-translations-wiring.test.ts`
- Build: `next build` (Turbopack). `server-only` import zinciri ve route handler derlemesi kontrol edilir.

### Yeni testler

| ID | Tür | Kapsam | Beklenen |
|---|---|---|---|
| **T-1** | Unit (`middleware.test.ts`) | `NextRequest` + cookie kombinasyonları. `AUTH_JWT_SECRET` test env. Token'lar `signAccessToken` ile; süre için fake timers | A: login redirect · B1 (yalnız rastgele rt): **bounce redirect, `next()` değil** · B2/B3: login · C (expired+rt): bounce · F (yanlış imza / `alg:none` / `typ:totp_pending`): login · geçerli access: `next()` · login path + geçerli access: `/maki-admin` |
| **T-2** | Unit (`admin-page-guard.test.ts`) | 6 sayfanın her biri. `authorizeAdminSession` mock'u: unauth / geçerli + izin yok / geçerli + izin var. Repository/service'ler `vi.fn` spy | unauth: `NEXT_REDIRECT` fırlatılır, **repository hiç çağrılmaz** · izin yok: forbidden/redirect, repository çağrılmaz · izin var: veri çağrılır |
| **T-3** | Unit | `requireAdminPage` | Refresh cookie varken bounce'a, yokken login'e yönlendirir; DB hatasında fail-closed |
| **T-4** | Unit (route) | `GET /api/auth/refresh-bounce` | Geçerli refresh → rotation + 302 `next` · revoke edilmiş / süresi dolmuş / rastgele refresh → cookie temizleme + 302 login · pasif admin → revoke + login |
| **T-5** | Unit | Revoked session (4a uygulanırsa) | Logout sonrası eski access JWT ile `authorizeAdminToken` → 401 |
| **T-6** | Unit | Open redirect | `next=https://evil`, `next=//evil`, `next=/\evil`, `next=/public-page` → login veya `/maki-admin`'e düşer |
| **T-7** | Registry (statik) | `app/(admin)/maki-admin/**/page.tsx`: `"use client"` olmayan her dosya `requireAdminPage(` içermeli (`server-action-authz` registry deseni) | Yeni eklenen korumasız server sayfa CI'da kırılır |
| **T-8** | E2E (Playwright, **yalnız yerel/staging**) | Authenticated admin: dashboard, villas, siralama, ekle, villa-listesi, ceviriler açılır · idle > access TTL (`AUTH_ACCESS_TTL=60` test env) sonra navigasyon → sessizce yenilenir · logout → geri tuşu → login · izni olmayan admin → yasak | Akışlar kırılmadan çalışır |
| **T-9** | Smoke | Public route'lar: `/`, `/arama`, `/kiralik-villalar`, `/v/[token]`, `/rezervasyon/[slug]`, `/api/public/*` | Middleware dışında; davranış değişmez |
| **T-10** | Güvenlik regresyonu (**yalnız yerel build + fixture DB**, prod değil) | `GET /maki-admin` ve `GET /maki-admin/villas` (a) cookie'siz, (b) rastgele rt ile, (c) `RSC: 1` başlığıyla | Yanıt gövdesinde sentinel misafir adı / `private_access_token` değeri **bulunmaz**. Düzeltmeden **önce** aynı test SEC-01'in çalışma zamanı kanıtını verir (şu an KOD-GÜÇLÜ olan kısmı KESİN'e çevirir) |
| **T-11** | Wrong-user | A admin'inin token'ı (izin: yalnız `blog`) ile 6 sayfa | Yalnız `blog` gerektiren sayfalar açılır; dashboard/villas vb. yasak |
| **T-12** | Expired / revoked refresh | DB fixture'da `revoked_at` dolu, `expires_at` geçmiş satırlar | Bounce → login |

---

## Sonuç

- **SEC-01 gerçek.** Kök neden iki katmanın birbirine güvenmesi:
  - Middleware, refresh cookie'nin yalnızca varlığına bakıyor.
  - Server Component sayfaları, "middleware zaten kontrol etti" varsayımıyla hiç auth yapmıyor.
  - Client guard'ın `return null`'ı sunucudan çıkan veriyi durdurmuyor.
- **Etki alanı dar ama anlamlı:** yalnızca 6 server sayfa (3'ü hassas). API'ler ve server action'lar sağlam.
- **Önceki rapora göre farklar:**
  - B3 istisnası (sahte access + sahte refresh reddediliyor).
  - `private_access_token` ifşası (yeni ve kalıcı etkili).
  - Severity: CRITICAL → **HIGH (7.5), P0 aciliyet**.
- **Önerilen düzeltme:** Mevcut helper'larla sayfa bazında `requireAdminPage` + refresh-bounce + middleware'de bounce. Yeni auth sistemi yok, yaklaşık 3 yeni küçük dosya ve 6-12 sayfaya birer satır.

---

## Kapanış Bilgileri

| Soru | Cevap |
|---|---|
| Kaç dosya incelendi? | **~197.** 52 dosya satır satır okundu: middleware, 14 auth/session modülü, 4 `/api/auth` route'u, 3 layout, 12 server admin sayfası, ilgili 6 repository/service dosyası, 2 migration, 3 admin-gateway dosyası, `jose` verify, 3 Next.js doküman dosyası. Yaklaşık 145 dosya otomatik desen taramasıyla incelendi: 42 client admin sayfası, 57 admin/mail/voucher/auth API route'u, 46 server-action dosyası |
| Kaç admin route bulundu? | **54 sayfa** (`page.tsx`; 12 server, 42 client) + **55 admin korumalı API route dosyası** (`/api/admin` 44, `/api/admin-users` 2, admin `/api/mail` 8, `/api/voucher` 1) + 5 `/api/auth` route'u. Ayrıca 128 admin server action |
| Kaç route kendi auth kontrolünü yapıyor? | Sayfalar: **0/54** sunucu tarafında (12 server sayfanın hiçbiri; 42 client sayfanın verisi guard'lı action/API üzerinden). API: **55/55**. Admin server action: **128/128** (8 action bilinçli olarak public) |
| Middleware gerçekten session doğruluyor mu? | **Kısmen.** Access JWT'yi kriptografik olarak doğruluyor (imza, `alg`, `exp`, `typ`). Refresh cookie'yi **doğrulamıyor** (yalnızca varlık). DB oturumunu (revoke) **hiç** kontrol etmiyor |
| Rastgele cookie ile bypass koddan kanıtlanabiliyor mu? | **Evet, middleware + sayfa katmanında KESİN** (access cookie gönderilmeden, yalnızca rastgele `__Host-admin_rt`). Verinin yanıt gövdesine (RSC payload) çıkışı framework davranışına dayanıyor: **KOD-GÜÇLÜ**, çalışma zamanında denenmedi. Sahte access + sahte refresh birlikte gönderilirse bypass **olmuyor** (B3) |
| SEC-01 gerçekten CRITICAL mı? | **Hayır. Teknik sınıflandırma: HIGH (CVSS 7.5), öncelik P0.** Yazma/ele geçirme yok, API/action etkilenmiyor. Ancak kimlik doğrulamasız PII ve kalıcı `private_access_token` ifşası nedeniyle acil |
| Kod değişikliği yapıldı mı? | **HAYIR** |
| git diff temiz mi? | **Evet.** Takip edilen dosyalarda değişiklik yok. Tek yeni dosya bu rapor (`Claude outputs/` altında untracked) |
| HEAD değişti mi? | **HAYIR:** `a56bb78` |
| commit/push/deploy yapıldı mı? | **HAYIR** |
