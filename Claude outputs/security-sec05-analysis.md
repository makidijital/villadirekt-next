# SEC-05 — XSS / CSP / Raw HTML Güvenlik Analizi (YALNIZCA ANALİZ)

- **Tarih:** 2026-09-24
- **İncelenen commit (device HEAD):** `6efc1cd fix(security): enforce admin API permissions` — tree `8d9dc65…` (cloud çalışma kopyası birebir aynı tree ile doğrulandı)
- **Yöntem:** salt-okunur statik kod analizi + lokal/test ortamında (yerel PostgreSQL fixture `kv_sec03`, gerçek `next build` + `next start`, HTTP) dummy sentinel HTML/JS ile runtime doğrulama. Production'a hiçbir istek gönderilmedi; production DB/R2 değişmedi.
- **Değişiklik:** kod / config / .env / DB / R2 / migration / commit / push / deploy YOK. Yalnız bu rapor dosyası oluşturuldu.

> **Kesinlik etiketleri:** `KANITLI-RUNTIME` (lokalde sentinel ile fiilen üretildi) · `KANITLI-KOD` (kod satırlarıyla kesin) · `DOĞRULANAMADI` (infra/prod erişimi gerekiyor).

---

## 0. Yönetici Özeti

**SEC-05 gerçektir ve runtime'da kanıtlanmıştır.** Admin tarafından girilen dört alan, hiçbir sanitize/validation olmadan public sayfaların HTML'ine ham (raw) olarak basılıyor. Lokal test build'inde, admin ayarlarına konan zararsız sentinel'ler ana sayfanın çıktısında **çalıştırılabilir** biçimde göründü:

| Sentinel | Alan | Public HTML'de sonuç |
|---|---|---|
| `<script>window.SENTINEL_HEAD_SCRIPT=1</script>` | `custom_head_scripts` | `<head>` içinde **ham `<script>`** (1 adet) |
| `<meta name="SENTINEL-HEAD">` | `custom_head_scripts` | `<head>` içinde ham meta |
| `<script>window.SENTINEL_ANALYTICS=1</script>` | `analytics_script` | `<body>` içinde **ham `<script>`** (1 adet) |
| `<img src=x onerror="window.SENTINEL_IMG_ONERROR=1">` | `analytics_script` | `<body>` içinde **ham event-handler** |
| `');window.SENTINEL_GTM_BREAKOUT=1;//` | `gtm_container_id` | Inline GTM script'inin string literal'inden **çıkış (breakout)** → gövdede keyfi JS |

Ayrıca **`villa.map_embed`** alanı public villa detay sayfasında (`/kiralik-villa/[slug]`) ve off-market sayfada (`/v/[token]`) `dangerouslySetInnerHTML` ile ham basılıyor (KANITLI-KOD; runtime'da bu turda ayrıca üretilmedi çünkü lokal fixture'da iframe-tipli villa yok).

**Türü:** Stored (persistent) XSS. Reflected/DOM-XSS bu alanlar için birincil vektör değil.

**Uygulama seviyesinde CSP YOK** (`KANITLI-RUNTIME`: yanıt başlıklarında `Content-Security-Policy` ve diğer güvenlik başlıkları yok). Dolayısıyla enjekte edilen script'i durduracak bir savunma katmanı yok.

**SEC-03 ile ilişki:** SEC-03 Faz 1 düzeltmesi `PUT /api/admin/settings`'i `settings` iznine bağladı; böylece `custom_head_scripts`/`analytics_script`/`gtm_container_id` yazımı artık yalnız `settings` izinli adminlerle sınırlı. Ancak `map_embed`'i yazan villa route'ları (`PUT /api/admin/villas/[id]/full`, `POST /api/admin/villas`) henüz izin-gate'li değil (SEC-03 Faz 2 kapsamı) → şu an **herhangi bir aktif admin** villa haritası üzerinden stored XSS enjekte edebilir.

---

## 1. Alan Bazında Uçtan Uca Takip

### 1.1 `custom_head_scripts` (UI: "Custom head HTML")

