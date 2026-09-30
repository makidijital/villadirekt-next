# SEC-05 Phase 2 — Düzeltme raporu

**Tarih:** 2026-09-24
**Device HEAD:** `6efc1cd fix(security): enforce admin API permissions` (değişmedi)
**Durum:** Kod değişiklikleri uygulandı ve device'ta md5 ile doğrulandı. **Commit, push ve deploy yapılmadı.**
**Kısıtlar:**

- Production DB'ye yazma yapılmadı; production'a zaten bağlanılamadı.
- Migration yok.
- R2'ye dokunulmadı.
- `.env` ve config değişmedi (`next.config.ts` ve `middleware.ts` dahil).
- Yeni dependency eklenmedi.
- Mevcut testler değiştirilmedi; yalnız yeni testler eklendi.

---

## 1. Özet

| # | Konu | Doğrulandı mı? | Kapatıldı mı? |
|---|---|---|---|
| 1 | `custom_head_scripts` ve `analytics_script` admin panelinde (login dahil) çalışıyor | ✅ Runtime'da doğrulandı | ✅ **Kapatıldı.** Admin sayfalarında artık render edilmiyor |
| 2 | GTM konteyneri admin panelinde yükleniyor | ✅ Runtime'da doğrulandı | ✅ **Kapatıldı** (yalnız public) |
| 3 | JSON-LD `</script>` breakout, **çalıştırılabilir XSS** | ✅ **Gerçek** (sentinel çalıştı) | ✅ **Kapatıldı** (`<` → `<`) |
| 4 | Ham alanların yol açtığı React hydration hatası #418 ve çift beacon | ✅ Runtime'da doğrulandı | ✅ Taşımanın **yan etkisi olarak düzeldi** |
| 5 | CSP | Envanter çıkarıldı; önerilen Report-Only politikası runtime'da doğrulandı | ⏸ **Uygulanmadı.** Config veya middleware değişikliği gerekiyor (§6); onay bekliyor |
| 6 | Public sayfalarda ham HTML/JS çalışması (admin girdisi) | Bilinen risk | ⏸ **Bilerek açık bırakıldı.** Production verisi okunamadığı için içeriğe dokunmak takip kaybı riski taşıyor (§7) |

---

## 2. Production DB'de ne bulundu?

**Hiçbir şey okunamadı.** Bu oturumda da `DATABASE_URL` host'u çözülemedi (`socket.gaierror`); cloud ortamından da erişim yok. Bu yüzden:

- Hiçbir production değeri okunmadı, yazılmadı ve tahmin edilmedi.
- Seçilen çözüm, **içeriği hiç parse etmeden ve değiştirmeden AYNEN taşıyan** bir çözüm. Production'da ne olursa olsun public takip kodu kaybolmaz.
- Structured field'lara geçiş kararı için gereken sınıflandırma, önceki fazda hazırlanan ve ham değer yazdırmayan `Claude outputs/sec05-phase2-readonly.sql` ile yapılabilir. Çıktısını SSH ile alıp paylaşırsanız sonraki adım (§7) kesinleşir.
- **Migration gerekmedi.** Şema ve RPC'ye dokunulmadı.

---

## 3. Değişen dosyalar ve gerekçeleri

Patch: `Claude outputs/patches/sec05-phase2.patch`. 7 dosya, +305 / −41 satır.

