# SEC-05: CSP Report-Only uygulama raporu

**Tarih:** 2026-09-24
**Device HEAD:** `6efc1cd` (değişmedi)
**Durum:** Uygulandı ve device'ta md5 ile doğrulandı. **Commit, push ve deploy yapılmadı.**
**Yapılmayanlar:**

- Enforce eden CSP yok.
- Nonce yok.
- Middleware değişikliği yok (`middleware.ts` md5 `b5765511` aynı).
- Migration, DB, R2 ve env değişikliği yok.
- Yeni dependency yok.

**Dış ağ:** Bu turda hiçbir dış siteye istek atılmadı. Runtime testlerinde Playwright, `localhost` dışındaki tüm istekleri tarayıcıda iptal etti (abort). CSP değerlendirmesi istek gönderilmeden önce yapıldığı için ihlal tespiti bundan etkilenmedi.

---

## 1. Eklenen ve değişen dosyalar

Patch: `Claude outputs/patches/sec05-csp-report-only.patch` (4 dosya, +507 / −0).

| Dosya | Tür | İçerik |
|---|---|---|
| `next.config.ts` | Değişti (yalnız ekleme) | `buildCspReportOnly(kind, env)` fonksiyonu ve `headers()`. Mevcut `images.remotePatterns` **aynen** duruyor |
| `app/api/csp-report/route.ts` | Yeni | Tarayıcıların ihlal raporlarını gönderdiği uç nokta (`report-uri`). Yalnız POST, her zaman 204 döner |
| `lib/security/csp-report.ts` | Yeni | Rapor ayrıştırma, maskeleme ve dedupe yardımcıları. Next, route dosyasından ek export'a izin vermediği için ayrı dosyada |
| `tests/unit/sec05-csp-report-only.test.ts` | Yeni (14 test) | Policy, header kuralları, env kullanımı, maskeleme, dedupe, boyut sınırı |

---

## 2. CSP policy

Header yalnızca **`Content-Security-Policy-Report-Only`**. Tarayıcı hiçbir kaynağı engellemiyor.

**Public** (`/((?!api|_next/static|_next/image|favicon.ico|maki-admin).*)` — tüm public sayfalar, 404 dahil):

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://*.googletagmanager.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <CDN_VILLA_IMAGES origin> <CDN_SITE_ASSETS origin> https://*.supabase.co https://i.ytimg.com https://*.googletagmanager.com https://*.google-analytics.com;
font-src 'self' data:;
connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com;
frame-src https://www.google.com https://google.com https://maps.google.com https://www.youtube-nocookie.com;
media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self';
report-uri /api/csp-report
```

**Admin** (`/maki-admin/:path*`, `/maki-admin` dahil — runtime'da doğrulandı):

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: <CDN origin'leri> https://*.supabase.co https://i.ytimg.com https://unpkg.com https://*.tile.openstreetmap.org;
font-src 'self' data:; connect-src 'self';
frame-src 'self' https://www.google.com https://google.com https://maps.google.com https://www.youtube-nocookie.com;
media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self';
report-uri /api/csp-report
```

**CDN origin'leri hardcode edilmedi.** `next.config.ts`'in `remotePatterns` için zaten okuduğu `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES` ve `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS` değerlerinden, build/start anında origin olarak türetiliyor.

- Env tanımsızsa CDN policy'ye **eklenmiyor**; fallback domain yok. Test bunu kilitliyor: `villayagel` / `yazvillam` geçmez.
- Geçersiz veya `javascript:` gibi değerler policy'ye sızmıyor (test var).
- `/api/*`, `/_next/static`, `/_next/image` ve favicon'a header eklenmiyor (Next CSP dokümanının önerisi).

---

## 3. Her kaynağın neden eklendiği

