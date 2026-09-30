# /arama PERFORMANS AUDİTİ — READ-ONLY

**Tarih:** 21 Eylül 2026
**Kapsam:** `/arama` (+ `/en/arama`, `/de/arama` — aynı gövde)
**Tür:** SALT OKUMA. **Hiçbir dosya değiştirilmedi.**
**Kural:** Mevcut arama davranışı KORUNACAK. Hiçbir öneri uygulanmadı.

> ⚠️ **ORTAM SINIRI:** Production PostgreSQL'e bu ortamdan erişim YOK
> (`aws-0-eu-west-1.pooler.supabase.com` → `EAI_AGAIN`). Bu nedenle
> **gerçek satır sayısı, sorgu süresi, EXPLAIN planı ve production index
> durumu ÖLÇÜLEMEDİ.** Aşağıdaki her sayısal ifade ya kaynak koddan
> türetilmiş **yapısal** bir maliyettir ya da açıkça "doğrulanamadı"
> olarak işaretlenmiştir. **Rakam uydurulmamıştır.**

---

# 1. MEVCUT /arama NASIL ÇALIŞIYOR?

## 1.1 Component zinciri

```
app/(public)/arama/page.tsx                    (29 satır, SERVER)
  └─ export const dynamic = "force-dynamic"    ← HİÇBİR CACHE YOK
  └─ <AramaPageBody locale="tr" searchParams={…} />
        app/components/search/AramaPageBody.tsx   (1.874 satır, SERVER / RSC)
          ├─ <FilterSidebar />                    (1.245 satır, "use client")
          ├─ <VillaCard /> × pageSize             (1.641 satır, "use client")
          └─ <PageHero />, <JsonLd />
```

`/en/arama` ve `/de/arama` **aynı** `AramaPageBody`'yi render eder; üçü de
`force-dynamic`.

## 1.2 Server / Client sınırı

| Katman | Nerede |
|---|---|
| Parametre parse, taksonomi resolve, ana sorgu, availability, fiyat, sort, pagination | **Server (RSC)** — `AramaPageBody` |
| Filtre formu + URL push | **Client** — `FilterSidebar` |
| Kart fiyat gösterimi (`calculateGrandTotal`) | **Client** — `VillaCard` (tarih varsa) |

**Client'a geçen veri:** yalnız `villasOnPage` (varsayılan **12** kart) +
taksonomi option listeleri (bölge/tip/özellik). **Tam villa listesi
client'a GEÇMİYOR** → RSC payload villa sayısıyla büyümüyor. ✅

## 1.3 Gerçek pipeline sırası (kaynak koddan, satır numaralarıyla)

```
 ① searchParams parse                               AramaPageBody:215-270
 ② Promise.all: villa_locations + villa_types        :287   (unstable_cache, TTL 1h ✅)
              + loadHeroFeatures                     :293   (CACHE YOK ❌)
 ③ villa_type_relations sorgusu (kategori varsa)     :396   ← SIRALI await
 ④ villa_feature_relations sorgusu (özellik varsa)   :463   ← SIRALI await (③'ten SONRA)
 ⑤ JS kesişim → matchVillaIds                        :506
 ⑥ grup-kökü bölge genişletme (JS)                   :538-553
 ⑦ Promise.all: findSearchResults + review stats     :568
 ⑧ NORMALIZE — TÜM satırlar için .map()              :716-838
 ⑨ AVAILABILITY — get_blocked_villa_ids RPC          :863  → JS .filter()  :868
 ⑩ total = visibleVillas.length                      :871
 ⑪ (flexible) 6 adede kadar EK RPC, Promise.all      :905
 ⑫ Promise.all: cookies() + getExchangeRatesMap()    :948   (CACHE YOK ❌)
 ⑬ SORT — JS (fiyat sortunda TÜM villa için
        calculateGrandTotal)                          :991-1024
 ⑭ PAGINATION — JS  .slice(sliceStart, +pageSize)    :1034  ← ★ BURADA
 ⑮ getVillaBadgesByLocale (TR'de kısa devre ✅)       :1040
 ⑯ (EN/DE) getVillaTypeNamesByLocale                 :1091
```

**Sıra doğrulaması (görev maddesi I):**
`FILTER → AVAILABILITY → PRICE → SORT → PAGINATION` — ✅ **sıra DOĞRU ve
semantik olarak sağlam.** Pagination en sonda, sort'tan sonra, availability
filtresinden sonra. `total` doğru sayıyı gösteriyor.

**Ama pagination SQL'de değil, JS `.slice()` ile yapılıyor.**

## 1.4 Kaç kayıt nereye gidiyor?

