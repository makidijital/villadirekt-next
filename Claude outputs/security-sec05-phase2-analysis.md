# SEC-05 Phase 2: `custom_head_scripts` / `analytics_script` ve CSP analizi (salt okuma)

**Tarih:** 2026-09-24
**Kapsam:** Salt okuma analizi. Kod, DB, R2, .env, migration veya config değişikliği yapılmadı. Commit, push ve deploy da yapılmadı.
**Durum:** Kod tabanı ve yerel fixture/runtime analizi tamamlandı. Production verisi bu oturumdan okunamadı (aşağıda açıklanıyor). Production için salt okunur sınıflandırma sorgusu hazır.
**Device HEAD:** `6efc1cd fix(security): enforce admin API permissions`
**Phase 1 (GTM + map_embed):** Olduğu gibi duruyor, commit edilmemiş ve dokunulmadı. Hash kanıtı §12'de.

---

## 0. Yönetici özeti

1. **Production'da ne bulundu? Production'a erişilemedi.** `.env.local` içindeki `DATABASE_URL` host'u bu oturumun iki ortamında da çözülemedi (`socket.gaierror`). Bu yüzden production değerleri hakkında **hiçbir tahmin yapmıyorum**. Production verisi için §3'teki salt okunur SQL'i hazırladım. SQL:
   - ham değer yazdırmaz; yalnız sayı, uzunluk, md5 öneki, domain ve boolean parmak izi döndürür;
   - fixture üzerinde test edildi.

   SEC-03 Phase 0'da olduğu gibi SSH üzerinden çalıştırıp çıktısını bana getirirsen, 10 sorunun "production'a bağlı" kısımlarını kesinleştiririm.
2. **İki alan da ham HTML/JS olarak root layout'ta render ediliyor.** Bunun anlamı:
   - Her HTML rotasında çalışıyorlar: public sayfalar, `/v/[token]`, 404 ve **tüm admin panel sayfaları, `/maki-admin/login` dahil**. Bu runtime'da doğrulandı.
   - İçlerine yazılan her script admin origin'inde, oturumu açık admin'in yetkisiyle çalışır.
