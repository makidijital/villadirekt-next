# Eski domain/marka kalıntıları temizlik audit'i (salt okuma)

**Tarih:** 2026-09-24
**Device HEAD:** `d395a31`. Çalışma ağacı temiz; yalnız `Claude outputs/` altında dosya var.
**Kapsam:** Yalnız okuma yapıldı. Kod, config, `.env`, test, migration değişikliği yok; commit, push ve deploy yok. Production DB, R2 ve Coolify'a dokunulmadı; dış istek atılmadı.
**Varsayım (sizin belirttiğiniz):** Coolify'da şu değişkenler tanımlı ve cron görevleri çalışıyor:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES`, `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS`
- `MAIL_ADMIN_NOTIFY_TO`

**Taranan desenler** (büyük/küçük harf duyarsız, boşluklu varyantlar dahil):

- `villayagel`, `villa ya gel`
- `yazvillam`, `yaz villam`
- `vercel`
- `localhost` fallback'leri
- `example.com`
- `Maki Dijital`

`node_modules`, `.next`, `.git` ve `Claude outputs` taranmadı. Toplam **43 dosyada** eşleşme bulundu; bunların 2'si takip edilmeyen build artifact'i (`tsconfig*.tsbuildinfo`).

**Sınıflar:** A gerçek production kodu · B env fallback'i · C dead/iç kod · D yorum · E test verisi · F dokümantasyon · G migration yorumu · H kullanıcıya görünen metin · I mail fallback'i · J CDN fallback'i · K SEO/canonical/sitemap/robots · L storage/R2

---

## 1. Kod içi `localhost` / eski domain fallback'i var mı?

- **Yok:** `process.env.X || "http://localhost:3000"` gibi bir kod satırı bulunmadı. `localhost` yalnız iki yerde geçiyor: `app/layout.tsx:104` yorumunda ve SSRF engel listesinde (`lib/security/ssrf.ts`, güvenlik kodu, **dokunulmamalı**).
- **Eski domaine giden env fallback'leri — 5 tane:**
  - `next.config.ts:21`, `:25` → `cdn.villayagel.com`, `assets.villayagel.com` (J + B)
  - `app/api/mail/reservation-request/route.ts:214` → `rezervasyon@villayagel.com` (I + B)
  - `app/api/mail/reservation-approved/route.ts:212` → aynı (I + B)
  - `app/api/mail/payment-confirmed/route.ts:221` → aynı (I + B)
- **Eski hosting'e giden env fallback'leri — 6 tane:** `NEXT_PUBLIC_VERCEL_URL` (K + B). Coolify bu değişkeni tanımlamadığı için bugün etkisiz.
  - `lib/seo.ts:27`
  - `app/components/seo/StructuredData.tsx:24`
  - `app/robots.ts:88`
  - `app/sitemap.ts:77`
  - `app/components/search/KiralikVillalarPageBody.tsx:130`
  - `app/components/search/kiralik-villalar-metadata.ts:64`

---

## 2. Tüm bulgular ve sınıflandırma

### 2.1 Çalışan kod (davranışı olan satırlar)