| Aşama | Konum |
|---|---|
| Admin giriş | `app/(admin)/maki-admin/settings/gelismis/page.tsx:107` (`TextAreaField`, `customHead` state) |
| Kaydetme | Aynı dosya `:47` → `updateSettings({ custom_head_scripts: customHead.trim() \|\| null, ... })` → `app/services/settings.client.ts:36` `updateSettingsClient` → `PUT /api/admin/settings` |
| Sunucu yazma | `app/api/admin/settings/route.ts` `PUT` → `settingsServerRepository.updateById(id, values)` (ham body; **kolon whitelist yok** — SEC-04) |
| DB kolonu | `settings.custom_head_scripts` (migration `081_settings_multilingual.sql:116` vb.) |
| Sanitize/validation | **YOK** (ne yazımda ne okumada; `sanitizeHtml` çağrısı bu alanda yok) |
| Public okuma | `app/layout.tsx:141` `settings?.custom_head_scripts?.trim()` (kaynak: `getCachedSettings()` → `getPublicSettings()` → `get_public_settings` RPC) |
| Public output | `app/layout.tsx:153-157` `<div dangerouslySetInnerHTML={{ __html: customHead }} />` — `<head>` içinde |
| Component tipi | Root layout **Server Component** |
| Kapsam | **Tüm ziyaretçiler**, her public sayfa (root layout tüm route'ları sarar) |

### 1.2 `analytics_script` (UI: "Analytics script (manuel)")

| Aşama | Konum |
|---|---|
| Admin giriş | `settings/gelismis/page.tsx:92` (`analyticsScript` state) |
| Kaydetme | `:48` → `analytics_script` → `PUT /api/admin/settings` |
| DB kolonu | `settings.analytics_script` |
| Sanitize | **YOK** |
| Public okuma | `app/layout.tsx:142` |
| Public output | `app/layout.tsx:173-177` `<div dangerouslySetInnerHTML={{ __html: analyticsScript }} />` — `<body>` içinde |
| Kapsam | Tüm ziyaretçiler, her sayfa |

### 1.3 `gtm_container_id` (UI: "GTM Container ID")

| Aşama | Konum |
|---|---|
| Admin giriş | `settings/gelismis/page.tsx:84` (`gtmId` state) |
| Kaydetme | `:49` → `gtm_container_id` → `PUT /api/admin/settings` |
| DB kolonu | `settings.gtm_container_id` |
| Sanitize/validation | **YOK** (format doğrulaması yok; `GTM-XXXXXXX` beklenirken herhangi bir string kabul edilir) |
| Public okuma | `app/layout.tsx:140` |
| Public output | `app/layout.tsx:163-169` — **`next/script` inline** GTM snippet'i; `gtmId` string literal'e **template-interpolate** ediliyor: `...'dataLayer','${gtmId}');` |
| Kapsam | Tüm ziyaretçiler, her sayfa |

Bu, `dangerouslySetInnerHTML` değil ama sonuç aynı: `next/script` inline içerik olarak render edildiği için `gtmId` içindeki `');...//` dizisi string'den çıkıp keyfi JS enjekte eder (runtime'da kanıtlandı).

### 1.4 `villa.map_embed` (UI: villa formu "iframe embed")

| Aşama | Konum |
|---|---|
| Admin giriş | `app/components/admin/villa-form/LocationStep.tsx:250` (`map_type="iframe"` iken serbest textarea) |
| Kaydetme | `app/services/villa-admin/_helpers/payload.ts:211` — `map_type==="iframe"` ise `map_embed` **olduğu gibi** payload'a (sanitize yok) → `PUT /api/admin/villas/[id]/full` / `POST /api/admin/villas` |
| DB kolonu | `villa.map_embed` |
| Sanitize | **YOK** |
| Public okuma & output | (a) `app/components/villa/VillaMapModal.tsx:209` `dangerouslySetInnerHTML={{ __html: mapEmbed }}` — public villa detay (`VillaDetailBody.tsx:410` → `/kiralik-villa/[slug]`); (b) `app/components/private-villa/PrivateVillaPageBody.tsx:732` — off-market `/v/[token]` |
| Component tipi | VillaMapModal **Client Component** (`"use client"`); veri server'dan prop olarak gelir |
| Kapsam | (a) tüm ziyaretçiler; (b) token'ı bilen ziyaretçiler |

