# Kapsamlı Teknik & Güvenlik Denetimi — tatilin-yeri-next

**Tarih:** 26.09.2026
**Kapsam:** Kaynak ağacın tamamı (HEAD `a2e4be1 fix: secure admin permissions`). Cihazdaki çalışma ağacı temiz; yalnız iki patch dosyası untracked. Cihaz ile analiz kopyasının kaynak hash'i aynı: `bb2c4d3f…627a5d`.
**Yöntem:** Sadece okuma yapıldı. Hiçbir dosya, config, env, DB veya R2 değiştirilmedi. Commit, push ve deploy yapılmadı. Production'a hiçbir bağlantı kurulmadı.
**Kanıt türleri:**

- Kaynak kod okuması: satır referanslarıyla.
- Unit test çalıştırması: 201 dosya, **4131 test geçiyor**.
- Yerel izole PG16 + moto-S3 üzerinde önceki görevlerde yapılan HTTP/E2E ölçümleri.
- Bu denetimde yerel olarak yapılan regex benchmark'ı.

**Doğrulanamayanlar:**

- Canlı production DB şeması, rolleri ve yedekleri.
- Coolify panel ayarları.
- Sunucu işletim sistemi ve firewall.
- Cloudflare önünde WAF veya rate-limit olup olmadığı.

Bu kalemler raporda **"doğrulanamadı"** olarak işaretlendi. Yerel PG denetimin DB bölümü sırasında kapalıydı. Bu yüzden DB bulguları kod ve migration dosyalarından çıkarıldı; canlı şema ile karşılaştırılmadı.

> **Not:** Denetim ajanlarından biri "117 değiştirilmiş / 79 untracked dosya, HEAD efa1726" rapor etti. Bu **yanlış**: bulut analiz kopyasındaki eski git metadata'sına bakılmış. Cihazdaki gerçek repo commit'li (HEAD `a2e4be1`). Bu bulgu rapordan çıkarıldı.

---

## Yönetici Özeti

**GENEL PUAN: 57/100.** Hesap: 54 alan puanının aritmetik ortalaması, 3084 / 54 = 57,1.

Güvenlik temeli iyi seviyede:

- Parametrik query compiler var.
- Argon2id + TOTP + HttpOnly `__Host-` çerezler kullanılıyor.
- DB tabanlı izin kontrolü var.
- SSRF koruması güçlendirildi.
- Rezervasyonlar arası çakışma DB'de EXCLUDE constraint ile engelleniyor.

Asıl zayıflıklar dört alanda toplanıyor:

1. **İşletme / altyapı:** yedek, monitoring, CI, Docker, güvenlik header'ları.
2. **Rezervasyon iş kuralları:** manuel blok çakışması, min. konaklama, bekleyen rezervasyonların süresiz kalması.
3. **Tek istekle DoS:** ReDoS.
4. **Birkaç yetki / veri bütünlüğü açığı:**
   - şifre değişikliği,
   - storage silme yolları,
   - iCal ile blokların toplu silinmesi,
   - villa hard-delete.

Önceden kapatılan H-03 SSRF ve admin yetki bypass açıkları **tekrar açılmamış**. Kanıtlar en sondaki ayrı bölümde.

---

## A) GÜVENLİK DENETİMİ

Her bulgu şu alanlarla verildi: Severity, Confidence, Dosya / Route / Fonksiyon / Satır, Problem, Gerçek etki, Saldırı senaryosu, Mevcut koruma, Eksik koruma, Önerilen çözüm.

### A-01 · Tek istekle event-loop kilitlenmesi (ReDoS)

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **HIGH** |
| Confidence | **CONFIRMED** (yerel benchmark) |
| Dosya | `app/api/public/reservation-lookup/route.ts` |
| Route | `POST /api/public/reservation-lookup` |
| Fonksiyon / Satır | `POST`, L79 |
| Aynı regex'in diğer yeri | `app/api/admin/create-user/route.ts` L96 (admin, düşük risk) |
| Kullanılan regex | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |

**Problem:** Regex ikinci dereceden (O(n²)) backtracking'e giriyor. Girdi uzunluğu sınırsız.

**Gerçek etki:** Bu denetimde ölçüldü. Girdi `"a@" + "."×n + "@"`:

| n | Süre |
|---|---|
| 10.000 | 0,22 sn |
| 25.000 | 1,4 sn |
| 50.000 | 5,1 sn |

Node tek thread çalıştığı için bu sürede **tüm site** (public + admin) yanıt veremez.

**Saldırı senaryosu:**

- 60 KB'lık tek bir JSON gövdesi ≈ 7 sn kilit.
- Rate limit IP başına. XFF değiştirilerek veya birkaç IP ile saniyede birkaç istek atmak siteyi sürekli kapalı tutar.

**Mevcut koruma:** Upstash rate limit var. Ancak fail-open çalışıyor ve IP'yi XFF'den alıyor.

**Eksik koruma:**

- Uzunluk sınırı yok (e-posta ≤ 254, kod ≤ 32).
- Body boyutu sınırı yok.

**Çözüm:**

- Regex'ten önce `email.length > 254` ise reddet.
- Doğrusal çalışan bir kontrole geç: tek `@` + `lastIndexOf('.')`.
- Aynı düzeltmeyi create-user'da da uygula.

---

### A-02 · Admin şifre değişikliği yanlış kolona düz metin yazıyor

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **HIGH** |
| Confidence | **CONFIRMED** (kod) |
| Dosya | `app/api/admin-users/[id]/route.ts` |
| Route | `PATCH /api/admin-users/[id]` |
| Satır | L115-118: `payload.password = input.password.trim()` |

**Problem:**

- Login `password_hash` kolonunu (Argon2id) okuyor.
- PATCH ise `password` alanını düz metin yazıyor. Kolon varsa şifre açık metin saklanır; yoksa DB hatası döner.
- Her iki durumda da **şifre değişmez**.
- Şifre değişince oturumlar iptal edilmiyor. Bu, önceki denetimdeki **H-04**; hâlâ açık.

**Gerçek etki:**

- Ele geçirildiğinden şüphelenilen bir hesabın şifresi panelden "değiştirildiğinde" eski şifre çalışmaya devam eder.
- Açık metin kolon varsa DB dökümünde şifreler görünür.

**Saldırı senaryosu:**

1. Saldırgan phishing ile şifreyi ele geçirir.
2. Yönetici panelden şifreyi değiştirir ve sorunun çözüldüğünü düşünür.
3. Saldırgan eski şifreyle erişmeye devam eder.

**Mevcut koruma:** Endpoint `users` izni istiyor.

**Eksik koruma:** Argon2 hash, minimum şifre politikası, oturum iptali (`revokeAllForAdmin`).

**Çözüm:**

- PATCH'te `hashPassword()` ile `password_hash` yaz.
- Ardından `revokeAllForAdmin(id)` çağır.
- Server-side audit kaydı ekle.
- **Canlı DB doğrulaması:** `password` kolonunun varlığı ve içeriği canlı DB'de kontrol edilmeli (doğrulanamadı).

---

### A-03 · Storage silme yolları bucket/prefix yetki kontrolünü atlıyor

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **HIGH** |
| Confidence | **LIKELY** (kod; E2E yapılmadı) |

**Dosyalar:**

- `app/(admin)/maki-admin/villas/[id]/galeri/gallery.action.ts` L48 `addGalleryImage`: herhangi bir URL string'ini DB'ye yazıyor.
- `app/services/villa-admin/_helpers/storage-cleanup.ts` L47: `parseVillaStorageUrl` ile bucket+path ayrıştırıp siliyor.
- Sayfa kapak silme akışı.

**Problem:** API route'ları (`/api/admin/storage/upload|remove`) `storagePermissionFor(bucket, path)` ile korunuyor. Server action / servis katmanındaki silme yolları ise DB'deki URL'den bucket ve path çıkarıp **hiçbir prefix kontrolü yapmadan** siliyor.

**Gerçek etki:** Yalnız `villas` izinli bir admin, site-assets bucket'ındaki dosyaları (logo, favicon, blog görselleri vb.) silebilir.

**Saldırı senaryosu:**

1. `addGalleryImage(villaId, "<cdn>/tatilinyeri-site-assets/logo/logo.webp")` çağrılır.
2. Görsel silinir veya villa hard-delete edilir.
3. Site logosu R2'den silinir.

**Mevcut koruma:** Action seviyesinde `villas` izni kontrolü var.

**Eksik koruma:**

- URL'nin ilgili villa prefix'ine (`villas/<slug>__<id>/`) ait olduğunun doğrulanması.
- Silme öncesi `storagePermissionFor` kontrolü.

**Çözüm:**

- `addGalleryImage` yalnız kendi bucket'ı ve `villas/<id>` prefix'indeki URL'leri kabul etsin.
- Tüm silme yolları tek bir `assertStorageDeleteAllowed(caller, bucket, path)` kontrolünden geçsin.

---

### A-04 · Pending rezervasyonla takvim kilitleme + min. konaklama yalnız client'ta

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **HIGH** |
| Confidence | **CONFIRMED** (kod) |
| Route | `POST /api/public/reservations` |
| Dosya | `app/api/public/reservations/route.ts` ve rezervasyon servisi |

**Problem:**

- Pending rezervasyonlar EXCLUDE constraint'e dahil. Yani tarihi bloke ediyor.
- Captcha yok.
- Maksimum gece sayısı yok.
- Pending süresi dolmuyor.
- Villanın aktif/silinmiş olup olmadığı kontrol edilmiyor.
- `min_stay` yalnız client'ta kontrol ediliyor.

**Gerçek etki:** Bir rakip veya bot, tüm villaların tüm sezonunu birkaç istekle "dolu" gösterebilir.

**Saldırı senaryosu:**

- Her villa için 1 Haziran – 30 Eylül tarihlerinde sahte isimle pending rezervasyon.
- Rate limit IP başına olduğu için birkaç IP yeterli.

**Mevcut koruma:**

- Rate limit (fail-open).
- Fiyat server'da hesaplanıyor (SEC-06).

**Eksik koruma:** Max nights, server-side min stay, pending TTL (ör. 24-48 saat → expire), aktif villa kontrolü, captcha/turnstile.

**Çözüm:**

- Server'da `min_stay` ve `max_nights` kontrolü.
- `is_active && deleted_at IS NULL` kontrolü.
- Pending kayıtları expire eden bir cron.
- Turnstile.

---

### A-05 · Public e-posta endpoint'i tekrar oynatılabilir (mail relay / bombing)

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **HIGH** |
| Confidence | **CONFIRMED** (kod) |
| Route | `POST /api/mail/reservation-request` |
| Dosya / Satır | `app/api/mail/reservation-request/route.ts` L55 |

**Problem:**

- Endpoint yetkisiz çağrılabiliyor.
- Aynı rezervasyon için sınırsız mail tetiklenebiliyor.
- Yanıt alıcı adresini geri döndürüyor.

**Gerçek etki:**

- Müşteriye ve ofise mail bombardımanı.
- Resend kotasının tükenmesi.
- Domain itibarının (SPF/DKIM reputation) düşmesi.

**Saldırı senaryosu:** Script ile aynı istek dakikada onlarca kez gönderilir.

**Mevcut koruma:** Rate limit (fail-open, XFF'ye güveniyor).

**Eksik koruma:** Rezervasyon başına "mail gönderildi" bayrağı / idempotency; rezervasyon oluşturma ile aynı işlemde server-side tetikleme.

**Çözüm:**

- Maili `POST /api/public/reservations` içinde server tarafında gönder.
- Public endpoint'i kaldır veya idempotent yap.

---

### A-06 · `custom_head_scripts` → admin origin'inde stored XSS (yetki yükseltme zinciri)

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod; tasarım gereği) |
| Dosya | `app/components/layout/SiteTrackingScripts.tsx` L37 |

