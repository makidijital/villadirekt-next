# Villa Özellikleri (Features) Filtresi — SALT-OKUNUR AUDIT

**Tarih:** 2026-09-20
**Kapsam:** Hero gelişmiş arama → `/arama` sonuçlarını villa özelliklerine göre (AND) filtreleme
**Durum:** AUDIT — hiçbir dosya değiştirilmedi, kod yazılmadı, migration oluşturulmadı, DB'ye yazılmadı, test değiştirilmedi, commit/push yapılmadı.
**Başlangıç `git status`:** temiz · **Bitiş `git status`:** temiz (bu rapor dosyası hariç)

> Tüm iddialar dosya:satır ile kanıtlanmıştır. Tahmin yapılan yerler açıkça **BİLİNMİYOR** olarak işaretlenmiştir.

---

## 1) Hero bileşeninin yapısı ve gelişmiş arama bölümünün konumu

**Dosya:** `app/components/ui/hero/_components/HeroSearchPanel.tsx` (599 satır, `"use client"`)

- **TEK JSX ağacı.** Ayrı bir mobil bileşen YOK — desktop/mobil farkı yalnızca Tailwind responsive sınıflarıyla yapılır. Bu, "mobil/desktop tasarımı bozma" kuralı açısından kritik: tek yerde değişiklik yeterli, iki kopya senkronizasyonu riski yok.
- **State (satır 112-129):**
  - `categories: string[]` (112), `regions: string[]` (113), `guests` (114), `startDate`/`endDate` (116-117)
  - `openCat` / `openRegion` (119-120) — dropdown açık/kapalı
  - `advOpen` (125), `flexible` (126) — **Gelişmiş Arama** kutusu
  - `categoryOptions` / `regionOptions` (128-129) — mount'ta doldurulur
- **Veri yükleme (satır 143):** `const { types, locations } = await loadHeroFilters(locale);` — `useEffect` içinde, bağımlılık `[locale]` (satır 164). Opsiyonlar **prop olarak gelmiyor**, client'tan server action ile çekiliyor.
- **Dropdown deseni (CATEGORY: 340-421 · REGION: 424-505):** `ref` + buton + mutlak konumlu panel + checkbox listesi. Karşılıklı kapanma: `onClick={() => { setOpenCat(!openCat); setOpenRegion(false); }}` (348-351).
- **Dışarı tıklama (167-176):** tek `useEffect`, `catRef` ve `regRef` üzerinde `mousedown` dinler.
- **Çoklu seçim yardımcı (178-186):** `toggleItem(value, list, setList)` — jenerik, yeni bir liste için AYNEN kullanılabilir.
- **Arama (188-200):** `buildHeroSearchParams({...})` → `router.push(localeHref('/arama?'+query, locale))`.
- **GELİŞMİŞ ARAMA kutusu (562-597):** `advOpen` ile açılan `w-[min(92vw,420px)]` beyaz kart; içinde şu anda TEK bir checkbox var (`flexible`, 585-591).