---

## 2. Runtime Kanıtı (lokal/test)

**Ortam:** yerel PostgreSQL fixture `kv_sec03`; `get_public_settings` RPC'sine zararsız sentinel HTML/JS kondu; `next build` (Turbopack, prod) + `next start` (port 3999). Yalnız GET istekleri.

`GET /` yanıt gövdesinde ham (escape edilmemiş, çalıştırılabilir) olarak bulundu:

```
<meta name="SENTINEL-HEAD">                                  → 1 (head)
<script>window.SENTINEL_HEAD_SCRIPT=1</script>              → 1 (head)
<script>window.SENTINEL_ANALYTICS=1</script>               → 1 (body)
<img src=x onerror="window.SENTINEL_IMG_ONERROR=1">        → 1 (body)
dataLayer','');window.SENTINEL_GTM_BREAKOUT=1;//'          → 1 (GTM inline breakout)
```

- Bunlar RSC flight payload'ındaki escape'li kopyalar **değil**; gerçek doküman HTML'inde ham `<script>`/`<img onerror>` tag'leri olarak render edildi.
- **Not:** Bu alanlar `getCachedSettings()` (`unstable_cache`, `revalidate:3600`) üzerinden okunuyor ve ilgili public sayfalar statik/ISR olduğu için değer **build/prerender anında** gömülüyor. İlk sentinel testinde eski build kullanıldığından enjeksiyon görünmedi; fixture ile **yeniden build** alınınca beş vektör de göründü. Bu, prod'da davranışın şu olduğunu gösterir: değer değiştikten sonra ilgili sayfa yeniden üretildiğinde (revalidate / redeploy) enjeksiyon yayılır.

**Güvenlik başlıkları (runtime):** `GET /` ve `GET /maki-admin/login` yanıtlarında `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy` **yok**.

---

## 3. Pattern Taraması (tüm repo, node_modules hariç)