| Dosya | Değişiklik | Neden |
|---|---|---|
| `app/components/layout/SiteTrackingScripts.tsx` (**yeni**, 62 satır) | GTM (`normalizeGtmId` ile, Phase 1), `custom_head_scripts` ve `analytics_script` render'ı. Root layout'taki kodun **birebir aynısı**; içerik AYNEN basılıyor, sıra aynı (head → GTM → analytics) | Takip kodunu tek bir yerde toplayıp yalnız public kabuklarda kullanmak |
| `app/layout.tsx` (+6 / −39) | Üç render bloğu ve `Script` / `normalizeGtmId` import'ları kaldırıldı. `<head />` boş kaldı. `generateMetadata` (Google/Yandex/Bing doğrulama, OG vb.) **değişmedi** | Root layout admin dahil **tüm** rotaları sarıyordu |
| `app/(public)/layout.tsx` (+14 / −1) | `<SiteTrackingScripts settings={settings} />` iki dala eklendi: normal dalda `public-shell`'den önce, bakım modu dalında `MaintenanceScreen`'den önce. `settings` zaten okunuyordu, **ek fetch yok**. `headers()` / `cookies()` yok | Public sayfalar ve bakım ekranı eskisi gibi takip edilsin |
| `app/not-found.tsx` (+9) | Aynı component eklendi. `getCachedSettings()` cache'li, ek DB yükü yok | 404 sayfası `(public)` layout'unun dışında; 404 takibi korunsun |
| `app/components/seo/StructuredData.tsx` (+12 / −1) | `serializeJsonLd()` eklendi: `JSON.stringify(data).replace(/</g, "\\u003c")`. `JsonLd` bunu kullanıyor | JSON-LD breakout XSS'i. Tek render noktası; 20 JSON-LD kullanımının hepsi bu component'ten geçiyor |
| `tests/unit/sec05-jsonld-escape.test.tsx` (**yeni**, 6 test) | Breakout engelleniyor mu, `JSON.parse` eşitliği, `<` içermeyen veride çıktının **byte-identical** olması, SSR markup'ta tek `</script`, gerçek builder'lar | Regresyon kilidi |
| `tests/unit/sec05-tracking-public-only.test.tsx` (**yeni**, 6 test) | İçerik aynen ve doğru sırada basılıyor; geçersiz GTM render edilmiyor; boşsa çıktı yok. Mimari kilit: root ve admin layout'ları bu alanları render etmiyor, public layout'un iki dalı, `/p` ve 404 ediyor | Regresyon kilidi |

`app/p/layout.tsx` değişmedi; `(public)/layout`'u re-export ettiği için otomatik olarak kapsanıyor.

**Dokunulmayanlar:**

- `middleware.ts` ve `next.config.ts`;
- `lib/gtm.helper.ts` ve `lib/map-embed.helper.ts` (Phase 1);
- `VillaMapModal` ve `PrivateVillaPageBody` (Phase 1);
- SEC-01 ve SEC-03 dosyaları;
- admin layout'ları;
- `settings` API'si ve admin settings UI.

---

## 4. Doğrulama yöntemi (before/after)

- Aynı fixture ile iki production build yapıldı:
  - `p2before`: Phase 1 durumu. Phase 1 layout'u, md5 `95a50a61` ile birebir yeniden üretildi.
  - `p2after`: bu patch.
- Fixture `kv_sec03`:
  - `custom_head_scripts`: meta + inline script + harici script;
  - `analytics_script`: inline script + `<img>` beacon;
  - `gtm_container_id = GTM-TEST1234`;
  - Google, Yandex ve Bing doğrulama alanları;
  - JSON-LD testi için villa başlığında **zararsız sentinel**: `</script><script>window.__SEC05_JSONLD=…+1</script>`.
- Playwright ile 21 sayfa ve 2 SPA geçişi test edildi (masaüstü ve iPhone 13 profili).
- Dış ağ bloklandı. Probe istekleri sayıldı. Report-Only CSP header'ı **yalnız testte** Playwright ile document yanıtlarına enjekte edildi.
- Sonrasında fixture eski haline döndürüldü: villa başlığı `Villa 547`, `get_public_settings` orijinal hali.

### 4.1 Runtime sonuçları

