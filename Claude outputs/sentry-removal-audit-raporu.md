# SENTRY'Yİ TAMAMEN KALDIRMA — GÜVENLİ ANALİZ + İZOLE TEST RAPORU

**Tarih:** 21 Eylül 2026
**Faz:** Sentry removal — audit + izole deneme
**Gerçek repo durumu:** ⚠️ **KOD DEĞİŞİKLİĞİ YAPILMADI.** `git status` faz öncesiyle birebir aynı.
**İzole deneme dizini:** repo dışında, kendi `node_modules`'ü ile (kullanıcı klasörüne hiç yazılmadı)
**Sonuç:** ✅ **GÜVENLİ — onayınız bekleniyor**

---

## 0. YÖNETİCİ ÖZETİ

| Kontrol | Sonuç |
|---|---|
| `npm install` (Sentry'siz) | ✅ 748 paket, 20s, hata yok |
| `npx tsc --noEmit` | ✅ **0 hata** |
| `npx eslint .` | ✅ **0 hata / 199 uyarı** (baseline 200 → −1, sadece silinen dosyanınki) |
| Test suite | ✅ **3.138 / 3.138 PASS**, 170 test dosyası, **0 failure** |
| Production build | ✅ başarılı; route tablosu baseline ile **BİREBİR AYNI** (196 satır, diff yok) |
| Production start + smoke | ✅ tüm route'lar 200/307/404 beklendiği gibi; API sözleşmeleri **byte-identical** |
| Client bundle'da kalan "sentry" izi | ✅ **0** (baseline: 448 eşleşme) |
| Ana sayfa JS kazancı | **−233.052 B ham (−%17,6) / −77.938 B gzip (−%19,4)** |
| `node_modules` | 518 → 480 paket (−38), **1,1 GB → 843 MB (−257 MB)** |
| Tespit edilen regresyon | **YOK** (1 adet bilinçli gözlemlenebilirlik kaybı var — bkz. K) |

---

## A) SENTRY'NİN PROJEDEKİ TÜM KULLANIM NOKTALARI

### A.1 Sentry'ye ADANMIŞ dosyalar (5 adet)

| Dosya | Boyut | İçerik |
|---|---|---|
| `instrumentation.ts` | 1.757 B | `register()` → runtime'a göre server/edge config import; `export const onRequestError = Sentry.captureRequestError` |
| `instrumentation-client.ts` | 3.641 B | `Sentry.init({...})` (client); `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`; ayrıca **geçici diagnostic `console.log`** (dosyanın kendi yorumunda "çözüm sonrası geri çıkarılmalı" yazıyor) |
| `sentry.server.config.ts` | 2.712 B | `Sentry.init` (Node runtime) + `ignoreErrors` + `beforeSend` |
| `sentry.edge.config.ts` | 980 B | `Sentry.init` (edge runtime) |
| `sentry.client.config.ts` | 925 B | **ZATEN NO-OP** — gövdesi sadece `export {}`; yorumunda "sandbox rm izni engelledi, silinebilir" yazıyor |

### A.2 Uygulama kodundaki GERÇEK çağrılar (3 dosya, 5 çağrı)

| Dosya | Satır | Çağrı | Bağlam |
|---|---|---|---|
| `app/api/admin/reservations/[id]/route.ts` | 2 | `import * as Sentry from "@sentry/nextjs"` | |
| " | 63 | `Sentry.captureException` | GET `catch` bloğu |
| " | 111 | `Sentry.captureException` | PATCH `catch` bloğu |
| " | 148 | `Sentry.captureException` | DELETE `catch` bloğu |
| `app/api/public/reservations/route.ts` | 2 | `import * as Sentry` | |
| " | 195 | `Sentry.captureException` | POST `catch` bloğu |
| `app/lib/mail/send.ts` | 10 | `import * as Sentry` | |
| " | 120 | `Sentry.captureMessage("mail.send.failed")` | `if (!result.ok)` bloğu |

**Kritik tespit:** 5 çağrının tamamı **saf yan etki (side-effect) ifadesidir.**
Hiçbiri `await` edilmiyor, dönüş değeri kullanılmıyor, koşul/akış içinde değil.
Hepsinin hemen öncesinde zaten bir `console.error` / `console.log` var ve hemen ardından
gelen `return NextResponse.json(...)` **değişmiyor**. → Kaldırılmaları API davranışını
değiştiremez.

### A.3 Sadece YORUM olarak geçen dosyalar (kod yok — 5 dosya)

`app/api/cron/external-calendar-sync/route.ts:30`, `app/api/cron/mail-logs-cleanup/route.ts:30`,
`app/components/reservation/ReservationForm.tsx:499`,
`app/services/reservation/_helpers/commission.ts:74`, `lib/rate-limit.ts:254`

Bunlar yalnızca açıklama metni. Fonksiyonel etkileri **sıfır**.

### A.4 ARANIP BULUNAMAYANLAR (negatif bulgular — hepsi doğrulandı)

| Aranan | Sonuç |
|---|---|
| `withSentryConfig` | ❌ **YOK** — `next.config.ts` Sentry ile sarılmamış |
| Source map upload / `sentryWebpackPluginOptions` | ❌ **YOK** |
| Webpack/Turbopack özel Sentry config | ❌ **YOK** |
| `app/error.tsx` | ❌ **PROJEDE HİÇ YOK** |
| `app/global-error.tsx` | ❌ **PROJEDE HİÇ YOK** |
| `browserTracingIntegration` / `replayIntegration` | ❌ **YOK** (tracesSampleRate=0, replay=0) |
| `middleware.ts` içinde Sentry | ❌ **YOK** |
| `vercel.json` içinde Sentry | ❌ **YOK** |
| Sentry'den bahseden TEST | ❌ **HİÇBİRİ YOK** (`grep -rniI sentry tests` → 0 sonuç) |
| Sentry dosyalarını okuyan/AST'leyen TEST | ❌ **HİÇBİRİ YOK** — testlerin okuduğu 120+ kaynak yolunun hiçbiri bu dosyalar değil |

### A.5 Environment variable

Tek değişken: **`NEXT_PUBLIC_SENTRY_DSN`**

- `.env.example:33` → `NEXT_PUBLIC_SENTRY_DSN=` (**BOŞ**)
- `.env.local:22` → satır **`#` ile yorumlanmış (KAPALI)**

→ Yerel/örnek ortamda Sentry **zaten no-op** çalışıyor. Bu, "Sentry aktif kullanılmıyor"
tespitinizi doğruluyor.

> ⚠️ **DOĞRULANAMADI:** Vercel production ortamında bu değişkenin set edilip edilmediğini
> buradan göremiyorum. Eğer production'da DSN doluysa Sentry ORADA aktif çalışıyordur ve
> kaldırma, üretimdeki hata görünürlüğünü kapatır. **Uygulamadan önce Vercel → Settings →
> Environment Variables'ta `NEXT_PUBLIC_SENTRY_DSN` kontrol edilmelidir.**

---

## B) SENTRY KALDIRILINCA DEĞİŞMESİ GEREKEN DOSYALAR (6 + lock)

| # | Dosya | Değişiklik | Silinen satır |
|---|---|---|---|
| 1 | `app/api/public/reservations/route.ts` | import + 1 `captureException` + dangling yorum | 8 |
| 2 | `app/api/admin/reservations/[id]/route.ts` | import + 3 `captureException` | 13 |
| 3 | `app/lib/mail/send.ts` | import + `if (!result.ok) { captureMessage }` bloğu + yorum | 23 |
| 4 | `package.json` | `@sentry/nextjs` dependency | 1 |
| 5 | `.env.example` | `NEXT_PUBLIC_SENTRY_DSN` + yorumları | 5 |
| 6 | `.env.local` | Sentry yorum/DSN satırları | 3 |
| 7 | `package-lock.json` | `npm install` otomatik günceller (98 `@sentry` girdisi → 0) | — |

**İsteğe bağlı kozmetik (fonksiyonel etkisi YOK, izole denemede yapılmadı):**
A.3'teki 5 dosyadaki artık geçersiz Sentry yorumlarının güncellenmesi.

---

## C) SİLİNEBİLECEK DOSYALAR (5 adet — tamamı Sentry'ye adanmış)

```
instrumentation.ts
instrumentation-client.ts
sentry.server.config.ts
sentry.edge.config.ts
sentry.client.config.ts        (zaten no-op: gövdesi `export {}`)
```

**Not — `instrumentation.ts` hakkında:** Bu dosya Next.js'in genel bir hook'udur, ama bu
projede **yalnızca Sentry için** kullanılıyor (başka hiçbir içeriği yok). Next.js, dosya
yoksa hook'u hiç çağırmaz → build/runtime etkilenmez. İleride Sentry dışı bir
instrumentation gerekirse dosya yeniden oluşturulabilir.

**Not — silme izni:** Bu dizin salt-silme kısıtlı bir mount üzerinde; uygulama aşamasında
`rm` "Operation not permitted" verirse size ayrıca silme izni isteyeceğim
(ya da dosyaları `_to_delete/` altına taşıyıp size bildireceğim).

---

## D) KALDIRILACAK PACKAGE / DEPENDENCY

**package.json'da tek doğrudan bağımlılık:**

```json
"@sentry/nextjs": "^10.51.0"
```

Bu paket transitively **20 alt paket** getiriyor (`node_modules/@sentry/` altında):
`babel-plugin-component-annotate, browser, browser-utils, bundler-plugin-core, cli,
cli-darwin, cli-linux-arm64, conventions, core, feedback, nextjs, node, node-core,
opentelemetry, react, replay, replay-canvas, server-utils, vercel-edge, webpack-plugin`

**Ölçülen etki:**

| | Önce | Sonra | Fark |
|---|---|---|---|
| `node_modules` paket sayısı | 518 | 480 | **−38** |
| `node_modules` boyutu | 1,1 GB | 843 MB | **−257 MB** |
| `node_modules/@sentry` | 97 MB | yok | **−97 MB** |
| `package-lock.json` `@sentry` girdisi | 98 | **0** | −98 |

---

## E) GEREKSİZ HALE GELEN ENVIRONMENT VARIABLE

| Değişken | Durum |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Tek Sentry değişkeni. Kaldırılabilir. |

Başka `SENTRY_*` / `NEXT_PUBLIC_SENTRY_*` değişkeni **yok**
(`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` hiç kullanılmamış — zaten source map
upload kurulmamış).

Uygulanırsa Vercel'de de silinmeli: **Production / Preview / Development** ortamlarından
`NEXT_PUBLIC_SENTRY_DSN`.

---

## F) İZOLE KALDIRMA SONRASI BUILD SONUCU

```
npx next build --webpack        → exit 0, 1m10.3s
```

- Hata: **0**. "Failed to compile" / "Type error": **yok**.
- Build log'unda `sentry` veya `instrumentation` geçen **tek bir uyarı bile yok**.
- **Route tablosu baseline ile BİREBİR AYNI:** 196 satır, `diff` → **boş (IDENTICAL)**.
  Yani hiçbir route tipi (`○ Static` / `ƒ Dynamic`), revalidate veya expire değeri değişmedi.

> Kıyas için baseline build (Sentry'li, aynı makine/aynı bayraklar): 1m49.6s.
> Build süresi ölçümü kontrollü bir benchmark değildir (cache durumu farklı olabilir),
> **yalnız gösterge** olarak verilmiştir.

### F.2 Production start + route smoke testi

`npx next start` ile gerçek HTTP istekleri (her iki sürümde de):

| Route | Baseline | Sentry'siz |
|---|---|---|
| `/` | 200 | 200 |
| `/arama` | 200 | 200 |
| `/kiralik-villalar` | 200 | 200 |
| `/teklif-al` | 200 | 200 |
| `/iletisim` | 200 | 200 |
| `/rezervasyon-kontrol` | 200 | 200 |
| `/favoriler` | 200 | 200 |
| `/blog` | 200 | 200 |
| `/maki-admin` | 307 → `/maki-admin/login?redirect=%2Fmaki-admin` | **aynı** |
| `/maki-admin/login` | 200, 18.611 B | **200, 18.611 B** |
| `/bu-sayfa-yok-404` | — | 404 |

**Admin login HTML karşılaştırması:** build-hash'leri normalize edildikten sonra
render edilen markup **birebir aynı**; tek fark chunk dosya adları (`7149-` → `3794-`)
ve build ID. Yani middleware + auth redirect + login sayfası **değişmedi**.

**API sözleşmeleri (Sentry çağrısının kaldırıldığı yollar dahil):**

| İstek | Baseline | Sentry'siz |
|---|---|---|
| `POST /api/public/reservations` `{}` | `{"ok":false,"error":"Villa zorunlu"}` **[400]** | **BİREBİR AYNI** |
| `GET /api/admin/reservations/abc` | `{"ok":false,"error":"Oturum bulunamadı"}` **[401]** | **BİREBİR AYNI** |
| `GET /api/health` | `{"ok":true,...}` **[200]** | **BİREBİR AYNI** |

→ Authorization (401) ve validation (400) davranışları **korunmuştur**.

Server log'unda `TypeError` / `ReferenceError` / `MODULE_NOT_FOUND` / `unhandled`: **YOK**.

> ⚠️ **DOĞRULANAMADI:** Bu VM'den PostgreSQL'e erişim yok
> (`aws-0-eu-west-1.pooler.supabase.com` → `EAI_AGAIN`). Bu nedenle **DB'ye bağlı
> senaryolar runtime olarak çalıştırılamadı:** admin dashboard içi, villa oluşturma /
> düzenleme, rezervasyon oluşturma / düzenleme, `/rezervasyon/[slug]`, gerçek admin
> login. Bu akışların kod yolları **tests suite tarafından** kapsanıyor (3.138 test PASS)
> ve hiçbiri Sentry'ye dokunmuyor; ama gerçek DB ile uçtan uca smoke **yapılamadı**.

---

## G) TYPESCRIPT SONUCU

```
npx tsc --noEmit     → exit 0, 16.9s
error TS sayısı: 0
```

✅ **0 hata.** Baseline ile aynı (baseline de 0).

---

## H) ESLINT SONUCU

```
npx eslint .         → exit 0, 26.7s
✖ 199 problems (0 errors, 199 warnings)
```

Baseline: `✖ 200 problems (0 errors, 200 warnings)`

**Uyarı-uyarı birebir diff yapıldı:**

```
ONLY IN BASELINE (kaybolan):
  instrumentation-client.ts:8:1   'no-console'      ← silinen dosyanın kendi uyarısı

ONLY IN SENTRY-REMOVED (yeni/regresyon):
  NONE ✅
```

Kural bazında dağılım **tamamen aynı**
(`no-explicit-any` 67, `prefer-const` 23, `no-unescaped-entities` 18,
`no-unused-vars` 14, `exhaustive-deps` 10, `no-img-element` 2).

✅ **Tek bir yeni lint problemi bile oluşmadı.**

---

## I) TEST SONUCU

170 test dosyası, 6 parçada çalıştırıldı (her parça ayrı `vitest run`):

| Parça | Test dosyası | Test |
|---|---|---|
| 1 | 30 | 455 ✅ |
| 2 | 30 | 825 ✅ |
| 3 | 30 | 560 ✅ |
| 4 | 30 | 417 ✅ |
| 5 | 30 | 552 ✅ |
| 6 | 20 | 329 ✅ |
| **TOPLAM** | **170** | **3.138 PASS / 0 FAIL** |

✅ **Baseline 3.138 / 3.138 birebir korundu. Yeni failure = 0.**

**Test kurallarına uyum:** Hiçbir test silinmedi, `skip` / `todo` / `only` eklenmedi,
hiçbir assertion gevşetilmedi, `toBeTruthy` / `toBeDefined` eklenmedi, hiçbir güvenlik
testi kaldırılmadı. `tests/` dizini izole kopyada **hiç değiştirilmedi** (diff: 0 dosya).

---

## J) BUNDLE BOYUTU ÖNCE / SONRA

Ölçüm: `next start` ile servis edilen **gerçek HTML**'den `<script src>` **+**
`<link rel=preload href>` chunk kümesinin birleşimi, diskteki gerçek dosya boyutları.

| Route | Baseline | Sentry'siz | Fark | % |
|---|---:|---:|---:|---:|
| `/` | 1.318.894 | 1.085.842 | **−233.052** | −17,6% |
| `/kiralik-villalar` | 1.067.602 | 834.552 | **−233.050** | −21,8% |
| `/iletisim` | 1.075.303 | 842.255 | **−233.048** | −21,6% |
| `/rezervasyon-kontrol` | 1.082.206 | 849.156 | **−233.050** | −21,5% |
| `/favoriler` | 1.079.555 | 846.505 | **−233.050** | −21,5% |
| `/teklif-al` | 1.245.397 | 1.062.136 | **−183.261** | −14,7% |
| `/blog` | 1.019.146 | 835.885 | **−183.261** | −17,9% |
| `/arama` | 1.067.602 | 560.057 | (−507.545) | ⚠️ *güvenilmez* |

> ⚠️ `/arama` satırı **kıyaslanabilir değildir**: Sentry'siz build'de bu dinamik route'un
> chunk'ları `<script>` etiketi yerine RSC flight payload'ı üzerinden geliyor
> (18 script → 5 script). Sayfa içeriği birebir aynı render oluyor
> (aynı "villa" sayısı, aynı 2 datepicker wrapper, aynı filtre bloğu), ama ölçüm yöntemi
> bu route için eksik sayıyor. **Gerçek kazanç diğer route'lardaki ~233 KB civarındadır.**

### J.2 Nereden geliyor — chunk düzeyinde kanıt

Ana sayfa chunk'ları, öncesi/sonrası:

| Baseline | Sentry'siz |
|---|---|
| `7149-….js` = **483.004 B**, içinde `sentry` **159 eşleşme** | `3794-….js` = **241.017 B**, `sentry` **0 eşleşme** |
| `4bd1b696-….js` 201.060 B | **aynı dosya, aynı hash** |
| `3563-….js` 122.832 B | **aynı** |
| `polyfills-….js` 112.594 B | **aynı** |
| `13633bf0-….js` 108.728 B (react-datepicker) | **aynı** |
| `8853-….js` 72.561 B | **aynı** |

→ Tek değişen chunk vendor chunk'ı: **483.004 → 241.017 B (−241.987 B)**.
Diğer tüm chunk'lar **hash düzeyinde bile aynı** → hiçbir başka kod etkilenmedi.

### J.3 Gzip

| | Baseline | Sentry'siz | Fark |
|---|---:|---:|---:|
| Ana sayfa toplam (gzip -9) | 402.577 B | 324.639 B | **−77.938 B (−19,4%)** |

### J.4 Client bundle'da kalan Sentry izi

```
baseline  .next/static/chunks/ içinde "sentry" geçen yer sayısı : 448
sentry'siz                                                       :   0  ✅
```

> ⚠️ **ORTAM UYARISI:** Tüm build/bundle ölçümleri `next build --webpack` ile,
> Google Fonts mock'lanarak ve DB erişimi olmadan yapılmıştır. Production **Turbopack**
> kullanıyor; Turbopack'te chunk bölünmesi ve dolayısıyla mutlak rakamlar farklı olabilir.
> Bunlar **production ölçümü değildir**; oransal sonuç (Sentry ≈ ana sayfa JS'inin %18–22'si)
> büyük olasılıkla benzer kalır ama **doğrulanmamıştır**.

---

## K) RUNTIME / REGRESSION TESPİTİ

### ✅ Tespit edilen regresyon: **YOK**

- TypeScript: 0 hata
- ESLint: 0 yeni problem
- Test: 0 yeni failure (3.138/3.138)
- Build: 0 hata, route tablosu birebir aynı
- Runtime: tüm smoke route'ları aynı HTTP kodu, aynı gövde; server log'unda hata yok
- API sözleşmeleri: byte-identical
- Admin auth redirect + login sayfası: birebir aynı

### ⚠️ Bilinçli DAVRANIŞ KAYBI (bug değil, gözlemlenebilirlik kaybı) — 3 kalem

Bunlar "bozulma" değil; Sentry'nin **zaten yaptığı işin** ortadan kalkmasıdır. DSN boş
olduğu sürece bugün de hiçbiri çalışmıyor — ama production'da DSN doluysa **kaybedilir**:

1. **`app/lib/mail/send.ts` — mail gönderim hatası alarmı.**
   `Sentry.captureMessage("mail.send.failed")` kalkıyor. Bu, kodun kendi yorumuna göre
   "müşteri mail almıyor" sessiz hata modunu ops'a duyuran tek sinyaldi.
   `mail_logs` tablosuna `status: "failed"` yazımı **devam ediyor** ve `result` caller'a
   dönüyor — yani veri kaybı yok, sadece **push alarm** yok.
   👉 **Önerim:** Uygulama sırasında yerine tek satır
   `console.error("[mail] send FAILED", { mailType, status, error })` koyalım —
   Vercel log'larında görünür kalır. *(İzole denemede bu EKLENMEDİ; saf kaldırma ölçüldü.)*

2. **`instrumentation.ts > onRequestError` — yakalanmamış route/RSC hataları.**
   Kalkıyor. Ancak tüm API route'ları zaten `try/catch` + `console.error` ile sarılı;
   Vercel Functions log'ları bu hataları göstermeye devam eder.

3. **`instrumentation-client.ts` — client hata yakalama + router transition hataları.**
   Kalkıyor. Proje `app/error.tsx` veya `app/global-error.tsx` **kullanmadığı için**,
   client hata davranışı Next.js'in kendi varsayılanına **zaten** bırakılmış durumda ve
   bu **değişmiyor**.
   ➕ **Bonus:** Bu dosyadaki geçici `console.log("[instrumentation-client] LOADED", ...)`
   probe'u da kalkıyor — her ziyaretçinin tarayıcı konsoluna düşen gereksiz log gider.

### 📌 Uygulamadan önce kontrol edilmesi gereken tek şey

**Vercel'de `NEXT_PUBLIC_SENTRY_DSN` dolu mu?**
- **Boş/yoksa** → Sentry production'da da no-op; kaldırma **hiçbir şey kaybettirmez**.
- **Doluysa** → yukarıdaki 3 kalem gerçekten kaybedilir; kaldırma yine güvenli ama
  bilinçli bir "monitoring'i kapatma" kararı olur.

---

## L) SENTRY'Yİ TAMAMEN KALDIRMAK GÜVENLİ Mİ?

# ✅ EVET — GÜVENLİ

**Gerekçeler (hepsi ölçümle kanıtlı):**

1. **Yüzey alanı çok küçük ve tamamen izole.** Sadece 5 adanmış dosya + 3 dosyada 5 saf
   yan-etki çağrısı. Sentry hiçbir iş mantığına, veri akışına veya kontrol akışına girmiyor.
2. **Build sistemine sıfır bağ.** `withSentryConfig` **yok**, source map upload **yok**,
   özel webpack config **yok**. Kaldırma build pipeline'ına dokunmuyor — kanıt: route
   tablosu **birebir aynı**.
3. **Hiçbir test Sentry'yi bilmiyor.** `tests/` dizini hiç değiştirilmedi ve
   **3.138/3.138** yeşil kaldı.
4. **API/auth sözleşmeleri byte-identical.** 400/401/200 gövdeleri ve admin redirect aynı.
5. **Yasaklı alanların hiçbirine dokunulmadı:** Server Action authorization, admin
   permission enforcement, auth sistemi, PII-safe reservation mimarisi, PostgreSQL,
   R2, rezervasyon/villa iş mantığı, price engine, availability, migration sistemi,
   API endpoint davranışları — **hepsi bitsel olarak değişmedi** (diff'te bu dosyaların
   hiçbiri yok).
6. **Somut kazanç:** ana sayfada −233 KB ham / −78 KB gzip, `node_modules`'te −257 MB,
   −38 paket, client bundle'da Sentry izi sıfır.

**Tek şartlı nokta:** Vercel'deki `NEXT_PUBLIC_SENTRY_DSN` durumu (bkz. K).

---

## UYGULAMA PLANI — ONAYINIZI BEKLİYORUM

Onay verirseniz gerçek repoda **tam olarak şunu** yapacağım (fazlası değil):

1. Sil: `instrumentation.ts`, `instrumentation-client.ts`, `sentry.client.config.ts`,
   `sentry.server.config.ts`, `sentry.edge.config.ts`
2. `app/api/public/reservations/route.ts` — import + 1 çağrı + dangling yorum
3. `app/api/admin/reservations/[id]/route.ts` — import + 3 çağrı
4. `app/lib/mail/send.ts` — import + `captureMessage` bloğu
   *(+ isterseniz yerine 1 satır `console.error` — söyleyin)*
5. `package.json` — `@sentry/nextjs` çıkar; `npm install` ile lock güncelle
6. `.env.example` / `.env.local` — `NEXT_PUBLIC_SENTRY_DSN` satırları
7. Doğrulama: `tsc` → `eslint` → 3.138 test → build
8. **Commit / push YAPMAM** — siz söyleyene kadar.

Ayrıca sizin tarafınızda: Vercel → Environment Variables → `NEXT_PUBLIC_SENTRY_DSN` silinmeli.

---

## EK — İZOLE DENEMENİN GERÇEK REPOYA ETKİSİ

```
$ git status --short          (faz öncesi ile BİREBİR AYNI)
 M lib/availability.action.ts            ← önceki fazlardan, bu fazla ilgisiz
 M lib/external-calendar.admin.action.ts ← önceki fazlardan, bu fazla ilgisiz
?? Claude outputs/…                       ← raporlar
```

İzole deneme repo **dışında** ayrı bir dizinde, **kendi `node_modules`'ü** ile yapıldı.
Kullanıcı klasörüne yazılan tek şey bu rapor dosyasıdır. (`.next` build artefaktı
`.gitignore` kapsamındadır ve kaynak kodu değişmemiştir.)

### Değişiklik yüzeyi (izole kopya vs gerçek repo — tam diff)

```
Only in REPO: instrumentation.ts
Only in REPO: instrumentation-client.ts
Only in REPO: sentry.client.config.ts
Only in REPO: sentry.edge.config.ts
Only in REPO: sentry.server.config.ts
differ: app/api/public/reservations/route.ts     (−8 satır)
differ: app/api/admin/reservations/[id]/route.ts (−13 satır)
differ: app/lib/mail/send.ts                     (−23 satır)
differ: package.json                             (−1 satır)
differ: .env.example                             (−5 satır)
differ: .env.local                               (−3 satır)
differ: package-lock.json                        (npm otomatik)
```

`app/`, `lib/`, `tests/`, `db/`, `middleware.ts`, `next.config.ts`, `vercel.json`,
`vitest.config.ts` içindeki **başka hiçbir dosya** değişmedi.

---
---

# EK — UYGULAMA SONUCU (21 Eylül 2026, onay sonrası)

**Durum:** ✅ **UYGULANDI.** Gerçek repoda Sentry tamamen kaldırıldı.
**Commit / push:** ❌ **YAPILMADI** (talimat gereği).

## A) Kaldırılan Sentry dosyaları (5)

```
D  instrumentation.ts              (-41 satır)
D  instrumentation-client.ts       (-92 satır)  ← geçici console.log probe'u da gitti
D  sentry.client.config.ts         (-20 satır)
D  sentry.server.config.ts         (-71 satır)
D  sentry.edge.config.ts           (-27 satır)
```
Proje kökünde `sentry`/`instrumentation` adlı dosya kalmadı.

## B) Kaldırılan package / dependency

`package.json` → `"@sentry/nextjs": "^10.51.0"` silindi.
`npm install` → **removed 101 packages**.

| | Önce | Sonra |
|---|---|---|
| `package-lock.json` `@sentry` girdisi | 98 | **0** |
| `node_modules` paket sayısı | 518 | **482** |
| `node_modules/@sentry/` | 97 MB / 20 alt paket | **dizin yok** |
| `.next/static/chunks` içinde `"sentry"` | 448 | **0** |
| `.next/server` içinde `"@sentry"` | var | **0** |

## C) Kaldırılan config / env referansları

- Next.js config entegrasyonu: **zaten yoktu** (`withSentryConfig` yok) → `next.config.ts` **hiç değişmedi**.
- `.env.example`: `NEXT_PUBLIC_SENTRY_DSN` + 3 yorum satırı (−4)
- `.env.local`: DSN yorum satırı + 2 yorum satırı + 1 artık kalan yetim yorum (−4)
- Her iki env dosyası `.gitignore` kapsamında (`.env*`) olduğundan `git status`'ta görünmez.

## D) Değiştirilen diğer dosyalar (3 kaynak + package.json)

```
M app/api/admin/reservations/[id]/route.ts   -13  (import + 3× captureException)
M app/api/public/reservations/route.ts        -8  (import + 1× captureException + yorum)
M app/lib/mail/send.ts                       -23  (import + captureMessage bloğu)
M package.json                                -1
M package-lock.json                     +133/-1511
```

### 🔒 "Sadece Sentry" kanıtı

```
git diff -U0 -- app lib middleware.ts next.config.ts | grep -E "^\+[^+]" | wc -l
→ 0
```
**Üretim kaynak dosyalarında TEK BİR SATIR BİLE EKLENMEDİ.** Diff %100 silmedir.

Korunduğu doğrulanan davranışlar (diff'te aynen duruyor):
- `console.error("[admin.reservations.detail.{get,patch,delete}] FAILED", msg)` → 3/3 **duruyor**
- `console.error("[api.public.reservations] create FAILED:", msg)` → **duruyor**
- `return NextResponse.json({ ok:false, error: msg }, { status })` → 4/4 **duruyor** (500/400/400/400-409)
- `status: result.ok ? "sent" : "failed"` → **mail_logs yazımı duruyor**
- `console.log("[mail] mail_logs write", { logged })` → **duruyor**
- `return { ...result, recipient, subject }` → **duruyor**

> Not: `mail/send.ts` içine Sentry yerine `console.error` **EKLENMEDİ** — kural 10
> ("Sentry dışında hiçbir runtime davranışını değiştirme") gereği. İstenirse ayrıca eklenir.

### ⚠️ Bu fazın DIŞINDA olan 2 değişiklik (önceden vardı)

```
M lib/availability.action.ts             +2
M lib/external-calendar.admin.action.ts  +2
```
Bunlar **önceki Server Action authorization fazından kalan, commit edilmemiş** değişikliklerdir.
Diff'leri kontrol edildi: yalnızca `import { requirePermission }` + `await requirePermission(...)`
satırları. **Sentry ile ilgisi yok, bu fazda dokunulmadı.**

## E) TypeScript

```
npx tsc --noEmit  → exit 0, 7.9s
error TS: 0
```

## F) ESLint

```
npx eslint .      → exit 0, 31.0s
✖ 199 problems (0 errors, 199 warnings)
```
Baseline 200 → 199. Uyarı-uyarı diff:
```
ONLY IN BASELINE : instrumentation-client.ts:8:1  no-console   ← silinen dosyanınki
ONLY IN NOW      : NONE ✅
```

## G) Test

| Parça | Dosya | Test |
|---|---|---|
| 1–6 | 30+30+30+30+30+20 = **170** | 455+825+560+417+552+329 = **3.138 PASS** |

✅ **3.138 / 3.138 — yeni failure 0.** `tests/` dizini **hiç değiştirilmedi**
(`git status -- tests` → boş). Test silme / skip / only / assertion gevşetme **yok**.

## H) Production build

```
rm -rf .next && npx next build --webpack  → exit 0, 1m54.9s
```
- "Failed to compile" / "Type error" / "Error:" → **yok**
- Build log'unda `sentry` veya `instrumentation` → **hiç geçmiyor**
- **Route tablosu baseline ile BİREBİR AYNI:** 196 satır, `diff` → **boş**

## I) Smoke test (`next start`)

| Route | Sonuç |
|---|---|
| `/` `/arama` `/kiralik-villalar` `/teklif-al` `/iletisim` `/rezervasyon-kontrol` `/favoriler` `/blog` | **200** ✅ |
| `/bu-sayfa-yok` | **404** ✅ |
| `/en`, `/de` | 404 — **pre-existing** (kök locale route'u tabloda yok; tablo baseline ile aynı) |
| `/maki-admin` | **307** → `/maki-admin/login?redirect=%2Fmaki-admin` ✅ |
| `/maki-admin/villa-listesi` | **307** → login?redirect=…villa-listesi ✅ |
| `/maki-admin/reservations` | **307** → login?redirect=…reservations ✅ |
| `/maki-admin/login` | **200**, 18.611 B — baseline ile **aynı bayt** ✅ |

**API sözleşmeleri (Sentry çağrısının silindiği yollar dahil) — baseline ile birebir:**

| İstek | Yanıt |
|---|---|
| `GET /api/health` | `{"ok":true,…}` **200** |
| `POST /api/public/reservations {}` | `{"ok":false,"error":"Villa zorunlu"}` **400** |
| `GET /api/admin/reservations/abc` | `{"ok":false,"error":"Oturum bulunamadı"}` **401** |
| `PATCH /api/admin/reservations/abc` | `{"ok":false,"error":"Oturum bulunamadı"}` **401** |
| `DELETE /api/admin/reservations/abc` | `{"ok":false,"error":"Oturum bulunamadı"}` **401** |
| `GET /api/admin/villas` | `{"ok":false,"error":"Oturum bulunamadı"}` **401** |

Server log'unda `TypeError` / `ReferenceError` / `MODULE_NOT_FOUND` / `unhandled`
/ `instrumentation`: **YOK**.

## J) Bundle önce / sonra

| Route | ÖNCE (B) | SONRA (B) | FARK | % |
|---|---:|---:|---:|---:|
| `/` | 1.318.894 | 1.085.841 | **−233.053** | −17,7% |
| `/arama` | 1.067.602 | 834.549 | **−233.053** | −21,8% |
| `/iletisim` | 1.075.303 | 842.250 | **−233.053** | −21,7% |
| `/rezervasyon-kontrol` | 1.082.206 | 849.153 | **−233.053** | −21,5% |
| `/favoriler` | 1.079.555 | 846.502 | **−233.053** | −21,6% |
| `/teklif-al` | 1.245.397 | 1.012.344 | **−233.053** | −18,7% |
| `/blog` | 1.019.146 | 835.882 | **−183.264** | −18,0% |
| `/kiralik-villalar` | 1.067.602 | (560.059) | ⚠️ *ölçüm artefaktı* | |

> ⚠️ Dinamik route'larda chunk'ların bir kısmı bazen `<script>` yerine RSC flight
> payload'ı üzerinden geliyor; o istekte ölçüm eksik sayıyor. İzole denemede bu artefakt
> `/arama`'da, bu çalıştırmada `/kiralik-villalar`'da çıktı — yani route'a özgü bir etki
> değil, ölçüm yöntemine özgü. **Gerçek kazanç her route'ta tutarlı −233.053 B'dir.**

**Ana sayfa gzip:** 402.577 B → **324.414 B** = **−78.163 B (−19,4%)**

**Chunk düzeyinde:** Sentry'li vendor chunk `483.004 B` → Sentry'siz karşılığı `241.017 B`.
Diğer tüm chunk'lar **hash düzeyinde bile aynı** → başka hiçbir kod etkilenmedi.

> ⚠️ Ölçümler `--webpack` + font mock + DB'siz ortamda alınmıştır; production **Turbopack**
> kullanır. **Production rakamı değildir.**

## K) Regression

### ✅ Tespit edilen regresyon: **YOK**

Doğrulanan güvenlik / mimari invariantları — **hiçbiri değişmedi** (`git status` ile dosya bazlı):

| Alan | Dosya | Durum |
|---|---|---|
| Server Action authorization | `lib/auth/action-authz.ts` | DEĞİŞMEDİ ✅ |
| Admin permission enforcement | `lib/admin-route-auth.ts` | DEĞİŞMEDİ ✅ |
| Auth / middleware | `middleware.ts` | DEĞİŞMEDİ ✅ |
| Next config | `next.config.ts` | DEĞİŞMEDİ ✅ |
| Price engine | `lib/price.engine.ts` | DEĞİŞMEDİ ✅ |
| Availability | `lib/availability.helper.ts` | DEĞİŞMEDİ ✅ |
| R2 / storage | `lib/storage.helpers.ts` | DEĞİŞMEDİ ✅ |
| PostgreSQL | `lib/db/pg.client.ts` | DEĞİŞMEDİ ✅ |
| Reservation CRUD | `app/services/reservation.service.ts` | DEĞİŞMEDİ ✅ |
| Admin users / permission | `app/services/admin-user.service.ts` | DEĞİŞMEDİ ✅ |
| Testler | `tests/` | DEĞİŞMEDİ ✅ |
| Migration'lar | `db/` | DEĞİŞMEDİ ✅ |

Canlı grep kanıtı (kaldırma sonrası):
`requirePermission`/`requireAdminAction` → **41 dosya** · `"server-only"` → **138 dosya** ·
`authorizeAdminCaller` → **60 route**. PII-safe public reservation akışı: `POST
/api/public/reservations` sözleşmesi byte-identical (400 "Villa zorunlu").

### ⚠️ Bilinçli gözlemlenebilirlik kaybı (bug değil) — 3 kalem

1. `mail/send.ts` → mail gönderim hatası **push alarmı** gitti. `mail_logs`'a
   `status:"failed"` yazımı ve `console.log` **duruyor**; veri kaybı yok.
2. `onRequestError` → yakalanmamış route/RSC hataları artık Sentry'ye akmıyor.
   Tüm API route'ları zaten `try/catch` + `console.error` ile sarılı → Vercel logs'ta görünür.
3. Client hata yakalama gitti. Proje `error.tsx` / `global-error.tsx` **kullanmıyor**,
   dolayısıyla client hata davranışı zaten Next.js varsayılanıydı ve **değişmedi**.

### 📌 Sizin tarafınızda kalan tek iş

**Vercel → Settings → Environment Variables → `NEXT_PUBLIC_SENTRY_DSN`** (Production /
Preview / Development) silinmeli. Kod artık bu değişkeni hiç okumuyor; kalması zararsızdır
ama gereksizdir.

## L) `git status`

```
 M app/api/admin/reservations/[id]/route.ts     ← Sentry
 M app/api/public/reservations/route.ts         ← Sentry
 M app/lib/mail/send.ts                         ← Sentry
 D instrumentation-client.ts                    ← Sentry
 D instrumentation.ts                           ← Sentry
 M lib/availability.action.ts                   ← ÖNCEKİ FAZ (authz), bu fazla ilgisiz
 M lib/external-calendar.admin.action.ts        ← ÖNCEKİ FAZ (authz), bu fazla ilgisiz
 M package-lock.json                            ← Sentry
 M package.json                                 ← Sentry
 D sentry.client.config.ts                      ← Sentry
 D sentry.edge.config.ts                        ← Sentry
 D sentry.server.config.ts                      ← Sentry
?? Claude outputs/*.md                          ← raporlar
```

**"Production dosyalarında Sentry dışında değişiklik yapılmadı" kontrolü: ✅ GEÇTİ.**
Sentry dışı tek iki değişiklik (`lib/availability.action.ts`,
`lib/external-calendar.admin.action.ts`) bu fazdan ÖNCE de mevcuttu, diff'leri incelendi
ve yalnızca Server Action authorization satırlarını içeriyor.

**COMMIT / PUSH YAPILMADI.**
