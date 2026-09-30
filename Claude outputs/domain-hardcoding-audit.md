# Domain ve marka bağımlılığı audit'i (salt okuma)

**Tarih:** 2026-09-24
**Device HEAD:** `d395a31 security: harden admin permissions and XSS protections`. Çalışma ağacı temiz (yalnız `Claude outputs/`).
**Kapsam:** Yalnızca okuma yapıldı. Kod, config, `.env`, migration, commit, push ve deploy değişikliği yok.

- Production DB'ye bağlanılmadı.
- Hiçbir dış siteye istek atılmadı.
- `.env.local` dosyasından yalnız URL/domain anahtarları okundu; secret değerler yazdırılmadı.
- Bulgular kod, yerel build çıktısı (`.next/`) ve Next.js'in kendi dokümanı ve kaynak kodu üzerinden doğrulandı.

---

## 0. Yönetici özeti

1. **`villayagel.com` hiçbir `.env` dosyasında yok.** Kodda üç çeşit yerde geçiyor: gömülü yedek (fallback) değerler, yorumlar ve testler. Production'ı **fiilen etkileyebilecek** iki yer var:
   - **Admin bildirim maili:** `MAIL_ADMIN_NOTIFY_TO` Coolify'da tanımlı değilse, müşteri bilgilerini içeren admin kopyası `rezervasyon@villayagel.com` adresine gidiyor. Env boş string verilse bile fallback devreye giriyor; yani bu bildirimler env ile **kapatılamıyor** (kodun yorumu aksini söylüyor).
   - **`next.config.ts` CDN fallback'i:** Build sırasında `NEXT_PUBLIC_CDN_BASE_*` yoksa `next/image` izin listesi eski `cdn./assets.villayagel.com` host'larına düşüyor.