| Sayfa | Before (Phase 1) | After (bu patch) |
|---|---|---|
| Public: `/`, `/kiralik-villalar`, `/arama`, `/blog`, `/blog/[slug]`, `/iletisim`, `/teklif-al`, `/favoriler`, `/rezervasyon-kontrol`, `/p/[slug]`, `/v/[token]`, `/kiralik-villa/[slug]`, mobil `/` ve villa | Head inline = 1, harici = 1, body inline = 1, GTM ✓, dataLayer ✓; **her sayfada React #418**; **beacon 2 kez** | Head inline = 1, harici = 1, body inline = 1, GTM ✓, dataLayer ✓; **#418 yok**; **beacon 1 kez** |
| 404 (global ve villa `notFound`) | Scriptler, GTM ve beacon çalışıyor (#418 var) | Aynı, hatasız; beacon 1 kez |
| Bakım modu (`/`, `/iletisim`) | Root'tan yükleniyordu | ✓ Aynen yükleniyor (ayrı build ile doğrulandı) |
| **`/maki-admin/login`** | Head inline = 1, harici = 1, body inline = 1, **GTM ✓** | **Hiçbiri yok** (`null`, GTM ✗, probe isteği 0) |
| **`/maki-admin` (dashboard)**, **`/maki-admin/settings`**, **`/settings/gelismis`**, **`/villas`** (oturum açık) | Hepsi çalışıyor, GTM ✓ | **Hiçbiri yok**, GTM ✗, probe isteği 0. Sayfa içerik uzunlukları before ile **birebir aynı** |
| Google / Yandex / Bing doğrulama meta'ları | `<head>` | `<head>` ✓ (değişmedi) |
| Harita iframe'i (villa modalı, `/iletisim`, `/v/`) | `www.google.com` | `www.google.com` ✓ (Phase 1 allowlist'i aynen geçerli) |
| JSON-LD bloğu (parse edilebilir / toplam) | Ana sayfa 3/3, villalar 3/3, arama 2/2, villa 2/2… | **Birebir aynı sayılar**, hepsi parse edilebilir |
| **JSON-LD sentinel** | **Villa detayında 2, `/kiralik-villalar` ve `/arama`'da 1 kez ÇALIŞTI** | **Çalışmadı** (`null`). `name` alanı orijinal metni aynen taşıyor |
| SPA `/` → `/iletisim` | Scriptler yeniden çalışmıyor | Aynı |
| SPA `/p/…` → `/` | Toplam 3 probe isteği | Toplam 3 probe isteği. Scriptler yeniden çalışmıyor; img beacon farklı layout'a geçişte 1 kez yeniden yükleniyor (§8) |

**Custom meta konumu:**

- Before: ham HTML'de `<head>` içindeki `<div>` parser'ı head'i kapatmaya zorluyordu, içerik zaten `<body>` başına düşüyordu. JS çalıştırmayan crawler'lar body'de görüyordu. DOM'da "head" görünmesinin tek nedeni #418 sonrası React'in kökü yeniden çizmesiydi.
- After: aynı içerik **geçerli HTML** olarak `<body>` başında. Crawler'ın gördüğü yapı öncekiyle aynı.

### 4.2 Admin oturum ve permission regresyonu (SEC-01 / SEC-03)

- `ux3.mjs`, `AdminSessionGuard` senaryoları (sahte refresh cookie, anonim, geçerli access, idle + refresh, client navigasyon): sonuçlar **SEC-03 baseline'ı ile birebir aynı**.
- `integ3.py` (26 PASS) ve `reg3.py` (22 PASS): permission ve API kontrolleri geçti.
- Kalan 3 FAIL fixture durumundan kaynaklanıyor, kodla ilgili değil:
  - `create-user → 409 (e-posta zaten kayıtlı)`: aynı script ikinci kez çalıştırıldı;
  - `activity-logs cleanup deleted=0`: eski loglar önceki koşuda zaten silinmişti;
  - `/en → 404`: fixture'da `multilingual_enabled=false`. Before build'de de 404'tü.

---

## 5. Test, build, TypeScript ve ESLint

