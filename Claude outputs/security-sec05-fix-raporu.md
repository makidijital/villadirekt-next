# SEC-05 — XSS Düzeltme Raporu (Faz 1: GTM + map_embed)

- **Tarih:** 2026-09-24
- **Başlangıç (device HEAD):** `6efc1cd` — tree `8d9dc65…` (cloud çalışma kopyası bu tree ile birebir; baseline temiz doğrulandı)
- **Yaklaşım:** SEC-05'te runtime'da kanıtlanan beş vektörden **kesin kapatılabilir ve prod verisi gerektirmeyen ikisini** minimum değişiklikle kapattım (GTM breakout, map_embed ham HTML). Geri kalan iki alan (`custom_head_scripts`, `analytics_script`) tasarımı gereği "admin script yapıştırma" özelliği olduğundan ve güvenli dönüşümü prod DB analizi + migration gerektirdiğinden **bu fazda değiştirilmedi, aşağıda raporlandı**. CSP envanteri ve önerisi §CSP'de.
- **Değişmeyenler:** SEC-01, SEC-03 düzeltmeleri; auth/permission sistemi; middleware; .env; DB; R2. Yeni dependency YOK. Migration YOK. Commit/push/deploy YOK.

---

## 1. Yapılan Değişiklikler

### Yeni dosyalar (saf, edge-safe helper'lar)

| Dosya | İçerik |
|---|---|
| `lib/gtm.helper.ts` | `normalizeGtmId()` / `isValidGtmId()` — `^GTM-[A-Z0-9]{4,15}$` strict doğrulama |
| `lib/map-embed.helper.ts` | `extractSafeMapEmbedSrc()` / `hasSafeMapEmbed()` — Google Maps embed'inden allow-list'li güvenli `src` çıkarımı |

### Değişen dosyalar

| Dosya | Ne değişti | Önceki davranış | Yeni davranış |
|---|---|---|---|
| `app/layout.tsx` | `import { normalizeGtmId }`; `const gtmId = normalizeGtmId(settings?.gtm_container_id)` | Ham `gtm_container_id` inline GTM script literal'ine (`'dataLayer','${gtmId}'`) doğrulanmadan basılıyordu → breakout | Yalnız geçerli GTM ID interpolate edilir; geçersiz/zararlı değer `null` → GTM script bloğu hiç render edilmez |
| `app/components/villa/VillaMapModal.tsx` | `import { extractSafeMapEmbedSrc }`; `safeMapEmbedSrc` hesaplanır; `dangerouslySetInnerHTML` → `<iframe src={safeMapEmbedSrc}>` | Ham `map_embed` HTML `dangerouslySetInnerHTML` ile basılıyordu (public villa detay) | Yalnız allow-list'li (`www.google.com`/`maps.google.com`, `/maps*`, `https`) `src` ile uygulama kendi iframe'ini üretir; ham script/handler elenir |
| `app/components/private-villa/PrivateVillaPageBody.tsx` | Aynı desen; ayrıca "harita yok" fallback koşulu `!extractSafeMapEmbedSrc(...)` ile güncellendi | Ham `map_embed` HTML basılıyordu (off-market `/v/[token]`) | Güvenli `src` iframe; geçersiz embed → "konum yok" fallback |
| `tests/unit/sec05-xss-helpers.test.ts` | 14 yeni regresyon testi | — | GTM + map_embed güvenlik davranışını kilitler |

**Neden bu tasarım:** `dangerouslySetInnerHTML` tamamen kaldırıldı (iki harita render noktasında); ham HTML yerine yalnız doğrulanmış URL geçiyor. GTM'de string literal'e giren değer artık `[A-Z0-9]` dışına çıkamaz → breakout imkânsız. Helper'lar saf fonksiyon olduğu için hem server (layout, off-market body) hem client (VillaMapModal) güvenle import ediyor; yeni bağımlılık yok.

---

## 2. Güvenlik Açığının Kapanma Durumu (runtime kanıtı, lokal/test)

Lokal prod build + `next start`, sentinel değerlerle:

