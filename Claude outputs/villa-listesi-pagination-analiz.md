# /maki-admin/villa-listesi — Pagination & Performans Analizi

**Tarih:** 2026-09-20 · **Commit:** `8915658` · **Kapsam:** YALNIZ `/maki-admin/villa-listesi`
**Yöntem:** %100 statik kaynak kod analizi. Production DB'ye, gerçek payload ölçümüne ve EXPLAIN çıktısına erişim YOK — bu nedenle satır sayıları ve byte tahminleri **TAHMİN** olarak ayrıca işaretlendi.
**Değişiklik:** Hiçbir dosya değiştirilmedi, migration oluşturulmadı, DB'ye yazılmadı, commit/push yapılmadı.

---

## 1. SAYFA AKIŞI

**Dosya ağacı (yalnız 3 dosya, 1259 satır):**

| Dosya | Satır | Rol |
|---|---:|---|
| `app/(admin)/maki-admin/villa-listesi/page.tsx` | 245 | Server RSC — tüm veri çekimi burada |
| `app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient.tsx` | 989 | `"use client"` — filtre, seçim, sıralama, render |
| `app/(admin)/maki-admin/villa-listesi/_components/shared-villa-list.action.ts` | 25 | Sadece "Listeyi Paylaş" server action'ı |

**Bu sayfa bir CRUD listesi DEĞİL — bir "curator/seçki" ekranı.** Admin filtre uygular, villa seçer, `/liste/[token]` kısa linki üretir. Villa ekleme/silme/düzenleme burada **yok** (o ekran `/maki-admin/villas`).

**Veri yolu:** `page.tsx` → `villaAdminRepository.findActiveCuratorCards()` (`lib/db/villa.repository.server.ts`) → `dbAdmin` (native pg QueryBuilder). **Service katmanı atlanıyor** — RSC doğrudan repository'yi çağırıyor.

**İlk veri çekimi — tam yer:** `page.tsx:78-88`, tek `Promise.all` bloğu:

```
const [villasRes, locationsRes, typesRes, relationsRes] = await Promise.all([
  villaAdminRepository.findActiveCuratorCards(),      // ← 1.595 villa, TÜMÜ
  villaLocationRepository.findAllForFilter(),          // bölgeler
  villaTypeRepository.findAllIdNameBySortOrder(),      // villa tipleri
  villaTypeRepository.findAllRelations(),              // ← TÜM M:N junction satırları
]);
```

**Tüm villaların çekilmesine sebep olan sorgu:** `villaAdminRepository.findActiveCuratorCards()` — `lib/db/villa.repository.server.ts`. **Hiçbir `.limit()` / `.range()` / `.offset()` yok.** Repository yorumunda da açıkça yazıyor: *"id filtresi/limit/count/range YOK"*.

**Client mı server mı çekiyor:** İlk yük **server** (RSC). Sonra client **hiç yeniden fetch yapmıyor** — tüm filtreleme, arama, sıralama in-memory. Tek istisna: tarih aralığı seçilince `getBlockedVillaIdsAction` server action'ı (aşağıda).