| Pattern | Adet | Önemli konumlar |
|---|---|---|
| `dangerouslySetInnerHTML` | 11 | layout.tsx:156,176 (SEC-05 çekirdek) · VillaMapModal:209 · PrivateVillaPageBody:376,732 · CollapsibleDescription:59 · BlogDetailPageBody:108 · StructuredData:62 · (kalanlar yorum) |
| `<script` | 7 | layout GTM · StructuredData JSON-LD · voucher route (escape'li) · gelismis placeholder/hint (yalnız metin) · youtube.helper (yorum) |
| `<iframe` | 6 | Google Maps (coords, sabit src) · YouTube modal/section · ContactPageBody (encode'lu src) · PrivateVilla |
| `innerHTML` / `insertAdjacentHTML` / `eval(` / `new Function` / `document.write` / `outerHTML` / `DOMParser` / `srcdoc` | 0 | — (DOM-XSS klasik vektörleri yok) |
| `customHead`/`custom_head` | 6 / 11 | §1.1 |
| `analyticsScript`/`analytics_script` | 6 / 11 | §1.2 |
| `gtmId`/`gtm` | 6 | §1.3 |
| `map_embed`/`mapEmbed` | 25 | §1.4 |
| `Content-Security-Policy` / `nonce` / `unsafe-inline` / `unsafe-eval` | 0 / 0 / 0 / 0 | **Uygulamada CSP altyapısı yok** |
| `CSP` | 1 | AramaPageBody yorumu (alakasız) |
| `next/script` | 5 | layout GTM · arama sayfalarındaki sabit dropdown-close script'i (kullanıcı verisi içermez) |

### Güvenli/sanitize edilmiş `dangerouslySetInnerHTML` kullanımları (bulgu değil)

- **Villa açıklaması:** `VillaDetailBody.tsx:215` → `sanitizeHtml(displayDescription)`; `CollapsibleDescription.tsx:59` sanitize'lı HTML alır. `lib/html-sanitize.ts` allow-list'i `script`/`iframe`/`style`/event handler İÇERMEZ; şema `http/https/mailto`. (Not: bu turda `sanitize-html` 2.17.5'in bilinen zafiyetleri SEC-25 kapsamındadır; ALLOWED_TAGS'te `svg`/`textarea` yok, pratik etki düşük.)
- **Blog:** `BlogDetailPageBody.tsx:108` → `sanitizeHtml(body)`.
- **JSON-LD:** `StructuredData.tsx:62` → `JSON.stringify(data)` (yapılandırılmış veri; `<` kaçışı ayrı bir küçük risktir, SEC-21).
- **Voucher HTML:** `app/lib/voucher/template.ts` tüm dinamik değerleri `escapeHtml()` ile kaçırıyor; `route.ts:88` eklenen print script'i sabit. Admin-only, `no-store`, `Referrer-Policy: no-referrer`.
- **iframe'ler:** Google Maps coords (`VillaMapModal:198`, `VillaDetailBody`), ContactPageBody (`encodeURIComponent(address)`), YouTube (`youtube-nocookie`, helper doğrulamalı) — hepsi sabit/encode'lu src, kullanıcı ham HTML'i değil.

---

## 4. Mevcut Güvenlik Mekanizmaları

| Katman | Durum |
|---|---|
| `next.config.ts` `headers()` | **YOK** (yalnız `images.remotePatterns` var) |
| `middleware.ts` | Yalnız `/maki-admin/*` redirect kapısı; hiçbir güvenlik başlığı eklemiyor |
| Route-level başlıklar | Yalnız `voucher/[id]` ve `villa-zip/[token]` `Referrer-Policy: no-referrer` veriyor; CSP değil |
| CSP / nonce / hash / SRI | Kodda hiçbiri yok |
| Proxy / Traefik / nginx / Coolify / Cloudflare başlıkları | **DOĞRULANAMADI** — infra config bu repoda yok (`docs/coolify-scheduled-tasks.md` yalnız cron; `vercel.json` yalnız cron). Prod önünde CSP/başlık enjekte eden bir katman olup olmadığı sunucu erişimi gerektirir |

---

## 5. Saldırı Senaryosu ve Zincir

1. **Stored XSS enjeksiyonu:** Yetkili admin (settings için `settings`, map_embed için villa yazma) ilgili alana `<script>…</script>` veya `<img onerror>` veya GTM breakout dizisi yazar.
2. **Kalıcılık:** Değer DB'de saklanır; ilgili public sayfa yeniden üretildiğinde (`settings` tag revalidate / villa mutation cache invalidation / redeploy) tüm ziyaretçilere ham script olarak servis edilir.
3. **Çalışma:** CSP olmadığı için script her ziyaretçinin tarayıcısında admin panelle **aynı origin'de** çalışır.
4. **Zincirleme (SEC-03 ile):**
   - Bir admin hesabı ele geçirilirse (veya kötü niyetli düşük-yetkili admin), enjekte edilen script süper-admin'in tarayıcısında aynı-origin `fetch` ile admin API'lerine istek atabilir (`HttpOnly` cookie'ler JS'e görünmez ama aynı-origin isteklere otomatik eklenir).
   - SEC-03 Faz 1'den **önce** her aktif admin `PUT /api/admin/settings` çağırabiliyordu → düşük yetkili admin bile site-geneli XSS enjekte edip yetki yükseltebiliyordu. **Faz 1 sonrası** settings yazımı `settings` iznine bağlı; bu vektör daraldı.
   - **map_embed hâlâ açık:** villa yazma route'ları izin-gate'li olmadığından (SEC-03 Faz 2) herhangi bir aktif admin villa haritası üzerinden aynı XSS zincirini kurabilir.
5. **Kimin görebildiği:** custom_head/analytics/gtm ve public villa map_embed → **tüm ziyaretçiler** (yalnız admin değil). Bu yüzden etki müşteri tarafında da geçerli (skimming, phishing, oturum çalma).

---

## 6. CSP Değerlendirmesi

**Mevcut CSP:** yok (KANITLI-RUNTIME). Neden yok: `next.config.ts`'e hiç eklenmemiş; başka bir katmanda olup olmadığı DOĞRULANAMADI.

**CSP eklenirse mevcut sistemi bozar mı?** Next.js dokümanı (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`) üç yol tanımlıyor; bu proje için etkiler:

| Yaklaşım | Etki |
|---|---|
| **Nonce tabanlı** (`strict-dynamic`) | **Tüm sayfaları dynamic render'a zorlar** → mevcut ISR/statik public sayfalar (anasayfa, villa detay, arama, sitemap) cache avantajını kaybeder. Bu projede public taraf yoğun ISR kullandığından **performans regresyonu yüksek**. Ayrıca layout'taki inline GTM script'inin `nonce` alması gerekir |
| **SRI (experimental, hash)** | Statik generation korunur ama **inline** script'lere (GTM snippet) uygulanmaz; deneysel |
| **Nonce'suz** (`script-src 'self' 'unsafe-inline'`) | Statik kalır ama `unsafe-inline` XSS'e karşı script katmanında koruma sağlamaz → SEC-05'i çözmez |

**Inline script gerçekten gerekli mi?** Evet, iki yerde: (a) layout'taki GTM bootstrap (`next/script` inline), (b) arama sayfalarındaki sabit dropdown-close script'i. Bunlar dış dosyaya taşınırsa `'unsafe-inline'` gereksinimi kalkar. `@next/third-parties`'in `GoogleTagManager` bileşeni nonce desteğiyle kullanılabilir.

**Güvenli bir CSP için gereken domainler** (kod taramasından):
- `script-src`: `'self'`, `www.googletagmanager.com` (GTM), `www.google-analytics.com` (GA)
- `frame-src`: `www.google.com` (Maps embed), `www.youtube-nocookie.com` / `www.youtube.com` (video), `www.googletagmanager.com`
- `img-src`: `'self'`, `data:`, `blob:`, `cdn.villayagel.com` / `assets.villayagel.com` (env'den CDN host'ları), `*.tile.openstreetmap.org` (admin harita), `i.ytimg.com`, `www.google-analytics.com`, `**.supabase.co` (legacy görseller kalmışsa)
- `connect-src`: `'self'`, GA/GTM, `nominatim.openstreetmap.org` (admin geocode client-side ise — kontrol edilmeli)
- `style-src`: `'self'` (+ leaflet/tailwind inline stilleri için değerlendirme)
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`

**`unsafe-eval`:** yalnız development'ta React için gerekli; production'da gerekmiyor. Kodda `eval`/`new Function` yok.

**Kritik nokta:** CSP tek başına SEC-05'i **tam çözmez** — `custom_head_scripts`/`analytics_script` alanlarının amacı zaten "admin script yapıştırsın" olduğundan, `'unsafe-inline'` içeren gevşek bir CSP bu script'leri engellemez; nonce'lu sıkı CSP ise admin'in yapıştırdığı script'i de engeller (özelliği bozar). Bu yüzden asıl çözüm **girdi tarafında yapılandırma** olmalı.

---

## 7. Sonuç — Zorunlu Cevaplar

1. **SEC-05 gerçek mi?** **Evet — runtime'da kanıtlandı.** Beş enjeksiyon vektörü lokal build'de public HTML'de çalıştırılabilir biçimde üretildi; map_embed KANITLI-KOD.
2. **XSS türü:** **Stored (persistent) XSS.** Reflected/DOM-XSS birincil değil.
3. **Gerçekten executable HTML/JS kabul eden alanlar:** `custom_head_scripts`, `analytics_script`, `gtm_container_id` (inline breakout), `villa.map_embed`. Dördü de sanitize/validation'sız.
4. **Gereken yetki:** settings üçlüsü → `settings` izni (SEC-03 Faz 1 sonrası; öncesinde her aktif admin). map_embed → villa yazma; **şu an her aktif admin** (SEC-03 Faz 2 henüz yok).
5. **SEC-03 ile birleşince:** SEC-03 Faz 1 settings vektörünü `settings` iznine daralttı (iyileşme). map_embed vektörü hâlâ tüm aktif adminlere açık. Genel zincir: enjekte edilen script aynı origin'de admin API'lerine erişip yetki yükseltebilir.
6. **CSP mevcut mu?** **Hayır** (runtime doğrulandı). Diğer güvenlik başlıkları da yok. Prod-önü katman DOĞRULANAMADI.
7. **CSP eklemek bozar mı?** Nonce'lu sıkı CSP mevcut ISR/statik render'ı dynamic'e zorlayıp performansı bozar ve admin'in kasıtlı inline script özelliğini engeller. Nonce'suz gevşek CSP performansı korur ama SEC-05'i çözmez. Yani CSP tek başına yeterli/uygun değil.
8. **Sanitize mı, CSP mi, ikisi de mi?** **Öncelik girdi tarafı (yapılandırma/whitelist), ikincil olarak defense-in-depth CSP.** Ham "script yapıştır" alanları yapılandırılmış alanlara çevrilirse hem sorun kökten çözülür hem de sıkı CSP uygulanabilir hale gelir.
9. **En küçük ve güvenli düzeltme planı** (onay bekliyor, kod yazılmadı):
   - **Faz A — gtm_container_id (en küçük, en net):** Kayıt ve/veya render'da `^GTM-[A-Z0-9]{4,10}$` regex doğrulaması. Breakout'u kökten kapatır, meşru kullanımı bozmaz.
   - **Faz B — map_embed:** Ham iframe yerine yalnız `src` URL'i sakla ve iframe'i kod üretsin; host allow-list (`www.google.com/maps/embed`). Alternatif: `sanitize-html` ile yalnız `iframe` + güvenli attribute allow-list.
   - **Faz C — custom_head_scripts / analytics_script:** Ham alanları yapılandırılmış alanlara indir (GA4 Measurement ID, Meta Pixel ID, doğrulama meta'ları vb.). Ham HTML gerçekten gerekiyorsa ayrı ve açıkça işaretli bir "tehlikeli" izinle sınırla + değeri sunucuda dar bir allow-list'ten geçir.
   - **Faz D — defense-in-depth başlıklar:** `next.config.ts headers()` ile HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'` (admin). CSP'yi önce `Content-Security-Policy-Report-Only` ile ölç; Faz A–C sonrası nonce/SRI kararını performans ölçerek ver.
   - **JSON-LD (SEC-21):** `StructuredData.tsx`'te `<` kaçışı — küçük ek.
10. **Değişiklik yapılırsa çalıştırılacak testler:** `npm test` (tam suite); `tsc --noEmit`; `eslint .`; prod `next build`; lokal sentinel runtime testi (enjeksiyonun public HTML'de **artık görünmediğini** doğrula); meşru GTM/GA/Maps/YouTube/CDN yüklemelerinin çalıştığını doğrula; SEC-01 ve SEC-03 regresyon testleri; public sayfa ISR/cache davranışının bozulmadığını doğrula.
11. **Kod/config/DB değişti mi?** **HAYIR.**
12. **Commit/push/deploy yapıldı mı?** **HAYIR.**

---

## Son Kontrol

```
CODE CHANGES:   0
CONFIG CHANGES: 0
DB CHANGES:     0   (yalnız lokal fixture kv_sec03'e sentinel; production DB'ye dokunulmadı)
R2 CHANGES:     0
COMMIT / PUSH / DEPLOY: NO
```

- **HEAD (device):** `6efc1cd` — değişmedi.
- Takip edilen dosyalarda diff yok. Tek yeni dosya: bu rapor (`Claude outputs/security-sec05-analysis.md`, untracked).
- Düzeltme için ayrıca onay bekleniyor.