**Problem:**

- `settings` izinli bir admin keyfi `<script>` ekleyebiliyor.
- Public site ile admin paneli aynı origin'de.
- CSP yalnız Report-Only modunda.

**Gerçek etki:**

- `settings` admini, `users` iznine sahip bir adminin tarayıcısında kod çalıştırıp `/api/admin-users/[id]` PATCH ile kendine tüm izinleri verebilir.
- `__Host-admin_at` HttpOnly olduğu için çalınamaz. Ancak aynı origin'den `fetch` ile istek atılabilir.

**Mevcut koruma:** Yalnız `settings` izni.

**Eksik koruma:** Enforce edilen CSP, admin için ayrı subdomain, script alanı için yalnız `users`/owner yetkisi.

**Çözüm:**

- Alanı ayrı ve daha yüksek bir izne bağla.
- Script'leri yalnız public layout'ta render et (admin sayfalarında değil). Mevcut durumda doğrulanmalı.
- Uzun vadede admini ayrı origin'e taşı.

---

### A-07 · Güvenlik header'ları eksik

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** |
| Dosya | `next.config.ts` L187-203 |

**Problem:**

- Yalnız `Content-Security-Policy-Report-Only` var; `unsafe-inline` içeriyor.
- Şunlar yok: HSTS, `X-Frame-Options` / `frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- `poweredByHeader` açık.

**Gerçek etki:**

- Admin paneli iframe'lenebilir (clickjacking).
- HTTPS'e düşürme penceresi var.
- MIME sniffing mümkün (upload bulgusu A-09 ile birleşiyor).

**Mevcut koruma:** Cloudflare/Coolify tarafında header eklenip eklenmediği **doğrulanamadı**.

**Çözüm:** `headers()`'a HSTS, XFO=DENY (admin), nosniff, Referrer-Policy ve Permissions-Policy ekle; `poweredByHeader:false`. CSP'yi Report-Only'den enforce moduna geçirmek ayrı bir fazda yapılmalı.

---

### A-08 · Rate limit fail-open + XFF'ye güveniyor; login'de IP throttle yok

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod) |
| Dosyalar | rate-limit helper, `app/api/auth/login/route.ts` |

**Problem:**

- Upstash hata verirse veya yapılandırılmamışsa tüm istekler geçiyor.
- IP ilk `X-Forwarded-For` değerinden alınıyor. Proxy zinciri doğrulanmıyor.
- Login'de IP bazlı limit yok; yalnız hesap kilidi var.
- Kilit sayacı atomik olmayan read-modify-write ile güncelleniyor.

**Gerçek etki:**

- Parola püskürtme (spraying) yapılabilir.
- Argon2 CPU flood'u mümkün: her deneme ≈ 50-100 ms CPU.
- Paralel isteklerle kilit eşiği aşılabilir.

**Çözüm:**

- IP'yi Cloudflare `CF-Connecting-IP` veya güvenilir proxy'den al.
- Login ve kritik public endpoint'lerde fail-closed çalış.
- Login'e IP limiti ekle.
- Sayacı atomik `UPDATE … SET failed = failed + 1 RETURNING` ile güncelle.

---

### A-09 · Upload'da MIME/uzantı/boyut kontrolü yok

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod) |
| Route / Dosya | `POST /api/admin/storage/upload` → `app/api/admin/storage/upload/route.ts` |

**Problem:**

- `contentType` client'tan geliyor.
- Uzantı, magic-byte ve boyut kontrolü yok.
- Key'de `..` ve format doğrulaması yok.
- `upsert:false` yok sayılıyor.

**Gerçek etki:**

- Yetkili bir admin CDN'e `text/html` veya SVG (script'li) yükleyebilir. CDN ayrı origin olduğu için admin çerezleri risk altında değil; ancak phishing sayfası barındırılabilir.
- Mevcut dosyalar üzerine yazılabilir.

**Çözüm:**

- Allowlist: webp/jpeg/png/avif (+ svg yalnız sanitize edilerek).
- Magic-byte kontrolü.
- Boyut limiti (ör. 10 MB).
- Key regex'i.

---

### A-10 · Oturum iptali eksik

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod) |

**Problem:**

- `revokeAllForAdmin` hiçbir yerden çağrılmıyor.
- Access token (15 dk) oturum tablosuna karşı kontrol edilmiyor. Logout veya pasifleştirme sonrası token 15 dk geçerli kalıyor. `is_active` DB'den okunduğu için pasifleştirme anında etkili; logout ise etkisiz.
- Refresh token reuse detection yok.
- TOTP kodu aynı pencere içinde tekrar kullanılabiliyor.
- 2FA reset/enroll işlemleri yeniden kimlik doğrulama istemiyor.

**Çözüm:**

- Şifre değişikliği, 2FA reset ve pasifleştirmede `revokeAllForAdmin` çağır.
- JWT'ye `sid` koy ve oturum aktifliğini kontrol et.
- Kullanılmış TOTP adımını sakla.

---

### A-11 · Kullanıcı yönetiminde koruma yok

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod) |

**Problem:**

- `users` izinli bir admin kendi izinlerini değiştirebilir.
- Son aktif yöneticiyi pasifleştirebilir veya silebilir. "Last-admin" koruması yok.
- `sidebar_permissions` değerleri katalogdaki 28 anahtarla doğrulanmıyor.
- PATCH için server-side audit yok.

**Etki:** `users` pratikte süper-admin. Tek hata ile tüm admin erişimi kaybedilebilir.

**Çözüm:**

- Son aktif `users` sahibini koru.
- İzinleri katalogla doğrula.
- Kendi izinlerini değiştirmeyi engelle.
- Audit kaydı ekle.

---

### A-12 · Audit log'ları taklit edilebilir ve silinebilir

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **MEDIUM** |
| Confidence | **CONFIRMED** (kod) |

**Dosyalar:**

- `app/api/admin/activity-logs/log/route.ts`: her admin istediği içerikle kayıt yazabiliyor.
- `app/api/admin/activity-logs/cleanup/route.ts` L14: `mode:"all"` tüm kayıtları sildiği halde bu silme işlemi iz bırakmıyor.

**Problem:**

- Hassas işlemlerin çoğu audit'i client tarafından tetikliyor. Server-side audit yok.
- Etkilenen işlemler: settings PUT, admin-users PATCH, ödeme hesabı action'ları, storage işlemleri, rezervasyon status değişikliği.

**Gerçek etki:** İçeriden gelen kötüye kullanım sonradan tespit edilemez.

**Çözüm:**

- Audit'i server'da, işlemle aynı yerde yaz.
- `log` endpoint'ini yalnız UI olayları için sınırla.
- `mode:"all"` kaldırılmalı veya silme işleminin kendisi kaydedilmeli.

---

### A-13 · Hata mesajı / bilgi sızıntısı

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **LOW** |
| Confidence | **CONFIRMED** |

**Problem:**

- ≈45 route ham `error.message` döndürüyor: DB constraint ve kolon adları. Bunların birkaçı public.
- `resend_api_key` settings GET ile `settings` izinli admine gidiyor (browser'a düşüyor).
- `/api/health` sürüm bilgisi ifşa ediyor.
- Login yanıtı pasif / kilitli hesap ayrımıyla kullanıcı listelemeye (enumeration) izin veriyor.

**Çözüm:**

- Genel hata mesajı döndür, ayrıntıyı server log'una yaz.
- Secret alanları maskele (`••••` + "değiştir").

---

### A-14 · `/api/geocode` yetkisiz proxy

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **LOW-MEDIUM** |
| Confidence | **CONFIRMED** |

**Problem:**

- Endpoint herkese açık Nominatim proxy'si.
- Ham sorgu log'lanıyor.

**Etki:** Sunucu IP'si Nominatim'den ban yiyebilir (kullanım politikası).

**Çözüm:** Admin yetkisi iste veya sıkı rate limit uygula; cache ekle.

---

### A-15 · CSRF

**Özet:**

| Alan | Değer |
|---|---|
| Severity | **LOW** |
| Confidence | **LIKELY** |

**Durum:**

- Access çerezi SameSite=Lax, refresh çerezi Strict.
- Admin API'leri JSON bekliyor.
- Origin kontrolü yok.

**Etki:** Kalan risk düşük. Aynı site kapsamındaki bir subdomain XSS'i veya form-urlencoded kabul eden bir endpoint sorun yaratabilir.

**Çözüm:** Mutasyonlarda `Origin`/`Sec-Fetch-Site` kontrolü.

---

### A-16 · Diğer düşük önemli bulgular

| Bulgu | Severity | Confidence |
|---|---|---|
| Cron secret karşılaştırması sabit zamanlı değil (`===`) | LOW | CONFIRMED |
| Contact formunda `elapsedMs` (bot tuzağı) değerini client gönderiyor | LOW | CONFIRMED |
| Voucher `?token=` query parametresi hâlâ kabul ediliyor (log/Referer sızıntısı) | LOW | CONFIRMED |
| Token kimliği email fallback'iyle çözülüyor (`auth_user_id` hiç set edilmiyor) | INFO | CONFIRMED |
| Şifre minimumu 6 karakter | LOW | CONFIRMED |
| JWT'de `kid`/`iss`/`aud` yok; anahtar rotasyonu zor | INFO | CONFIRMED |
| `middleware.ts` Next 16'da deprecated (`proxy.ts`). Yalnız yönlendirme yapıyor, güvenlik ona bağlı değil. | INFO | CONFIRMED |

**Güçlü kontroller (açık bulunmadı):**

- **SQL injection:** query compiler tüm değerleri bind ediyor, identifier'lar regex ile sınırlı. Ham `sql` birleştirmesi bulunmadı.
- **Command injection:** `child_process`/`eval` kullanımı yok.
- **JSON-LD:** `<` kaçışı yapılıyor.
- **Blog/sayfa HTML'i:** `sanitize-html` ile temizleniyor.
- **`NEXT_PUBLIC_` değişkenleri:** secret yok.
- **CORS:** başlığı yok (same-origin).

---

## B) ADMIN PANEL AUDIT

### B.1 Mimari

- **Sayfa koruması:** 28 bölüm `layout.tsx` + `AdminSectionGuard` ile korunuyor. Sıra: oturum (`authorizeAdminSession`) → DB izni (`callerHasPermission`, fail-closed) → içerik.
- **Veri çeken 6 Server Component sayfa:** veri okumadan önce ayrıca `adminPermissionGate` çağırıyor.
- **Kök layout** (`maki-admin/layout.tsx`, ≈1.140 satır, client): yalnız menüyü gizliyor, güvenlik ona bağlı değil.

### B.2 Route → Permission Tablosu

| Sayfa | Gereken izin | Koruma |
|---|---|---|
| `/maki-admin` | dashboard | layout guard |
| `/maki-admin/villas/**` | villas | layout guard + server sayfa gate |
| `/maki-admin/types` | villa_types | layout guard |
| `/maki-admin/features` | features | layout guard |
| `/maki-admin/rules` | rules | layout guard |
| `/maki-admin/price-includes` | price_includes | layout guard |
| `/maki-admin/locations` | locations | layout guard |
| `/maki-admin/villa-listesi` | villa_lists | layout guard |
| `/maki-admin/property-owners` | property_owners | layout guard |
| `/maki-admin/reservations/**` | reservations | layout guard + server gate |
| `/maki-admin/manual-reservations/**` | manual_reservations | layout guard |
| `/maki-admin/external-reservations` | external_calendars | layout guard |
| `/maki-admin/offer-requests` | offer_requests | layout guard |
| `/maki-admin/payment-methods` | payment_methods | layout guard |
| `/maki-admin/payment-accounts` | payment_accounts **veya** settings | layout guard |
| `/maki-admin/maki-finans` | finance | layout guard + server gate |
| `/maki-admin/pages/**` | pages | layout guard |
| `/maki-admin/blog/**` | blog | layout guard |
| `/maki-admin/menu` | menu | layout guard |
| `/maki-admin/homepage-collection` | homepage_collection | layout guard |
| `/maki-admin/discount-collection` | discount_collection | layout guard |
| `/maki-admin/messages` | messages | layout guard + server gate |
| `/maki-admin/faqs` | faqs | layout guard |
| `/maki-admin/reviews` | reviews | layout guard |
| `/maki-admin/settings` | settings | layout guard |
| `/maki-admin/webmaster` | webmaster | layout guard |
| `/maki-admin/system-logs` | system_logs | layout guard + server gate |
| `/maki-admin/activity-logs` | activity_logs | layout guard |
| `/maki-admin/users` | users | layout guard + server gate |
| `/maki-admin/login` | — (public) | — |

### B.3 Kalan admin panel riskleri

1. **`users` = fiili süper-admin** (A-11). Rol ayrımı yok. Kendi izinlerini düzenleme ve son admin koruması yok.
2. **`settings` izni fazla güçlü:** script enjeksiyonu (A-06) ve Resend API anahtarını açık görme (A-13).
3. **Server action silme yollarında prefix kontrolü yok** (A-03).
4. **Yetkisiz sayfa yanıtı HTTP 200 + in-stream `NEXT_REDIRECT`:** kök layout client component olduğu için. Güvenlik sorunu değil; veri sızmıyor (E2E ile doğrulandı). Ancak izleme ve log'larda 307 görünmüyor.
5. **Kök client layout her sayfada badge'ler için tam listeleri çekiyor** (performans bölümü). İzni olmayan listeler için API 403 dönüyor; veri sızmıyor.
6. **2FA self route'ları** (enroll/confirm/disable/recovery) bilinçli olarak izinsiz. Ancak yeniden kimlik doğrulama istemiyor (A-10).

---

## C) API AUDIT

### C.1 Endpoint tablosu

Tablo kaynak koddan otomatik çıkarıldı (80 route dosyası). "Auth" sütunu: `A` = `authorizeAdminCaller` (cookie JWT + DB `is_active`), `S` = `authorizeAdminSession`, `F` = `authorizeAdminCallerFlex`, `C` = `CRON_SECRET`, `—` = public. "RL" = rate limit.

**Admin — kullanıcılar & 2FA**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin-users` | GET | A | users | — |
| `/api/admin-users/[id]` | PATCH, DELETE | A | users | **A-02 şifre hatası**, A-11 |
| `/api/admin/create-user` | POST | A | users | ReDoS regex (admin) |
| `/api/admin/2fa/enroll/start`, `/enroll/confirm`, `/disable`, `/recovery-codes/regenerate` | POST | S | self (bilinçli) | yeniden kimlik doğrulama yok |
| `/api/admin/2fa/reset` | POST | S | users | — |

**Admin — log'lar**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin/activity-logs/list` | GET | A | activity_logs | — |
| `/api/admin/activity-logs/cleanup` | POST | A | activity_logs | `mode:"all"` iz bırakmadan siler |
| `/api/admin/activity-logs/log` | POST | A | herhangi admin (bilinçli) | içerik taklit edilebilir |
| `/api/admin/mail-logs/stats`, `/cleanup` | GET, POST | A | system_logs | — |

**Admin — içerik (blog, sayfa, menü, konum)**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin/blog`, `/blog/[id]` | GET, POST, PATCH, DELETE | A | blog | — |
| `/api/admin/pages` | GET | A | pages **veya** menu | — |
| `/api/admin/pages` | POST, PATCH, DELETE | A | pages | — |
| `/api/admin/pages/[id]` | GET, PATCH | A | pages | — |
| `/api/admin/menu` | CRUD | A | menu | — |
| `/api/admin/villa-locations` | CRUD | A | locations | — |
| `/api/admin/taxonomies` | GET | A | villas **veya** offer_requests | — |

**Admin — ayarlar, kur, takvim**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin/settings` | GET | A | settings (tam satır) / reservations (yalnız `prepayment_rate`) | `resend_api_key` açık dönüyor |
| `/api/admin/settings` | PUT | A | settings | server audit yok |
| `/api/admin/exchange-rates/current`, `/refresh` | GET, POST | A | settings | — |
| `/api/admin/external-calendars/sync`, `/events/[id]/deactivate`, `/sources/[id]/purge-inactive` | POST | A | external_calendars | DB-02 boş feed |

**Admin — rezervasyonlar**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin/manual-reservations`, `/[id]` | GET | A | manual_reservations | — |
| `/api/admin/reservations` | GET, POST, PATCH, DELETE | A | reservations | liste sınırsız (PERF-01) |
| `/api/admin/reservations/[id]` | GET, PATCH, DELETE | A | reservations | status serbest metin (DB-05) |
| `/api/admin/reservations/[id]/share-link` | POST, DELETE | A | reservations | — |

**Admin — storage & villa**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/admin/storage/upload`, `/remove` | POST | A | `storagePermissionFor(bucket, path)` | MIME/boyut kontrolü yok (A-09) |
| `/api/admin/villas` | GET | A | VILLA_SELECT_LIST_READERS (6 izin) | — |
| `/api/admin/villas` | POST | A | villas | — |
| `/api/admin/villas/[id]`, `/[id]/prices` | GET | A | villas **veya** reservations | — |
| `/api/admin/villas/[id]/full`, `active`, `clone`, `soft-delete`, `restore`, `hard-delete`, `private-token`, `sort-orders` | PUT, PATCH, POST | A | villas | hard-delete sırası (DB-03) |
| `/api/admin/villa-zip`, `/[id]/revoke` | GET, POST | A | villas | — |

**Mail & voucher**

| Endpoint | Metot | Auth | İzin | Not |
|---|---|---|---|---|
| `/api/mail/voucher`, `payment-link`, `payment-confirmed`, `reservation-approved`, `reservation-cancelled`, `bank-transfer-payment`, `western-union-payment` | POST | A | reservations | — |
| `/api/mail/test` | POST | A | settings **veya** system_logs | — |
| `/api/mail/reservation-request` | POST | — | RL | **A-05 replay** |
| `/api/voucher/[id]` | GET | F | reservations (veya paylaşım token'ı) | `?token=` query kabul ediliyor |

**Auth**

| Endpoint | Metot | Auth | Not |
|---|---|---|---|
| `/api/auth/login` | POST | — | IP limiti yok (A-08) |
| `/api/auth/2fa/verify` | POST | — (pre-auth token) | RL var; TOTP tekrar kullanılabilir |
| `/api/auth/refresh`, `/logout`, `/me` | POST, GET | çerez | reuse detection yok |

**Cron**

| Endpoint | Metot | Auth | Not |
|---|---|---|---|
| `/api/cron/*` (7 adet) | GET | C (`authorizeCronRequest`) | sabit zamanlı olmayan karşılaştırma |

**Public**

| Endpoint | Metot | Auth | Not |
|---|---|---|---|
| `/api/public/reservations` | POST | — (RL) | **A-04**, alan uzunlukları sınırsız |
| `/api/public/reservation-lookup` | POST | — (RL) | **A-01 ReDoS** |
| `/api/public/contact`, `/offer-requests` | POST | — (RL) | `elapsedMs` client'tan geliyor |
| `/api/public/villas/[id]/availability`, `/blocked-ranges` | GET | — (RL) | — |
| `/api/public/payment-methods`, `/taxonomies` | GET | — | yalnız public alanlar |
| `/api/exchange-rates` | GET | — | her sayfa görüntülemesinde çağrılıyor (PERF) |
| `/api/geocode` | GET | — (RL) | A-14 |
| `/api/villa-zip/[token]` | GET | token (RL) | H-03 kapalı |
| `/api/health` | GET | — | sürüm ifşası |
| `/api/csp-report` | POST | — | boyut sınırı kontrol edilmeli |

### C.2 "Login olmuş herhangi bir admin hangi API'leri doğrudan çağırarak veri okuyabilir/değiştirebilir?"

**Hiç izni olmayan ama aktif admin:**

- Yalnız kendi 2FA route'larını kullanabilir: enroll, disable, recovery kodları.
- `/api/auth/me` çağırabilir.
- `/api/admin/activity-logs/log` ile audit tablosuna **sahte kayıt** yazabilir.

Bunların dışındaki 73 admin handler 403 döner. Kanıt:

- E2E testinde 30 yetkisiz mutasyonun 30'u da 403 döndü ve DB değişmedi.
- 135 unit test.

**Bölüm izinli bir admin:**

- Yalnız kendi bölümüne ve yukarıdaki OR kümelerine erişir.
- Örnek: `reservations` izinli admin villa detay/fiyatlarını okuyabilir (fiyat hesaplama için meşru ihtiyaç).
- Settings için yalnız `prepayment_rate` alanını görür.

**İstisnalar (yetki modelinin dışına taşan yollar):**

1. `villas` izinli admin → server action silme yolları üzerinden **başka bucket/prefix'teki dosyaları silebilir** (A-03).
2. `settings` izinli admin → `custom_head_scripts` üzerinden `users` adminin tarayıcısında kod çalıştırarak yetki yükseltebilir (A-06). Ayrıca Resend anahtarını okuyabilir.
3. `users` izinli admin → her şeyi yapabilir (kendine tüm izinleri verebilir).

---

## D) DB AUDIT

> Yerel PG denetim sırasında kapalıydı. Bulgular migration'lar + repository kodu üzerinden çıkarıldı. **Canlı production şeması doğrulanamadı.**

### D.1 Şema ve bütünlük

**DB-06 · Şema sıfırdan kurulamaz — HIGH, CONFIRMED**

- Çekirdek tabloların DDL'i repoda yok: `villa`, `reservations`, `admin_users`, `settings`…
- Migration numaralarında boşluklar var: 026, 027, 034, 037, 038, 040, 042, 049, 069.
- Migration ledger / runner yok.
- Migration 070 Supabase'e özgü `auth.uid()` kullanıyor; native PG'de çalışmaz.

**Etki:** Felaket anında şema yalnız yedekten geri gelebilir. Staging/test DB'si kurulamaz.

**DB-04 · Kısmi PATCH'te alanlar sıfırlanabilir — MEDIUM, LIKELY**

- Query builder'da `undefined` değer NULL olarak bağlanıyor.
- Kısmi PATCH'lerde istemcinin göndermediği alanlar sıfırlanabilir.

**DB-05 · Rezervasyon status serbest metin — MEDIUM, CONFIRMED**

- `reservations/[id]` PATCH `status` alanını serbest metin olarak kabul ediyor.
- CHECK/enum olup olmadığı canlı DB'de doğrulanamadı.

**DB-07 · Transaction yok — MEDIUM, CONFIRMED**

Çok adımlı işlemler (villa kaydetme, clone, hard-delete, iCal sync) transaction içinde değil. Yarıda kalırsa tutarsız veri kalır.

**DB-08 · Audit tablosu değiştirilebilir — MEDIUM, CONFIRMED**

- Audit tablosu uygulama rolü tarafından silinebilir ve yazılabilir.
- Append-only değil.

### D.2 Güvenlik

**SEC-DB-01 · Tek rol, sınırsız yetki — MEDIUM, CONFIRMED (kod) / doğrulanamadı (rol yetkileri)**

- Uygulama tek bir DB rolü kullanıyor. RLS yok (native PG'ye geçişte kaldırılmış).
- `sslmode=require` modunda `rejectUnauthorized:false`: TLS var ama sertifika doğrulanmıyor, MITM mümkün (`lib/db/pg.client.ts` L45).
- `statement_timeout` / `idle_in_transaction_session_timeout` yok.
- Havuz boyutu 10.
- Rolün superuser olup olmadığı **doğrulanamadı**.

### D.3 Rezervasyon çift satış (double-booking) soruları

| Soru | Cevap | Kanıt |
|---|---|---|
| İki online rezervasyon aynı tarihe düşebilir mi? | **Hayır.** DB garantisi var. | EXCLUDE USING gist (villa_id, daterange) — migration 001/030; pending + confirmed kapsamda |
| Rezervasyon ↔ harici (iCal) blok çakışması? | Rezervasyon eklerken **engelleniyor**. | migration 031 trigger |
| Rezervasyon ↔ **manuel blok** çakışması? | **Evet, olabilir (DB-01, HIGH, CONFIRMED kod).** | Arada DB constraint yok. Kontrol yalnız uygulamada ve atomik değil (race). Admin status/update yolları (iptal edilmiş rezervasyonu tekrar aktif etme dahil) hiç kontrol etmiyor. |
| Eşzamanlı iki istek (race)? | Rezervasyon↔rezervasyon güvenli. Manuel blok yolunda **race var**. | — |
| iCal senkronu mevcut blokları bozabilir mi? | **Evet (DB-02, HIGH).** | Boş veya bozuk feed (kaynak geçici hata verip 200 + boş gövde döndüğünde) **tüm harici blokları pasifleştiriyor**. Takvim bir anda boş görünür → çift satış. |
| Fiyat periyotları çakışabilir mi? | **Evet (BL-04).** | Arama ve checkout farklı satırı seçebilir → farklı fiyat. |

**DB-03 · Villa hard-delete sırası — HIGH, CONFIRMED (kod)**

- Dosya: `app/services/villa-admin/hard-delete.service.ts` L56-76.
- Mevcut sıra:
  1. Önce storage dosyaları silinir.
  2. Sonra görsel, fiyat ve ilişki kayıtları `Promise.all` ile silinir.
  3. **En son** villa satırı silinir.
- Villa silme FK nedeniyle başarısız olursa (ör. rezervasyonu var), görseller, fiyatlar ve R2 dosyaları **geri dönülemez şekilde gitmiş** olur, villa ise durur.

**Çözüm:**

- Önce FK ön-kontrolü yap; rezervasyonu olan villa silinmesin.
- DB işlemlerini tek transaction'da yap.
- Storage'ı commit'ten **sonra** sil.

### D.4 İş kuralı bulguları (DB kaynaklı)

| ID | Bulgu | Severity |
|---|---|---|
| BL-01 | Min. konaklama yalnız client'ta kontrol ediliyor | HIGH |
| BL-02 | Pasif veya silinmiş villaya rezervasyon kabul ediliyor | MEDIUM |
| BL-03 | Pending rezervasyonlar süresiz blok tutuyor | HIGH (A-04 ile birlikte) |
| BL-04 | Çakışan fiyat periyotları | MEDIUM |
| BL-05 | Komisyon, fiyat veya tarih değişince yeniden hesaplanmıyor | MEDIUM |
| BL-06 | Döviz kurunun ne kadar eski olduğu kontrol edilmiyor (TCMB çekimi başarısız olursa eski kur kullanılır) | MEDIUM |
| BL-07 | DST geçişlerinde gece sayısı hesabı (`Date` farkı / 86400000) sapabilir | LOW |
| BL-08 | Kapasite (kişi sayısı) server'da zorunlu tutulmuyor | LOW |
| BL-09 | iCal'de `STATUS:CANCELLED` ve eksik `DTEND` doğru işlenmiyor | LOW |

### D.5 Index ve performans

- **PERF-03:** Sık filtrelenen kolonlarda index eksik. Örnekler: `reservations(status, check_in)`, `villa_prices(villa_id, start_date)`, `activity_logs(created_at)`.
- Eksik index'ler canlı `pg_stat_user_indexes` ile karşılaştırılmadı → **doğrulanamadı**.

---

## E) STORAGE / R2

| ID | Bulgu | Severity | Confidence |
|---|---|---|---|
| STO-02 | Server action / servis silme yolları `storagePermissionFor`'u atlıyor (A-03) | HIGH | LIKELY |
| STO-01 | Upload'da MIME/uzantı/boyut/magic-byte kontrolü yok; `contentType` client'tan geliyor (A-09) | MEDIUM | CONFIRMED |
| STO-03 | Key'de `..` ve format doğrulaması yok. S3 key'lerinde `..` dizin atlamaz, ama beklenmedik prefix'lere yazmaya izin verir. `upsert:false` yok sayılıyor → üzerine yazma. | MEDIUM | CONFIRMED |
| STO-04 | `Cache-Control: "3600"` geçersiz değer (`max-age=` yok) → CDN/tarayıcı varsayılan davranışa düşer | LOW | CONFIRMED |
| STO-05 | Yetim dosyalar: iptal edilen upload'lar, değiştirilen kapaklar | LOW | CONFIRMED |
| STO-06 | Private (token'lı) villaların görselleri public bucket'ta; URL tahmin edilirse erişilebilir | LOW | CONFIRMED |
| STO-07 | `next/image` `remotePatterns`'ta `*.supabase.co` wildcard → image optimizer başkasının Supabase projesi için proxy olarak kullanılabilir | LOW-MED | CONFIRMED |
| STO-08 | ZIP indirme görsel başına soket açıyor; eşzamanlılık sınırı sınırlı | LOW | LIKELY |

**Güçlü taraflar:**

- CDN host'ları env'den geliyor (`NEXT_PUBLIC_CDN_BASE_*`); hardcode yok.
- Bucket allowlist'i var.
- API upload/remove yolları prefix bazlı izin kontrolü yapıyor.
- R2 anahtarları yalnız server'da.

---

## F) PERFORMANS

**CRITICAL:** yok.

**HIGH**

- **PERF-01 · Admin rezervasyon listesi sınırsız.**
  - Sayfalama yok.
  - Her satır için villanın tüm görselleri join'leniyor.
  - Rezervasyon sayısı arttıkça yanıt süresi ve bellek doğrusal büyür.
- **PERF-02 · `/arama` tüm kataloğu çekiyor.**
  - Cache yok, `SELECT *`.
  - Filtreleme ve fiyat hesabı Node'da yapılıyor.
- **ARCH-01 · EN/DE sayfalar cache'lenmiş 404 olabilir.**
  - Build sırasında çoklu dil kapalıysa EN/DE sayfalar 404 olarak prerender edilip cache'leniyor.
  - Ayar açılsa da yeniden build'e kadar 404 kalır.

**MEDIUM**

- **Villa detay:** dinamik render, istek başına ≈12 sorgu, ISR yok.
- **Her sayfa görüntülemesinde cache'siz çağrılar:**
  - `CurrencyContext` → `/api/exchange-rates`,
  - TopBar settings,
  - hero action'ları.
- **Admin kök layout:** badge sayıları için tam listeleri çekiyor (reservations, messages, offers…).
- **Bundle boyutu (gzip):**
  - ana sayfa 276 KB, villa detay 239 KB;
  - `react-datepicker` 16 route'ta eager yükleniyor (≈45 KB);
  - 3 dil sözlüğü de public chunk'ta.
- **Cache etiketleri eksik:**
  - homepage/discount koleksiyonları `villas` tag'ine bağlı değil;
  - revalidation client tarafından tetikleniyor;
  - blog `revalidatePath` `/en` ve `/de`'yi kaçırıyor.

**LOW**

- Galeri ham `<img>` kullanıyor (STO-09).
- Fiyat hesabında gece-gece döngü (PERF-04).
- Recovery-code Argon2 doğrulaması seri çalışıyor (10 × Argon2).

---

## G) KOD KALİTESİ — "Proje büyüdükçe teknik borç nerede?"

**Metrikler:**

- 856 dosya, 159.868 satır; satırların %26'sı yorum.
- 19 dosya 1.000 satırı aşıyor.
- 125 `any`, 48 `as unknown as`, 137 `eslint-disable`, 44 `console.log`, 151 `"use client"`.

**Borcun yoğunlaştığı yerler:**

1. **Rezervasyon / fiyat alanı:**
   - Kural mantığı client, servis ve route katmanlarına dağılmış.
   - Tek bir "domain service" yok.
   - Min stay, kapasite ve fiyat periyodu gibi kurallar birden çok yerde, ya da hiçbir yerde değil.
2. **Dev dosyalar:**
   - admin kök layout (1.140 satır, client),
   - villa formu,
   - rezervasyon ekranları.
   - Değişiklik riski yüksek, test edilebilirlik düşük.
3. **Şema yönetimi:** DB-06. Her yeni özellik manuel SQL'e bağımlı.
4. **Eski sağlayıcı artıkları:**
   - 209 "eski sağlayıcı" yorumu,
   - supabase host wildcard'ı,
   - kopyalanmış mail/cron route'ları.
5. **Aşırı yorum / dokümantasyon:**
   - Faz notları kodun içinde.
   - `Claude outputs/` altında 33 md dosyası.
   - Gerçek davranışla uyuşmayan yorumlar var: ör. "Sentry" yazıyor ama Sentry kurulu değil.
6. **Kaynak metin testleri:** 65 test dosyası kodu string olarak arıyor. Refactor'da kırılgan, davranışı doğrulamıyor.

**İyi yanlar:**

- Repository katmanı var.
- `server-only` sınırları var.
- Tek izin haritası var.
- Sıkı TypeScript.

---

## H) NEXT.JS MİMARİSİ

### Yanlış veya gereksiz client component'ler

| Bileşen | Sorun | Öneri |
|---|---|---|
| `app/(admin)/maki-admin/layout.tsx` (≈1.140 satır, `"use client"`) | Menü, badge fetch, oturum yenileme ve UI tek dosyada. Yetkisiz yönlendirmeler bu yüzden HTTP 200 + stream redirect olarak dönüyor. | Server layout + küçük client adaları (menü toggle, badge). Badge'ler için tek bir `count` endpoint'i. |
| `CurrencyContext` | Her sayfada client fetch (`/api/exchange-rates`) | Kurları server'dan prop olarak geçir veya `unstable_cache` / `"use cache"` kullan. |
| Villa galerisi | Ham `<img>`, client | `next/image` + server render. |
| `react-datepicker` | 16 route'ta eager import | `next/dynamic` ile lazy yükle. |
| Sözlükler (TR/EN/DE) | Hepsi public chunk'ta | Locale başına dinamik import. |

### Diğer mimari bulgular

- **ARCH-01:** EN/DE 404'lerin build'de cache'lenmesi (bkz. F).
- **ARCH-03:** Hiçbir yerde `error.tsx`, `global-error.tsx` veya `loading.tsx` yok. Hata olunca Next varsayılan ekranı çıkar; yükleme sırasında boş ekran.
- **I18N-01:** `<html lang="tr">` sabit. EN/DE sayfalar da `tr` olarak işaretleniyor (SEO ve erişilebilirlik).
- **SEO:**
  - Villa detayda soft 404: bulunamayan villa 200 + boş içerik döndürüyor, `notFound()` çağrılmıyor.
  - `/rezervasyon-kontrol` indexlenebilir durumda.
- **AUTH-16:** `middleware.ts` Next 16'da deprecated; yeni adı `proxy.ts`. Şu an çalışıyor, ancak gelecek major sürümde kırılma riski var.
- **Doğru kullanılanlar:**
  - Public sayfaların çoğu Server Component.
  - Veri erişimi `server-only` repository'lerde.
  - `revalidateTag` altyapısı mevcut.

---

## I) DEVOPS — "Sunucu hacklenirse saldırgan neye erişir?"

### Ortam değişkenleri ve kapsamları

| Değişken | Ele geçirilirse |
|---|---|
| `DATABASE_URL` (tek rol, RLS yok) | **Tüm DB:** müşteri PII, rezervasyonlar, admin hash'leri, ödeme hesapları, settings içindeki Resend anahtarı |
| `AUTH_JWT_SECRET` | Herhangi bir admin için **token üretme** (tam panel erişimi, 2FA atlanır) |
| `TOTP_ENCRYPTION_SECRET` | DB ile birlikte tüm TOTP secret'larının çözülmesi |
| `S3_*` (R2) | Tüm bucket'lara yazma/silme: görsel değiştirme, site içeriğinin tahribi |
| `RESEND_*` / DB'deki anahtar | Kendi domain'inizden **phishing maili** |
| `CRON_SECRET` | Cron tetikleme (düşük etki) |
| `UPSTASH_*` | Rate limit sayaçlarını sıfırlama → limitlerin fiilen kapanması |

### Bulgular

- **OPS-02 / DB-06 (HIGH):** Şema yeniden kurulamıyor (bkz. D).
- **OPS-03 (HIGH, doğrulanamadı):**
  - Repoda yedek, PITR veya geri yükleme prosedürü yok.
  - Coolify veya sunucu tarafında yedek olup olmadığı **doğrulanamadı**.
  - Geri yükleme testi kanıtı yok.
- **OPS-04:** Dockerfile, `.dockerignore` ve `output:"standalone"` yok.
  - Nixpacks kullanılıyor; container büyük ve muhtemelen root olarak çalışıyor (**doğrulanamadı**).
  - Build context'e `.env*` girip girmediği Coolify ayarına bağlı.
- **OPS-05:** `/api/health` sığ: DB/R2 ping'i yok ve sürüm ifşa ediyor.
- **OPS-06:** Cron dokümanı eskimiş (7 cron var, 4'ü dokümante).
- **OPS-07:**
  - Açılışta env doğrulaması yok (eksik secret'ta çalışma zamanı hatası).
  - `.env.example` yok; `.gitignore` onu da hariç tutuyor.
- **OPS-08:** PG `statement_timeout` yok, `rejectUnauthorized:false` (require modunda), graceful shutdown'da pool kapatılmıyor.
- **MON-01:**
  - Hata izleme/APM yok (yorumlarda Sentry geçiyor ama kurulu değil).
  - Uptime ve alarm kanıtı yok.
- **LOG-03:** Log'lardaki IP adresleri XFF'den geldiği için taklit edilebilir.
- **LOG-04:** Log'larda PII var (e-posta, ham geocode sorgusu).

---

## J) TEST / QA

**Mevcut durum:**

- 201 test dosyası, **4131 test geçiyor** (vitest). Bu denetimde yeniden koşulmadı; son tam koşu admin-authz düzeltmesinden sonra.
- Güçlü kapsanan alanlar: SSRF guard (70 test), admin API izinleri (135), section guard (5), SEC-01/03/05/06, fiyat hesaplama.

**Eksikler:**

- **QA-01 (HIGH):**
  - CI yok (GitHub Actions veya benzeri).
  - Coverage paketi kurulu değil → kapsam ölçülemiyor.
- **QA-02 (HIGH):** Gerçek DB entegrasyon testi yok. Test edilmeyen kritik parçalar:
  - query compiler / builder,
  - EXCLUDE constraint,
  - iCal sync.
  E2E (Playwright) test paketi de yok. Önceki görevlerdeki E2E'ler geçici script'lerdi.
- **QA-03:** 65 dosya kaynak kodu metin olarak arıyor. Refactor'a karşı kırılgan; davranışı doğrulamıyor.
- **Test edilmeyen kritik iş kuralları:**
  - rezervasyon ↔ manuel blok çakışması,
  - pending TTL,
  - min stay,
  - hard-delete sırası,
  - boş iCal feed'i.

---

## K) İŞ MANTIĞI HATALARI

| # | Hata | Etki | Severity |
|---|---|---|---|
| K-1 | Rezervasyon ↔ manuel blok DB ile korunmuyor; admin status değişikliği kontrolsüz (DB-01) | **Çift satış** | HIGH |
| K-2 | Boş/bozuk iCal feed'i tüm harici blokları pasifleştiriyor (DB-02) | Airbnb/Booking rezervasyonları takvimden kaybolur → çift satış | HIGH |
| K-3 | Min stay yalnız client'ta (BL-01) | API ile 1 gecelik rezervasyon | HIGH |
| K-4 | Pending süresiz + captcha yok (BL-03 / A-04) | Takvim kilitleme saldırısı | HIGH |
| K-5 | Villa hard-delete sırası (DB-03) | Geri dönülemez veri kaybı | HIGH |
| K-6 | Admin şifre değişikliği çalışmıyor (A-02) | Güvenlik sanrısı | HIGH |
| K-7 | Pasif/silinmiş villaya rezervasyon (BL-02) | Olmayan villaya ön ödeme | MEDIUM |
| K-8 | Çakışan fiyat periyotları (BL-04) | Aramada ve checkout'ta farklı fiyat | MEDIUM |
| K-9 | Komisyon yeniden hesaplanmıyor (BL-05) | Finans raporları hatalı | MEDIUM |
| K-10 | Eski döviz kuru kontrolü yok (BL-06) | Yanlış TL/EUR tutarı | MEDIUM |
| K-11 | Kısmi PATCH `undefined`→NULL (DB-04) | Sessiz veri silinmesi | MEDIUM |
| K-12 | DST gece hesabı, kapasite, iCal CANCELLED (BL-07/08/09) | Kenar durumlarda hata | LOW |

---

## L) PUAN TABLOSU

Durum bantları:

- 90-100 = çok güçlü
- 80-89 = iyi
- 70-79 = kabul edilebilir
- 60-69 = dikkat gerektiriyor
- 0-59 = ciddi problem

### Güvenlik (1–16)

| # | Alan | Puan | Durum | En önemli sorun |
|---|---|---|---|---|
| 1 | Genel Sistem Sağlığı | 62 | dikkat gerektiriyor | Ops/yedek/izleme eksik; iş kuralı açıkları |
| 2 | Güvenlik | 66 | dikkat gerektiriyor | ReDoS, şifre değişikliği, header'lar |
| 3 | Authentication | 70 | kabul edilebilir | PATCH şifre düz metin/yanlış kolon (A-02) |
| 4 | Authorization/RBAC | 72 | kabul edilebilir | `users` = süper-admin; storage silme bypass'ı |
| 5 | API Security | 64 | dikkat gerektiriyor | Public mail replay, sınırsız alanlar |
| 6 | SSRF | 85 | iyi | iCal fetch'te TOCTOU ve boyut sınırı yok |
| 7 | XSS | 74 | kabul edilebilir | `custom_head_scripts` + enforce edilmeyen CSP |
| 8 | CSRF | 74 | kabul edilebilir | Origin kontrolü yok (SameSite=Lax'e bağlı) |
| 9 | SQL Injection | 93 | çok güçlü | — (parametrik compiler) |
| 10 | Command/Code Injection | 96 | çok güçlü | — |
| 11 | Path Traversal | 65 | dikkat gerektiriyor | Storage key doğrulaması yok |
| 12 | File Upload | 55 | ciddi problem | MIME/boyut/uzantı kontrolü yok |
| 13 | R2/Storage | 50 | ciddi problem | Silme yolları izin kontrolünü atlıyor |
| 14 | Session/Cookie | 68 | dikkat gerektiriyor | Oturum iptali yok, refresh reuse tespiti yok |
| 15 | Secret/Env | 60 | dikkat gerektiriyor | Resend anahtarı DB'de ve browser'da; env doğrulaması yok |
| 16 | Admin Panel | 64 | dikkat gerektiriyor | Son admin koruması yok; settings XSS zinciri |

### Veri ve uygulama katmanı (17–29)

| # | Alan | Puan | Durum | En önemli sorun |
|---|---|---|---|---|
| 17 | Database Security | 58 | ciddi problem | Tek rol, RLS yok, sertifika doğrulanmıyor |
| 18 | Schema/Integrity | 48 | ciddi problem | Şema yeniden kurulamaz; manuel blok constraint'i yok |
| 19 | Server-side | 70 | kabul edilebilir | Transaction yok; hata sızıntısı |
| 20 | Client-side | 64 | dikkat gerektiriyor | Kurallar client'ta (min stay) |
| 21 | Next.js/React Mimarisi | 58 | ciddi problem | Dev client admin layout; `error.tsx` yok; EN/DE 404 cache |
| 22 | TypeScript | 66 | dikkat gerektiriyor | 125 `any`, 48 `as unknown as` |
| 23 | Code Quality | 60 | dikkat gerektiriyor | 19 dosya >1.000 satır |
| 24 | Code Organization | 60 | dikkat gerektiriyor | Domain kuralları dağınık |
| 25 | Architecture | 62 | dikkat gerektiriyor | Rezervasyon domain servisi yok |
| 26 | SOLID/SoC | 64 | dikkat gerektiriyor | UI + veri + kural aynı dosyalarda |
| 27 | Error Handling | 55 | ciddi problem | Error boundary yok; `error.message` sızıntısı |
| 28 | Logging/Audit | 35 | ciddi problem | Audit taklit edilebilir/silinebilir; server audit yok |
| 29 | Cache/Revalidation | 55 | ciddi problem | Eksik tag'ler; client tetiklemeli revalidate |

### Performans ve dayanıklılık (30–43)

| # | Alan | Puan | Durum | En önemli sorun |
|---|---|---|---|---|
| 30 | Performance | 48 | ciddi problem | `/arama` tam tarama; sınırsız admin listesi |
| 31 | SSR/RSC/Client | 62 | dikkat gerektiriyor | Villa detay tamamen dinamik |
| 32 | SEO | 70 | kabul edilebilir | Soft 404; `lang` sabit |
| 33 | i18n | 52 | ciddi problem | EN/DE 404 cache; `<html lang="tr">` |
| 34 | Image/Media | 55 | ciddi problem | Ham `<img>`; geçersiz Cache-Control |
| 35 | DB Query Performance | 50 | ciddi problem | `SELECT *`, index eksikleri |
| 36 | N+1 | 70 | kabul edilebilir | Liste başına görsel join'i |
| 37 | Memory/CPU | 62 | dikkat gerektiriyor | Tüm katalog bellekte; Argon2 flood |
| 38 | DoS | 32 | ciddi problem | **Tek istekle ReDoS** |
| 39 | Rate Limiting | 50 | ciddi problem | Fail-open + XFF |
| 40 | Input Validation | 48 | ciddi problem | Uzunluk/şema doğrulaması yok |
| 41 | Output Validation | 76 | kabul edilebilir | Sanitize iyi; JSON-LD kaçışı var |
| 42 | API Response Security | 58 | ciddi problem | Hata sızıntısı, secret alanlar |
| 43 | CORS/Headers | 35 | ciddi problem | HSTS/XFO/nosniff yok; CSP yalnız rapor modunda |

### Operasyon ve sürdürülebilirlik (44–54)

| # | Alan | Puan | Durum | En önemli sorun |
|---|---|---|---|---|
| 44 | Deployment/Prod Security | 50 | ciddi problem | Env doğrulaması yok; sığ health check |
| 45 | Docker | 30 | ciddi problem | Dockerfile/standalone yok; muhtemelen root |
| 46 | Coolify | 40 | ciddi problem | Yapılandırma repoda değil (doğrulanamadı) |
| 47 | Postgres Security | 55 | ciddi problem | Timeout yok, tek rol, TLS doğrulaması yok |
| 48 | Backup/DR | 15 | ciddi problem | Yedek/geri yükleme kanıtı yok + şema kurulamaz |
| 49 | Monitoring | 20 | ciddi problem | APM/alarm yok |
| 50 | Test/QA | 55 | ciddi problem | CI yok; DB/E2E testi yok |
| 51 | Maintainability | 45 | ciddi problem | Dev dosyalar, doküman kalabalığı |
| 52 | Scalability | 45 | ciddi problem | Tam tarama + bellek içi filtreleme |
| 53 | Technical Debt | 40 | ciddi problem | Şema yönetimi, eski sağlayıcı artıkları |
| 54 | Production Readiness | 48 | ciddi problem | Yedek + izleme + header + DoS |

### **GENEL PUAN: 57/100**

**Hesap:** 54 alanın toplamı **3084**. 3084 / 54 = **57,11** → **57/100**.

**Yorum:** Uygulama güvenliğinin çekirdeği güçlü (SQLi 93, Command 96, SSRF 85). Ortalamayı işletme alanları (yedek 15, monitoring 20, Docker 30, header 35, logging 35) ve DoS aşağı çekiyor.

---

### L.2 Alan gerekçeleri

Her alan için: **G** = Güçlü, **E** = Eksik, **R** = Risk, **K** = Kanıt, **Ö** = Öneri.

**1. Genel Sistem Sağlığı — 62**

- **G:** Testler geçiyor. Temel güvenlik doğru kurulmuş.
- **E:** Yedek, izleme ve CI yok.
- **R:** Veri kaybı ve fark edilmeyen kesinti.
- **K:** Bölüm I, J.
- **Ö:** P0/P1 listesi.

**2. Güvenlik — 66**

- **G:** Parametrik SQL, Argon2id, 2FA, DB izinleri, SSRF koruması.
- **E:** Header'lar, ReDoS, şifre değişikliği, storage silme.
- **R:** DoS ve yetki kayması.
- **K:** A-01 … A-16.
- **Ö:** P0 maddeleri.

**3. Authentication — 70**

- **G:**
  - Argon2id, TOTP (AES-GCM ile şifreli).
  - `__Host-` HttpOnly çerez, 15 dk token, hash'lenmiş refresh token + rotasyon, hesap kilidi.
- **E:** Şifre PATCH hatası, oturum iptali, TOTP tekrar kullanımı, 6 karakter şifre.
- **R:** Ele geçirilmiş hesap kapatılamaz.
- **K:** `admin-users/[id]` L115-118.
- **Ö:** Hash + revoke.

**4. Authorization/RBAC — 72**

- **G:**
  - 73/78 handler + 28 layout DB izniyle korunuyor.
  - 135 + 5 test.
  - E2E: 30/30 yetkisiz mutasyon 403.
- **E:** Rol hiyerarşisi yok; storage silme bypass'ı; izin whitelist'i yok.
- **R:** `villas` admini başka varlıkları silebilir.
- **K:** A-03, A-11.
- **Ö:** Prefix kontrolü + last-admin koruması.

**5. API Security — 64**

- **G:** Tüm admin API'leri korumalı; fiyat server'da hesaplanıyor (SEC-06).
- **E:** Public mail replay, sınırsız alanlar, rate limit fail-open.
- **R:** Mail bombing, veri şişirme.
- **K:** C.1 tablosu.
- **Ö:** Zod şemaları + idempotency.

**6. SSRF — 85**

- **G:**
  - DNS pinning, manuel redirect, IPv6/hex/octal IP ayrıştırma.
  - 70 test.
  - E2E: 5 sızıntı → 0.
- **E:** iCal: doğrulama sonrası düz `fetch` (TOCTOU), gövde sınırı yok. Supabase wildcard.
- **R:** Düşük (DNS rebinding yalnız iCal'de).
- **K:** "Daha Önce Kapatılan" bölümü.
- **Ö:** iCal'i de `safeGetStream`'e taşı.

**7. XSS — 74**

- **G:** `sanitize-html`, JSON-LD kaçışı, React escape.
- **E:** `custom_head_scripts` ham render ediliyor; CSP yalnız rapor modunda + `unsafe-inline`.
- **R:** Settings admini → yetki yükseltme.
- **K:** A-06.
- **Ö:** Ayrı izin + enforce edilen CSP.

**8. CSRF — 74**

- **G:** SameSite Lax/Strict, JSON gövdeler.
- **E:** Origin kontrolü yok.
- **R:** Düşük.
- **K:** A-15.
- **Ö:** `Sec-Fetch-Site` kontrolü.

**9. SQL Injection — 93**

- **G:** Compiler tüm değerleri bind ediyor; identifier'lar regex ile sınırlı.
- **E:** Compiler'ın kendi entegrasyon testi yok.
- **R:** Çok düşük.
- **K:** `lib/db/query-compiler.ts`.
- **Ö:** Compiler için test ekle.

**10. Command/Code Injection — 96**

- **G:** `child_process`/`eval`/`new Function` kullanımı yok.
- **E:** —
- **R:** Çok düşük.
- **K:** grep.
- **Ö:** —

**11. Path Traversal — 65**

- **G:** Dosya sistemine yazma yok; S3 key'leri.
- **E:** Key format/prefix doğrulaması yok.
- **R:** Beklenmedik prefix'lere yazma/silme.
- **K:** STO-03.
- **Ö:** Key regex'i.

**12. File Upload — 55**

- **G:** Bucket allowlist'i, prefix izni.
- **E:** MIME, boyut, magic-byte ve uzantı kontrolü.
- **R:** HTML/SVG barındırma, büyük dosya.
- **K:** A-09.
- **Ö:** Allowlist + limit.

**13. R2/Storage — 50**

- **G:** CDN env'den geliyor; anahtarlar server'da.
- **E:** Silme bypass'ı, geçersiz Cache-Control, yetim dosyalar.
- **R:** Site varlıklarının silinmesi.
- **K:** Bölüm E.
- **Ö:** Merkezi silme kontrolü.

**14. Session/Cookie — 68**

- **G:** `__Host-`, HttpOnly, Secure, refresh Strict + rotasyon.
- **E:** Revoke yok, reuse detection yok, `sid` kontrolü yok.
- **R:** Logout sonrası 15 dk.
- **K:** A-10.
- **Ö:** JWT'ye `sid` claim'i.

**15. Secret/Env — 60**

- **G:** `NEXT_PUBLIC_` değişkenlerinde secret yok.
- **E:** Resend anahtarı DB'de ve browser'da; env doğrulaması ve `.env.example` yok.
- **R:** Anahtar sızıntısı.
- **K:** A-13, OPS-07.
- **Ö:** Anahtarı env'e taşı ve maskele.

**16. Admin Panel — 64**

- **G:** Guard mimarisi doğru.
- **E:** Last-admin koruması, kendi iznini düzenleme engeli, server audit.
- **R:** Kilitlenme; içeriden kötüye kullanım.
- **K:** Bölüm B.
- **Ö:** B.3 listesi.

**17. Database Security — 58**

- **G:** Parametrik sorgular.
- **E:** Tek rol, RLS yok, TLS doğrulaması yok, timeout yok.
- **R:** Uygulama sızarsa tüm DB açılır.
- **K:** `pg.client.ts` L45/61.
- **Ö:** Ayrı rol + `statement_timeout`.

**18. Schema/Integrity — 48**

- **G:** Rezervasyonlar için EXCLUDE constraint, 031 trigger'ı.
- **E:** Çekirdek DDL yok; manuel blok constraint'i yok; transaction yok.
- **R:** Çift satış; felaket sonrası kurulamama.
- **K:** Bölüm D.
- **Ö:** `pg_dump --schema-only` baseline + ledger.

**19. Server-side — 70**

- **G:** `server-only` sınırları, repository katmanı.
- **E:** Transaction yok, hata sızıntısı.
- **R:** Tutarsız veri.
- **K:** DB-07.
- **Ö:** Transaction helper'ı.

**20. Client-side — 64**

- **G:** Hassas veri client'ta yok.
- **E:** İş kuralları client'ta; büyük bundle.
- **R:** Kural atlatma.
- **K:** BL-01.
- **Ö:** Kuralları server'a taşı.

**21. Next.js/React Mimarisi — 58**

- **G:** Public tarafta RSC ağırlıklı.
- **E:** Client admin layout, `error.tsx`/`loading.tsx` yok, EN/DE 404 cache'i.
- **R:** Kullanıcı deneyimi ve SEO.
- **K:** Bölüm H.
- **Ö:** Layout'u böl, error boundary ekle.

**22. TypeScript — 66**

- **G:** strict mod.
- **E:** 125 `any`, 48 çift cast.
- **R:** Tip güvenliği delikleri.
- **K:** Metrikler.
- **Ö:** DB tiplerini üret.

**23. Code Quality — 60**

- **G:** Açıklayıcı isimler.
- **E:** Dev dosyalar, 137 `eslint-disable`.
- **R:** Hata eğilimi.
- **K:** Metrikler.
- **Ö:** Dosya bölme.

**24. Code Organization — 60**

- **G:** `lib/`, `services/`, `repository` ayrımı.
- **E:** Domain kuralları dağınık.
- **R:** Tutarsızlık.
- **K:** Bölüm G.
- **Ö:** `reservation-domain` modülü.

**25. Architecture — 62**

- **G:** Katmanlar ve tek izin haritası.
- **E:** Domain servisi, transaction sınırları.
- **R:** Büyüme maliyeti.
- **K:** Bölüm G.
- **Ö:** Domain katmanı.

**26. SOLID/SoC — 64**

- **G:** Repository soyutlaması.
- **E:** UI + veri + kural aynı dosyada.
- **R:** Test edilebilirlik düşük.
- **K:** Admin layout.
- **Ö:** Ayır.

**27. Error Handling — 55**

- **G:** Route'lar çoğunlukla `try/catch` içinde.
- **E:** Error boundary yok; ham mesajlar dönüyor.
- **R:** Bilgi sızıntısı, kötü kullanıcı deneyimi.
- **K:** ERR-01/02.
- **Ö:** Ortak hata yanıt helper'ı.

**28. Logging/Audit — 35**

- **G:** Activity log tablosu, mail log'ları.
- **E:** Server audit yok; kayıt taklit edilebilir; silme izsiz; IP taklit edilebilir; log'larda PII.
- **R:** Olay incelemesi imkânsız.
- **K:** A-12.
- **Ö:** Append-only server audit.

**29. Cache/Revalidation — 55**

- **G:** Tag altyapısı var.
- **E:** Eksik tag'ler, client tetiklemesi, locale yolları.
- **R:** Bayat içerik.
- **K:** CACHE-01.
- **Ö:** Tag haritası.

**30. Performance — 48**

- **G:** Public sayfaların çoğu statik veya cache'li.
- **E:** `/arama`, admin liste, villa detay.
- **R:** Katalog büyüdükçe yavaşlama.
- **K:** Bölüm F.
- **Ö:** SQL filtre + sayfalama.

**31. SSR/RSC/Client — 62**

- **G:** RSC kullanımı.
- **E:** Villa detay tamamen dinamik; client fetch'ler.
- **R:** TTFB.
- **K:** Bölüm F.
- **Ö:** ISR + tag.

**32. SEO — 70**

- **G:** Metadata, sitemap, JSON-LD.
- **E:** Soft 404, `lang`, indexlenen kontrol sayfası.
- **R:** Index kalitesi.
- **K:** Bölüm H.
- **Ö:** `notFound()` + `noindex`.

**33. i18n — 52**

- **G:** 3 dil altyapısı.
- **E:** Build'e bağlı 404, `lang` sabit, sözlükler tek chunk'ta.
- **R:** EN/DE ziyaretçi kaybı.
- **K:** ARCH-01.
- **Ö:** Dinamik `lang` + runtime kontrol.

**34. Image/Media — 55**

- **G:** WebP, CDN.
- **E:** Ham `<img>`, Cache-Control, private görseller.
- **R:** LCP.
- **K:** STO-04/09.
- **Ö:** `next/image` + `max-age`.

**35. DB Query Performance — 50**

- **G:** Parametrik, basit sorgular.
- **E:** `SELECT *`, index, sınırsız listeler.
- **R:** Büyümede yavaşlama.
- **K:** PERF-01/02/03.
- **Ö:** `EXPLAIN` + index.

**36. N+1 — 70**

- **G:** Çoğu sorgu toplu.
- **E:** Liste görsel join'i, gece döngüsü.
- **R:** Orta.
- **K:** PERF-04.
- **Ö:** Projection kullan.

**37. Memory/CPU — 62**

- **G:** Stream ile ZIP üretimi.
- **E:** Katalog bellekte; Argon2 flood; ReDoS.
- **R:** Tek instance kilitlenmesi.
- **K:** A-01/A-08.
- **Ö:** Limitler.

**38. DoS — 32**

- **G:** Rate limit mevcut.
- **E:** ReDoS, fail-open, body limiti yok, login flood.
- **R:** **Tek istekle kesinti.**
- **K:** Benchmark: 50k karakter = 5,1 sn.
- **Ö:** P0.

**39. Rate Limiting — 50**

- **G:** Public route'ların çoğunda var.
- **E:** Fail-open, XFF, login'de yok.
- **R:** Atlatılabilir.
- **K:** A-08.
- **Ö:** `CF-Connecting-IP` + fail-closed.

**40. Input Validation — 48**

- **G:** Bazı alan kontrolleri var.
- **E:** Şema/uzunluk doğrulaması, status enum'u, izin whitelist'i.
- **R:** Veri şişirme, ReDoS.
- **K:** F-04.
- **Ö:** Zod.

**41. Output Validation — 76**

- **G:** Sanitize, JSON-LD kaçışı.
- **E:** Head script'leri ham.
- **R:** Düşük-orta.
- **K:** A-06.
- **Ö:** —

**42. API Response Security — 58**

- **G:** Public DTO'lar dar.
- **E:** `error.message`, `resend_api_key`, health sürümü, e-posta geri dönüşü.
- **R:** Bilgi sızıntısı.
- **K:** A-13.
- **Ö:** Maskeleme.

**43. CORS/Headers — 35**

- **G:** CORS açık değil; CSP rapor modunda.
- **E:** HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy.
- **R:** Clickjacking, sniffing.
- **K:** `next.config.ts` L187.
- **Ö:** Header seti.

**44. Deployment/Prod Security — 50**

- **G:** Secret'lar env'de.
- **E:** Env doğrulaması, health check, standalone.
- **R:** Yanlış yapılandırmayla açılış.
- **K:** OPS-05/07.
- **Ö:** Env şeması.

**45. Docker — 30**

- **G:** —
- **E:** Dockerfile, non-root kullanıcı, `.dockerignore`.
- **R:** Büyük saldırı yüzeyi.
- **K:** OPS-04.
- **Ö:** Multi-stage standalone.

**46. Coolify — 40**

- **G:** Scheduled task'lar kullanılıyor.
- **E:** Yapılandırma repoda değil (doğrulanamadı).
- **R:** Tekrarlanamayan kurulum.
- **K:** OPS-06.
- **Ö:** Ayarları dokümante et.

**47. Postgres Security — 55**

- **G:** TLS modu mevcut.
- **E:** Sertifika doğrulaması, timeout'lar, rol ayrımı.
- **R:** Kaçak sorgu, MITM.
- **K:** OPS-08.
- **Ö:** `verify-full` + timeout.

**48. Backup/DR — 15**

- **G:** —
- **E:** Yedek, geri yükleme testi, şema baseline'ı.
- **R:** **Kalıcı veri kaybı.**
- **K:** OPS-02/03.
- **Ö:** P0.

**49. Monitoring — 20**

- **G:** Console log'ları.
- **E:** APM, uptime, alarm.
- **R:** Kesintiler fark edilmez.
- **K:** MON-01.
- **Ö:** Sentry + uptime.

**50. Test/QA — 55**

- **G:** 4131 unit test; güvenlik testleri iyi.
- **E:** CI, coverage, DB/E2E testleri.
- **R:** Regresyon.
- **K:** Bölüm J.
- **Ö:** CI + PG testcontainer.

**51. Maintainability — 45**

- **G:** Yorumlar bol.
- **E:** Dev dosyalar, doküman kalabalığı, eski yorumlar.
- **R:** Onboarding zorluğu.
- **K:** MNT-01.
- **Ö:** Temizlik.

**52. Scalability — 45**

- **G:** Stateless uygulama.
- **E:** Tam tarama, bellek içi filtre, tek instance varsayımı.
- **R:** Büyümede darboğaz.
- **K:** PERF-02.
- **Ö:** SQL filtre + cache.

**53. Technical Debt — 40**

- **G:** Bilinçli olarak işaretlenmiş.
- **E:** Şema, eski sağlayıcı, kopyalanmış route'lar.
- **R:** Birikim.
- **K:** Bölüm G.
- **Ö:** P2/P3.

**54. Production Readiness — 48**

- **G:** Güvenlik çekirdeği hazır.
- **E:** Yedek, izleme, header'lar, DoS.
- **R:** Olay anında kör kalma.
- **K:** Hepsi.
- **Ö:** P0.

---

### 🔴 Kritik Problemler (10)

1. **Tek istekle ReDoS DoS:** `/api/public/reservation-lookup` (A-01).
2. **Yedek/DR kanıtı yok + şema sıfırdan kurulamaz** (OPS-02/03, DB-06).
3. **Rezervasyon ↔ manuel blok çift satış:** DB constraint'i yok, race var (DB-01).
4. **Boş iCal feed'i tüm harici blokları siliyor:** çift satış (DB-02).
5. **Admin şifre değişikliği düz metin / yanlış kolon, oturum iptali yok** (A-02, H-04).
6. **Storage silme yolları izin kontrolünü atlıyor** (A-03).
7. **Villa hard-delete, FK hatasından önce dosyaları ve fiyatları siliyor** (DB-03).
8. **Pending ile takvim kilitleme + min stay yalnız client'ta** (A-04).
9. **Audit log taklit edilebilir/silinebilir + hassas işlemlerde server audit yok** (A-12).
10. **Monitoring/alarm yok:** yukarıdakilerin hiçbiri fark edilmez (MON-01).

### 🟠 Önemli Problemler (15)

1. Güvenlik header'ları yok (A-07).
2. Rate limit fail-open + XFF (A-08).
3. Public mail replay (A-05).
4. `custom_head_scripts` → yetki yükseltme (A-06).
5. Upload MIME/boyut kontrolü (A-09).
6. Oturum iptali / refresh reuse / TOTP tekrar kullanımı (A-10).
7. Son admin koruması ve izin whitelist'i yok (A-11).
8. Resend anahtarı browser'a gidiyor (A-13).
9. CI yok, DB/E2E testi yok (QA-01/02).
10. PG timeout yok, TLS doğrulaması yok (OPS-08).
11. `/arama` tam katalog taraması (PERF-02).
12. Admin rezervasyon listesi sınırsız (PERF-01).
13. EN/DE sayfaların 404 cache'i (ARCH-01).
14. Transaction yok (DB-07).
15. Pasif villaya rezervasyon, çakışan fiyat periyotları (BL-02/04).

### 🟡 İyileştirme Önerileri (20)

1. Zod ile tüm route input şemaları.
2. Ortak hata yanıt helper'ı (`error.message` sızıntısını kapatır).
3. `error.tsx` / `global-error.tsx` / `loading.tsx`.
4. Admin kök layout'u server + küçük client adalarına böl.
5. Badge sayıları için tek bir count endpoint'i.
6. `react-datepicker` ve sözlükler için lazy loading.
7. `CurrencyContext` kurlarını server'dan geçir.
8. Villa detayda ISR + tag.
9. Eksik cache tag'leri ve locale revalidation.
10. `<html lang>` dinamik olsun.
11. Villa detayda `notFound()`, kontrol sayfasına `noindex`.
12. Cache-Control `public, max-age=31536000, immutable`.
13. Galeride `next/image`.
14. iCal fetch'ini `safeGetStream` + boyut sınırına taşı.
15. `next/image` supabase wildcard'ını kaldır.
16. Sabit zamanlı cron karşılaştırması (`timingSafeEqual`).
17. Voucher `?token=` desteğini kaldır.
18. Env şema doğrulaması + `.env.example`.
19. Dockerfile (standalone, non-root).
20. Doküman ve yorum temizliği; `middleware` → `proxy.ts`.

### 🟢 Güçlü Taraflar (12)

1. Parametrik query compiler: SQLi riski çok düşük.
2. Argon2id şifre hash'i, AES-GCM ile şifrelenmiş TOTP secret'ları.
3. `__Host-` HttpOnly Secure çerezler; kısa ömürlü access token; hash'lenmiş, rotasyonlu refresh token.
4. DB tabanlı, fail-closed izin kontrolü; tek izin haritası.
5. Rezervasyonlar arası çakışma DB'de (EXCLUDE GiST) garanti altında.
6. Fiyat server'da hesaplanıyor (SEC-06); client fiyatına güvenilmiyor.
7. Güçlü SSRF koruması (DNS pinning, manuel redirect, IPv6/hex).
8. `sanitize-html` + JSON-LD kaçışı.
9. `NEXT_PUBLIC_` değişkenlerinde secret yok; CORS açılmamış.
10. CDN/R2 mimarisi env tabanlı; hardcode host yok.
11. 4131 unit test; güvenlik düzeltmelerinin regresyon testleri var.
12. `server-only` sınırları ve repository katmanı.

---

## M) ÖNCELİKLENDİRME

Zorluk: S = küçük, M = orta, L = büyük.

### P0 — Hemen (günler)

| Problem | Risk | Etki | Zorluk | Çözüm |
|---|---|---|---|---|
| ReDoS (A-01) | Tek istekle site kesintisi | Tüm site | **S** | Uzunluk limiti + doğrusal kontrol; create-user dahil |
| Yedek/DR (OPS-03) | Kalıcı veri kaybı | İşletme | **M** | Günlük `pg_dump` + off-site (R2 ayrı bucket) + aylık geri yükleme testi; `pg_dump --schema-only` baseline'ı repoya |
| Şifre PATCH (A-02) | Ele geçirilmiş hesap kapatılamaz | Admin | **S** | `hashPassword` → `password_hash` + `revokeAllForAdmin`; canlı DB'de `password` kolonunu kontrol et |
| iCal boş feed'i (DB-02) | Çift satış | Rezervasyon | **S** | 0 event veya parse hatasında pasifleştirme yapma; oran eşiği (ör. >%50 düşüşte durdur) |
| Manuel blok çakışması (DB-01) | Çift satış | Rezervasyon | **M** | Ortak `villa_blocks` exclusion'ı veya trigger; admin status/update yollarında kontrol |
| Storage silme (A-03) | Site varlıklarının silinmesi | İçerik | **S** | `addGalleryImage` prefix kontrolü + merkezi silme kontrolü |

### P1 — Bu ay

| Problem | Risk | Etki | Zorluk | Çözüm |
|---|---|---|---|---|
| Hard-delete sırası (DB-03) | Veri kaybı | Villa | **S** | FK ön-kontrolü → transaction → sonra storage |
| Pending/min stay (A-04) | Takvim kilitleme | Gelir | **M** | Server kuralları + pending TTL cron'u + Turnstile |
| Public mail replay (A-05) | Mail bombing | İtibar | **S** | Server-side gönderim / idempotency |
| Header'lar (A-07) | Clickjacking | Admin | **S** | `headers()` seti + `poweredByHeader:false` |
| Rate limit (A-08) | Brute force / DoS | Auth | **M** | `CF-Connecting-IP`, fail-closed, login IP limiti, atomik sayaç |
| Monitoring (MON-01) | Fark edilmeyen kesinti | Operasyon | **S** | Sentry + uptime + disk/DB alarmı |
| Audit (A-12) | İnceleme imkânsız | Uyum | **M** | Server-side audit; `mode:"all"` kaldır |
| Settings script / Resend anahtarı (A-06/A-13) | Yetki yükseltme | Admin | **S** | Ayrı izin; anahtarı maskele |

### P2 — Bu çeyrek

| Problem | Risk | Etki | Zorluk | Çözüm |
|---|---|---|---|---|
| Oturum iptali / reuse / TOTP (A-10) | Oturum ele geçirme | Auth | M | `sid` + reuse detection + kullanılmış TOTP adımı |
| Son admin koruması / whitelist (A-11) | Kilitlenme | Admin | S | Guard'lar |
| Upload doğrulaması (A-09) | Zararlı içerik | CDN | S | Allowlist + magic-byte + limit |
| CI + DB entegrasyon testleri (QA-01/02) | Regresyon | Kalite | M | GitHub Actions + PG service container |
| PG timeout / TLS / rol (OPS-08) | Kaçak sorgu | DB | S | `statement_timeout`, `verify-full`, ayrı rol |
| `/arama` + admin listeleri (PERF-01/02) | Yavaşlama | UX | M | SQL filtre, sayfalama, cache |
| EN/DE 404 cache'i (ARCH-01) | Ziyaretçi kaybı | SEO | S | Runtime kontrol / revalidate |
| Transaction'lar (DB-07) | Tutarsız veri | Veri | M | `withTransaction` helper'ı |
| Env doğrulaması + health check (OPS-05/07) | Yanlış açılış | Ops | S | Zod env + DB ping |

### P3 — Plan dahilinde

| Problem | Risk | Etki | Zorluk | Çözüm |
|---|---|---|---|---|
| Migration ledger / şema yönetimi (DB-06) | Tekrarlanamama | Geliştirme | L | Baseline + ledger (ör. node-pg-migrate) |
| Dockerfile (OPS-04) | Yüzey | Ops | M | Standalone, non-root |
| Admin layout refactor + error boundary (ARCH-03/04) | Bakım | UX | L | RSC'ye bölme |
| Rezervasyon domain servisi | Kural dağınıklığı | Bakım | L | Tek modül |
| Bundle / i18n / image optimizasyonu | Performans | UX | M | Lazy loading, `next/image` |
| TS `any` temizliği, kaynak metin testleri, doküman temizliği | Bakım | Kalite | M | Kademeli |
| `middleware` → `proxy.ts` | Gelecek uyumluluk | Next | S | Yeniden adlandır |

---

## N) CEVAPLAR

### 1. Production güvenli mi?

**Kısmen.**

**Uygulama katmanında klasik açıklar büyük ölçüde kapalı:**

- SQL injection, command injection, SSRF ve admin yetki bypass'ı için açık bulunmadı.
- Kimlik doğrulama modern ve sağlam.

**Ancak üç alan production'ı gerçek risk altında tutuyor:**

1. **Kullanılabilirlik:** Tek bir istekle birkaç saniyelik tam kesinti (ReDoS) mümkün. Sürekli kesintiye çevrilmesi kolay.
2. **Veri güvencesi:** Yedek ve geri yükleme kanıtı yok; şema sıfırdan kurulamıyor.
3. **Rezervasyon bütünlüğü:** Manuel blok ve iCal yolları çift satışa açık.

İzleme olmadığı için bunların hiçbiri gerçekleştiğinde fark edilmeyebilir.

> Cloudflare WAF/rate-limit ve Coolify yedek ayarları **doğrulanamadı**; varsa risk azalır.

### 2. Dış saldırgan için en gerçekçi yollar

1. **ReDoS:** `POST /api/public/reservation-lookup` ile 60 KB e-posta → siteyi durdurma. En kolay ve en etkili yol.
2. **Takvim kilitleme:** `POST /api/public/reservations` ile tüm sezonu pending rezervasyonlarla doldurma. Captcha, TTL ve max nights yok.
3. **Mail bombing / itibar zararı:** `POST /api/mail/reservation-request` replay.
4. **Admin hesabına parola püskürtme:**
   - Login'de IP limiti yok, rate limit XFF ile atlatılabiliyor.
   - 2FA açık hesaplarda etkisi düşük; 2FA kapalı hesaplarda gerçekçi.
5. **Clickjacking:** XFO/`frame-ancestors` yok. Sosyal mühendislikle admin'e işlem yaptırma.
6. **Nominatim kotasını tüketme:** `/api/geocode` ile sunucu IP'sinin ban yemesi.

### 3. Düşük yetkili admin ne yapabilir?

**Hiç izni olmayan admin:**

- Yalnız kendi 2FA'sını yönetebilir.
- Audit tablosuna **sahte kayıt** yazabilir.
- Başka bir veriye erişemez (E2E + 135 test ile doğrulandı).

**`villas` izinli admin:**

- Villa işleri.
- Server action silme yolları üzerinden **site-assets dahil başka prefix'lerdeki R2 dosyalarını silebilir** (A-03).
- Hard-delete ile veri kaybına yol açabilir (DB-03).

**`reservations` izinli admin:**

- İptal edilmiş rezervasyonu manuel blokla çakışacak şekilde yeniden aktif edebilir (DB-01).
- Müşterilere mail tetikleyebilir.

**`settings` izinli admin:**

- Head script enjeksiyonu ile `users` adminin tarayıcısında kod çalıştırıp **kendine tüm izinleri verebilir** (A-06).
- Resend API anahtarını okuyabilir.

**`users` izinli admin:**

- Her şey (fiili süper-admin).
- Son admini kilitleyebilir.
- Kendi izinlerini değiştirebilir.

**`activity_logs` izinli admin:**

- Tüm audit geçmişini iz bırakmadan silebilir.

### 4. En büyük teknik borç

**Veritabanı şemasının koddan yönetilmemesi.**

- Çekirdek tabloların DDL'i yok, migration numaralarında boşluklar var, ledger yok.
- Rezervasyon iş kuralları (min stay, blok çakışması, pending ömrü, fiyat periyodu) tek bir domain servisinde değil; client, route ve servislere dağılmış.

Sonuç:

- Yeni ortam kurulamıyor.
- Entegrasyon testi yazılamıyor.
- Her kural değişikliği birden çok yeri kırma riski taşıyor.

### 5. 1-2 yıl içinde ilk sorun çıkaracak alan

**Rezervasyon/takvim bütünlüğü ve arama performansı.**

- Villa ve rezervasyon sayısı arttıkça:
  - `/arama`'nın tüm kataloğu belleğe alması,
  - admin rezervasyon listesinin sınırsız olması,
  - iCal senkronunun transaction'sız ve boş feed'e karşı korumasız olması

  ilk önce yavaşlama, ardından çift satış olayları olarak ortaya çıkacak.
- İzleme olmadığı için bu, müşteri şikâyetiyle fark edilecek.
- Yedek sorunu ise olasılığı düşük ama etkisi en yüksek risk: ilk disk veya DB olayında belirleyici olur.

---

## DAHA ÖNCE KAPATILAN GÜVENLİK BULGULARI — Yeniden Doğrulama

### 1) H-03 SSRF (commit `0fb9416 fix(security): harden SSRF protection`)

**Sonuç: KAPALI — tekrar açılmamış.**

| Kontrol | Durum | Kanıt |
|---|---|---|
| ZIP endpoint'i yalnız izinli CDN host'larından çekiyor | ✅ | `app/api/villa-zip/[token]/route.ts` → `isAllowedZipImageUrl` (`getCdnBaseForBucket` + https `*.supabase.co`) + `safeGetStream` |
| Özel/loopback/link-local/CGNAT/IPv6 aralıkları engelleniyor | ✅ | `lib/security/ssrf.ts`: tam IPv6 ayrıştırma, köşeli parantez temizliği, IPv4-mapped adresler |
| İşaretli bitwise IPv4 hatası (`0x7f000001` bypass'ı) | ✅ düzeltildi | `>>> 0` normalizasyonu; testlerde hex/octal/decimal IP |
| DNS rebinding | ✅ | `ssrf.server.ts` `guardedLookup`: bağlantı anında DNS pinning |
| Redirect ile iç ağa kaçış | ✅ | Manuel redirect takibi; her adımda yeniden doğrulama |
| Unit test | ✅ | `tests/unit/ssrf-guard.test.ts`: **70/70** |
| E2E (önce → sonra) | ✅ | **Önce: 5 iç secret sızıntısı** (direkt 127.0.0.1, hex IP, DNS→127.0.0.1, iç adrese redirect, rebinding host'una redirect) + 1 keyfi host sızıntısı. **Sonra: 4 meşru CDN görseli, 0 iç hit.** |

**Kalan riskler (yeni açık değil, iyileştirme):**

- iCal senkronu hâlâ ön-doğrulama + düz `fetch` kullanıyor. Bu, DNS rebinding için TOCTOU penceresi bırakıyor. Yalnız `external_calendars` izinli admin kaynak URL ekleyebildiği için risk düşük.
- iCal yanıt gövdesinde boyut sınırı yok.
- `*.supabase.co` wildcard'ı: ZIP allowlist'inde ve `next/image`'da. Eski sağlayıcı artığı; kaldırılabilir.

### 2) Admin authorization / permission bypass (commit `a2e4be1 fix: secure admin permissions`)

**Sonuç: KAPALI — API ve sayfa seviyesinde bypass bulunamadı.**

| Kontrol | Durum | Kanıt |
|---|---|---|
| Admin API handler'ları izin kontrolünden geçiyor | ✅ | 78 admin handler'ın 73'ü `callerHasPermission` kullanıyor (403 `FORBIDDEN_MESSAGE`). 5 bilinçli istisna: 2FA self route'ları (4) + `activity-logs/log`. Tablo C.1 kaynak koddan otomatik çıkarıldı. |
| Sayfa koruması | ✅ | 28 bölüm `layout.tsx` → `AdminSectionGuard`; veri çeken 6 server sayfa, veri okumadan önce `adminPermissionGate` çağırıyor |
| Settings GET veri daraltması | ✅ | `settings` → tam satır; yalnız `reservations` → `{prepayment_rate}`; diğerleri → 403 |
| Storage API'leri (upload/remove) | ✅ | `storagePermissionFor(bucket, path)`; tanınmayan bucket → reddedilir |
| `admin-users` GET/DELETE | ✅ | `users` izni |
| Unit test | ✅ | `admin-api-permission.test.ts` **135**, `admin-section-guard.test.tsx` **5**, SEC-01/03 güncel; tam suite **4131 test geçiyor** |
| E2E | ✅ | Tam yetkili admin: sayfalar ve API gövdeleri **birebir aynı**. Yalnız `villas` izinli admin: **30/30** yetkisiz mutasyon → 403, **DB ve S3 değişmedi**. 47 yetkisiz sayfa → ilk izinli bölüme yönlendirme; rezervasyon adları sayfada görünmedi. |

**Kalan / yeni tespit edilen noktalar (bypass değil):**

- **A-03 (yeni):**
  - Server action / servis katmanındaki storage **silme** yolları (`addGalleryImage` + `parseVillaStorageUrl`, sayfa kapak silme) bucket/prefix kontrolünü atlıyor.
  - Önceki düzeltme API route'larını kapsıyordu. Bu yollar action seviyesinde bölüm izniyle korunuyor, ancak prefix kontrolü yok.
- Yetkisiz sayfa yanıtı **HTTP 200 + in-stream `NEXT_REDIRECT`** (kök layout client component olduğu için). Veri sızmıyor; yalnız gözlemlenebilirlik sorunu.
- `users` izni fiilen süper-admin; `settings` izni script enjeksiyonu ile yükseltilebilir (A-06). Bunlar izin **modelinin** zayıflıkları; uygulama bypass'ı değil.
- `activity-logs/log` herhangi bir admine açık (bilinçli) → sahte audit kaydı (A-12).

---

*Bu rapor salt okunur analizle hazırlandı. Rapor dosyası dışında hiçbir dosya, veritabanı, storage, config veya env değiştirilmedi; commit/push/deploy yapılmadı.*