**Sayfa açılışındaki sorgu sayısı — CONFIRMED: 4 DB sorgusu** (+ layout'tan gelen admin auth sorguları ayrı). Tarih aralığı seçilirse **+1 RPC** (`get_blocked_villa_ids`).

`export const dynamic = "force-dynamic"` (`page.tsx:38`) → **her ziyarette 4 sorgu yeniden çalışır**, hiçbir cache yok.

---

## 2. DATABASE SORGUSU

**Sorgu birebir (`findActiveCuratorCards`):**

```
dbAdmin.from("villa")
  .select(`
    id, slug, title, location_id, badge,
    guests, bedrooms, bathrooms,
    cleaning_fee, cleaning_currency, cleaning_limit,
    location:villa_locations(name),
    villa_images (image_url, is_cover, sort_order),
    villa_prices (price, currency, start_date, end_date)
  `)
  .eq("is_active", true)
  .is("deleted_at", null)
  .order("is_cover", { referencedTable: "villa_images", ascending: false })
  .order("sort_order", { referencedTable: "villa_images", ascending: true })
  .limit(1, { referencedTable: "villa_images" })      // ← görsel sınırlı
  .order("sort_order", { ascending: true })
  .order("created_at", { ascending: false });
```

| Soru | Cevap | Güven |
|---|---|---|
| `SELECT *` var mı? | **HAYIR** — 11 kolonluk slim projeksiyon. Bu zaten optimize edilmiş. | CONFIRMED |
| Gereksiz kolon? | Hayır; 11 kolonun tamamı `VillaListesiRow`'da tüketiliyor. | CONFIRMED |
| Relations gereksiz veri getiriyor mu? | **EVET — `villa_prices` embed'inde `.limit()` YOK.** Her villanın **tüm sezonluk fiyat satırları** (geçmiş sezonlar dahil) çekiliyor. Asıl payload kaynağı bu. | CONFIRMED |
| N+1 var mı? | **HAYIR.** `lib/db/query-compiler.ts:260-290` — embed'ler JOIN değil, SELECT listesinde korelasyonlu alt-sorgu + `json_build_object`. Tek SQL ifadesi, tek round-trip. | CONFIRMED |
| ORDER BY | Top-level: `sort_order ASC, created_at DESC`. Embed-level: `villa_images.is_cover DESC, sort_order ASC`. | CONFIRMED |
| WHERE | `is_active = true AND deleted_at IS NULL`. Başka filtre yok. | CONFIRMED |
| Index destekliyor mu? | Kısmen — bkz. §8 | CONFIRMED |

**Kritik teknik detay (çözüm için belirleyici):** Embed'ler korelasyonlu alt-sorgu olduğundan, PostgreSQL bunları **ORDER BY + LIMIT sonrası yalnız dönen satırlar için** değerlendirir. Yani top-level'a `LIMIT 24` eklenirse, 1.595 villanın değil **yalnız 24 villanın** fiyat/görsel alt-sorguları çalışır. Pagination bu mimaride gerçekten işe yarar.

**İkinci sınırsız sorgu:** `villaTypeRepository.findAllRelations()` → `SELECT type_id, villa_id FROM villa_type_relations` — **hiçbir filtre/limit yok**. 1.595 villa × ortalama 2-4 kategori ≈ **3.000–6.000 satır** (TAHMİN).

---

## 3. MEVCUT PAGINATION ALTYAPISI

Projede **iki ayrı, olgun pagination deseni** zaten var. Yeni bir sistem icat etmeye gerek yok.

### Desen A — Server-side OFFSET/LIMIT (`/maki-admin/villas`)

| Katman | Dosya | Not |
|---|---|---|
| Repository | `lib/db/villa.repository.server.ts` → `listForAdmin({limit, offset, q, active, document})` | `.range(offset, offset+limit-1)` → `LIMIT/OFFSET` |
| Repository | aynı dosya → `countForAdmin({q, active, document})` | `SELECT count(*)::int` — **exact**, aynı filtre helper'ı → count↔items paritesi |
| Service | `app/services/villa.service.ts:648` → `getVillasForAdminPage({page, pageSize, q, active, document})` | list + count **paralel** `Promise.all` |
| Page | `app/(admin)/maki-admin/villas/page.tsx` | `?page` `?pageSize` `?q` `?status` `?document`; `ALLOWED_PAGE_SIZES = [10,30,50,100]`, default 30 |
| UI | `_components/VillaOperationsList.tsx` | `PaginationBar` (satır 319) + `computePageWindow` (satır 416), `router.replace(..., {scroll:false})`, 350 ms debounce, **filtre/pageSize değişince `page=1` reset** |

Servis dosyasının kendi yorumu (`villa.service.ts:641-643`): *"1000-2000 villa scale'inde LIMIT/OFFSET yeterli; cursor pagination ileride (5000+ ölçek)."*

### Desen B — Client-side slice + URL state (`/maki-admin/manual-reservations`)

`_components/ManualReservationList.tsx:31-37` yorumunda birebir şunu yazıyor:

> *"Bu sayfa zaten TÜM kayıtları client tarafında çekip filtreliyor; bu yüzden server-side pagination YOK. Repository/API/service/DB'ye DOKUNULMAZ — yalnız filtered `visibleItems` client tarafında dilimlenir."*

Aynı `ALLOWED_PAGE_SIZES` + `PaginationBar` + `computePageWindow` + URL `?page/?pageSize` + default'ları URL'e yazmama kuralı.

### Ortak altyapı

`lib/pagination.ts` — `computePageWindow`, `parsePublicPage`, `parsePublicPageSize`, `applyPublicSort`, `parsePublicSort`.
**`VillaListesiClient.tsx:31-35` bu dosyadan ZATEN import yapıyor** (`applyPublicSort`, `parsePublicSort`, `PublicSort`). `computePageWindow`'u aynı import satırına eklemek yeterli — yeni dosya/dependency yok.

`PaginationBar` bileşeni **paylaşılan bir modül değil**; iki admin dosyasında birebir kopya olarak yaşıyor (`VillaOperationsList.tsx:319`, `ManualReservationList.tsx:389`). Public tarafta da aynı algoritmanın üçüncü kopyası var (`AramaPageBody.tsx:1598`).

---

## 4. SAYFALAMA STRATEJİSİ — A vs B

| Kriter | A) OFFSET/LIMIT | B) Cursor / keyset |
|---|---|---|
| Mevcut altyapı | **Hazır** — `listForAdmin` + `countForAdmin` + `.range()` compiler desteği var | **Yok** — QueryBuilder'da `WHERE (sort_order, created_at, id) > (...)` tuple karşılaştırması ifade edilemiyor; yeni SQL yeteneği gerekir |
| 1.595 kayıtta performans | Son sayfada `OFFSET 1571` → PostgreSQL 1.595 satır tarayıp 24'ünü döndürür. Bu ölçekte **ihmal edilebilir** | Marjinal kazanç, ölçülemez fark |
| Sayfa atlama ("7. sayfaya git") | Doğal | Desteklenmez — sadece ileri/geri |
| Toplam sayfa sayısı | `COUNT(*)` ile doğal | Ek maliyet/karmaşıklık |
| Kararlılık (eşzamanlı ekleme) | Sayfa sınırında kayma riski — admin curator ekranında pratikte önemsiz | Kararlı |
| Risk | **Düşük** (mevcut desen) | **Yüksek** (yeni mekanizma, kullanıcı "icat etme" dedi) |