| Vektör | Test | Sonuç |
|---|---|---|
| GTM breakout | Ayarlara `');window.SENTINEL_GTM_BREAKOUT=1;//` konup ana sayfa çekildi | Çalıştırılabilir bağlamda **0**; GTM loader render **edilmedi** (`gtm.start`=0, `gtm.js`=0). Breakout string yalnızca RSC flight içinde **escape'li inert JSON** olarak var (yürütülemez) → **KAPALI** |
| GTM geçerli | Ayarlara `GTM-TEST1234` konup ana sayfa çekildi | GTM loader render edildi, `GTM-TEST1234` doğru basıldı, `gtm.start` inline script mevcut → **mevcut GTM çalışıyor** |
| map_embed script | Villa `map_embed`'e `<iframe src=google...><script>SENTINEL_MAP_XSS</script><img onerror=SENTINEL_MAP_ONERROR>` konup villa detay çekildi | Ham `<script>`=**0**, `onerror`=**0**; yalnız allow-list'li `maps/embed?pb=SENTINEL_MAP_OK` src'i render edildi → **KAPALI** |
| custom_head / analytics | Sentinel'ler konup ana sayfa çekildi | Hâlâ render ediliyor (tasarım gereği; bu fazda değiştirilmedi) — **özellik korundu** |

Birim testleri ayrıca şu saldırıları reddediyor: küçük harf/kısa/uzun/UA-formatı GTM; `javascript:`, `http:` (non-https), izinsiz host (`evil.com`, `google.com.evil.com`), harita-dışı Google yolu (`/search`), `<img onerror>`, salt `<script>`.

---

## 3. Test Sonuçları

| Kontrol | Sonuç |
|---|---|
| Yeni SEC-05 birim testleri | **14/14 geçti** |
| Tüm test suite | **188 dosya / 3725 test geçti** (öncesi 3711 + 14) |
| SEC-01 testleri | Geçti (suite içinde) |
| SEC-03 testleri | Geçti (suite içinde) |
| TypeScript (`tsc --noEmit`) | **0 hata** |
| ESLint (tüm repo) | **0 error, 197 warning** (baseline ile aynı; yeni uyarı yok) |
| Production build (`next build`, Turbopack) | **Başarılı** (exit 0); route tablosu değişmedi |
| Mutation kontrolü | GTM/map düzeltmesi geri alınınca ilgili testler kırılıyor (regresyon kilidi gerçek) |

---

## 4. Public Site & Admin Regresyon

- **Public:** ana sayfa, villa detay (`/kiralik-villa/villa-547`), off-market sayfa render'ı 200; harita bölümü geçerli embed ile çalışıyor, geçersizde "konum yok" fallback'e düşüyor (mevcut davranış). GTM/analytics/custom_head davranışı korundu.
- **Admin:** `settings/gelismis` ve villa formu (LocationStep iframe textarea) **hiç değişmedi** — admin girişi aynen kabul ediliyor; yalnız public **render** güvenli hale geldi. Villa düzenleme ekranı `map_embed` textarea'sını olduğu gibi gösterir (DB değeri korunur).
- **SEC-01 / SEC-03:** ilgili testler suite içinde geçti; bu düzeltme auth/permission yollarına dokunmadı.

---

## 5. Kalan Riskler ve Kapsam Dışı Bırakılanlar

