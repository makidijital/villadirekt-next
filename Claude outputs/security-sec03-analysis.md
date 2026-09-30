# SEC-03 — Admin API Permission Sistemi Analizi (YALNIZCA ANALİZ)

- **Başlangıç durumu (analizden önce kaydedildi):**
  - HEAD `ba57261d30515e56ae28287fb3bbdb14553d0fb3`: `fix(auth): protect admin server pages` (SEC-01 commit'i)
  - Tree `add3d2f6…`
  - Takip edilen dosyalarda değişiklik yok. Yalnızca `Claude outputs/` altında untracked dosyalar var.
- **Kaynak:** Analiz edilen kod, cihazdaki HEAD ile birebir aynı (tree hash eşleşti).
- **Yöntem:**
  - Statik kod okuma ve otomatik envanter: 80 route dosyası, 46 server-action dosyası, UI → API çağrı haritası.
  - Mevcut testlerin incelenmesi.
  - **Yalnızca lokal test build + lokal sahte (fixture) DB** üzerinde salt okunur GET doğrulaması yapıldı.
  - Canlı sisteme istek yok; mutation (yazma) isteği hiç gönderilmedi.
- **Değişiklik:** Kod, config, DB, `.env` ve test dosyalarında değişiklik yok. Yalnızca bu rapor dosyası oluşturuldu.

---

## 0. Kısa Sonuç

| Soru | Cevap |
|---|---|
| **SEC-03 gerçek mi?** | **Evet, kanıtlandı.** `app/api/**` altında hiçbir route `requirePermission` / `callerHasPermission` çağırmıyor ve dolaylı bir izin kontrolü de yok. 2FA reset route'unun başlık yorumu bunu **bilinçli tasarım** olarak yazıyor: "herhangi bir AKTİF admin, başka bir admin_users kaydını yönetebilir" (`app/api/admin/2fa/reset/route.ts:19-25`). |
| Önceki iddianın doğruluğu | Büyük ölçüde doğru. Düzeltmeler: route sayısı 80 dosya; bunların **55'i admin kapsamında** (78 handler). 25'i public / cron / auth. "Hiçbir route izin sistemi kullanmıyor" doğru. |
| Etkilenen admin handler | **78 handler / 55 dosya** (21 GET, 57 mutation) |
| Yalnızca authentication yapan | **78 / 78** |
| Auth + permission yapan | **0 / 78** |
| Admin kapsamında tamamen korumasız | **0** (78 handler'ın hepsi, herhangi bir veri erişiminden önce `authorizeAdminCaller` / `authorizeAdminSession` / `…Flex` çağırıyor; mail uçlarında önce rate limit çalışıyor) |
| Yalnızca auth'un **doğru** olduğu handler'lar | **5**: kendi 2FA'sını yöneten 4 uç + herkesin kullandığı `activity-logs/log` |
| Permission eksik handler | **73** |
| En yüksek riskli uçlar | `PATCH /api/admin-users/[id]`, `POST /api/admin/create-user`, `POST /api/admin/2fa/reset`, `PUT/GET /api/admin/settings`, `POST /api/admin/storage/{upload,remove}`, `POST /api/admin/activity-logs/cleanup`, `GET/PATCH/DELETE /api/admin/reservations[/id]` (§8) |
| Mevcut izin sistemi yeterli mi? | **Evet, büyük ölçüde.** `sidebar_permissions` + `authorizeAdminSession` + `callerHasPermission` (OR kümesi destekli) 120 server action'da oturmuş durumda. Route'larda JSON hata zarfını korumak için `callerHasPermission` kalıbı yeterli; **yeni helper şart değil.** Tek istisna: `storage/upload|remove` için mevcut sistemde tek bir izin karşılığı yok. |
| Mevcut adminleri bozma riski | **Var ve ölçülmeden devreye alınmamalı.** Prod'da hangi adminin hangi izne sahip olduğu **DOĞRULANAMADI**: lokal fixture DB'lerde `admin_users` tablosu yok. Kritik riskler: (1) hiç kimsede `users` yoksa yönetici erişimi kilitlenir; (2) `users` izni olmayan adminler kendi 2FA ekranına erişimi kaybeder (§9.3); (3) paylaşılan GET uçları için OR-kümesi gerekir. |
| Migration gerekiyor mu? | **Kod açısından hayır.** Yeni izin anahtarı gerekmiyor (`payment_accounts` hariç, §3.4). Prod sorgusu (§9.2) kimsede `users`/`settings` olmadığını gösterirse, 093 kalıbında idempotent bir backfill **gerekebilir** (karar gerektirir). |
| En küçük güvenli plan | §12: Faz 0 ölçüm → Faz 1 admin yönetimi + audit + settings PUT (7 dosya) → Faz 2 iş mutation'ları → Faz 3 hassas/paylaşılan GET'ler (OR kümeleri) → Faz 4 storage (SEC-10 ile birlikte). |

---

## 1. Route Sınıflandırması (80 dosya)

| Sınıf | Dosya | Handler | Koruma | Not |
|---|---|---|---|---|
| `/api/admin/**` | 44 | 69 | authN (aktif admin) | SEC-03 kapsamı |
| `/api/admin-users/**` | 2 | 3 | authN | SEC-03 kapsamı (admin yönetimi) |
| `/api/mail/*` (admin) | 8 | 8 | authN + rate limit | `/api/admin` **dışında** admin işlemi yapıyor |
| `/api/voucher/[id]` | 1 | 1 | authN (cookie veya `?token=`) | `/api/admin` **dışında** admin işlemi yapıyor |
| **Admin toplamı** | **55** | **78** | | |
| `/api/auth/*` | 5 | 5 | Login/2FA/refresh/logout/me akışı | Kapsam dışı (izin eklenmemeli) |
| `/api/cron/*` | 7 | 7 | `CRON_SECRET` (fail-closed) | Kapsam dışı |
| Public | 13 | 13 | Rate limit / token / yok | **İzin EKLENMEMELİ.** Liste: `public/*` (7), `mail/reservation-request`, `villa-zip/[token]`, `exchange-rates`, `geocode`, `health` |

`/api/admin` dışında admin işlemi yapan uçlar:
- `/api/mail/{bank-transfer-payment, payment-confirmed, payment-link, reservation-approved, reservation-cancelled, western-union-payment, voucher, test}`
- `/api/voucher/[id]`

`mail/reservation-request` public akışın parçası; bilinçli olarak auth'suz.

---

## 2. Authentication ve Authorization Ayrımı

**Authentication (kim?):** Her admin handler'ı aşağıdakilerden birini çağırıyor:
- `authorizeAdminCaller(req)` (49 dosya)
- `authorizeAdminSession()` (5 dosya: `admin/2fa/*`)
- `authorizeAdminCallerFlex(req)` (`voucher/[id]`)

Üçü de `lib/admin-route-auth.ts:50-132` → `authorizeAdminToken` üzerinden şunları yapıyor:
- access JWT doğrulaması (imza, `exp`, `typ`);
- `admin_users` lookup (önce `auth_user_id = sub`, sonra `email`);
- `is_active` kontrolü.

Sonuç: oturum yok → 401, pasif admin → 403.

**Authorization (bu işlemi yapabilir mi?):**
- API katmanında **hiç yok**. Kanıt: `grep -rlE "requirePermission|callerHasPermission|requireAdminAction" app/api` → **0 dosya**.
- Dolaylı bir kontrol de yok: API route'larının çağırdığı service/repository fonksiyonlarının hiçbiri izin kontrolü yapmıyor. `villa-review.service.ts` içindeki `requirePermission` geçişleri yalnızca yorum satırı.

**Lokal doğrulama** (kontrollü: yalnızca lokal build + sahte fixture DB, sadece GET):

| İstek | Cookie yok | Pasif admin | **Yalnız `blog` izinli admin** |
|---|---|---|---|
| `GET /api/admin-users` | 401 | 403 | **200**, 3 admin e-postası döndü |
| `GET /api/admin/settings` | 401 | 403 | **200** |
| `GET /api/admin/manual-reservations` | 401 | 403 | **200** (2,3 MB liste) |
| `GET /api/admin/reservations` | 401 | 403 | **500** `column "reservation_no" does not exist`: auth geçti, DB sorgusu çalıştı (fixture şeması eksik) |
| `GET /api/admin/activity-logs/list` | 401 | 403 | **500** `relation "admin_activity_logs" does not exist`: auth geçti, sorgu çalıştı |

Yani yalnızca `blog` iznine sahip bir admin, rezervasyon, admin ve ayar verisine giden sorguları tetikleyebiliyor. Mutation'lar kural gereği denenmedi; kod kanıtı §4'te.

---

## 3. Mevcut Permission Sistemi

### 3.1 Model

| Bileşen | Yer | Özellik |
|---|---|---|
| Veri | `admin_users.sidebar_permissions` (**jsonb** dizi; migration 013/016/018/020/064/093 `@>` / `\|\|` ile yönetiyor) | Düz anahtar listesi |
| Katalog | `app/services/admin-user.service.ts:188-298` `SIDEBAR_PERMISSIONS` (28 anahtar) | dashboard, villas, villa_types, features, rules, price_includes, locations, villa_lists, property_owners, reservations, manual_reservations, external_calendars, offer_requests, payment_methods, finance, pages, blog, menu, homepage_collection, discount_collection, messages, faqs, reviews, settings, webmaster, system_logs, activity_logs, **users** |
| Rol / super-admin | **Yok.** `lib/auth/action-authz.ts:36-39`: "is_super / owner / role / full-access bypass kavramı BULUNMUYOR" | Kalıtım yok |
| Yeni admin varsayılanı | UI tüm katalog anahtarlarını işaretli getiriyor (`users/page.tsx:274`) | `create-user` route'u body'deki **her** string'i kabul ediyor (katalog doğrulaması yok) |
| Sidebar filtresi | `maki-admin/layout.tsx:66-333` `permissionKey` ile menüyü filtreliyor | Yalnızca UI; route'u engellemiyor |
| Sunucu helper'ları | `lib/auth/action-authz.ts` | `requireAdminAction()` (yalnız auth, throw eder) · `requirePermission(key \| key[])` (throw eder `ServerActionAuthError`) · `callerHasPermission(adminId, key \| key[])` (boolean) |
| Semantik | `satisfies()` = **OR** (`required.some`) | Fail-closed: DB hatası, satır yok veya `is_active=false` → boş küme |
| İzin kaynağı | Her çağrıda DB'den (`findByIdForSession`). JWT'deki `perms` claim'i kullanılmıyor (bayat olabilir) | İzin geri alındığında hemen etkili olur |

### 3.2 Server action'larda nasıl uygulanıyor (referans desen)

136 export edilmiş server action (46 dosya), yeniden sayıldı:

| Koruma | Adet |
|---|---|
| `requirePermission(...)` (throw) | 100 |
| `authorizeAdminSession()` + `callerHasPermission(...)` (`{ok:false}` döner) | 20 |
| Yalnız `requireAdminAction()` (`revalidate.actions.ts`, cache invalidation) | 8 |
| Public (bilinçli) | 8 |

> Önceki raporda "128 auth'lu action" demiştim. Doğrusu: **120 izin kontrollü + 8 yalnız auth'lu = 128 auth'lu**, 8 public. Sayı tutarlı, ayrım şimdi netleşti.

OR kümesi emsalleri zaten mevcut:
- `["payment_accounts","settings"]` (10 action)
- `["property_owners","villas"]`
- `["reservations","manual_reservations"]` (`lib/external-calendar.admin.action.ts`)

API route'lar için uygun desen **2. desen**: route zaten `authorizeAdminCaller` ile `auth.caller.id`'yi alıyor; ardından `callerHasPermission(auth.caller.id, KEY)` false ise **403 JSON** döner. `requirePermission` route'ta **uygun değil**: fırlattığı `ServerActionAuthError` yakalanmazsa route'un mevcut `try/catch` zarfında 500'e dönüşür. **Yeni helper şart değil.** İsteğe bağlı 5-6 satırlık bir sarmalayıcı yalnızca tekrarı azaltır.

### 3.3 Aynı işlem, iki kapı, farklı koruma (tutarsızlık kanıtı)

| İşlem | Server action yolu | API yolu |
|---|---|---|
| Villa düzenleme / galeri / fiyat / indirim | `requirePermission("villas")` (villa-edit, gallery, pricing, discount action'ları) | `PUT /api/admin/villas/[id]/full`, `POST /api/admin/villas`: **izin yok** |
| iCal senkron | `requirePermission("external_calendars")` (`ical-sync.action.ts`) | `POST /api/admin/external-calendars/sync`: **izin yok** |
| Rezervasyon blok tarihleri | `requirePermission("reservations")` | `GET/PATCH/DELETE /api/admin/reservations*`: **izin yok** |
| Ayar çevirileri | `callerHasPermission(…,"settings")` | `PUT /api/admin/settings` (tüm kolonlar): **izin yok** |
| Mail logları | `requirePermission("system_logs")` | `POST /api/admin/mail-logs/cleanup`: **izin yok** |

### 3.4 Katalog tutarsızlığı (yan bulgu)

- `payment_accounts` anahtarı layout'ta (`layout.tsx:197`) ve 10 action'da kullanılıyor, ama **`SIDEBAR_PERMISSIONS` kataloğunda yok**. Kullanıcılar ekranından verilemiyor.
- Action'lar `["payment_accounts","settings"]` OR'u kullandığı için pratikte `settings` sahipleri geçiyor.
- API izni tasarlanırken bu anahtara dayanılmamalı (ya da kataloğa eklenmesi ayrı bir karar olmalı).

### 3.5 Mevcut testler

| Test | Kapsam |
|---|---|
| `tests/unit/server-action-authz.test.ts` (23 test) | Server action: yetkili ✓, yanlış izin ✓, boş izin (fail-closed) ✓, DB hatası ✓, pasif admin ✓, oturumsuz ✓, tüm izinli admin ✓, public action'lara yanlışlıkla gate eklenmemesi ✓, **kayıt taraması** (her action gate'li ya da allow-list'te) ✓ |
| `tests/unit/sec01-admin-page-auth.test.tsx` (34) | Admin server sayfaları: auth → data sırası |
| `tests/unit/auth/*` | JWT typ, login+TOTP, 2FA rate limit (`/api/admin/2fa/disable`) |
| API route testleri | `villas-route.has-discount-filter`, `admin-calendar-daily-price`, `payment-methods-route-locale`: **işlevsel**; izin testi değil |

**API route'lar için hiçbir izin testi yok:** granted / denied / wrong permission / mutation protection / registry, hiçbiri. "Super admin" testi yok (kavram yok).

---

## 4–7. Route → Permission Matrisi (78 admin handler'ının tamamı)

Sütunlar:
- **Auth:** Tüm satırlarda aktif admin doğrulaması yapılıyor (`authorizeAdminCaller`, 2FA uçlarında `authorizeAdminSession`, voucher'da `…Flex`).
- **Mevcut:** Tüm satırlarda **"yalnız auth, izin YOK"**. Tabloyu kısaltmak için tekrarlanmadı.
- **Önerilen izin:** Yalnızca **mevcut** katalog anahtarları. Kaynak: rotayı çağıran UI sayfasının sidebar izni (§6'daki çağrı haritası) ve/veya aynı işlemi yapan server action'ın izni. Çağıran birden fazla izinli sayfa olduğunda **OR kümesi** gerekir. Aksi hâlde mevcut kullanımlar kırılır.
- Karşılığı olmayan yerde **"Mevcut sistemde karşılığı yok"** yazıldı; tahmin yapılmadı.

### 4.1 Admin yönetimi / 2FA

| Route | Method | Ne yapıyor / veri | Önerilen izin (kaynak) | Risk |
|---|---|---|---|---|
| `/api/admin-users` | GET | Tüm adminlerin id, ad, **e-posta, izinleri**, `is_active`, `last_login_at`, `totp_enabled` bilgisi (`admin-user-panel.repository.server.ts:39-48`) | `users` (çağıran: `users/page.tsx`). ⚠ §9.3 (kendi 2FA UI'ı bu listeye bağlı) | HIGH |
| `/api/admin-users/[id]` | PATCH | **Başka veya kendi** admin kaydında `full_name`, `email`, `password` (hash'siz, SEC-02), **`sidebar_permissions`**, `is_active` alanlarını günceller. **Self-guard yok, audit log yok** | `users` (çağıran: users sayfası) | **CRITICAL** |
| `/api/admin-users/[id]` | DELETE | Admin siler (self-delete guard ✓, audit ✓) | `users` | HIGH |
| `/api/admin/create-user` | POST | Yeni admin oluşturur; `permissions` body'den **filtresiz** gelir (katalog dışı string bile kabul) | `users` (çağıran: `admin-user.service.ts` ← users sayfası) | **CRITICAL** |
| `/api/admin/2fa/reset` | POST | **Başka** adminin 2FA'sını ve kurtarma kodlarını siler (kendi hesabına engel ✓) | `users` (tasarım yorumu `:19-25` bu kararı açıkça "ayrı karar" olarak bırakmış) | **CRITICAL** |
| `/api/admin/2fa/enroll/start` | POST | **Kendi** TOTP secret'ını üretir | **İzin eklenmemeli** (self-service; hedef id almıyor) | LOW ✓ |
| `/api/admin/2fa/enroll/confirm` | POST | Kendi 2FA'sını etkinleştirir | İzin eklenmemeli | LOW ✓ |
| `/api/admin/2fa/disable` | POST | Kendi 2FA'sını kapatır (şifre + TOTP ile yeniden doğrulama + rate limit) | İzin eklenmemeli | LOW ✓ |
| `/api/admin/2fa/recovery-codes/regenerate` | POST | Kendi kurtarma kodları (re-auth + rate limit) | İzin eklenmemeli | LOW ✓ |

### 4.2 Denetim / log

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/activity-logs/list` | GET | `select *` audit kayıtları (before/after verileri dahil) | `activity_logs` (çağıran: `ActivityLogList`) | MEDIUM |
| `/api/admin/activity-logs/cleanup` | POST | 90 günden eski **veya TÜM** audit kayıtlarını siler (`mode:"all"`) | `activity_logs` | **HIGH** (iz silme) |
| `/api/admin/activity-logs/log` | POST | Çağıranın kendi audit kaydını yazar (`admin_user_id` sunucuda atanır) | **İzin eklenmemeli**: `lib/activity-log.client.ts` üzerinden 15 admin ekranı kullanıyor | LOW ✓ |
| `/api/admin/mail-logs/stats` | GET | Mail log sayıları | `["settings","system_logs"]` (MailLogsCard hem `settings/entegrasyonlar` hem `system-logs` sayfasında) | LOW |
| `/api/admin/mail-logs/cleanup` | POST | Mail loglarını siler (90g / tümü) | `["settings","system_logs"]` (aynı kart) | MEDIUM |

### 4.3 Ayarlar / genel site

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/settings` | GET | `select *`, **`resend_api_key` dahil** (SEC-04) | `["settings","reservations"]` (çağıranlar: 7 settings alt sayfası ve `settings.client.ts`, **ayrıca** `reservations/[id]` ve `reservations/ekle` ayar okuyor). Asıl düzeltme secret kolonunun çıkarılması (SEC-04) | **HIGH** |
| `/api/admin/settings` | PUT | Ham body ile **her kolonu** yazar (`customHead`, `analyticsScript`, `gtmId` dahil → SEC-05 XSS zinciri) | `settings` | **CRITICAL** |
| `/api/admin/exchange-rates/current` | GET | Kur | `settings` (ExchangeRatesCard: `settings/entegrasyonlar`) | LOW |
| `/api/admin/exchange-rates/refresh` | POST | TCMB kurunu çekip upsert eder (fiyat dönüşümlerini etkiler) | `settings` | MEDIUM |

### 4.4 Rezervasyon (müşteri ve finansal veri)

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/reservations` | GET | **Tüm** rezervasyonlar, sayfalama yok: ad, **telefon, telefon2**, tutarlar, `paid_amount`, depozito (`reservation.repository.server.ts:333-351`) | `reservations` (çağıranlar: rezervasyon listesi, `reservations/ekle`, layout rozeti; layout rozeti zaten yalnız izinliyse çağırıyor) | **HIGH** |
| `/api/admin/reservations` | POST | Admin rezervasyonu oluşturur | `reservations` | HIGH |
| `/api/admin/reservations` | PATCH | Durum değiştirir | `reservations` | HIGH |
| `/api/admin/reservations` | DELETE | Rezervasyon siler | `reservations` | HIGH |
| `/api/admin/reservations/[id]` | GET | `select *` (e-posta, kimlik no, adres…) + villa + ödeme yöntemi | `reservations` | **HIGH** |
| `/api/admin/reservations/[id]` | PATCH | Tam güncelleme (fiyat, ödeme, durum) | `reservations` | **HIGH** |
| `/api/admin/reservations/[id]` | DELETE | Siler | `reservations` | **HIGH** |
| `/api/admin/reservations/[id]/share-link` | POST | Müşteri paylaşım linki (token) üretir | `reservations` | MEDIUM |
| `/api/admin/reservations/[id]/share-link` | DELETE | Linki iptal eder | `reservations` | LOW |
| `/api/admin/manual-reservations` | GET | Harici blok listesi (not dahil) | `manual_reservations` (action'lar da `manual_reservations`) | MEDIUM |
| `/api/admin/manual-reservations/[id]` | GET | Detay | `manual_reservations` | LOW |
| `/api/mail/reservation-approved` | POST | Müşteriye onay maili | `reservations` (çağıran: rezervasyon ekranları) | MEDIUM |
| `/api/mail/reservation-cancelled` | POST | İptal maili | `reservations` | MEDIUM |
| `/api/mail/payment-link` | POST | Ödeme linki maili + rezervasyon güncellemesi | `reservations` (`lib/payment-link.helper` ← `reservations/[id]`) | MEDIUM |
| `/api/mail/payment-confirmed` | POST | Ödeme onayı maili + güncelleme + audit | `reservations` | MEDIUM |
| `/api/mail/bank-transfer-payment` | POST | Banka hesabı bilgili mail + güncelleme | `reservations` | MEDIUM |
| `/api/mail/western-union-payment` | POST | WU bilgili mail + güncelleme | `reservations` | MEDIUM |
| `/api/mail/voucher` | POST | Voucher maili | `reservations` | MEDIUM |
| `/api/voucher/[id]` | GET | Voucher içeriği (müşteri verisi) | `reservations` | MEDIUM |
| `/api/mail/test` | POST | Test maili gönderir | **Mevcut sistemde karşılığı yok**: kodda hiçbir UI çağıranı bulunamadı (karar: `settings` mı, kaldırılsın mı?) | LOW |

### 4.5 Mülkler (villa)

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/villas` | GET | `id, title, slug, is_active, deleted_at` listesi | `["villas","reservations","manual_reservations","homepage_collection","discount_collection","reviews"]` (7 çağıran sayfa) | LOW |
| `/api/admin/villas` | POST | Villa oluşturur | `villas` | MEDIUM |
| `/api/admin/villas/[id]` | GET | Villa ücret bağlamı (temizlik, depozito, ön ödeme oranı, havuz ısıtma) | `["villas","reservations"]` (çağıranlar: `reservations/[id]`, `reservations/ekle`, `villas/[id]/calendar`) | LOW |
| `/api/admin/villas/[id]/full` | PUT | Tam villa güncellemesi (fiyat, komisyon, `map_embed` → SEC-05) | `villas` (villa-edit action'ı da `villas`) | **HIGH** |
| `/api/admin/villas/[id]/active` | PATCH | Aktif/pasif | `villas` | MEDIUM |
| `/api/admin/villas/[id]/clone` | POST | Kopyalar | `villas` | MEDIUM |
| `/api/admin/villas/[id]/soft-delete` | POST | Çöpe atar | `villas` | MEDIUM |
| `/api/admin/villas/[id]/restore` | POST | Geri yükler | `villas` | LOW |
| `/api/admin/villas/[id]/hard-delete` | POST | **Geri dönüşsüz** siler | `villas` | **HIGH** |
| `/api/admin/villas/[id]/private-token` | POST | `private_access_token` üretir/döndürür (off-market sayfa erişimi) | `villas` | MEDIUM-HIGH |
| `/api/admin/villas/[id]/prices` | GET | Fiyat + indirim | `reservations` (yalnız rezervasyon ekranları çağırıyor) | LOW |
| `/api/admin/villas/sort-orders` | POST | Sıralama | `villas` | LOW |
| `/api/admin/villa-zip` | GET | Villa ZIP linkleri (**public indirme token'ları dahil**) | `villas` (VillaZipShareButton) | MEDIUM |
| `/api/admin/villa-zip` | POST | Public ZIP indirme linki üretir (SEC-11 SSRF zinciri) | `villas` | MEDIUM |
| `/api/admin/villa-zip/[id]/revoke` | POST | İptal | `villas` | LOW |
| `/api/admin/taxonomies` | GET | Lokasyon, tip, özellik, kural, fiyata-dahil listeleri | `["villas","offer_requests"]` (çağıranlar: `villas/ekle`, `OfferRequestList`) | LOW |
| `/api/admin/villa-locations` | GET, POST, PATCH, DELETE | Bölge CRUD | `locations` (çağıran: `locations` sayfası) | LOW / MEDIUM (mutation) |

### 4.6 Harici takvim (iCal)

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/external-calendars/sync` | POST | iCal senkronu (sunucu dış fetch) | `external_calendars` (çağıranlar: `ExternalReservationList` ve villa `IcalSyncCard`; aynı kartın action'ları zaten `external_calendars` istiyor) | MEDIUM |
| `/api/admin/external-calendars/events/[id]/deactivate` | POST | İçe aktarılmış blok olayını pasifleştirir → tarih serbest kalır (çift rezervasyon riski) | `external_calendars` | MEDIUM-HIGH |
| `/api/admin/external-calendars/sources/[id]/purge-inactive` | POST | Pasif olayları siler | `external_calendars` | MEDIUM |

### 4.7 İçerik (CMS)

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/blog` | GET / POST | Liste (taslaklar dahil) / oluştur (sanitize edilir) | `blog` | LOW / MEDIUM |
| `/api/admin/blog/[id]` | GET / PATCH / DELETE | Detay / güncelle / sil (R2 kapak görselini de siler) | `blog` | LOW / MEDIUM / MEDIUM |
| `/api/admin/pages` | GET | Sayfa listesi | `["pages","menu"]` (menü editörü de çağırıyor) | LOW |
| `/api/admin/pages` | POST / PATCH / DELETE | Oluştur / güncelle / sil (+R2 kapak) | `pages` | MEDIUM |
| `/api/admin/pages/[id]` | GET / PATCH | Detay / güncelle | `pages` | LOW / MEDIUM |
| `/api/admin/menu` | GET | Menü + sayfa/tip/lokasyon seçenekleri | `menu` | LOW |
| `/api/admin/menu` | POST / PATCH / DELETE | Menü CRUD (POST ayrıca `pages` kaydını günceller) | `menu` | MEDIUM |

### 4.8 Depolama (R2)

| Route | Method | Ne yapıyor | Önerilen izin | Risk |
|---|---|---|---|---|
| `/api/admin/storage/upload` | POST | `villa-images` / `site-assets` bucket'larına **serbest path, serbest content-type** ile yazar (SEC-10) | **Mevcut sistemde tek karşılığı yok.** Çağıranlar: villa galerisi (`villas`), tipler (`villa_types`), bölgeler (`locations`), sayfalar (`pages`), blog (`blog`), ayar logosu/branding (`settings`), zengin metin editörü. En az kırıcı seçenek bu 6 anahtarın OR kümesi; ancak bu küme pratikte neredeyse tüm içerik adminlerini kapsadığından güvenlik kazancı sınırlı. Asıl düzeltme path/tip doğrulaması (SEC-10) | **HIGH** |
| `/api/admin/storage/remove` | POST | Serbest key listesini siler | Aynı (karşılığı yok / OR kümesi) | **HIGH** |

**Sayım kontrolü:** 9 (4.1) + 5 (4.2) + 4 (4.3) + 20 (4.4) + 20 (4.5, `villa-locations`'ın 4 handler'ı dahil) + 3 (4.6) + 15 (4.7) + 2 (4.8) = **78 handler**. İzin **eklenmemesi** gereken: 5 (4 self 2FA + `activity-logs/log`). **İzin eksik: 73.**

---

## 5. Hassas Veri Döndüren GET'ler

| Route | Hassas içerik | Bugün kimler alabilir |
|---|---|---|
| `GET /api/admin/reservations` | Tüm müşterilerin ad + telefon + tutar + ödenen | Her aktif admin |
| `GET /api/admin/reservations/[id]` | `select *` (e-posta, kimlik no, adres…); ID'ler listeden alınabilir | Her aktif admin |
| `GET /api/voucher/[id]` | Voucher (müşteri + ödeme) | Her aktif admin |
| `GET /api/admin/settings` | `resend_api_key` + tüm ayarlar | Her aktif admin |
| `GET /api/admin-users` | Tüm admin e-postaları, izinleri, 2FA durumu | Her aktif admin (lokal testte `blog`'lu admin aldı) |
| `GET /api/admin/activity-logs/list` | Audit before/after verileri (PII içerebilir) | Her aktif admin |
| `GET /api/admin/villa-zip` | Public ZIP indirme token'ları | Her aktif admin |
| `POST /api/admin/villas/[id]/private-token` | Off-market villa token'ı (idempotent: mevcut olanı döndürür) | Her aktif admin |
| `GET /api/admin/manual-reservations[/id]` | Blok notları | Her aktif admin |
| Düşük hassasiyetli | villas list, villas/[id] ücret bağlamı, prices, taxonomies, menu, pages, blog, exchange-rates, mail-logs/stats | Her aktif admin |

---

## 6. UI → API Çağrı Haritası (izin tasarımının dayanağı)

Yorum satırları temizlenerek taranmış, gerçek `fetch`/`adminFetch` çağrıları (seçme):

| API | Çağıran UI (sidebar izni) |
|---|---|
| `/api/admin/villas` GET | `villas/ekle` (villas), `reservations/[id]` + `reservations/ekle` (reservations), `manual-reservations/[id]` (manual_reservations), `homepage-collection` (homepage_collection), `discount-collection` (discount_collection), `reviews/ReviewAdminList` (reviews) |
| `/api/admin/settings` | 7 × `settings/*` sayfası (settings), `reservations/[id]`, `reservations/ekle` (reservations) |
| `/api/admin/villas/[id]` GET | `reservations/[id]`, `reservations/ekle`, `villas/[id]/calendar` |
| `/api/admin/pages` GET | `pages/*` (pages), `menu` (menu) |
| `/api/admin/taxonomies` | `villas/ekle` (villas), `offer-requests` (offer_requests) |
| `/api/admin/mail-logs/*` | MailLogsCard → `settings/entegrasyonlar` (settings), `system-logs` (system_logs) |
| `/api/admin/storage/*` | `lib/storage` → AdminGallery (villas), types, locations, pages, blog, SettingsField / admin-branding (settings), RichTextEditor |
| `/api/admin/activity-logs/log` | `lib/activity-log.client.ts` → 15 admin ekranı |
| `/api/admin/reservations` GET | Layout rozeti (yalnızca `reservations` izni varsa çağırıyor, `layout.tsx:800`), rezervasyon ekranları |
| `/api/mail/test` | **Çağıran yok** |

**Sonuç:** Paylaşılan uçlara tek bir izin koymak mevcut ekranları kırar (örn. `settings` GET'e yalnız `settings` konursa `reservations` izinli admin rezervasyon düzenleyemez). Mevcut `callerHasPermission` OR kümesi desteği bu yüzden kritik.

---

## 8. Teknik Etkiye Göre En Tehlikeli 10 Endpoint

| # | Route | Neden tehlikeli (kod kanıtı) | Mevcut koruma | Gerekli authorization |
|---|---|---|---|---|
| 1 | `PATCH /api/admin-users/[id]` | Herhangi bir admin **kendine** tüm izinleri verebilir (self-guard yok), başka adminin e-posta/şifre/izin/aktiflik alanlarını değiştirebilir. **Audit kaydı yok**. Şifre hash'siz yazılıyor (SEC-02) | Aktif admin | `users` (+ ayrı karar: kendi izinlerini değiştirme kısıtı) |
| 2 | `POST /api/admin/create-user` | İstediği izinlerle yeni admin açar (kalıcı arka kapı hesabı) | Aktif admin | `users` |
| 3 | `POST /api/admin/2fa/reset` | Başka adminin 2FA'sını kaldırır. #1 ile birleşince **tam hesap ele geçirme** (e-posta ve şifreyi değiştir → 2FA'yı sıfırla → giriş yap) | Aktif admin | `users` |
| 4 | `PUT /api/admin/settings` | Her kolon yazılabilir: site geneli ham HTML/JS (`customHead`/`analyticsScript`/`gtmId`) → admin oturumlarına karşı XSS zinciri (SEC-05) | Aktif admin | `settings` (+ SEC-04 kolon whitelist'i) |
| 5 | `GET /api/admin/settings` | `resend_api_key` ifşası → alan adı adına mail gönderme | Aktif admin | `["settings","reservations"]` + secret'ın çıkarılması (SEC-04) |
| 6 | `POST /api/admin/storage/remove` | Tüm villa görsellerini / site varlıklarını silebilir (serbest key listesi) | Aktif admin | Mevcut sistemde tek karşılığı yok (OR kümesi veya SEC-10 ile kaynak bazlı) |
| 7 | `POST /api/admin/storage/upload` | CDN domaininde istenen key'e istenen içerik tipiyle yazma (HTML/SVG), mevcut görselleri ezme | Aktif admin | Aynı |
| 8 | `POST /api/admin/activity-logs/cleanup` | `mode:"all"` ile **tüm audit izini** siler: #1-3'ün izini temizler | Aktif admin | `activity_logs` |
| 9 | `GET /api/admin/reservations` (+ `[id]` GET) | Tüm müşterilerin adı, telefonu ve tutarları; detayda e-posta, kimlik no, adres (KVKK) | Aktif admin | `reservations` |
| 10 | `PATCH/DELETE /api/admin/reservations/[id]` (+ liste `DELETE`) | Fiyat, ödeme ve durum değişikliği ya da silme (finansal bütünlük) | Aktif admin | `reservations` |

Listenin hemen altındakiler: `POST /api/admin/villas/[id]/hard-delete` (geri dönüşsüz), `PUT /api/admin/villas/[id]/full` (`map_embed` XSS, komisyon), `POST /api/admin/external-calendars/events/[id]/deactivate` (çift rezervasyon).

---

## 9. Mevcut Davranışı Bozmama Analizi (en önemli bölüm)

### 9.1 Bilinenler (koddan)

| Konu | Durum |
|---|---|
| Super-admin | **Yok.** `users` izni fiilen "admin yöneticisi" olacak, ama bugün sunucu tarafında hiçbir anlamı yok (yalnızca sidebar'ı gösteriyor) |
| Yeni admin varsayılanı | UI tüm katalog anahtarlarıyla oluşturuyor (`users/page.tsx:274`) → yeni adminlerde `users` / `settings` büyük olasılıkla var |
| Geçmiş backfill'ler | 013 (homepage_collection), 016 (messages), 018 (faqs), 020 (reviews), 064 (discount_collection), 093 (blog); arşivde 022/028/029/044 (offer_requests / activity_logs / external_calendars / property_owners). **`users`, `settings`, `reservations`, `villas` için backfill yok.** Bu anahtarlar ilk tasarımdan beri var; kimde olduğu bilinmiyor |
| `payment_accounts` | Katalogda yok, UI'dan verilemiyor (§3.4) |
| JWT `perms` claim'i | Kullanılmıyor; karar her istekte DB'den. İzin değişikliği hemen etkili |

### 9.2 Bilinmeyenler: **DOĞRULANAMADI** (lokal fixture DB'lerde `admin_users` tablosu yok)

Prod'da (ya da prod kopyasında) çalıştırılması önerilen **READ-ONLY** sorgular. Kişisel veri döndürmezler: yalnızca sayım, anahtar ve id. **Bu analizde ÇALIŞTIRILMADI.**

```sql
-- Q1: Admin sayısı
select count(*) as toplam, count(*) filter (where is_active) as aktif
from public.admin_users;

-- Q2: İzin dağılımı (aktif / toplam)
select p as izin,
       count(*) filter (where u.is_active) as aktif_admin,
       count(*)                           as tum_admin
from public.admin_users u
cross join lateral jsonb_array_elements_text(coalesce(u.sidebar_permissions, '[]'::jsonb)) as p
group by p order by p;

-- Q3: İzni boş/NULL adminler
select count(*) filter (where is_active) as aktif, count(*) as toplam
from public.admin_users
where sidebar_permissions is null or jsonb_array_length(sidebar_permissions) = 0;

-- Q4: KİLİTLENME KONTROLÜ — kritik anahtarlar kaç AKTİF adminde var?
select k as anahtar,
       count(*) filter (where u.is_active and u.sidebar_permissions @> to_jsonb(array[k])) as aktif_sahip
from unnest(array['users','settings','activity_logs','reservations','villas','system_logs']) as k
cross join public.admin_users u
group by k order by k;

-- Q5: Katalog dışı anahtarlar (payment_accounts vb.)
select distinct p
from public.admin_users u
cross join lateral jsonb_array_elements_text(coalesce(u.sidebar_permissions,'[]'::jsonb)) p
where p not in ('dashboard','villas','villa_types','features','rules','price_includes','locations',
  'villa_lists','property_owners','reservations','manual_reservations','external_calendars',
  'offer_requests','payment_methods','finance','pages','blog','menu','homepage_collection',
  'discount_collection','messages','faqs','reviews','settings','webmaster','system_logs',
  'activity_logs','users');

-- Q6: Tam katalog setine sahip aktif admin sayısı (fiili "tam yetkili")
select count(*) from public.admin_users
where is_active and sidebar_permissions @> '["dashboard","villas","villa_types","features","rules",
 "price_includes","locations","villa_lists","property_owners","reservations","manual_reservations",
 "external_calendars","offer_requests","payment_methods","finance","pages","blog","menu",
 "homepage_collection","discount_collection","messages","faqs","reviews","settings","webmaster",
 "system_logs","activity_logs","users"]'::jsonb;
```

**Karar kuralı:** Bir faz, ilgili anahtar (Q4) **en az 1, tercihen en az 2 aktif adminde** yoksa devreye alınmamalı. Aksi hâlde o alan yönetilemez hâle gelir. Örnek: `users` kimsede yoksa hiç kimse admin ekleyemez veya izin veremez; kurtarma yalnızca DB üzerinden olur.

### 9.3 Kodda tespit edilen somut kırılma noktaları

1. **Kendi 2FA ekranı `GET /api/admin-users` listesine bağlı.**
   - `users/page.tsx:816` → 2FA butonu yalnızca listede **kendi satırında** render ediliyor. Liste ise `GET /api/admin-users`'tan geliyor (`:83`).
   - Bu GET'e `users` izni konursa, `users` izni olmayan adminler (bugün URL ile `/maki-admin/users`'a girip kendi 2FA'sını yönetebilirken) **kendi 2FA yönetimini kaybeder**.
   - En küçük koruyucu seçenek (karar gerekir): izinsiz çağırana listede yalnızca **kendi satırını** döndürmek. Ya da 2FA girişini listeden bağımsız kılmak (UI değişikliği).
2. **Paylaşılan GET'ler:** `settings`, `villas`, `villas/[id]`, `pages`, `taxonomies`, `mail-logs` için tek anahtar koymak §6'daki ekranları kırar → **OR kümesi zorunlu**.
3. **`users` = fiili super-admin.** `users` sahibi hâlâ kendine veya başkasına her izni verebilir. Bu mevcut modelin doğal sonucu. "Sahip olmadığın izni veremezsin" kuralı **yeni bir politika** olur; bu fazda önerilmiyor, ayrı karar.
4. **Mail uçları:** `reservations` izni olmayan ama rezervasyon ekranına URL ile giren adminin "onay maili / ödeme linki" butonları 403 alır (bugün çalışıyor). Bu kasıtlı bir sıkılaştırma; yan etki olarak listelenmeli.
5. **Storage:** tek anahtar konursa villa galerisi, tip/bölge görseli, logo, sayfa ve blog yüklemelerinden en az biri kırılır.
6. **Layout rozetleri** (rezervasyon, teklif, mesaj, yorum) zaten yalnızca izin varsa çağırıyor → etkilenmez.
7. **`activity-logs/log`** izin almazsa hiçbir ekran kırılmaz. Alırsa 15 ekranın audit kaydı sessizce düşer; **eklenmemeli**.

### 9.4 Migration gerekir mi?

- **Kod için hayır:** kullanılacak tüm anahtarlar katalogda mevcut.
- **Veri için koşullu:** Q4 sonucunda kritik bir anahtar aktif adminlerde eksikse, 093 kalıbında idempotent bir `sidebar_permissions || '["…"]'` backfill'i gerekebilir. Bu **mevcut yetki dağılımını değiştiren** bir karardır ve kullanıcı onayı gerektirir. Bu analizde migration yazılmadı.

---

## 10. Server Action Deseni: API'de Yeniden Kullanım

**Oturmuş desen:** `authorizeAdminSession()` → `callerHasPermission(auth.caller.id, KEY | KEY[])` → `false` ise `{ ok:false }` (20 action, örn. `settings-translations.action.ts:68-72`, `gallery.action.ts:80-84`).

API route'lara birebir uyarlanabilir:
- Route zaten `authorizeAdminCaller(req)` ile `auth.caller` elde ediyor. Tek ek adım `callerHasPermission` çağrısı ve `403` JSON yanıtı.
- `callerHasPermission` DB'den okuyor, fail-closed, OR kümesi destekliyor, test edilmiş (`server-action-authz.test.ts`).
- **`requirePermission` route'larda doğrudan kullanılmamalı:** throw ettiği hata route'un `catch`'inde 500'e dönüşür, istemcinin 403 beklentisini bozar.
- **Yeni helper gerekli değil.** İsteğe bağlı olarak `lib/admin-route-auth.ts` içine `authorizeAdminCaller` + `callerHasPermission` birleşimini yapan 5-6 satırlık bir sarmalayıcı eklenebilir (tekrar azaltma). Mimari değişiklik değil.
- Ek maliyet: istek başına +1 index'li `admin_users` sorgusu (server action'larla aynı).

---

## 11. Testler

**Mevcut:** §3.5. API route'ları için izin testi **yok**.

**Eksik testler** (yazılmadı, yalnızca liste):

| # | Test | Kapsam |
|---|---|---|
| T1 | İzin verildi → 200 | Her korumalı handler için doğru anahtar |
| T2 | Yanlış izin → 403 **ve repository/service çağrılmadı** (spy) | Mutation'larda özellikle |
| T3 | OR kümesi | Paylaşılan GET'lerde her üye izin tek başına yeterli |
| T4 | Oturumsuz → 401, pasif admin → 403 | Mevcut davranışın regresyon kilidi |
| T5 | DB hatası → fail-closed 403 | `callerHasPermission` davranışı |
| T6 | Self-service allow-list | 4 × 2FA self + `activity-logs/log` izinsiz çalışmaya devam eder |
| T7 | **Kayıt taraması** | `app/api/admin/**`, `app/api/admin-users/**`, admin `mail/*`, `voucher/*` altındaki her handler ya `callerHasPermission(` içeriyor ya da açık allow-list'te (server-action-authz registry deseni) |
| T8 | Public uçlara yanlışlıkla izin eklenmemesi | `public/*`, `mail/reservation-request`, `villa-zip/[token]` |
| T9 | Admin yönetimi özel | `users`'suz admin kendine izin veremez, başka admini düzenleyemez, 2FA sıfırlayamaz, admin oluşturamaz |
| T10 | 2FA UI koruması (§9.3-1) | Seçilen çözüm neyse: `users`'suz admin kendi satırını görebilir |
| T11 | Audit silme | `activity_logs`'suz admin `mode:"all"` ile silemez |

---

## 12. Minimal ve Güvenli Düzeltme Planı (kod YAZILMADI)

**Ortak kalıp (tüm fazlar):** Mevcut `authorizeAdminCaller` / `authorizeAdminSession` satırından hemen sonra `callerHasPermission(auth.caller.id, <anahtar | OR kümesi>)` çağrılır. `false` ise mevcut JSON zarfıyla `403 { ok:false, error:"Yetkisiz: bu işlem için izniniz yok" }` döner. Metin `FORBIDDEN_MESSAGE` sabitinden alınır.

Bu kalıbın özellikleri:
- Middleware, auth, JWT, cookie, DB şeması ve katalog **değişmez**.
- Her faz **ayrı commit** olur. Geri alma: `git revert <faz-commit>` (migration olmadığı için anında).

### Faz 0: Ölçüm (kod yok)

- §9.2 Q1–Q6'yı prod veya prod kopyasında çalıştırın.
- Kritik anahtarların (`users`, `settings`, `activity_logs`, `reservations`, `villas`) aktif adminlerdeki dağılımına göre faz sırasını teyit edin.
- Eksik varsa backfill kararı verin (kullanıcı onayı).
- §9.3-1 (2FA ekranı) için çözüm kararı verin.

### Faz 1: Admin yönetimi, audit, settings yazma (en kritik)

| Dosya | Handler | İzin |
|---|---|---|
| `app/api/admin-users/route.ts` | GET | `users` (§9.3-1 kararına göre: izinsize yalnız kendi satırı) |
| `app/api/admin-users/[id]/route.ts` | PATCH, DELETE | `users` |
| `app/api/admin/create-user/route.ts` | POST | `users` |
| `app/api/admin/2fa/reset/route.ts` | POST | `users` |
| `app/api/admin/activity-logs/cleanup/route.ts` | POST | `activity_logs` |
| `app/api/admin/activity-logs/list/route.ts` | GET | `activity_logs` |
| `app/api/admin/settings/route.ts` | PUT | `settings` |

- **Helper:** mevcut `callerHasPermission`.
- **Migration:** yok (Faz 0 sonucu gerektirmedikçe).
- **Davranış değişikliği:** `users`, `activity_logs` veya `settings` izni olmayan adminler bu işlemleri artık yapamaz. Bu, amaçlanan sıkılaştırma.
- **Test:** T1, T2, T4, T5, T6, T7 (allow-list'in ilk hâli), T9, T10, T11.
- **Rollback:** tek commit revert.

### Faz 2: İş mutation'ları

| Grup | Dosyalar | İzin |
|---|---|---|
| Rezervasyon | `admin/reservations/route.ts` (POST, PATCH, DELETE), `reservations/[id]/route.ts` (PATCH, DELETE), `reservations/[id]/share-link/route.ts`, admin `mail/*` (7), `voucher/[id]` | `reservations` |
| Villa | `admin/villas/route.ts` (POST), `villas/[id]/{full,active,clone,soft-delete,restore,hard-delete,private-token}`, `villas/sort-orders`, `villa-zip/**` | `villas` |
| iCal | `admin/external-calendars/**` (3) | `external_calendars` |
| İçerik | `admin/blog/**`, `admin/pages/**` (mutation), `admin/menu` (mutation), `admin/villa-locations` (mutation) | `blog`, `pages`, `menu`, `locations` |
| Ayar yan işleri | `admin/exchange-rates/refresh` → `settings`; `admin/mail-logs/cleanup` → `["settings","system_logs"]` | — |

- **Migration:** yok.
- **Davranış değişikliği:** ilgili izni olmayan ama ekrana URL ile giren adminin işlemleri 403 alır (§9.3-4).
- **Test:** grup başına T1, T2, T4. T7 kapsamı genişler.
- **`mail/test`:** çağıranı yok. Önce karar (kaldırılsın mı, `settings` mı?).
- **Rollback:** grup başına ayrı commit önerilir.

### Faz 3: Hassas ve paylaşılan GET'ler (OR kümeleri)

| Route | İzin |
|---|---|
| `admin/reservations` GET, `reservations/[id]` GET | `reservations` |
| `admin/manual-reservations[/id]` | `manual_reservations` |
| `admin/settings` GET | `["settings","reservations"]`; asıl düzeltme SEC-04 (secret'ı çıkar) |
| `admin/villas` GET | `["villas","reservations","manual_reservations","homepage_collection","discount_collection","reviews"]` |
| `admin/villas/[id]` GET | `["villas","reservations"]` |
| `admin/villas/[id]/prices` | `["reservations"]` |
| `admin/taxonomies` | `["villas","offer_requests"]` |
| `admin/pages` GET | `["pages","menu"]` |
| `admin/menu` GET | `menu` |
| `admin/blog` GET, `admin/villa-locations` GET | `blog`, `locations` |
| `admin/exchange-rates/current` | `settings` |
| `admin/mail-logs/stats` | `["settings","system_logs"]` |
| `admin/villa-zip` GET | `villas` |

- **Test:** T3 (OR kümesinin her üyesi). Ayrıca §6'daki 7 çağıran ekran için Playwright ile "sayfa açılıyor" smoke testi.
- **Risk:** en fazla kırılma potansiyeli burada. OR kümeleri eksik kalırsa ekranlar boş gelir. Faz 0 verisiyle doğrulanmalı.

### Faz 4: Storage (SEC-10 ile birlikte)

- `admin/storage/upload`, `admin/storage/remove` için mevcut sistemde tek karşılık yok.
- İki seçenek:
  - (a) 6 anahtarın OR kümesi: düşük kazanç.
  - (b) SEC-10 kapsamında bucket/path → izin eşlemesi (örn. `villas/<id>/…` → `villas`). Bu **yeni bir eşleme tasarımı** gerektirir; SEC-10 ile birlikte karar verilmeli.

### Kapsam dışı bırakılanlar (ayrı bulgular)

- SEC-02 (şifre hash).
- SEC-04 (settings secret + kolon whitelist'i).
- `admin-users` PATCH için audit log eklenmesi.
- "Sahip olmadığın izni veremezsin" politikası.
- `payment_accounts`'ın kataloğa eklenmesi.

---

## 13. Bu Aşamada Bilinçli Olarak Yapılmayanlar

- Permission ismi uydurulmadı. Tüm öneriler mevcut 28 katalog anahtarı ve mevcut OR emsallerinden türetildi. Karşılığı olmayanlar (`mail/test`, `storage/*`) açıkça işaretlendi.
- Rol, RBAC veya super-admin tasarımı önerilmedi.
- Middleware, auth, JWT, cookie değiştirilmedi.
- Migration yazılmadı. Olası backfill yalnızca Faz 0 verisine bağlı bir karar olarak bırakıldı.
- API kodu değiştirilmedi.
- "Her route'a `requirePermission` ekle" önerilmedi. `requirePermission`'ın route'ta 500'e dönüşeceği, paylaşılan GET'lerin OR kümesi gerektirdiği, self-service uçların ve `activity-logs/log`'un izinsiz kalması gerektiği ve 2FA ekranı bağımlılığı gösterildi.

---

## 14. Sonuç

| Soru | Cevap |
|---|---|
| **SEC-03 gerçek mi?** | **Evet.** Koddan satır satır ve lokal fixture üzerinde salt okunur GET ile doğrulandı. `blog` izinli bir admin, admin listesi, ayarlar ve manuel rezervasyonlara erişti; rezervasyon ve audit sorgularını tetikledi |
| Kaç route etkileniyor? | **55 dosya / 78 handler** (admin kapsamı) |
| Yalnızca authentication yapan | **78 / 78** |
| Auth + permission yapan | **0** |
| Tamamen korumasız (admin kapsamı) | **0** (`mail/reservation-request` bilinçli public; admin kapsamına sayılmadı) |
| İzni **gerekmeyen** (doğru) | **5**: 4 self 2FA + `activity-logs/log` |
| İzni eksik | **73 handler** |
| En yüksek riskli | `PATCH /api/admin-users/[id]` · `POST /api/admin/create-user` · `POST /api/admin/2fa/reset` · `PUT` + `GET /api/admin/settings` · `POST /api/admin/storage/{remove,upload}` · `POST /api/admin/activity-logs/cleanup` · `GET` + `PATCH/DELETE /api/admin/reservations[/id]` |
| Mevcut izin sistemi yeterli mi? | **Evet** (`sidebar_permissions` + `callerHasPermission` + OR kümeleri). İstisna: `storage/*` için karşılık yok; `payment_accounts` katalogda eksik |
| Mevcut adminleri bozma riski | **Var:** (1) prod izin dağılımı bilinmiyor (Q1–Q6); (2) `users`'suz adminlerin kendi 2FA ekranı; (3) paylaşılan GET'ler OR kümesi gerektiriyor; (4) URL ile girilen ama izni olmayan ekranlarda işlemler 403 alacak |
| Migration gerekiyor mu? | **Kod için hayır.** Veri için yalnızca Faz 0 kritik anahtar eksikliği gösterirse (karar gerektirir) |
| En küçük güvenli plan | Faz 0 ölçüm → Faz 1 (8 handler, 7 dosya: admin yönetimi + audit + settings PUT, `callerHasPermission`) → Faz 2 iş mutation'ları → Faz 3 OR kümeli hassas GET'ler → Faz 4 storage (SEC-10 ile). Her faz ayrı commit; rollback = revert |

---

## Son Kontrol

```
CODE CHANGES:   0
DB CHANGES:     0   (lokal fixture'a yalnızca GET istekleri; prod'a bağlantı yok)
CONFIG CHANGES: 0
COMMIT: NO
PUSH:   NO
DEPLOY: NO
```

- **Önce ve sonra:** HEAD `ba57261` (değişmedi).
- Takip edilen dosyalarda diff yok.
- Tek yeni dosya: bu rapor (`Claude outputs/security-sec03-analysis.md`, untracked).