3. **Doluysa bu alanlar bugün de işlevsel sorun üretiyor** (runtime'da kanıtlandı, §5):
   - Her sayfada **React hydration hatası #418** oluşuyor, React kökü istemcide yeniden çiziyor.
   - Ham `<img>` beacon'ları **iki kez** ateşleniyor.
   - `<meta>` etiketleri HTML parser'a göre `<head>` değil, `<body>` içine düşüyor.
   - 404 sayfalarında scriptler hiç çalışmıyor.
4. **Yapılandırılmış alanların çoğu zaten var:**
   - `gtm_container_id` (Phase 1'de doğrulanıyor);
   - `google_site_verification`, `yandex_verification`, `bing_verification` (`/seo` sayfası → `generateMetadata`, doğru biçimde `<head>` içinde).

   Eksik olanlar: GA4 Measurement ID, Meta Pixel ID, Hotjar/Clarity ID. **Bunların hepsi GTM üzerinden yüklenebilir.**
5. **Önerilen yol, sırasıyla:**
   1. Production sınıflandırması (§3 SQL).
   2. Legacy alanları **yalnız public layout'lara** taşıyarak admin panelinden çıkarmak. Bu migration'sız, küçük ve geri alınabilir bir değişiklik.
   3. Takip araçlarını **GTM konteynerine konsolide etmek**. Bu kod değil, GTM arayüzü işi.
   4. Legacy alanları admin'de salt okunur yapıp render'ı kaldırmak.
   5. CSP'yi **Report-Only** başlatmak.

   Yeni kolon (migration) **ancak** GTM konsolidasyonu kabul edilmezse gerekir.
6. **Otomatik DB dönüşümü önermiyorum.** `settings` tek satır. Birkaç ID'nin elle girilmesi, serbest metinden otomatik ayrıştırmadan hem daha güvenli hem daha ucuz.
7. **CSP:** Report-Only **uygulanabilir** ve ISR/static'i bozmaz. Ancak:
   - Nonce tabanlı enforce **tüm sayfaları dinamik yapar** (Next dokümanı). Bu yüzden public tarafta önerilmez.
   - Public tarafta gerçekçi hedef `script-src 'self' 'unsafe-inline' <allowlist>` ve `style-src 'self' 'unsafe-inline'`.
   - Admin rotaları zaten tamamen dinamik; orada nonce tabanlı **sıkı** CSP mümkün.
   - İki alan çözülmeden enforce **yapılmamalı**.

---

## 1. Yöntem ve kısıtlar

| Adım | Ne yapıldı | Yazma? |
|---|---|---|
| Device git durumu | `git log -1`, `git status --porcelain`, md5 | Hayır |
| Production DB erişimi | Yalnız TCP/DNS denemesi. Secret yazdırılmadı, host sınıfı "remote" | Hayır (bağlanılamadı) |
| Kod analizi | Tüm okuma/yazma/render yolları (§2) | Hayır |
| Yerel baseline | `kv_sec03` fixture, 2 build (`p2base`, `p2probe`), Playwright ağ ve DOM yakalama, 14 sayfa + SPA navigasyonu | Yalnız **yerel fixture** fonksiyonu geçici değiştirildi, sonra eski haline döndü (`GTM-TEST1234`, legacy alanlar yok) |
| Probe içeriği | Zararsız sentinel'ler: `window.__SEC05_*` sayaçları, yerel `127.0.0.1:8766` üzerinden 1×1 gif ve JS, `<meta name="sec05-probe-head">` | Yalnız yerel |
| SQL testi | Geçici `kv_p2test` DB'sinde sahte ID'lerle test edildi, sonra silindi | Yalnız yerel |

---

## 2. Kod tabanında kullanım envanteri

### 2.1 Okuma, yazma ve render yolları (toplam 8 kullanım noktası)

| # | Yer | Tür | Not |
|---|---|---|---|
| 1 | `app/layout.tsx`: `<head>` içinde `<div dangerouslySetInnerHTML={customHead}>` | **Render (sink)** | Root layout, **tüm** rotalar |
| 2 | `app/layout.tsx`: `<body>` başında `<div dangerouslySetInnerHTML={analyticsScript}>` | **Render (sink)** | Root layout, **tüm** rotalar |
| 3 | `app/(admin)/maki-admin/settings/gelismis/page.tsx` | Admin UI (yazma) | İki textarea; açıklamada "Raw inject — XSS riski" yazıyor |
| 4 | `PUT /api/admin/settings` | Yazma API'si | SEC-03: `settings` izni gerekiyor. **Kolon whitelist'i yok**: body'deki her anahtar yazılır |
| 5 | `get_public_settings` RPC (migration 071/081) | Public okuma | İki alan da RPC'nin kolon listesinde, yani anon'a açık |
| 6 | `getPublicSettingsAction` (server action) | İstemciye taşıma | `TopBar` ve `useBookingEngine` tüm settings nesnesini alıyor. Değerler zaten sayfada render edildiği için ek sızıntı değil |
| 7 | `GET /api/admin/settings` | Admin okuma | SEC-04 kapsamı |
| 8 | `settings.types.ts:129-131` + `settings-translations-schema.test.ts` | Tip / test | Alanlar çeviri tablosunda **yok** (test bunu yasaklıyor) |

### 2.2 Zaten var olan yapılandırılmış alanlar

| Alan | Admin UI | Render | Durum |
|---|---|---|---|
| `gtm_container_id` | `/settings/gelismis` | `next/script#gtm-init` (afterInteractive), `normalizeGtmId` | ✅ Phase 1 |
| `google_site_verification` | `/settings/seo` | `generateMetadata` → `metadata.verification.google` | ✅ `<head>` içinde doğru yerde (runtime'da doğrulandı) |
| `yandex_verification` | `/settings/seo` | `metadata.verification.yandex` | ✅ |
| `bing_verification` | `/settings/seo` | `metadata.verification.other["msvalidate.01"]` | ✅ |
| GA4 / Meta Pixel / Hotjar / Clarity | — | — | ❌ Alan yok |

Ek gözlemler:

- Kodda hiçbir yerde `dataLayer.push`, `gtag(` veya `fbq(` çağrısı yok. Yani uygulama olay (event, conversion) göndermiyor. Tüm takip ya GTM tetikleyicilerinden ya da bu iki ham alandan geliyor olmalı.
- GTM `<noscript>` iframe fallback'i render edilmiyor.
- `CookieConsent` bileşeni yalnız bilgilendirme amaçlı. `localStorage` işaretliyor ama analytics yüklemesini **gate etmiyor**. Ham alanlar ve GTM, onaydan bağımsız yükleniyor. Bu hukuki değerlendirme değil; teknik gözlem.

### 2.3 Ham alanların çalıştığı sayfalar

Root layout tüm HTML çıktısını sardığı için alanlar şu rotaların hepsinde render ediliyor:

- **Static/ISR (○):** `/` (10 dk), `/blog`, `/iletisim`, `/teklif-al`, `/favoriler`, `/tr`, `/en/*` ve `/de/*` karşılıkları, `/rezervasyon/basarili`, `/_not-found`.
- **Dinamik (ƒ):** `/arama`, `/kiralik-villalar`, `/kiralik-villa/[slug]`, `/blog/[slug]`, `/p/[slug]`, `/v/[token]`, `/liste/[token]`, `/favoriler/paylas/[token]`, `/rezervasyon/[slug]`, `/rezervasyon-kontrol`, `/kisa-sureli-tarihler/...`.
- **Admin (ƒ, ~50 sayfa):** `/maki-admin/*`, **`/maki-admin/login` dahil**.

ISR sayfalarında değer prerender anında HTML'e gömülüyor. Değişiklik `revalidateTag("settings")` ile veya en geç 1 saat içinde yansıyor.

---

## 3. Production sınıflandırması

### 3.1 Durum

| Kontrol | Sonuç |
|---|---|
| `DATABASE_URL` host'u (device) | `remote`, **DNS çözülemedi (gaierror)** |
| Cloud ortamı | Önceki denemelerde de erişilemedi |
| Sonuç | **Production değerleri bilinmiyor. §6'daki cevaplar bu yüzden koşullu.** |

### 3.2 Salt okunur sınıflandırma sorgusu

Dosya: `Claude outputs/sec05-phase2-readonly.sql` (md5 `06e7fac2…`). Çalıştırma:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f sec05-phase2-readonly.sql
```

- `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout='15s'; … ROLLBACK;` Yazma yok.
- **Ham değer yazdırmaz.** Her alan için şunları döndürür:
  - `state` (NULL/EMPTY/FILLED), `len`, `md5_12`;
  - etiket sayıları: script (harici / inline), noscript, iframe, img, meta, link, style, diğer HTML, `on*=` handler, `javascript:`, eval benzeri;
  - **host listesi** (domain adı; secret değil);
  - vendor parmak izleri: GTM, gtag, GA4 / UA / Google Ads ID **sayısı** (değer değil), Meta Pixel ve pixel ID sayısı, Hotjar, Clarity, Yandex Metrica, TikTok, LinkedIn, chat widget'ları, WhatsApp, consent, font, doğrulama meta'ları;
  - **mükerrerlik testleri:** `gtm_same_as_field` (script içindeki GTM ID'si `gtm_container_id` ile aynı mı?) ve `gsv_same_as_field`;
  - **tanınmayan kalıntı:** script/noscript/style/meta/link blokları çıkarıldıktan sonra kalan uzunluk ve etiket adları, ayrıca inline script gövde uzunlukları.
- Fixture testinde sahte gtag + Pixel + GTM + Hotjar + doğrulama meta'sı ile tüm sayaçlar doğru çıktı. Tespit edilen bir PostgreSQL farkı düzeltildi: ARE'de kelime sınırı `\y` ile yazılır, `\b` backspace anlamına gelir; non-greedy davranışı da ilk niceleyiciye göre belirlenir.

### 3.3 Karar matrisi (production çıktısı gelince uygulanacak)

| Production çıktısı | Sınıf | Önerilen aksiyon | Otomatik mi? |
|---|---|---|---|
| Her iki alan `NULL/EMPTY` | Boş | Render'ı doğrudan kaldır. Özellik kaybı yok | Evet (kod) |
| Yalnız doğrulama meta'sı, `gsv_same_as_field=t` | Mükerrer doğrulama | Sil. Zaten `/seo` alanından `<head>`'e basılıyor | Evet |
| Doğrulama meta'sı, alan boş veya farklı token | Doğrulama | `/seo` alanına **elle** taşı. Diğer servisler (facebook-domain-verification, pinterest, ahrefs) → yeni alan ya da GTM dışı çözüm | Elle |
| `fp_gtm_loader` / `n_gtm_ids≥1`, `gtm_same_as_field=t` | **Mükerrer GTM** (şu an iki kez yükleniyor olabilir) | Script'i sil, alan yeterli | Evet |
| GTM ID alandakinden farklı | İkinci konteyner | Tek konteynere birleştir veya elle karar ver | Elle |
| `fp_gtag`, `n_ga4_ids=1`, kalıntı yok | GA4 | GTM içine GA4 tag'i (tercih edilen) veya `ga4_measurement_id` alanı. **GTM'de zaten GA4 varsa çift sayım var demektir; GTM arayüzünden kontrol edilmeli** | Elle |
| `fp_meta_pixel`, `n_pixel_ids=1` | Meta Pixel | GTM template'i veya `meta_pixel_id`. `fbq('track', …)` ile PageView dışı özel olaylar varsa **elle inceleme** | Elle |
| `fp_hotjar` / `fp_clarity` / `fp_yandex_metrica` | Oturum analitiği | GTM template'i veya ID alanı | Elle |
| `fp_fonts`, yalnız `<link>` | Font | Kaldır veya `next/font`'a taşı (zaten self-hosted fontlar var) | Elle |
| `fp_chat_widget` / `fp_whatsapp` | 3. taraf widget | **Elle inceleme.** Özellik kaybı riski yüksek | Elle |
| `leftover_tags>0`, `n_event_handler_attr>0`, `n_eval_like>0`, `fp_network_api`, `fp_storage_access`, tanınmayan host | **Keyfi HTML/JS** | **Elle inceleme zorunlu.** Otomatik dönüşüm yok | Hayır |

---

## 4. Yapı tipleri ve gereken alanlar

### 4.1 Sınıflandırma çerçevesi

Bu, kodda desteklenen ve kodda gözlenen türlere göre hazırlandı. Production sayıları §3 çıktısıyla doldurulacak.

| Tür | Bugün nereden | Yapılandırılmış karşılık | Durum |
|---|---|---|---|
| GTM | `gtm_container_id` (+ muhtemelen ham script) | `gtm_container_id` | ✅ Var |
| GA4 | Yalnız ham alan | GTM tag'i **veya** `ga4_measurement_id` (`^G-[A-Z0-9]{6,12}$`) | ❌ Alan yok |
| Meta Pixel | Yalnız ham alan | GTM template'i **veya** `meta_pixel_id` (`^[0-9]{10,20}$`) | ❌ Alan yok |
| Hotjar | Yalnız ham alan (admin açıklaması "hotjar" diye örnek veriyor) | GTM template'i **veya** `hotjar_site_id` (`^[0-9]{5,10}$`) | ❌ Alan yok |
| Google/Yandex/Bing doğrulaması | `/seo` alanları (ve belki ham meta) | Mevcut 3 alan | ✅ Var |
| Diğer doğrulama meta'ları | Yalnız ham alan | `metadata.other` ile render edilen isim/token whitelist'i | ❌ Gerekirse |
| Font `<link>` | Ham alan | `next/font` | ✅ Mekanizma var |
| Keyfi JS / HTML | Ham alan | **Karşılığı yok.** Ya kaldırılır ya da GTM Custom HTML'e taşınır (risk GTM hesabına geçer) | ⚠️ |

### 4.2 Minimum yapılandırılmış alan seti

- **Seçenek A: GTM konsolidasyonu.** Önerilen seçenek. **Yeni alan gerekmez.** `gtm_container_id` tek yükleyici olur. GA4, Meta Pixel, Hotjar ve Clarity GTM içindeki resmi template'lerle yönetilir. Google/Yandex/Bing doğrulaması mevcut alanlarla karşılanır.
- **Seçenek B: Uygulama içi alanlar.** `ga4_measurement_id`, `meta_pixel_id` ve `hotjar_site_id` (ve gerekirse `clarity_project_id`) eklenir. Bu **migration gerektirir**: `settings`'e kolon ekleme ve `get_public_settings` RPC kolon listesinin güncellenmesi (081'in yeni sürümü).
- **Seçenek C: Migration'sız geçiş köprüsü.** Render sırasında legacy metinden **yalnız ID'ler** katı regex'le çıkarılır ve uygulamanın kendi sabit şablonu render edilir. Metnin geri kalanı atılır. Bu "sanitize edip geçmek" değil, yeniden kurmak. Yine de:
  - bilinmeyen içerik sessizce kaybolur;
  - admin aynı textarea'yı düzenlemeye devam eder ve kafası karışır.

  Yalnız A veya B hazır olana kadar kısa süreli bir köprü olarak düşünülmeli.

---

## 5. Yerel runtime baseline (probe'lu ve probe'suz iki build)

Probe'suz durumda (`p2base`) GTM loader tüm sayfalarda istek atıyor ve **hydration hatası yok**. Probe'lu durumda (`p2probe`) şunlar görüldü:

| Gözlem | Sonuç | Kanıt |
|---|---|---|
| Inline `<script>` (head alanı) çalışıyor mu? | **Evet**, sayfa başına 1 kez | `__SEC05_HEAD_INLINE=1` (12/12 200 yanıtlı sayfa) |
| Harici script (head alanı) | **Evet**, 1 kez | Probe sunucusunda `ext-head.js` 13 hit (12 sayfa + 1 SPA) |
| Inline `<script>` (analytics alanı) | **Evet**, 1 kez | `__SEC05_BODY_INLINE=1` |
| **Admin login sayfasında çalışıyor mu?** | **Evet, üç probe da** | `/maki-admin/login`: head=1, ext=1, body=1 |
| **React hydration** | **Her sayfada #418 hatası** (base'de yok) | `pageerror: Minified React error #418 … args[]=HTML` |
| `<img>` beacon | **Sayfa başına 2 istek** (hydration sonrası istemci yeniden çizimi elemanı tekrar oluşturuyor) | `/iletisim`: `ext-head.js, beacon.gif, beacon.gif` |
| 404 sayfaları | Scriptler **çalışmıyor**, img yine 2–3 kez isteniyor | `/en` (fixture'da multilingual kapalı): head/body sayacı `null` |
| `<meta>` konumu (ham HTML) | `<head>` içindeki `<div>`, parser'ın head'i kapatmasına yol açıyor ve özel içerik **`<body>`'ye düşüyor**. JS'siz crawler bunu body'de görür. Next'in kendi metadata etiketleri div'den **önce** geldiği için etkilenmiyor | SSR HTML: 14 meta, 6 link ve title div'den önce. Yalnız probe meta'sı sonra |
| `google_site_verification` alanı | `<head>` içinde, doğru | DOM: `gsv: head` |
| SPA navigasyonu (`/` → `/iletisim`) | Ham scriptler **tekrar çalışmıyor** (sayaç 1'de kalıyor). Sayfa görüntüleme takibi aracın history-change desteğine bağlı | `before h=1 → after h=1` |
| GTM | Tüm sayfalarda `www.googletagmanager.com/gtm.js`, **admin dahil** | Ağ kaydı |

Sonuç: Alanlar doluysa bugünkü uygulama, güvenlik riskine ek olarak **performans ve doğruluk sorunu** üretiyor:

- tüm kökün istemcide yeniden render'ı;
- beacon'ların çift sayılması;
- yanlış konumlanan meta etiketleri.

Production'da alanlar dolu mu? Bu, §3 çıktısıyla ya da tarayıcı konsolunda #418 hatası görülüp görülmediğine bakılarak doğrulanabilir.

---

## 6. On sorunun cevapları

> Production verisi okunamadığı için "koşullu" cevaplar §3 çıktısıyla kesinleşecek.

1. **`custom_head_scripts` kaldırılabilir mi?** **Evet, aşamalı olarak.**
   - Boşsa veya yalnız mükerrer doğrulama/GTM içeriyorsa hemen kaldırılabilir.
   - Tanınan vendor içeriyorsa önce GTM'e (veya yeni alana) taşınıp doğrulanmalı.
   - Keyfi içerik varsa (widget, özel JS) elle karar verilmeli.

   Doğrulama meta'ları için karşılık zaten var.
2. **`analytics_script` kaldırılabilir mi?** **Evet, aynı koşullarla.** Bu alan tipik olarak GA4, Pixel veya GTM snippet'i taşır; hepsinin GTM karşılığı var. `gtm_same_as_field=t` ise bugün **çift GTM yükleniyor** demektir ve silmek doğrudan iyileştirme olur.
3. **Hangi yapılandırılmış alanlar gerekli?** Seçenek A'da **yeni alan yok** (GTM + mevcut 3 doğrulama alanı). Seçenek B'de `ga4_measurement_id`, `meta_pixel_id`, `hotjar_site_id` ve (gerekirse) `clarity_project_id`. Doğrulama meta'ları için mevcut alanlar yeterli; ek servis çıkarsa `extra_verification` (isim whitelist'li) gerekir.
4. **Production verisi otomatik ve güvenli biçimde dönüştürülebilir mi?** **Önermiyorum.** Satır sayısı 1 ve ID sayısı en fazla birkaç tane. Serbest metin ayrıştırması şu durumlarda sessiz veri kaybına yol açar:
   - `gtag('config', id, {…})` parametreleri;
   - özel `fbq('track')` olayları;
   - consent kodu;
   - birden fazla ID.

   Güvenli yol: SQL çıktısıyla sınıflandırma, ID'lerin admin tarafından elle girilmesi, sonra doğrulama.
5. **Migration gerekli mi?**
   - Seçenek A (GTM konsolidasyonu): **Hayır.**
   - Seçenek B (yeni alanlar): **Evet** (kolon + RPC).
   - Legacy kolonları DB'den silmek: **şimdilik hayır.** Geri dönüş için saklanmalı ve bu ayrı, sonraki bir migration olmalı.
   - İleride legacy alanları public RPC'den çıkarmak: migration gerekir (SEC-04 ile birlikte düşünülebilir).
6. **Migration'sız app-layer geçişi mümkün mü?** **Evet.** Adımlar:
   1. Render'ı root layout'tan `(public)/layout.tsx` ve `app/p/layout.tsx`'e taşı; admin artık çalıştırmaz.
   2. GTM konsolidasyonu yap.
   3. `PUT /api/admin/settings` bu iki anahtarı reddetsin (sunucu tarafında salt okunur).
   4. Render'ı kaldır.

   Bunların hiçbiri DB şeması değiştirmez.
7. **Legacy alanlar salt okunur tutulabilir mi?** **Evet**, ama **sunucu tarafında** yapılmalı. PUT route'u bugün kolon whitelist'i olmadan body'deki her anahtarı yazıyor; yalnız UI'da textarea'yı `readOnly` yapmak koruma sağlamaz. Minimal kural: `custom_head_scripts` / `analytics_script` anahtarı gelirse ve değer mevcut değerden farklıysa reddet ya da yok say. İdeal kural (SEC-04): kolon whitelist'i.
8. **Admin davranışı korunabilir mi?** **Evet.**
   - `/settings/gelismis` aynı yerde kalır.
   - GTM girişine format doğrulama geri bildirimi eklenir (bugün geçersiz ID sessizce render edilmiyor).
   - Legacy textarea'lar "salt okunur / taşındı" notuyla gösterilir; içerik silinmez, görüntülenebilir.
   - Seçenek B'de yeni ID girişleri aynı sayfaya eklenir.
   - Kaydetme akışı (`updateSettings` → PUT) aynı kalır.
9. **GA/GTM/Pixel çalışmaya devam eder mi?**
   - GTM: **Evet** (Phase 1 geçerli ID'yi aynen render ediyor; baseline'da loader yükleniyor).
   - GA4 ve Pixel: GTM'e veya yeni alanlara **taşındıktan sonra** evet. Taşınmadan render kaldırılırsa **hayır**.

   Bu yüzden sıra şu olmalı: **önce taşı ve doğrula (GTM Preview / Tag Assistant / Pixel Helper), sonra kaldır.** Uyarılar:
   - Admin rotalarından kaldırmak admin sayfalarının analytics'ini keser. Bu muhtemelen istenen bir sonuç.
   - Public layout'a taşımak bakım modunda ve 404'te yüklemeyi durdurur (404'te bugün de çalışmıyor).
10. **Hangi scriptler elle incelenmeli?** §3.3 matrisinde "Elle" veya "Hayır" satırlarına düşen her şey:
    - `leftover_tags>0` (tanınmayan HTML);
    - `n_event_handler_attr>0`;
    - `n_eval_like>0`;
    - `fp_network_api` veya `fp_storage_access`;
    - chat/WhatsApp widget'ları;
    - PageView dışı `fbq('track')` / `gtag('event')` içeren inline gövdeler;
    - ikinci GTM konteyneri;
    - tanınmayan host'lar.

---

## 7. Geriye uyumlu geçiş planı (legacy → yapılandırılmış)

| Faz | İçerik | Migration | Risk | Geri alma |
|---|---|---|---|---|
| **P2-0** | Production SQL sınıflandırması (§3). GTM arayüzünde mevcut tag envanteri (GA4 zaten GTM'de mi?) | — | Yok | — |
| **P2-1** | Ham render'ı root layout'tan **public layout'lara** taşı (`(public)/layout.tsx`, `app/p/layout.tsx`). Admin ve login artık 3. taraf ve admin girdisi script çalıştırmaz. GTM de aynı şekilde taşınabilir | Yok | Düşük: public takip aynen sürer. Bakım modu ve 404'te yüklenmez | Tek commit revert |
| **P2-2** | İçeriği GTM'e (A) veya yeni alanlara (B) taşı. GTM Preview ve vendor araçlarıyla doğrula | A: yok, B: var | Orta: taşıma sırasında çift veya eksik sayım | GTM version rollback |
| **P2-3** | Legacy alanları **sunucuda salt okunur** yap (PUT anahtarı reddeder), admin UI'da salt okunur göster. Değer DB'de kalır | Yok | Düşük | Revert |
| **P2-4** | Legacy render'ı **tamamen kaldır** (layout'taki iki `dangerouslySetInnerHTML`). Hydration #418 ve çift beacon sorunları biter | Yok | P2-2 doğrulanmadıysa takip kaybı | Revert. Değer DB'de hâlâ duruyor |
| **P2-5** | CSP Report-Only (§8) | Yok | Yok (yalnız rapor) | Header'ı kaldır |
| **P2-6** | (Opsiyonel, sonra) Legacy kolonları public RPC'den çıkar; en son kolonları DROP et | Evet | Düşük | Migration down |

**Kalan risk (açıkça):**

- P2-1 sonrasında public sayfalarda admin girdisi ham HTML hâlâ çalışır. Yazma yetkisi yalnız `settings` izinli admin'lerde (SEC-03), ama bu yetkiye sahip hesabın ele geçirilmesi public XSS demektir. Bu risk P2-4'e kadar sürer.
- Seçenek A'da risk **GTM hesabına** geçer: GTM Custom HTML tag'leri de keyfi JS'tir. GTM hesabı için 2FA, kullanıcı rolleri ve publish onayı önerilir.
- `gtag('config', …, {params})` veya özel olaylar gibi yapılandırmalar elle taşınmazsa veri kalitesi değişir.

---

## 8. CSP analizi

### 8.1 Kaynak envanteri (kod + runtime)

| Direktif | Gerekli kaynaklar | Kaynak |
|---|---|---|
| `script-src` | `'self'`; **inline** (Next flight `self.__next_f.push`, ana sayfada 26 inline script; `gtm-init`; `SORT_DROPDOWN_CLOSE_SCRIPT` → `AramaPageBody.tsx:1455`, `KiralikVillalarPageBody.tsx:414`); `https://www.googletagmanager.com`; + GTM içindeki tag'lerin host'ları; + legacy alan host'ları (P2-4'e kadar) | Runtime + kod |
| `style-src` | `'self' 'unsafe-inline'`: `style` attribute'ları ana sayfada 1442, villa detayda 56, `/v/` sayfasında 421 adet; `<style>` etiketleri de var. Attribute'lar nonce ile yetkilendirilemez | Runtime |
| `img-src` | `'self' data: blob:`; CDN host'ları (`NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS`; kodda `cdn.villayagel.com` referansı var. Fixture'da optimize edilmemiş doğrudan istekler görüldü); `https://i.ytimg.com` (YouTube thumbnail); + GA/Pixel beacon host'ları. Admin için ek: `https://unpkg.com` (leaflet marker'ları), `https://*.tile.openstreetmap.org` | Runtime + kod. `next/image` (`images.unsplash.com` dahil) `'self'` üzerinden geçiyor |
| `font-src` | `'self'` (`next/font` self-hosted). Güvenlik için `data:` | Kod |
| `frame-src` | `https://www.google.com`, `https://maps.google.com` (harita modalı, `/iletisim`, `/v/`); `https://www.youtube-nocookie.com` (video modalı) | Runtime (harita iframe'i görüldü) + `map-embed.helper`, `youtube.helper` |
| `connect-src` | `'self'` (RSC, server action, `/api/*`). WebSocket/EventSource **yok**. Nominatim, TCMB, Resend ve R2 **sunucu tarafında**. + GA4/Pixel/Hotjar collect endpoint'leri (Hotjar WebSocket kullanır) | Kod |
| `media-src` | `'self'` (`<video>`/`<audio>` yok) | Kod |
| `object-src` | `'none'` | — |
| `base-uri` | `'self'` | — |
| `form-action` | `'self'` (dış POST formu yok; WhatsApp ve sosyal linkler navigasyon) | Kod |
| `frame-ancestors` | `'self'` (clickjacking koruması; static/ISR ile uyumlu) | — |
| `worker-src` | `'self' blob:` (şu an worker yok, ileriye dönük) | — |

Vendor host listeleri (GA4, Pixel, Hotjar, Clarity) değişebilir. Enforce'tan önce **vendor'ların güncel CSP dokümanlarından ve Report-Only raporlarından** doğrulanmalı. Bu raporda uydurma host listesi yok; kesin liste Report-Only verisinden çıkarılacak.

### 8.2 Sorular

| Soru | Cevap |
|---|---|
| **Report-Only mümkün mü?** | **Evet.** `next.config.ts` `headers()` ile statik başlık olarak uygulanabilir; ISR/static sayfalar etkilenmez, hiçbir şey bloklanmaz. Raporlamak için `report-uri`/`report-to` hedefi olarak basit bir `/api/csp-report` route'u gerekir (log'lanır, DB yazımı gerekmez). |
| **Nonce mümkün mü?** | **Public tarafta pratikte hayır.** Next dokümanına göre: "you **must use dynamic rendering** to add nonces"; ayrıca "PPR is incompatible with nonce-based CSP". Yaklaşık 20 static/ISR rota (ana sayfa, blog, iletişim, TR/EN/DE varyantları) dinamik olur; performans ve maliyet artar. **Admin tarafında evet**: `/maki-admin/*` zaten tamamen ƒ (dinamik), proxy/middleware ile rota bazlı nonce CSP uygulanabilir. |
| **Hash mümkün mü?** | **Kısmen.** Next'in SRI desteği **deneysel** ("Experimental … may change or be removed") ve yalnız build-time'da bilinen harici chunk'ları kapsar ("Cannot handle dynamically generated scripts"). Sayfa başına değişen inline flight script'leri ve GTM'in dinamik enjekte ettiği tag'ler hash'lenemez. |
| **`'unsafe-inline'` gerekli mi?** | **Public'te evet** (`script-src` ve `style-src`). Admin'de nonce ile `script-src` için gerekmez; `style-src` için attribute'lar yüzünden büyük olasılıkla gerekir. |
| **`'unsafe-eval'` gerekli mi?** | **Next production için hayır** (yalnız dev: "In development, `'unsafe-eval'` is required"). **GTM "Custom JavaScript" değişkenleri kullanılıyorsa gerekebilir**; Report-Only verisi gösterecek. |
| **ISR/static etkisi** | Report-Only ve `'unsafe-inline'` tabanlı enforce: **etki yok** (statik başlık). Nonce: tüm static/ISR sayfalar dinamik olur, önerilmez. |

### 8.3 CSP planı

1. **Önkoşul:** P2-1 ve P2-4 tamamlanmalı (iki ham alan çözülmeli). Aksi halde ya legacy içerik bozulur ya da policy onları kapsamak için gevşek kalır.
2. **Report-Only, public:**

   ```
   default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com <GTM tag host'ları>;
   style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <CDN host'ları> https://i.ytimg.com <beacon host'ları>;
   font-src 'self' data:; frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com;
   connect-src 'self' <analytics endpoint'leri>; media-src 'self'; object-src 'none'; base-uri 'self';
   form-action 'self'; frame-ancestors 'self'; report-uri /api/csp-report
   ```

3. **Admin için ayrı ve daha sıkı Report-Only:** 3. taraf yok; admin görsel host'ları eklenir; ileride nonce ile `'strict-dynamic'`.
4. 1–2 hafta rapor toplanır, allowlist daraltılır, sonra **enforce** edilir (önce admin, sonra public).
5. `'unsafe-inline'` ile bile değer yüksek: harici script host kısıtı, `object-src`/`base-uri`/`form-action`, clickjacking koruması (`frame-ancestors`) ve `connect-src`/`img-src` ile veri sızdırma yüzeyinin daraltılması.

---

## 9. Riskler

| Risk | Şiddet | Not |
|---|---|---|
| Ham alanlar **admin panelinde ve login'de** çalışıyor | **Yüksek** | Oturumu açık admin'in yetkileriyle aynı origin'de çalışır (httpOnly çerezler same-origin isteklerde gider). 3. taraf bir scriptin ele geçirilmesi (tedarik zinciri) de aynı etkiyi yaratır |
| Public stored XSS (`settings` yetkili hesap üzerinden) | Yüksek | SEC-03 yazmayı `settings` iznine bağladı, ama sink hâlâ ham |
| Hydration #418 ve kökün istemcide yeniden çizimi | Orta | Alanlar doluysa bugün **her sayfada** oluşuyor. Performans ve stabilite etkisi |
| Beacon'ların çift sayılması | Orta | `<img>` pixel'leri iki kez isteniyor |
| Çift GTM / çift GA4 | Orta | `gtm_same_as_field`'a ve GTM içeriğine bağlı |
| Meta etiketlerinin body'ye düşmesi | Düşük–Orta | JS'siz crawler'lar için doğrulama ve meta etiketleri yanlış yerde |
| Analytics'in onaydan bağımsız yüklenmesi | Bilgi | `CookieConsent` gating yapmıyor. Hukuki değerlendirme değil; teknik gözlem |
| PUT settings'te kolon whitelist'i yok | Orta | SEC-04 ile birlikte ele alınmalı |
| **Yan bulgu:** `StructuredData.JsonLd` `JSON.stringify` çıktısında `<` karakterini escape etmiyor | Orta (doğrulanmadı) | Admin kontrolündeki bir metin `</script>` içerirse inline JSON-LD bloğundan çıkılabilir. Kod okuma bulgusu; runtime'da test edilmedi. **Ayrı bir kalem** olarak önerilir (`<` → `<`) |

---

## 10. Önerilen minimum değişiklik (onay bekliyor, yapılmadı)

**Adım 1: P2-1.** `custom_head_scripts`, `analytics_script` ve GTM render'ı root `app/layout.tsx`'ten çıkar, küçük bir server component ile `(public)/layout.tsx` ve `app/p/layout.tsx` içinde render et.

- Kazanç: admin panel ve login artık admin girdisi veya 3. taraf script çalıştırmaz.
- Migration yok, DB yok, ISR etkisi yok.
- Public takip aynen sürer (runtime'da doğrulanabilir).
- Test: layout'un admin rotada bu içeriği render etmediğini, public'te ettiğini kilitleyen yeni testler; mevcut testlere dokunulmaz.

**Adım 2: P2-3.** PUT settings'te iki legacy anahtarı sunucuda reddet (değişikliği yok say ve 400 dön) ve admin UI'da salt okunur göster. Önkoşul: GTM konsolidasyonu planının onaylanması.

**Adım 3: P2-4.** Taşıma doğrulandıktan sonra iki `dangerouslySetInnerHTML` sink'ini kaldır.

**Adım 4: P2-5.** CSP Report-Only.

Adım 1 production verisinden bağımsız olarak güvenli. Adım 2–4 için §3 SQL çıktısı ve GTM tag envanteri gerekli.

---

## 11. Sizden beklenenler

1. §3 SQL'ini production'da çalıştırıp çıktıyı paylaşmanız (ham değer içermez).
2. GTM arayüzünde: konteynerde GA4, Pixel veya Hotjar tag'i zaten var mı? Custom HTML tag'leri ve Custom JavaScript değişkenleri var mı?
3. Tercih: **Seçenek A (GTM konsolidasyonu, migration yok)** mu, **Seçenek B (yeni alanlar, migration)** mı?
4. Adım 1 (P2-1) için onay.

---

## 12. Değişiklik yapılmadığının kanıtı

**Device (`tatilin-yeri-next`):**

- `HEAD`: `6efc1cd fix(security): enforce admin API permissions`. Analiz öncesiyle aynı.
- `git status --porcelain` (kod dosyaları): analiz öncesiyle **aynı**.

  ```
   M app/components/private-villa/PrivateVillaPageBody.tsx   (SEC-05 P1)
   M app/components/villa/VillaMapModal.tsx                  (SEC-05 P1)
   M app/layout.tsx                                          (SEC-05 P1)
  ?? lib/gtm.helper.ts                                       (SEC-05 P1)
  ?? lib/map-embed.helper.ts                                 (SEC-05 P1)
  ?? tests/unit/sec05-xss-helpers.test.ts                    (SEC-05 P1)
  ```

  Bu analizle eklenen tek yeni dosyalar, `Claude outputs/` altındaki bu rapor ve `sec05-phase2-readonly.sql`.
- Phase 1 dosya md5'leri analiz öncesi ve sonrasında aynı:

  | Dosya | md5 |
  |---|---|
  | `lib/gtm.helper.ts` | `c17bd6cd…` |
  | `lib/map-embed.helper.ts` | `df76f81a…` |
  | `app/layout.tsx` | `95a50a61…` |
  | `VillaMapModal.tsx` | `b5163222…` |
  | `PrivateVillaPageBody.tsx` | `2218ff20…` |
  | `sec05-xss-helpers.test.ts` | `e98d5948…` |

**Diğer:**

- Production DB: bağlantı kurulamadı, hiçbir sorgu çalışmadı.
- R2, `.env`, migration ve config: dokunulmadı. `.env.local`'dan yalnız anahtar adları okundu; değer yazdırılmadı.
- Yerel fixture (`kv_sec03.get_public_settings`): eski haline döndürüldü (`GTM-TEST1234`, legacy alan yok). Geçici `kv_p2test` silindi.
- Commit, push ve deploy: **yapılmadı.**