| Aşama | Kayıt sayısı |
|---|---|
| DB → Next.js | **Filtreye uyan TÜM villalar** (üst-seviye `LIMIT` YOK) + her villa için TÜM `villa_prices` + TÜM `villa_discounts` + 1 `villa_images` |
| Next.js JS normalize | Aynı sayı (hepsi `.map()`'lenir) |
| Availability sonrası | `visibleVillas` (≤ önceki) |
| Sort | `visibleVillas` tamamı |
| **Kullanıcıya gösterilen** | **`pageSize` = varsayılan 12** (allow-list 12/30/50/100) |

> `villa` satır sayısı production'dan **doğrulanamadı**.

---

# 2. B) FİLTRELEME VE SIRALAMA NEREDE? — KANITLI CEVAP

## 2.1 SQL tarafında çalışan filtreler ✅

`lib/db/villa.repository.server.ts:466 findSearchResults`:

```ts
.eq("is_active", true)
.is("deleted_at", null)
if (opts.categoryVillaIds?.length) q = q.in("id", opts.categoryVillaIds);
if (opts.expandedRegions.length)   q = q.in("location_id", opts.expandedRegions);
if (opts.guests)                   q = q.gte("guests", opts.guests);
q.order("sort_order", asc).order("created_at", desc)
```

| Filtre | Yer |
|---|---|
| `is_active = true` | **SQL** ✅ |
| `deleted_at IS NULL` | **SQL** ✅ |
| Villa tipi (`villa-turleri`) | **SQL** (`.in("id", …)`) — ama id listesi **JS'te hesaplanıyor** (adım ③+⑤) |
| Villa özelliği (`ozellikler`) | **SQL** (aynı `.in("id")`) — id listesi **JS'te** (adım ④+⑤) |
| Bölge (`bolgeler`) | **SQL** (`.in("location_id", …)`) — grup-kökü genişletme **JS'te** (adım ⑥) |
| Kişi sayısı (`guests`) | **SQL** (`.gte("guests", …)`) ✅ |
| Varsayılan sıralama (`smart`) | **SQL** (`ORDER BY sort_order ASC, created_at DESC`) ✅ |

## 2.2 JavaScript tarafında çalışanlar ❌

| İşlem | Satır | Neden JS'te |
|---|---|---|
| **Tarih/müsaitlik filtresi** | `:868` `villas.filter(v => !blockedSet.has(v.id))` | RPC sadece blocked id listesi döner; kesme JS'te |
| **Tip/özellik AND kesişimi** | `:396-506` `Map<villa_id, Set<type_id>>` | junction'dan tüm satırlar çekilip JS'te sayılıyor |
| **Bölge grup-kökü genişletme** | `:538-553` | cached taksonomi üzerinde JS |
| **Fiyat sıralaması** | `:991-1024` + `applyPublicSort` | `calculateGrandTotal` / `convertPrice` JS motoru |
| **Kapasite sıralaması** | `applyPublicSort` | JS |
| **Başlangıç fiyatı (kart)** | `:813` `getStartingPrice(prices)` | TÜM `villa_prices` üzerinde MIN, JS |
| **PAGINATION** | `:1034` `.slice()` | ★ JS |
| **`total` sayısı** | `:871` `visibleVillas.length` | JS |

### ✅ KESİN CEVAP

> **Filtreleme KISMEN SQL'de, sıralama İSE ÖNEMLİ ÖLÇÜDE JAVASCRIPT'TE.**
> Kalıcı villa nitelikleri (aktiflik, bölge, kapasite, tip/özellik id kümesi)
> SQL'de; **tarih/müsaitlik filtresi, fiyat & kapasite sıralaması ve
> pagination tamamen Next.js sürecinde** yapılıyor.

---

# 3. C) SORGU PERFORMANSI — YAPISAL BULGULAR

## 3.1 `select("*")` — 46+ kolon, 13'ü kullanılıyor

`types/database.ts > VillaRow` → **46 kolon**. `/arama`'nın gerçekten
kullandıkları (`AramaVillaRaw`, `:612-656`) yalnızca **13**:
`id, slug, title, price, currency, badge, bedrooms, bathrooms, guests,
cleaning_fee, cleaning_currency, cleaning_limit` + join `location.name`.

Boşuna taşınan **büyük metin** kolonları: `description`, `map_embed`,
`seo_title`, `seo_description`, ayrıca migration 065/078 ile eklenen
`search_title` ve `real_title_search` (trigram aranabilir metin kolonları).
Bunlar **her villa için** DB→Node aktarılıp atılıyor.

## 3.2 Embed'ler korelasyonlu alt-sorgu (JOIN değil)

`lib/db/query-compiler.ts:302 compileEmbedExpr` — her embed
SELECT listesinde **satır başına çalışan korelasyonlu bir
`json_agg` alt-sorgusudur**:

```sql
SELECT *,
  (SELECT json_build_object('name', e0.name) FROM villa_locations e0 WHERE e0.id = villa.location_id),
  (SELECT coalesce(json_agg(__lim.__row),'[]') FROM (
      SELECT json_build_object(...) AS __row FROM villa_images e1
      WHERE e1.villa_id = villa.id ORDER BY is_cover DESC, sort_order ASC LIMIT 1) __lim),
  (SELECT coalesce(json_agg(json_build_object(...)),'[]') FROM villa_prices    e2 WHERE e2.villa_id = villa.id),
  (SELECT coalesce(json_agg(json_build_object(...)),'[]') FROM villa_discounts e3 WHERE e3.villa_id = villa.id)
FROM villa
WHERE is_active AND deleted_at IS NULL [AND id IN (…)] [AND location_id IN (…)] [AND guests >= N]
ORDER BY sort_order ASC, created_at DESC;
```

**Tek round-trip ✅** (N+1 yok). **Ama:** filtreye uyan **her** villa için
4 alt-sorgu çalışır — sayfada gösterilmeyecek villalar dahil.
`villa_prices` ve `villa_discounts` alt-sorgularında **LIMIT de tarih
filtresi de YOK** → villa başına TÜM fiyat/indirim satırları JSON'a
serileştirilir.

## 3.3 Gereksiz / tekrar eden sorgular

| Bulgu | Satır | Not |
|---|---|---|
| `getVillaReviewStatsBatch()` **cache'siz**, **TÜM villaların TÜM onaylı yorumlarını** çeker (`villa_reviews WHERE is_approved = true`, `select villa_id, rating`) | `:568` → `villa-review.service.ts:259` | Her `/arama` isteğinde tam tarama. `lib/cache.helpers.ts`'te **zaten cached** varyantlar var (`getCachedVillaReviewStats`, tag `villa-reviews`, TTL 1h) ama bu batch fonksiyon **cache dışında** |
| `getExchangeRatesMap()` **cache'siz** | `:948` | 3 satır okur; maliyeti düşük ama yine de round-trip |
| `loadHeroFeatures()` **cache'siz** | `:293` | Dosyanın kendi yorumu: *"`revalidateTaxonomy()` ÇAĞIRMIYOR. `unstable_cache` eklenirse…"* — yani bilinçli olarak eklenmemiş |
| `villa_type_relations` ve `villa_feature_relations` sorguları **SIRALI** | `:396` ve `:463` | Birbirinden bağımsız; `Promise.all` edilebilir → 1 RTT tasarruf |

## 3.4 JS tarafındaki büyük dizi işlemleri

| İşlem | Karmaşıklık | Satır |
|---|---|---|
| normalize `.map()` — TÜM villalar | O(N × (P + D + 1)) | `:716-838` |
| görsel `[...raw].sort()` villa başına | O(1) (embed LIMIT 1) | `:722` |
| `getStartingPrice` — TÜM fiyat satırları | O(N × P) | `:813` |
| availability `.filter()` | O(N) | `:868` |
| **fiyat sortunda `calculateGrandTotal` — TÜM görünür villa** | O(N × gece × P) | `:991-1024` |
| `applyPublicSort` | O(N log N) | `pagination.ts:184` |
| `.slice()` | O(pageSize) | `:1034` |

`P` = villa başına `villa_prices` satır sayısı, `D` = `villa_discounts`.
**P ve D production'dan doğrulanamadı.**

## 3.5 RSC payload / response

`/arama` HTML (bu ortamda, DB'siz, webpack build): **~70.069 B**
İlk yükleme JS: **~834.549 B ham** (Sentry kaldırıldıktan sonra).
Villa listesi client'a geçmediği için **payload villa sayısıyla
büyümüyor** ✅ — darboğaz payload değil, **server-side hesap + DB**.

## 3.6 Connection pool

`lib/db/pg.client.ts:61` → `max: PG_POOL_MAX || 10`,
`connectionTimeoutMillis: 10s`. `.env.local`: `PG_POOL_MAX=10`.
İstek başına ~5-7 sıralı round-trip olduğundan eşzamanlı trafik artınca
pool beklemesi olasıdır — **doğrulanamadı** (production metriği yok).

---

# 4. D) SQL PAGINATION — 9 SORUYA CEVAP

### 1) Mevcut arama mantığını bozmadan yapılabilir mi?
**Kısmen — ve koşulsuz "evet" DEĞİL.** Tarih seçilmeden yapılan
aramalarda güvenli biçimde yapılabilir; **tarih seçili aramalarda
mevcut mimariyle YAPILAMAZ.**

### 2) FILTER → SORT → PAGINATION sırası nasıl korunur?
Ancak üç aşamanın da **aynı katmanda** olmasıyla. Bugün availability ve
fiyat sıralaması JS'te olduğu için SQL LIMIT bu sırayı bozar.

### 3) Hangi filtreler SQL'de? → §2.1
### 4) Hangi filtreler JS'te? → §2.2

### 5) ⚠️ JS filtreleri varken SQL LIMIT sonucu bozar mı?
# EVET — KESİNLİKLE BOZAR.

İki bağımsız kırılma:

**(a) Availability.** `LIMIT 12` ilk 12 villayı getirir; ardından
availability bunların 7'sini eler → kullanıcı **5 sonuç** görür, oysa
gerçekte 200 müsait villa vardır. `total` de yanlış olur.

**(b) Fiyat sıralaması.** `price-asc`, `calculateGrandTotal` ile
JS'te hesaplanır (gece sayısı × tarih aralıklı fiyat + temizlik +
indirim + döviz kuru). SQL bu değeri **bilmiyor**; `ORDER BY` yalnız
`sort_order, created_at` üzerinde. Önce LIMIT alınırsa "en ucuz 12"
değil, "ilk 12'nin en ucuzu" sıralanır.

> **Görev tanımındaki yasak tam olarak budur ve bu audit onu doğruluyor:
> naif `LIMIT 20` kesinlikle önerilmiyor.**

### 6) Güvenli SQL pagination için hangi sorgu yapısı gerekir?
Üç şeyin **SQL'e taşınması** gerekir:

1. **Availability** — `NOT EXISTS (reservations ∪ manual ∪ external overlap)`
   predikatı ana sorgunun `WHERE`'ine (veya `get_blocked_villa_ids`'in
   `NOT IN` olarak anti-join'i). Mantık `039_availability_rpc.sql`'de
   zaten SQL; ana sorguya **bağlanması** gerekiyor.
2. **Fiyat sıralama anahtarı** — `calculateGrandTotal`'ın SQL karşılığı
   (gece bazlı fiyat + `cleaning_limit` muafiyeti + indirim + döviz).
   **Bu, fiyat motorunun ikinci bir implementasyonu demektir.**
3. **`total`** — `COUNT(*) OVER ()` window fonksiyonu aynı sorguda.

Ardından `ORDER BY <anahtar> LIMIT $1 OFFSET $2`.
Not: `lib/db/query-compiler.ts:376-377` `LIMIT`/`OFFSET` derlemesini
**zaten destekliyor**; eksik olan tek şey `findSearchResults`'ın bunu
kullanması değil — **eksik olan, JS'teki iki aşamanın SQL'de olmaması.**

### 7) `COUNT(*)` / toplam nasıl korunur?
`COUNT(*) OVER ()` ile aynı sorguda (ikinci sorgu ≠ atomik, filtre drift
riski). Bugün `total = visibleVillas.length` (`:871`) — availability'den
SONRA, pagination'dan ÖNCE → **bugünkü sayı doğru**; SQL'e geçilirse
availability predikatı COUNT'un içinde olmalı.

### 8) OFFSET yerine cursor/keyset uygun mu?
**Bu sayfa için HAYIR.** Keyset, sıralama anahtarının **stabil ve
sorgulanabilir** olmasını gerektirir. Burada anahtar kullanıcıya özel ve
runtime'da hesaplanıyor (seçilen tarih + kullanıcının para birimi +
güncel döviz kuru + indirim). Ayrıca UI **numaralı sayfalama** gösteriyor
(`computePageWindow`, "Sayfa 3 / 12") — keyset rastgele sayfaya atlamayı
desteklemez. `pageSize` en fazla 100 ve sayfa sayısı makul olduğu sürece
OFFSET'in derin-sayfa maliyeti burada **asıl sorun değildir**.