| Dosya:satır | İçerik | Sınıf | Coolify env tanımlıyken etkisi | Temizlik önerisi | Risk |
|---|---|---|---|---|---|
| `next.config.ts:19-26` | `hostFromBase(env, "cdn.villayagel.com")`, `"assets.villayagel.com"` | **J, B, L** | Yok (env build'de tanımlı → fallback kullanılmaz) | Fallback'i kaldır: env yoksa CDN host listesi boş kalsın (CSP ve `cdn.config.ts` ile aynı davranış) | Düşük. Yalnız env build'de eksik olursa `next/image` CDN görsellerini reddeder, bugünkü "yanlış CDN'e izin" durumu yerine |
| `app/api/mail/reservation-request/route.ts:213-215` | `MAIL_ADMIN_NOTIFY_TO \|\| "rezervasyon@villayagel.com"` | **I, B** | Yok (env tanımlı) | Fallback'i kaldır: env boş veya yoksa admin kopyası **atlansın** (mevcut `if (adminNotifyTo)` bloğu zaten bunu destekliyor; yorumdaki niyet de bu) | Düşük. Env tanımlıyken birebir aynı davranış |
| `app/api/mail/reservation-approved/route.ts:211-213` | Aynı | **I, B** | Yok | Aynı | Düşük |
| `app/api/mail/payment-confirmed/route.ts:220-222` | Aynı | **I, B** | Yok | Aynı | Düşük |
| `app/components/layout/FooterWrapper.tsx:181` | `settings?.site_name \|\| "VillayaGel"` | **H, B** | Yalnız DB `site_name` boşsa ya da settings okunamazsa footer/copyright'ta eski marka görünür | Nötr fallback. Öneri: `"Villa Kiralama"` (`app/(public)/layout.tsx`'teki bakım ekranı fallback'iyle aynı) | Düşük; **ama mevcut bir test bu literal'i doğruluyor** (§3) |
| `lib/seo.ts:25-29` ve 5 kopyası | `NEXT_PUBLIC_SITE_URL \|\| NEXT_PUBLIC_VERCEL_URL \|\| ""` | **K, B** | Yok | `NEXT_PUBLIC_VERCEL_URL` kısmını kaldır. Mimari değişiklik yok; yalnız `\|\|` zinciri kısalır | Çok düşük. Env tanımsızken de sonuç aynı (`""`) |
| `lib/db/pg.client.ts:40,80,88,97,99` | `globalThis.__yazVillamPgPool` (pool singleton anahtarı) | **C** (iç tanımlayıcı) | Kullanıcıya görünmez; işlevsel etkisi yok | İsteğe bağlı: `__appPgPool` gibi nötr bir ada çevir. Tek dosya, 5 satır | Çok düşük. Yalnız dev hot-reload sırasında bir kez eski anahtardaki pool sahipsiz kalır; production'da modül tek kez yüklenir |
| `app/lib/mail/client.ts:87` | `\|\| "no-reply@example.com"` | **I, B** | Yok (`RESEND_FROM` veya DB `mail_from` dolu) | Eski marka değil, placeholder. Temizlik kapsamı dışında bırakılabilir | — |
| `lib/i18n/dictionaries/{tr:421,en:407,de:408}` `sharedList.footerNote` | "Maki Dijital — tüm villaları görmek için ana arşivimizi ziyaret edin." | **H** | **Her zaman** `/liste/[token]` sayfasında görünüyor | Karar gerekli (§4) | Düşük (yalnız metin) |
| `app/lib/mail/client.ts:96` ve 17 yerde `cfg.fromName \|\| "Maki Dijital"` / `brandName = "Maki Dijital"` | Mail marka fallback'i | **I, H, B** | Yok (`RESEND_FROM_NAME` veya DB `mail_from_name` dolu) | Karar gerekli (§4) | Düşük |
| `app/(admin)/maki-admin/login/page.tsx` (4 yer), `app/(admin)/maki-admin/layout.tsx:976`, `Footer.tsx:536-559` (`makidijital.com` kredisi) | Ajans imzası | **H** | Bilinçli görünüyor (admin paneli ve "web geliştirme" kredisi) | **Dokunmamayı** öneriyorum; eski site markası değil | — |
| `app/api/geocode/route.ts:41` | User-Agent `https://github.com/villa-kiralama` | **H'ye yakın**, placeholder | Nominatim'e gönderilen kimlik; eski marka değil | Kapsam dışı (ayrı iyileştirme) | — |

### 2.2 Yorumlar ve dokümantasyon (davranışı yok)

| Dosya:satır | İçerik | Sınıf | Öneri |
|---|---|---|---|
| `app/api/mail/reservation-request/route.ts:211` | "default rezervasyon@villayagel.com; boşsa atlanır" (**bugün yanlış**: boş env fallback'e düşüyor) | D | Fallback kaldırılınca yorum doğru hale getirilir |
| `lib/storage/cdn.config.ts:9-10,48,64` | Örnek CDN host'ları `cdn./assets.villayagel.com` | D, L | Nötr örnek (`cdn.<domain>`) ya da env adıyla anlatım |
| `lib/villa-image.helpers.ts:324` | Aynı | D, L | Aynı |
| `app/not-found.tsx:28` | "ÖZEL 404 — VillaYaGel" | D | Markasız başlık |
| `app/components/ui/PageHero.tsx:7` | "YazVillam Signature" | D | Markasız |
| `app/api/cron/{external-calendar-sync,exchange-rates-refresh,mail-logs-cleanup,activity-logs-cleanup}/route.ts` | "Vercel cron schedule / infrastructure / logs" (toplam 12 satır) | D | "Coolify Scheduled Task (Bearer CRON_SECRET)" olarak güncellenir. Kod aynı kalır |
| `lib/cron-auth.ts:4,6` | "Vercel cron Bearer secret" | D | Aynı |
| `lib/rate-limit.ts:31,36,48,189` | "Vercel/proxy `x-forwarded-for`" | D | "Reverse proxy (Coolify/Traefik)". Kod aynı kalır |
| `lib/seo.ts:10-24`, `app/robots.ts:43`, `app/sitemap.ts:62`, `app/layout.tsx:105` | `VERCEL_URL` açıklamaları | D, K | Fallback kaldırılınca yorumlar sadeleşir |
| `app/api/health/route.ts:25`, `app/api/exchange-rates/route.ts:35`, `lib/date-format.ts:111` | Genel "Vercel" anmaları | D | Kozmetik. "Serverless/self-hosted" gibi nötr ifade |
| `.env.example:4,39-43` | "Vercel dashboard", "vercel.json crons" talimatları | F | Coolify env ve Scheduled Tasks'a göre güncellenir (**yalnız yorum satırları**; değerlere dokunulmaz) |
| `README.md:21-36` | create-next-app şablonu, "Deploy on Vercel" | F | Proje README'si ile değiştirilir veya bölüm kaldırılır |
| `docs/coolify-scheduled-tasks.md:3-10,63` | "`vercel.json` olduğu gibi kalabilir" | F | `vercel.json` kaldırılırsa doküman güncellenir |
| `vercel.json` | 4 cron tanımı (Coolify okumuyor) | **C** (dead config) | Kaldırılabilir (§4). **Not:** device kabuğu dosya silemiyor; silme izni ya da sizin silmeniz gerekir |
| `.gitignore:36-37` | `# vercel` / `.vercel` | F (zararsız) | Bırakılabilir |
| `db/migrations/055_fix_short_gaps_refresh_truncate.sql:125` | Yorumdaki `curl https://villayagel.com/api/cron/...` | **G** | **Dokunulmamasını öneriyorum.** Uygulanmış migration dosyası; repo'da checksum'lı bir runner yok ama tarihçe kaydı olarak kalması daha güvenli |

### 2.3 Testler (E)

| Dosya | İçerik | Öneri |
|---|---|---|
| `tests/unit/layout-wrappers-cache-usage.test.tsx:236` | `expect(el.props.siteName).toBe("VillayaGel")`. **Footer fallback literal'ini doğruluyor** | Fallback değişirse **bu beklenti güncellenmek zorunda** (mevcut test değişikliği; onay gerekli) |
| `settings-translation-fallback` (9 satır), `footer-locale` (2), `villa-type-name-locale` (1), `settings-public-payload` (2), `sec05-jsonld-escape:46` | Marka adı yalnız **girdi verisi** olarak kullanılıyor | İsteğe bağlı: nötr bir test adıyla değiştirilebilir. Davranışı test etmiyor; değiştirmemek de güvenli |
| `tests/unit/robots-locale.test.ts:186` | `vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "")` | Fallback kaldırılınca gereksiz ama zararsız; istenirse silinir |
| `tests/unit/sec05-csp-report-only.test.ts:44` | Negatif kontrol (`villayagel|yazvillam` policy'de olmamalı) | **Korunmalı** (temizliğin kilidi) |

### 2.4 Env dosyaları (dokunulmayacak)

| Dosya | İçerik | Sınıf | Not |
|---|---|---|---|
| `.env.local:16-17` (yerel, git'te yok) | `NEXT_PUBLIC_CDN_BASE_*` → `https://cdn.yazvillam.com`, `https://assets.yazvillam.com` | **L, J** | ⚠ **Bu yerel geliştirme CDN değeri.** Yazvillam domaini R2 görsellerini gerçekten servis ediyorsa, "eski domain" olarak kaldırmak görselleri kırar. Env değerlerine dokunmuyorum. Coolify'daki production değerinin ne olduğunu sizin teyit etmeniz gerekir |
| `.env.example` / `.env.local` `NEXT_PUBLIC_SITE_URL=http://localhost:3000` | Yerel geliştirme | B | Doğru, kalmalı |
| `lib/storage/storage.constants.ts` `tatilinyeri-villa-images`, `tatilinyeri-site-assets` | Güncel R2 bucket adları | **L** | **Dokunulmamalı** |

---

## 3. Mevcut testlere etkisi

- **Test değişikliği gerektiren tek temizlik:** `FooterWrapper` fallback'i (`layout-wrappers-cache-usage.test.tsx:236` beklentisi).
- **Test güncellemesi gerektirmeyenler:** CDN ve mail fallback kaldırma, `VERCEL_URL` kaldırma, yorum temizliği. Yine de yeni kilit testleri eklenmesi önerilir:
  - mail: env yoksa admin kopyası gönderilmez; env varsa aynı adrese gönderilir;
  - `next.config`: env yoksa eski host yok;
  - repo genelinde `villayagel` kalıntısı yok.
- `robots-locale.test.ts:186` stub'ı zararsız kalır.

## 4. Karar gerektiren noktalar (uygulamadan önce)

1. **Footer fallback metni:**
   - Öneri: `"Villa Kiralama"` (bakım ekranıyla tutarlı).
   - Alternatif: boş.
   - Bu karar mevcut bir testin beklentisini değiştirmeyi gerektiriyor.
2. **"Maki Dijital":**
   - Admin paneli ve footer ajans kredisi bilinçli görünüyor; dokunmamayı öneriyorum.
   - Public `/liste/[token]` alt metni ("Maki Dijital — …") ve mail marka fallback'leri site markası yerine kullanılıyor gibi. Bunlar nötr metne ya da `site_name`'e çevrilsin mi?
3. **`vercel.json`:** Kaldırılsın mı? Coolify dokümanı "kalabilir" diyor. Kaldırmak için ya device'ta silme izni ya da sizin silmeniz gerekiyor.
4. **Test verisi:** `"VillayaGel"` geçen test fixture'ları nötr bir isme çevrilsin mi (yalnız kozmetik, 5 dosya)?
5. **`__yazVillamPgPool`:** Yeniden adlandırılsın mı (öneri: evet, düşük risk)?
6. **Migration 055 yorumu:** Önerim dokunmamak.

## 5. Güvenli uygulama sırası (onay sonrası)

1. **Yorum ve dokümantasyon temizliği:** Davranış değişmez; `tsc`, ESLint ve testlerle doğrulanır.
2. **`NEXT_PUBLIC_VERCEL_URL` fallback'lerini kaldırma** (6 dosya). Build öncesi/sonrası canonical, sitemap ve robots çıktısı aynı olmalı.
3. **Mail admin fallback'ini kaldırma** (3 route) ve yeni testler.
4. **`next.config.ts` CDN fallback'ini kaldırma.** Build'de `images-manifest` ile `routes-manifest` karşılaştırılır (env tanımlıyken birebir aynı olmalı).
5. **Marka metinleri** (footer fallback, gerekirse `sharedList` ve mail fallback'leri) ve ilgili test güncellemesi.
6. İsteğe bağlı: pg pool anahtarı, test fixture'ları, README ve `vercel.json`.

Her adımda şunlar koşulacak: `tsc`, ESLint, tam test suite, production build (route tablosu değişmemeli), public ve admin runtime regresyonu (Phase 2 ve CSP'de kullanılan betiklerle), son olarak repo genelinde kalıntı taraması.
