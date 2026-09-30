# /arama — SQL Pagination Uyumluluk Audit'i

- Tarih: 2026-09-23 · Commit: `9dc4566`
- Soru: *"Yaklaşık 1500+ villayı çekip JS'te filtreleyen mevcut `/arama` mimarisini SQL pagination'a / SQL tarafında filtrelemeye geçirmek, mevcut filtreleme ve müsaitlik sistemini bozar mı?"*
- Yöntem: salt-okunur kod okuma. Hiçbir proje dosyası, config, env, DB veya migration değiştirilmedi; commit ve push yapılmadı.

## 0. Etiketler ve kısıtlar

| Etiket | Anlamı |
|---|---|
| **[KOD KANITI]** | Kaynakta dosya:satır ile gösterildi |
| **[TAHMİN]** | Mekanizmadan türetildi, ölçülmedi |
| **[ÖLÇÜLEMEDİ]** | Erişim yok; §10.3'te ölçüm SQL'i verildi |

- **DB erişimi yok:** `.env.local` → `aws-0-eu-west-1.pooler.supabase.com:5432`, DNS çözümlenemiyor (`getent hosts` → FAIL). **Hiçbir SELECT/EXPLAIN çalıştırılmadı; plan uydurulmadı.**
- **Prod DB'nin yeri doğrulanamadı:** `db/migrations/_archive/README.md` projenin "native PostgreSQL (Hetzner)"e geçtiğini söylüyor, `.env.local` ise Supabase pooler gösteriyor. Hangisi prod, doğrulanamadı.
- **"1500+ villa" sayısı doğrulanamadı** (DB yok). Aşağıdaki hacim hesapları bu sayıyı **varsayım** olarak kullanır.
- **Önceki raporun düzeltmesi:** `public-performance-audit-v2.md` §2.3'te "W2 L419 → W3 L486 sıralı" yazıyordu. **Bu yanlış.** İki junction sorgusu L408/L412'de promise olarak birlikte başlatılıyor, sonra ayrı ayrı await ediliyor; yani **paraleller** [KOD KANITI]. O dosyaya dokunulmadı, düzeltme burada kayıtlı.

---

## 1. Mevcut sistemin haritası

### 1.1 Dosyalar