### 9) Bunları uygulamak davranış değiştirme riski taşır mı?
**EVET, yüksek.** Fiyat motorunu SQL'e taşımak = aynı işi yapan ikinci
bir implementasyon = kartta gösterilen sayı ile sıralama anahtarının
ayrışma riski. `AramaPageBody:960-980` bu eşitliği **belgelenmiş
invariant** olarak tanımlıyor ("sort key === kartta gösterilen sayı —
matematiksel garanti"). 🔴 **YÜKSEK RİSK.**

---

# 5. F) INDEX DURUMU

> **Metodoloji:** `db/migrations/**/*.sql` (83 dosya) regex ile tarandı;
> **53 index tanımı** bulundu. `_archive/README.md`'ye göre arşivdeki
> **tablo/index tanımları hâlâ geçerlidir** (yalnız eski sağlayıcıya ait
> yetkilendirme katmanı temizlenmiştir).

## 5.1 Arama yolunda MEVCUT index'ler ✅

| Tablo | Index | Kolonlar | Kaynak |
|---|---|---|---|
| `villa` | `idx_villa_visibility` | `(is_active)` | 003 |
| `villa` | `idx_villa_deleted_at` | `(deleted_at)` | 003 |
| `villa` | `idx_villa_sort_order` | `(sort_order)` | 006 |
| `villa_discounts` | `villa_discounts_villa_id_idx` | `(villa_id)` | 079 |
| `villa_discounts` | `villa_discounts_range_idx` | `(villa_id, start_date, end_date)` | 079 |
| `villa_locations` | `villa_locations_filter_idx` | `(show_in_filter, filter_group_name)` | 050 |
| `reservations` | `idx_reservations_avail` | `(villa_id, start_date, end_date)` partial | 039 (arşiv) |
| `manual_reservations` | `idx_manual_reservations_avail` | `(villa_id, start_date, end_date)` | 039 (arşiv) |
| `external_calendar_events` | `..._overlap_idx` | `(villa_id, start_date, end_date)` | 029 (arşiv) |
| `external_calendar_events` | `..._villa_active_idx` | `(villa_id, is_active)` | 029 (arşiv) |

→ **Availability RPC'si iyi indekslenmiş.** Darboğaz orası değil.

## 5.2 Arama yolunda index tanımı BULUNAMAYAN kolonlar ⚠️

| Tablo/kolon | Nerede kullanılıyor | Migration'da index |
|---|---|---|
| `villa_prices(villa_id)` | **Korelasyonlu embed — villa başına 1 kez** | **bulunamadı** |
| `villa_images(villa_id)` | Korelasyonlu embed — villa başına 1 kez | **bulunamadı** |
| `villa_type_relations(type_id)` / `(villa_id)` | Tip filtresi junction | **bulunamadı** |
| `villa_feature_relations(feature_id)` / `(villa_id)` | Özellik filtresi junction | **bulunamadı** |
| `villa_reviews(is_approved)` / `(villa_id)` | `getVillaReviewStatsBatch` tam tarama | **bulunamadı** |
| `villa(location_id)` | `.in("location_id", …)` bölge filtresi | **bulunamadı** |
| `villa(guests)` | `.gte("guests", …)` | **bulunamadı** |
| `villa(created_at)` | `ORDER BY … created_at DESC` | **bulunamadı** |

### ⚠️ ÖNEMLİ METODOLOJİK UYARI

`villa_prices`, `villa_images`, `villa_type_relations`,
`villa_feature_relations`, `villa_reviews`, `villa_distances`
tablolarının **`CREATE TABLE` ifadesi repo'da HİÇ YOK** — bu tablolar
migration geçmişinden önce (eski sağlayıcı arayüzünde) oluşturulmuş.
Dolayısıyla PRIMARY KEY / UNIQUE constraint'lerinin ne olduğu ve
bunların örtük index sağlayıp sağlamadığı **repo'dan bilinemez.**

> **Resmî ifade:**
> **"Migration'larda bu kolonlar için index tanımı BULUNAMADI;
> production DB'deki gerçek index durumu DOĞRULANAMADI."**
>
> PostgreSQL'de FOREIGN KEY **otomatik index oluşturmaz** (PK/UNIQUE
> oluşturur). Bu yüzden `villa_prices(villa_id)` index'inin varlığı
> gerçekten belirsizdir ve **ilk doğrulanması gereken şeydir**
> (§10, B2).