| Kaynak | Direktif | Neden (koddaki karşılığı) |
|---|---|---|
| `'self'` | tümü | Uygulamanın kendi JS/CSS chunk'ları, `next/image` proxy'si (`/_next/image`, unsplash dahil), `next/font` self-hosted fontlar, `/flags/*.svg`, `/brand/*`, RSC/server action/`/api` çağrıları |
| `'unsafe-inline'` (script) | script-src | **Zorunlu:** Next App Router her sayfaya inline flight script'leri (`self.__next_f.push`, ana sayfada ~26 adet) basıyor. Ayrıca `gtm-init` (`next/script` inline), `SORT_DROPDOWN_CLOSE_SCRIPT` (`/arama`, `/kiralik-villalar`) ve admin'in `custom_head_scripts` / `analytics_script` alanlarındaki inline scriptler var. Nonce **tüm sayfaları dinamik render'a zorlar** (Next dokümanı) ve ISR/static bozulurdu. Sayfa başına değişen flight verisi hash'lenemez |
| `'unsafe-inline'` (style) | style-src | **Zorunlu:** React `style={}` attribute'ları (ana sayfada ~1400, `/v/` sayfasında ~420). Attribute'lar nonce veya hash ile yetkilendirilemez |
| `https://*.googletagmanager.com` | script / img / connect | GTM loader (`www.googletagmanager.com/gtm.js`, `SiteTrackingScripts`); GTM üzerinden GA4 (`gtag/js`) |
| `https://*.google-analytics.com`, `https://*.analytics.google.com` | img / connect | GTM içindeki GA4'ün veri gönderim uçları (Google Tag Platform CSP rehberindeki temel liste) |
| CDN origin'leri (env) | img-src | Villa görselleri ve site asset'leri. Galeri, `PageHero`, header/footer logosu, blog kapakları (`unoptimized`), `VillaSearchBox`, rezervasyon görselleri gibi yerlerde `next/image` olmadan doğrudan `<img>` kullanılıyor. Runtime'da doğrudan istek gözlendi |
| `https://*.supabase.co` | img-src | `next.config.ts` `LEGACY_ASSET_HOST` ile aynı. DB'de hâlâ eski sağlayıcının URL'ini tutan görseller için |
| `https://i.ytimg.com` | img-src | YouTube video kapakları (`lib/youtube.helper.ts` → `getYouTubeThumbnailUrl`) |
| `https://www.google.com`, `https://google.com`, `https://maps.google.com` | frame-src | Harita iframe'leri: villa modalı (koordinat ve embed), `/iletisim`, `/v/[token]`. `lib/map-embed.helper.ts` `ALLOWED_MAP_HOSTS` ile birebir |
| `https://www.youtube-nocookie.com` | frame-src | `VillaVideoModal` ve `VillaVideoSection` (`youtube.helper` yalnız nocookie embed üretiyor) |
| `data:` | img / font | Inline SVG/QR (2FA), küçük data URI'ler |
| `blob:` | img / media / worker | Admin görsel önizleme ve sıkıştırma (`URL.createObjectURL`: `lib/image.helpers.ts`, `lib/admin-branding.client.ts`) |
| `https://unpkg.com`, `https://*.tile.openstreetmap.org` | img-src (yalnız admin) | `MapPicker` (Leaflet marker ikonları ve OSM tile'ları) |
| `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | — | Plugin/embed, `<base>` enjeksiyonu ve dış form hedefi yok. Formlar JS ile `/api`'ye gönderiliyor |

**Eklenmeyenler:**

- `'unsafe-eval'`: 27 sayfa ve senaryoda hiç `eval` ihlali görülmedi; production'da gerektiğine dair kanıt yok. GTM konteynerinde "Custom JavaScript" değişkeni varsa raporlarda `script-src … eval` olarak görünecek.
- `frame-ancestors`, `upgrade-insecure-requests`, `sandbox`: Report-Only'de tarayıcı bunları yok sayıp console uyarısı üretiyor.
- WhatsApp ve sosyal linkler: yalnız navigasyon, CSP kapsamında değil.
- Nominatim, TCMB ve Resend: sunucu tarafında çağrılıyor, tarayıcıyı ilgilendirmiyor.
- Google/Yandex/Bing doğrulaması: yalnız `<meta>` etiketi, kaynak yüklemiyor.

---

## 4. CSP ihlalleri

Test verisi: `custom_head_scripts` = meta + inline script + **harici test script'i**, `analytics_script` = inline script + **img beacon**, `gtm_container_id = GTM-TEST1234`, Google/Yandex/Bing doğrulama alanları dolu.

| Kapsam | Sonuç |
|---|---|
| Uygulamanın kendi kaynakları (public 18 sayfa + admin 7 sayfa) | **0 ihlal** |
| Admin sayfaları | **0 ihlal** |
| Tespit edilen tek ihlal | Her public sayfada 2 adet: `script-src-elem` + `img-src` → `http://127.0.0.1:8766`. Bu, legacy alanlara **bilerek** koyduğum ve allowlist'te olmayan **test host'u**. Production'da `custom_head_scripts` / `analytics_script` içinde gerçek bir vendor (Meta Pixel, Hotjar vb.) varsa, onun domain'i de aynı şekilde raporlanacak. Policy'yi tamamlamanın yolu bu raporlar |
| `eval` ihlali | Yok |
| Enforce eden `Content-Security-Policy` header'ı | Hiçbir yanıtta yok (25/25 kontrol edildi) |

**Report-Only hiçbir şeyi engellemedi.** İhlal olan test script'i ve beacon **yine çalıştı ve yüklendi**. Console'da yalnız `[Report Only] Refused to load …` bilgi satırı çıktı.

`/api/csp-report` sunucu log'u örneği (maskeli, dedupe'lu):