| Katman | Dosya | Rol |
|---|---|---|
| Route | `app/(public)/arama/page.tsx` (+ `en/arama`, `de/arama`) | `export const dynamic = "force-dynamic"`; `<AramaPageBody locale=… />` |
| Gövde (server) | `app/components/search/AramaPageBody.tsx` (1.895 satır) | **Tüm pipeline burada** |
| Sidebar (client) | `app/(public)/arama/FilterSidebar.tsx` (1.245 satır) | Yalnız URL üretir (`router.push`); **sonuçları filtrelemez** |
| Kart (client) | `app/components/villa/VillaCard.tsx` | Tarih varsa toplamı **gösterim için** yeniden hesaplar; filtreleme yapmaz |
| Villa sorgusu | `lib/db/villa.repository.server.ts:466-534` `findSearchResults` | Tek SQL + correlated embed'ler |
| Tip/özellik junction | `lib/db/villa-type.repository.ts:96` · `lib/db/villa-feature.repository.ts:82` | `SELECT villa_id, type_id/feature_id WHERE … IN (…)` |
| Müsaitlik | `lib/availability.helper.ts:118` `getBlockedVillaIds` → `reservation.repository.ts:283` → RPC `get_blocked_villa_ids` | 3 tablonun blocking birleşimi |
| RPC tanımı | `db/migrations/_archive/legacy/039_availability_rpc.sql` | `language sql stable security definer` (arşiv README'ye göre tanım "hâlâ geçerli") |
| Fiyat motoru | `lib/price.engine.ts` (`getStartingPrice:67`, `getDailyPrice:102`, `calculateStayTotal:297`, `calculateGrandTotal:519`) | Sıralama anahtarı + kart toplamı |
| Kur | `lib/currency.ts:39` `convertPrice` · `app/services/exchange-rate.service.ts:40` `getExchangeRatesMap` (cache'siz) | |
| Sıralama/sayfalama | `lib/pagination.ts` (`applyPublicSort:184`, `ALLOWED_PUBLIC_PAGE_SIZES:21` = [12,30,50,100]) | JS |
| Review | `app/services/villa-review.service.ts:263` `getVillaReviewStatsBatch` | Tüm onaylı review'lar, JS aggregate (`clampRating`) |
| Query compiler | `lib/db/query-compiler.ts`, `lib/db/query-builder.ts` | Embed → correlated subquery |

### 1.2 URL kontratı (`AramaSearchParams`, L142-181) [KOD KANITI]

| Param | Anlam | Not |
|---|---|---|
| `villa-turleri` (eski: `categories`) | villa tipi, slug veya UUID, virgüllü | **AND** semantiği |
| `bolgeler` (eski: `regions`) | bölge, slug veya UUID | grup kökü (ör. "Kalkan") alt bölgelere genişletilir (L559) |
| `start`, `end` | `YYYY-MM-DD` | ikisi de geçerli ve `start < end` ise `hasDateRange` (L277) |
| `guests` | toplam kişi | FilterSidebar yalnız `>1` ise yazar (`FilterSidebar.tsx:403`) |
| `ozellikler` | özellik UUID'leri | **AND**; slug yok |
| `flexible` | 0–3 gün | ek "±N gün" sonuç bölümü |
| `sort` | `smart` \| `price-asc` \| `price-desc` \| `capacity-asc` \| `capacity-desc` | |
| `page`, `pageSize` | 1-based; pageSize ∈ {12,30,50,100} | |

**Olmayan filtreler [KOD KANITI]:**
- **Fiyat aralığı filtresi (min/max) yok.** URL kontratında da, pipeline'da da bulunmuyor.
- **Ayrı bir "havuz" filtresi yok.** `villa` tablosunda havuz kolonları var (migration 073/074: `pool_sheltered`, `pool_heating`), ama `/arama` bunları okumuyor. "Özel Havuz" ancak bir **villa özelliği** (`ozellikler`) ya da bir **villa tipi** (`villa-turleri`) olarak filtrelenebilir. Hangisi olduğu DB'de: **doğrulanamadı**.

### 1.3 Filtreleme TAM OLARAK nerede yapılıyor?

#### A) PostgreSQL'de yapılanlar
| Filtre | Nerede | SQL |
|---|---|---|
| Aktif / silinmemiş | `findSearchResults` L510-511 | `is_active = true AND deleted_at IS NULL` |
| Kişi sayısı | L527-529 | `guests >= $n` (yalnız `guests` > 0 ise) |
| Bölge | L524-526 | `location_id IN (…expandedRegions)` |
| Tip ∩ özellik sonucu | L521-523 | `id IN (…matchVillaIds)` — ID listesi JS'te hesaplanıyor (bkz. C) |
| Junction ön-seçimi | `villa-type.repository.ts:96`, `villa-feature.repository.ts:82` | `type_id IN (…)` / `feature_id IN (…)` — yalnız ilgili satırları getirir; AND **burada değil** |
| **Müsaitlik (bloklu villa ID'leri)** | RPC `get_blocked_villa_ids` (039) | 3 tablo UNION, half-open overlap, `villa_id = ANY($ids)` |
| Kapak görseli | embed `LIMIT 1` | `ORDER BY is_cover DESC, sort_order ASC LIMIT 1` |
| Varsayılan sıra | L530-532 | `ORDER BY sort_order ASC, created_at DESC` |

#### B) Repository / service katmanında yapılanlar
| İş | Nerede | Not |
|---|---|---|
| Bloklu ID set'inin kurulması + **fail-soft** | `availability.helper.ts:118-167` | RPC hata verirse **boş Set** döner → tüm adaylar "müsait" görünür (bilinçli; asıl garanti EXCLUDE constraint) |
| Tarih doğrulaması | `availability.helper.ts` `isValidYmd`, `start < end` | geçersizse filtre yok |
| Review aggregate | `villa-review.service.ts:263-295` | `clampRating` + ortalama, JS |
| Kur haritası | `exchange-rate.service.ts:40` | hata → `{}` |

#### C) Server'da JavaScript ile yapılanlar (`AramaPageBody.tsx`)
| İş | Satır | Not |
|---|---|---|
| Slug/UUID → ID çözümü, geçersiz token'ın düşürülmesi | 297-360 | cached taxonomy listeleri üzerinden |
| Grup kökü bölge genişletmesi | 559-576 | `filter_group_name` |
| **Tip AND** (villa başına benzersiz tip sayısı === seçim sayısı) | 417-452 | `Map<villa, Set<type>>` |
| **Özellik AND** | 483-515 | aynı desen |
| Tip ∩ özellik kesişimi | 521-529 | |
| `forceEmpty` (kesişim boşsa sorgu sonucunu boşaltır) | 536, 726 | ⚠️ `findSearchResults` boş diziyi "filtre yok" sayar |
| Normalize: görsel sırası, fiyat satırı temizliği, indirim temizliği | 737-872 | |
| **Başlangıç fiyatı** `getStartingPrice(prices)` | 834 | tarihsiz fiyat sıralamasının anahtarı |
| **Müsaitlik eleme** `villas.filter(!blockedSet.has)` | 883-890 | RPC çıktısı JS'te uygulanıyor |
| `total` (başlıkta ve sidebar'da gösterilen sayı) | 892 | **tüm** müsait adayların sayısı |
| Esnek (±N gün) havuz ve 1–6 ek RPC | 909-938 | havuz = ana tarihte **bloklu** adaylar |
| Tarihli fiyat sıralama anahtarı `calculateGrandTotal` | 1005-1041 | yalnız `price-*` + tarih |
| **Sıralama** `applyPublicSort` | 1043 | stable JS sort |
| **Sayfalama** `slice` | 1052-1055 | |

#### D) Browser / client'ta yapılanlar
| İş | Nerede | Filtre mi? |
|---|---|---|
| URL üretimi (seçimler → query string) | `FilterSidebar.tsx:380-471` | **Hayır.** Yalnız `router.push`; sonuç listesi server'dan gelir |
| Kart toplamının gösterimi | `VillaCard` → `calculateGrandTotal` | **Hayır.** Gösterim; sıralama anahtarıyla aynı formül (invariant, `arama-card-discount.test.tsx` #10) |
| **Client tarafında sonuç filtresi** | — | **YOK** [KOD KANITI] |

**Sonuç:** Kesin filtrelerin bir kısmı (aktiflik, kişi, bölge, ID listesi) zaten SQL'de. **Tip/özellik AND hesabı, müsaitlik eleme, fiyat anahtarı, sıralama ve sayfalama server JS'te.** Client hiçbir şey filtrelemiyor.

---
## 2. 1500 villa geldiğinde akış

> Aşama sırası [KOD KANITI]. Satır sayıları, "1500 aktif villa" **varsayımıyla** verildi; gerçek değerler [ÖLÇÜLEMEDİ].

```
 ┌─ W1  L287  Promise.all: villa_locations (cached) · villa_types (cached) · villa_features (CACHE'SİZ, loadHeroFeatures)
 │
 ├─ W2  L408/412  (paralel, yalnız filtre seçiliyse)
 │        villa_type_relations    WHERE type_id    IN (…)   → ham junction satırları
 │        villa_feature_relations WHERE feature_id IN (…)   → ham junction satırları
 │        JS: AND sayımı → categoryVillaIds / featureVillaIds → kesişim matchVillaIds (0…1500 ID)
 │
 ├─ W3  L589  Promise.all:
 │        findSearchResults  → SQL: aktif + silinmemiş [+ guests][+ location_id IN][+ id IN]
 │                             + her villa için: location, 1 kapak görseli, TÜM villa_prices, TÜM villa_discounts
 │                             ORDER BY sort_order, created_at DESC          ── LIMIT YOK
 │                             ► N1 villa (filtresiz aramada ≈ 1500)
 │        getVillaReviewStatsBatch → SELECT villa_id, rating FROM villa_reviews WHERE is_approved
 │                             ► TÜM villaların TÜM onaylı review'ları (N1'den bağımsız)
 │
 ├─ JS  L737  normalize (N1 villa; getStartingPrice → başlangıç fiyatı)
 │
 ├─ W4  L884  [yalnız tarih varsa] RPC get_blocked_villa_ids(start, end, N1 ID dizisi)
 │        JS  L888  visibleVillas = N1 − bloklu    ► N2 villa
 │        L892 total = N2   (başlıktaki "X villa bulundu")
 │
 ├─ W5  L917-935 [yalnız flexible>0 ve tarih] havuz = N1 ∩ bloklu; 2–6 paralel RPC ► F villa
 │
 ├─ W6  L969  Promise.all: cookies() · exchange_rates (cache'siz)
 │
 ├─ JS  L1005-1041 [yalnız price-* + tarih] N2 villa için calculateGrandTotal (gece × fiyat bul + indirim + kur + temizlik)
 ├─ JS  L1043 applyPublicSort (N2)
 ├─ JS  L1055 slice → pageSize (12/30/50/100)
 │
 ├─ W7  L1061 [EN/DE] badge çevirileri (sayfa kartları + TÜM esnek kartlar)
 ├─ W8  L1112 [EN/DE] tip adı çevirileri
 └─ HTML: pageSize kart (+ son sayfadaysa F esnek kartın TAMAMI, sayfalanmadan — L1505)
```

**Soruların cevapları [KOD KANITI]:**

| Soru | Cevap |
|---|---|
| İlk sorguda 1500 villa mı geliyor? | Filtresiz aramada **evet**: aktif + silinmemiş villaların tamamı. Kişi, bölge ve tip/özellik seçiliyse yalnız onlara uyanlar gelir (bu filtreler SQL'de). |
| Fiyatların tamamı mı geliyor? | **Evet.** Gelen her villanın **tüm** `villa_prices` satırları (tarih filtresi yok, geçmiş dönemler dahil) ve **tüm** `villa_discounts` satırları. |
| Availability hangi aşamada? | Villa sorgusu **bittikten sonra** (L884), gelen tüm adayların ID'leriyle tek RPC. |
| Müsait olmayanlar ne zaman eleniyor? | L888, JS `filter`. Sayfalamadan **önce**. |
| Filtreler ne zaman? | Kişi/bölge/ID listesi SQL'de (W3). Tip/özellik AND hesabı W2 sonrası JS'te, sonucu SQL'e ID listesi olarak giriyor. |
| Pagination ne zaman? | **En son** (L1055): müsaitlik ve sıralamadan sonra. |
| Fiyat sıralaması ne zaman? | Müsaitlik elemesinden **sonra**, slice'tan **önce** (L1005-1043). |
| Tarih aralığı ne zaman devreye giriyor? | (1) W4 müsaitlik RPC'sinde, (2) tarihli fiyat anahtarında (L1005), (3) kart prop'larında (gösterim). **Villa SQL'ine hiç girmiyor.** |

**Mevcut tasarımın doğruluk garantisi:** Tüm filtreler (müsaitlik dahil) **uygulandıktan sonra** tam liste sıralanıp dilimleniyor. Bu yüzden `total`, sayfa sayısı, sayfa içeriği ve fiyat sırası tutarlı. Yavaşlığın kaynağı da aynı tasarım.

**Tahmini veri hacmi [TAHMİN]:** 1500 villa × (`villa.*` 46 kolon, `description` ve `seo_description` dahil + tüm fiyat dönemleri + indirimler) ≈ birkaç MB JSON. Bu veri her istekte DB'den okunuyor, pg üzerinden taşınıyor ve JS'te parse ediliyor. Ölçüm SQL'i §10.3'te.

---

## 3. Kritik senaryo: SQL'e doğrudan `LIMIT 20 OFFSET 0` eklersek

**Senaryo:** 10–15 Haziran (5 gece), 6 kişi, Kalkan, "Özel Havuz" (özellik veya tip), `sort=price-asc`, pageSize 20.
**Varsayım:** 1500 villadan tip/özellik + bölge + kişi filtresine **110** villa uyuyor; bunların **30**'u 10–15 Haziran'da dolu; gerçek sonuç **80** villa.

### 3.1 Bugün ne oluyor [KOD KANITI]
1. W2: "Özel Havuz" junction'ı → ör. 400 villa ID'si.
2. W3: SQL `guests>=6 AND location_id IN (Kalkan grubu) AND id IN (400 ID)` → **110 villa** (tüm fiyatlarıyla).
3. W4: RPC 110 ID ile → 30 bloklu → **80 müsait**, `total = 80`.
4. 80 villanın her biri için 5 gecelik `calculateGrandTotal` (indirim + kur + temizlik) → `_sortPrice`.
5. 80 villa fiyata göre sıralanıyor → 1. sayfa = en ucuz 20; 2. sayfa = 21–40 … `totalPages = 4`.

### 3.2 Mevcut sorguya `LIMIT 20 OFFSET 0` eklenirse
SQL hâlâ `ORDER BY sort_order, created_at DESC` ile sıralıyor. **Fiyat da müsaitlik de SQL'de değil.**

1. SQL, 110 villanın **sort_order'a göre ilk 20'sini** döndürür.
2. RPC bu 20 ID'ye bakar. Diyelim 6'sı dolu → **14 villa**.
3. `total = 14` → başlıkta **"14 villa bulundu"** yazar. Gerçek sayı 80.
4. Fiyat sıralaması yalnız bu 14 villa **arasında** yapılır. 110 içinde sort_order'ı 21–110 olan müsait villalar (≈66) hiç görülmez. **En ucuz villa sort_order'ı 95 ise 1. sayfada yoktur.**
5. `totalPages = ceil(14/20) = 1` → **2. sayfa linki oluşmaz.** 66 müsait villa kullanıcı için **tamamen kaybolur.**
6. `total` ayrıca bir `COUNT(*)` ile hesaplansa bile:
   - COUNT müsaitliği bilmezse **110** der (gerçek: 80), sayfa sayısı yanlış olur.
   - 2. sayfa (`OFFSET 20`) sort_order 21–40'ı getirir, müsaitlik bunlardan ~5–6'sını daha düşürür → sayfalar **14–15 kartla, eşit olmayan boyutlarda** gelir.
   - **Fiyat sırası sayfalar arasında bozulur:** 2. sayfada 1. sayfadakinden **daha ucuz** villalar çıkabilir, çünkü her sayfa kendi 20'lik sort_order dilimi içinde sıralanmış olur.
7. **Esnek (±3 gün) bölüm** havuzu, ana tarihte dolu adaylardan kuruluyor (L917). Havuz yalnız ilk 20'den oluşacağı için esnek sonuçların çoğu da **kaybolur**.
8. `smart` sıralamada (fiyat yok) bile müsaitlik sonradan elediği için sayfa boyutları tutarsız olur ve `total`/sayfa sayısı yanlış çıkar.

### 3.3 Cevap
**"Sonucu önce LIMIT'le, sonra availability'yi JS'te uygula" düzeni, mevcut sistemi kesinlikle bozar.** Sonuçlar eksik görünür, toplam ve sayfa sayısı yanlış olur, fiyat sırası sayfalar arasında tutarsızlaşır, esnek sonuçlar kaybolur. Bu bir tahmin değil; L884-892, L1043 ve L1052-1055 sırasının doğrudan sonucu.

**Genel kural:** Doğru bir `LIMIT/OFFSET` için, **ORDER BY ile sonuç kümesini belirleyen her şeyin LIMIT'ten ÖNCE SQL'de olması** gerekir: tüm filtreler + müsaitlik + sıralama anahtarı. Bugün müsaitlik JS'te uygulanıyor, fiyat anahtarı JS'te hesaplanıyor. İkisi taşınmadan SQL pagination doğru olamaz.

---

## 4. Availability (müsaitlik) — ayrıntılı

### 4.1 Mevcut semantik [KOD KANITI]

| Kaynak | Blocking kuralı | Overlap | Nerede |
|---|---|---|---|
| `reservations` | `status IN ('pending','confirmed')` | `start_date < p_end AND end_date > p_start` (half-open `[)`) | RPC 039 |
| `manual_reservations` | tüm satırlar | aynı | RPC 039 |
| `external_calendar_events` | `is_active = true` | aynı | RPC 039 |
| Scope | `(p_villa_ids IS NULL OR villa_id = ANY(p_villa_ids))` | | |
| Guard | `p_start < p_end` | | |
| Dönüş | `DISTINCT villa_id` | PII yok | |

**Yazma tarafındaki garantiler [KOD KANITI]:**
- `reservations_no_overlap`: `EXCLUDE USING gist (villa_id WITH =, daterange(start_date,end_date,'[)') WITH &&) WHERE status IN ('pending','confirmed')` (030).
- `manual_reservations_no_overlap`: aynı, koşulsuz (001).
- `check_external_calendar_no_overlap` trigger'ı: reservations/manual insert/update'te external ile çakışmayı `23P01` ile reddeder (031).
- Aynı gün checkout/checkin müsait (half-open) — helper yorumu ve constraint aynı semantikte.

**Aynı kuralın 3 kopyası (lockstep):**
1. `lib/availability.validator.ts` `AVAILABILITY_BLOCKING_STATUSES`
2. RPC `get_blocked_villa_ids` (039)
3. EXCLUDE constraint (030)

**Önemli bir fark (yeni bulgu) [KOD KANITI]:** Villa detay takvimi `get_villa_blocked_ranges` **external_calendar_events'i içermiyor** (039 yorumu: "external DAHİL DEĞİL"). `/arama` ise external'ı **içeriyor**. Yani arama ve detay takvimi external bloklarda farklı davranabilir. Bu mevcut bir durum; pagination kararını etkilemez, ama **müsaitlik SQL'e taşınırken "hangi kuralı kopyalıyoruz" sorusunda doğru kaynağın `get_blocked_villa_ids` olduğunu** gösteriyor.

**Hata davranışı (fail-soft) [KOD KANITI]:** RPC hata verirse `getBlockedVillaIds` boş Set döner (`availability.helper.ts:148-160`) ve **tüm adaylar müsait gösterilir**. Overbooking'i DB constraint engelliyor. Müsaitliği ana sorgunun içine gömmek bu davranışı değiştirir: hata artık **tüm aramayı** düşürür (ErrorState). Bu, bilinçli bir ürün kararı gerektirir.

### 4.2 "Availability SQL tarafında güvenli şekilde filtrelenebilir mi?"

**EVET — koşullu.** Predikat saf SQL, deterministik ve zaten bir SQL fonksiyonunda tanımlı. JS tarafı yalnız "Set'te var mı" kontrolü yapıyor; SQL'e taşınınca kaybolan bir mantık yok.

**Önerilen yapılar (en güvenliden en risklisine):**

1. **RPC'yi olduğu gibi yeniden kullanmak (tek doğruluk kaynağı korunur):**
   ```sql
   … AND NOT EXISTS (
         SELECT 1 FROM get_blocked_villa_ids($start::date, $end::date, NULL) b(villa_id)
         WHERE b.villa_id = v.id)
   ```
   - Artı: kural **tek yerde** kalır, lockstep bozulmaz.
   - Eksi: `p_villa_ids = NULL` ile, tarih aralığındaki **tüm** villaların blokları taranır. Mevcut index'lerin hepsi `villa_id` ile başlıyor → reservations / manual / external'da tarih-only range scan için uygun btree index yok [KOD KANITI]. Tablolar küçükse fark önemsiz. **EXPLAIN gerekli** (§10.3).
   - Alternatif: aday ID dizisini `p_villa_ids`'e vermek (bugünkü desen). Bu, iki aşamalı sorgu demektir (bkz. §7-E).

2. **Açık NOT EXISTS anti-join (3 tablo):** predikat RPC ile **harfiyen aynı** yazılır. Her villa için `(villa_id, start_date, end_date)` index'leri kullanılabilir (`idx_reservations_avail` partial, `idx_manual_reservations_avail`, `external_calendar_events_overlap_idx` partial) → villa başına 3 index probe.
   - Risk: kural **4. bir kopyaya** çoğalır. Lockstep testleri şart.

3. **`daterange && daterange` yazımı:** EXCLUDE'un gist index'ini (`villa_id, daterange`) kullanabilir. Ama `&&` ile `start < end AND end > start` yazımı, NULL/boş aralık kenar durumlarında birebir aynı sonucu vermeyebilir (ör. `start_date = end_date` satırlar: `daterange('[)')` boş aralık üretir, `&&` false; açık predikat da false → pratikte aynı, yine de test edilmeli). **Önerilmez**; kazancı belirsiz.

**Taşınırken korunması gereken koşullar:**
- Status allow-list **tam olarak** `('pending','confirmed')`
- manual için status filtresi **yok**
- external için `is_active = true`
- Half-open: `<` ve `>` (≤/≥ **değil**)
- `p_start < p_end` guard'ı; tarihsiz aramada müsaitlik filtresi **hiç uygulanmaz**
- Tarihler `date` tipinde, TZ dönüşümü yok (bugün string `YYYY-MM-DD` → `date`)
- Hata politikası: fail-soft (herkes müsait) mi, fail-closed (hata sayfası) mı — **ürün kararı**
- Esnek mod: kaydırılmış pencerelerde **aynı** predikat

**Application-level kalması gerekenler:** Hiçbiri *zorunlu* değil. Ama esnek (±N gün) mantığı ve fail-soft politikası JS'te kalırsa davranış farkı sıfıra iner.

### 4.3 Index durumu (müsaitlik) [KOD KANITI, prod doğrulanamadı]
| Tablo | Index | Kullanım |
|---|---|---|
| reservations | `idx_reservations_avail (villa_id, start_date, end_date) WHERE status IN ('pending','confirmed')` (039) | `villa_id = ANY` + tarih ✓ |
| reservations | EXCLUDE gist `(villa_id, daterange)` partial (030) | `&&` sorgularında |
| manual_reservations | `idx_manual_reservations_avail (villa_id, start_date, end_date)` (039) + EXCLUDE gist (001) | ✓ |
| external_calendar_events | `external_calendar_events_overlap_idx (villa_id, start_date, end_date) WHERE is_active` (029) + `(villa_id, is_active)` | ✓ |

---
## 5. Fiyat sıralaması

### 5.1 Nasıl çalışıyor [KOD KANITI]

| Durum | Sıralama anahtarı | Kaynak |
|---|---|---|
| `price-*`, **tarih yok** | `getStartingPrice(prices)` → villanın **tüm** `villa_prices` satırlarındaki en küçük `price > 0`, `convertPrice` ile kullanıcı para birimine çevrilmiş | `AramaPageBody.tsx:834`, `pagination.ts:201-218` |
| `price-*`, **tarih var** | `calculateGrandTotal({start, end, prices, discounts, cleaning_*, currency, rates}).total` → `_sortPrice` | L1005-1041 |
| `smart` | DB sırası (`sort_order ASC, created_at DESC`); `applyPublicSort` no-op | `pagination.ts:189` |
| `capacity-*` | `guests`; JS stable sort (eşitlikte DB sırası korunur) | `pagination.ts:228-255` |

**Tarihli toplamın bileşenleri:**
- **Gece gece döngü** (`calculateStayTotal:297`):
  - `getDailyPrice` → `prices.find(d >= start_date && d <= end_date)`: **kapalı aralık** ve **ilk eşleşen satır** (`price.engine.ts:110`).
  - Aktif indirim `getActiveDiscount` (kapalı aralık, ilk eşleşen) → `applyDiscountToDailyPrice`:
    - `percent`: fiyat × (1 − v/100)
    - `fixed`: **gecelik nihai özel fiyat**; farklı para birimindeyse önce çevrilir
  - Her gece `convertPrice` ile kullanıcı para birimine çevrilir: **`toFixed(2)` yuvarlaması gece başına** (`currency.ts:39+`).
- **Temizlik:** `nights < cleaning_limit` ise ücret alınır, `cleaning_limit` 0 ise her zaman; kendi para biriminden çevrilir.
- **Fail-closed:** Fiyatı bulunmayan ≥1 gece varsa `total = 0` (`price.engine.ts:680+`) → `_sortPrice = null` → villa **listeden çıkarılmaz, sıranın sonuna** gider (`pagination.ts:220-227`).
- **Kur:** Server'da `getExchangeRatesMap()` (DB, cache'siz). Para birimi cookie'den (`currency`), yoksa TRY.
- **Invariant:** Kartta gösterilen toplam === sıralama anahtarı (aynı fonksiyon ve aynı parametreler; `arama-card-discount.test.tsx` #10).

### 5.2 SQL'de "ORDER BY price + LIMIT" mümkün mü?

**Tarihsiz fiyat sıralaması — kısmen mümkün, ince tuzaklarla:**
- `getStartingPrice` fiyatları **para birimini hesaba katmadan** ham sayı olarak karşılaştırıyor (`v < best.price`) [KOD KANITI]. Örnek: 100 EUR ile 3.000 TRY arasında "100" seçilir. SQL'de `min(price)` aynı ham sayıyı bulur, **ama** eşit fiyatlı iki satırdan hangisinin para biriminin seçileceği `json_agg` sırasına bağlı (villa_prices embed'inde **ORDER BY yok**). Bu, belirsiz bir kenar durum.
- Sonra `convertPrice` (TRY pivot, `toFixed(2)`) SQL'de yeniden yazılmalı. Kurlar istek başına değişken parametre. Yapılabilir, ama **iki ayrı kopya** oluşur.

**Tarihli fiyat sıralaması — SQL'e taşımak YÜKSEK RİSK:**
1. **Gece bazlı `find` semantiği:** Aynı gece için birden fazla `villa_prices` satırı çakışıyorsa JS **dizideki ilk** satırı kullanıyor. Dizi sırası, `villa_prices` embed'inde ORDER BY olmadığı için **belirsiz** [KOD KANITI]. `villa_prices` için migrations'ta **overlap/EXCLUDE constraint yok** (yalnız `villa_discounts`'ta var, 079). SQL, "belirsiz ilk"i birebir taklit edemez. Çakışan dönem varsa sonuç **farklılaşabilir**. Çakışma var mı? [ÖLÇÜLEMEDİ] (§10.3 SQL'i).
2. **Gece başına `toFixed(2)` yuvarlaması** ve TRY-pivot çapraz kur: SQL `numeric` ile birebir aynı yuvarlama zinciri kurulmalı; aksi halde kuruş farkları **sıralamayı** değiştirebilir.
3. **`fixed` indirim = nihai fiyat** + indirim para birimi dönüşümü + `Math.max(0, …)`.
4. **Fail-closed `uncoveredNights`** → NULL anahtar ve NULLS LAST.
5. **Temizlik kuralı** (`nights < cleaning_limit`, limit 0 = her zaman).
6. **Kart === sıralama invariant'ı:** Kart JS motorunu kullanmaya devam ederse, SQL kopyası ile motor arasındaki her sapma "gösterilen ≠ sıralanan" hatası üretir.
7. Kur, cookie'deki para birimine göre istek başına değişir → sonuç tablo/materialized view olarak önceden hesaplanamaz (yalnız TRY bazında hesaplanıp sonra çevrilebilir; o da gece başı yuvarlamayı değiştirir).

**Sonuç:** Tarihli `price-asc/desc` için `ORDER BY <SQL fiyat> LIMIT` → mevcut fiyat mantığını **bozma riski yüksek**. En güvenli yol: **fiyat anahtarını JS'te, mevcut motorla hesaplamaya devam etmek.** Bunun için müsait adayların **yalnız fiyat verisini** çekmek gerekir; tüm villa verisi gerekmez (bkz. §8).

`smart` ve `capacity-*` sıralamaları SQL'e **güvenle** taşınabilir, bir koşulla: **deterministik tie-breaker** eklenmeli (`…, id`). Bugün `sort_order, created_at` eşitliğinde sıra PG'nin keyfine kalıyor. Her sayfa ayrı istek olduğu için bu **bugün de** teorik bir kayma riski, `OFFSET` ile ise daha görünür hale gelir. `capacity-*` için JS stable sort'un "eşitlikte DB sırası" davranışı: `ORDER BY guests, sort_order, created_at DESC, id`.

---

## 6. Filtrelerin SQL'e taşınabilirliği

| Filtre | Şu an nerede? | SQL'e taşınabilir mi? | Pagination öncesi uygulanabilir mi? | Risk |
|---|---|---|---|---|
| **Tarih** (geçerlilik) | JS (`isValidYmd`, `start<end`, L273-277) | Doğrulama JS'te kalmalı; SQL'e yalnız parametre gider | — (girdi) | Düşük |
| **Kişi** | **SQL** `guests >= $n` (repo L527) | Zaten SQL | ✅ Evet | Düşük |
| **Bölge** | **SQL** `location_id IN` + JS grup genişletmesi (L559) | Zaten SQL; genişletme JS'te kalabilir | ✅ Evet | Düşük |
| **Villa tipi (AND)** | Junction SQL + **JS AND** (L417-452) → SQL `id IN` | ✅ `id IN (SELECT villa_id FROM villa_type_relations WHERE type_id = ANY($) GROUP BY villa_id HAVING count(DISTINCT type_id) = $n)` — `Set` = `DISTINCT` | ✅ Evet | Düşük–Orta: hata politikası değişir (bugün junction hatası → **filtre atlanır, fail-open**, L421-429; tek SQL'de hata → sayfa hatası) |
| **Havuz** | Ayrı filtre **yok**; yalnız özellik/tip olarak | Özellik/tip ile aynı | ✅ | Düşük |
| **Özellikler (AND)** | Junction SQL + **JS AND** (L483-515) | ✅ tip ile aynı desen | ✅ Evet | Düşük–Orta (aynı fail-open notu) |
| **Fiyat (aralık)** | **Filtre yok** | — | — | — |
| **Müsaitlik** | RPC (SQL) + **JS filter** (L884-890) | ✅ NOT EXISTS / RPC anti-join (§4.2) | ✅ Evet, ama yalnız SQL'e taşınırsa | **Orta:** lockstep kopyası, fail-soft politikası, esnek mod havuzu |
| **Sıralama: smart** | SQL ORDER BY (JS no-op) | ✅ + `id` tie-breaker | ✅ | Düşük |
| **Sıralama: capacity** | JS stable sort | ✅ `ORDER BY guests, sort_order, created_at DESC, id` | ✅ | Düşük (NULL guests: JS'te NULL'lar sona; SQL'de `NULLS LAST`/`FIRST` doğru seçilmeli) |
| **Sıralama: price (tarihsiz)** | JS `getStartingPrice` + `convertPrice` | ⚠️ Kısmen (para biriminden bağımsız min + kur SQL kopyası) | ⚠️ Riskli | Orta |
| **Sıralama: price (tarihli)** | JS `calculateGrandTotal` | ❌ Pratikte hayır (§5.2) | ❌ Birebir aynı değil | **Yüksek** |
| **`total` (sonuç sayısı)** | JS `visibleVillas.length` | ✅ `count(*) OVER ()` veya ayrı COUNT — müsaitlik de SQL'deyse | — | Orta |
| **Esnek (±N gün)** | JS havuz + 2–6 RPC | ⚠️ Havuz = "filtreye uyan ama ana tarihte dolu" → ayrı SQL gerekir | Son sayfada, sayfalanmadan | Orta |

---

## 7. Alternatifler

| | Mevcut filtre | Müsaitlik doğruluğu | Fiyat sırası | Pagination doğru | Performans kazancı | Kod değişikliği | Risk |
|---|---|---|---|---|---|---|---|
| **A) SQL filtre + LIMIT (müsaitlik JS'te kalır)** | ✅ | ❌ **Sayfa içinde sonradan eleme** | ❌ tarihli fiyat bozulur | ❌ **§3.2'deki kayıplar** | Yüksek | Küçük | **KABUL EDİLEMEZ** |
| **B) SQL filtre + SQL müsaitlik + LIMIT** | ✅ | ✅ (predikat birebir) | ✅ smart/capacity · ❌ tarihli fiyat SQL'de değilse | ✅ smart/capacity · ❌ price-* | Yüksek | Orta | Orta (price-* hariç) |
| **C) SQL ucuz ön filtreler + app-level müsaitlik (bugünkü hâl)** | ✅ | ✅ | ✅ | ✅ (JS slice) | — (referans) | 0 | 0 |
| **D) Keyset/cursor** | ✅ | müsaitlik SQL'deyse ✅ | tarihli fiyat SQL'de olmadığı için ❌ | smart/capacity'de ✅; "sayfa N'e atla" ve mevcut `?page=N` URL kontratı **bozulur** | Yüksek (derin sayfalar) | Büyük (URL + UI) | Orta–Yüksek |
| **E) İki aşamalı: (1) uygun ID'ler + sıralama anahtarı verisi, (2) yalnız sayfa ID'lerinin kart detayı** | ✅ | ✅ (mevcut RPC aynen) | ✅ (JS motoru aynen, yalnız fiyat verisiyle) | ✅ (JS slice, aynı sıra) | Orta–Yüksek (kart verisi 1500 → pageSize) | Orta | **Düşük–Orta** |
| **F) SQL aday ID listesi → mevcut JS mantığı** | ✅ | ✅ | ✅ | ✅ | Düşük–Orta (yalnız AND hesabı SQL'e) | Küçük | Düşük |
| **G) Mantık aynı, sorgu küçük + cache** | ✅ | ✅ (RPC cache'lenmez) | ✅ | ✅ | Orta–Yüksek (cache hit'te villa verisi 0 DB) | Küçük–Orta | Düşük (2MB limiti + invalidation) |
| **H) Hibrit: F + E + G** (§8) | ✅ | ✅ | ✅ | ✅ | Yüksek | Orta | Düşük–Orta |

**Açık tespit:** Klasik `WHERE … ORDER BY … LIMIT 20 OFFSET 0`:
- **smart / capacity** sıralamalarda, **müsaitlik de WHERE'e alınırsa** doğru çalışabilir.
- **Tarihli price-asc/desc'te mevcut fiyat mantığıyla birebir uyumlu DEĞİL.**
- Müsaitlik WHERE'e alınmadan (yani bugünkü sorguya yalnız LIMIT eklenerek) **hiçbir sıralamada** doğru değil.

---

## 8. "Mevcut sistemi bozmadan hızlandırma" — semantiği koruyan hibrit

**Kilit gözlem [KOD KANITI]:** Sonuç **kümesini** ve **sırasını** belirlemek için gereken veri, **kartı çizmek** için gereken veriden çok daha küçük.

| Amaç | Gereken alanlar |
|---|---|
| Filtre (kişi, bölge, tip/özellik) | `id, guests, location_id` + junction'lar |
| Müsaitlik | `id` → RPC |
| smart sırası | `sort_order, created_at` |
| capacity sırası | `guests` |
| Tarihsiz fiyat sırası | `villa_prices(price, currency)` |
| Tarihli fiyat sırası | `villa_prices(price, currency, start_date, end_date)` + `villa_discounts(…)` + `cleaning_fee/currency/limit` |
| **Kart** | `villa.*` (46 kolon), kapak görseli, lokasyon adı, review özeti, (tarihliyse) fiyat + indirim |

Bugün **kart verisi** tüm 1500 aday için çekiliyor, ama yalnız 12–100'ü çiziliyor.

### Önerilen sıralı model (mantık aynen korunur)
```
1) KESİN SQL FİLTRELERİ (mevcut kurallarla birebir)
   SELECT id, guests, sort_order, created_at, cleaning_fee, cleaning_currency, cleaning_limit
   FROM villa
   WHERE is_active AND deleted_at IS NULL
     [AND guests >= $g] [AND location_id = ANY($regions)]
     [AND id IN (…tip AND…)] [AND id IN (…özellik AND…)]      ← istenirse JS'te kalır (mevcut kod)
   ORDER BY sort_order, created_at DESC                         (+ id tie-breaker, bkz. §5.2)
   → N1 hafif satır (~1500 × ~100 B)

2) MÜSAİTLİK — MEVCUT RPC, AYNI ÇAĞRI, AYNI fail-soft
   get_blocked_villa_ids(start, end, N1 ids) → JS filter → N2          (değişiklik yok)
   esnek mod: aynı kod, aynı havuz (N1 ∩ bloklu)                        (değişiklik yok)

3) SIRALAMA ANAHTARI — MEVCUT JS MOTORU
   smart / capacity  → ek veri yok
   price-* tarihsiz  → yalnız N2 villa için villa_prices(price,currency)
   price-* tarihli   → yalnız N2 villa için villa_prices + villa_discounts
   applyPublicSort / calculateGrandTotal AYNEN                          (değişiklik yok)

4) SAYFALAMA — MEVCUT slice (JS), total = N2                            (değişiklik yok)

5) KART DETAYI — YALNIZ SAYFADAKİ ID'LER (+ son sayfadaysa esnek ID'ler)
   findCardsByIds benzeri: villa.*, kapak görseli, lokasyon, fiyat, indirim
   → sonuç, (4)'teki sıraya göre yeniden dizilir (findCardsByIds zaten
     "top-level order YOK, caller re-sort" deseniyle çalışıyor — /liste)
   review özeti: yalnız sayfa ID'leri için (veya cache'li batch)
```

**Neden semantik aynı kalır:**
- Filtre, müsaitlik, esnek mod, sıralama ve slice **aynı fonksiyonlarla, aynı sırayla** çalışır. Yalnız veri **iki parçada** çekilir.
- Fiyat anahtarı, kartın kullandığı **aynı** motorla ve **aynı** fiyat/indirim satırlarıyla hesaplanır.

**Dikkat edilecekler:**
1. **Tutarlılık:** (1)/(3) ile (5) iki ayrı sorgu. Arada admin bir villayı pasife alırsa (5) o ID'yi döndürmez ve sayfada 1 kart eksik kalır. (5) yine `is_active AND deleted_at IS NULL` filtrelemeli. Pencere milisaniyeler; etkisi bir eksik kart, yanlış sonuç değil.
2. **Fiyat satırlarının dizi sırası:** (3)'te fiyat satırları embed yerine düz sorguyla çekilirse, `getDailyPrice.find` "ilk eşleşen" satırı **farklı** seçebilir (yalnız çakışan fiyat dönemi olan villalarda). Çözüm: önce §10.3 ile çakışma olup olmadığını ölçmek. Çakışma yoksa sıra önemsiz.
3. **Kart ve sıralama aynı fiyat verisini görmeli:** (5)'te karta giden `prices/discounts`, (3)'te sıralamada kullanılanlarla aynı olmalı. En güvenlisi: (3)'te çekilenleri sayfa kartları için (5)'e aktarmak.
4. Sorgu sayısı artar (2 → 3–4). Ama taşınan veri ~1500 kart → ~pageSize kart.

**Beklenen etki [TAHMİN]:**
- `smart`/`capacity` aramalarında kart verisi 1500 → 12 (varsayılan pageSize).
- `price-*` aramalarında fiyat satırları yine N2 villa için gelir, ama `villa.*`, açıklamalar ve görseller gelmez.
- Review batch yalnız sayfa ID'leri için olur ya da cache'lenir.

---

## 9. Mevcut repository / query compiler mimarisi

**Query compiler'ın yapabildikleri [KOD KANITI, `lib/db/query-compiler.ts`]:**
- WHERE: `compare (= <> > >= < <= like ilike)`, `in` (her değer ayrı `$n`; boş → `FALSE`), `is`, `not`, `or`, `and` (L32-38, L206-236)
- ORDER BY: **yalnız düz kolon** (`OrderTerm`), ifade yok
- `LIMIT` / `OFFSET` (L375-376), `count` modu (L343), `range()` (query-builder L227)
- Embed: `one` → `json_build_object` scalar subquery, `many` → `json_agg` scalar subquery, embed başına `orderBy` + `limit` (L50-77, L328)

**Sınırlar (SQL'e taşımayı doğrudan etkiler):**
| Gereken | Compiler'da var mı? |
|---|---|
| `NOT EXISTS (subquery)` / anti-join | **YOK** |
| `IN (SELECT …)` alt sorgusu | **YOK** — yalnız değer listesi |
| `GROUP BY … HAVING` (AND semantiği) | **YOK** |
| JOIN | **YOK** (yalnız correlated embed) |
| ORDER BY ifadesi (fiyat hesabı) | **YOK** |
| `count(*) OVER ()` | **YOK** |
| `= ANY($array)` | **YOK** — `IN ($1,…,$n)` üretir (1500 ID = 1500 parametre; PG limiti 65.535, sorun değil) |
| Ham SQL | **VAR:** `nativeDbProvider.query(text, params)` (`native-db.provider.ts:190`) ve `rpc()` |

**Sonuç:** Müsaitliği ve AND'i SQL'e taşıyan (Çözüm C gibi) bir sorgu **mevcut builder ile yazılamaz**. Ya ham SQL (`nativeDbProvider.query`) ya da yeni bir RPC/SQL fonksiyonu gerekir; ikincisi migration demek. Çözüm A ve B'deki adımlar ise mevcut builder ile yazılabilir (`select` dar kolon, `.in`, `.order`, `rpc`).

**Correlated embed maliyeti:** `findSearchResults`'ta villa başına 4 scalar subquery (location, images LIMIT 1, prices json_agg, discounts json_agg) → 1500 villa × 4 = 6.000 SubPlan çalıştırması / istek. Her biri child tablonun `villa_id` index'ine dayanıyor (§10).

**Prod şema uyarısı [KOD KANITI]:** `findSearchResults` yorumu (repo L473-485), açık kolon listesinin **prodda hataya düştüğünü** kaydediyor: `villa.price` prodda yok, `types/database.ts` bayat. **Projeksiyonu daraltmadan önce `information_schema.columns` ile gerçek şema doğrulanmalı** (§10.3).

---

## 10. DB index durumu

### 10.1 Migrations'tan çıkarılan index'ler [KOD KANITI]
| Tablo | Index | Kaynak |
|---|---|---|
| villa | `idx_villa_visibility (is_active) WHERE deleted_at IS NULL` | 003 |
| villa | `idx_villa_deleted_at (deleted_at)` | 003 |
| villa | `idx_villa_sort_order (sort_order)` | 006 |
| villa | trgm `search_title`, `real_title_search`; `private_access_token`; `owner_id` | 065, 078, 019, 044 |
| villa_discounts | `(villa_id)`, `(villa_id, start_date, end_date)`, EXCLUDE gist `'[]'` | 079 |
| reservations | `idx_reservations_avail (villa_id, start_date, end_date) WHERE status IN (…)`, EXCLUDE gist | 039, 030 |
| manual_reservations | `idx_manual_reservations_avail (villa_id, start_date, end_date)`, EXCLUDE gist | 039, 001 |
| external_calendar_events | `overlap_idx (villa_id, start_date, end_date) WHERE is_active`, `(villa_id, is_active)`, `source_id`, `last_seen_at` | 029 |
| villa_types / villa_locations | slug unique partial | 008, 009 |

### 10.2 Migrations'ta BULUNAMAYANLAR (prod'da baseline'dan gelmiş olabilir — **doğrulanamadı**)
- **`villa.slug`**
- **`villa.location_id`**, **`villa.guests`**
- **`villa_prices.villa_id`**, `villa_prices` tarih kolonları; **`villa_prices` overlap constraint'i**
- **`villa_images.villa_id`**
- **`villa_reviews (villa_id / is_approved)`**
- **`villa_type_relations`** (`villa_id`, `type_id`) — PK/unique dahil
- **`villa_feature_relations`** (`villa_id`, `feature_id`) — PK/unique dahil
- **`villa_distances.villa_id`**

> Junction'larda PK muhtemelen `(villa_id, type_id)`'dir, ama bu **`type_id IN (…)`** sorgusuna hizmet etmez; `type_id` ile başlayan bir index gerekir. **Doğrulanamadı.**

### 10.3 Salt-okunur doğrulama SQL'i (DB erişimi olan birinin çalıştırması için)
```sql
BEGIN READ ONLY;

-- (1) Villa sayısı ve dağılım (1500 varsayımının doğrulaması)
SELECT count(*) FILTER (WHERE is_active AND deleted_at IS NULL) AS aktif, count(*) AS toplam FROM villa;

-- (2) Index envanteri
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN
 ('villa','villa_prices','villa_images','villa_discounts','villa_reviews','villa_type_relations',
  'villa_feature_relations','villa_distances','reservations','manual_reservations','external_calendar_events')
ORDER BY 1,2;

-- (3) Gerçek villa kolonları (projeksiyon daraltmadan ÖNCE)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='villa' ORDER BY ordinal_position;

-- (4) Çakışan villa_prices dönemi var mı? (getDailyPrice ".find ilk eşleşen" belirsizliği)
SELECT a.villa_id, count(*) AS cakisan_cift
FROM villa_prices a JOIN villa_prices b
  ON a.villa_id = b.villa_id AND a.ctid < b.ctid
 AND a.start_date <= b.end_date AND b.start_date <= a.end_date
GROUP BY a.villa_id ORDER BY 2 DESC LIMIT 50;

-- (5) Aynı sort_order + created_at'e sahip villalar (sayfalama tie riski)
SELECT sort_order, created_at, count(*) FROM villa
WHERE is_active AND deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1 LIMIT 50;

-- (6) findSearchResults yük boyutu (filtresiz arama)
SELECT count(*) AS villa, pg_size_pretty(sum(octet_length(row_to_json(v)::text))::bigint) AS villa_json,
       (SELECT count(*) FROM villa_prices) AS fiyat_satiri,
       (SELECT count(*) FROM villa_discounts) AS indirim_satiri,
       (SELECT count(*) FROM villa_reviews WHERE is_approved) AS onayli_review
FROM villa v WHERE is_active AND deleted_at IS NULL;

-- (7) Müsaitlik RPC — tüm villalar (p_villa_ids NULL) vs 1500 ID
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM get_blocked_villa_ids('2027-06-10','2027-06-15', NULL);
EXPLAIN (ANALYZE, BUFFERS)
SELECT r.villa_id FROM reservations r
 WHERE r.status IN ('pending','confirmed') AND r.start_date < '2027-06-15' AND r.end_date > '2027-06-10';

-- (8) Önerilen anti-join'in planı (yalnız okuma)
EXPLAIN (ANALYZE, BUFFERS)
SELECT v.id FROM villa v
WHERE v.is_active AND v.deleted_at IS NULL AND v.guests >= 6
  AND NOT EXISTS (SELECT 1 FROM get_blocked_villa_ids('2027-06-10','2027-06-15', NULL) b(villa_id) WHERE b.villa_id = v.id)
ORDER BY v.sort_order, v.created_at DESC, v.id;

-- (9) Junction AND — SQL karşılığı (JS sonucu ile karşılaştırma için)
EXPLAIN (ANALYZE, BUFFERS)
SELECT villa_id FROM villa_feature_relations
WHERE feature_id = ANY('{<uuid1>,<uuid2>}'::uuid[])
GROUP BY villa_id HAVING count(DISTINCT feature_id) = 2;

ROLLBACK;
```

---
## 11. Üç çözüm tasarımı (kod yazılmadı; tek "en iyi" seçilmedi)

### ÇÖZÜM A — Minimum risk (mantığa maksimum sadakat)
**Fikir:** Pipeline aynen kalır: filtre, RPC, JS sıralama, JS slice. Yalnız **veri yükü** ve **tekrar** azaltılır.

- **Veri akışı:** Bugünküyle aynı. Farklar:
  1. Tip/özellik AND'i isteğe bağlı olarak SQL'e alınır (`GROUP BY … HAVING`); sonuç aynı ID listesi olur.
  2. `getVillaReviewStatsBatch` cache'li bir kopyaya ya da SQL aggregate'e alınır. `clampRating` ve ortalama yuvarlaması birebir korunmalı.
  3. `findSearchResults`'tan **kart için gerekmeyen** ağır kolonlar çıkarılır (`description`, `seo_description` vb.). **Önce §10.3-(3) şema doğrulaması** (prod `villa.price` incident'i).
  4. `loadHeroFeatures` ve `getExchangeRatesMap` için kısa TTL'li cache değerlendirilir. Not: özellik cache'i bilinçli olarak yok, çünkü admin `revalidateTaxonomy` çağırmıyor.
- **Sorgu sayısı:** Aynı (ya da 1–2 eksik).
- **Veri miktarı:** Kolon daraltmayla ~%30–60 daha az [TAHMİN]. Fiyat/indirim satırları yine tamamı.
- **Pagination:** JS slice (aynı).
- **Availability:** RPC aynen, fail-soft aynen.
- **Fiyat:** Motor aynen.
- **Cache:** Villa listesi arama parametresine bağlı olduğu için cache'lenmiyor. İstenirse "tüm aktif villalar + fiyat + indirim" evreni `unstable_cache`'e alınır ve filtreler JS'te uygulanır. ⚠️ Next'in 2MB limiti var (`incremental-cache/index.js:517-524`); 1500 villa × fiyat satırlarıyla aşılması **olası** [TAHMİN]. Aşılırsa cache **sessizce** çalışmaz. Boyut §10.3-(6) ile ölçülmeli.
- **Risk:** Düşük. Davranış değişikliği yalnız hata yollarında (AND SQL'e taşınırsa).
- **Migration:** Gerekmez (index'ler ölçüme göre ayrı konu).
- **Kazanç:** Sınırlı. 1500 villanın tamamı her istekte yine çekilir.

### ÇÖZÜM B — Dengeli (iki aşamalı, semantik korunur) — §8 modeli
- **Veri akışı:**
  1. Hafif aday sorgusu (id + sıralama ve filtre kolonları)
  2. Mevcut RPC + JS filter
  3. Yalnız fiyat sıralamasında, müsait adayların fiyat/indirim satırları
  4. Mevcut `applyPublicSort` / `calculateGrandTotal`
  5. JS slice
  6. Yalnız sayfa (+ esnek) ID'leri için kart sorgusu
  7. Review özeti yalnız sayfa ID'leri için
- **Sorgu sayısı:**
  - smart/capacity: taxonomy (cached) + 0–2 junction + aday + RPC + kart + review ≈ 5–6
  - price-*: +1 (fiyat/indirim)
  - flexible: +2–6 RPC (bugünküyle aynı)
- **Veri miktarı [TAHMİN]:**
  - Aday satırı ~1500 × ~100 B ≈ 150 KB
  - Kart verisi 12–100 villa
  - Fiyat satırları yalnız price-* sıralamasında ve yalnız N2 için
- **Pagination:** JS slice (aynı; `total = N2` aynı).
- **Availability:** **Aynı RPC, aynı çağrı, aynı fail-soft.** Esnek mod kodu aynen.
- **Fiyat:** Aynı motor, aynı girdi (§8 dikkat 2–3).
- **Cache:** Aday sorgusu ve fiyat evreni cache'lenebilir (küçük olduğu için 2MB riski düşük). RPC **cache'lenmez**.
- **Risk:** Düşük–Orta:
  - iki fazlı okuma tutarlılığı (bir kart eksik kalabilir)
  - fiyat satırı sırası (ölçülmeli)
  - kart sıralamasının ID sırasına göre yeniden dizilmesi
  - Mevcut testler repository'leri mock'luyor; yeni sorgu şekli test mock'larının güncellenmesini gerektirir.
- **Migration:** Gerekmez. Mevcut builder ile yazılabilir (`select` dar kolon, `.in`, `.order`, `rpc`).

### ÇÖZÜM C — Maksimum performans (filtre + müsaitlik + sıralama SQL'de)
- **Veri akışı:** Tek ham SQL (ya da yeni SQL fonksiyonu):
  - `WHERE` aktif/kişi/bölge
  - `id IN (…GROUP BY HAVING…)` tip ve özellik
  - `NOT EXISTS` müsaitlik
  - `ORDER BY` sort (+ id)
  - `count(*) OVER ()`
  - `LIMIT/OFFSET`
  - Kart embed'leri yalnız sayfa satırları için
- **Sorgu sayısı:** 1–2 (+ esnek mod için ayrı SQL).
- **Veri miktarı:** Yalnız pageSize kart.
- **Pagination:** SQL `LIMIT/OFFSET`. `total` = window count.
- **Availability:** SQL anti-join. RPC'yi `p_villa_ids NULL` ile kullanmak ya da predikatı kopyalamak gerekir (4. kopya). **Fail-soft davranışı kaybolur** (RPC hatası = arama hatası).
- **Fiyat:**
  - smart/capacity: ✅
  - **Tarihli price-*: SQL'e taşınırsa motorla birebir aynı olmaz (§5.2) → BOZMA RİSKİ YÜKSEK.** Güvenli kalmak için price-* sıralamasında C'nin içinde B'ye düşülmeli (hibrit dal).
  - Tarihsiz price-*: para biriminden bağımsız min + kur SQL kopyası (orta risk).
- **Esnek mod:** "Filtreye uyan ama ana tarihte dolu" havuzu için ayrı SQL; son sayfada sayfalanmadan gösterim korunmalı.
- **Cache:** Pratikte yok (parametreye bağlı).
- **Compiler:** Mevcut builder **yetmez** (§9). Ham SQL veya yeni RPC gerekir.
- **Migration:** Muhtemelen gerekir (yeni SQL fonksiyonu, junction `type_id`/`feature_id` index'leri, gerekirse tarih index'leri). Yalnız ölçüme göre.
- **Risk:** **Yüksek:**
  - müsaitlik kuralının kopyalanması
  - hata politikası değişikliği
  - fiyat sıralama sapması
  - esnek modun yeniden yazılması
  - `?page=N` ve `total` anlamının korunması
  - OFFSET tie'ları

**Karşılaştırma özeti:**
| | Filtre | Müsaitlik | Fiyat sırası | Pagination | Perf | Değişiklik | Migration | Mevcut sistemi bozma ihtimali |
|---|---|---|---|---|---|---|---|---|
| A | aynı | aynı | aynı | aynı | + | küçük | yok | **Çok düşük** |
| B | aynı | aynı (aynı RPC) | aynı (aynı motor) | aynı | ++ | orta | yok | **Düşük** (ölçüm + parity testiyle) |
| C | aynı (SQL) | eşdeğer ama yeni kopya; fail-soft kaybı | **tarihli fiyatta farklılaşabilir** | SQL | +++ | büyük | muhtemel | **Yüksek** |

---

## KARAR İÇİN KRİTİK SONUÇ

**Soru:** "SQL pagination'a doğrudan geçersek mevcut `/arama` filtreleme ve müsaitlik sistemi bozulur mu?"

### Cevap: **KOŞULLU** — "doğrudan" geçiş (mevcut sorguya LIMIT/OFFSET eklemek) → **EVET, BOZAR.**

**Kanıt:** Müsaitlik villa sorgusundan **sonra** JS'te eleniyor (L884-890). Tarihli fiyat anahtarı JS'te hesaplanıyor (L1005-1041). Sıralama ve slice en sonda yapılıyor (L1043-1055). LIMIT bu adımların önüne geçerse:
- (a) müsait villalar görünmez olur,
- (b) `total` ve sayfa sayısı yanlış çıkar,
- (c) fiyat sırası sayfalar arasında bozulur,
- (d) esnek sonuçlar kaybolur (§3.2).

**SQL pagination ancak şu şartların HEPSİ sağlanırsa bozmadan çalışır:**
1. **Tüm filtreler LIMIT'ten önce SQL'de:** kişi, bölge (grup genişletmesi dahil), tip AND ve özellik AND (`GROUP BY … HAVING count(DISTINCT) = n`).
2. **Müsaitlik LIMIT'ten önce SQL'de**, `get_blocked_villa_ids` ile **birebir aynı** kuralla: pending/confirmed + tüm manual + aktif external, half-open, `start<end` guard. Tercihen RPC'nin kendisi kullanılarak.
3. **Hata politikası açıkça seçilmiş olmalı** (bugün fail-soft: RPC hatası → tüm villalar).
4. **Sıralama anahtarı LIMIT'ten önce SQL'de ve deterministik:** `smart`/`capacity` + `id` tie-breaker. **Tarihli `price-asc/desc` bu şartı motorla birebir sağlayamaz** → bu mod için JS sıralama korunmalı (tüm müsait adayların fiyat verisiyle).
5. **`total` aynı WHERE ile** hesaplanmalı (`count(*) OVER ()`), müsaitlik dahil.
6. **Esnek mod** havuzu, sayfalamadan bağımsız ayrı sorguyla ve aynı kuralla kurulmalı.
7. **Parity testi** geçmeli: aynı URL kombinasyonları için eski ve yeni pipeline'ın ID sırası, `total`, `totalPages` ve esnek listesi eşit olmalı.

---

## DOKUNULMAMASI GEREKEN MANTIK

1. `get_blocked_villa_ids` RPC'si ve kuralları: `('pending','confirmed')` allow-list, manual'ın koşulsuz blocking'i, external `is_active`, half-open `<`/`>`, `p_start < p_end` guard'ı.
2. `AVAILABILITY_BLOCKING_STATUSES` ↔ RPC ↔ `reservations_no_overlap` EXCLUDE (030) lockstep'i; `manual_reservations_no_overlap` (001); external overlap trigger'ı (031).
3. `getBlockedVillaIds` fail-soft davranışı (değiştirilecekse ürün kararıyla).
4. `price.engine.ts`: `getDailyPrice` (kapalı aralık, ilk eşleşen), `getActiveDiscount`, `applyDiscountToDailyPrice` (`fixed` = nihai gecelik fiyat), `calculateStayTotal` (gece döngüsü, `uncoveredNights`), `calculateGrandTotal` (fail-closed, temizlik kuralı), `getStartingPrice`.
5. `convertPrice` (TRY pivot, `toFixed(2)`).
6. **Kart === sıralama anahtarı invariant'ı** (aynı `discounts`, aynı rates) — `arama-card-discount.test.tsx` #10.
7. `applyPublicSort`: stable sort, NULL/NaN fiyatlar sona, `smart` = DB sırası.
8. Tip ve özellik **AND** semantiği (`Set` → duplicate junction satırı sayımı bozmaz); tip ∩ özellik kesişimi.
9. `forceEmpty` koruması (`findSearchResults` boş diziyi "filtre yok" sayar).
10. Slug/UUID token çözümü; geçersiz token'ın sessizce düşmesi; `villa-turleri`/`categories` ve `bolgeler`/`regions` öncelikleri.
11. Bölge grup kökü genişletmesi (`filter_group_name`).
12. Esnek (±N gün) mantığı: havuz = ana tarihte dolu adaylar, ana `start/end` hiçbir yere yazılmaz, sonuçlar normal listenin sayfalamasına **girmez** ve son sayfada gösterilir.
13. URL kontratı (`page`, `pageSize` ∈ {12,30,50,100}, `sort`, `flexible`, `ozellikler`) ve default'ların URL'e yazılmaması.
14. Reservation POST tarafındaki server fiyat doğrulaması (bu çalışmanın dışında; dokunulmamalı).

## GÜVENLİ OLARAK SQL'E TAŞINABİLECEKLER

- **Zaten SQL'de olanlar:** aktif/silinmemiş, `guests >= n`, `location_id IN`, `id IN`.
- **Tip AND ve özellik AND:** `GROUP BY villa_id HAVING count(DISTINCT type_id|feature_id) = n`, JS `Set` sayımıyla matematiksel olarak eşdeğer. (Tek fark: hata durumunda bugünkü "filtre atlanır" davranışı.)
- **`smart` ve `capacity-*` sıralaması** (deterministik `id` tie-breaker ile).
- **Review aggregate** (`GROUP BY villa_id`). `clampRating` ve ortalama yuvarlaması birebir yazılmak şartıyla; ya da yalnız sayfa ID'leri için.
- **Kart verisinin yalnız sayfa ID'leri için çekilmesi** (iki aşamalı model).
- **Müsaitlik**, RPC'nin kendisi anti-join olarak kullanılırsa (`NOT EXISTS (SELECT 1 FROM get_blocked_villa_ids(...))`). Bu, **fail-soft politikası kararından sonra** güvenli sayılabilir.

## RİSKLİ OLANLAR

- **Tarihli fiyat sıralamasının SQL'de hesaplanması:**
  - gece başına "ilk eşleşen fiyat" belirsizliği (villa_prices'ta overlap constraint yok)
  - `toFixed(2)` yuvarlama zinciri
  - `fixed` indirim semantiği
  - temizlik kuralı
  - fail-closed davranışı
  - kart/sıralama invariant'ı
- **Tarihsiz fiyat sıralaması:** para biriminden bağımsız `min` + eşitlikte belirsiz para birimi + kur kopyası.
- **Müsaitlik predikatının 4. bir kopya olarak yazılması** (lockstep kırılganlığı).
- **Fail-soft → fail-closed** değişikliği (RPC hatası artık sayfa hatası olur).
- **Esnek modun** SQL pagination ile yeniden kurulması.
- **Tie'lı ORDER BY + OFFSET** (sayfalar arası yinelenen veya kaybolan villa).
- **Projeksiyon daraltma:** prod şema ≠ repo tipleri (`villa.price` incident'i).
- **Keyset/cursor:** mevcut `?page=N` kontratını ve "sayfaya atla" UI'ını bozar.
- **`unstable_cache` ile tam evren cache'i:** 2MB limitinde sessizce devre dışı kalabilir.

## BİR SONRAKİ ADIM (kodlamadan önce, en güvenli yaklaşım)

1. **Ölç (salt-okunur, §10.3):**
   - gerçek villa sayısı
   - fiyat, indirim ve review satır sayıları
   - `findSearchResults` yük boyutu
   - index envanteri
   - **çakışan `villa_prices` dönemleri**
   - `sort_order/created_at` tie'ları
   - gerçek `villa` kolonları
   - RPC'nin ve önerilen anti-join'in EXPLAIN planları

   Prod'da `/arama` TTFB'si ölçülmeli (tarihsiz, tarihli, tarihli + price-asc).
2. **Parity (golden) test harness'ı hazırla — kod değişikliğinden ÖNCE:** Mevcut `AramaPageBody` pipeline'ı için, sabit bir fixture setiyle (çakışan rezervasyon, manual blok, external blok, fiyatı eksik gece, indirimli gece, çoklu para birimi, eşit sort_order, tip/özellik AND, grup bölge, flexible) şunları kilitleyen testler:
   - `villasOnPage` ID sırası
   - `total`, `totalPages`
   - esnek ID listesi
   - her sayfa (1..N)

   Bugünkü testler repository'leri mock'luyor ve **sayfalar arası sıra + müsaitlik + fiyat sırasını birlikte kilitleyen bir test yok** (`tests/unit/villa-feature-filter.test.tsx`, `arama-card-discount.test.tsx`, `arama-locale-routes.test.tsx` incelendi).
3. **Ölçüm sonucuna göre önce Çözüm A**, ardından **Çözüm B** (iki aşamalı: hafif aday + mevcut RPC + mevcut JS sıralama/slice + yalnız sayfa kartları). İki çözüm de migration gerektirmez, müsaitlik ve fiyat kodu **değişmez**, sadece veri iki parçada çekilir. Her adımda parity testi yeşil kalmalı.
4. **Çözüm C (tam SQL pagination)** ancak ölçüm B'nin yetmediğini gösterirse değerlendirilmeli. O zaman bile tarihli `price-*` için JS dalı korunmalı. Müsaitlik için RPC'nin kendisi kullanılmalı ve fail-soft politikası ürün tarafından onaylanmalı.

---

## Ek: Yan bulgular (pagination'dan bağımsız, bilgi amaçlı)
- **Esnek sonuçlar sayfalanmıyor** (L1505): son sayfada `flexibleVillas`'ın **tamamı** render ediliyor. EN/DE badge sorgusu da tüm esnek ID'lerle atılıyor (L1061–1063). Esnek havuz büyükse HTML ve RSC şişer [KOD KANITI]; boyutu [ÖLÇÜLEMEDİ].
- `loadHeroFeatures` (`villa_features` listesi) ve `getExchangeRatesMap` her `/arama` isteğinde **cache'siz** DB'ye gidiyor [KOD KANITI].
- Villa detay takvimi (`get_villa_blocked_ranges`) external blokları içermiyor, arama içeriyor (§4.1).
- Server sıralaması DB kurlarıyla, kart gösterimi client `CurrencyContext` kurlarıyla yapılıyor. İkisi farklıysa (ör. client kur fetch'i 429/NaN) "gösterilen = sıralanan" invariant'ı pratikte sapabilir [KOD KANITI + TAHMİN].

---

*Bu rapor yalnız okuma ile hazırlandı. Proje dosyası, config, env, DB, migration veya package.json değişikliği yok; commit veya push yok.*