---

# 6. G) ÖLÇEK ANALİZİ — NE LİNEER BÜYÜYOR?

> Süre rakamı verilmiyor (ölçülemez). Yalnız **büyüme sınıfı**.

| İşlem | 100 | 500 | 1.500 | 5.000 villa | Büyüme |
|---|---|---|---|---|---|
| `villa` satır taraması | ×1 | ×5 | ×15 | ×50 | **lineer** |
| `villa_prices` korelasyonlu alt-sorgu **çalıştırma sayısı** | 100 | 500 | 1.500 | 5.000 | **lineer** (index yoksa **lineer × tablo boyu ≈ kareye yakın**) |
| `villa_discounts` alt-sorgusu | 100 | 500 | 1.500 | 5.000 | aynı |
| `villa_images` alt-sorgusu | 100 | 500 | 1.500 | 5.000 | aynı |
| DB→Node JSON transfer | ×1 | ×5 | ×15 | ×50 | **lineer** (46 kolon + tüm fiyat/indirim satırları) |
| JSON deserialize (pg driver) | ×1 | ×5 | ×15 | ×50 | **lineer** |
| normalize `.map()` | ×1 | ×5 | ×15 | ×50 | **lineer** |
| `getStartingPrice` | N×P | | | | **lineer × P** |
| availability RPC | scoped id dizisi büyür | | | | **lineer** (indeksli) |
| fiyat sort `calculateGrandTotal` | ×1 | ×5 | ×15 | ×50 | **lineer × gece × P** |
| `applyPublicSort` | | | | | **N log N** |
| **Kullanıcıya render** | 12 | 12 | 12 | 12 | **SABİT** ✅ |
| `getVillaReviewStatsBatch` | yorum sayısıyla | | | | villa değil **yorum** sayısına lineer |