**Karar: OFFSET/LIMIT.** Cursor pagination bu ölçekte (1.595) ölçülebilir fayda vermez, mevcut mimariye yeni SQL yeteneği eklemeyi gerektirir ve kullanıcının "yeni ve gereksiz bir pagination sistemi icat etme" kısıtını ihlal eder. Projenin kendi service yorumu da bu eşiği "5000+" olarak koymuş.

---

## 5. ARAMA VE FİLTRELER — ve neden server-side pagination'ı bloke ediyorlar

`VillaListesiClient.tsx` içinde **6 filtre + 1 sıralama**, tamamı client-side, hepsi `useState` (URL'de **hiçbiri yok**):

| # | Filtre | Satır | Server'a itilebilir mi? |
|---|---|---|---|
| 1 | Tarih aralığı → **müsaitlik** (`getBlockedVillaIdsAction`) | 232-243 | **Kısmen** — `getBlockedVillaIds(start, end, null)` helper'ı `villaIds` olmadan da çalışıyor (`availability.helper.ts:38`), yani tüm blocked id'ler alınabilir. Ama sonucu SQL'e `NOT IN (binlerce uuid)` olarak taşımak gerekir |
| 2 | Misafir sayısı (`guests >= n`) | 279 | ✅ `.gte("guests", n)` |
| 3 | Bölge — **grup genişletmeli** (mig 050: seçilen kök → gruptaki tüm location_id'ler) | 252-266 | ✅ `.in("location_id", expandedIds)` |
| 4 | Kategori — **çoklu seçim, AND semantiği** (villa TÜM seçili kategorilere sahip olmalı) | 281-288 | ❌ **Blokaj.** `HAVING count(*) = N` gerektirir; custom QueryBuilder bunu ifade edemez |
| 5 | Metin arama — Türkçe-normalize, **title + bölge adı + slug + id** üzerinde | 290-301 | ❌ **Blokaj.** Mevcut server helper `buildVillaSearchOrClauseNative` yalnız title/slug kapsıyor ve farklı normalize ediyor → **davranış değişir** |
| 6 | Sıralama — `smart` / `capacity-asc/desc` / **`price-asc/desc`** | 322-358 | ❌ **Blokaj.** Fiyat sıralaması `calculateGrandTotal` + kullanıcının `CurrencyContext` para birimi + canlı kur tablosuyla client'ta hesaplanıyor. Server'a taşımak fiyat motoruna dokunmak demek |

**Sonuç (bu analizin en önemli bulgusu):** Tam server-side pagination, 4/5/6 numaralı filtreler yüzünden **ya davranış değişikliği ya da fiyat/müsaitlik motoruna müdahale** gerektiriyor. Kullanıcının açık kısıtı: *"çalışan rezervasyon ve fiyat hesaplama sistemini iyileştirmek amacıyla refactor etme."*

**URL/state mimarisi:** Bu sayfada `useSearchParams`/`router` **hiç kullanılmıyor**. `?q=kalkan&page=2` gibi bir yapı bugün **yok**. Filtreler URL'e bağlanırsa refresh davranışı değişir (bugün refresh tüm filtreleri sıfırlıyor) — bu ayrı bir UX değişikliği, pagination'ın önkoşulu değil.

**Filtre değişince `page=1` reset:** **Evet, zorunlu.** Aksi halde 5. sayfadayken filtre daraltılınca boş ekran kalır. Her iki mevcut desen de bunu yapıyor.

---

## 6. UI / UX — pagination neyi bozar?

| Öğe | Durum | Pagination etkisi |
|---|---|---|
| `VillaCard` | `app/components/villa/VillaCard.tsx` — **1.491 satır, `"use client"`** | Sayfa başına 24 mount → **asıl kazanç burada** |
| Grid render | `VillaListesiClient.tsx:653` `sortedFiltered.map(...)` — **slice/limit YOK** | 1.595 → 24 |
| Seçim checkbox | `selected: Set<string>` (satır 190), `toggleSelect` | **Client-side pagination'da hiç etkilenmez** — Set tüm sayfalar boyunca yaşar |
| "Tümünü Seç" | `selectAllFiltered()` (satır 371) = `new Set(filtered.map(v => v.id))` | **Client-side'da semantik aynen korunur** (filtrelenen TÜM villalar, sayfadan bağımsız). **Server-side'da bozulur** — ya yalnız görünen sayfa seçilir ya da ayrı bir "tüm id'leri getir" sorgusu gerekir |
| Sticky alt bar ("X villa seçildi") | satır 737-748 | Etkilenmez |
| "Listeyi Paylaş" | `handleSubmitShare` → `createSharedVillaList({villaIds: Array.from(selected), ...})` | Etkilenmez — seçili id'lerle çalışıyor, render edilenlerle değil |
| Toplu silme / düzenleme / aktif-pasif | **Bu sayfada YOK** | — |
| Drag & drop sıralama | **Bu sayfada YOK** (ayrı ekran: `/maki-admin/villas/siralama`) | — |

**Kritik nokta:** Bu sayfanın tek "toplu işlem"i seçim + paylaşım. Client-side pagination bunların hiçbirine dokunmaz. Server-side pagination ise doğrudan "Tümünü Seç" semantiğini bozar.

---

## 7. CACHE

**Bu sayfa cache kullanmıyor.** `page.tsx:38` `export const dynamic = "force-dynamic"` → her ziyarette 4 sorgu.

`lib/cache.helpers.ts`'te `getCachedVillas` var ama **farklı bir sorgu** (public `listPublic`, farklı projeksiyon) ve bu sayfa onu kullanmıyor.

**Değerlendirme: admin curator ekranında cache KULLANILMAMALI.** Gerekçe: admin bir villayı pasife alır/fiyat günceller, hemen bu ekranda doğrulamak ister. `unstable_cache` TTL'i veya bayat tag bu ekranda yanlış seçki paylaşılmasına yol açar. Ayrıca sorgu sayısı 4 ve pagination sonrası maliyet zaten düşecek. **Öneri: mevcut `force-dynamic` korunsun, cache eklenmesin.** Pagination cache key/tag tasarımı bu yüzden gündeme gelmiyor.

---

## 8. DATABASE PERFORMANSI — index

Stack: **native PostgreSQL + `pg` sürücüsü + ev yapımı QueryBuilder/QueryCompiler.** Drizzle veya başka ORM yok.

**`villa` tablosunda mevcut index'ler (migration'lardan):**

| Index | Tanım | Kaynak |
|---|---|---|
| `idx_villa_visibility` | `ON villa (is_active) WHERE deleted_at IS NULL` | `003:41` |
| `idx_villa_deleted_at` | `ON villa (deleted_at)` | `003:45` |
| `idx_villa_sort_order` | `ON villa (sort_order)` | `006:44` |
| `villa_search_title_trgm_idx` | trigram, arama için | `065:86` |
| `villa_real_title_search_trgm_idx` | trigram | `078:111` |

**Bu sorgu için durum:**
- `WHERE is_active = true AND deleted_at IS NULL` → `idx_villa_visibility` **tam uyumlu** (partial index, doğru kurulmuş).
- `ORDER BY sort_order ASC, created_at DESC` → `idx_villa_sort_order` yalnız ilk kolonu kapsıyor; **composite index yok**. Bugün de yok ve sorgu zaten tüm satırları döndürdüğü için sort maliyeti ödeniyor.

**ÖNERİ (migration OLUŞTURULMADI, yalnız öneri):**
```
-- ÖNERİ — uygulanmadı
CREATE INDEX IF NOT EXISTS idx_villa_active_sort
  ON public.villa (sort_order ASC, created_at DESC)
  WHERE deleted_at IS NULL AND is_active = true;
```
Bu, `LIMIT 24` ile birlikte PostgreSQL'in **top-N sort yerine doğrudan index taraması** yapmasını sağlar. **Ancak:** 1.595 satırlık bir tabloda bu fark muhtemelen ölçülemez (**TAHMİN** — EXPLAIN erişimi yok). **Pagination için ön koşul DEĞİLDİR.** Önce pagination uygulanmalı, index gerekirse sonra ölçüme dayalı eklenmeli.

**Doğrulanamayan:** `villa_images.villa_id` ve `villa_prices.villa_id` FK index'leri repo'da **yok**; prod'da baseline'dan gelmiş olabilir (§H6 — şema baseline dosyası eksik). Korelasyonlu alt-sorgular bu kolonlar üzerinden çalıştığı için bunlar aslında daha önemli. **UNKNOWN — prod'da `pg_indexes` sorgusu gerekir.**

---

## 9. TOTAL COUNT

**Client-side pagination seçilirse: COUNT(*) sorgusuna hiç gerek yok.** `filtered.length` zaten bellekte, maliyeti sıfır ve filtrelerle %100 tutarlı. Bu, seçilen çözümün doğal bir avantajı.

Karşılaştırma (server-side senaryosu için):

| Yöntem | Maliyet | Değerlendirme |
|---|---|---|
| `COUNT(*)` + data ayrı sorgu (mevcut `countForAdmin` deseni) | 1.595 satırda **~1-3 ms** (TAHMİN); `idx_villa_visibility` ile index-only scan mümkün | Bu ölçekte tamamen güvenli |
| Tek sorguda window function `count(*) OVER()` | QueryBuilder desteklemiyor | ❌ yeni yetenek gerekir |
| `pg_class.reltuples` estimated count | Filtreli count veremez | ❌ uygun değil |
| Count göstermeden next/prev | UX kaybı ("1.595 villa" bilgisi gidiyor) | Gereksiz taviz |

**En güvenli seçenek: `filtered.length` (client-side).** Server-side'a geçilseydi, mevcut `countForAdmin` + paralel `Promise.all` deseni zaten doğru cevap olurdu — 1.595 kayıtta `COUNT(*)` bir sorun değil.

---

## 10. PERFORMANS ÖLÇÜMÜ

### KESİN (koddan doğrulanmış)

| Ölçüm | Değer |
|---|---|
| Sayfa açılışındaki DB sorgusu | **4** (+1 RPC, tarih seçilirse) |
| Çekilen villa sayısı | **TÜM aktif villalar — LIMIT yok** (~1.595) |
| Render edilen `VillaCard` | **Filtrelenen tüm villalar — slice yok** (`VillaListesiClient.tsx:653`) |
| `VillaCard` boyutu | **1.491 satır, `"use client"`** |
| `villa_prices` embed limiti | **YOK** — tüm sezonluk satırlar |
| `villa_images` embed limiti | **1** (cover-only — doğru yapılmış) |
| `villa_type_relations` fetch | **Tüm tablo** — filtre/limit yok |
| Top-level kolon sayısı | 11 (slim — `SELECT *` değil) |
| Cache | **Yok** (`force-dynamic`) |
| Tarih seçilince client→server gönderilen id | **1.595 UUID** (`VillaListesiClient.tsx:236` `villas.map(v => v.id)`) |

### TAHMİN (prod erişimi yok — varsayımlar açıkça belirtilmiştir)

Varsayımlar: villa başına ortalama 10 sezonluk fiyat satırı; başlık ~40 karakter; görsel URL ~90 karakter; UUID 36 karakter.

| Kalem | Hesap | Tahmin |
|---|---|---|
| Villa başına JSON | 11 skaler (~220 B) + 1 görsel (~110 B) + 10 fiyat satırı × ~85 B (~850 B) | **~1,2 KB** |
| 1.595 villa RSC payload | 1.595 × 1,2 KB | **~1,9 MB** (sıkıştırılmamış; gzip sonrası ~250-400 KB) |
| `villa_type_relations` | ~4.500 satır × ~80 B | **~360 KB** |
| Tarih seçilince POST edilen id listesi | 1.595 × ~38 B | **~60 KB** |
| Villa detay sorgusu süresi | 1.595 satır × 3 korelasyonlu alt-sorgu | **~200–800 ms** (index durumuna bağlı) |
| 1.595 client component hydration | — | **saniyeler mertebesinde ana-thread bloklama** |

**En pahalı kalem — ve asıl darboğaz:** DB sorgusu değil, **1.595 adet 1.491 satırlık client component'in mount + hydration maliyeti**. Her kart ayrıca `getStartingPrice` / `calculateGrandTotal` çalıştırıyor, `next/image` instance'ı ve IntersectionObserver kuruyor. Kullanıcının hissettiği "ağır/yavaş" öncelikle budur (**LIKELY** — RUM verisi yok, ama yapısal olarak baskın kalem).

Sıralama: **render ≫ RSC payload > DB sorgusu.**

---

## 11. RİSK ANALİZİ

Önerilen çözüm (§12, client-side pagination) için:

| Konu | Etki | Gerekçe |
|---|---|---|
| Villa CRUD | ❌ **Etkilenmez** | Bu sayfada CRUD yok |
| Villa silme | ❌ **Etkilenmez** | Bu sayfada yok (`/maki-admin/villas`) |
| Düzenleme | ❌ **Etkilenmez** | Kartlar `/maki-admin/villas/[id]`'ye link veriyor, link değişmiyor |
| Filtreler (bölge/kategori/misafir/tarih) | ❌ **Etkilenmez** | Filtre pipeline'ına dokunulmuyor; slice **sonrasında** uygulanıyor |
| Arama | ❌ **Etkilenmez** | Aynı `normalizeSearchText` pipeline'ı |
| Sıralama (fiyat/kapasite) | ❌ **Etkilenmez** | `applyPublicSort` aynen; slice sort'tan sonra |
| Müsaitlik (`get_blocked_villa_ids`) | ❌ **Etkilenmez** | RPC çağrısı ve fail-soft davranışı aynen |
| Seçim / "Tümünü Seç" | ❌ **Etkilenmez** | `selected` Set'i sayfalar arası yaşar; `selectAllFiltered` filtrelenen **tüm** villaları seçmeye devam eder |
| "Listeyi Paylaş" | ❌ **Etkilenmez** | Seçili id'lerle çalışıyor |
| Mevcut admin URL'leri | ❌ **Bozulmaz** | `?page`/`?pageSize` **additive**; default'lar URL'e yazılmıyor → `/maki-admin/villa-listesi` bugünkü haliyle çalışmaya devam eder |
| Back / forward | ✅ **İyileşir** | `router.replace` + URL state (iki mevcut desenle aynı) |
| Refresh | ⚠️ **Kısmi** | `page` URL'den geri gelir; **filtreler bugün de URL'de olmadığı için sıfırlanır** (mevcut davranış). `page`, `totalPages`'e clamp edilmeli — aksi halde "sayfa 40, filtre yok" tutarsızlığı görünür. Aynı kısmi tutarsızlık `ManualReservationList`'te de kabul edilmiş durumda |
| i18n / admin yapısı | ❌ **Etkilenmez** | Admin paneli i18n kapsamı dışında; ortak layout/CSS değişmiyor |

---

## 12. EN GÜVENLİ ÇÖZÜM

### MEVCUT DURUM
→ **Sorunun gerçek kaynağı iki katmanlı, ama ağırlık tek tarafta:**
1. **(Baskın)** `VillaListesiClient.tsx:653` — `sortedFiltered.map()` hiçbir dilimleme yapmadan **1.595 adet 1.491 satırlık `"use client"` `VillaCard`** mount ediyor. Kullanıcının hissettiği yavaşlığın ana kaynağı bu.
2. **(İkincil)** `findActiveCuratorCards()` LIMIT'siz; `villa_prices` embed'i sınırsız; `findAllRelations()` tüm junction tablosunu çekiyor → ~1,9 MB RSC payload (TAHMİN).

Katman 2'yi tam olarak çözmek — yani gerçekten "sayfa başına 24 villa çekmek" — **kategori AND filtresi, Türkçe-normalize çok alanlı arama ve fiyat sıralamasını server'a taşımayı** gerektirir. Bunların üçü de ya davranış değişikliği ya da fiyat/müsaitlik motoruna müdahale demektir (§5) — kullanıcının açık kısıtına aykırı.

### ÖNERİLEN ÇÖZÜM
→ **`ManualReservationList` desenini (Desen B) birebir uygula: filtrelenmiş+sıralanmış listeyi client tarafında dilimle, sayfa durumunu URL'e bağla.**

Tam olarak `VillaListesiClient.tsx` içinde:
1. Mevcut `@/lib/pagination` import satırına **`computePageWindow`** ekle (dosya bu modülden zaten import yapıyor — yeni bağımlılık yok).
2. `ALLOWED_PAGE_SIZES = [12, 24, 48, 96]`, `DEFAULT_PAGE_SIZE = 24` sabitlerini ekle.
3. `useSearchParams` + `useRouter` + `usePathname` ile `?page` / `?pageSize` oku; default'ları URL'e **yazma** (temiz URL kuralı — iki mevcut desende de böyle).
4. `sortedFiltered` **sonrasına** tek satır dilimleme ekle:
   `const pageItems = sortedFiltered.slice((safePage-1)*pageSize, safePage*pageSize)`
5. Render'da `sortedFiltered.map(...)` → `pageItems.map(...)`. **Başka hiçbir satır değişmez.**
6. Filtre/arama/sıralama/pageSize değişiminde `page=1` reset (`useEffect`, mevcut desenle aynı).
7. `safePage = Math.min(Math.max(1, pageFromUrl), totalPages)` ile clamp.
8. Grid'in altına `PaginationBar` + üst barda "1.595 villadan 25-48 arası" aralık göstergesi.

`PaginationBar` bileşeni **yerel kopya** olarak eklenmeli (`ManualReservationList.tsx:389` ile birebir). Ortak bir modüle çıkarmak iki çalışan admin sayfasına dokunmak demektir → blast radius 1 dosyadan 3 dosyaya çıkar. Ortak modüle çıkarma ayrı bir temizlik işi olarak sonraya bırakılmalı.

### PAGINATION MODELİ
→ **OFFSET/LIMIT semantiği, client-side (in-memory slice).** Cursor/keyset **reddedildi**: 1.595 kayıtta ölçülebilir fayda yok, QueryBuilder tuple karşılaştırmasını ifade edemiyor, sayfa atlamayı desteklemiyor, ve projenin kendi service yorumu eşiği "5000+" olarak koymuş.
→ **Page size: 24** (varsayılan). Allow-list `[12, 24, 48, 96]`. 24 sayısı 2/3/4 kolonlu grid'in üçüne de tam bölünüyor.
→ **URL: `/maki-admin/villa-listesi?page=3&pageSize=48`**. `page=1` ve `pageSize=24` URL'e yazılmaz.

### DATABASE
→ **Sorgu DEĞİŞMEZ.** Repository, service, migration, index — hiçbirine dokunulmaz.
→ **Gerekli index: HAYIR.** §8'deki `idx_villa_active_sort` önerisi yalnızca ileride server-side pagination'a geçilirse anlamlı; bu çözüm için **ön koşul değil**.
→ **Migration: GEREKMİYOR.**

### UI
→ Pagination bar **grid'in hemen altında**, ortalanmış; `ManualReservationList` / `VillaOperationsList` ile görsel olarak birebir aynı (`--brand-coral` aktif pill, "← Önceki / 1 2 3 … 67 / Sonraki →").
→ Aralık göstergesi mevcut `{filtered.length} villa` sayacının (satır 452) yanına: "1.595 villadan 25-48 arası".
→ `pageSize` seçici, mevcut sıralama `<select>`'inin yanına aynı `.input` sınıfıyla.
→ **Mevcut tasarım korunur:** filtre grid'i, kart grid'i, seçim checkbox overlay'i, sticky alt bar ve paylaş modalı hiç değişmez.

### PERFORMANS KAZANCI
| | Şu an | Sonra |
|---|---:|---:|
| Render edilen `VillaCard` | ~1.595 | **24** |
| Mount edilen client component | ~1.595 × 1.491 satır | **~66× azalma** |
| DB sorgusu (sayfa açılışı) | 4 | **4** (değişmez) |
| RSC payload | ~1,9 MB (TAHMİN) | ~1,9 MB (değişmez) |
| Sayfa değiştirme maliyeti | — | **0 DB sorgusu** (bellekten dilimleme) |
| `COUNT(*)` | — | **gerekmiyor** |

**Dürüst değerlendirme:** Bu çözüm kullanıcının hissettiği yavaşlığın baskın kısmını (render/hydration) çözer; DB fetch'ini ve payload'ı **değiştirmez**. Payload'ı da düşürmek isteniyorsa bu, §5'te listelenen üç blokaj nedeniyle **ayrı ve daha riskli bir ikinci adımdır** — ve ancak bu adım uygulandıktan sonra yapılacak ölçümle karar verilmelidir.

### RİSK
→ **DÜŞÜK.**
Gerekçe: (a) Tek dosya, tek render satırı değişiyor; filtre/sıralama/seçim/paylaşım pipeline'ına hiç dokunulmuyor. (b) Aynı kod tabanında, aynı admin alanında, aynı gerekçeyle yazılmış **birebir precedent** var (`ManualReservationList`). (c) DB/repository/service/migration/cache tamamen dışarıda. (d) URL parametreleri additive — mevcut linkler bozulmuyor. (e) Geri alınması tek satırlık (`pageItems` → `sortedFiltered`).

### DEĞİŞECEK DOSYALAR
→ **1 dosya:**
- `app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient.tsx`

(İsteğe bağlı, +1: `PaginationBar`'ı paylaşılan bir bileşene çıkarmak istenirse `app/components/admin/shared/` altında yeni bir dosya — **ama bu, mevcut iki admin sayfasına dokunmayı gerektirir ve bu iş için önerilmez.**)

→ **Test önerisi (ayrıca):** `tests/unit/` altına dilimleme + `page=1` reset + clamp davranışını kilitleyen bir test. Mevcut testler gevşetilmeden, eklenerek.

### DEĞİŞMEYECEKLER
- `app/(admin)/maki-admin/villa-listesi/page.tsx` (server fetch)
- `lib/db/villa.repository.server.ts` — `findActiveCuratorCards` dahil tüm repository
- `app/services/villa.service.ts`, `shared-villa-list.service.ts`
- `lib/price.engine.ts` — fiyat hesaplama, `getStartingPrice`, `calculateGrandTotal`
- `lib/availability.helper.ts`, `lib/availability.action.ts`, `get_blocked_villa_ids` RPC
- `app/components/villa/VillaCard.tsx`
- Rezervasyon sistemi, müsaitlik, ödeme, iCal, R2/storage, authentication
- Public site: `/arama`, `/kiralik-villalar`, villa detay, `/liste/[token]`
- Diğer admin modülleri: `/maki-admin/villas`, `/siralama`, `/manual-reservations`, vb.
- Tüm `db/migrations/*.sql` — **migration yok**
- `lib/cache.helpers.ts`, `revalidate.actions.ts` — cache/tag yapısı

---

## 14. SONUÇ

**PERFORMANS PROBLEMİ:**
Kök neden çift katmanlı, ama ağırlık tek tarafta. **Baskın:** `VillaListesiClient.tsx:653` dilimleme yapmadan ~1.595 adet 1.491 satırlık client `VillaCard` mount ediyor → ana-thread saniyelerce bloklanıyor. **İkincil:** `findActiveCuratorCards()` LIMIT'siz + `villa_prices` embed'i sınırsız + `findAllRelations()` tüm junction tablosu → ~1,9 MB RSC payload (TAHMİN).

**EN GÜVENLİ ÇÖZÜM:**
`VillaListesiClient.tsx` içinde, `ManualReservationList` desenini birebir kullanarak client-side pagination (`sortedFiltered` üzerinde slice) + URL state (`?page`/`?pageSize`) + `lib/pagination.ts`'teki mevcut `computePageWindow`. Sayfa başına 24. Yeni pagination sistemi icat edilmiyor, DB/repository/service'e dokunulmuyor.

**TAHMİNİ RİSK:** **DÜŞÜK** — tek dosya, tek render satırı; aynı kod tabanında birebir precedent var; geri alınması tek satır.

**TAHMİNİ KAZANÇ:**
- Render edilen kart: ~1.595 → **24** (~66× azalma)
- Sayfa değiştirme: **0 DB sorgusu, 0 network** (bellekten dilimleme)
- `COUNT(*)`: **gerekmiyor** (`filtered.length` bedava ve filtrelerle %100 tutarlı)
- DB sorgusu sayısı: 4 → 4 (**değişmez**), payload: ~1,9 MB (**değişmez**)

**DEĞİŞECEK DOSYA SAYISI:** **1** (+ isteğe bağlı 1 test dosyası)

**DB MIGRATION GEREKİYOR MU:** **HAYIR**

**MEVCUT İŞLEVLERDEN HANGİLERİ ETKİLENİR:**
- Villa grid'inin görünümü (sayfa başına 24 kart + altında pagination bar)
- URL'e `?page` / `?pageSize` parametreleri eklenir (additive; default'lar yazılmaz)
- Filtre/arama/sıralama/pageSize değişiminde otomatik `page=1` reset
- Refresh sonrası `page` korunur; **filtreler bugün olduğu gibi sıfırlanmaya devam eder** (URL'de değiller) → `page`, `totalPages`'e clamp edilmeli

**HANGİLERİ KESİNLİKLE ETKİLENMEZ:**
Villa seçimi ve "Tümünü Seç" semantiği · "Listeyi Paylaş" ve token üretimi · tarih/bölge/kategori/misafir filtreleri · Türkçe-normalize arama · fiyat ve kapasite sıralaması · müsaitlik RPC'si ve fail-soft davranışı · `VillaCard` · fiyat hesaplama motoru · para birimi dönüşümü · rezervasyon sistemi · ödeme · iCal · R2/storage · authentication · public site (`/arama`, `/kiralik-villalar`, villa detay, `/liste/[token]`) · diğer tüm admin modülleri · veritabanı şeması, migration'lar, index'ler · cache/tag yapısı.

---

### Ek not — "sayfa başına 24 villa ÇEKMEK" gerçekten isteniyorsa

Bu, yukarıdaki çözümden **ayrı ve daha riskli bir ikinci adımdır.** Ön koşulları:
1. **Kategori AND filtresi** SQL'e taşınmalı (`HAVING count(*) = N`) → QueryBuilder'a yeni yetenek.
2. **Arama semantiği** ya daraltılmalı (bölge adı + id araması kaybolur) ya da server'da Türkçe-normalize arama yazılmalı → **davranış değişikliği**.
3. **Fiyat sıralaması** server'a taşınmalı → `calculateGrandTotal` + kur tablosu + kullanıcı para birimi server'a taşınır → **fiyat motoruna müdahale** (kullanıcı kısıtına aykırı).
4. **"Tümünü Seç"** ayrı bir "filtreye uyan tüm id'leri getir" sorgusu gerektirir.
5. `villa_prices` embed'i sınırlanamaz: `getStartingPrice` (`lib/price.engine.ts`) **geçmiş sezonlar dahil** global minimumu alıyor → `end_date >= today` filtresi gösterilen başlangıç fiyatını **değiştirir**.

Tahmini risk: **ORTA-YÜKSEK**, değişecek dosya: 5-8. **Önce Adım 1 uygulanıp ölçüm yapılmadan bu adıma geçilmesi önerilmez.**
