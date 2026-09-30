# TATİLİN YERİ — KAPSAMLI PROJE AUDİT RAPORU
### Kod Kalitesi · Mimari · Performans · Güvenlik · Risk

| | |
|---|---|
| **Rapor tarihi** | 21 Eylül 2026 |
| **Repository** | `tatilin-yeri-next` |
| **Branch / commit** | `main` @ `79d760a` (çalışma ağacı temiz) |
| **Teknoloji** | Next.js 16.2.4 (App Router) · React 19.2.4 · TypeScript (strict) · native PostgreSQL (`pg`) |
| **Audit tipi** | **SALT OKUNUR** — hiçbir dosya değiştirilmedi, hiçbir komut yazma yapmadı, commit/push yapılmadı |
| **Tek çıktı** | Bu dosya (`Claude outputs/full-project-audit-raporu.md`) |

---

## 1. YÖNETİCİ ÖZETİ

Proje, **olgun ve bilinçli mühendislik izleri taşıyan** bir Next.js monolitidir. Tip güvenliği tamdır (tsc 0 hata), lint temizdir (0 hata), 169 test dosyasında 3.089 test vardır, SQL katmanı elle yazılmış ama **tam parametrize** bir query compiler üzerine kuruludur, rezervasyon çakışması **veritabanı seviyesinde `EXCLUDE` constraint** ile engellenmiştir, SSRF için DNS çözümlemeli bir denylist guard'ı vardır ve şifreleme tarafında argon2id + TOTP 2FA gibi doğru primitifler kullanılmıştır. Kod tabanının %22,1'i açıklama satırıdır; kararların gerekçeleri büyük ölçüde kodun içinde belgelenmiştir.

Buna karşılık **üç tanesi acil olmak üzere** ciddi bulgular mevcuttur:

1. **Next.js 16.2.4 sürümü, kimlik doğrulaması gerektirmeyen uzaktan kod çalıştırma (RCE) dahil 2 CRITICAL ve 10 HIGH seviyeli bilinen güvenlik açığı taşıyor.** Bunlar arasında **bu projenin admin kapısını oluşturan middleware'i atlatan 5 ayrı bypass açığı** da var.
2. **45 Server Action dosyasının 24'ünde hiçbir yetkilendirme kontrolü yok** — bunların arasında manuel rezervasyon oluşturma/silme, ödeme hesabı CRUD, villa özelliği silme gibi **mutasyon yapan admin işlemleri** bulunuyor. Middleware yalnızca `/maki-admin/*` yol desenini koruyor; Server Action'lar ise herhangi bir route'a POST edilerek çağrılabiliyor.
3. **Admin yetki modeli düz (flat).** `sidebar_permissions` alanı yalnızca arayüzde menü gizlemek için kullanılıyor; sunucu tarafında hiçbir yerde zorlanmıyor. Yani "yalnızca blog yetkisi verilmiş" bir admin, finans KPI'larına, mail loglarına, ödeme hesaplarına ve diğer adminleri oluşturma/değiştirme uçlarına erişebiliyor.