```
[csp-report] {"directive":"img-src","blocked":"http://127.0.0.1:8766","page":"/kiralik-villa/*"}
```

Private token (`/v/<token>`) log'a **hiç** yazılmadı (`/v/*` olarak maskelendi; grep ile doğrulandı). Script örneği ve URL path/query'si loglanmıyor.

---

## 5. Runtime regresyon (before: Phase 2 build + policy enjeksiyonu / after: gerçek header)

Aynı test verisiyle 25 sayfa ve 1 SPA geçişi, masaüstü ve iPhone 13 profilinde, 19 ölçüm alanıyla karşılaştırıldı: **fark 0.**

| Kontrol | Sonuç (before = after) |
|---|---|
| Ana sayfa, `/arama`, `/kiralik-villalar`, villa detay, `/rezervasyon/[slug]`, `/rezervasyon-kontrol`, `/iletisim`, `/teklif-al`, blog, blog detay, `/p/[slug]`, `/favoriler`, `/v/[token]`, 404, villa 404, mobil ana sayfa ve villa | Hepsi 200 (404'ler 404). Sayfa içerik uzunlukları **birebir** aynı |
| Mevcut scriptler (`custom_head_scripts` inline + harici, `analytics_script` inline) | ✅ Her public sayfada 1 kez çalışıyor |
| Analytics beacon | ✅ Sayfa başına 1 istek |
| GTM | ✅ Loader isteği yapılıyor, `dataLayer` dolu, `gtm.js` olayı var |
| Google / Yandex / Bing doğrulama meta'ları | ✅ Tüm sayfalarda `<head>` içinde |
| Google Maps iframe'i | ✅ Villa modalı (masaüstü ve mobil), `/iletisim`, `/v/`: `www.google.com` yükleniyor, ihlal yok |
| JSON-LD | ✅ Aynı blok sayıları, hepsi parse ediliyor (ana sayfa 3/3, villalar 3/3, arama 2/2, villa 2/2 …) |
| Public formlar | ✅ İletişim ve teklif formları render oluyor, alanlar doldurulabiliyor (form/input sayıları aynı), ihlal yok. Harici mail tetiklememek için gönderim yapılmadı |
| SPA geçişi `/` → `/iletisim` | ✅ Aynı; scriptler yeniden çalışmıyor, harita iframe'i yükleniyor |
| Admin: login, dashboard, `settings/genel`, `settings/gelismis`, `settings/seo`, villa listesi, villa ekle | ✅ Aynı içerik, 0 ihlal; takip kodu yok (Phase 2 davranışı korunuyor) |
| AdminSessionGuard (`ux3`: sahte cookie, anonim, geçerli, idle + refresh, client navigasyon) | ✅ Önceki SEC-01/SEC-03 sonuçlarıyla **birebir aynı** |
| Permission / API (`integ3` 26 PASS, `reg3` 22 PASS) | ✅ Önceki koşuyla aynı. Kalan 3 FAIL test verisinin durumundan kaynaklanıyor (aynı e-posta zaten kayıtlı, silinecek eski log kalmadı, çoklu dil kapalı olduğu için `/en` 404) |
| Sunucu log'u | Yeni hata yok. `getPageBySlug` uyarısı önce ve sonra aynı (17 / 17, test verisinden) |

---

## 6. Build, TypeScript, ESLint, testler, ISR/static

| Kontrol | Önce (baseline) | Sonra |
|---|---|---|
| TypeScript | 0 hata | **0 hata** (cloud + device) |
| ESLint | 0 hata / 195 uyarı | **0 hata / 195 uyarı** (uyarı listesi birebir aynı) |
| Tüm testler | 190 dosya / 3737 test ✓ | **191 dosya / 3751 test ✓** (+14 yeni) |
| Device'ta güvenlik testleri (SEC-01/03/05 + CSP) | — | **6 dosya / 122 test ✓** |
| Production build | exit 0, 46/46 static sayfa | **exit 0, 46/46 static sayfa** |
| Route tablosu | 189 satır | 190 satır. **Tek fark yeni `ƒ /api/csp-report`**; tüm sayfa rotalarının ○/ƒ durumu ve revalidate değerleri aynı |
| ISR/static yanıtları | — | `/`: `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, `s-maxage=600`. `/iletisim`: `s-maxage=3600`. Önceki değerlerle aynı; CSP header'ı eklenmiş |

---

## 7. Açık kalan CSP riskleri

1. **Report-Only koruma sağlamaz.** XSS'i engellemez, yalnız görünürlük sağlar. Enforce ayrı bir onay adımı olmalı.
2. **Enforce edilse bile `'unsafe-inline'` şart.** Inline script enjeksiyonuna karşı CSP'nin koruması sınırlı kalır. Kazanımlar: harici script host kısıtı, `object-src` / `base-uri` / `form-action`, `connect-src` ve `img-src` ile veri sızdırma yüzeyinin daralması. Tam koruma nonce ister, o da ISR'ı bozar. Admin tarafı zaten tamamen dinamik; orada ileride nonce tabanlı sıkı CSP düşünülebilir.
3. **Bilinmeyen production kaynakları raporlanacak.** Production DB okunamadığı için şunlar bu policy'de yok ve **rapor üretecek** (engellenmeyecek):
   - `custom_head_scripts` / `analytics_script` içindeki gerçek vendor'lar;
   - GTM konteynerinin yüklediği tag'ler (Google Ads, Signals, `google.com.tr`, Meta vb.);
   - blog ve villa açıklamalarındaki harici görsel host'ları (sanitize edilmiş içerik her `http(s)` host'una izin veriyor).

   Enforce'tan önce 1–2 haftalık rapor verisiyle allowlist tamamlanmalı.
4. **GA4/GTM alan adları doğrulanmalı.** Google Tag Platform CSP rehberindeki temel listeye göre eklendi. Bu turda dış siteye istek atmadığım için rehberin güncel hali kontrol edilmedi; enforce öncesi rehber ve rapor verisiyle doğrulanmalı.
5. **Rapor hacmi.** `/api/csp-report` herkese açık bir POST uç noktası. Korumalar: 16 KB limit, DB yok, maskeli log, 10 dakikalık dedupe, bellek sınırı. Ama rate limit yok ve her ihlal bir istek demek. Bilinmeyen bir vendor her sayfa görüntülemesinde rapor üretebilir. Gerekirse `next.config.ts`'teki `report-uri` satırını kaldırmak raporlamayı kapatır; ihlaller tarayıcı console'unda görünmeye devam eder.
6. **Admin URL'lerinde 404 ve client-side `notFound()`.** Public 404 bileşeni GTM'i yüklüyor ve admin policy bunu raporlayacak (Phase 2'den bilinen durum).
7. **Admin `MapPicker`.** Leaflet haritası otomatik testte açtırılamadı. `unpkg` ve OSM tile host'ları koddan eklendi ama runtime'da doğrulanmadı. Report-Only olduğu için risk yok; eksik bir host varsa raporda görünür.
8. **Env değişirse.** CDN env değeri production'da yanlış ya da boşsa CDN görselleri raporlanır (engellenmez).

---

## 8. Device durumu

```
HEAD: 6efc1cd (değişmedi) · middleware.ts b5765511 (değişmedi)
 M next.config.ts                        1a6eab0cc0d4  (CSP Report-Only)
?? app/api/csp-report/route.ts           dd1f81a46d9f  (CSP Report-Only)
?? lib/security/csp-report.ts            6eb3646f3a0a  (CSP Report-Only)
?? tests/unit/sec05-csp-report-only.test.ts  3ae9d15cd726  (CSP Report-Only)
(SEC-05 Phase 1 ve Phase 2 dosyaları değişmedi)
```

**Commit, push ve deploy yapılmadı.**