2. **Site URL'i tek bir env değişkenine bağlı: `NEXT_PUBLIC_SITE_URL`.** Canonical, `og:url`, sitemap, robots, JSON-LD ve rezervasyon paylaşım linki bu değişkeni kullanıyor. **Build anında tanımlı olmalı.** Next bu değeri build sırasında koda gömüyor, static/ISR sayfalar da build anında üretiliyor. Tanımsızsa:
   - canonical ve `og:url` → `http://localhost:3000/...` olur (Next'in varsayılanı, kaynak kodda doğrulandı);
   - sitemap URL'leri relative kalır;
   - **`robots.txt` tamamen static olduğu için bir sonraki deploy'a kadar sitemap satırı olmadan kalır.**
3. **Hiçbir sunucu kodu `Host` / `X-Forwarded-Host` header'ını okumuyor.** Bu, SEO ve e-posta linkleri için doğru tasarım. Runtime'da gerçek domaini zaten kullanan yerler admin'deki tarayıcı tarafı link üreticileri (`window.location.origin`).
4. **"Hepsini mevcut domain yapalım" yaklaşımı yanlış olur:**
   - static/ISR sayfalarda request yok;
   - canonical tek ve sabit olmalı;
   - `Host` header'ı manipüle edilebilir;
   - CDN ve mail domainleri site domaininden bağımsız altyapı parçaları.
5. **Ek önemli bulgular (domain ile ilişkili):**
   - `vercel.json` cron'ları Coolify'da **çalışmaz**. Coolify'da ayrı zamanlanmış görev tanımlanmadıysa kur yenileme, iCal senkronu ve log temizliği hiç tetiklenmiyor olabilir.
   - Public `/liste/[token]` sayfasının altında sabit **"Maki Dijital — …"** metni görünüyor.
   - Mail gönderici adının ve adresinin fallback'leri `Maki Dijital` ve `no-reply@example.com`.
   - Admin iCal export linki (`/api/ical/villa/…`) build'de var olmayan bir route'u gösteriyor.

---

## 1. Bulunan tüm domainler ve markalar

| Domain / marka | Nerede | Tür |
|---|---|---|
| `cdn.villayagel.com`, `assets.villayagel.com` | `next.config.ts` fallback; yorumlar | Eski CDN |
| `rezervasyon@villayagel.com` | 3 mail route'u (fallback); 1 yorum | Eski mail adresi |
| `villayagel.com` | Migration 055 yorumu (cron curl örneği) | Eski site |
| `VillayaGel` / `VillaYaGel` | `FooterWrapper` fallback, `not-found` yorumu, 8 test dosyası | Eski marka |
| `cdn.yazvillam.com`, `assets.yazvillam.com` | **Yalnız device'taki `.env.local`** (yerel geliştirme) | Başka bir marka/domain CDN'i |
| `YazVillam`, `__yazVillamPgPool` | `PageHero` yorumu, `lib/db/pg.client.ts` global değişken adı | Eski marka (iç tanımlayıcı) |
| `tatilinyeri-villa-images`, `tatilinyeri-site-assets` | `lib/storage/storage.constants.ts` | **Güncel R2 bucket adları** |
| `@tatilinyeri` sosyal hesapları | `contact-locale-routes` testi | Test verisi |
| `Maki Dijital`, `makidijital.com` | Admin login/sidebar, footer ajans kredisi, mail brand fallback'i, `sharedList.footerNote` (TR/EN/DE) | Ajans markası |
| `no-reply@example.com` | `app/lib/mail/client.ts:87` | Mail "from" fallback'i |
| `github.com/villa-kiralama` | `app/api/geocode/route.ts:41` (Nominatim User-Agent) | Placeholder kimlik |
| `localhost:3000` | `.env.example`, `.env.local` (`NEXT_PUBLIC_SITE_URL`) | Yerel geliştirme |
| Vercel kalıntıları | `vercel.json` (cron), `NEXT_PUBLIC_VERCEL_URL` fallback'leri (5 dosya), yorumlar | Önceki hosting |
| Üçüncü taraflar | `www.google.com/maps`, `youtube-nocookie`, `i.ytimg.com`, `googletagmanager`, `wa.me`, sosyal ağlar, `unpkg`, OSM, `nominatim`, `tcmb.gov.tr`, `api.resend.com`, `*.supabase.co` (legacy görsel) | Domain değişikliğinden etkilenmez |

`tatilinyeri.com` kodda **hiç** geçmiyor. Bu doğru: site domaini tamamen env'den geliyor.

---

## 2. `villayagel.com` kullanımları: dosya, satır, etki ve sınıf

| # | Dosya:satır | Kullanım | Çalışma zamanı etkisi | Sınıf |
|---|---|---|---|---|
| 1 | `next.config.ts:21` | `hostFromBase(NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES, "cdn.villayagel.com")` | Env **build sırasında** tanımlıysa kullanılmıyor. Tanımsızsa `next/image` izin listesine eski CDN giriyor. Değer build'de `images-manifest.json`'a yazılıyor (doğrulandı) | **B + G** (+E) |
| 2 | `next.config.ts:25` | Aynısı, `assets.villayagel.com` | Aynı | **B + G** (+E) |
| 3 | `app/api/mail/reservation-request/route.ts:214` | `MAIL_ADMIN_NOTIFY_TO \|\| "rezervasyon@villayagel.com"` | **Env tanımsız veya boşsa her rezervasyon talebinin admin kopyası (müşteri adı, e-postası, tarihler) bu adrese gönderiliyor.** Env **runtime'da** okunuyor (server-only). Boş değerle kapatılamıyor | **A** (env yoksa) / **B** (env varsa). F değil |
| 4 | `app/api/mail/reservation-approved/route.ts:212` | Aynı desen, onay kopyası | Aynı | **A / B** |
| 5 | `app/api/mail/payment-confirmed/route.ts:221` | Aynı desen, ödeme kopyası | Aynı | **A / B** |
| 6 | `app/api/mail/reservation-request/route.ts:211` | Yorum: "(default …); boşsa atlanır" | Yok. Yorum ayrıca **yanlış**: boş env fallback'e düşüyor | **D** |
| 7 | `lib/storage/cdn.config.ts:9`, `:10`, `:48`, `:64` | Yorum ve örnek URL | Yok. Asıl kod yalnız env okuyor ve fallback'i yok | **D** (+E) |
| 8 | `lib/villa-image.helpers.ts:324` | Yorum | Yok | **D** |
| 9 | `db/migrations/055_fix_short_gaps_refresh_truncate.sql:125` | Yorumdaki `curl https://villayagel.com/api/cron/...` | Yok (SQL yorumu). Eski domaine cron çağrısı örneği | **D + E** |
| 10 | `app/components/layout/FooterWrapper.tsx:181` | `settings.site_name \|\| "VillayaGel"` | Yalnız DB'de `site_name` boşsa footer ve copyright'ta eski marka görünür | **B + E** |
| 11 | `app/not-found.tsx:28` | Yorum başlığı | Yok | **D + E** |
| 12 | 8 test dosyası (`settings-translation-fallback`, `footer-locale`, `settings-public-payload`, `layout-wrappers-cache-usage`, `villa-type-name-locale`, `sec05-jsonld-escape` …) | Test verisi olarak marka adı | Yok | **C** |
| 13 | `tests/unit/sec05-csp-report-only.test.ts:44` | Negatif kontrol (`villayagel` policy'de olmamalı) | Yok. Korunmalı | **C** |
| 14 | `Claude outputs/*.md` | Önceki raporlar | Yok | **D** |

**F (dinamikleştirilebilir) olarak işaretlenen `villayagel` kullanımı yok.** Hepsi ya silinmeli, ya env/DB ayarına bağlanmalı, ya da olduğu gibi kalmalı. Hiçbiri "mevcut domain"den otomatik türetilmemeli.

---

## 3. Production'da gerçekten etkili olabilenler

Değerleri Coolify'da doğrulamanız gerekiyor. Ben erişmedim.

| Konu | Koşul | Etki |
|---|---|---|
| Admin bildirim mailleri → `rezervasyon@villayagel.com` | `MAIL_ADMIN_NOTIFY_TO` Coolify **runtime** env'inde yoksa | Kişisel veri içeren mailler eski domain kutusuna gidiyor. Domain artık size ait değilse veri sızıntısı. `mail_logs.recipient` ile doğrulanabilir (Ek A, SQL 1) |
| Canonical / `og:url` → `http://localhost:3000` | `NEXT_PUBLIC_SITE_URL` **build** anında yoksa | SEO: yanlış canonical, sosyal önizleme URL'leri bozuk |
| `robots.txt` sitemap satırı yok | Aynı koşul. `robots.txt` tamamen static (○, revalidate yok), bir sonraki build'e kadar donmuş | Arama motoru sitemap'i bulamaz |
| Sitemap URL'leri relative | Aynı koşul (sitemap ISR 1 saat; runtime env varsa 1 saat sonra düzelir) | Geçersiz sitemap |
| JSON-LD URL'leri relative | Aynı koşul | Structured data eksik |
| Rezervasyon paylaşım linki relative | `NEXT_PUBLIC_SITE_URL` yoksa | Admin'e dönen link `/rezervasyon-kontrol?token=…` olur (admin UI bunu tam URL gibi kopyalıyorsa kırık link) |
| CDN görselleri kırık | `NEXT_PUBLIC_CDN_BASE_*` build'de yoksa | `resolveCdnPublicUrl` null döner ve görseller render olmaz; `remotePatterns` eski CDN'e düşer |
| DB'deki tam URL'li eski CDN görselleri | DB'de `https://cdn.villayagel.com/...` veya `cdn.yazvillam.com/...` gibi tam URL'ler varsa ve env farklı bir CDN'i gösteriyorsa | `next/image` host'u reddeder (400 / kırık görsel); `<img>` eski CDN'den çekmeye çalışır; silme yolu (`bucketFromCdnHost`) bucket'ı bulamaz. Ek A, SQL 2 ile doğrulanabilir |
| `/liste/[token]` alt metni "Maki Dijital — …" | Her zaman | Public sayfada ajans adı markaymış gibi görünüyor (`lib/i18n/dictionaries/tr.ts:421`, `en.ts:407`, `de.ts:408`) |
| Mail gönderici adı "Maki Dijital", adres `no-reply@example.com` | `RESEND_FROM*` env **ve** DB `mail_from*` boşsa | Müşteri maillerinde yanlış gönderici; `example.com`'dan gönderim Resend'de reddedilir |
| `vercel.json` cron'ları | Coolify'da karşılığı yoksa | `/api/cron/*` işleri (iCal senkronu, kur, log temizliği) **çalışmıyor** olabilir |

---

## 4. Yalnız fallback olanlar

Env veya DB ayarı tanımlıysa kullanılmıyorlar:

- `next.config.ts:21`, `:25` (CDN host fallback'i).
- `MAIL_ADMIN_NOTIFY_TO` fallback'i (3 route).
- `FooterWrapper` → `"VillayaGel"` (`settings.site_name` boşsa).
- `app/lib/mail/client.ts:87` → `no-reply@example.com`; `:96` → `"Maki Dijital"`. Ayrıca 8 mail route'u, 9 şablon ve voucher'da `cfg.fromName || "Maki Dijital"`.
- `NEXT_PUBLIC_VERCEL_URL` fallback'leri (5 dosya):
  - `lib/seo.ts:27`
  - `app/components/seo/StructuredData.tsx:24`
  - `app/robots.ts:88`
  - `app/sitemap.ts:77`
  - `KiralikVillalarPageBody.tsx:130`, `kiralik-villalar-metadata.ts:64`

  Coolify'da bu değişken yok, dolayısıyla etkisi yok.

## 5. Artık gereksiz olanlar

| Öğe | Neden gereksiz | Not |
|---|---|---|
| `NEXT_PUBLIC_VERCEL_URL` fallback'leri | Vercel'de değiliz; Coolify bu değişkeni tanımlamaz | Kaldırılabilir. Env tanımsızken davranış aynı kalır |
| `vercel.json` | Coolify okumaz | Cron'lar Coolify "Scheduled Tasks" ile tanımlanmalı. Dosya belge olarak kalabilir ama yanıltıcı |
| `cdn.villayagel.com` / `assets.villayagel.com` fallback'i | Production env tanımlıysa hiç kullanılmıyor; tanımsızsa yanlış CDN'e izin veriyor | Kaldırılmalı. Önce "env yoksa ne olsun?" kararı gerekiyor (§10) |
| `rezervasyon@villayagel.com` fallback'i | Eski domain; env ile kapatılamıyor | Önce iş kararı gerekiyor (§9) |
| `VillayaGel` footer fallback'i | Marka artık farklı; DB `site_name` dolu olmalı | Nötr bir fallback (boş ya da `Villa Kiralama`) ya da mevcut DB değeri |
| Yorumlardaki eski domainler | Yanıltıcı | Kozmetik |
| `__yazVillamPgPool` | İç tanımlayıcı, kullanıcıya görünmez | **Dokunmaya değmez.** Yeniden adlandırma dev hot-reload'da pool sızıntısı gibi riskler taşır, kazanç yok |

---

## 6. Coolify + tatilinyeri.com için doğru domain mimarisi

```
                ┌──────────────── BUILD ANINDA (Coolify "Build Variable") ────────────────┐
                │ NEXT_PUBLIC_SITE_URL=https://tatilinyeri.com   → canonical/og/sitemap/     │
                │                                                 robots/JSON-LD/paylaşım    │
                │ NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES=https://<gerçek villa CDN host'u>        │
                │ NEXT_PUBLIC_CDN_BASE_SITE_ASSETS=https://<gerçek asset CDN host'u>         │
                │   → görsel URL'leri, next/image remotePatterns, CSP img-src (manifest'e    │
                │     yazılır)                                                                │
                └─────────────────────────────────────────────────────────────────────────────┘
                ┌──────────────── RUNTIME (Coolify env, server-only) ─────────────────────────┐
                │ MAIL_ADMIN_NOTIFY_TO, RESEND_API_KEY, RESEND_FROM, RESEND_FROM_NAME          │
                │ S3_ENDPOINT/S3_*, DATABASE_URL, AUTH_*, CRON_SECRET …                        │
                │ (NEXT_PUBLIC_* değerleri de burada aynı olmalı; ISR yeniden üretimi ve        │
                │  build'de tanımsız kalan server referansları runtime değerini okur)           │
                └─────────────────────────────────────────────────────────────────────────────┘
   Tarayıcı ──HTTPS──► Traefik (Coolify) ──HTTP──► next start (container)
                        Host: tatilinyeri.com (korunur), X-Forwarded-Host/Proto/For eklenir
```

**İlkeler:**

1. **Tek canonical domain env'den gelir** (`NEXT_PUBLIC_SITE_URL`). Kod hiçbir domain içermez.
2. **`www` ↔ apex tek yöne yönlendirilmeli** ve bu yönlendirme proxy'de yapılmalı (Coolify'daki www/non-www redirect ayarı). Uygulamada redirect kuralı yok; eklemeye de gerek yok.
3. **CDN ve mail kendi env/DB ayarlarında kalır.** Site domaininden türetilmez (§9).
4. **Runtime host** yalnız doğrudan kullanıcının tarayıcısında (`window.location.origin`) veya allowlist'le doğrulanarak kullanılır (§8).

**Build-time ve runtime farkı** (bu projede doğrulandı):

| | Build'de tanımlı | Build'de tanımsız, runtime'da tanımlı |
|---|---|---|
| Client bundle'daki `process.env.NEXT_PUBLIC_*` | Değer **gömülür** (build çıktısında görüldü: CDN host'u 132 server + 3 client dosyasında sabit) | `undefined` (tarayıcıda env yok) |
| Server kodu (Turbopack) | Değer **gömülür**, runtime env yok sayılır | Referans korunur ve **runtime'da okunur** (build çıktısında `process.env.NEXT_PUBLIC_SITE_URL` referansı duruyor) |
| Static/ISR sayfa HTML'i | Build anındaki değerle üretilir | **Build anında yanlış** (localhost/relative) üretilir; yalnız ISR yeniden üretiminde (ana sayfa 10 dk, diğerleri 1 saat) düzelir. **`robots.txt` hiç düzelmez** (static) |
| `next.config.ts` `headers()` / `images` | `routes-manifest.json` / `images-manifest.json`'a yazılır (doğrulandı) | Aynı; build anındaki değer kullanılır |

Sonuç: **`NEXT_PUBLIC_SITE_URL` ve `NEXT_PUBLIC_CDN_BASE_*` Coolify'da hem build hem runtime değişkeni olmalı.** Değer değişince yeniden build gerekir.

---

## 7. Static/ISR nedeniyle env kullanılması gereken yerler

Build route tablosundan (○ = static/ISR):

| Çıktı | Render | Domain kaynağı | Runtime host mümkün mü? |
|---|---|---|---|
| `/robots.txt` | ○ **tamamen static** | `NEXT_PUBLIC_SITE_URL` (`app/robots.ts:87`) | **Hayır** |
| `/sitemap.xml` | ○ ISR 1 saat | `app/sitemap.ts:76` | **Hayır** |
| `/`, `/tr`, `/en`, `/de` | ○ ISR 10 dk / 1 saat | `metadataBase` (`lib/seo.ts:38`), JSON-LD (`StructuredData.tsx:22`) | **Hayır.** `headers()` ISR'ı bozar |
| `/blog`, `/iletisim`, `/teklif-al`, `/favoriler`, `/rezervasyon/basarili` (+ EN/DE) | ○ ISR 1 saat | `metadataBase`, JSON-LD | **Hayır** |
| `/_not-found` | ○ | `metadataBase` | **Hayır** |
| `next.config.ts`: `remotePatterns`, CSP header'ı | Build manifest | CDN env | **Hayır** (manifest) |
| Client bundle'daki CDN URL'leri (`cdn.config.ts`) | Build'de gömülü | CDN env | **Hayır** |

Dinamik sayfalar (villa detay, `/arama`, `/kiralik-villalar`, `/blog/[slug]`, `/p/[slug]`, `/v/[token]`) teknik olarak `headers()` okuyabilir. Ama **canonical tek ve sabit olmalı**; host'a göre değişen canonical, duplicate-domain SEO sorunu ve cache zehirlenmesi riski doğurur. Bu sayfalarda da env kullanılmalı.

---

## 8. Runtime hostname kullanılabilecek yerler

**Mevcut durum:** Hiçbir sunucu kodu `Host`, `X-Forwarded-Host` veya `X-Forwarded-Proto` okumuyor (`x-forwarded-for` yalnız IP loglamada). Middleware redirect'leri `req.nextUrl.clone()` ile relative çalışıyor. Admin cookie'leri `__Host-` önekli, yani **Domain'siz ve host'a kilitli**; domain bağımsız, değişiklik gerekmez.

**Zaten güvenli şekilde runtime origin kullanan yerler** (tarayıcı tarafı, `window.location.origin`):

- `app/(admin)/maki-admin/villas/VillaTemporaryUrlButton.tsx:112` → `/v/<token>` linki;
- `VillaZipShareButton.tsx:67` → zip paylaşım linki;
- `villa-listesi/_components/VillaListesiClient.tsx:485` → `/liste/<token>`;
- `villas/[id]/_components/IcalSyncCard.tsx:93` → iCal export (⚠ route build'de yok; ayrı bulgu).

Bunlar güvenli: değer, admin'in o an bulunduğu adres. Tek yan etkisi, admin paneli başka bir host'tan (örn. Coolify'ın `sslip.io` test domaini ya da `www`) açılırsa müşteriye o host'lu link gitmesi. İstenirse env'deki canonical origin'e çevrilebilir.

**Reverse proxy header'ları güvenli mi?**

- Next, Server Action CSRF kontrolünde `x-forwarded-host` ya da `host` değerini `Origin` ile karşılaştırıyor (Next dokümanı, `serverActions.md`). Server action'lar production'da çalıştığına göre Traefik public host'u doğru iletiyor. Bu doğrudan gözlem değil, **dolaylı bir çıkarım**.
- **Ama bu değerlere mutlak güvenilemez:**
  - Container portu Coolify'da dışa açıksa (port mapping) ya da Traefik'te wildcard/default bir router varsa, istemci istediği `Host` / `X-Forwarded-Host` değerini gönderebilir.
  - Bu değer e-posta linklerinde, paylaşım URL'lerinde ya da cache'lenen içerikte kullanılırsa **Host header poisoning** oluşur (phishing linki, cache zehirleme).
- **Kural:** Runtime host yalnızca **env'deki allowlist ile doğrulanarak** kullanılabilir (örn. `ALLOWED_PUBLIC_HOSTS=tatilinyeri.com,www.tatilinyeri.com`). Doğrulanamazsa env'deki canonical'a düşülür.
- Uygun adaylar:
  - (a) `GET /api/admin/reservations/[id]/share-link` yanıtı: dinamik ve yalnız yetkili admin'e dönüyor. Yine de env yeterli; runtime host'un burada bir kazancı yok.
  - (b) E-posta içindeki linkler: **HAYIR**, her zaman env.
  - (c) Static/ISR çıktılar: **HAYIR.**

Sonuç: Runtime host'u yeni yerlere taşımanın **somut bir kazancı yok.** Tek doğru domain kaynağı env olarak kalmalı.

---

## 9. CDN ve mail domainleri neden ayrı değerlendirilmeli

**CDN:**

- CDN host'ları, R2 bucket'larına bağlı ayrı custom domain'ler (`tatilinyeri-villa-images` → `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`). DNS ve TLS kayıtları Cloudflare'da yaşıyor. `cdn.${siteHost}` diye türetmek, o DNS kaydının var olduğunu varsaymak demek.
- Yerel `.env.local` değeri `cdn.yazvillam.com`. Yani CDN, site domaininden **farklı bir marka domaininde** olabilir. Production değeri bilinmiyor.
- DB'de tam URL olarak saklanmış eski CDN host'ları olabilir (`resolveAssetUrl` bunları olduğu gibi geçiriyor). Bu satırlar env'i değiştirmekle düzelmez; veri temizliği gerekir.
- `remotePatterns`, CSP `img-src` ve client bundle'daki CDN değerleri build'de donuyor.
- **Karar: CDN açık env olarak kalmalı. Site domainiyle asla değiştirilmemeli.**

**Mail:**

- Gönderici adresi (`RESEND_FROM` veya DB `mail_from`) Resend'de **doğrulanmış (SPF/DKIM) bir domain** olmak zorunda. Site domaininden türetilen bir adres doğrulanmamışsa gönderim reddedilir.
- Admin bildirim alıcısı (`MAIL_ADMIN_NOTIFY_TO`) bir **posta kutusu**. Hangi adresin kullanılacağı iş kararı; mevcut domain bundan bağımsız.
- `rezervasyon@villayagel.com` hâlâ işletmenin aktif kutusu olabilir. Hangi adrese gittiğini `mail_logs` ile doğrulamadan fallback'i **değiştirmek bildirimleri kesebilir**.
- **Karar: Mail adresleri env ve DB ayarlarında kalmalı. Otomatik türetme yok.**

---

## 10. Dinamikleştirme için önerilen güvenli plan

"Dinamikleştirme" burada host'tan türetmek değil; **gömülü domainleri env/ayar tek kaynağına bağlamak** anlamında.

**Faz 0 — Doğrulama (sizde; kod yok):**

1. Coolify env ekranında şunların **hem Build hem Runtime** olarak tanımlı olduğunu kontrol edin: `NEXT_PUBLIC_SITE_URL=https://tatilinyeri.com`, `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS`.
2. Runtime env'de şunları kontrol edin: `MAIL_ADMIN_NOTIFY_TO`, `RESEND_FROM`, `RESEND_FROM_NAME`.
3. Tarayıcıda `view-source:https://tatilinyeri.com/`: `<link rel="canonical">` ve `og:url` `https://tatilinyeri.com` ile mi başlıyor? `/robots.txt` içinde `Sitemap: https://tatilinyeri.com/sitemap.xml` var mı? `/sitemap.xml` URL'leri mutlak mı?
4. Ek A'daki salt okunur SQL'leri çalıştırın: admin maillerinin gittiği domainler ve DB'deki görsel host'ları.
5. Coolify Scheduled Tasks'ta `/api/cron/*` işleri tanımlı mı?

**Faz 1 — Düşük riskli temizlik (Faz 0 sonucuna göre):**

- `NEXT_PUBLIC_VERCEL_URL` fallback'lerini kaldırmak. Coolify'da tanımsız olduğu için davranış aynı kalır.
- Site URL okumasını `lib/seo.ts` içinde tek helper'a toplamak (6 kopya var).
- `.env.example`'a eksik değişkenleri eklemek: `NEXT_PUBLIC_CDN_BASE_*`, `MAIL_ADMIN_NOTIFY_TO`, `S3_*`.
- Build sırasında `NEXT_PUBLIC_SITE_URL` production'da tanımsızsa **uyarı** vermek. Build'i fail etmek yerel build'leri kırabilir; bu ayrı bir karar.

**Faz 2 — Fallback kararları (onayla):**

- CDN: `next.config.ts` fallback'ini kaldırmak. Env yoksa CDN izin listesi boş kalır (CSP ile aynı davranış). Önkoşul: Faz 0-1 ve Faz 0-4.
- Admin mail: `MAIL_ADMIN_NOTIFY_TO` tanımsız veya boşsa **gönderimi atlamak** (yorumdaki niyet bu) ya da DB'deki `settings.email`'i kullanmak. Önkoşul: `mail_logs` sonucu ve alıcı adresi için iş kararı.
- Marka fallback'leri: `"VillayaGel"` → nötr değer. `sharedList.footerNote` → `site_name` ile parametrik ya da nötr metin. Mail `"Maki Dijital"` / `example.com` fallback'leri → `site_name` / DB `mail_from`.

**Faz 3 — Opsiyonel:**

- Admin link üreticilerinde `window.location.origin` yerine canonical origin (env).
- Geocode User-Agent'ına gerçek site URL'i ve iletişim bilgisi (env).
- DB'deki eski CDN tam URL'lerini relative path'e normalize etmek (migration; ayrı iş).
- iCal export route'unun eksikliği (ayrı bulgu).

---

## 11. Dosya bazlı değişiklik planı (uygulanmadı)

| Dosya | Değişiklik | Faz |
|---|---|---|
| `lib/seo.ts` | `SITE_URL` fallback'inden `NEXT_PUBLIC_VERCEL_URL` kaldırılır; `getSiteUrl()` tek kaynak olur | 1 |
| `app/components/seo/StructuredData.tsx:22-26` | Yerel `SITE_URL` yerine `lib/seo` kullanılır | 1 |
| `app/robots.ts:86-90`, `app/sitemap.ts:75-79` | Aynı | 1 |
| `app/components/search/KiralikVillalarPageBody.tsx:128-132`, `kiralik-villalar-metadata.ts:62-66` | Aynı | 1 |
| `lib/reservation-share.helper.ts:50` | Aynı (zaten yalnız `SITE_URL` kullanıyor) | 1 |
| `.env.example` | Eksik değişkenler ve açıklamalar | 1 |
| `next.config.ts:19-26` | `villayagel` fallback'i kaldırılır; env yoksa CDN izin listesi boş kalır | 2 |
| `app/api/mail/{reservation-request,reservation-approved,payment-confirmed}/route.ts` | Fallback kaldırılır; boşsa atlanır ya da `settings.email` kullanılır (karar gerekli). Hatalı yorum düzeltilir | 2 |
| `app/components/layout/FooterWrapper.tsx:181` | `"VillayaGel"` → nötr fallback | 2 |
| `lib/i18n/dictionaries/{tr,en,de}.ts` `sharedList.footerNote` | "Maki Dijital" kaldırılır ya da `site_name` ile parametrik yapılır | 2 |
| `app/lib/mail/client.ts:87,96` ve şablonlardaki `"Maki Dijital"` fallback'leri | `site_name` / nötr değer | 2 |
| `lib/storage/cdn.config.ts`, `lib/villa-image.helpers.ts`, `app/not-found.tsx`, `PageHero.tsx`, migration 055 yorumları | Yorum temizliği (migration dosyasına dokunulmaması önerilir; uygulanmış migration) | 2 (kozmetik) |
| `vercel.json` | Coolify Scheduled Tasks kurulduktan sonra kaldırılır ya da "Coolify'da kullanılmaz" notu eklenir | 1 |
| `app/api/geocode/route.ts:41` | User-Agent'a env'deki site URL'i | 3 |
| Admin link üreticileri (4 dosya) | Opsiyonel: canonical origin | 3 |
| `lib/db/pg.client.ts` (`__yazVillamPgPool`) | **Dokunulmamalı** | — |
| `lib/storage/storage.constants.ts` (bucket adları) | **Dokunulmamalı** (gerçek R2 bucket'ları) | — |
| Testler (C) | Marka test verisi olduğu gibi kalabilir. Metin değişirse ilgili test güncellenir | 2 |

---

## 12. Değişikliklerin olası regresyon riskleri

| Değişiklik | Risk | Önlem |
|---|---|---|
| `VERCEL_URL` fallback'ini kaldırmak | Çok düşük (Coolify'da tanımsız) | Build sonrası canonical ve sitemap karşılaştırması |
| Site URL'i tek helper'a toplamak | Düşük. Trailing slash ve şema normalizasyonu farkı (`siteMetadataBase` `https://` ekliyor, `SITE_URL` eklemiyor) | Birim test: aynı girdilerde çıktılar birebir aynı olmalı |
| CDN fallback'ini kaldırmak | **Orta.** Env build'de yoksa bugün eski CDN'e izin veriliyor; kaldırılınca bu görseller 400 döner | Önce Faz 0-1 ve Faz 0-4 (DB host sayımı) |
| Admin mail fallback'ini değiştirmek | **Yüksek (iş etkisi).** Env tanımsızsa bildirimler bugün villayagel'e gidiyor; değişiklik bildirimleri kesebilir ya da başka kutuya yönlendirebilir | Önce `mail_logs` sorgusu ve açık iş kararı |
| Marka fallback ve metinleri | Düşük. Görünen metin değişir; 8 test dosyası güncellenmeli | Snapshot/metin testleri |
| Mail "from" fallback'i | Düşük–orta. Env ve DB boşsa bugün de gönderim başarısız; değişiklik yalnız fallback'i etkiler | Resend doğrulanmış domain kontrolü |
| Runtime host kullanımı (önerilmiyor) | **Yüksek.** ISR bozulur, cache ve Host header zehirlenmesi | Uygulanmamalı. Gerekirse allowlist'le ve yalnız dinamik yanıtlarda |
| `vercel.json` kaldırmak | Coolify'da etkisi yok. Vercel'e dönülürse cron'lar kaybolur | Coolify Scheduled Tasks'ı önce kurmak |

---

## Ek A: Doğrulama için salt okunur SQL (ham kişisel veri göstermez)

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 1) Admin bildirim kopyaları hangi domaine gidiyor? (yalnız domain + sayı)
SELECT mail_type,
       lower(split_part(recipient, '@', 2)) AS recipient_domain,
       count(*) AS n, max(created_at) AS last_sent
FROM public.mail_logs
WHERE mail_type LIKE '%\_admin' ESCAPE '\'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 2) DB'deki tam URL'li görsellerin host dağılımı (relative path'ler 'relative' sayılır)
WITH u AS (
  SELECT 'villa_images.image_url' AS col, image_url AS v FROM public.villa_images
  UNION ALL SELECT 'settings.site_logo', site_logo FROM public.settings
  UNION ALL SELECT 'settings.favicon_url', favicon_url FROM public.settings
  UNION ALL SELECT 'settings.default_og_image', default_og_image FROM public.settings
  UNION ALL SELECT 'pages.cover_image', cover_image FROM public.pages
)
SELECT col,
       COALESCE(substring(v FROM '^https?://([^/]+)'), CASE WHEN v IS NULL OR v = '' THEN 'empty' ELSE 'relative' END) AS host,
       count(*) AS n
FROM u GROUP BY 1, 2 ORDER BY 1, 3 DESC;

ROLLBACK;
```

Kolon adları kodla doğrulandı: `mail_logs.recipient`, `mail_type` ve `created_at` (`app/services/mail-log.service.ts`); `villa_images.image_url`; `settings.*`; `pages.cover_image`. Blog kapakları, villa tipleri ve lokasyonlardaki `cover_image` kolonları aynı desenle eklenebilir.

## Ek B: Yöntem ve kanıtlar

- Tarama `node_modules`, `.next`, `.git` ve `Claude outputs` hariç yapıldı; device (kaynak) ve cloud (build) kopyaları aynı içerikte.
- Build-time gömme davranışı yerel build çıktısında doğrulandı:
  - `.next/routes-manifest.json` CSP header'ını, `.next/images-manifest.json` CDN host'larını içeriyor;
  - build'de tanımlı CDN env'i server ve client chunk'larına gömülmüş;
  - build'de tanımsız `NEXT_PUBLIC_SITE_URL` server chunk'larında `process.env` referansı olarak kalmış.
- `metadataBase` yoksa `http://localhost:${PORT||3000}` kullanıldığı Next kaynak kodunda görüldü: `node_modules/next/dist/lib/metadata/resolvers/resolve-url.js` → `createLocalMetadataBase`.
- `NEXT_PUBLIC_` değişkenlerinin build'de gömülmesi: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.
- Proxy host kontrolü: `.../next-config-js/serverActions.md` (`x-forwarded-host` / `host`).
- Coolify panel ayarları (Build Variable, Scheduled Tasks, redirect) genel platform bilgisine dayanıyor. Bu oturumda Coolify'a erişilmedi; panelden doğrulanmalı.