1. **`custom_head_scripts` ve `analytics_script` (bilinçli script-enjeksiyon özelliği) — AÇIK.**
   - Bunlar tasarım gereği admin'in keyfi `<script>` çalıştırması için var (UI ipuçları: "Google Analytics, GTM, Facebook Pixel", "hotjar, font vs."). Sanitize etmek özelliği kırar.
   - **Mevcut azaltma:** SEC-03 Faz 1 sonrası `PUT /api/admin/settings` yalnız `settings` iznine sahip adminle yazılabiliyor. Yani vektör "her aktif admin"den "settings-yetkili admin"e daraldı.
   - **Kalıcı çözüm (ONAY + PROD ANALİZİ gerektirir):** ham alanları yapılandırılmış, doğrulanabilir alanlara indirmek (GA4 Measurement ID, Meta Pixel ID, doğrulama meta'ları). Bu **migration** ister; önce prod'daki mevcut değerlerin biçimi analiz edilmeli (aşağıdaki READ-ONLY sorgu). Prod DB'ye buradan erişilemediği için **bu fazda yapılmadı**.

   ```sql
   -- READ ONLY: mevcut custom_head / analytics içeriğini sınıflandır (değer dökmeden)
   BEGIN TRANSACTION READ ONLY;
   SELECT
     count(*) FILTER (WHERE coalesce(btrim(custom_head_scripts),'') <> '') AS custom_head_dolu,
     count(*) FILTER (WHERE coalesce(btrim(analytics_script),'')   <> '') AS analytics_dolu,
     count(*) FILTER (WHERE custom_head_scripts ILIKE '%<script%')          AS custom_head_script_iceren,
     count(*) FILTER (WHERE analytics_script   ILIKE '%<script%')           AS analytics_script_iceren
   FROM public.settings;
   ROLLBACK;
   ```

2. **map_embed allow-list yalnız Google Maps host'larını kapsıyor.** Başka bir harita sağlayıcısı (ör. Yandex/OSM iframe) kullanılıyorsa o embed artık render edilmez ("konum yok" fallback). Prod'da yalnız Google Maps kullanıldığı varsayımı UI ipucu ("Google Maps iframe kodunu buraya yapıştır") ile uyumlu; farklı sağlayıcı varsa allow-list genişletilmeli. **Doğrulama önerisi (READ ONLY):**
   ```sql
   BEGIN TRANSACTION READ ONLY;
   SELECT count(*) AS iframe_villa,
          count(*) FILTER (WHERE map_embed ILIKE '%google.com/maps%') AS google_olan
   FROM public.villa WHERE map_type='iframe' AND coalesce(btrim(map_embed),'')<>'';
   ROLLBACK;
   ```
   `iframe_villa = google_olan` ise hiçbir mevcut embed bozulmaz.

3. **GTM üst sınır `{4,15}`.** Google GTM ID'leri bu aralıkta; teorik olarak >15 karakterlik meşru bir ID varsa reddedilir (bilinmiyor; pratikte yok).

---

## 6. Migration Durumu

- **Bu faz:** migration **YOK, gerekmiyor.** GTM ve map_embed düzeltmeleri yalnız render katmanında; DB şeması/verisi değişmedi. Mevcut stored değerler olduğu gibi kalır, render anında güvenli işlenir.
- **Gelecek (custom_head/analytics yapılandırılmış modele geçiş):** migration **gerekebilir**; önce §5.1'deki READ-ONLY analiz, sonra ayrı onay. Kendiliğinden yapılmadı.

---

## 7. CSP Durumu

- **Mevcut:** CSP yok (SEC-05 analizinde runtime doğrulandı).
- **Bu fazda eklenmedi.** Gerekçe: asıl çözüm ham HTML/JS enjeksiyonunu kapatmaktı (yapıldı). Anlamlı-sıkı bir CSP, `custom_head_scripts`/`analytics_script`'in bilinçli inline-script doğasıyla çakışır (nonce'lu sıkı CSP bu özelliği kırar **ve** mevcut ISR/statik render'ı dynamic'e zorlar; `unsafe-inline`'lı gevşek CSP ise koruma sağlamaz). Bu yüzden CSP, custom_head/analytics kararından **sonra** ele alınmalı.
- **Envanter (kod taramasından, ileride CSP için):**
  - `script-src`: `'self'`, `www.googletagmanager.com`, `www.google-analytics.com`
  - `frame-src`: `www.google.com` (Maps), `www.youtube-nocookie.com`/`www.youtube.com`, `www.googletagmanager.com`
  - `img-src`: `'self'`, `data:`, `blob:`, `cdn.*`/`assets.*` (env CDN), `*.tile.openstreetmap.org` (admin), `i.ytimg.com`, `**.supabase.co` (legacy)
  - `connect-src`: `'self'`, GA/GTM, `nominatim.openstreetmap.org` (admin geocode)
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- **Öneri:** custom_head/analytics yapılandırıldıktan sonra `Content-Security-Policy-Report-Only` ile başlanması. `unsafe-eval` gerekmiyor (prod'da). Inline GTM/dropdown script'leri için nonce/hash veya `@next/third-parties` değerlendirilmeli.

---

## 8. git diff özeti

```
 app/components/private-villa/PrivateVillaPageBody.tsx | 32 +++--
 app/components/villa/VillaMapModal.tsx               | 17 ++-
 app/layout.tsx                                       |  6 +-
 lib/gtm.helper.ts                                    | 40 ++++++   (yeni)
 lib/map-embed.helper.ts                              | 73 +++++++++++ (yeni)
 tests/unit/sec05-xss-helpers.test.ts                 | 138 +++++++++  (yeni)
 6 files changed, 289 insertions(+), 17 deletions(-)
```

- **HEAD (device):** `6efc1cd` — değişmedi.
- Yeni/değişen dosyalar takip ediliyor; `Claude outputs/` altındaki bu rapor untracked.
- **Commit / push / deploy: YAPILMADI.**

---

## Son Kontrol

```
CODE CHANGES:   6 dosya (2 yeni helper, 1 test, 3 render noktası)
CONFIG CHANGES: 0
DB CHANGES:     0   (yalnız lokal fixture kv_sec03'e sentinel; production DB'ye dokunulmadı)
R2 CHANGES:     0
NEW DEPENDENCY: 0
MIGRATION:      0 (bu faz); custom_head/analytics dönüşümü için ileride gerekebilir → raporlandı
COMMIT / PUSH / DEPLOY: NO
```