**Kritik gözlem:** Render sabit (12 kart) kalırken **ondan önceki her
şey lineer büyüyor.** Kullanıcının hissettiği yavaşlık **TTFB**'dir
(server bekleme), ilk boyama değil.

---

# 7. YAVAŞLIĞIN EN MUHTEMEL 5 NEDENİ

**Öncelik sırası — yapısal maliyet ve düzeltme kolaylığına göre:**

| # | Neden | Kanıt | Neden pahalı |
|---|---|---|---|
| **1** | `villa_prices(villa_id)` ve `villa_images(villa_id)` index'i **doğrulanamıyor**; korelasyonlu alt-sorgu villa başına 1 kez çalışıyor | `query-compiler.ts:302`; migration'da index yok | Index yoksa her villa için `villa_prices` tam taraması → **N × tablo** |
| **2** | `select("*")` — 46 kolonun 13'ü kullanılıyor; `description`/`map_embed`/`seo_*`/`search_title`/`real_title_search` boşuna taşınıyor | `villa.repository.server.ts:473`; `AramaVillaRaw:612` | DB→Node transfer + pg driver deserialize, **villa sayısıyla lineer** |
| **3** | `getVillaReviewStatsBatch()` **cache'siz** ve **TÜM onaylı yorumları** çekiyor; `villa_reviews` index'i doğrulanamıyor | `AramaPageBody:568`; `villa-review.service.ts:259`; `villa-review.repository:51` | Her istekte tam tarama; `cache.helpers.ts`'te cached varyant **zaten var ama kullanılmıyor** |
| **4** | `force-dynamic` + **sıfır cache**; istek başına 5-7 sıralı round-trip, `PG_POOL_MAX=10` | `arama/page.tsx:21`; `pg.client.ts:61` | Eşzamanlı trafikte pool beklemesi (**doğrulanamadı**) |
| **5** | Sayfada gösterilmeyecek villalar için de tam iş yapılıyor: normalize + `getStartingPrice` + (fiyat sortunda) `calculateGrandTotal` | `:716-838`, `:813`, `:991-1024` | 12 kart gösterilirken N villa hesaplanıyor |

**Bonus (küçük ama bedava):** `villa_type_relations` ve
`villa_feature_relations` sorguları **sıralı** (`:396` → `:463`);
bağımsız oldukları hâlde `Promise.all` edilmemiş → 1 RTT boşa.

---

# 8. SQL PAGINATION GERÇEKTEN GEREKLİ Mİ?

## Kısa cevap: **ŞU AN HAYIR.**

**Gerekçe:**

1. Yavaşlığın en muhtemel 5 nedeninin **hiçbiri** pagination'ın JS'te
   olmasından kaynaklanmıyor. `.slice()` O(pageSize) — pratikte ücretsiz.
2. Asıl maliyet **N villa için yapılan DB ve JS işi**; bu, LIMIT ile
   değil **index + daraltılmış SELECT + cache** ile düşürülür.
3. Güvenli SQL pagination, fiyat motorunun SQL'de ikinci kez yazılmasını
   gerektirir → mevcut "sort key === kartta gösterilen sayı"
   invariant'ını riske atar.
4. §4.5'te gösterildiği gibi naif LIMIT sonucu **kesin olarak bozar**.

## Ne zaman gerekli olur?

`villa` sayısı birkaç bine çıkıp §9'daki 🟢 ve 🟡 optimizasyonlar
tüketildiğinde. O noktada bile önce **availability'nin SQL'e taşınması**
(🟡) gelir; fiyat sıralaması en son ve ayrı bir karar olmalıdır.

---

# 9. H) OPTİMİZASYONLAR — RİSK SINIFLARIYLA

## 🟢 DÜŞÜK RİSK — sonucu değiştirmeden

### 🟢-1 — `villa_prices(villa_id)` + `villa_images(villa_id)` index'i (ÖNCE DOĞRULA)
- **Ne değişir:** Sadece DB index'i; hiçbir uygulama kodu değişmez.
- **Neden hızlanır:** Korelasyonlu alt-sorgu her villa için index scan'e düşer; index yoksa bugün sequential scan.
- **Neden bozulmaz:** Index sonucu değil **erişim yolunu** değiştirir. `CREATE INDEX CONCURRENTLY` ile kilitsiz.
- **Doğrulama:** Önce `\d villa_prices` / `pg_indexes` ile var mı bak; `EXPLAIN (ANALYZE, BUFFERS)` öncesi/sonrası.
- **Kazanç:** Index gerçekten yoksa **çok yüksek**. Varsa sıfır.
- **Risk:** Yazma yolunda ihmal edilebilir ek maliyet.
- ⚠️ Migration gerektirir — bu audit kapsamında **uygulanmadı**.

