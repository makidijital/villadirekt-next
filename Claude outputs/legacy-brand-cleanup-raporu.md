# Eski domain, marka ve hosting kalıntıları: temizlik raporu

**Tarih:** 2026-09-24
**Başlangıç:** Device HEAD `d395a31` (temiz). Cloud kopya, 1141 izlenen dosyada device ile birebir aynıydı; kontrolü blob hash karşılaştırmasıyla yaptım.
**Durum:** Değişiklikler device'a uygulandı ve md5 ile doğrulandı. **Commit, push ve deploy yapılmadı.**
**Dokunulmayanlar:**

- Production DB, R2/storage verisi, Coolify ve env değerleri;
- `.env*` dosyaları;
- migration dosyaları;
- `middleware.ts`;
- SEC-03 ve SEC-05 düzeltme kodları;
- `lib/db/pg.client.ts` (`__yazVillamPgPool`), `lib/storage/storage.constants.ts` (R2 bucket adları) ve `cdn.yazvillam.com` / `assets.yazvillam.com`.

Son üç dosyanın md5'leri önce ve sonra aynı.

Patch: `Claude outputs/patches/legacy-brand-cleanup.patch` (36 dosya, +185 / −132).

---

## 1. Davranışı olan değişiklikler (4 grup)

| # | Dosya | Önce | Sonra | Coolify'da (env tanımlı) etkisi |
|---|---|---|---|---|
| 1 | `next.config.ts` | `hostFromBase(env, "cdn.villayagel.com")`, `"assets.villayagel.com"`: env yoksa ya da geçersizse **eski CDN'e sessizce dönüyordu** | Host **yalnız env'den** geliyor. Env yoksa veya geçersizse o CDN host'u `remotePatterns`'a **eklenmiyor** ve build/start sırasında `console.warn` basılıyor. `cdn.config.ts` ve CSP de aynı kuralı izliyor | **Yok.** `images-manifest.json` ve `routes-manifest.json` (CSP header'ları) env tanımlı build'de **birebir aynı** (dosya karşılaştırması) |
| 2 | `app/api/mail/{reservation-request, reservation-approved, payment-confirmed}/route.ts` | `MAIL_ADMIN_NOTIFY_TO \|\| "rezervasyon@villayagel.com"`: env yok veya boşsa **eski adrese gidiyordu** | `(process.env.MAIL_ADMIN_NOTIFY_TO \|\| "").trim()`. Boşsa mevcut `if (adminNotifyTo)` bloğu gönderimi atlıyor ve `console.warn("[mail.<tür>.admin] SKIPPED — …")` yazılıyor | **Yok.** Env tanımlıyken aynı adrese, aynı akışla gönderiliyor. Müşteri maili, `mail_logs` ve status güncellemesi değişmedi |
| 3 | `lib/seo.ts`, `app/components/seo/StructuredData.tsx`, `app/robots.ts`, `app/sitemap.ts`, `app/components/search/KiralikVillalarPageBody.tsx`, `app/components/search/kiralik-villalar-metadata.ts` | `NEXT_PUBLIC_SITE_URL \|\| NEXT_PUBLIC_VERCEL_URL \|\| ""` | `NEXT_PUBLIC_SITE_URL \|\| ""` (her dosyada yalnız bir satır silindi) | **Yok.** Coolify `NEXT_PUBLIC_VERCEL_URL` tanımlamıyor; sonuç aynı |
| 4 | `app/components/layout/FooterWrapper.tsx:181` | `settings?.site_name \|\| "VillayaGel"` | `settings?.site_name \|\| "Villa Kiralama"` (`HomePageBody` ve `WhyUsSection` ile aynı fallback) | **Yok.** `site_name` doluysa aynen kullanılıyor; fallback yalnız settings okunamazsa devreye giriyor |

`tatilinyeri.com` kodun hiçbir yerine yazılmadı. Site domaini `NEXT_PUBLIC_SITE_URL`, CDN domainleri `NEXT_PUBLIC_CDN_BASE_*` üzerinden gelmeye devam ediyor.

**Env yoksa yeni davranış (doğrulandı, `next.config.ts` production modunda çalıştırıldı):**

| Durum | Sonuç |
|---|---|
| CDN env'leri yok | 2 uyarı basılıyor; `remotePatterns` = `["**.supabase.co"]`; CSP `img-src`'de eski domain yok |
| CDN env'leri var | `["**.supabase.co", "<env host 1>", "<env host 2>"]` |
| CDN env'i şemasız (`cdn.x.example`) | Uyarı basılıyor, host eklenmiyor. Eskiden bu durumda villayagel'e dönülüyordu; `cdn.config.ts` şemasız değerle zaten çalışmadığı için production'da geçerli bir senaryo değil |

## 2. Yalnız yorum ve dokümantasyon değişiklikleri (davranış yok)

TypeScript yorumları atılarak derlendi; **14 dosyanın derlenmiş kodu birebir aynı** çıktı (`CODE IDENTICAL`).

| Dosya | Değişiklik |
|---|---|
| `app/api/cron/{external-calendar-sync, exchange-rates-refresh, mail-logs-cleanup, activity-logs-cleanup}/route.ts` | "Vercel cron schedule / infrastructure / logs" → "Coolify Scheduled Task / zamanlanmış görev / uygulama log'ları". **Route kodu ve zamanlamalar değişmedi** |
| `lib/cron-auth.ts` | Başlık ve açıklamada "Vercel cron" → "zamanlanmış görev (Coolify Scheduled Task)" |
| `lib/rate-limit.ts`, `app/api/health/route.ts`, `app/api/exchange-rates/route.ts`, `lib/date-format.ts` | "Vercel" anmaları → reverse proxy / Coolify / edge runtime |
| `lib/seo.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx` | `VERCEL_URL` açıklamaları kaldırıldı; "build anında da tanımlı olmalı" notu eklendi |
| `lib/storage/cdn.config.ts`, `lib/villa-image.helpers.ts` | Yorumdaki örnek host'lar (`cdn./assets.villayagel.com`) → `NEXT_PUBLIC_CDN_BASE_*`. **Kod değişmedi (kanıtlı); R2 mantığına dokunulmadı** |
| `app/not-found.tsx`, `app/components/ui/PageHero.tsx` | Başlık yorumlarındaki "VillaYaGel" ve "YazVillam" kaldırıldı |
| `app/api/mail/reservation-request/route.ts` | Yanlış yorum ("default rezervasyon@villayagel.com; boşsa atlanır") düzeltildi (artık gerçekten atlanıyor) |
| `README.md` | "Deploy on Vercel" bölümü → kısa "Deploy: Coolify" notu |
| `docs/coolify-scheduled-tasks.md` | "`vercel.json` kalabilir" notu güncellendi; zamanlamalar zaten dokümanın kendi tablolarında duruyor |

## 3. `vercel.json` kaldırıldı

**Silmeden önce doğrulandı:**

- Uygulama kodu, `package.json` script'leri ve `next.config.ts` bu dosyayı **okumuyor** (grep; tek referans dosyanın kendi `$schema` satırı).
- Next.js `vercel.json` okumuyor. Repoda Coolify/Nixpacks/Docker yapılandırması yok; Coolify bu dosyayı kullanmıyor.
- İçindeki 4 cron zamanlaması `docs/coolify-scheduled-tasks.md` içinde birebir kayıtlı (`0 */4 * * *`, `0 6 * * *`, `0 3 * * *`, `30 3 * * *`).

Device'ta dosya silmek için bir kerelik izin istendi ve verildi; yalnız bu dosya silindi.

## 4. Testler

| Dosya | Değişiklik | Neden |
|---|---|---|
| `tests/unit/layout-wrappers-cache-usage.test.tsx:236` | Beklenti `"VillayaGel"` → `"Villa Kiralama"` | Bu satır footer fallback'ini doğrulayan bir **davranış** beklentisiydi; fallback bilinçli olarak değişti. Testin amacı ("settings reject olursa fallback korunur") aynı |
| `settings-translation-fallback` (9), `footer-locale` (2), `villa-type-name-locale` (1), `settings-public-payload` (2), `sec05-jsonld-escape` (1) | Fixture adı `VillayaGel` / `VillaYaGel` → `Tatilin Yeri` | Yalnız test verisi; test amaçları aynı |
| `tests/unit/sec05-csp-report-only.test.ts` | "remotePatterns aynen korunur" testi iki teste bölündü. (a) env yoksa yalnız legacy pattern var, `villayagel` yok. (b) env varsa CDN host'ları env'den ekleniyor (`vi.stubEnv` ile) | Eski test (`length >= 2`) **yalnız villayagel fallback'i sayesinde geçiyordu**; fallback kaldırılınca amaca uygun hale getirildi. SEC-05 kodu değişmedi |
| `tests/unit/legacy-brand-cleanup.test.ts` (**yeni**, 4 test) | Mail alıcısı yalnız env'den; `next.config` eski domain içermiyor; site URL'inde `VERCEL_URL` yok; footer fallback nötr | Regresyon kilidi |

## 5. Doğrulama sonuçları

| Kontrol | Önce | Sonra |
|---|---|---|
| TypeScript | 0 hata | **0 hata** (cloud + device) |
| ESLint | 0 hata / 195 uyarı | **0 hata / 195 uyarı** (uyarı listesi birebir aynı) |
| Tam test suite | 191 dosya / 3751 test ✓ | **192 dosya / 3756 test ✓** (+4 yeni, +1 bölünen CSP testi). stderr gürültüsü aynı (59 / 59) |
| İlgili testler (device) | — | **14 dosya / 237 test ✓** (SEC-01/03/05 dahil) |
| Production build | exit 0, 46/46 static | **exit 0, 46/46 static**. Build log'unda `[next.config]` uyarısı yok (CDN env tanımlı) |
| Route tablosu | 190 satır | **Birebir aynı** (`diff` boş). Static/ISR durumları değişmedi |
| `images-manifest.json` | — | **Birebir aynı** |
| `routes-manifest.json` (headers, redirects, rewrites) | — | **Birebir aynı** (CSP dahil) |
| Runtime regresyonu (25 sayfa + SPA, test verisi dolu) | CSP fazı sonuçları | **0 fark:** 20 ölçüm alanında (script'ler, GTM/`dataLayer`, beacon, doğrulama meta'ları, JSON-LD, harita iframe'i, formlar, CSP ihlalleri, sayfa içeriği, admin sayfaları) |

## 6. Final tarama (`villayagel | villa ya gel | yazvillam | yaz villam | vercel`)

Kalan eşleşmelerin **hepsi bilinçli**:

| Yer | Neden kaldı |
|---|---|
| `lib/db/pg.client.ts` (`__yazVillamPgPool`, 5 satır) | Talimat: internal isimlere dokunulmayacak |
| `db/migrations/055_…sql:125` (yorumdaki eski cron URL'i) | Uygulanmış migration dosyası; dokunulmadı |
| `tests/unit/sec05-csp-report-only.test.ts:44,138`, `tests/unit/legacy-brand-cleanup.test.ts` | Kalıntının **olmadığını** doğrulayan negatif testler |
| `tests/unit/robots-locale.test.ts:186` (`vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "")`) | Mevcut test; artık etkisiz ama zararsız. Fixture değil, test mantığı olduğu için dokunulmadı |
| `README.md:21,30` | Next.js/Geist'e ait upstream linkler (`github.com/vercel/next.js`), hosting değil |
| `.gitignore:36-37` (`.vercel`) | Zararsız ignore kuralı |
| `docs/coolify-scheduled-tasks.md:4` | `vercel.json`'un neden kaldırıldığını açıklayan cümle |

`VillayaGel` / `Villaya Gel` çalışan kodda ve testlerde artık yok. `cdn.yazvillam.com` / `assets.yazvillam.com` yalnız device'taki `.env.local` dosyasında duruyor; talimat gereği dokunulmadı.

## 7. Bilerek değiştirilmeyenler

- **"Maki Dijital":** Admin paneli, footer ajans kredisi ve `makidijital.com` linki (bilinçli kredi); `/liste/[token]` alt metni (talimat gereği).
- **Mail brand fallback'leri** (`cfg.fromName || "Maki Dijital"`, `no-reply@example.com`): VillayaGel ile ilişkili değiller; env veya DB ayarı doluyken kullanılmıyorlar. Değiştirmek gönderici davranışını etkileyebileceği için ayrı bir karar olarak bırakıldı.
- **`.env.example` içindeki "Vercel dashboard" yorumları:** Dosya git'te izlenmiyor ve bir env dosyası; talimat gereği dokunulmadı. İsterseniz yorum satırlarını elle güncelleyebilirsiniz.
- **Cron route kodları ve Coolify cron sistemi:** Yalnız yorumlar değişti.

## 8. Device durumu

```
HEAD: d395a31 (değişmedi)
 M 34 dosya (yukarıdaki listeler)
 D vercel.json
?? tests/unit/legacy-brand-cleanup.test.ts
```

- 35 değişen dosyanın md5 özeti cloud ile aynı: `85e28f1c…`.
- `pg.client.ts`, `storage.constants.ts` ve `middleware.ts` md5'leri değişmedi.
- **Commit, push ve deploy yapılmadı.**