| Kontrol | Önce (baseline) | Sonra |
|---|---|---|
| TypeScript (`tsc --noEmit`) | 0 hata | **0 hata** (cloud + device) |
| ESLint | 0 hata / 197 uyarı | **0 hata / 195 uyarı**. Önceden var olan 2 "unused eslint-disable" uyarısı, kaldırılan layout div'leriyle birlikte gitti. **Yeni uyarı yok** |
| Vitest (tam suite) | 188 dosya / 3725 test ✓ | **190 dosya / 3737 test ✓** (+12 yeni test). stderr gürültüsü önce ve sonra aynı (59 satır) |
| Device'ta güvenlik testleri (sec01, sec03, sec05 ×3, JSON-LD / layout / homepage) | — | **8 dosya / 157 test ✓** |
| Production build | exit 0 | **exit 0** (`p2after` ve bakım modu `p2maint`) |
| Static/ISR route tablosu | 189 satır | **Birebir aynı** (`diff` boş). `/`, `/blog`, `/iletisim` vb. hâlâ ○. `/iletisim` yanıtı: `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, `s-maxage=3600` |

---

## 6. CSP: envanter ve strateji (uygulanmadı)

### 6.1 Neden uygulanmadı?

- Public sayfalara header eklemenin iki yolu var:
  - `next.config.ts` → `headers()`: config dosyası; talimat gereği değiştirilmedi.
  - `middleware.ts`: matcher şu an **yalnız `/maki-admin/:path*`**. Public'i kapsaması için matcher'ı genişletmek, her public isteği edge middleware'den geçirir ve SEC-01 auth-redirect mantığına dokunmayı gerektirir.
- Report-Only verisini toplamak için ayrıca yeni ve public bir `/api/csp-report` endpoint'i gerekir (log flood riski yönetilmeli).
- **Nonce** Next dokümanına göre tüm sayfaları dinamik yapar ("must use dynamic rendering") ve PPR ile uyumsuzdur. Public'te **ISR/static'i bozacağı** için önerilmiyor.
- Admin rotaları zaten tamamen dinamik; orada nonce ileride mümkün.

### 6.2 Envanter (kod + runtime)

| Tür | Kaynaklar |
|---|---|
| Inline script | Next flight (`self.__next_f.push`, ana sayfada ~26), `gtm-init`, `SORT_DROPDOWN_CLOSE_SCRIPT` (arama ve villalar), JSON-LD (veri bloğu; CSP tarafından çalıştırılmaz), legacy alanlar |
| Harici script | `'self'` chunk'ları, `www.googletagmanager.com` + GTM'in yüklediği tag'ler (production'da GTM içeriği bilinmiyor), legacy alan host'ları |
| Style | `'self'` CSS. **`style` attribute'ları çok sayıda** (ana sayfada 1442) ve nonce ile yetkilendirilemiyor → `'unsafe-inline'` şart |
| Iframe | `www.google.com` / `maps.google.com` (harita), `www.youtube-nocookie.com` (video) |
| Image / beacon | `'self'` (`next/image` dahil, unsplash de proxy üzerinden), `data:`, `blob:`, CDN host'ları (`NEXT_PUBLIC_CDN_BASE_*`), `i.ytimg.com`, GTM/analytics beacon'ları, legacy alan pixel'leri. Admin: `assets` host'u, `unpkg.com`, `*.tile.openstreetmap.org` |
| Font | `'self'` (`next/font` self-hosted) |
| connect / fetch | `'self'` (RSC, server action, `/api`). Nominatim, TCMB, Resend ve R2 **sunucu tarafında** |
| WebSocket / EventSource / Worker | **Yok** |

### 6.3 Önerilen politika ve runtime doğrulaması

**Public (Report-Only):**

```
default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com <GTM/legacy host'ları>;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <CDN host'ları> https://i.ytimg.com https://www.googletagmanager.com <beacon host'ları>;
font-src 'self' data:; frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com;
connect-src 'self' <analytics endpoint'leri>; media-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'self'
```

**Admin (Report-Only):** Aynı taban, üçüncü taraf yok. `img-src`'ye admin görsel host'ları eklenir, `frame-ancestors 'none'`.

**Runtime sonucu:**

- 21 sayfa boyunca uygulamanın **kendi** kaynakları için **sıfır ihlal**.
- Tek ihlal, bilerek allowlist'e eklenmeyen legacy alan probe host'u (`script-src-elem` ve `img-src`). Bu, production'daki gerçek host'ların SQL çıktısından allowlist'e eklenmesi gerektiğini gösteriyor.
- Before durumunda admin'de ayrıca `script-src-elem googletagmanager` ihlali vardı. **After'da admin: 0 ihlal.** Admin politikası artık üçüncü taraf gerektirmiyor.
- `'unsafe-eval'` production'da gerekmiyor (yalnız dev). GTM "Custom JavaScript" değişkenleri kullanılıyorsa gerekebilir; Report-Only verisi gösterecek.

**Uygulama için onay gereken tercih:** (a) `next.config.ts` `headers()` + yeni `/api/csp-report` route'u, ya da (b) middleware matcher genişletmesi. Önerim (a): statik header ISR ile uyumlu, middleware'e dokunmuyor.

---

## 7. `custom_head_scripts` / `analytics_script` için sonraki adım (structured)

Bu patch alanların **içeriğine** dokunmadı. Yalnız nerede çalıştıklarını daralttı. Structured alanlara geçiş (GTM konsolidasyonu önerilir; yeni kolon gerekirse migration) şunlara bağlı:

1. Production sınıflandırma çıktısı (`sec05-phase2-readonly.sql`);
2. GTM konteynerinin mevcut tag envanteri.

Bu veriler olmadan ham alanları kaldırmak veya parse etmek **takip kaybı riski** taşıdığı için yapılmadı. Doğrulama meta'ları (Google/Yandex/Bing) ve GTM için structured alanlar zaten mevcut ve çalışıyor.

---

## 8. Açık kalan riskler

| Risk | Durum / not |
|---|---|
| Public sayfalarda admin girdisi ham HTML/JS çalışıyor (`settings` izinli bir hesap ele geçirilirse public XSS) | **Açık.** §7 tamamlanınca kapanır. Public'teki bir script same-origin olduğu için, admin aynı tarayıcıda oturum açıkken `/api/auth/refresh` gibi same-origin isteklerde çerezleri kullanabilir. Admin sayfalarından çıkarmak bu riski **azaltır ama sıfırlamaz** |
| **404 görünümleri admin URL'lerinde de takip yüklüyor**: oturum açıkken bilinmeyen `/maki-admin/*` URL'si ve `manual-reservations/[id]` sayfasının client-side `notFound()`'u root 404'ü gösteriyor | **Açık, before ile aynı** (regresyon değil). Unmatched URL'ler statik `/_not-found` HTML'inden servis ediliyor; path'e göre SSR gate'i hydration hatası üretir. Seçenekler: 404'ten takibi tamamen kaldırmak (public 404 analytics'i kaybolur) ya da admin'e ayrı bir `not-found` eklemek (admin UX değişir). Karar size ait |
| Admin RSC payload'ında root `not-found` ağacı (inert JSON olarak ham alan metni) bulunuyor | Çalıştırılabilir değil (runtime'da doğrulandı: admin'de sayaçlar `null`). Before'da da vardı |
| Soft navigasyon `/p/*` ↔ diğer public sayfalar | Farklı layout segmentleri olduğu için takip div'i yeniden oluşturuluyor. **Scriptler yeniden çalışmıyor**; yalnız legacy alandaki `<img>`/iframe tipi öğeler bir kez daha yükleniyor. Toplam istek sayısı before ile aynı (before'da her sayfada çift beacon vardı) |
| Beacon sayıları değişiyor (2 → 1) | Bu bir düzeltme, ama legacy `<img>` pixel'lerine dayanan metriklerde **ani düşüş** olarak görülebilir. Analytics ekibine not düşülmeli |
| CSP yok | Report-Only planı hazır; §6'da onay bekliyor |
| `PUT /api/admin/settings` kolon whitelist'i yok | SEC-04 kapsamında |
| Analytics, cookie onayından bağımsız yükleniyor | Değişmedi. Teknik gözlem; hukuki değerlendirme değildir |

---

## 9. Device durumu ve kanıt

```
HEAD: 6efc1cd fix(security): enforce admin API permissions   (değişmedi)
 M app/(public)/layout.tsx                  c7dc27a49aa4  (Phase 2)
 M app/components/seo/StructuredData.tsx    2a3af9481783  (Phase 2)
 M app/layout.tsx                           fefbf8e8cf7c  (Phase 1 + 2)
 M app/not-found.tsx                        347b0d250c8c  (Phase 2)
?? app/components/layout/SiteTrackingScripts.tsx   80f51cd4da1e  (Phase 2)
?? tests/unit/sec05-jsonld-escape.test.tsx         ea55e29a547a  (Phase 2)
?? tests/unit/sec05-tracking-public-only.test.tsx  1652630d4203  (Phase 2)
 M app/components/private-villa/PrivateVillaPageBody.tsx  2218ff200c79  (Phase 1, değişmedi)
 M app/components/villa/VillaMapModal.tsx                 b51632226c07  (Phase 1, değişmedi)
?? lib/gtm.helper.ts                                      c17bd6cdad66  (Phase 1, değişmedi)
?? lib/map-embed.helper.ts                                df76f81a82e1  (Phase 1, değişmedi)
?? tests/unit/sec05-xss-helpers.test.ts                   e98d594808b1  (Phase 1, değişmedi)
```

- Patch device'ta `git apply --check` ile kontrol edildi, sonra uygulandı. Tüm md5'ler cloud'daki test edilen dosyalarla aynı.
- `Claude outputs/` altına bu rapor ve `patches/sec05-phase2.patch` eklendi.
- **Commit, push ve deploy yapılmadı.**