Bunların yanında **operasyonel süreklilik riski** yüksektir: repository'de **migration runner, `schema_migrations` defteri ve CI pipeline'ı yoktur**; aktif migration numaraları süreksizdir ve şemanın sıfırdan yeniden üretilmesi arşiv klasörü olmadan mümkün değildir. Ayrıca `vercel.json` içindeki 4 cron tanımı, Hetzner + Coolify ortamında **hiç tetiklenmez** (bu durum repo içindeki `docs/coolify-scheduled-tasks.md` belgesinde zaten tespit edilmiş, ancak kurulumun yapılıp yapılmadığı bu audit'te doğrulanamadı).

Performans tarafında en büyük iki fırsat: `/arama` ve `/kiralik-villalar` sayfalarının **tüm eşleşen villaları belleğe çekip sayfalamayı JavaScript'te yapması** (SQL `LIMIT/OFFSET` yok) ve **public rezervasyon sayfasına 640 KB'lık `country-state-city` chunk'ının yüklenmesi**.

### 1.1 Bulgu dağılımı

| Seviye | Adet | Örnek |
|---|---|---|
| 🔴 **CRITICAL** | 2 | Next.js RCE + middleware bypass; yetkisiz Server Action'lar |
| 🟠 **HIGH** | 11 | Düz admin yetki modeli; migration yönetimi yok; bellek-içi sayfalama; CI yok |
| 🟡 **MEDIUM** | 12 | Sanitize edilmeyen `map_embed`; transaction yokluğu; Sentry source map yok |
| 🔵 **LOW** | 10 | Sabit-zamanlı olmayan secret karşılaştırma; 153 boş catch; 200 lint uyarısı |
| ⚪ **INFO** | 9 | Güçlü yönler ve mimari gözlemler |

### 1.2 Genel sağlık skoru

| Alan | Skor | Not |
|---|---|---|
| Tip güvenliği | 9/10 | strict, 0 hata, 0 `@ts-ignore` |
| SQL / veri erişim güvenliği | 9/10 | Tam parametrize, identifier allow-list |
| Kimlik doğrulama (authentication) | 8/10 | argon2id, TOTP, httpOnly/SameSite, rotasyon |
| **Yetkilendirme (authorization)** | **3/10** | Server Action guard'ları eksik, düz yetki modeli |
| **Bağımlılık güvenliği** | **2/10** | 2 CRITICAL + 10 HIGH açık |
| Performans (sunucu) | 5/10 | Bellek-içi sayfalama, `select("*")` yaygın |
| Performans (istemci) | 5/10 | 640 KB gereksiz chunk, 4 font ailesi |
| Hata yönetimi / gözlemlenebilirlik | 4/10 | error boundary yok, source map yok |
| Test sağlığı | 6/10 | 3.089 test var ama 51'i kalıcı kırmızı |
| **Operasyon / CI-CD** | **2/10** | CI yok, migration runner yok, cron kurulu değil |

---

## 2. KAPSAM, YÖNTEM VE DOĞRULAMA SINIRLARI

### 2.1 Yapılanlar
- Repository'nin tamamı salt okunur olarak tarandı (810 `.ts`/`.tsx` üretim dosyası, 169 test dosyası, 83 SQL migration).
- `npx tsc --noEmit` çalıştırıldı → **exit 0, 0 hata**.
- `npx eslint .` çalıştırıldı → **exit 0, 0 hata, 200 uyarı**.
- Test paketi 8 parçaya bölünerek tamamen çalıştırıldı → **3.089 test, 51 başarısız, 15 dosya**.
- `npm audit` çalıştırıldı → **48 açık (2 critical, 10 high, 36 moderate)**.
- Mevcut `.next` build çıktısı üzerinden chunk boyutları ve hangi route'un hangi chunk'ı yüklediği incelendi.

### 2.2 KESİNLİKLE YAPILMAYANLAR
Kullanıcının talimatı gereği: kod yazılmadı, kod değiştirilmedi, dosya oluşturulmadı/değiştirilmedi (bu rapor hariç), migration oluşturulmadı, DB'ye dokunulmadı, sunucuya/Coolify'ye dokunulmadı, deploy yapılmadı, **commit/push yapılmadı**, dependency güncellenmedi, config değiştirilmedi, environment variable değiştirilmedi, otomatik fix/refactor/format uygulanmadı, **test dosyaları dahil hiçbir dosya düzenlenmedi**.

> Doğrulama: `git status --short` boş, `git log --oneline -1` → `79d760a` (audit öncesiyle aynı).

### 2.3 ⚠️ DOĞRULANAMAYAN ALANLAR

Aşağıdaki konularda **erişim yoktu**; bu raporda geçen ilgili ifadeler *varsayım değil, "doğrulanamadı" olarak işaretlenmiştir*:

| Alan | Durum |
|---|---|
| PostgreSQL / production DB | ❌ Erişim yok — **gerçek şema, gerçek index'ler, tablo boyutları, query planları, `EXPLAIN ANALYZE` sonuçları DOĞRULANAMADI** |
| Hetzner sunucusu | ❌ Erişim yok — CPU/RAM/disk, process durumu, node sürümü DOĞRULANAMADI |
| Coolify | ❌ Erişim yok — **Scheduled Tasks kurulu mu, env değişkenleri set mi DOĞRULANAMADI** |
| Cloudflare / R2 | ❌ Erişim yok — bucket politikaları, CDN cache kuralları, WAF DOĞRULANAMADI |
| Production filesystem | ❌ Erişim yok |
| Production logları | ❌ Erişim yok — gerçek hata oranları, 5xx sayıları, Sentry issue'ları DOĞRULANAMADI |
| Gerçek trafik / veri hacmi | ❌ Bilinmiyor — villa sayısı, rezervasyon hacmi, eşzamanlı kullanıcı DOĞRULANAMADI |

Bu nedenle performans bulguları **kod yapısından türetilmiş ölçeklenme riskleridir**, ölçülmüş yavaşlıklar değildir. Nerede böyle bir ayrım varsa açıkça belirtilmiştir.

### 2.4 Bulgu kanıt formatı

Her bulgu şu şablonu izler:

```
DOSYA  : dosya yolu
SATIR  : satır numarası / aralığı
SORUN  : ne yanlış
NEDEN  : neden yanlış (mekanizma)
ETKİ   : gerçekleşirse ne olur
ÖNERİ  : ne yapılmalı
```

---

## 3. PROJE ENVANTERİ VE TEKNOLOJİ YIĞINI

### 3.1 Boyut

| Katman | Dosya | Satır |
|---|---:|---:|
| `app/(admin)` | 168 | 41.310 |
| `app/components` | 174 | 41.128 |
| `app/services` | 99 | 14.125 |
| `app/api` | 79 | 10.257 |
| `app/(public)` | 61 | 7.961 |
| `lib` (toplam) | 196 | 32.042 |
| `lib/db` (alt küme) | 70 | 10.337 |
| `types` | 1 | 796 |
| `hooks` | 1 | 190 |
| **Üretim toplamı** | **810** | **152.416** |
| `tests` | 173 | 46.967 |

Kompozisyon: **%68,7 kod · %22,1 yorum · %9,2 boş satır**.

### 3.2 En büyük dosyalar (bakım riski)

| Satır | Dosya |
|---:|---|
| 1.874 | `app/components/search/AramaPageBody.tsx` |
| 1.804 | `lib/db/villa.repository.server.ts` |
| 1.641 | `app/components/villa/VillaCard.tsx` |
| 1.560 | `lib/i18n/dictionaries/types.ts` |
| 1.503 | `app/(admin)/maki-admin/users/page.tsx` |
| 1.395 | `app/(admin)/maki-admin/reservations/[id]/page.tsx` |
| 1.252 / 1.239 / 1.219 | `dictionaries/tr.ts` / `de.ts` / `en.ts` |
| 1.245 | `app/(public)/arama/FilterSidebar.tsx` |
| 1.218 | `app/(admin)/maki-admin/reservations/ekle/page.tsx` |
| 1.172 | `app/(admin)/maki-admin/villa-listesi/VillaListesiClient.tsx` |
| 1.166 | `app/components/reservation/ReservationForm.tsx` |
| 1.136 | `app/(admin)/maki-admin/layout.tsx` |
| 1.080 | `app/components/villa/booking/useBookingEngine.ts` |

### 3.3 Bağımlılıklar

39 production + 16 dev bağımlılık. Öne çıkanlar:

- **Altyapı:** `next@16.2.4`, `react@19.2.4`, `pg@^8.13.1` (ORM **yok**)
- **Güvenlik:** `@node-rs/argon2`, `bcryptjs` (legacy hash geçişi), `jose`, `otplib`, `sanitize-html`
- **Altyapı servisleri:** `@upstash/ratelimit` + `@upstash/redis`, `@aws-sdk/client-s3` (R2), `@sentry/nextjs`
- **UI:** `@tiptap/*` (11 paket), `leaflet` + `react-leaflet`, `react-day-picker@8.10.2`, `react-datepicker@9`, `embla-carousel`, `@dnd-kit/*`, `lucide-react`
- **Veri:** `country-state-city` (**17 MB kurulu**), `date-fns@3`, `fast-xml-parser`, `archiver`, `qrcode`

### 3.4 Yapı

- 152 dosya `"use client"`, 133 dosya `import "server-only"`, 45 dosya `"use server"`
- 79 API route (44'ü `app/api/admin/*`), 54 admin sayfası, 51 public sayfa
- Public sayfalar 3 locale için ayrı dizinlerde (`/`, `/en`, `/de`) — **ancak EN/DE sayfaları ortalama ~61 satırlık ince sarmalayıcılar**, gerçek mantık ortak gövde bileşenlerinde. Bu **kabul edilebilir** bir yaklaşım; kopya kod sorunu yaratmıyor.
- 83 SQL migration dosyası: 62 aktif + 20 `_archive/legacy` + 1 `_archive/pre-numbering`

---

## 4. MİMARİ DEĞERLENDİRME

### 4.1 Genel yapı — güçlü

Katmanlama net ve büyük ölçüde tutarlı:

```
app/(public) · app/(admin)   →  sayfa/route kabuğu
app/components/...            →  gövde bileşenleri (RSC + client)
app/services/*.service.ts     →  iş mantığı (99 dosya)
lib/db/*.repository*.ts       →  veri erişimi (57 repository)
lib/db/query-builder.ts       →  PostgREST-benzeri akıcı API
lib/db/query-compiler.ts      →  SQL üretimi (parametrize)
lib/db/pg.client.ts           →  pg Pool
```

`lib/price.engine.ts` (767 satır) saf fonksiyonlardan oluşuyor ve 88+23 testle korunuyor — projenin en iyi izole edilmiş parçası.

### 4.2 🟡 MEDIUM — M-6: Katman ihlali (bileşenden doğrudan repository çağrısı)

```
DOSYA  : app/components/home/ShortGapsSection.tsx
         app/components/layout/FooterWrapper.tsx
         app/components/shared-list/SharedListPageBody.tsx
         app/components/admin/villa-form/DiscountsSection.tsx
         app/components/short-gaps/ShortGapsPageBody.tsx
         app/components/search/AramaPageBody.tsx
         app/components/villa/SimilarVillasSection.tsx
         (+3 dosya daha — toplam 10)
SATIR  : import satırları — `from "@/lib/db/..."`
SORUN  : Sunum katmanındaki bileşenler service katmanını atlayarak
         doğrudan repository çağırıyor.
NEDEN  : Mimari sözleşme "component → service → repository" iken bu
         10 dosya "component → repository" kısa devresi yapıyor.
ETKİ   : İş kuralı (yetki, cache invalidation, audit log) service
         katmanında ise atlanıyor. Sorgu değişikliklerinde tek
         noktadan değişim mümkün olmuyor. Test edilebilirlik düşüyor.
ÖNERİ  : Bu 10 çağrıyı ilgili service fonksiyonlarına taşıyın. Yeni
         ihlalleri önlemek için ESLint `no-restricted-imports` kuralı
         ekleyin: app/components/** içinden @/lib/db/** yasak.
```

### 4.3 🟠 HIGH — H-3'ün mimari kökü: Sayfa gövdelerinde biriken sorumluluk

```
DOSYA  : app/components/search/AramaPageBody.tsx
SATIR  : 1–1874 (tek dosya)
SORUN  : Tek bir dosya şunların hepsini yapıyor: URL parse, taksonomi
         çözümleme, feature/kategori kesişimi, DB sorgusu, availability
         filtresi, para birimi dönüşümü, fiyat normalizasyonu, sıralama,
         sayfalama, JSON-LD üretimi, 4 ayrı UI alt bileşeni
         (SortSelector, PageSizeSelector, PaginationNav, href builder).
NEDEN  : Sayfa gövdeleri zamanla "her şeyin toplandığı" dosyalara
         dönüşmüş; sorumluluk ayrımı yok.
ETKİ   : Her fiyat/filtre değişikliği bu dosyayı riske atıyor (bu
         oturumda yapılan 17 değişikliğin çoğu bu dosya ailesine
         dokundu). Test yüzeyi devasa; regresyon riski yüksek.
ÖNERİ  : Aşamalı çıkarma: (1) `SortSelector`/`PageSizeSelector`/
         `PaginationNav`'ı ortak `app/components/search/_shared/`
         altına taşıyın — bunlar KiralikVillalarPageBody'de de
         kopyalanmış durumda. (2) URL parse + filtre çözümlemeyi saf
         bir `lib/search/resolve-search-params.ts` modülüne alın.
         (3) Fiyat normalizasyonunu mevcut price engine helper'larına
         devredin. Her adımda mevcut testler yeşil kalmalı.
```

### 4.4 🟡 MEDIUM — M-7: Arama ve liste sayfaları arasında kopya bileşenler

```
DOSYA  : app/components/search/AramaPageBody.tsx (1874 satır)
         app/components/search/KiralikVillalarPageBody.tsx (784 satır)
SATIR  : AramaPageBody 1622 / 1717 / 1776 — SortSelector, PageSizeSelector,
         PaginationNav
         KiralikVillalarPageBody 547 / 603 / 712 — aynı üç bileşen
SORUN  : Üç UI bileşeni iki dosyada ayrı ayrı tanımlanmış.
NEDEN  : İki sayfa bağımsız evrimleşmiş.
ETKİ   : Sayfalama veya sıralama davranışı değiştiğinde iki yerde
         değiştirmek gerekiyor; birinde unutulursa sayfalar arası
         tutarsızlık oluşuyor (SEO açısından da rel/href farkları).
ÖNERİ  : Tek bir paylaşılan modüle çıkarın; her iki sayfanın mevcut
         locale route testleri koruma sağlar.
```

### 4.5 ⚪ INFO — Mimari güçlü yönler

- **Repository/provider ayrımı:** `db` (anon) ve `dbAdmin` (service-role) ayrı; hangi çağrının hangi bağlamda olduğu kodda açıkça belgelenmiş.
- **`import "server-only"` disiplini:** 133 dosyada; sunucu kodunun client bundle'a sızması build-time hata veriyor.
- **Atomik küme değişimi:** `replace_villa_prices`, `replace_villa_feature_relations` vb. 6 PostgreSQL fonksiyonu (migration `002_atomic_replace_helpers.sql`) çok satırlı ilişki güncellemelerini tek transaction'da yapıyor — doğru çözüm.
- **Toplu sorgu tercihi:** `getBlockedVillaIds(start, end, candidateIds)` villa başına sorgu yerine tek toplu sorgu kullanıyor; kod tabanında N+1 kalıbı pratikte **bulunamadı** (102 `Promise.all` kullanımı var, döngü içi `await` yalnızca 1 yerde ve orada gruplanmış).

---

## 5. VERİ KATMANI VE VERİTABANI MİMARİSİ

### 5.1 ⚪ INFO — SQL enjeksiyonu: kapalı

`lib/db/query-compiler.ts` incelendi:

- **Değerler:** `ParamBag.add()` her değeri `$1, $2, …` placeholder'ına çeviriyor (satır 156-157). String birleştirme ile değer gömülen **tek bir nokta bile bulunamadı**.
- **Tanımlayıcılar:** `quoteIdent()` (satır 134-146) `^[A-Za-z_][A-Za-z0-9_]*$` allow-list'i uyguluyor, eşleşmeyeni **exception ile reddediyor** ve çift tırnakla kaçırıyor.
- **`search_path`:** `pg.client.ts:69` → `options: "-c search_path=public"` ile deterministik; pooler kullanıcısının varsayılanına bağımlı değil.
- **SSL:** `PGSSLMODE` ile kontrol ediliyor; `require` modunda `rejectUnauthorized: false`.

> 🔵 **LOW — L-11:** `PGSSLMODE=require` durumunda sertifika doğrulanmıyor (`rejectUnauthorized: false`, `pg.client.ts:45`). Aynı özel ağda ise kabul edilebilir; DB ayrı bir host'ta ise `verify-full` tercih edilmeli. **Production'da hangi modun kullanıldığı DOĞRULANAMADI.**

### 5.2 🟡 MEDIUM — M-8: Yaygın `select("*")` kullanımı

```
DOSYA  : 63 çağrı — başlıcaları:
         lib/db/villa.repository.server.ts:966, 988, 1255
         lib/db/payment.repository.server.ts:40, 126, 235
         lib/db/villa-discount.repository.server.ts:58
         lib/db/villa-image.repository.server.ts:41
         lib/db/blog.repository.server.ts:78
         lib/db/offer-request.repository.ts:40, 47
         lib/db/external-calendar-source.repository.ts:34, 51, 63
         lib/db/villa-feature.repository.ts:53
SATIR  : yukarıda
SORUN  : Gerekmeyen kolonlar da çekiliyor.
NEDEN  : Eski sağlayıcıdan (PostgREST) taşınırken "byte-identical"
         davranış korunmuş; projeksiyon daraltılmamış.
ETKİ   : (a) `villa` gibi geniş tablolarda ağ ve bellek israfı;
         (b) yeni bir kolon eklendiğinde (örn. migration 061'deki
         `show_on_homepage`) otomatik olarak tüm consumer'lara akıyor —
         cache.helpers.ts:887'de bu durum zaten bilinçli bir not olarak
         yazılmış; (c) gizli/iç kolonlar yanlışlıkla API yanıtına
         sızabiliyor.
ÖNERİ  : Public yüzeye yakın olanlardan başlayın (villa detay, arama,
         ödeme yöntemleri). Her repository fonksiyonu için açık kolon
         listesi tanımlayın. Kolon listesi tipi zaten generic olarak
         taşınıyor, bu geçişi tip sistemi destekler.
```

### 5.3 🟡 MEDIUM — M-2: Uygulama seviyesinde transaction yok

```
DOSYA  : lib/db/pg.client.ts
SATIR  : 79-101 — yalnız `getPgPool()` ve `closePgPool()` export ediliyor
SORUN  : Kod tabanının tamamında `BEGIN` / `COMMIT` / `ROLLBACK` veya
         bir `transaction()` sarmalayıcısı YOK (grep: 0 sonuç).
NEDEN  : Query builder tek ifade (statement) üretiyor; çok ifadeli
         işlemler için bir primitif tanımlanmamış.
ETKİ   : Çok tablolu akışlar atomik değil. Örnek: villa oluşturma →
         villa satırı + tip ilişkileri + özellik ilişkileri + görseller
         + fiyatlar. Aradaki bir hata YARIM villa bırakır.
         (Hafifletici: `replace_*` küme değişimleri DB fonksiyonlarıyla
         atomik; rezervasyon çakışması `EXCLUDE` constraint ile DB
         seviyesinde garanti.)
ÖNERİ  : `pg.client.ts`'e `withTransaction(fn)` helper'ı ekleyin
         (pool.connect → BEGIN → fn(client) → COMMIT/ROLLBACK → release)
         ve önce en kritik iki akışta kullanın: rezervasyon oluşturma
         ve villa oluşturma/güncelleme.
```

### 5.4 🟡 MEDIUM — M-11: Her admin isteğinde admin_users sorgusu

```
DOSYA  : lib/admin-route-auth.ts
SATIR  : 60-105 (authorizeAdminToken)
SORUN  : Her admin isteğinde JWT doğrulaması SONRASI bir (bazen iki)
         `admin_users` SELECT'i yapılıyor: önce auth_user_id ile,
         bulunamazsa e-posta ile fallback.
NEDEN  : `is_active` kontrolü her istekte taze okunmak isteniyor
         (doğru bir güvenlik kararı).
ETKİ   : Admin panelde bir sayfa açılışı onlarca istek üretiyorsa
         (44 admin API route var) her biri 1-2 ekstra DB round-trip
         ekliyor. Gerçek etkisi trafik hacmine bağlı — **ölçülemedi.**
ÖNERİ  : Kısa ömürlü (30-60 sn) bellek içi cache (`Map<authUserId,
         {row, expiresAt}>`) yeterli olur; `is_active` değişiminde
         en fazla 60 sn gecikme oluşur. Alternatif: `is_active` ve
         yetkileri access token'a claim olarak gömüp TTL'i kısa tutmak.
```

---

## 6. MIGRATION / ŞEMA YÖNETİMİ VE ŞEMANIN YENİDEN ÜRETİLEBİLİRLİĞİ

### 6.1 🟠 HIGH — H-2: Migration runner, ledger ve sıralı numaralandırma yok

```
DOSYA  : db/migrations/  (62 aktif .sql)
         db/migrations/_archive/legacy/  (20 .sql)
         db/migrations/_archive/pre-numbering/  (1 .sql)
         db/migrations/_archive/README.md
         package.json (scripts bölümü)
SATIR  : package.json scripts — migration script'i YOK
         _archive/README.md:6-9 — "Projede migration runner yoktur
         (package.json'da migration script'i, schema_migrations ledger
         tablosu veya CI adımı yok) — migration'lar elle uygulanır."
SORUN  : (a) Hangi migration'ın uygulandığını izleyen bir defter yok.
         (b) Aktif numaralar SÜREKSİZ: 001-020, 023-025, 030-033, 036,
             045-047, 050, 052, 055-057, 061, 064-066, 068, 070-091.
             Eksik numaralar `_archive/legacy` içinde.
         (c) Bu yüzden şema, `db/migrations/*.sql`'i sırayla çalıştırarak
             SIFIRDAN YENİDEN ÜRETİLEMEZ; arşiv de gerekir.
         (d) `070_reservation_share_links.sql` içindeki
             `public.is_active_admin()` fonksiyonu hâlâ `auth.uid()`
             çağırıyor — vanilla PostgreSQL'de bu migration yeniden
             çalıştırılırsa HATA verir (README.md:38-43'te belgelenmiş).
NEDEN  : Proje yönetilen bir PostgreSQL sağlayıcısından native
         PostgreSQL'e (Hetzner) taşınmış; taşıma sırasında runner
         kurulmamış.
ETKİ   : 🔴 Felaket kurtarma (DR) riski. Veritabanı kaybolursa veya
         staging/test ortamı kurulmak istenirse şema elle, dosya dosya,
         doğru sırada uygulanmak zorunda. Bir migration'ın production'da
         uygulanıp uygulanmadığı hiçbir yerden okunamıyor — yalnızca
         insan hafızası. Yeni bir geliştirici ortam kuramaz.
ÖNERİ  : Faz 0'da: (1) `node-pg-migrate` veya `dbmate` gibi hafif bir
         runner ekleyin, (2) `schema_migrations` tablosunu oluşturup
         mevcut 82 dosyanın tamamını "uygulandı" olarak işaretleyin
         (baseline), (3) `db/schema.sql` olarak tek parça bir
         `pg_dump --schema-only` çıktısını repo'ya alın — bu, yeniden
         üretilebilirliği tek dosyaya indirger, (4) 070'teki
         `auth.uid()` çağrısını temizleyin.
```

### 6.2 🟠 HIGH — H-2b: Index tanımlarının çoğu arşivde

Aktif migration'larda **yalnızca 22 index tanımı** var:

| Index sayısı | Tablo |
|---:|---|
| 6 | `villa` |
| 3 | `admin_sessions` |
| 2 | `villa_discounts`, `villa_types`, `villa_locations`, `homepage_collections`, `reservation_share_links` |
| 1 | `admin_users`, `admin_totp_recovery_codes`, `villa_zip_links` |

`reservations`, `manual_reservations`, `villa_prices`, `villa_feature_relations`, `villa_type_relations`, `villa_images`, `blog_posts`, `contact_messages`, `external_calendar_events`, `admin_activity_logs`, `villa_short_gaps` için index tanımları **`_archive/legacy` içinde** (ör. `029_external_calendar_sync.sql:129`, `053_villa_short_gaps.sql:59`, `015_contact_messages.sql:37`, `058_blog_posts.sql:49`, `028_admin_activity_logs.sql:71`).

```
SORUN  : En sık sorgulanan tablolar (reservations, villa_prices,
         villa_*_relations, villa_images) için repo'nun AKTİF
         migration'larında hiç index tanımı yok.
NEDEN  : Bu tablolar eski sağlayıcı döneminde oluşturulmuş; tanımları
         arşive taşınmış.
ETKİ   : ⚠️ **DOĞRULANAMADI — production DB'de bu index'lerin mevcut
         olup olmadığı yalnız veritabanına bakılarak anlaşılabilir.**
         Eğer eksiklerse, availability sorguları (tarih aralığı
         taraması), fiyat çekme ve ilişki kesişimleri sıralı tarama
         (seq scan) yapar ve villa sayısıyla birlikte doğrusal
         kötüleşir.
ÖNERİ  : **Faz 0 — ilk iş:** DB'ye bağlanıp şunu çalıştırın ve çıktıyı
         repo'ya `db/schema-indexes.md` olarak alın:
           SELECT schemaname, tablename, indexname, indexdef
           FROM pg_indexes WHERE schemaname='public' ORDER BY 2,3;
         Ayrıca eksik index avı için:
           SELECT relname, seq_scan, idx_scan, n_live_tup
           FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 20;
         Özellikle şunları doğrulayın: reservations(villa_id,
         start_date, end_date), villa_prices(villa_id, start_date,
         end_date), villa_feature_relations(feature_id) ve (villa_id),
         villa_images(villa_id, is_cover, sort_order).
```

### 6.3 ⚪ INFO — Güçlü yön: Rezervasyon çakışması DB seviyesinde engelleniyor

`db/migrations/001_reservations_no_overlap.sql:89-105` iki adet GiST `EXCLUDE` constraint tanımlıyor:
- `reservations_no_overlap` — kısmi (rejected hariç)
- `manual_reservations_no_overlap` — tam

Bu, uygulama seviyesindeki yarış koşullarına (race condition) karşı **doğru ve nihai** savunmadır; aynı villaya aynı tarihler için eşzamanlı iki rezervasyon veritabanı tarafından reddedilir. Bu, projenin en iyi mimari kararlarından biridir.

---

## 7. KİMLİK DOĞRULAMA VE OTURUM YÖNETİMİ

### 7.1 ⚪ INFO — Genel olarak sağlam

| Kontrol | Durum | Kanıt |
|---|---|---|
| Şifre hash | ✅ argon2id (`@node-rs/argon2`), bcrypt legacy'den otomatik re-hash | `lib/auth/native/password.ts:29-95` |
| JWT | ✅ `jose`, HS256, `kid` header, min 32 karakter secret zorunlu, algoritma allow-list (`bad_alg` reddi) | `lib/auth/native/jwt.ts:47-50, 96, 129` |
| Access cookie | ✅ httpOnly, secure, SameSite=Lax, maxAge=TTL | `lib/auth/native/cookies.ts:63-67` |
| Refresh cookie | ✅ httpOnly, secure, **SameSite=Strict**, remember=false ise session cookie | `cookies.ts:71-76` |
| 2FA | ✅ TOTP (otplib), ayrı `TOTP_ENCRYPTION_SECRET`, recovery kodları, deneme limiti + kilit | `lib/auth/native/totp.ts`, `totp-verify.service.ts` |
| Brute force | ✅ `AUTH_LOGIN_MAX_ATTEMPTS` + `AUTH_LOGIN_LOCK_MINUTES`; 2FA disable/regenerate uçlarında ayrıca IP rate-limit | `app/api/admin/2fa/disable/route.ts:26` |
| CSRF | ⚠️ Kısmi — aşağıya bakın | `lib/auth/native/origin-guard.ts` |

### 7.2 🔵 LOW — L-2: Origin guard, Origin başlığı yoksa geçiriyor

```
DOSYA  : lib/auth/native/origin-guard.ts
SATIR  : 21 — `if (!origin) return true;`
KULLANIM: app/api/auth/login/route.ts:27
          app/api/auth/logout/route.ts:27
          app/api/auth/2fa/verify/route.ts:45
SORUN  : Origin başlığı yoksa istek kabul ediliyor.
NEDEN  : Dosyanın kendi yorumunda açıkça gerekçelendirilmiş: bazı
         programatik istemciler Origin göndermiyor; tarayıcılar
         cross-site POST'ta Origin'i DAİMA gönderiyor.
ETKİ   : Düşük. Asıl CSRF vektörü (tarayıcı kaynaklı cross-site POST)
         kapalı. Ancak `Sec-Fetch-Site` başlığı da kontrol edilseydi
         savunma derinliği artardı.
ÖNERİ  : `Sec-Fetch-Site: cross-site` ise Origin olmasa bile reddedin.
         Modern tarayıcıların hepsi bu başlığı gönderir.
```

### 7.3 🔵 LOW — L-1: Sabit-zamanlı olmayan secret karşılaştırma

```
DOSYA  : lib/cron-auth.ts
SATIR  : 44-48
SORUN  : `if (header !== expected)` — cron secret'ı düz string
         karşılaştırmasıyla doğrulanıyor. Kod tabanında
         `crypto.timingSafeEqual` hiç kullanılmıyor (grep: 0 sonuç).
NEDEN  : Basitlik.
ETKİ   : Teorik. HTTP üzerinden zamanlama saldırısı, ağ gürültüsü
         nedeniyle pratikte çok zordur. Yine de bir sertleştirme
         eksiği.
ÖNERİ  : `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`
         (uzunluk farkını önce kontrol ederek). Aynı düzeltme
         gelecekte eklenecek tüm bearer secret'lar için de geçerli.
```

> ✅ **Olumlu:** `authorizeCronRequest` `CRON_SECRET` tanımsızsa **503 ile fail-closed** davranıyor (`lib/cron-auth.ts:33-42`) — doğru tercih.

---

## 8. YETKİLENDİRME (AUTHORIZATION) VE ERİŞİM KONTROLÜ

### 8.1 ✅ API route'ları: tam kapsama

44 admin API route'unun **tamamında** bir `authorizeAdmin*` guard'ı bulunuyor. Kullanım dağılımı:

| Helper | Çağrı |
|---|---:|
| `authorizeAdminCaller` | 176 |
| `authorizeAdminSession` | 72 |
| `authorizeCronRequest` | 15 |
| `authorizeAdminToken` | 12 |
| `requireAdmin` | 7 |
| `authorizeAdminCallerFlex` | 6 |

Bu iyi bir durumdur ve raporun geri kalanındaki sorunun **API katmanında değil, Server Action katmanında** olduğunu gösterir.

### 8.2 🟠 HIGH — H-1: Düz (flat) admin yetki modeli — yetki yükseltme

```
DOSYA  : lib/admin-route-auth.ts
SATIR  : 32-37 (AuthorizedAdminCaller tipi), 106-115 (is_active kontrolü)
         app/api/auth/me/route.ts:46-58 (sidebar_permissions yalnız döndürülüyor)
         app/api/admin/create-user/route.ts:46-67, 126, 155
         app/api/admin-users/[id]/route.ts:102-104
SORUN  : `authorizeAdminCaller` yalnızca "bu kullanıcı AKTİF bir
         admin_users satırı mı?" sorusunu yanıtlıyor. Döndürdüğü
         `AuthorizedAdminCaller` tipi yalnızca { id, authUserId, email,
         is_active } içeriyor — YETKİ BİLGİSİ TAŞIMIYOR.
         `sidebar_permissions` (jsonb string[]) alanı yalnızca
         /api/auth/me ve /api/auth/login yanıtlarında istemciye
         gönderiliyor ve SADECE menü gizlemek için kullanılıyor.
         Hiçbir API route'u veya service, bir işlemi yapmadan önce
         `sidebar_permissions` kontrolü YAPMIYOR (grep ile doğrulandı:
         authorization amaçlı tek bir kontrol yok).
NEDEN  : Yetki modeli UI katmanında tasarlanmış, sunucuya indirilmemiş.
         Migration'larda (013, 016, 018, 020, 064) modül bazlı
         "permission" kavramı var ama zorlama (enforcement) yok.
ETKİ   : 🔴 Yatay + dikey yetki yükseltme. Yalnızca "blog" yetkisi
         verilmiş bir personel hesabı:
           • /api/admin/... uçlarının tamamını çağırabilir,
           • finans KPI'larını okuyabilir (finance.action.ts),
           • tüm mail loglarını (müşteri e-postaları) okuyabilir
             (system-logs.action.ts),
           • ödeme hesaplarını ve Western Union bilgilerini
             değiştirebilir,
           • KENDİSİNE veya yeni bir hesaba TÜM yetkileri verebilir
             (create-user ve admin-users/[id] uçları caller'ın
             yetkisini kontrol etmiyor),
           • rezervasyonları silebilir/değiştirebilir.
         Menüde görünmemek, erişimi engellemez. Bir tarayıcı konsolu
         yeterlidir.
ÖNERİ  : 1) `AuthorizedAdminCaller` tipine `permissions: string[]`
            ekleyin (lookup zaten yapılıyor, kolon zaten çekiliyor).
         2) `requirePermission(auth, "reservations")` gibi tek bir
            helper yazın ve her admin route'unun guard'ından hemen
            sonra çağırın.
         3) Kullanıcı/yetki yönetimi uçlarını ("create-user",
            "admin-users/[id]", "2fa/reset") ayrı ve daha dar bir
            yetkiye ("users" veya bir superadmin bayrağına) bağlayın.
         4) Her route'un hangi yetkiyi gerektirdiğini tek bir haritada
            (`lib/auth/permission-map.ts`) toplayın ve bu haritanın
            44 route'u eksiksiz kapsadığını bir testle kilitleyin.
```

---

## 9. SERVER ACTIONS GÜVENLİĞİ

### 9.1 🔴 CRITICAL — C-2: Yetkilendirilmemiş Server Action'lar

```
DOSYA  : 45 "use server" dosyasının 24'ü (detay tablo aşağıda)
SATIR  : ilgili dosyaların tamamı — hiçbirinde authorizeAdmin*/
         requireAdmin/verifyAccessToken çağrısı YOK
KANIT  : middleware.ts:60-66 →
           matcher: ["/maki-admin/:path*"]
         yani middleware YALNIZCA bu yol desenindeki isteklere çalışıyor.
SORUN  : Next.js App Router'da bir Server Action, derlenmiş bir action
         ID'si ile HERHANGİ bir route'a yapılan POST isteğiyle
         çalıştırılır. Action'ın tanımlandığı dosyanın admin klasöründe
         olması, çağrının admin URL'inden gelmesini GEREKTİRMEZ.
         Middleware `/maki-admin/*` dışını görmediği için, aynı
         action'ı `/` (ana sayfa) üzerine POST ederek middleware
         tamamen atlanabilir.
NEDEN  : Güvenlik, sayfa yönlendirmesini yapan middleware'e
         devredilmiş; Server Action'ların ayrı bir HTTP giriş noktası
         olduğu hesaba katılmamış.
ETKİ   : 🔴 Kimlik doğrulaması olmayan bir saldırgan, action ID'lerini
         ele geçirirse (bkz. C-1'deki "Unauthenticated disclosure of
         internal Server Function endpoints" açığı — bu projenin Next
         sürümü etkileniyor) şunları yapabilir:
           • Manuel rezervasyon OLUŞTURABİLİR / GÜNCELLEYEBİLİR /
             SİLEBİLİR → takvim bloklama, gerçek rezervasyonları
             engelleme, gelir kaybı
           • Ödeme hesabı ve Western Union hesap bilgilerini
             DEĞİŞTİREBİLİR → müşteri ödemelerini kendi hesabına
             yönlendirme (doğrudan finansal zarar)
           • Villa özelliklerini / tiplerini / kurallarını SİLEBİLİR
           • Finans KPI'larını ve mail loglarını (müşteri e-postaları,
             KVKK kapsamında kişisel veri) OKUYABİLİR
           • Cache'i sürekli temizleyerek (revalidate.actions.ts)
             sunucuyu her istekte tam sorguya zorlayabilir (DoS)
ÖNERİ  : HER "use server" dosyasının HER export'unun ilk satırı bir
         yetki kontrolü olmalı. Kalıp:
           const auth = await authorizeAdminSession();
           if (!auth.ok) throw new Error("Yetkisiz");
         Bunu bir testle kilitleyin: tests/unit/server-action-guard.test.ts
         — `app/**/*.action.ts` dosyalarını tarayıp her export edilen
         async fonksiyonun gövdesinde guard çağrısı olduğunu doğrulasın
         (public-by-design dosyalar açık bir allow-list ile muaf tutulsun).
```

**Yetkisiz Server Action envanteri:**

| # | Dosya | Export'lar | Tip |
|---:|---|---|---|
| 1 | `maki-admin/manual-reservations/manual-reservation.action.ts` | create/update/**delete**ManualReservationAction, getVillaAvailabilitySnapshotAction | 🔴 mutasyon |
| 2 | `services/payment-account.action.ts` | get/create/update/**delete**/setActivePaymentAccountAction | 🔴 mutasyon |
| 3 | `services/western-union-account.action.ts` | — | 🔴 mutasyon |
| 4 | `services/payment-method.action.ts` | — | 🔴 mutasyon |
| 5 | `maki-admin/features/features.action.ts` | add/update/**delete**VillaFeatureAction | 🔴 mutasyon |
| 6 | `maki-admin/types/types.action.ts` | — | 🔴 mutasyon |
| 7 | `maki-admin/rules/rules.action.ts` | — | 🔴 mutasyon |
| 8 | `maki-admin/price-includes/price-includes.action.ts` | — | 🔴 mutasyon |
| 9 | `maki-admin/faqs/faqs.action.ts` | — | 🔴 mutasyon |
| 10 | `maki-admin/homepage-collection/homepage-collection.action.ts` | — | 🔴 mutasyon |
| 11 | `maki-admin/discount-collection/discount-collection.action.ts` | — | 🔴 mutasyon |
| 12 | `maki-admin/offer-requests/offer-requests.action.ts` | — | 🔴 mutasyon |
| 13 | `maki-admin/messages/messages.action.ts` | — | 🔴 mutasyon |
| 14 | `maki-admin/external-reservations/external-reservations.action.ts` | — | 🔴 mutasyon |
| 15 | `maki-admin/villas/[id]/_components/ical-sync.action.ts` | — | 🔴 mutasyon (+ dış ağ) |
| 16 | `maki-admin/villa-listesi/_components/shared-villa-list.action.ts` | — | 🔴 mutasyon |
| 17 | `services/property-owner.action.ts` | — | 🔴 mutasyon |
| 18 | `services/revalidate.actions.ts` | revalidateSettings/Menu/Villas/Taxonomy/Homepage/Discount/Faqs/VillaReviews | 🟠 cache purge (DoS) |
| 19 | `maki-admin/maki-finans/finance.action.ts` | getFinanceKpiSnapshotAction | 🟠 hassas okuma |
| 20 | `maki-admin/system-logs/system-logs.action.ts` | listMailLogsAction | 🟠 KVKK/PII okuma |
| 21 | `services/villa.action.ts` | getVillasByIdsAction, **getTrashedVillasAction**, getVillaBadgesAction | 🟠 hassas okuma |
| 22 | `maki-admin/villas/[id]/villa-edit.action.ts` | loadVillaEditData | 🟠 hassas okuma |
| 23 | `maki-admin/reservations/[id]/_effects/fetchBlockedDates.action.ts` | — | 🟡 okuma |
| 24 | `components/admin/villa-form/DiscountsSection.tsx` | inline action | 🟡 kontrol edilmeli |

**Guard'ı olan 21 dosya (referans/doğru örnek):** tüm `*-translations.action.ts` dosyaları, `gallery.action.ts`, `admin-gallery.action.ts`, `discount.action.ts`, `pricing.action.ts`, `settings.action.ts`, `villa-review.action.ts`.

**Public olması tasarım gereği olan 4 dosya (muaf):** `hero-filters.action.ts`, `hero-features.action.ts`, `villa-search.action.ts`, `(public)/favoriler/shared-favorites.action.ts`.

> 🟡 **MEDIUM — M-13:** `shared-favorites.action.ts` public olarak KAYIT OLUŞTURUYOR (`createSharedFavoritesListAction`) ve rate-limit'i yok. Spam/tablo şişmesi riski. `lib/rate-limit.ts` zaten mevcut; bir grup eklemek yeterli.

---

## 10. API YÜZEYİ, RATE LIMITING VE ABUSE KORUMASI

### 10.1 Public API rate-limit kapsaması

| Endpoint | Rate limit |
|---|---|
| `/api/public/reservations` | ✅ `reservation` (3/10dk/IP) |
| `/api/public/reservation-lookup` | ✅ `reservation_check` (10/10dk/IP) |
| `/api/public/contact` | ✅ `contact` (5/10dk/IP) |
| `/api/public/offer-requests` | ✅ `offer` (5/10dk/IP) |
| `/api/public/villas/[id]/availability` | ✅ `availability` (30/dk/IP) |
| `/api/public/villas/[id]/blocked-ranges` | ✅ |
| `/api/public/taxonomies` | ❌ **YOK** |
| `/api/public/payment-methods` | ❌ **YOK** |

### 10.2 🟡 MEDIUM — M-5: Rate limiter fail-open

```
DOSYA  : lib/rate-limit.ts
SATIR  : 224 (env yoksa her istek geçer), 252-256 (Upstash hatasında
         fail-open + console.error)
SORUN  : (a) UPSTASH_REDIS_REST_URL/TOKEN tanımlı değilse limiter
         tamamen devre dışı kalıyor ("open mode"), yalnızca bir
         console.warn basılıyor.
         (b) Upstash'e bağlanılamazsa istek geçiriliyor.
NEDEN  : Geliştirici deneyimi korunmak istenmiş (dosyanın yorumunda
         açıkça yazıyor).
ETKİ   : ⚠️ **Production'da bu env'lerin set olup olmadığı DOĞRULANAMADI.**
         Set değilse: rezervasyon, iletişim ve teklif formları
         tamamen korumasız → spam, mail bombardımanı (Resend kotası),
         DB şişmesi. Upstash kesintisinde aynı durum geçici olarak
         oluşur.
ÖNERİ  : (1) Production'da env eksikliğini fail-closed yapın:
         `NODE_ENV === "production" && !env` → 503 döndürün ya da en
         azından boot sırasında process'i durdurun. (2) Upstash
         hatasında yalnızca yazma uçları için (reservation/contact/
         offer/mail) fail-closed, okuma uçları için fail-open
         davranın. (3) Fail-open olayını Sentry'ye `captureMessage`
         ile bildirin — şu an yalnız console.error'a gidiyor.
         (4) `taxonomies` ve `payment-methods` uçlarına da limit ekleyin.
```

### 10.3 🟠 HIGH — H-11: Güvenlik başlıkları tanımlı değil

```
DOSYA  : next.config.ts
SATIR  : 46-63 — nextConfig yalnızca `images` içeriyor; `headers()` YOK
SORUN  : Content-Security-Policy, Strict-Transport-Security,
         X-Frame-Options / frame-ancestors, X-Content-Type-Options,
         Referrer-Policy, Permissions-Policy başlıklarının hiçbiri
         uygulama tarafından set edilmiyor.
NEDEN  : Hiç eklenmemiş.
ETKİ   : ⚠️ Bu başlıklar Cloudflare veya Coolify/Traefik tarafında
         set ediliyor olabilir — **DOĞRULANAMADI**. Set değilse:
         clickjacking'e karşı koruma yok, XSS'in etkisini sınırlayacak
         CSP yok, HSTS yok (SSL stripping), MIME sniffing açık.
         Proje 11 yerde `dangerouslySetInnerHTML` kullandığı için
         CSP'nin yokluğu özellikle önemli.
ÖNERİ  : `next.config.ts`'e `async headers()` ekleyin. CSP'yi önce
         `Content-Security-Policy-Report-Only` ile devreye alıp
         Sentry'ye rapor toplayın; kırılan yer kalmayınca zorlayıcı
         moda geçin. `frame-ancestors 'none'` ve
         `X-Content-Type-Options: nosniff` hemen eklenebilir
         (kırma riski yok).
```

---

## 11. GİRDİ DOĞRULAMA, XSS VE DOSYA YÜKLEME

### 11.1 🟠 HIGH — H-5: Storage upload endpoint'inde doğrulama eksikleri

```
DOSYA  : app/api/admin/storage/upload/route.ts
SATIR  : 48-124
SORUN  : Admin auth (satır 49-56) DOĞRU yapılıyor, ancak yüklenen
         dosya için:
           • BOYUT SINIRI YOK — `blob.arrayBuffer()` (satır 101) tüm
             dosyayı belleğe alıyor
           • MIME TÜRÜ ALLOW-LIST'İ YOK — `contentType` form
             alanından geliyor (satır 71-73) ve doğrulanmadan S3'e
             yazılıyor (satır 107)
           • `path` DOĞRULAMASI YOK — yalnız boş olup olmadığına
             bakılıyor (satır 92-97); rastgele bir object key
             yazılabiliyor
           • `upsert` İSTEMCİ KONTROLÜNDE (satır 76) — mevcut
             dosyaların üzerine yazılabiliyor
         Karşılaştırma: `app/api/admin/storage/remove/route.ts:31,65`
         bucket için allow-list uyguluyor; upload da bucket için
         uyguluyor (satır 43-46, 87-91) ama yalnız bucket için.
NEDEN  : Endpoint "admin zaten güvenilir" varsayımıyla yazılmış.
ETKİ   : • Büyük dosya → Node process'inde bellek tüketimi, OOM riski
           (tek bir istek sunucuyu düşürebilir)
         • `contentType: "text/html"` ile yüklenen bir dosya CDN'den
           HTML olarak servis edilirse depolanmış XSS. (Hafifletici:
           CDN ayrı alan adında — `cdn.villayagel.com` /
           `assets.villayagel.com` — bu yüzden ana siteye erişimi
           yok; yine de marka alanından zararlı içerik sunulur.)
         • Keyfi object key ile mevcut villa görsellerinin veya site
           logosunun üzerine yazılabilir (defacement)
         • Yetki modeli düz olduğu için (H-1) HERHANGİ bir admin bunu
           yapabilir
ÖNERİ  : (1) `blob.size` kontrolü — örn. 15 MB üst sınır, aşılırsa
             413. (2) MIME allow-list: image/jpeg, image/png,
             image/webp, image/avif, image/svg+xml (SVG'yi
             sanitize-html'den geçirin veya hiç kabul etmeyin).
             (3) Gerçek içerik türünü magic-byte ile doğrulayın,
             istemcinin beyanına güvenmeyin. (4) `path` için desen
             zorlayın: ^[a-z0-9][a-z0-9/_-]{0,200}\.(jpg|jpeg|png|webp|avif)$
             ve `..` içermesin. (5) `upsert`'i sunucuda karar verin,
             istemciden almayın. (6) Stream ile yükleyin
             (arrayBuffer yerine) ya da presigned URL'e geçin.
```

### 11.2 🟡 MEDIUM — M-1: Sanitize edilmeyen `dangerouslySetInnerHTML`

11 kullanımın 8'i doğru (`sanitizeHtml()` veya `StructuredData` JSON-LD). Üçü değil:

```
DOSYA  : app/components/villa/VillaMapModal.tsx
SATIR  : 209 — dangerouslySetInnerHTML={{ __html: mapEmbed as string }}
DOSYA  : app/components/private-villa/PrivateVillaPageBody.tsx
SATIR  : 732 — dangerouslySetInnerHTML={{ __html: villa.map_embed }}
SORUN  : `villa.map_embed` veritabanından geliyor ve HİÇ sanitize
         edilmiyor. (Aynı dosyalardaki `description` alanı doğru
         şekilde sanitizeHtml'den geçiriliyor — satır 377.)
NEDEN  : Alanın "Google Maps embed iframe'i" olacağı varsayılmış;
         ancak tür/şema düzeyinde bir kısıt yok.
ETKİ   : Depolanmış XSS. Kaynağı admin paneli olduğu için "admin
         zaten güvenilir" denebilir — ancak H-1 (düz yetki modeli) ve
         C-2 (yetkisiz action'lar) birleştiğinde, düşük yetkili veya
         kimliksiz bir aktör bu alanı yazabilirse TÜM PUBLIC
         ZİYARETÇİLER için script çalıştırılabilir olur. Ayrıca CSP
         de yok (H-11).
ÖNERİ  : `map_embed` için dar bir sanitize profili kullanın: yalnız
         <iframe> etiketi, yalnız `src` ile
         `https://www.google.com/maps/embed?...` deseni, diğer tüm
         öznitelikler ve etiketler atılsın. Bunu hem yazma (admin API)
         hem okuma (render) tarafında uygulayın.

DOSYA  : app/layout.tsx
SATIR  : 167 (customHead), 187 (analyticsScript)
SORUN  : Ayarlardan gelen ham HTML/script her sayfanın <head>'ine
         enjekte ediliyor.
NEDEN  : "Özel head / analitik kodu" özelliği bilinçli bir tasarım.
ETKİ   : Tasarım gereği güçlü bir yetki. Ancak bu, bir admin
         hesabının ele geçirilmesini SİTE ÇAPINDA tam XSS'e
         dönüştürür. Bu alanın yazılabildiği ucun en yüksek koruma
         seviyesinde olması gerekir.
ÖNERİ  : Bu iki ayarı değiştiren ucu ayrı ve en dar yetkiye bağlayın
         (H-1 çözümünün bir parçası), değişiklikleri admin activity
         log'una yazın ve mümkünse 2FA re-auth isteyin.
```

### 11.3 ⚪ INFO — SSRF koruması: iyi tasarlanmış

`lib/security/ssrf.ts` + `lib/security/ssrf.server.ts`:
- Allow-list yerine **denylist** yaklaşımı (küçük acenteler / özel takvim alan adları çalışmaya devam etsin diye) — iş gereksinimiyle uyumlu, bilinçli bir karar.
- Protokol allow-list (`http:`/`https:`), userinfo reddi, hostname blocklist (`localhost`, `0.0.0.0`, …), suffix blocklist (`.local`, `.internal`, `.corp`, `.home.arpa`, …), private IPv4/IPv6 aralıkları, **DNS çözümleme sonrası tekrar kontrol**, redirect takibi ve sayısı sınırı.
- Kullanıcıya dönen hata mesajı iç IP sızdırmıyor (`SAFE_REJECT_MESSAGE`).
- Kullanım: `external-calendar-source.service.ts:3` (istemci, statik) ve `external-calendar.service.ts:6` (sunucu, DNS'li).

### 11.4 🟡 MEDIUM — M-4: `next/image` remotePatterns fazla geniş

```
DOSYA  : next.config.ts
SATIR  : 43 — const LEGACY_ASSET_HOST = "**.supabase.co";
         48-58 — remotePatterns: legacy host + CDN host'ları pathname "/**"
SORUN  : `**.supabase.co` joker alan adı, o alan adındaki HERHANGİ bir
         alt alan adından görsel optimize edilmesine izin veriyor.
NEDEN  : Dosyada açıkça belgelenmiş: DB'de hâlâ eski sağlayıcının tam
         URL'lerini tutan satırlar olabilir; pattern kaldırılırsa
         next/image hard error verir. Kaldırma koşulu da yazılmış.
ETKİ   : Üçüncü taraf, sizin sunucunuzu görsel optimizasyon proxy'si
         olarak kullanabilir (bant genişliği ve CPU tüketimi). Ayrıca
         bu projenin Next sürümü Image Optimization API'sinde
         **CRITICAL RCE** ve DoS açıkları taşıyor (bkz. C-1) — bu
         yüzeyin dar tutulması ayrıca önemli.
ÖNERİ  : DB'deki asset alanlarını R2 bucket-relative path'e normalize
         eden tek seferlik bir veri temizliği yapın (migration değil,
         script), sonra bu pattern'i kaldırın. Dosyadaki not bu işi
         zaten "KALDIRMA KOŞULU" olarak tarif ediyor.
```

### 11.5 🔵 LOW — L-9: PII konsola yazılıyor

```
DOSYA  : app/api/admin/create-user/route.ts:131 — { email, error: msg }
         app/api/mail/voucher/route.ts:77 — MISSING_EMAIL
         app/api/mail/payment-link/route.ts:140
         app/api/mail/payment-confirmed/route.ts:153
         app/api/mail/western-union-payment/route.ts:121
SORUN  : Hata loglarında müşteri/admin e-posta adresleri düz metin.
ETKİ   : Sunucu logları KVKK kapsamında kişisel veri içeriyor; log
         erişimi olan herkes bu veriyi görüyor. Loglar Sentry'ye veya
         bir log toplayıcıya akıyorsa veri üçüncü tarafa gidiyor.
ÖNERİ  : Log'a hash veya maskeleme yazın (`ab***@example.com`).
         Sentry `beforeSend` içinde e-posta desenini redakte edin.
```

---

## 12. BAĞIMLILIK GÜVENLİĞİ

### 12.1 🔴 CRITICAL — C-1: Next.js 16.2.4 — RCE + middleware bypass zinciri

```
DOSYA  : package.json — "next": "16.2.4" (kurulu sürüm de 16.2.4)
KOMUT  : npm audit → 48 açık: 2 critical, 10 high, 36 moderate
SORUN  : Kullanılan Next.js sürümü aşağıdaki açıkları taşıyor:
```

**CRITICAL:**

| Açık | Etkilenen | Düzeltildi |
|---|---|---|
| **Kimlik doğrulaması gerektirmeyen uzaktan kod çalıştırma (RCE)** — Image Optimization API, AVIF dosyaları | `>=16.0.0 <16.3.3` | **16.3.3** |
| Windows sunucularda kimlik doğrulaması gerektirmeyen RCE | `>=16.0.0 <16.3.3` | 16.3.3 |

**HIGH — bu projeyi doğrudan ilgilendirenler:**

| Açık | Düzeltildi | Neden kritik |
|---|---|---|
| **Middleware / Proxy bypass — App Router, segment-prefetch route'ları** | 16.2.5 / 16.2.6 | 🔴 Admin kapısı **yalnızca** middleware |
| **Middleware / Proxy bypass — dinamik route parametresi enjeksiyonu** | 16.2.5 | 🔴 Aynı |
| **Middleware / Proxy bypass — Turbopack + tek locale** | 16.2.11 | 🔴 Aynı |
| **Middleware / Proxy bypass — Pages Router i18n** | 16.2.5 | 🔴 Aynı |
| **Server Actions'ta SSRF (özel sunucular)** | 16.2.11 | Coolify/Hetzner'de özel sunucu kullanımı **DOĞRULANAMADI** |
| **Server Actions'ta DoS (App Router)** | 16.2.11 | 45 action var |
| Rewrites'ta SSRF (saldırgan kontrollü hedef hostname) | 16.2.11 | |
| WebSocket upgrade'lerde SSRF | 16.2.5 | |
| Server Components ile DoS | 16.2.5 | Public sayfaların çoğu RSC |
| Cache Components — bağlantı tüketimiyle DoS | 16.2.5 | |

**MODERATE — dikkat çekenler:**

| Açık | Düzeltildi |
|---|---|
| **İç Server Function endpoint'lerinin kimlik doğrulamasız ifşası** | 16.2.11 |
| Image Optimization API'de SVG ile DoS | 16.2.11 |
| Edge runtime'da sınırsız Server Action payload | 16.2.11 |
| CSP nonce kullanan App Router uygulamalarında XSS | 16.2.5 |
| RSC yanıtlarında cache poisoning | 16.2.5 |

```
NEDEN  : Sürüm sabitlenmiş ("next": "16.2.4", caret yok) ve
         güncelleme yapılmamış. CI'da audit adımı olmadığı için
         (H-8) bu açıklar hiçbir yerde görünmüyor.
ETKİ   : 🔴 **"İç Server Function endpoint'lerinin ifşası" + C-2
         (yetkisiz action'lar) birleşince tam bir istismar zinciri
         oluşuyor:** saldırgan action ID'lerini keşfeder, sonra
         yetkilendirilmemiş mutasyon action'larını doğrudan çağırır.
         Ayrıca 5 ayrı middleware bypass açığı, bu projenin TEK admin
         kapısını (middleware.ts) hedefliyor.
ÖNERİ  : 🚨 **En yüksek öncelik. `next` sürümünü en az 16.3.3'e
         yükseltin.** 16.2.4 → 16.3.x minor bir atlama; breaking
         change riski düşük ama sıfır değil. Yükseltme sonrası:
         tsc + lint + tam test paketi + manuel duman testi
         (ana sayfa, /arama, /kiralik-villa/[slug], rezervasyon akışı,
         admin login + 2FA).
```

### 12.2 🟠 HIGH — H-12: Diğer yüksek seviyeli bağımlılık açıkları

| Paket | Kurulu | Açık | Düzeltildi |
|---|---|---|---|
| `sharp` | 0.34.5 | libheif/libvips açıkları (CVE-2026-33327/33328/35590/35591) | 0.35.4 |
| `@tiptap/core` | 3.26.x | Markdown attribute parsing'de kuadratik ReDoS; `mergeAttributes()` prototype kirliliği | 3.30.5 |
| `sanitize-html` | **2.17.5** | **Mutation-XSS / allowedTags bypass (`</textarea/>`)**; SVG SMIL URI-list bypass | >2.17.6 |
| `fast-xml-parser` | 5.7.x | Tekrarlı DOCTYPE ile entity expansion limiti sıfırlanması | 5.10.1 |
| `postcss` | <8.5.22 | sourceMappingURL ile keyfi `.map` dosyası okuma | 8.5.22+ |
| `js-yaml`, `nanoid`, `brace-expansion`, `browserslist`, `fast-uri`, `vite` | — | DoS / SSRF / host confusion | — |
| `vitest` | 2.1.9 | **CRITICAL** — UI sunucusu dinliyorken keyfi dosya okuma/çalıştırma | 3.2.6+ |

> **`sanitize-html` özellikle önemli:** bu paket projenin blog gövdesi, villa açıklaması ve private villa açıklaması için TEK XSS savunması. Kurulu sürüm (2.17.5) `allowedTags` bypass açığını taşıyor.
> **`vitest` yalnızca dev bağımlılığı** ve `vitest --ui` kullanılmıyor → pratik risk düşük, ama yine de güncellenmeli.

```
ÖNERİ  : Faz 0'da: npm audit fix (breaking olmayanlar), ardından
         sanitize-html, sharp, @tiptap/*, fast-xml-parser'ı elle
         yükseltin. Her yükseltmeden sonra tam test paketi.
         Faz 1'de: CI'ya `npm audit --audit-level=high` adımı ekleyin
         ki bu durum bir daha sessizce birikmesin.
```

### 12.3 🔵 LOW — Kullanılan ama ağır bağımlılıklar

| Paket | node_modules boyutu | Nerede |
|---|---:|---|
| `react-datepicker` | 32 MB | 6 client dosyası |
| `country-state-city` | **17 MB** | 3 dosya — biri **public rezervasyon formu** |
| `@tiptap/*` | 8,8 MB | 1 client dosyası (admin editör) |
| `leaflet` + `react-leaflet` | 3,9 MB | 2 client dosyası |

`react-day-picker@8` ve `react-datepicker@9` **aynı anda** kullanılıyor — iki ayrı takvim kütüphanesi. Birleştirme fırsatı (bkz. §15).

---

## 13. GİZLİ BİLGİ / KONFİGÜRASYON / ORTAM DEĞİŞKENİ YÖNETİMİ

### 13.1 ✅ İstemciye sızan gizli bilgi yok

Kod tabanında client bileşenlerinden okunan **tek** `process.env` değişkenleri `NEXT_PUBLIC_` önekli olanlar:

| Değişken | Kullanım |
|---|---:|
| `NEXT_PUBLIC_SITE_URL` | 19 |
| `NEXT_PUBLIC_VERCEL_URL` | 8 |
| `NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES` | 2 |
| `NEXT_PUBLIC_CDN_BASE_SITE_ASSETS` | 2 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry (DSN public olmalı — doğru) |
| `NEXT_PUBLIC_AUTH_PROVIDER` | 1 |

Gizli değerler (`AUTH_JWT_SECRET`, `TOTP_ENCRYPTION_SECRET`, `DATABASE_URL`, `S3_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `UPSTASH_*`) yalnızca `import "server-only"` zincirindeki dosyalarda okunuyor. `.gitignore:34` `.env*` satırını içeriyor ve `git ls-files` çıktısında hiçbir env dosyası yok. **Bu tarafta bulgu yok.**

### 13.2 🟠 HIGH — H-10: `.env.example` eksik — sessiz bozuk deploy riski

```
DOSYA  : .env.example
SORUN  : Kodda kullanılan 34 ortam değişkeninden 7'si .env.example'da
         YOK:
           S3_ACCESS_KEY_ID
           S3_SECRET_ACCESS_KEY
           S3_ENDPOINT
           S3_REGION
           NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES
           NEXT_PUBLIC_CDN_BASE_SITE_ASSETS
           MAIL_ADMIN_NOTIFY_TO
NEDEN  : R2/S3 ve CDN entegrasyonu .env.example güncellenmeden eklenmiş.
ETKİ   : Yeni bir ortam (staging, yeni sunucu, felaket kurtarma)
         kurulurken bu 7 değişken atlanır. Sonuç:
           • S3_* eksik → tüm görsel yüklemeleri sessizce başarısız
           • CDN_BASE_* eksik → next.config.ts fallback'e düşer
             (`cdn.villayagel.com`), yanlış ortamda yanlış CDN
           • MAIL_ADMIN_NOTIFY_TO eksik → admin bildirim maili gitmez
         Bunların hiçbiri boot sırasında hata vermiyor — yalnızca
         çalışma anında sessizce bozuluyor.
ÖNERİ  : (1) Eksik 7 anahtarı .env.example'a ekleyin (değer değil,
         yalnızca anahtar + açıklama). (2) Daha kalıcı çözüm:
         `lib/env.ts` içinde bir başlangıç doğrulaması yapın — zorunlu
         anahtarlar eksikse uygulama boot'ta açık bir hata mesajıyla
         dursun. `DATABASE_URL` ve `AUTH_JWT_SECRET` için bu zaten
         yapılıyor (pg.client.ts:54, jwt.ts:49); aynı kalıbı
         yaygınlaştırın. (3) Bir testle kilitleyin: kodda geçen tüm
         `process.env.X` anahtarları .env.example'da var mı?
```

---

## 14. PERFORMANS — SUNUCU TARAFI VE VERİ ERİŞİMİ

### 14.1 🟠 HIGH — H-3: Bellek içi sayfalama (SQL `LIMIT`/`OFFSET` yok)

```
DOSYA  : app/components/search/AramaPageBody.tsx
SATIR  : 871  — const total = visibleVillas.length;
         1031 — const totalPages = Math.max(1, Math.ceil(total / pageSize));
         1033 — const sliceStart = (currentPage - 1) * pageSize;
         1034 — const villasOnPage = sortedVillas.slice(sliceStart, sliceStart + pageSize);
İLGİLİ : lib/db/villa.repository.server.ts:466 findSearchResults —
         top-level LIMIT / OFFSET / COUNT yok; yalnız
         `.limit(1, { referencedTable: "villa_images" })` (kapak görseli)
SORUN  : Arama sonucu sayfalaması tamamen JavaScript'te yapılıyor:
         eşleşen TÜM villalar embed'leriyle birlikte (fiyatlar,
         indirimler, görseller, tip/bölge ilişkileri) belleğe
         çekiliyor, sonra filtreleniyor, sıralanıyor ve dilimleniyor.
         Aynı kalıp KiralikVillalarPageBody'de de var.
NEDEN  : Filtrelerin bir kısmı (availability, para birimi dönüşümlü
         fiyat sıralaması, esnek tarih) SQL'de değil JS'te
         hesaplanıyor; bu yüzden veri kümesi daraltılmadan çekilmek
         zorunda kalıyor. Bu, eski sağlayıcıdan taşınırken korunmuş
         bir davranış.
ETKİ   : İstek başına maliyet villa sayısıyla DOĞRUSAL artıyor:
         DB'den transfer, JSON parse, JS bellek, GC baskısı.
         Her iki sayfa da `force-dynamic` (yani ÖNBELLEK YOK —
         bkz. §16), dolayısıyla bu maliyet HER İSTEKTE ödeniyor.
         ⚠️ **Mevcut villa sayısı DOĞRULANAMADI** — 100 villada
         fark edilmez, 1.000 villada belirgin, 5.000 villada
         kabul edilemez olur.
ÖNERİ  : Aşamalı:
         (1) ÖNCE ÖLÇÜN: villa sayısını ve /arama yanıt süresini
             öğrenin — bu bulgunun aciliyeti tamamen buna bağlı.
         (2) SQL'e taşınabilecek filtreler: kategori/bölge/özellik
             kesişimi (zaten ID listesi olarak hesaplanıyor →
             `WHERE id = ANY($1)` ile sorguya verilebilir), misafir
             sayısı, aktiflik.
         (3) Availability filtresi zaten toplu (`getBlockedVillaIds`);
             bu ID listesi de `NOT IN` olarak sorguya girebilir.
         (4) Geriye kalan JS-only sıralamalar (kur dönüşümlü fiyat)
             için: fiyatları tek para biriminde tutan bir
             materialized view veya türetilmiş kolon değerlendirin.
         (5) Son adımda SQL `LIMIT/OFFSET` + ayrı `COUNT(*)`.
         Her adım mevcut locale route testleriyle doğrulanabilir.
```

### 14.2 🟡 MEDIUM — Aşırı veri çekimi (`select("*")` + embed)

§5.2'deki M-8 bulgusunun performans yüzü: `findSearchResults` her villa için `villa_prices`, `villa_discounts`, `villa_images` embed'lerini korelasyonlu alt sorgularla çekiyor. Bu tasarım tek round-trip sağladığı için N+1'den iyidir; ancak §14.1 ile birleşince "tüm villalar × tüm fiyat satırları" hacmine ulaşıyor.

### 14.3 ⚪ INFO — N+1 sorgu kalıbı bulunamadı

Taramada döngü içinde `await` yapan yalnızca **1** yer bulundu (`app/services/villa-admin/_helpers/storage-cleanup.ts:53` — bucket'a göre gruplanmış, kabul edilebilir). `.map(async ...)` kalıbı **hiç yok**. 102 `Promise.all` kullanımı var. Bu, veri erişimi tarafında bilinçli bir paralelleştirme disiplinini gösteriyor.

### 14.4 ⚪ INFO — Bağlantı havuzu

```
DOSYA : lib/db/pg.client.ts:61-63
        max: PG_POOL_MAX || 10
        idleTimeoutMillis: 30.000
        connectionTimeoutMillis: 10.000
```
Havuz singleton (satır 84, globalThis üzerinde). Varsayılan 10 bağlantı; ⚠️ **production'da `PG_POOL_MAX`'ın ne olduğu ve PostgreSQL `max_connections` ile uyumu DOĞRULANAMADI.** Next.js her rota için ayrı process kullanmadığı sürece 10 makul; ancak Coolify'de birden fazla replika varsa toplam bağlantı sayısı çarpılır.

---

## 15. PERFORMANS — İSTEMCİ TARAFI VE BUNDLE

### 15.1 🟠 HIGH — H-4: Public rezervasyon sayfasında 640 KB'lık `country-state-city` chunk'ı

```
DOSYA  : app/components/reservation/ReservationForm.tsx
SATIR  : 11 — import { Country, State } from "country-state-city";
KANIT  : .next/static/chunks/0q4l79c-3c1c_.js — 640 KB, içinde
         `isoCode` alanları (ülke/eyalet veri seti) doğrulandı.
         Bu chunk'ı yükleyen route'lar:
           .next/server/app/(public)/rezervasyon/[slug]/page_client-reference-manifest.js
           .next/server/app/(public)/en/rezervasyon/[slug]/...
           .next/server/app/(public)/de/rezervasyon/[slug]/...
           .next/server/app/(admin)/maki-admin/reservations/ekle/...
           .next/server/app/(admin)/maki-admin/reservations/[id]/...
SORUN  : Ülke + eyalet veri setinin tamamı, dönüşümün en kritik
         sayfası olan public rezervasyon formuna statik import ile
         dahil ediliyor. Tüm static/chunks dizini 4,9 MB; bu tek
         chunk onun %13'ü.
NEDEN  : `import { Country, State } from "country-state-city"` statik;
         paket tree-shake edilemiyor (veri JSON olarak modülün içinde).
ETKİ   : Mobil 4G'de 640 KB ≈ 2-4 sn ek indirme + parse. Rezervasyon
         formu sayfası, ziyaretçinin ödeme yapmaya en yakın olduğu
         sayfa — burada yaşanan her gecikme doğrudan dönüşüm kaybı.
         Core Web Vitals'ta LCP ve INP'yi olumsuz etkiler.
ÖNERİ  : Üç seçenek, etkisi artan sırayla:
         (1) HIZLI: `next/dynamic` ile ülke/şehir adımını lazy yükleyin
             — kullanıcı o adıma gelene kadar indirilmesin.
         (2) DAHA İYİ: Ülke listesini sunucudan küçük bir JSON olarak
             verin (yalnız {code, name}, ~5 KB); eyalet/şehir listesini
             ülke seçilince bir API ucundan çekin.
         (3) EN İYİ: Hedef pazarınız TR ağırlıklıysa, desteklenen
             ülkeleri bir allow-list'e indirin — veri seti birkaç KB'a
             düşer.
         Admin tarafında (reservations/ekle, reservations/[id]) sorun
         daha küçük ama aynı çözüm uygulanabilir.
```

### 15.2 🟡 MEDIUM — M-14: İki ayrı takvim kütüphanesi

`react-day-picker@8.10.2` (public booking takvimleri) ve `react-datepicker@9` (6 client dosyası) aynı anda pakette. İkisi de kendi CSS'i ve tarih mantığıyla geliyor. Tek bir kütüphaneye indirmek hem bundle hem tutarlılık kazancı sağlar. (Bu oturumda public modallardaki takvim davranışı yeni yeni birleştirildi — devamı doğal bir sonraki adım.)

### 15.3 🔵 LOW — L-5: Dört Google font ailesi

```
DOSYA : app/layout.tsx:2
        import { Outfit, Inter, Fraunces, Geist_Mono } from "next/font/google";
```
`next/font` self-host + `display: swap` + metrik-eşleşen fallback doğru kullanılmış (globals.css:109'da belgelenmiş). Yine de 4 aile, her biri birkaç ağırlıkla, ilk yükleme maliyeti demektir. `Geist_Mono`'nun public tarafta gerçekten kullanılıp kullanılmadığını kontrol edip gereksizse kaldırmak kolay bir kazanç.

### 15.4 🔵 LOW — Görsel kullanımı

| Metrik | Değer |
|---|---:|
| `next/image` import eden dosya | 12 |
| `<Image` kullanımı | 34 |
| `priority` | 15 |
| `loading="lazy"` | 16 |
| `sizes=` | 14 |
| Ham `<img>` (eslint-disable ile) | 40 nokta |

`sizes` yalnızca 14 yerde tanımlı; `fill` kullanan responsive görsellerde `sizes` yoksa tarayıcı en büyük varyantı indirir. Kart ızgaralarında (`VillaCard`) doğru `sizes` tanımı gözle görülür bant genişliği tasarrufu sağlar.

### 15.5 🔵 LOW — Memoizasyon

`useMemo` 115, `useCallback` 69 kullanımı var ama `React.memo` / `memo()` **hiç yok**. 1.641 satırlık `VillaCard` gibi listede onlarca kez render edilen bileşenlerde `memo` ölçülebilir fayda sağlayabilir. (Önce ölçün — React 19 compiler optimizasyonları devredeyse fark küçülebilir.)

### 15.6 ⚪ INFO — Lazy loading kullanımı

`next/dynamic` 8 yerde kullanılıyor, `<Suspense>` yalnız 2 yerde. Ağır client bileşenleri (leaflet haritası, tiptap editörü) için dynamic import doğrulanmalı — tiptap yalnız 1 client dosyasında, bu iyi bir izolasyon işareti.

---

## 16. ÖNBELLEKLEME (CACHE) VE YENİDEN DOĞRULAMA STRATEJİSİ

### 16.1 Mevcut durum

`lib/cache.helpers.ts` (918 satır) **34 `unstable_cache` sarmalayıcısı** tanımlıyor, 8 tag'e bölünmüş:

| Tag | TTL | Kapsam |
|---|---:|---|
| `settings` | 3600 sn | Site ayarları |
| `menu` | 3600 sn | Menü (+ CMS sayfaları) |
| `taxonomy` | 3600 sn | Villa tipleri / bölgeler |
| `faqs` | 3600 sn | Global SSS |
| `villas` | 600 sn | Villa listeleri |
| `homepage` | 600 sn | Ana sayfa koleksiyonu |
| `discount` | 600 sn | İndirimli koleksiyon |
| `villa-reviews` | 600 / 3600 sn | Yorumlar ve istatistikler |

`app/services/revalidate.actions.ts` her tag için `revalidateTag(tag, { expire: 0 })` sunuyor; admin CRUD sonrası çağrılıyor. Tag ↔ helper eşleşmesi dosya başında belgelenmiş. **Bu kısım iyi tasarlanmış.**

### 16.2 🟡 MEDIUM — M-15: `force-dynamic` aşırı yaygın

```
DOSYA  : 82 dosyada `export const dynamic`, 95 yerde "force-dynamic"
         Public sayfalarda 15 dosya:
           (public)/arama/page.tsx (+ en, de)
           (public)/blog/[slug]/page.tsx (+ en, de)
           (public)/kisa-sureli-tarihler/[ay]/[gece]/page.tsx (+ en, de)
           (public)/liste/[token]/page.tsx (+ en, de)
           (public)/favoriler/paylas/[token]/page.tsx (+ en, de)
SORUN  : `/arama` ve `/blog/[slug]` gibi sayfalar tamamen dinamik.
         Tüm projede `export const revalidate` yalnızca 1 kez
         kullanılmış. Route seviyesinde ISR yok.
NEDEN  : Token'lı ve kullanıcı durumlu sayfalar için force-dynamic
         DOĞRU (favoriler, liste, paylas). Ancak blog detayı ve
         kısa-süreli-tarihler sayfaları için gerekçe net değil.
ETKİ   : `/arama` için kaçınılmaz (query-bağımlı) ve §14.1'deki
         maliyetle birleşiyor. `/blog/[slug]` her istekte DB'ye
         gidiyor — oysa içerik nadiren değişiyor ve `revalidateTag`
         altyapısı zaten hazır.
ÖNERİ  : Blog detayını `unstable_cache` + bir `blog` tag'i ile
         sarmalayıp force-dynamic'i kaldırın; admin blog CRUD'unda
         `revalidateTag("blog")` çağırın. (`app/api/admin/blog/[id]/
         route.ts` zaten 3 yerde `revalidatePath` kullanıyor — tag'e
         çevirmek daha isabetli olur.) `kisa-sureli-tarihler` için
         `villa_short_gaps` tablosu zaten bir cron ile tazeleniyor;
         orada ISR (`revalidate: 3600`) uygun.
```

### 16.3 🟠 Cache purge yüzeyi (C-2 ile bağlantılı)

`revalidate.actions.ts`'teki 8 action'ın hiçbirinde yetki kontrolü yok. Bir saldırgan bunları döngüde çağırarak tüm cache'i sürekli geçersiz kılabilir → her istek tam DB sorgusuna düşer → §14.1'deki bellek-içi sayfalama maliyeti tam kapasiteyle ödenir. **Bu, C-2 + H-3'ün birleşik bir DoS vektörüdür.**

---

## 17. HATA YÖNETİMİ, GÖZLEMLENEBİLİRLİK VE DAYANIKLILIK

### 17.1 🟠 HIGH — H-6: Hiçbir error / loading sınırı yok

```
DOSYA  : app/ (tüm ağaç)
KANIT  : error.tsx        → 0 dosya
         global-error.tsx → 0 dosya
         loading.tsx      → 0 dosya
         not-found.tsx    → 1 dosya (app/not-found.tsx)
         <Suspense>       → 2 kullanım
         ErrorBoundary    → 0 dosya
SORUN  : App Router'ın hata ve yükleme sınırlarının hiçbiri
         tanımlanmamış.
NEDEN  : Eklenmemiş.
ETKİ   : (a) Bir RSC veya client bileşeni render sırasında hata
         fırlatırsa kullanıcı Next.js'in markasız varsayılan hata
         ekranını görür ("Application error: a client-side exception
         has occurred"). Bir villa detay sayfasındaki tek bir bozuk
         veri satırı, kullanıcı için tam bir çıkmaz sokak yaratır —
         geri dönüş, yeniden dene, destek bağlantısı yok.
         (b) `loading.tsx` olmadığı için force-dynamic sayfalarda
         (özellikle /arama, ki DB işi ağır) navigasyon sırasında
         ekran donuk kalır; kullanıcı tıklamanın işlediğini anlamaz.
         (c) Client tarafı render hataları Sentry'ye React error
         boundary üzerinden zenginleştirilmiş bağlamla gitmez.
ÖNERİ  : (1) `app/global-error.tsx` — markalı, Sentry'ye raporlayan,
             "yeniden dene" butonlu bir sayfa.
         (2) `app/(public)/error.tsx` ve `app/(admin)/error.tsx` —
             segment bazlı.
         (3) En az `app/(public)/arama/loading.tsx`,
             `kiralik-villalar/loading.tsx` ve
             `kiralik-villa/[slug]/loading.tsx` — iskelet (skeleton) UI.
         Bunlar düşük riskli, yüksek etkili eklemelerdir.
```

### 17.2 🟡 MEDIUM — M-3: Sentry yapılandırması eksik

```
DOSYA  : sentry.server.config.ts:26, sentry.edge.config.ts:21,
         instrumentation-client.ts:46-47 → tracesSampleRate: 0,
         profilesSampleRate: 0, replaysSessionSampleRate: 0
         next.config.ts → withSentryConfig KULLANILMIYOR
         sentry.client.config.ts → ÖLÜ DOSYA (kendi içinde
           "rm sentry.client.config.ts" notu var, satır 17)
         instrumentation-client.ts:8-12 → üretime giden
           GEÇİCİ tanı amaçlı console.log
SORUN  : (a) `withSentryConfig` olmadan **source map yüklenmiyor** →
             Sentry'deki tüm stack trace'ler minify edilmiş, okunamaz.
         (b) Tracing tamamen kapalı → hangi sayfanın/sorgunun yavaş
             olduğu görülemiyor (§14'teki performans bulgularını
             ölçmenin en doğal yolu bu olurdu).
         (c) `sentry.client.config.ts` ölü dosya olarak duruyor —
             yeni gelen geliştirici için kafa karışıklığı.
         (d) Tanı amaçlı `console.log("[instrumentation-client]
             LOADED", "DSN_present=" + Boolean(...))` her ziyaretçinin
             konsoluna basılıyor; dosyanın kendi yorumu "çözüm sonrası
             bu 3 satır geri çıkarılmalı" diyor.
NEDEN  : Sentry aşamalı olarak kurulmuş ("ERROR-ONLY MINIMAL FAZ") ve
         faz tamamlanmamış.
ETKİ   : Production'da bir hata alındığında kök neden analizi
         (minify edilmiş trace yüzünden) çok zor. Performans
         regresyonları görünmez.
ÖNERİ  : (1) `next.config.ts`'i `withSentryConfig` ile sarın ve
             source map yüklemeyi açın (auth token gerekir).
         (2) `tracesSampleRate` için düşük bir örnekleme başlatın
             (0.05-0.1) — maliyeti düşük, görünürlük kazancı yüksek.
         (3) `sentry.client.config.ts`'i silin.
         (4) Tanı console.log'unu kaldırın.
         ✅ Olumlu: `onRequestError = Sentry.captureRequestError`
            (instrumentation.ts) doğru kurulmuş — RSC ve route
            handler hataları yakalanıyor. `beforeSend`/`ignoreErrors`
            ile beklenen 4xx gürültüsü filtreleniyor — iyi bir uygulama.
```

### 17.3 🔵 LOW — L-3: 153 boş `catch` bloğu

```
DOSYA  : app + lib genelinde 153 nokta (`catch {}` / `catch (e) {}`)
SORUN  : Hata yutuluyor; ne log ne Sentry.
NEDEN  : Çoğu savunmacı kod (örn. JSON parse, clipboard API,
         opsiyonel alan okuma) — birçoğu meşru.
ETKİ   : Meşru olanların arasında gerçek bir hatayı gizleyen bir
         tanesi olursa fark edilmez. 450 `console.error` ve 72
         `console.warn` ile karşılaştırıldığında kod tabanının
         genel eğilimi loglamak yönünde — bu 153 nokta istisna.
ÖNERİ  : Toplu bir refactor gerekmez. ESLint'e
         `no-empty` (allowEmptyCatch: false) ekleyip WARN olarak
         açın; yeni boş catch'ler engellenir, mevcutlar zamanla
         `/* bilinçli: sebep */` yorumuyla veya bir log satırıyla
         kapatılır.
```

### 17.4 ⚪ INFO — Fail-soft tasarım tercihleri

Kod tabanında bilinçli fail-soft kalıpları var: `loadHeroFeatures(locale).catch(() => [])`, sitemap'in fail-soft veri okuması, `robots.ts`'te `NEXT_PUBLIC_SITE_URL` yoksa host/sitemap referansını atlama. Bunlar doğru kararlar; her biri kod içinde gerekçelendirilmiş.

---

## 18. KOD KALİTESİ, TİP GÜVENLİĞİ VE LINT DURUMU

### 18.1 ✅ Tip güvenliği

```
KOMUT : npx tsc --noEmit -p tsconfig.json
SONUÇ : exit 0 — 0 hata
```

| Ayar | Değer | Not |
|---|---|---|
| `strict` | **true** | ✅ |
| `noEmit` | true | ✅ |
| `skipLibCheck` | true | Kabul edilebilir |
| `target` | ES2017 | Node 22 için gereksiz muhafazakâr; ES2022 daha küçük çıktı verir |
| `moduleResolution` | bundler | ✅ |
| `@ts-ignore` / `@ts-expect-error` | **0** | ✅ Örnek düzeyde temiz |
| `as any` / `: any` | 115 nokta | 🟡 |

### 18.2 ✅ Lint

```
KOMUT : npx eslint .
SONUÇ : exit 0 — 200 problem (0 hata, 200 uyarı)
        29'u --fix ile düzelebilir
```

| Kural | Uyarı |
|---|---:|
| `@typescript-eslint/no-explicit-any` | 67 |
| `react-hooks/set-state-in-effect` | 59 |
| `react/no-unescaped-entities` | 18 |
| `react-hooks/exhaustive-deps` | 15 |
| `@typescript-eslint/no-unused-vars` | 14 |
| `@next/next/no-img-element` | 2 |
| `jsx-a11y/role-supports-aria-props` | 1 |

Ayrıca **137 satır içi `eslint-disable`**: 56 `no-explicit-any`, 40 `no-img-element`, 23 `exhaustive-deps`, 5 `set-state-in-effect`, 1 `react/no-danger`, 1 `no-console`.

### 18.3 🟡 MEDIUM — M-10: ESLint config'inin beyanı ile gerçek davranışı uyuşmuyor

```
DOSYA  : eslint.config.mjs
SATIR  : 18-22 — yorum bloğu: "✅ KEEP ERROR — gerçek bug potansiyeli:
         • react-hooks/exhaustive-deps (stale closure) ..."
         65-73 — rules bloğunda `exhaustive-deps` override'ı YOK
SORUN  : Config'in başındaki politika yorumu `exhaustive-deps`'in
         ERROR seviyesinde tutulduğunu söylüyor; gerçekte
         `eslint-config-next` varsayılanı olan **warn** seviyesinde
         çalışıyor (lint çıktısı: 15 uyarı, 0 hata).
NEDEN  : Override eklenmemiş, yorum güncellenmemiş.
ETKİ   : Ekip, "stale closure" sınıfı hataların CI/lint tarafından
         yakalandığına inanıyor; yakalanmıyor. 23 ayrı
         `eslint-disable-next-line react-hooks/exhaustive-deps`
         satırı da mevcut.
ÖNERİ  : Ya kuralı gerçekten `"error"` yapın (önce 15 uyarıyı
         temizleyerek), ya da yorumu gerçeğe uydurun. İkisinden
         birini seçin — belge ile davranışın ayrışması en tehlikeli
         durumdur.
```

### 18.4 🔵 LOW — L-4: Lint kapısı yok

`npx eslint .` 200 uyarıyla **exit 0** dönüyor. `--max-warnings` sınırı tanımlı değil ve zaten CI de yok (H-8). Dolayısıyla uyarı sayısı serbestçe artabilir. (Bu oturumdaki çalışmada uyarı sayısının tam 200'de tutulması bilinçli bir disiplindi — ama bu disiplin araçla değil, insanla sağlanıyor.)

**Öneri:** CI'ya `eslint . --max-warnings 200` ekleyin ve zamanla sayıyı düşürün. Böylece mevcut borç dondurulur, yenisi eklenemez.

### 18.5 🔵 LOW — L-10: Açıklama yoğunluğu (%22,1)

Kod tabanının beşte birinden fazlası yorum. Bu **büyük ölçüde bir güçlü yön**: her kritik karar (neden `select("*")` korundu, neden `.or()` quoting'i gerekli, neden ayrı bir `hero-features.action.ts` dosyası açıldı) kodun yanında belgelenmiş. Ancak bir kısmı artık geçersiz durumu anlatıyor:

- `app/components/ui/toast/*.tsx` — üç dosya "sandbox permission kısıtı nedeniyle silininceye dek boş bırakıldı" diyor → **ölü dosyalar, silinmeli**
- `docs/coolify-scheduled-tasks.md:24` — `/api/cron/short-gaps-refresh` "HENÜZ YOK" diyor, ama endpoint **artık var** (`app/api/cron/short-gaps-refresh/route.ts`)
- `sentry.client.config.ts` — kendi silinme talimatını içeriyor

**Öneri:** Bu 5 dosyalık temizlik düşük riskli ve kafa karışıklığını azaltır.

### 18.6 🔵 LOW — L-12: package.json script eksikleri

```
DOSYA : package.json — scripts
SORUN : `typecheck` script'i YOK (tsc elle çalıştırılıyor)
        `test:ci` YOK
        migration script'i YOK (bkz. H-2)
        `prebuild: "echo prebuild"` — işlevsiz artık
        `lint` yalnızca `eslint` (max-warnings yok)
ÖNERİ : "typecheck": "tsc --noEmit"
        "lint:ci": "eslint . --max-warnings 200"
        "test:ci": "vitest run --reporter=basic"
        "verify": "npm run typecheck && npm run lint:ci && npm run test:ci"
        prebuild'i kaldırın.
```

---

## 19. TEST STRATEJİSİ VE MEVCUT TEST SAĞLIĞI

### 19.1 Ölçüm (bu audit'te çalıştırıldı, 8 parça halinde)

| Parça | Dosya | Test | Başarısız |
|---|---:|---:|---:|
| aa | 22 | 335 | 0 |
| ab | 22 | 457 | 0 |
| ac | 22 | 562 | 0 |
| ad | 22 | 452 | 13 |
| ae | 22 | 292 | 9 |
| af | 22 | 295 | 7 |
| ag | 22 | 433 | 11 |
| ah | 15 | 263 | 11 |
| **Toplam** | **169** | **3.089** | **51** |

Test altyapısı: vitest 2.1.9 + jsdom, `TZ=Europe/Istanbul` sabitlenmiş (tarih testleri için deterministik), `server-only` stub alias'ı, v8 coverage yapılandırılmış. **E2E testi yok** (Playwright/Cypress bulunmadı).

### 19.2 🟠 HIGH — H-7: 51 kalıcı kırmızı test — hem de en kritik akışlarda

```
DOSYA  : 15 test dosyası:
           tests/unit/public-reservation-form/handleSubmitOrchestrationContract.test.ts   (7)
           tests/unit/reservation-create-helpers/handleCreateOrchestrationContract.test.ts (5)
           tests/unit/reservation-create-helpers/buildCreateNormalPayload.test.ts          (1)
           tests/unit/reservation-helpers/saveAllOrchestrationContract.test.ts             (4)
           tests/unit/reservation-helpers/buildNormalPayload.test.ts                       (2)
           tests/unit/reservation-service/createReservationOrchestrationContract.test.ts   (3)
           tests/unit/reservation-service/statusAndDeleteOrchestrationContract.test.ts     (5)
           tests/unit/reservation-service/updateReservationFullOrchestrationContract.test.ts (2)
           tests/unit/villa-admin-helpers/createVillaOrchestrationContract.test.ts         (4)
           tests/unit/villa-admin-helpers/updateVillaOrchestrationContract.test.ts         (3)
           tests/unit/villa-admin-helpers/hardDeleteVillaOrchestrationContract.test.ts     (3)
           tests/unit/villa-admin-helpers/payload.test.ts                                  (1)
           tests/unit/villas-form-helpers/createVillaPageOrchestrationContract.test.ts     (5)
           tests/unit/villas-form-helpers/updateVillaPageOrchestrationContract.test.ts     (5)
           tests/unit/villas-form-helpers/audit.test.ts                                    (1)
ÖRNEK  : handleCreateOrchestrationContract.test.ts:323
           expect(insertIdx).toBeGreaterThanOrEqual(0);
           → AssertionError: expected -1 to be greater than or equal to 0
         villas-form-helpers/audit.test.ts
           "before + after have IDENTICAL shape (21 keys)"
           → expected 22 to be 21
SORUN  : Bu testler iç çağrı SIRASINI ve mock çağrı SAYISINI
         doğruluyor ("payload builder DB write'tan ÖNCE çağrılır",
         "insert TAM BİR KEZ yapılır", "audit before/after 21 anahtar").
         Refactor'lar sonrası aranan çağrı imzaları bulunamıyor
         (`-1` = hiç bulunamadı) ve alan sayıları kaymış (21 → 22).
NEDEN  : Bu testler davranışı değil UYGULAMA DETAYINI (call order,
         mock index, anahtar sayısı) kilitliyor. Uygulama meşru
         şekilde değiştiğinde test kırılıyor; kimse de düzeltmeye
         zaman ayıramamış.
ETKİ   : 🔴 Güvenlik ağı FİİLEN DEVRE DIŞI. 51 test kalıcı kırmızı
         olduğu için, yeni bir regresyon bu sayıyı 52 veya 55 yaptığında
         kimse fark etmez. Ve bunlar rastgele testler değil —
         **rezervasyon oluşturma, rezervasyon durum/silme, villa
         oluşturma/güncelleme/silme** akışlarını, yani projenin
         gelir üreten ve veri bütünlüğü açısından en kritik
         yollarını kapsıyorlar.
ÖNERİ  : Üç seçenek, tercih sırasıyla:
         (1) ONARIM: Her dosyayı tek tek açıp beklentiyi güncel
             uygulamaya göre düzeltin. "21 anahtar → 22 anahtar" gibi
             olanlar dakikalar sürer; call-order olanlar daha uzun.
         (2) DÖNÜŞTÜRME (önerilen): Bu testleri "call order" yerine
             "davranış" testlerine çevirin — "geçersiz payload ile
             çağrılırsa insert YAPILMAZ", "insert başarısızsa mail
             GÖNDERİLMEZ" gibi. Bunlar refactor'a dayanıklıdır.
         (3) SON ÇARE: Düzeltilemeyecekleri `describe.skip` ile ve
             bir TODO/issue numarasıyla açıkça devre dışı bırakın —
             böylece paket YEŞİL olur ve yeni kırmızı anında görünür.
         🚨 HANGİSİ SEÇİLİRSE SEÇİLSİN, HEDEF ŞU: test paketi yeşile
            dönmeli. Yeşil bir paket olmadan CI (H-8) kurmanın anlamı
            yok.
```

### 19.3 ⚪ INFO — Test kültürünün güçlü yanları

- **3.089 test / 169 dosya** — ciddi bir yatırım.
- **i18n parite testleri:** TR/EN/DE sözlüklerinin anahtar paritesi ve public tarafta TR sızıntısı (`public-tr-leak-forensic.test.ts`) testlerle kilitli.
- **Locale route testleri:** her public sayfanın üç locale'de doğru render'ı test ediliyor.
- **Fiyat motoru:** `price-engine.test.ts` 88 test + `price-engine-missing-coverage.test.ts` 23 test; sunucu tarafı fiyat doğrulaması (`price-verify`) dahil.
- **Auth testleri:** `login-totp-gate.test.ts` 665 satır.
- Coverage yapılandırması `lib/**` ve `app/services/**`'i hedefliyor — doğru odak.

### 19.4 🔵 LOW — Test paketi yavaş

Tam paket tek seferde 180 sn'lik pencerede tamamlanamadı; 8 parçaya bölünerek çalıştırıldı. jsdom + 3.089 test için bu beklenen bir durum, ancak CI süresini uzatır.

**Öneri:** `vitest --pool=threads` ve saf mantık testlerini (`lib/**`) `environment: "node"` projesine ayırın (vitest workspace); yalnızca `.tsx` testleri jsdom kullansın. Genellikle 2-3x hızlanma verir.

### 19.5 ⚠️ E2E testi yok

Playwright/Cypress bulunmadı. Rezervasyon akışı (tarih seçimi → fiyat doğrulama → ödeme yöntemi → onay) uçtan uca hiç test edilmiyor. Bu akış hem en kritik hem en çok parçadan oluşan akış.

**Öneri:** Faz 3'te tek bir "happy path" Playwright senaryosu ile başlayın; tam kapsam hedeflemeyin.

---

## 20. SEO, ERİŞİLEBİLİRLİK (A11Y) VE ÇOK DİLLİLİK

### 20.1 ✅ SEO: güçlü

| Kontrol | Durum |
|---|---|
| `app/sitemap.ts` | ✅ 363 satır, dinamik (villa + CMS sayfaları + blog), hreflang alternates, fail-soft |
| `app/robots.ts` | ✅ `NEXT_PUBLIC_SITE_URL` yoksa host/sitemap referansını atlıyor |
| `generateMetadata` / `metadata` | ✅ 51 public sayfanın 48'inde |
| Canonical | ✅ 454 referans |
| hreflang | ✅ `lib/i18n/seo-alternates.ts` tek kaynak; ana sayfa için özel düzeltme belgelenmiş |
| JSON-LD | ✅ `app/components/seo/StructuredData.tsx` — 4 şema tipi + `KiralikVillalarPageBody` |
| `next/font` | ✅ self-host + swap + metrik fallback |

### 20.2 🟡 MEDIUM — M-12: `/arama` sayfalarında metadata yok

```
DOSYA  : app/(public)/arama/page.tsx
         app/(public)/en/arama/page.tsx
         app/(public)/de/arama/page.tsx
SORUN  : Bu 3 sayfada ne `metadata` ne `generateMetadata` var; ayrıca
         açık bir `robots: { index: false }` de yok.
NEDEN  : sitemap.ts'te bilinçli olarak hariç tutulmuş ("query-based,
         force-dynamic, duplicate" — satır 41). Ancak sitemap'te
         olmamak indekslenmemeyi garanti etmez.
ETKİ   : Arama motorları dış bağlantılar üzerinden bu sayfalara
         ulaşabilir; başlık/açıklama olmadığı için ham URL veya
         rastgele içerik parçası SERP'te görünür. Sonsuz query
         kombinasyonu → crawl bütçesi israfı ve duplicate content.
ÖNERİ  : Üç sayfaya da
           export const metadata = {
             title: "...", robots: { index: false, follow: true },
           };
         ekleyin. `follow: true` kalması, sonuçlardaki villa
         bağlantılarının taranmasını sürdürür.
```

### 20.3 🔵 LOW — Erişilebilirlik: temeli iyi, boşlukları var

| Metrik | Değer |
|---|---:|
| `aria-*` öznitelikleri | 773 (277'si `aria-label`) |
| `role=` | 92 |
| `alt=` | 59 |
| `<div>`/`<span>` üzerinde `onClick` | **yalnız 2** ✅ |
| `onKeyDown` | 19 |
| `tabIndex` | 8 |
| `sr-only` | 3 |
| ESLint a11y ihlali | **1** (`jsx-a11y/role-supports-aria-props`) |

Semantik eleman kullanımı iyi (tıklanabilir div sayısı çok düşük). Boşluklar:
- `sr-only` yalnız 3 yerde — ikon-butonlar için görünmez etiketler artırılabilir
- Modal'larda focus trap ve `aria-modal` doğrulaması yapılamadı (statik analizin sınırı)
- Renk kontrastı statik olarak ölçülemez

**Öneri:** `eslint-plugin-jsx-a11y`'nin `strict` preset'ine geçin ve bir kez `axe-core` ile ana sayfa + villa detay + rezervasyon formunu tarayın.

### 20.4 ⚪ INFO — i18n mimarisi

Kapalı (`closed`) `Dictionary` tipi (`lib/i18n/dictionaries/types.ts`, 1.560 satır) sayesinde bir anahtar eklendiğinde TR/EN/DE'nin üçünde de tanımlanması **derleme zamanında** zorunlu. Buna ek olarak çalışma zamanı parite testleri ve TR sızıntı testi var. Bu, çok dilli projelerde nadir görülen bir sağlamlık seviyesi.

Veritabanı tarafında çeviriler ayrı `*_translations` tablolarında (migration 081-091) ve `unstable_cache` ile sarmalanmış. Sözlük dosyaları ~1.250 satır ile büyük ama düz yapıda — sorun değil.

---

## 21. OPERASYON, DEPLOY, CRON VE CI/CD

### 21.1 🟠 HIGH — H-8: CI/CD pipeline'ı yok

```
DOSYA  : .github/ → YOK
         herhangi bir .gitlab-ci.yml / Jenkinsfile / *.yml → YOK
SORUN  : Otomatik hiçbir kapı yok: tsc, eslint, test, npm audit —
         hiçbiri bir push/PR'da çalışmıyor.
NEDEN  : Kurulmamış.
ETKİ   : • 51 kırmızı testin kalıcı hale gelmesinin ana nedeni bu
         • 2 CRITICAL + 10 HIGH bağımlılık açığının aylarca
           görünmemesinin nedeni bu
         • Tip veya lint regresyonu yalnızca geliştirici elle
           çalıştırırsa yakalanıyor
         • "Main'e ne girdi" sorusunun makine tarafından
           doğrulanmış bir cevabı yok
ÖNERİ  : Tek bir GitHub Actions workflow'u yeterli:
           on: [push, pull_request]
           - npm ci
           - npm run typecheck
           - npx eslint . --max-warnings 200
           - npx vitest run
           - npm audit --audit-level=high
         🚨 ÖN KOŞUL: test paketinin yeşil olması (H-7). Sıralama:
            önce H-7'yi çözün, sonra CI kurun.
```

### 21.2 🟠 HIGH — H-9: Cron'lar muhtemelen hiç çalışmıyor

```
DOSYA  : vercel.json — 4 cron tanımı
         docs/coolify-scheduled-tasks.md:3-6 —
           "Deploy ortamı Hetzner VPS + Coolify. vercel.json içindeki
            crons[] yalnız Vercel platformunda çalışır → bu ortamda
            hiçbiri tetiklenmiyor. Coolify 'Scheduled Tasks' ekranı
            boş olduğu için 4 mevcut cron şu an otomatik çalışmıyor."
SORUN  : Zamanlanmış işler platform uyumsuzluğu nedeniyle tetiklenmiyor.
         Etkilenen 5 endpoint:
           /api/cron/external-calendar-sync   (4 saatte bir) 🔴 EN KRİTİK
           /api/cron/exchange-rates-refresh   (günlük)       🔴 KRİTİK
           /api/cron/mail-logs-cleanup        (günlük)
           /api/cron/activity-logs-cleanup    (günlük)
           /api/cron/short-gaps-refresh       (vercel.json'da yok)
NEDEN  : Proje Vercel'den Hetzner+Coolify'ye taşınmış, cron
         konfigürasyonu taşınmamış.
ETKİ   : ⚠️ **Coolify Scheduled Tasks'ın bugün kurulmuş olup
         olmadığı DOĞRULANAMADI** (Coolify erişimi yok). Kurulu
         DEĞİLSE:
         • **iCal senkronizasyonu çalışmıyor** → Airbnb/Booking gibi
           dış kanallardaki rezervasyonlar sisteme düşmüyor →
           **ÇİFT REZERVASYON (double booking) riski** — bu, bu
           listedeki en yüksek iş riskidir
         • **Döviz kurları güncellenmiyor** → fiyatlar eski kurla
           hesaplanıyor → gelir kaybı veya müşteri itirazı
         • Mail ve aktivite log tabloları sınırsız büyüyor → disk
           ve sorgu performansı
ÖNERİ  : 🚨 **Faz 0'da İLK doğrulanacak şey:** Coolify panelinde
         Scheduled Tasks kurulu mu? Değilse
         `docs/coolify-scheduled-tasks.md` adım adım kurulumu
         anlatıyor. Ek olarak: bir cron 24 saattir çalışmadıysa
         uyaran basit bir "heartbeat" kontrolü ekleyin (son çalışma
         zamanını settings'e yazan bir alan + admin panelde uyarı).
         `docs/coolify-scheduled-tasks.md`'i güncelleyin —
         `short-gaps-refresh` endpoint'i artık mevcut.
```

### 21.3 🔵 LOW — Deploy konfigürasyonu

| Kontrol | Durum |
|---|---|
| `Dockerfile` | **YOK** — Coolify muhtemelen Nixpacks kullanıyor (DOĞRULANAMADI) |
| `output: "standalone"` | **YOK** — standalone çıktı Docker imajını küçültür ve başlatmayı hızlandırır |
| `engines.node` | `>=22.0.0` ✅ |
| `.nvmrc` | ✅ mevcut |
| `npm run build:fresh` | `.next` silip yeniden derliyor — deploy'da kullanılıyorsa cache avantajı kaybediliyor |

**Öneri:** Coolify Nixpacks kullanıyorsa `output: "standalone"` + basit bir multi-stage `Dockerfile` daha öngörülebilir ve hızlı deploy sağlar. Bu bir Faz 2 işidir, acil değil.

### 21.4 🔵 LOW — Dokümantasyon

`docs/` klasöründe tek dosya var. Buna karşılık `Claude outputs/` klasöründe 13 detaylı analiz raporu birikmiş (fiyat motoru, indirim mimarisi, çoklu dil, pagination, production audit v1/v2...). Bu raporlar ciddi kurumsal bilgi içeriyor ama "geçici çıktı" gibi duran bir klasörde.

**Öneri:** Kalıcı değeri olanları `docs/` altına taşıyın ve bir `docs/README.md` indeks dosyası ekleyin. Yeni geliştirici için `README.md` + mimari şema + "ortam nasıl kurulur" belgesi eksik.

---

## 22. RİSK MATRİSİ, İLK 10 PERFORMANS FIRSATI VE FAZ 0–5 YOL HARİTASI

### 22.1 Risk matrisi

Olasılık × Etki. "Olasılık", saldırı için gereken çaba ve mevcut kanıtın gücüne göre değerlendirilmiştir.

| ID | Bulgu | Olasılık | Etki | Risk | Bölüm |
|---|---|---|---|---|---|
| **C-1** | Next.js 16.2.4 — kimlik doğrulamasız RCE + 5 middleware bypass | Yüksek (kamuya açık CVE, otomatik tarayıcı hedefi) | Kritik (sunucu ele geçirme) | 🔴 **ÇOK YÜKSEK** | §12.1 |
| **C-2** | 24 yetkilendirilmemiş Server Action (mutasyon dahil) | Orta-Yüksek (action ID ifşa açığı aynı sürümde) | Kritik (finansal + veri) | 🔴 **ÇOK YÜKSEK** | §9.1 |
| **H-9** | Cron'lar tetiklenmiyor → iCal senkronizasyonu yok | ⚠️ Doğrulanamadı; doğruysa **kesin** | Yüksek (çift rezervasyon) | 🔴 **YÜKSEK** | §21.2 |
| **H-1** | Düz admin yetki modeli | Orta (iç aktör veya ele geçirilmiş hesap) | Yüksek | 🟠 **YÜKSEK** | §8.2 |
| **H-2** | Migration runner/ledger yok, şema yeniden üretilemez | Düşük (olay gerektirir) | Kritik (kurtarılamama) | 🟠 **YÜKSEK** | §6.1 |
| **H-7** | 51 kalıcı kırmızı test (kritik akışlarda) | Kesin (şu an geçerli) | Yüksek (regresyon körlüğü) | 🟠 **YÜKSEK** | §19.2 |
| **H-8** | CI yok | Kesin | Yüksek | 🟠 **YÜKSEK** | §21.1 |
| **H-12** | sanitize-html / sharp / tiptap açıkları | Orta | Yüksek (XSS / görsel işleme) | 🟠 **YÜKSEK** | §12.2 |
| **H-5** | Upload'da boyut/MIME/path doğrulaması yok | Orta (admin gerekir, ama H-1+C-2 ile düşer) | Orta-Yüksek (OOM, defacement) | 🟠 **YÜKSEK** | §11.1 |
| **H-10** | .env.example eksik 7 anahtar | Orta (yeni ortam kurulumunda kesin) | Orta-Yüksek (sessiz bozukluk) | 🟠 **ORTA-YÜKSEK** | §13.2 |
| **H-11** | Güvenlik başlıkları yok | ⚠️ Doğrulanamadı (CDN'de olabilir) | Orta | 🟠 **ORTA-YÜKSEK** | §10.3 |
| **H-3** | Bellek içi sayfalama | ⚠️ Villa sayısına bağlı | Orta-Yüksek (ölçeklenme) | 🟠 **ORTA-YÜKSEK** | §14.1 |
| **H-4** | 640 KB chunk rezervasyon sayfasında | Kesin | Orta (dönüşüm kaybı) | 🟠 **ORTA** | §15.1 |
| **H-6** | error/loading sınırı yok | Orta (hata anında) | Orta | 🟠 **ORTA** | §17.1 |
| **M-1** | map_embed sanitize edilmiyor | Düşük-Orta | Orta-Yüksek (depolanmış XSS) | 🟡 **ORTA** | §11.2 |
| **M-5** | Rate limiter fail-open | ⚠️ Env durumuna bağlı | Orta (spam/DoS) | 🟡 **ORTA** | §10.2 |
| **M-2** | Transaction yok | Düşük-Orta | Orta (veri tutarsızlığı) | 🟡 **ORTA** | §5.3 |
| **M-3** | Sentry source map/tracing yok | Kesin | Düşük-Orta (teşhis süresi) | 🟡 **ORTA** | §17.2 |
| **M-4** | Görsel remotePattern geniş | Düşük | Orta (bant genişliği + C-1 yüzeyi) | 🟡 **ORTA** | §11.4 |
| **M-12** | /arama metadata/noindex yok | Orta | Düşük-Orta (SEO) | 🟡 **DÜŞÜK-ORTA** | §20.2 |
| **M-6..M-15** | Katman ihlali, kopya bileşen, select *, cache | — | Düşük-Orta | 🟡 **DÜŞÜK-ORTA** | muhtelif |
| **L-1..L-12** | Sertleştirme ve hijyen bulguları | Düşük | Düşük | 🔵 **DÜŞÜK** | muhtelif |

### 22.2 İlk 10 performans fırsatı

Sıralama: (tahmini kazanç) ÷ (uygulama riski + emek).

| # | Fırsat | Beklenen kazanç | Emek | Risk | Kanıt |
|---:|---|---|---|---|---|
| 1 | **`country-state-city`'yi rezervasyon sayfasından çıkarın** (dynamic import veya sunucudan ülke listesi) | Public checkout sayfasında **−640 KB** JS; mobilde LCP/INP'de belirgin iyileşme | Düşük | Düşük | §15.1 |
| 2 | **Index doğrulaması + eksiklerin eklenmesi** (`pg_indexes`, `pg_stat_user_tables`) | ⚠️ Ölçülmeli; eksik index varsa availability/fiyat sorgularında **kat kat** | Düşük (önce sadece okuma) | Düşük | §6.2 |
| 3 | **Kategori/bölge/özellik kesişimini SQL'e taşıyın** (`WHERE id = ANY($1)`) — zaten ID listesi hesaplanıyor | `/arama`'da transfer edilen satır sayısında büyük düşüş | Orta | Orta | §14.1 |
| 4 | **Blog detayını cache'leyin** (`unstable_cache` + `blog` tag), force-dynamic'i kaldırın | Blog sayfalarında DB sorgusu ≈ 0 | Düşük | Düşük | §16.2 |
| 5 | **`select("*")`'ı public yola yakın repository'lerde daraltın** | Villa listesi sorgularında payload düşüşü | Orta | Orta (kontrat testleri koruyor) | §5.2 |
| 6 | **`loading.tsx` ekleyin** (arama, liste, villa detay) | Algılanan performans — teknik olarak hızlanma değil ama **kullanıcı deneyiminde en hızlı kazanç** | Çok düşük | Çok düşük | §17.1 |
| 7 | **Sayfalamayı SQL `LIMIT/OFFSET`'e taşıyın** (3 numaradan sonra) | Villa sayısından bağımsız sabit maliyet | Yüksek | Orta-Yüksek | §14.1 |
| 8 | **`sizes` özniteliğini kart/galeri görsellerine ekleyin** | Mobilde görsel bant genişliğinde belirgin düşüş | Düşük | Çok düşük | §15.4 |
| 9 | **admin_users lookup'ını 30-60 sn cache'leyin** | Admin panelde istek başına 1-2 DB round-trip eksilir | Düşük | Düşük | §5.4 |
| 10 | **Takvim kütüphanelerini teke indirin** (`react-datepicker` → `react-day-picker`) | Bundle'da kayda değer düşüş + UI tutarlılığı | Yüksek | Orta | §15.2 |

> ⚠️ **Önemli uyarı:** 2, 3, 5 ve 7 numaralı maddelerin gerçek kazancı **ölçülmeden bilinemez**. DB ve production erişimi olmadığı için bu rapor bunları *yapısal ölçeklenme riski* olarak sunar, *ölçülmüş darboğaz* olarak değil. **Faz 0'ın ilk işi ölçüm olmalıdır** — aksi halde yanlış yere optimize etme riski var.

### 22.3 Faz 0–5 yol haritası

Her faz bağımsız olarak tamamlanabilir ve kendi içinde değer üretir. Fazlar arasında sıkı bir bağımlılık vardır: **Faz 1, Faz 0'ın tamamlanmasını gerektirir** (yeşil test olmadan CI kurulamaz).

---

#### 🚨 FAZ 0 — ACİL GÜVENLİK VE DOĞRULAMA (0–7 gün)

*Amaç: aktif olarak istismar edilebilir açıkları kapatmak ve doğrulanamayan kritik varsayımları doğrulamak.*

| # | İş | Bulgu | Not |
|---:|---|---|---|
| 0.1 | **`next`'i ≥16.3.3'e yükseltin**, ardından tsc + lint + tam test + manuel duman testi | C-1 | En yüksek öncelik |
| 0.2 | **24 Server Action'a yetki guard'ı ekleyin** (önce mutasyon yapan 17 tanesi) | C-2 | Kalıp §9.1'de |
| 0.3 | **Coolify Scheduled Tasks kurulu mu, DOĞRULAYIN**; değilse `docs/coolify-scheduled-tasks.md`'yi uygulayın | H-9 | iCal = çift rezervasyon riski |
| 0.4 | **DB'de index envanterini çıkarın** (`pg_indexes` + `pg_stat_user_tables`) ve `db/schema-indexes.md` olarak repo'ya alın | H-2b | Salt okuma, risksiz |
| 0.5 | **`pg_dump --schema-only` alıp `db/schema.sql` olarak repo'ya koyun** | H-2 | DR için tek dosya |
| 0.6 | `sanitize-html`, `sharp`, `@tiptap/*`, `fast-xml-parser`, `vitest`'i yükseltin | H-12 | Her biri sonrası test |
| 0.7 | **Production env kontrolü:** `UPSTASH_*`, `S3_*`, `CRON_SECRET`, `AUTH_COOKIE_SECURE`, `PGSSLMODE` set mi? | M-5, H-10 | Salt okuma |
| 0.8 | `.env.example`'a eksik 7 anahtarı ekleyin | H-10 | 10 dakika |
| 0.9 | **Ölçüm:** villa sayısı, `/arama` p50/p95 yanıt süresi, en yavaş 5 sorgu | H-3 | Faz 2'nin girdisi |

**Faz 0 çıktısı:** İstismar edilebilir kritik açık kalmaz; kritik varsayımlar doğrulanmış olur; performans işi için veri elde edilir.

---

#### 🟠 FAZ 1 — GÜVENLİK AĞI (1–3 hafta)

*Amaç: bir daha geri gitmeyi imkânsız kılmak.*

| # | İş | Bulgu |
|---:|---|---|
| 1.1 | **51 kırmızı testi yeşile çevirin** (onarım / davranış testine dönüştürme / gerekçeli skip) | H-7 |
| 1.2 | **CI pipeline'ı kurun:** typecheck + lint(--max-warnings 200) + test + `npm audit --audit-level=high` | H-8 |
| 1.3 | **Server Action guard testini yazın** — yeni guard'sız action eklenmesini imkânsız kılar | C-2 |
| 1.4 | **Migration runner + `schema_migrations` baseline'ı** kurun | H-2 |
| 1.5 | `.env.example` parite testi (kodda kullanılan her anahtar örnekte var mı) | H-10 |
| 1.6 | `package.json`'a `typecheck` / `lint:ci` / `test:ci` / `verify` script'leri | L-12 |

**Faz 1 çıktısı:** Her push otomatik doğrulanır; Faz 0'da kapatılan açıklar bir daha sessizce açılamaz.

---

#### 🟠 FAZ 2 — YETKİLENDİRME VE SERTLEŞTİRME (3–6 hafta)

| # | İş | Bulgu |
|---:|---|---|
| 2.1 | **Sunucu tarafı yetki modeli:** `AuthorizedAdminCaller`'a `permissions` ekleyin, `requirePermission()` helper'ı yazın, 44 route + 45 action'a uygulayın, permission haritasını testle kilitleyin | H-1 |
| 2.2 | Kullanıcı/yetki yönetimi uçlarını ayrı ve dar bir yetkiye bağlayın; `customHead`/`analyticsScript` için de aynısı | H-1, M-1 |
| 2.3 | **Upload endpoint'ini sertleştirin** (boyut, MIME allow-list, magic-byte, path deseni, sunucu-tarafı upsert) | H-5 |
| 2.4 | **`map_embed` için dar sanitize profili** (yazma + okuma) | M-1 |
| 2.5 | **Güvenlik başlıklarını ekleyin** — önce CSP Report-Only | H-11 |
| 2.6 | Rate limiter'ı production'da fail-closed yapın; `taxonomies`/`payment-methods`/`shared-favorites` uçlarına limit ekleyin | M-5, M-13 |
| 2.7 | `timingSafeEqual` + `Sec-Fetch-Site` kontrolü | L-1, L-2 |
| 2.8 | Loglardaki PII'yi maskeleyin + Sentry `beforeSend` redaksiyonu | L-9 |

**Faz 2 çıktısı:** Yetki modeli gerçek; giriş noktaları doğrulanıyor; savunma derinliği var.

---

#### 🟡 FAZ 3 — DAYANIKLILIK VE GÖZLEMLENEBİLİRLİK (6–9 hafta)

| # | İş | Bulgu |
|---:|---|---|
| 3.1 | `global-error.tsx` + segment `error.tsx` dosyaları (markalı, Sentry'li, "yeniden dene") | H-6 |
| 3.2 | Kritik sayfalara `loading.tsx` (iskelet UI) | H-6 |
| 3.3 | `withSentryConfig` + source map yükleme + düşük oranlı tracing | M-3 |
| 3.4 | `sentry.client.config.ts`'i ve tanı `console.log`'unu silin; ölü toast dosyalarını temizleyin | M-3, L-10 |
| 3.5 | `withTransaction()` helper'ı + rezervasyon ve villa oluşturma akışlarına uygulama | M-2 |
| 3.6 | Cron heartbeat izleme (son çalışma zamanı + admin uyarısı) | H-9 |
| 3.7 | İlk Playwright E2E senaryosu: arama → villa detay → tarih seç → rezervasyon formu → onay | §19.5 |
| 3.8 | `no-empty` (allowEmptyCatch: false) kuralını warn olarak açın | L-3 |

**Faz 3 çıktısı:** Hatalar görünür ve teşhis edilebilir; kullanıcı hata anında çıkmaza girmiyor; veri bütünlüğü garantili.

---

#### 🟡 FAZ 4 — PERFORMANS (9–14 hafta)

*Faz 0.9'daki ölçüm sonuçlarına göre önceliklendirilir.*

| # | İş | Bulgu |
|---:|---|---|
| 4.1 | `country-state-city`'yi rezervasyon sayfasından çıkarın | H-4 |
| 4.2 | Faz 0.4'te tespit edilen eksik index'leri migration ile ekleyin | H-2b |
| 4.3 | Blog + kısa-süreli-tarihler sayfalarını cache'leyin / ISR'a alın | M-15 |
| 4.4 | Kategori/bölge/özellik/availability kesişimini SQL'e taşıyın | H-3 |
| 4.5 | SQL `LIMIT/OFFSET` + ayrı `COUNT` sayfalaması | H-3 |
| 4.6 | `select("*")` daraltması (public yola yakın repository'lerden başlayarak) | M-8 |
| 4.7 | Görsellere `sizes`; `remotePatterns`'ı daraltın (önce DB asset URL normalizasyonu) | L, M-4 |
| 4.8 | admin_users lookup cache'i | M-11 |
| 4.9 | Test paketini hızlandırın (node/jsdom workspace ayrımı) | L |

**Faz 4 çıktısı:** İstek maliyeti villa sayısından bağımsız; checkout sayfası hafif; CI hızlı.

---

#### 🔵 FAZ 5 — MİMARİ TEMİZLİK VE SÜRDÜRÜLEBİLİRLİK (14+ hafta, sürekli)

| # | İş | Bulgu |
|---:|---|---|
| 5.1 | `AramaPageBody`'yi parçalayın (URL çözümleme, filtre, UI bileşenleri) | §4.3 |
| 5.2 | Paylaşılan `SortSelector`/`PageSizeSelector`/`PaginationNav` modülü | M-7 |
| 5.3 | Katman ihlali yapan 10 import'u service'e taşıyın + `no-restricted-imports` kuralı | M-6 |
| 5.4 | `react-datepicker` → `react-day-picker` birleştirmesi | M-14 |
| 5.5 | `any` borcunu kademeli kapatın (67 uyarı + 56 disable); `--max-warnings` eşiğini düşürün | L-4 |
| 5.6 | `set-state-in-effect` (59) migrasyonu — türetilmiş state / event handler | L-4 |
| 5.7 | ESLint config yorumu ile gerçeği hizalayın (`exhaustive-deps`) | M-10 |
| 5.8 | `Claude outputs/` içindeki kalıcı değerli raporları `docs/`'a taşıyın + README + mimari şema + ortam kurulum belgesi | L-10 |
| 5.9 | `output: "standalone"` + Dockerfile | L |
| 5.10 | `/arama` sayfalarına metadata + noindex | M-12 |
| 5.11 | a11y: `jsx-a11y` strict preset + axe-core taraması | §20.3 |

---

### 22.4 Kapanış değerlendirmesi

Bu proje, **yazılım mühendisliği disiplini yüksek ama operasyonel olgunluğu düşük** bir kod tabanıdır. Tip güvenliği, SQL güvenliği, i18n mimarisi, fiyat motoru izolasyonu, rezervasyon çakışması garantisi ve kod içi belgeleme — bunların her biri, çoğu benzer ölçekteki projede rastlanmayan kalitede. 3.089 test yazılmış olması ciddi bir yatırımdır.

Sorun, **kodun kalitesi değil, kodun etrafındaki çemberin eksikliğidir**: CI yok, migration yönetimi yok, bağımlılık güncelleme süreci yok, cron kurulumu taşınmamış, yetki modeli yarım bırakılmış ve Server Action'lar güvenlik sınırının dışında kalmış. Bu boşluklar tek tek küçük görünür ama birleştiklerinde birbirini besleyen bir zincir oluşturuyor — nitekim C-1 (Next açığı) ile C-2 (yetkisiz action'lar) tam olarak böyle bir zincir.

İyi haber: **Faz 0'daki dokuz maddenin tamamı bir hafta içinde bitirilebilir** ve en yüksek riskli üç bulguyu (C-1, C-2, H-9) kapatır. Faz 1, bu kazanımın kalıcı olmasını sağlar. Geri kalan her şey, sağlam bir temel üzerinde rahatça planlanabilir.

---

## EK A — BULGU İNDEKSİ

| ID | Seviye | Başlık | Bölüm |
|---|---|---|---|
| C-1 | 🔴 CRITICAL | Next.js 16.2.4 — RCE + middleware bypass zinciri | §12.1 |
| C-2 | 🔴 CRITICAL | 24 yetkilendirilmemiş Server Action | §9.1 |
| H-1 | 🟠 HIGH | Düz admin yetki modeli (sidebar_permissions zorlanmıyor) | §8.2 |
| H-2 | 🟠 HIGH | Migration runner/ledger yok; şema yeniden üretilemez | §6.1 |
| H-2b | 🟠 HIGH | Index tanımlarının çoğu arşivde | §6.2 |
| H-3 | 🟠 HIGH | Bellek içi sayfalama (SQL LIMIT/OFFSET yok) | §14.1 |
| H-4 | 🟠 HIGH | 640 KB country-state-city chunk'ı rezervasyon sayfasında | §15.1 |
| H-5 | 🟠 HIGH | Upload endpoint'inde boyut/MIME/path doğrulaması yok | §11.1 |
| H-6 | 🟠 HIGH | error.tsx / global-error.tsx / loading.tsx yok | §17.1 |
| H-7 | 🟠 HIGH | 51 kalıcı kırmızı test (kritik akışlarda) | §19.2 |
| H-8 | 🟠 HIGH | CI/CD pipeline'ı yok | §21.1 |
| H-9 | 🟠 HIGH | Cron'lar tetiklenmiyor (Vercel config / Coolify ortam) | §21.2 |
| H-10 | 🟠 HIGH | .env.example'da 7 anahtar eksik | §13.2 |
| H-11 | 🟠 HIGH | Güvenlik başlıkları tanımlı değil | §10.3 |
| H-12 | 🟠 HIGH | sanitize-html / sharp / tiptap / fast-xml-parser açıkları | §12.2 |
| M-1 | 🟡 MEDIUM | map_embed sanitize edilmiyor; customHead ham enjeksiyon | §11.2 |
| M-2 | 🟡 MEDIUM | Uygulama seviyesinde transaction yok | §5.3 |
| M-3 | 🟡 MEDIUM | Sentry: source map yok, tracing kapalı, ölü dosya, tanı log'u | §17.2 |
| M-4 | 🟡 MEDIUM | next/image remotePatterns fazla geniş | §11.4 |
| M-5 | 🟡 MEDIUM | Rate limiter fail-open | §10.2 |
| M-6 | 🟡 MEDIUM | Katman ihlali — 10 bileşen doğrudan repository çağırıyor | §4.2 |
| M-7 | 🟡 MEDIUM | Arama/liste sayfaları arasında kopya bileşenler | §4.4 |
| M-8 | 🟡 MEDIUM | 63 `select("*")` kullanımı | §5.2 |
| M-10 | 🟡 MEDIUM | ESLint config beyanı ile davranışı uyuşmuyor | §18.3 |
| M-11 | 🟡 MEDIUM | Her admin isteğinde admin_users sorgusu | §5.4 |
| M-12 | 🟡 MEDIUM | /arama sayfalarında metadata + noindex yok | §20.2 |
| M-13 | 🟡 MEDIUM | shared-favorites public kayıt oluşturuyor, rate-limit yok | §9.1 |
| M-14 | 🟡 MEDIUM | İki ayrı takvim kütüphanesi | §15.2 |
| M-15 | 🟡 MEDIUM | force-dynamic aşırı yaygın; blog cache'lenebilir | §16.2 |
| L-1 | 🔵 LOW | Sabit-zamanlı olmayan secret karşılaştırma | §7.3 |
| L-2 | 🔵 LOW | Origin guard, Origin yoksa geçiriyor | §7.2 |
| L-3 | 🔵 LOW | 153 boş catch bloğu | §17.3 |
| L-4 | 🔵 LOW | 200 lint uyarısı, kapı yok | §18.4 |
| L-5 | 🔵 LOW | Dört Google font ailesi | §15.3 |
| L-9 | 🔵 LOW | PII konsola yazılıyor | §11.5 |
| L-10 | 🔵 LOW | Geçersiz yorumlar + ölü dosyalar | §18.5 |
| L-11 | 🔵 LOW | PGSSLMODE=require'da sertifika doğrulanmıyor | §5.1 |
| L-12 | 🔵 LOW | package.json script eksikleri | §18.6 |

---

## EK B — DOĞRULANAMAYANLAR LİSTESİ

Bu raporda aşağıdaki konular **doğrulanamamıştır**; karar almadan önce ilgili sisteme bakılmalıdır:

1. Production veritabanındaki gerçek index'ler (§6.2) — **en önemli doğrulanamayan**
2. Coolify Scheduled Tasks kurulu mu (§21.2) — **iş riski en yüksek doğrulanamayan**
3. Production'da `UPSTASH_REDIS_REST_*` set mi → rate limit aktif mi (§10.2)
4. Production'da `S3_*` ve `NEXT_PUBLIC_CDN_BASE_*` set mi (§13.2)
5. Güvenlik başlıklarının Cloudflare/Traefik katmanında set edilip edilmediği (§10.3)
6. Gerçek villa sayısı ve `/arama` yanıt süreleri (§14.1)
7. `PG_POOL_MAX` değeri ve PostgreSQL `max_connections` ile uyumu (§14.4)
8. `PGSSLMODE` production değeri (§5.1)
9. Coolify'nin build yöntemi (Nixpacks mi, Docker mı) (§21.3)
10. Sentry'de biriken gerçek hata sayısı ve türleri (§17.2)
11. Replika sayısı (varsa bağlantı havuzu ve bellek etkisi çarpılır)
12. R2 bucket public erişim politikaları ve CDN cache kuralları

---

*Bu rapor salt okunur bir analizdir. Repository'de bu dosya dışında hiçbir değişiklik yapılmamıştır; commit veya push yapılmamıştır.*