**Öneri (konum):** Yeni "Villa Özellikleri" çoklu-seçim bloğu **bu kutunun içine** (satır ~592, mevcut `<label>`'ın hemen altına) eklenmelidir. Gerekçeler:

1. Kullanıcının isteği zaten "Hero **gelişmiş arama** bölümü".
2. Ana satırdaki dropdown'lar (CATEGORY/REGION) datepicker popper'ı ile aynı z-index/portal düzlemini paylaşıyor ve `openCat`/`openRegion` karşılıklı kapanma zincirine bağlı; oraya üçüncü bir dropdown eklemek bu zinciri ve mobil hizalamayı etkiler → **regresyon riski yüksek**.
3. Gelişmiş kutu zaten `advOpen` ile kontrollü, kendi yüzeyi var, dışarı-tıklama zincirine dahil değil → **izole**.
4. Ana satırın yatay düzeni (flex-1 alanlar) mobilde zaten sıkışık; dördüncü bir alan mobil tasarımı bozar.

---

## 2) Villa özellikleri verisi nereden geliyor

**Tablo:** `villa_features` — kolonlar: `id`, `name`, `created_at`.
**Kanıt:** `lib/db/villa-feature.repository.ts:31-52` (`select("id, name")`, `order("created_at")`), `db/migrations/082_translation_tables.sql:198-217`.

**⚠️ `slug` kolonu YOK. `sort_order` YOK. `icon` YOK. `show_in_filter` YOK.**
Bu, `villa_types` ile farkın tamamıdır (`villa_types`: `id, name, slug, sort_order, cover_image, show_on_homepage` — `lib/db/villa-type.repository.ts:53-61`, `lib/cache.helpers.ts:885-917`).

**Mevcut okuma yolları:**

| Metot | Select | Order | Kullanan |
|---|---|---|---|
| `findAll()` | `id, name` | `created_at DESC` | Admin özellik listesi |
| `findAllForPublicTaxonomy()` | `id, name` | yok | `app/api/public/taxonomies/route.ts:64` |
| `findAllStar()` | `*` | yok | Admin villa edit |
| `findFeatureIdsByVilla(villaId)` | `feature_id` `.eq("villa_id")` | — | Admin villa edit |
| `findFeaturesByVilla(villaId)` | embed `villa_features(...)` | — | Villa detay |

**Public taksonomi API'si özellikleri zaten locale'li servis ediyor:** `app/api/public/taxonomies/route.ts:64,81` → `features: features.map(row => withNameByLocale(row, featureNames))`.

**Çeviri:** `lib/i18n/get-villa-feature-translations.server.ts:49` → `getVillaFeatureNamesByLocale(ids)` **ZATEN VAR** (migration 082 `villa_feature_translations`, `UNIQUE(feature_id, locale)`), `villa_types` ile **birebir aynı desen**. Yeni çeviri altyapısı gerekmez.

**BİLİNMİYOR:** production'da kaç özellik kaydı var ve ortalama kaç villaya bağlı. DB'ye sorgu atılmadı (kural gereği). Bkz. §17 teşhis SQL'i.

---

## 3) Villa ↔ özellik ilişkisi nasıl saklanıyor

**Junction tablo:** `villa_feature_relations (villa_id, feature_id)` — M:N.
**Kanıt:** `db/migrations/002_atomic_replace_helpers.sql:127-145`:

```sql
CREATE OR REPLACE FUNCTION public.replace_villa_feature_relations(
  p_villa_id uuid, p_feature_ids uuid[]) RETURNS void AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('villa_feature_relations:' || p_villa_id::text));
  DELETE FROM villa_feature_relations WHERE villa_id = p_villa_id;
  IF p_feature_ids IS NOT NULL AND array_length(p_feature_ids, 1) > 0 THEN
    INSERT INTO villa_feature_relations (villa_id, feature_id)
    SELECT p_villa_id, f FROM unnest(p_feature_ids) AS f;
  END IF;
END; $$ LANGUAGE plpgsql;
```

**⚠️ ÖNEMLİ BULGU:** `villa_features` ve `villa_feature_relations` için repoda **`CREATE TABLE` ifadesi YOK.** `db/migrations/**` içinde bu iki tabloya yalnızca yukarıdaki fonksiyon ve 082'deki çeviri tablosu referans veriyor. Tablolar migration runner'dan önce (Supabase UI/eski süreç) oluşturulmuş.

**Sonuç → BİLİNMİYOR:** `villa_feature_relations` üzerinde
- `PRIMARY KEY (villa_id, feature_id)` veya `UNIQUE` kısıtı var mı,
- `feature_id` üzerinde index var mı,
- FK `ON DELETE CASCADE` var mı.

**Bu neden önemli:** AND semantiği `DISTINCT feature_id` sayısına dayanır. `UNIQUE` yoksa **yinelenmiş satırlar** sayımı şişirebilir. Aşağıda önerilen çözüm `Set<string>` kullandığı için **uygulama katmanında bu riske karşı zaten bağışık** — `villa_type_relations` için de aynı koruma mevcut (`AramaPageBody.tsx:376` `bucket.add(tid)`). Yine de `feature_id` index'inin yokluğu bir **performans** sorusudur (§16).

---

## 4) Mevcut repository / service / helper / component yapısı

| Katman | Dosya | Durum |
|---|---|---|
| Repository | `lib/db/villa-feature.repository.ts` | 9 metot — **feature_id ile ilişki OKUYAN metot YOK** |
| Service | `app/services/villa-feature.service.ts` | CRUD + villa detay okuma |
| Admin action | `app/(admin)/maki-admin/features/features.action.ts` | CRUD (`revalidateTaxonomy()` **ÇAĞIRMIYOR** — §12'de önemli) |
| i18n helper | `lib/i18n/get-villa-feature-translations.server.ts` | ✅ hazır |
| Public API | `app/api/public/taxonomies/route.ts` | ✅ `features` + `name_by_locale` |
| Cache helper | `lib/cache.helpers.ts` | **features için helper YOK** (`getCachedVillaTypes` 885-917 mevcut) |

**Eksik olan tek şey:** `feature_id[]` ile `villa_feature_relations`'ı okuyan metot. Şablon birebir mevcut — `lib/db/villa-type.repository.ts:93-101`:

```ts
async findVillaTypeRelationsByTypeIds(typeIds: string[]) {
  return await db.from("villa_type_relations")
    .select("villa_id, type_id").in("type_id", typeIds);
},
```

---

## 5) `/arama` filtre mimarisi ve villa tipi filtresinin tam akışı

`app/components/search/AramaPageBody.tsx` (server component, `dynamic = "force-dynamic"` — `app/(public)/arama/page.tsx:22`):

1. **Parse (216-225):** `firstString(sp["villa-turleri"]) ?? firstString(sp.categories)` → virgülle ayrılmış token listesi.
2. **Taksonomi opsiyonları (270-273):** `Promise.all([getCachedVillaLocations(), getCachedVillaTypes()])`.
3. **Token → UUID (287-309):** `resolveTokens(tokens, options)` — UUID ise doğrula, değilse slug indeksinden çöz, çözülemezse **düşür**.
4. **AND çözümü (348-387):**
   - `findVillaTypeRelationsByTypeIds(categories)`
   - `Map<villa_id, Set<type_id>>` kur (365-378)
   - `typeSet.size === categories.length` → `matched` (380-384)
   - `categoryVillaIds = matched` (385)
   - Hata durumunda `categoryVillaIds = null` → filtre atlanır (**defansif fail-open**, 357-360)
5. **Boş eşleşme koruması (404-405):** `const forceEmpty = categoryVillaIds !== null && categoryVillaIds.length === 0;` — sorgu büyütülmez, normalize aşamasında liste boşaltılır (geçmişte `__no_match__` literal'i UUID parse hatası veriyordu).
6. **Sorgu (455-464):** `villaAdminRepository.findSearchResults({ categoryVillaIds, expandedRegions, guests })`.
7. **Repository (`lib/db/villa.repository.server.ts:466-521`):**
   ```ts
   if (opts.categoryVillaIds && opts.categoryVillaIds.length > 0) q = q.in("id", opts.categoryVillaIds);
   if (opts.expandedRegions.length) q = q.in("location_id", opts.expandedRegions);
   if (opts.guests) q = q.gte("guests", opts.guests);
   ```

**Bu akış özellikler için birebir kopyalanabilir.** Tek fark: kesişim (§9).

---

## 6) Query / searchParams yapısı

**Tip (`AramaPageBody.tsx:139-160`, export edilmiş `AramaSearchParams`):** `Promise<{...}>` (Next 16 async searchParams).

**Mevcut parametreler:**

| Param | Legacy eş | Format |
|---|---|---|
| `villa-turleri` | `categories` | virgülle ayrık, slug-öncelikli, UUID fallback |
| `bolgeler` | `regions` | aynı |
| `start`, `end` | — | `YYYY-MM-DD` |
| `guests` | — | sayı (>1 ise yazılır) |
| `page`, `pageSize`, `sort`, `flexible` | — | clean-URL (default yazılmaz) |

### 🔴 KRİTİK BULGU — iki URL üreticisi bilinmeyen parametreleri SİLİYOR

Her ikisi de URL'i **sıfırdan** kurar ve sadece allow-list'teki anahtarları kopyalar:

1. **`FilterSidebar.buildHref()`** — `app/(public)/arama/FilterSidebar.tsx:341-399`
   → Kullanıcı sidebar'dan herhangi bir filtre uygularsa yeni `ozellikler` parametresi **sessizce kaybolur**.
2. **`buildAramaSearchHref()`** — `app/components/search/AramaPageBody.tsx:1430-1461`
   ```ts
   setIf("villa-turleri", sp["villa-turleri"]); setIf("categories", sp.categories);
   setIf("bolgeler", sp.bolgeler); setIf("regions", sp.regions);
   setIf("start", sp.start); setIf("end", sp.end); setIf("guests", sp.guests);
   setIf("flexible", sp.flexible);
   ```
   → Sayfalama / sıralama / pageSize linklerinde **kaybolur**.

**Sonuç:** Yeni parametre bu **iki** noktada da açıkça korunmalıdır; aksi halde filtre "ikinci tıklamada buharlaşır". Bu, uygulamada en kolay gözden kaçacak ve en görünür regresyonu üretecek maddedir.

**✅ İYİ HABER — dil değiştirme güvende:** `lib/i18n/locale-switch.helper.ts:97-113` query string'i **opak** taşır (`normalizeSearchSuffix`), parametre adlarını bilmesi gerekmez → **değişiklik gerekmez**.

---

## 7) Değişmesi gereken minimum dosya seti

| # | Dosya | Tahmini satır | Neden |
|---|---|---|---|
| 1 | `lib/db/villa-feature.repository.ts` | +8 | `findVillaFeatureRelationsByFeatureIds()` (villa-type şablonu) |
| 2 | `app/components/ui/hero/_components/hero-filters.action.ts` | +14 | `Promise.all`'a `findAllForPublicTaxonomy()` ekle + EN/DE çeviri |
| 3 | `app/components/ui/hero/_components/HeroSearchPanel.tsx` | +55 | state + gelişmiş kutuda çoklu seçim UI |
| 4 | `app/components/ui/hero/_helpers/build-search-params.ts` | +8 | `ozellikler` parametresini yaz |
| 5 | `app/components/search/AramaPageBody.tsx` | +55 | parse → resolve → AND → kesişim + `buildAramaSearchHref` koruması |
| 6 | `app/(public)/arama/FilterSidebar.tsx` | +6 | `buildHref` passthrough (parametreyi düşürme) |
| 7 | `lib/i18n/dictionaries/types.ts` + `tr.ts` + `en.ts` + `de.ts` | +4×4 | yeni sözlük anahtarları |
| 8 | `tests/unit/villa-feature-filter.test.tsx` (YENİ) | ~200 | §17 senaryoları |

**Toplam: 7 mevcut dosya (+4 sözlük dosyası aynı gruptan) + 1 yeni test dosyası. Migration YOK.**

### DEĞİŞMEYECEK dosyalar (açık taahhüt)

- `lib/db/villa.repository.server.ts` — **`findSearchResults` imzası ve SQL'i aynen kalır**
- `lib/price.engine.ts`, `app/services/reservation/**`, `app/services/pricing.action.ts`
- `lib/availability.*`, müsaitlik/rezervasyon pipeline'ı
- `lib/pagination.ts`, sıralama mantığı (`_sortPrice`, `parsePublicSort`)
- Villa detay sayfaları, `app/robots.ts`, `app/sitemap.ts`
- **Tüm admin tarafı** (`app/(admin)/**`) — `features.action.ts` dahil
- `lib/cache.helpers.ts` (§12 gerekçesiyle dokunulmuyor)
- `app/components/search/KiralikVillalarPageBody.tsx`, `ShortGapsPageBody.tsx`
- Tarih/misafir/bölge/villa tipi filtrelerinin hiçbir satırı
- Mevcut hiçbir test dosyası

---

## 8) Server-side filtreleme mevcut repository'ye nasıl bağlanır

**Cevap: `findSearchResults`'a hiç dokunmadan.**

`categoryVillaIds` zaten "sonuç kümesini daraltan villa id listesi" anlamına geliyor. Özellik filtresi de aynı türde bir daraltmadır. Bu yüzden:

```
categoryVillaIds  = (tip filtresi sonucu)   | null
featureVillaIds   = (özellik filtresi sonucu) | null
matchVillaIds     = kesişim (her ikisi de null ise null)
→ findSearchResults({ categoryVillaIds: matchVillaIds, expandedRegions, guests })
```

Repository imzası, SQL'i, embed'i, sırası **birebir aynı kalır.**

**Alternatif (REDDEDİLDİ):** `findSearchResults`'a ikinci bir `featureVillaIds` parametresi ekleyip iki ayrı `.in("id", ...)` çağırmak. QueryBuilder bunu **destekliyor** — `.in()` koşulu diziye `push` eder (`lib/db/query-builder.ts:164-167`) ve derleyici hepsini `AND` ile birleştirir (`lib/db/query-compiler.ts:210-218`), yani `"id" IN (...) AND "id" IN (...)` geçerli SQL üretir. **Ama** bu, repository kontratını ve 3 çağrı yerini etkiler, kesişimi DB'ye taşır ve `forceEmpty` mantığını ikiye böler. JS kesişimi daha küçük ve daha az riskli.

---

## 9) AND mantığı mevcut DB/sorgu şekliyle nasıl çalışır

Tip filtresiyle **birebir aynı**:

```
rels = findVillaFeatureRelationsByFeatureIds(features)      // feature_id ∈ seçilenler
Map<villa_id, Set<feature_id>>                              // Set → yinelenen satırlara bağışık
matched = villa_id'ler where Set.size === features.length   // AND
```

**Kesişim ve boş küme:**

```
if (features.length > 0) → featureVillaIds = matched (boş olabilir)
matchVillaIds =
  categoryVillaIds === null ? featureVillaIds
  : featureVillaIds === null ? categoryVillaIds
  : categoryVillaIds.filter(id => new Set(featureVillaIds).has(id))

forceEmpty = matchVillaIds !== null && matchVillaIds.length === 0
```

### ⚠️ Kritik incelik — boş dizi ≠ filtre yok

`findSearchResults` içinde koşul `if (opts.categoryVillaIds && opts.categoryVillaIds.length > 0)` şeklinde (satır 508). Yani **boş dizi gönderilirse filtre HİÇ uygulanmaz ve TÜM villalar döner.** Mevcut kod bunu `forceEmpty` ile telafi ediyor (404-405). Kesişim boş çıktığında `forceEmpty` **mutlaka** yukarıdaki genişletilmiş haliyle hesaplanmalıdır — aksi halde "hiçbir villa eşleşmiyor" durumu "tüm villalar" olarak render edilir. **Bu, bu işin bir numaralı sessiz hata riskidir** ve test senaryosu #6 bunu kilitler.

**Hata toleransı:** `relsErr` varsa mevcut desene uyarak `featureVillaIds = null` (filtre atlanır, sayfa çalışmaya devam eder) — `AramaPageBody.tsx:356-361` ile aynı defansif tutum.

**Seçim yokken:** `features.length === 0` → `featureVillaIds = null` → `matchVillaIds === categoryVillaIds` → **ilişki sorgusu hiç atılmaz, opsiyon sorgusu hiç atılmaz, mevcut davranış %100 birebir.**

---

## 10) Önerilen parametre adı ve formatı

### Öneri: `ozellikler` — virgülle ayrık, **UUID token**

```
/arama?bolgeler=kalkan&ozellikler=<uuid>,<uuid>&start=2026-10-08&end=2026-10-15
```

**Neden slug değil:**

1. `villa_features` tablosunda **`slug` kolonu yok** (§2). Slug üretmek için ya migration gerekir (kullanıcı "hemen oluşturma" dedi) ya da `slugifyTr(name)` ile **sentetik** bir indeks kurulur.
2. Sentetik slug iki risk taşır: **(a)** özellik adı admin'den değiştirilince eski paylaşılan link sessizce çalışmaz, **(b)** iki özellik aynı slug'a düşerse (`"Özel Havuz"` / `"Özel havuz"`) Map çakışır ve **yanlış filtre** uygulanır.
3. **`/arama` robots.txt'te `Disallow`** (`app/robots.ts` — "faceted search; sonsuz query permütasyonu + duplicate"). Yani slug'ın SEO değeri **sıfır**; tek kazancı okunabilirliktir ve bu, yukarıdaki iki riski karşılamıyor.
4. `resolveTokens` (`AramaPageBody.tsx:287-308`) UUID'yi **zaten birinci sınıf** kabul ediyor — `isUuid(tok)` dalı. Yani mevcut yardımcı **hiç değiştirilmeden** kullanılabilir; `options` olarak `features.map(f => ({ id: f.id, slug: null }))` verilir.

**İleri aşama (opsiyonel, bu işin parçası DEĞİL):** `villa_features`'a `slug` kolonu ekleyen bir migration yapılırsa, `ozellikler` parametresi hiç değişmeden slug kabul etmeye başlar (UUID fallback korunur) — `villa-turleri`'nin bugünkü davranışının aynısı. Bu, geriye dönük uyumlu bir yükseltmedir.

**Legacy eş isim gerekmez** — bu tamamen yeni bir parametre.

---

## 11) Çeviri dosyalarında ne değişir

**Yapı (`lib/i18n/dictionaries/`):** `types.ts` **kapalı** bir `Dictionary` tipi tanımlar; `tr.ts`, `en.ts`, `de.ts` onu implement eder. Bir anahtar 4 dosyanın hepsine eklenmezse `tsc` hata verir. Ayrıca iki runtime parite testi var: `tests/unit/dictionary.test.ts:68-74` ve `tests/unit/homepage-p0-i18n.test.tsx:314-320`.

**Gereken anahtarlar (Hero — `home.hero` / hero dict bloğu):**

| Anahtar | TR | EN | DE |
|---|---|---|---|
| `featuresLabel` | "Villa Özellikleri" | "Villa Features" | "Villa-Ausstattung" |
| `featuresAll` | "Tümü" | "All" | "Alle" |
| `featuresEmpty` | "Özellik yok." | "No features." | "Keine Ausstattung." |
| `featuresSelected` | "{n} seçili" | "{n} selected" | "{n} ausgewählt" |

(`{n}` yer tutucusu `formatDictionaryString` ile çözülür — mevcut `guestsOption` deseniyle aynı: `HeroSearchPanel.tsx:331`.)

**Dinamik özellik ADLARI sözlükte DEĞİL:** `getVillaFeatureNamesByLocale` + `resolveTaxonomyName` ile DB'den gelir — `villa_types`'ın bugünkü yolunun aynısı (`hero-filters.action.ts:50-58`). **TR'de hiç çeviri sorgusu atılmaz** (`locale === DEFAULT_LOCALE` erken dönüş, satır 46-49) → TR davranışı birebir korunur.

`FilterSidebar` için §7'de yalnızca passthrough önerildiğinden **`search.filters` sözlüğüne anahtar eklenmez** (yeni UI yok).

---

## 12) Cache stratejisi — neden yeni cached helper ÖNERİLMİYOR

`getCachedVillaTypes` (`lib/cache.helpers.ts:885-917`) `tags: ["taxonomy"], revalidate: 3600` kullanıyor ve admin tip CRUD'u `revalidateTaxonomy()` çağırıyor (`app/services/revalidate.actions.ts:60-62`).

**Ama:** `app/(admin)/maki-admin/features/features.action.ts` içinde **hiçbir `revalidate*` çağrısı yok** (grep: 0 eşleşme). Yani özellikler için cached helper eklenirse, admin bir özellik ekleyip/yeniden adlandırdığında filtre listesi **1 saate kadar bayat** kalır. Bunu düzeltmek **admin dosyasına dokunmayı** gerektirir — kullanıcının açık yasağı.

**Karar:** cache helper eklenmez. Bunun yerine:
- **Hero:** `loadHeroFilters` içindeki mevcut `Promise.all`'a üçüncü sorgu olarak eklenir → **ek RTT yok**, mevcut uncached davranışla tutarlı.
- **`/arama`:** özellik opsiyonları **yalnızca `ozellikler` parametresi varsa** çekilir → filtre kullanılmadığında `/arama` sorgu sayısı **değişmez**.

---

## 13) Mobil/desktop için en güvenli yerleşim

- **Tek JSX ağacı** olduğu için (§1) tek bir blok hem mobil hem desktop'u karşılar.
- Gelişmiş kutu sabit `w-[min(92vw,420px)]` (satır 582) → mobilde zaten viewport'a sığıyor, yeni blok için **ek responsive iş gerekmez**.
- Özellik sayısı belirsiz olduğu için (§2, BİLİNMİYOR) liste alanı `max-h-[220px] overflow-y-auto` ile sınırlandırılmalı — aksi halde 20+ özellikte kutu ekranı taşırır. Bu, mevcut CATEGORY/REGION dropdown'larındaki desenle aynıdır.
- **Portal/z-index'e dokunulmaz**, datepicker popper mantığı (`isMobileDp`, `FilterSidebar.tsx:318-329`) etkilenmez.
- `advOpen` kutusu açıldığında mevcut `flexible` checkbox'ı **üstte kalır** — mevcut kullanıcı alışkanlığı bozulmaz.

---

## 14) En küçük olası çözüm (özet)

1. **+1 repository metodu** — `villa-type` şablonunun kopyası.
2. **+3 satır** `hero-filters.action.ts` `Promise.all`'a (+ TR-dışı çeviri bloğu).
3. **+1 UI bloğu** Hero gelişmiş kutusunda (`toggleItem` yeniden kullanılır).
4. **+1 `params.set`** `build-search-params.ts`'te.
5. **`AramaPageBody`:** parse + `resolveTokens` + AND + kesişim + genişletilmiş `forceEmpty` + `setIf("ozellikler", …)`.
6. **`FilterSidebar.buildHref`:** parametreyi koru (mevcut `pageSize`/`sort` koruma deseninin aynısı, 363-386).
7. **Sözlük:** 4 anahtar × 4 dosya.

**Yeni mimari yok. Migration yok. Yeni cache katmanı yok. Repository imza değişikliği yok. Admin'e dokunulmuyor.**

---

## 15) Performans etkisi

**Özellik seçilmediğinde: SIFIR.** Ne opsiyon sorgusu, ne ilişki sorgusu atılır; `matchVillaIds === categoryVillaIds`; `findSearchResults` SQL'i byte-identical.

**Özellik seçildiğinde:**

| Ek iş | Maliyet |
|---|---|
| `findAllForPublicTaxonomy()` (opsiyonlar) | 1 sorgu, `villa_features` tam tarama — tablo küçük |
| `findVillaFeatureRelationsByFeatureIds()` | 1 sorgu, `WHERE feature_id IN (...)` |
| Map/Set kurulumu + kesişim | O(satır sayısı), bellekte |
| `.in("id", matchVillaIds)` | Bağlı parametre sayısı = eşleşen villa sayısı |

**Riskler:**

- ⚠️ `villa_feature_relations.feature_id` üzerinde index olup olmadığı **BİLİNMİYOR** (§3). Index yoksa sorgu sequential scan olur. ~1.595 villa × ortalama N özellik ilişkisi ölçeğinde bu bugün tolere edilebilir; ama teşhis SQL'i (§17) ile ilişki satır sayısı ölçülmeli.
- ⚠️ Çok yaygın bir özellik (örn. "WiFi") seçilirse `matchVillaIds` ~1.595 eleman olabilir → `IN` listesi 1.595 bağlı parametre. PostgreSQL limiti 65.535, sorun yok; ama bu **mevcut tip filtresinin de bugünkü karakteristiği** — yeni bir sınıf risk getirmiyor.
- **Hero:** `loadHeroFilters` içinde paralel → **ek gecikme yok** (net süre = en yavaş sorgu).

---

## 16) Regresyon riski taşıyan yerler

| # | Risk | Şiddet | Kanıt / Önlem |
|---|---|---|---|
| R1 | `FilterSidebar.buildHref` parametreyi düşürür | 🔴 YÜKSEK | `FilterSidebar.tsx:341-399` — passthrough şart |
| R2 | `buildAramaSearchHref` parametreyi düşürür (sayfalama/sıralama) | 🔴 YÜKSEK | `AramaPageBody.tsx:1441-1449` — `setIf` şart |
| R3 | Boş kesişim → `forceEmpty` unutulursa **tüm villalar** render edilir | 🔴 YÜKSEK | `villa.repository.server.ts:508` + `AramaPageBody.tsx:404-405` |
| R4 | `InitialFilters`'a **zorunlu** alan eklenmesi | 🟠 ORTA | `ShortGapsPageBody.tsx:406-410` inline `initial={{regions,categories,guests}}` veriyor → alan **`features?` opsiyonel** olmalı, yoksa `tsc` kırılır |
| R5 | `kiralik-villalar` testindeki tam-şekil `toEqual` | 🟠 ORTA | `kiralik-villalar-locale-routes.test.tsx:522-528` — `KiralikVillalarPageBody`'nin `sidebarInitial`'ına alan **eklenmezse** test aynen geçer |
| R6 | Sözlük paritesi | 🟠 ORTA | 4 dosyaya birden eklenmezse `tsc` + 2 runtime testi kırılır |
| R7 | Hero mount'ta ek sorgu hatası tüm filtreleri düşürür | 🟡 DÜŞÜK | `loadHeroFilters` içinde `.catch(() => ({}))` deseni (satır 51-53) mevcut — aynı tutum uygulanmalı |
| R8 | Yinelenen junction satırları AND sayımını şişirir | 🟡 DÜŞÜK | `Set` kullanımı bağışıklık sağlar |
| R9 | Sıralama / fiyat / indirim / müsaitlik | ⚪ YOK | Bu katmanlara hiç dokunulmuyor; filtre yalnızca villa id kümesini daraltıyor |
| R10 | Dil değiştirme query kaybı | ⚪ YOK | `locale-switch.helper.ts:97-113` opak taşıma |

**Mevcut testlerden güvende olanlar (doğrulandı):**
- `arama-locale-routes.test.tsx:452-494` — `toBe("/arama?guests=4")` gibi tam URL string'leri: testler `FilterSidebar`'ı kendi `INITIAL`'ı ile render ediyor, `features` yok → parametre yazılmaz → **aynen geçer**.
- `arama-locale-routes.test.tsx:648+` — parametre **içerme** listesi (exclusive değil) → yeni parametre eklemek kırmaz.
- `arama-locale-routes.test.tsx:318-339` — 19 adet `tr.search.filters` değeri: `search.filters` sözlüğüne dokunulmuyor → **aynen geçer**.

---

## 17) Gereken test senaryoları

**Yeni dosya:** `tests/unit/villa-feature-filter.test.tsx` — mevcut hiçbir test değiştirilmeden.

1. **Seçim yok → birebir mevcut davranış.** `ozellikler` parametresi olmadan `findSearchResults`'ın **tam olarak eskisiyle aynı argümanla** çağrıldığı (`toEqual` ile) doğrulanır; ilişki sorgusu ve opsiyon sorgusu **hiç çağrılmaz** (`toHaveBeenCalledTimes(0)`).
2. **Tek özellik** → yalnızca o özelliğe sahip villalar.
3. **İki özellik = AND** → her ikisine de sahip olan tek villa döner; birine sahip olan **dönmez**.
4. **Tip + özellik kesişimi** → yalnızca her iki kümede de olan villa.
5. **Bölge + tarih + misafir + tip + özellik** birlikte → diğer filtrelerin argümanları (`expandedRegions`, `guests`) **değişmemiş** olmalı.
6. **Boş kesişim → 0 sonuç** (⚠️ "tüm villalar" DEĞİL). R3'ü kilitler.
7. **Geçersiz/silinmiş UUID token** → sessizce düşer; kalan geçerli tokenlarla filtre çalışır; hepsi geçersizse filtre yok sayılır (mevcut `resolveTokens` davranışı).
8. **İlişki sorgusu hatası** → filtre atlanır, sayfa render olur (fail-open, R7).
9. **URL round-trip:** `buildHeroSearchParams` çıktısı → `AramaPageBody` parse'ı → aynı id kümesi.
10. **Sayfalama/sıralama koruması:** `buildAramaSearchHref` çıktısında `ozellikler` **var** (R2).
11. **Sidebar koruması:** `FilterSidebar.buildHref` çıktısında `ozellikler` **var** (R1).
12. **Yinelenen junction satırı** (aynı villa_id+feature_id iki kez) → AND sayımı bozulmaz (R8).
13. **Sözlük paritesi:** yeni anahtarlar 4 dosyada da mevcut.
14. **TR sorgu sayısı:** `loadHeroFilters("tr")` çeviri sorgusu **atmaz**.
15. **Kaynak kilidi:** `findSearchResults` imzasının ve `lib/db/villa.repository.server.ts` içindeki filtre bloğunun değişmediği doğrulanır.

**Ayrıca çalıştırılacak temel doğrulamalar:** `npx tsc --noEmit` → 0 hata · `npm run lint` → 0 error / 200 warning (mevcut taban) · tam test paketi → mevcut taban olan 51 failed / 15 files'ın **artmaması**.

### Ön-koşul teşhis SQL'i (kullanıcının çalıştırması gerekir — salt-okunur)

```sql
-- Kaç özellik var, isim çakışması var mı?
SELECT count(*) AS feature_count,
       count(DISTINCT lower(trim(name))) AS distinct_names
FROM villa_features;

-- Junction büyüklüğü + yinelenen satır var mı?
SELECT count(*) AS rel_rows,
       count(*) - count(DISTINCT (villa_id, feature_id)) AS duplicate_rows
FROM villa_feature_relations;

-- feature_id üzerinde index var mı? (§3'teki BİLİNMİYOR'u kapatır)
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename IN ('villa_features','villa_feature_relations');

-- En yaygın 10 özellik (IN listesi büyüklüğü tahmini)
SELECT f.name, count(*) AS villa_count
FROM villa_feature_relations r JOIN villa_features f ON f.id = r.feature_id
GROUP BY f.name ORDER BY villa_count DESC LIMIT 10;
```

---

## 18) Değişecek ve değişmeyecek dosyaların net listesi

### ✅ DEĞİŞECEK (8 dosya + 1 yeni test)

```
lib/db/villa-feature.repository.ts                              (+1 metot)
app/components/ui/hero/_components/hero-filters.action.ts       (+1 sorgu, +çeviri)
app/components/ui/hero/_components/HeroSearchPanel.tsx          (+state, +UI bloğu)
app/components/ui/hero/_helpers/build-search-params.ts          (+1 params.set)
app/components/search/AramaPageBody.tsx                         (+parse/AND/kesişim, +setIf)
app/(public)/arama/FilterSidebar.tsx                            (+passthrough, UI YOK)
lib/i18n/dictionaries/types.ts | tr.ts | en.ts | de.ts           (+4 anahtar)
tests/unit/villa-feature-filter.test.tsx                        (YENİ)
```

### ❌ DEĞİŞMEYECEK

```
db/migrations/**                          — migration YOK
lib/db/villa.repository.server.ts         — findSearchResults aynen
lib/db/villa-type.repository.ts           — tip filtresi aynen
lib/cache.helpers.ts                      — yeni cache YOK (§12)
lib/price.engine.ts, app/services/pricing.action.ts
app/services/reservation/**, app/api/public/reservations/**
lib/availability.*, müsaitlik pipeline'ı
lib/pagination.ts, sıralama mantığı
app/(public)/kiralik-villa/**             — villa detay
app/robots.ts, app/sitemap.ts, metadata/SEO katmanı
lib/i18n/config.ts, locale-switch.helper.ts, get-*-translations.server.ts
app/(admin)/**                            — TÜM admin (features.action.ts dahil)
app/components/search/KiralikVillalarPageBody.tsx
app/components/short-gaps/**, GapFilterSidebar.tsx
Mevcut TÜM test dosyaları
```

---

## ÖZET

Bu özellik, projede **zaten var olan villa-tipi AND filtresinin birebir ikizi** olarak, yeni mimari ve migration olmadan uygulanabilir. Veri kaynağı (`villa_features` + `villa_feature_relations`), çeviri yolu (`getVillaFeatureNamesByLocale`) ve AND algoritması hazır; eksik olan tek altyapı parçası `feature_id`'lere göre ilişki okuyan bir repository metodudur.

Üç şey kritik ve kolayca gözden kaçar: **(1)** `FilterSidebar.buildHref` ve **(2)** `buildAramaSearchHref` bilinmeyen parametreleri siler — yeni parametre her ikisinde de açıkça korunmalı; **(3)** kesişim boş çıktığında `forceEmpty` genişletilmezse sayfa "0 sonuç" yerine **tüm villaları** gösterir.

İki belirsizlik var: `villa_feature_relations` üzerindeki kısıt/index durumu (repoda `CREATE TABLE` yok) ve production'daki özellik/ilişki hacmi. Her ikisi de §17'deki salt-okunur teşhis SQL'i ile kapanır; ikisi de tasarımı değiştirmez, yalnızca performans beklentisini netleştirir.

**Onay bekleniyor — hiçbir değişiklik yapılmadı.**