### 🟢-2 — `select("*")` → açık kolon listesi
- **Ne değişir:** `findSearchResults` içindeki `*` → 13 kolon + `sort_order`, `created_at`, `location_id`.
- **Neden hızlanır:** DB→Node bayt ve pg driver deserialize maliyeti düşer; `description`/`search_title`/`real_title_search` gibi metin kolonları taşınmaz.
- **Neden bozulmaz:** `AramaVillaRaw` (`:612-656`) hangi alanların okunduğunu **tam olarak** belgeliyor; fazlası zaten kullanılmıyor.
- **Doğrulama:** `tests/unit/villa-feature-filter.test.tsx` (findSearchResults mock'lu, AramaPageBody render eder), `arama-card-price-placement`, `arama-card-discount`, `arama-locale-routes`. Ek olarak TÜM 3.138 test.
- **Kazanç:** Orta-yüksek, villa sayısıyla lineer.
- **Risk:** Düşük — tek dikkat: `findSearchResults` **yalnız /arama** tarafından kullanılıyor (tek call-site, repository yorumunda belgeli).

### 🟢-3 — `getVillaReviewStatsBatch` için `unstable_cache`
- **Ne değişir:** Servis çağrısı `cache.helpers.ts` desenine sarılır; tag `villa-reviews`, TTL 1h (mevcut review cache'leriyle parity).
- **Neden hızlanır:** Her `/arama` isteğindeki tam `villa_reviews` taraması kalkar.
- **Neden bozulmaz:** Aynı tag zaten admin moderation aksiyonlarında (`revalidateTag("villa-reviews")`) invalidate ediliyor; `getCachedVillaReviewStats` **aynı veriyi aynı TTL ile zaten cache'liyor**.
- **Doğrulama:** Yorum onayı → `/arama` kart puanı güncelleniyor mu (manuel); mevcut review testleri.
- **Kazanç:** Orta — yorum sayısıyla lineer maliyeti sıfırlar.
- **Risk:** Düşük. Tek etki: en fazla 1 saat gecikmeli puan (tag invalidate varken pratikte yok).

### 🟢-4 — `villa_type_relations` + `villa_feature_relations` sorgularını `Promise.all`
- **Ne değişir:** `:396` ve `:463` iki bağımsız `await` → tek `Promise.all`.
- **Neden hızlanır:** 2 sıralı RTT → 1.
- **Neden bozulmaz:** İki sorgu birbirinin çıktısını kullanmıyor; kesişim (`:506`) ikisi de geldikten sonra.
- **Doğrulama:** `villa-feature-filter.test.tsx` (A-H senaryoları: boş kesişim, AND, tip+özellik birlikte).
- **Kazanç:** Küçük ama garantili (yalnız her iki filtre birden seçiliyken).
- **Risk:** Çok düşük.

### 🟢-5 — `getExchangeRatesMap` + `loadHeroFeatures` cache
- **Ne değişir:** İkisi de `unstable_cache` ile sarılır (`loadHeroFeatures` için dosyanın kendi yorumu bunu zaten öneriyor; taksonomi tag'i `taxonomy` mevcut).
- **Neden bozulmaz:** Her ikisi de **filtreden bağımsız sabit veri**; arama sonucunu etkilemez.
- **Kazanç:** Küçük (2 round-trip).
- **Risk:** Çok düşük. ⚠️ `loadHeroFeatures` cache'lenirse `revalidateTaxonomy()`'ye tag eklenmeli — aksi hâlde admin özellik ekleyince sidebar geç güncellenir.

### 🟢-6 — `villa_discounts` embed'ini tarih yokken atlamak
- **Ne değişir:** `findSearchResults`'a `includeDiscounts: boolean` eklenir; `hasDateRange === false` iken embed hiç derlenmez.
- **Neden bozulmaz:** **Kanıt:** `villa.discounts` yalnız iki yerde tüketiliyor — `:1009` (`needsStayTotalSort`, yani `hasDateRange && price sort`) ve `:1432` (`hasDateRange && !isFlexible` koşullu VillaCard prop'u). Tarih yokken **hiçbir yerde kullanılmıyor.**
- **Doğrulama:** `arama-card-discount.test.tsx`, `arama-modal-calendar-discount.test.tsx`, `calendar-daily-discount.test.tsx` + tarihsiz arama snapshot'ı.
- **Kazanç:** Tarihsiz aramalarda (muhtemelen çoğunluk) villa başına 1 korelasyonlu alt-sorgu tamamen kalkar.
- **Risk:** Düşük-orta — repository imzası değişir, ama `findSearchResults` tek call-site'lı.
- ⚠️ **`villa_prices` için AYNI ŞEY YAPILAMAZ:** `getStartingPrice` (`:813`) kart "başlangıç fiyatı" için **TÜM** fiyat satırları üzerinde MIN alır ve bu değer tarihten bağımsız her zaman gösterilir. `villa_prices` embed'ine tarih filtresi eklemek **gösterilen fiyatı değiştirir** → 🔴.

### 🟢-7 — Görsel/asset
- `VillaCard`'daki üç `next/image` `loading="lazy"` + doğru `sizes` kullanıyor (`:541`, `:902`, `:1162`) ✅ zaten iyi.
- İyileştirme alanı: `next.config.ts`'te `images.formats` tanımlı değil (AVIF/WebP pazarlığı varsayılanda). **Bu /arama'ya özel değil** — ayrı bir faz konusu.

## 🟡 ORTA RİSK — doğru testlerle

### 🟡-1 — Junction filtrelerini SQL'e taşımak
- **Ne:** `villa_type_relations` / `villa_feature_relations` AND kesişimini JS `Map<vid,Set>` yerine `GROUP BY villa_id HAVING count(DISTINCT type_id) = $n` ile SQL'de yapmak.
- **Neden bozulmaz:** `Set` semantiği ile `count(DISTINCT …)` aynı; yinelenen junction satırlarına bağışıklık korunur.
- **Doğrulama:** `villa-feature-filter.test.tsx` senaryo C (yinelenen satır) ve E (boş kesişim → 0 sonuç, asla "tüm villalar") **mutlaka** çalışmalı.
- **Risk:** Boş kesişim → `forceEmpty` yolu (`:511`) kritik; yanlış yapılırsa **tüm villalar** listelenir.

### 🟡-2 — Availability'yi ana sorgunun WHERE'ine taşımak
- **Ne:** `get_blocked_villa_ids` mantığını ana sorguya `NOT EXISTS` anti-join olarak bağlamak.
- **Neden cazip:** SQL pagination'ın **ön koşulu**; ayrıca `total` `COUNT(*) OVER ()` ile alınabilir.
- **Neden riskli:** RPC `security definer` + `stable`; half-open `[start,end)` overlap ve `status IN ('pending','confirmed')` allow-list'i **birebir** taşınmalı. En küçük sapma = **yanlış müsaitlik** = overbooking veya kayıp satış.
- **Doğrulama:** Aynı tarih aralığı için eski/yeni blocked-id kümelerinin **küme eşitliği** testi; sınır günler (check-in = check-out), external takvim, manuel blok.

### 🟡-3 — Normalize'ı sayfaya ertelemek
- **Ne:** `getStartingPrice` + `discounts` normalizasyonunu **TÜM** villa yerine yalnız `villasOnPage` için yapmak.
- **Engel:** `price-asc`/`price-desc` sortu `villa.price`'ı (yani `getStartingPrice` çıktısını) anahtar olarak kullanıyor (`pagination.ts:205`) → tarihsiz fiyat sortunda **tüm** villa için gerekli.
- **Yapılabilir hâli:** Yalnız `sort === "smart"` veya `capacity-*` iken ertele. Koşullu → dikkatli test gerekir.

## 🔴 YÜKSEK RİSK — sonucu değiştirme ihtimali

### 🔴-1 — Naif `LIMIT/OFFSET` (availability ve fiyat sortu JS'te kalırken)
**KESİNLİKLE ÖNERİLMİYOR.** §4.5 — sonuç kümesini ve `total`'ı bozar.

### 🔴-2 — Fiyat sıralamasını SQL'e taşımak
`calculateGrandTotal`'ın (gece bazlı fiyat + `cleaning_limit` muafiyeti +
indirim + döviz kuru) SQL'de ikinci implementasyonu. Belgelenmiş
"sort key === kartta gösterilen sayı" invariant'ını kırma riski.

### 🔴-3 — `villa_prices` embed'ine tarih filtresi
Kart "başlangıç fiyatı" MIN'i bozulur (§9 🟢-6 uyarısı).

### 🔴-4 — Keyset/cursor pagination
Numaralı sayfalama UI'ı ile uyumsuz; anahtar kullanıcıya özel (§4.8).

---

# 10. EN DÜŞÜK RİSKLİ OPTİMİZASYON

> ### 🥇 **`select("*")` → açık 13 kolon listesi** (🟢-2)
>
> Tek dosya, tek fonksiyon, tek call-site. Hangi kolonların okunduğu
> `AramaVillaRaw` tipinde zaten tam olarak belgeli. Filtre, sıralama,
> availability, fiyat, pagination semantiğinin **hiçbirine dokunmaz**.
> Mevcut testler (özellikle `villa-feature-filter.test.tsx`) değişikliği
> anında yakalar.
>
> **İkinci sırada:** 🟢-3 (review stats cache) — `cache.helpers.ts`'te
> aynı veri için cached varyant **zaten mevcut**, sadece bu call-site
> onu kullanmıyor.

---

# 11. ÖNERİLEN GÜVENLİ UYGULAMA SIRASI

| Sıra | Ne | Risk | Ön koşul |
|---|---|---|---|
| 0 | **Baseline ölçümler** (§12) | — | — |
| 1 | `villa_prices(villa_id)`, `villa_images(villa_id)` index'ini **DOĞRULA** | 🟢 | DB erişimi |
| 2 | Yoksa `CREATE INDEX CONCURRENTLY` (ayrı migration, ayrı onay) | 🟢 | 1 |
| 3 | `select("*")` → açık kolon listesi | 🟢 | — |
| 4 | `getVillaReviewStatsBatch` → `unstable_cache` | 🟢 | — |
| 5 | `villa_type_relations` + `villa_feature_relations` → `Promise.all` | 🟢 | — |
| 6 | `getExchangeRatesMap` + `loadHeroFeatures` cache (+ `revalidateTaxonomy` tag) | 🟢 | — |
| 7 | **Yeniden ölç.** 1-6 yeterliyse **DUR.** | — | 0 |
| 8 | `villa_discounts` embed'ini tarih yokken atla | 🟢/🟡 | 7 |
| 9 | `villa_type_relations`/`villa_feature_relations` → junction filtresi SQL'e | 🟡 | 7 |
| 10 | Availability → ana sorgu `NOT EXISTS` | 🟡 | 9 + küme-eşitliği testi |
| 11 | SQL pagination (`LIMIT/OFFSET` + `COUNT(*) OVER ()`) | 🟡/🔴 | **10 zorunlu** |
| 12 | Fiyat sortunu SQL'e | 🔴 | ayrı karar, ayrı faz |

**Her adımdan sonra:** 3.138 test + `tsc` + `eslint` + aynı URL seti ile
sonuç kümesi karşılaştırması.

---

# 12. HİÇBİR DEĞİŞİKLİK YAPMADAN ÖNCE ALINACAK BASELINE ÖLÇÜMLER

## A) Uygulama katmanı
1. **Sunucu zaman ölçümü** — `AramaPageBody` içine `console.time` etiketleri (geçici, ayrı bir dalda): taksonomi / junction / ana sorgu / review stats / availability / normalize / sort. **Hangi aşamanın kaç ms olduğunu bilmeden optimize etmeyin.**
2. **TTFB** — gerçek production'da `/arama` ve temsilci kombinasyonlar:
   - filtresiz
   - yalnız bölge
   - bölge + tarih
   - bölge + tarih + `sort=price-asc`
   - `pageSize=100`
   - `flexible=3`
3. **RSC/HTML boyutu** — bu ortamda ölçülen referans: **~70 KB HTML**, **~834 KB ilk-yükleme JS** (webpack build, DB'siz — production Turbopack rakamı farklı olabilir).

## B) Veritabanı katmanı
1. **Satır sayıları:**
   `SELECT count(*) FROM villa WHERE is_active AND deleted_at IS NULL;`
   `SELECT count(*) FROM villa_prices;` · `villa_discounts` · `villa_images` · `villa_reviews WHERE is_approved` · `villa_type_relations` · `villa_feature_relations`
   ve **villa başına ortalama/max fiyat satırı**:
   `SELECT avg(c), max(c) FROM (SELECT count(*) c FROM villa_prices GROUP BY villa_id) t;`
2. **★ INDEX ENVANTERİ (en kritik adım):**
   `SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('villa','villa_prices','villa_images','villa_discounts',
      'villa_type_relations','villa_feature_relations','villa_reviews',
      'villa_locations','reservations','manual_reservations','external_calendar_events')
    ORDER BY tablename;`
   → §5.2'deki belirsizliği **tek başına** çözer.
3. **`EXPLAIN (ANALYZE, BUFFERS)`** — `findSearchResults`'ın ürettiği tam SQL için (§3.2'deki şablon), en az filtresiz + bölge+guests varyantlarında.
4. **RPC maliyeti** — `EXPLAIN ANALYZE SELECT * FROM get_blocked_villa_ids('2026-07-01','2026-07-08', <id dizisi>);`
5. **Pool doygunluğu** — `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();` yük altında; `PG_POOL_MAX=10` yeterli mi?
6. **Tablo/index boyutu** — `pg_total_relation_size` ilk 10 tablo.

## C) Karşılaştırma protokolü (regresyon güvencesi)
Her değişiklikten önce ve sonra **aynı URL seti** için:
`total`, `villasOnPage` id sırası, her kartın gösterilen fiyatı,
`flexibleCount` → **birebir eşit olmalı.** Bu, "sonuç değişmedi"
iddiasının tek geçerli kanıtıdır.

---

# 13. AUDIT SONU DOĞRULAMASI

```
$ git status --short
?? "Claude outputs/search-performance-audit-raporu.md"     ← YALNIZ BU RAPOR

$ git log --oneline -3
9d05060 fix: update reservation mail and availability flows
37db456 chore: remove Sentry
54c5935 test: align remaining orchestration contracts
```

Çalışma ağacı, bu raporun kendisi dışında **tertemiz**. (Önceki fazların
Sentry kaldırma ve authz değişiklikleri kullanıcı tarafından commit
edilmiş durumda — bu audit'in bununla ilgisi yok.)

**Bu AUDIT kapsamında:**
- ❌ Hiçbir production dosyası değiştirilmedi
- ❌ Hiçbir test değiştirilmedi
- ❌ Hiçbir migration değiştirilmedi
- ❌ `package.json` / `package-lock.json` değiştirilmedi
- ❌ Commit / push yapılmadı
- ✅ Yalnız bu rapor dosyası yazıldı

> ⚠️ **NOT:** Bu audit `9d05060` sonrası ağaç üzerinde yapıldı. O commit'in
> başlığı "reservation mail and availability flows" olsa da içeriği yalnızca
> önceki fazların Sentry kaldırma + Server Action authz satırları ve rapor
> dosyalarıdır (`git show --stat` ile doğrulandı); `/arama` pipeline'ına
> dokunmamıştır. Raporda alıntılanan satır numaraları bu ağaca aittir.

# 14. DOĞRULANAMAYANLAR (açık liste)

- Production `villa` / `villa_prices` / `villa_reviews` satır sayıları
- `villa_prices(villa_id)`, `villa_images(villa_id)`, `villa_reviews(is_approved)`, `villa(location_id)`, `villa(guests)`, `villa(created_at)`, junction tablolarının index durumu — **migration'da tanım yok; production doğrulanamadı**
- Bu tabloların PRIMARY KEY / UNIQUE constraint'leri (`CREATE TABLE` repo'da yok)
- Gerçek sorgu süreleri, EXPLAIN planları, buffer/IO istatistikleri
- Connection pool doygunluğu ve eşzamanlı istek profili
- TTFB, LCP, INP gibi gerçek kullanıcı metrikleri
- Turbopack production bundle rakamları (ölçümler webpack ile alındı)
