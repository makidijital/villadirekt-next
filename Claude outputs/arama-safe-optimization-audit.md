# /arama — Davranışı Bozmadan Performans Optimizasyonu: Audit + Uygulama

- Tarih: 2026-09-23 · Başlangıç commit'i: `9dc4566` (değişiklikler commit edilmedi)
- Kural: **Sonuç seti, sıra, sayfalar, toplam, fiyat ve kart içeriği birebir aynı kalacak.** Şüpheli olan hiçbir şey uygulanmadı.
- Etiketler:
  - **[KOD KANITI]** dosya:satır ile gösterildi
  - **[ÖLÇÜLDÜ-SENTETİK]** repo dışındaki harness'te, sentetik fixture ve simüle DB gecikmesiyle ölçüldü; **gerçek prod ölçümü DEĞİL**
  - **[ÖLÇÜLEMEDİ]** erişim yok

## 0. Ölçüm ortamı ve sınırlar

- **Gerçek DB'ye erişim YOK.** `.env.local` → `aws-0-eu-west-1.pooler.supabase.com:5432`; `getent hosts` → DNS hatası. **Hiçbir EXPLAIN, index listesi, satır sayısı veya sorgu süresi ölçülmedi. Aşağıda gerçek DB ölçümü gibi görünen hiçbir sayı yoktur.**
- Bu yüzden iki araç kuruldu, **ikisi de repo DIŞINDA** (`~/parity`, proje dosyası değil). Kopyası `Claude outputs/arama-parity-harness/` altında.
  1. **Parity harness:** Gerçek `AramaPageBody` + gerçek `availability.helper` + gerçek `price.engine` + gerçek `pagination` + gerçek review/kur/çeviri servisleri çalışır. Yalnız **en alttaki DB çağrıları** (repository metotları ve RPC) sentetik fixture'dan beslenir; RPC, 039 SQL semantiğiyle JS'te taklit edildi. Her senaryo × her sayfa için **render edilen HTML'in tamamı** (kart prop'ları JSON, sidebar prop'ları, hero başlığı/toplam, pagination linkleri, JSON-LD) baseline olarak kaydedilir ve değişiklik sonrası **byte-byte** karşılaştırılır.
  2. **Perf harness:** Aynı kurulumda 1500 sentetik villa; DB çağrısı başına `0 ms` (saf JS süresi) ve `25 ms` (simüle ağ+DB RTT) gecikme; her senaryo 5 kez çalıştırılıp **medyan** alınır.
- Fixture, riskli kenar durumları bilinçli olarak içeriyor:
  - pending / confirmed / cancelled / rejected rezervasyonlar
  - manual bloklar, aktif ve pasif external bloklar
  - bitişik (checkout = checkin) tarihler, ±1…3 gün esnek pencereler
  - TRY / EUR / USD fiyatlar, geçmiş fiyat dönemleri
  - çakışan fiyat dönemleri (first-match semantiği), fiyatı eksik geceler (fail-closed), 0 fiyat
  - percent, fixed ve farklı para birimli fixed indirimler, geçersiz indirim tipi
  - temizlik limiti varyasyonları, eşit `sort_order`/`created_at` (tie)
  - pasif ve silinmiş villalar
  - duplicate junction satırları, grup kökü ve alt bölge
  - geçersiz ve legacy URL parametreleri, EN/DE çevirileri

---

## 1. Mevcut `/arama` mimarisi

| Katman | Dosya | Not |
|---|---|---|
| Route | `app/(public)/arama/page.tsx` (+ `en/`, `de/`) | `dynamic = "force-dynamic"`, gövde `AramaPageBody` |
| Gövde (server) | `app/components/search/AramaPageBody.tsx` | tüm pipeline |
| Sidebar (client) | `app/(public)/arama/FilterSidebar.tsx` | yalnız URL üretir (`router.push`, L380-471); sonuç filtrelemez |
| Kart (client) | `app/components/villa/VillaCard.tsx` | tarihliyse toplamı gösterim için `calculateGrandTotal` ile hesaplar |
| Villa sorgusu | `lib/db/villa.repository.server.ts:466-534` `findSearchResults` | `select *` + 4 embed, LIMIT yok |
| Junction | `villa-type.repository.ts:96`, `villa-feature.repository.ts:82` | `… IN (…)` ham satırlar |
| Müsaitlik | `lib/availability.helper.ts:118` → `reservation.repository.ts:283` → RPC `get_blocked_villa_ids` (`_archive/legacy/039`) | fail-soft |
| Fiyat | `lib/price.engine.ts` (`getStartingPrice:67`, `getDailyPrice:102`, `calculateStayTotal:297`, `calculateGrandTotal:519`) | |
| Sıralama/sayfa | `lib/pagination.ts` (`applyPublicSort:184`) | JS |
| Review | `app/services/villa-review.service.ts:263` | tüm onaylı review'lar, JS aggregate |
| Kur | `app/services/exchange-rate.service.ts:40` | cache'siz DB |
| Çeviri (EN/DE) | `lib/i18n/get-villa-{badge,type,feature}-translations.server.ts` → `getTranslationsForParents` | TR'de sorgu yok |

## 2. Mevcut veri akışı (değişiklik öncesi) [KOD KANITI]

```
DB/Cache                                     AramaPageBody.tsx
────────────────────────────────────────────────────────────────────────────
W1  Promise.all ─ villa_locations (cache) ─ villa_types (cache)            L287
                └ loadHeroFeatures → villa_features (+EN/DE: çeviri ×2)
    JS: token çözümü (slug/UUID), grup kökü genişletme                     L297-360, L559
W2  [tip/özellik seçiliyse] junction'lar PARALEL                          L408-515
    JS: AND sayımı, kesişim, forceEmpty                                    L521-536
W3  Promise.all ─ findSearchResults (villa.* + location + 1 görsel         L589
                  + TÜM villa_prices + TÜM villa_discounts; LIMIT YOK)
                └ getVillaReviewStatsBatch (TÜM onaylı review)
    JS: normalize, getStartingPrice                                        L737-872
W4  [tarih] RPC get_blocked_villa_ids(start,end,adaylar) → JS filter     L883-892
W5  [flexible] 1–6 paralel RPC (havuz = bloklu adaylar)                   L909-938
W6  Promise.all ─ cookies() ─ getExchangeRatesMap()  ← HER aramada       L969
    JS: [price-* + tarih] calculateGrandTotal → _sortPrice                 L1005-1041
    JS: applyPublicSort → slice                                            L1043-1055
W7  [EN/DE] getVillaBadgesByLocale(sayfa + esnek ID'ler)                   L1061
W8  [EN/DE] getVillaTypeNamesByLocale(tüm tipler)                          L1112
    render: PageHero, JSON-LD (sayfa), FilterSidebar, kartlar, esnek bölüm (son sayfa)
```

## 3. Filtreleme sırası [KOD KANITI]

| # | Adım | Nerede | Katman |
|---|---|---|---|
| 1 | URL parse (`villa-turleri`→`categories`, `bolgeler`→`regions`, `ozellikler`, `guests`, `start/end`, `flexible`, `sort`, `page`, `pageSize`) | L220-277, L909, L948-968 | JS |
| 2 | Token → UUID (geçersiz düşer) | L297-360 | JS |
| 3 | Bölge grup kökü genişletmesi | L559-576 | JS |
| 4 | Tip AND / özellik AND (`Set` ile) + kesişim + `forceEmpty` | L417-536 | junction SQL + JS |
| 5 | aktif, silinmemiş, `guests >=`, `location_id IN`, `id IN` | repo L510-529 | **SQL** |
| 6 | Müsaitlik (RPC → JS filter) | L883-890 | SQL + JS |
| 7 | Esnek havuz (ana tarihte dolu adaylar) | L917-935 | SQL + JS |
| 8 | Sıralama | L1005-1043 | JS |
| 9 | Sayfalama | L1052-1055 | JS |

## 4. Availability akışı [KOD KANITI]

- `hasDateRange` = ikisi de geçerli `YYYY-MM-DD` ve `start < end` (L273-277).
- RPC (039): reservations `status IN ('pending','confirmed')` ∪ tüm manual ∪ external `is_active`; half-open `start_date < p_end AND end_date > p_start`; `p_villa_ids` ile scope.
- `getBlockedVillaIds` RPC hatasında **boş Set** döner (fail-soft, `availability.helper.ts:148-160`).
- Yazma garantileri: `reservations_no_overlap` EXCLUDE (030), `manual_reservations_no_overlap` (001), external trigger (031).
- Esnek: kaydırılmış pencereler yalnız havuz için; ana `start/end` hiçbir yere yazılmaz; esnek kartlar **son sayfada**, sayfalanmadan (L1505).
- **Bu çalışmada müsaitlik kodu, RPC ve çağrı argümanları DEĞİŞTİRİLMEDİ.**

## 5. Fiyat hesaplama akışı [KOD KANITI]

- **Tarihsiz:** `getStartingPrice(prices)` → tüm dönemlerdeki en küçük `price > 0` (para birimine bakmadan ham sayı) (L834). Sıralamada `convertPrice` ile kullanıcı para birimine çevrilir (`pagination.ts:201-218`).
- **Tarihli + price-*:**
  - Her gece `getDailyPrice` (kapalı aralık, ilk eşleşen)
  - `getActiveDiscount` + `applyDiscountToDailyPrice` (percent; fixed = nihai gecelik fiyat)
  - gece başı `convertPrice` (`toFixed(2)`)
  - temizlik
  - fail-closed (eksik gece → `total 0` → `_sortPrice null` → sona)

  Bu adımlar L1005-1041'de yapılır.
- **Kart:** Aynı motor, aynı `prices/discounts` (L1440-1470) → gösterilen = sıralanan.
- **Kur:** Server'da `getExchangeRatesMap()` (DB). Para birimi `currency` cookie'sinden, yoksa TRY.
  - **Bulgu [KOD KANITI]:** `rates` ve `userCurrency` gövdede **yalnız** L1020-1021 (`needsStayTotalSort` dalı) ve L1044-1045'te (`applyPublicSort` `priceOpts`) kullanılıyor.
  - `applyPublicSort` `priceOpts`'u yalnız `price-asc`/`price-desc`'te okuyor (`pagination.ts:189, 201-218`).
  - Sonuç: `smart` ve `capacity-*` aramalarında kur sorgusunun sonucu **hiçbir çıktıya etki etmiyor**, ama her istekte DB'ye gidiliyor.

## 6. Pagination akışı [KOD KANITI]

- `pageSize ∈ {12,30,50,100}` (default 12, URL'e yazılmaz) (`pagination.ts:21`).
- `page` 1-based ve son sayfaya clamp'lenir (L1052-1053).
- `total = visibleVillas.length` (müsaitlik sonrası, esnekler hariç) (L892).
- Slice, sıralamadan **sonra** (L1055).
- JSON-LD ItemList yalnız sayfadaki villalar (L1085).
- **Bu çalışmada DEĞİŞTİRİLMEDİ.**

## 7. Performans darboğazları

### 7.1 Kod kanıtı
| # | Darboğaz | Kanıt |
|---|---|---|
| D1 | `findSearchResults` LIMIT'siz; `villa.*` (46 kolon) + tüm fiyat/indirim satırları | repo L466-534 |
| D2 | Review batch her aramada tüm onaylı review'ları okuyor, cache'siz | L589, service L263 |
| D3 | **Kur sorgusu her aramada, sonucu yalnız fiyat sıralamasında kullanılıyor** | L969, §5 |
| D4 | **Kur sorgusu fiyat sıralamasında bile en sonda, ayrı bir sıralı dalga** (W6), hiçbir şeye bağlı olmadığı halde | L969 |
| D5 | **`loadHeroFeatures` (EN/DE'de 2 sıralı sorgu) villa sorgusunu bekletiyor**, oysa `ozellikler` parametresi yoksa sonucu yalnız sidebar'da kullanılıyor | L287-297, L349-360 |
| D6 | **EN/DE tip adı çevirisi en sonda, sıralı** (W8), oysa yalnız `categoryOptions`'a bağlı | L1109-1124 |
| D7 | EN/DE badge çevirisi en sonda (sayfa ID'lerine bağlı; kaçınılmaz) | L1061 |
| D8 | Esnek modda +6 RPC (paralel) | L926 |
| D9 | `price-*` + tarihte ~N2 villa için JS toplam hesabı | L1005-1041 |
| D10 | Child tablolar için `villa_id` index'leri migrations'ta yok (prod **doğrulanamadı**) | önceki audit §10 |

### 7.2 Sentetik ölçüm (değişiklik ÖNCESİ, 1500 villa) [ÖLÇÜLDÜ-SENTETİK]

**DB çağrısı başına 25 ms simüle gecikme** (duvar saati, 5 çalıştırmanın medyanı):

| Senaryo | Süre | DB çağrısı | Max eşzamanlı |
|---|---|---|---|
| `01-bos` (tarihsiz, smart) | 124.8 ms | 4 | 2 |
| `02-tarih` | 144.8 ms | 5 | 2 |
| `07-hepsi` (tarih+kişi+bölge+tip+özellik) | 190.8 ms | 7 | 2 |
| `08-esnek3` | 193.2 ms | 11 | 6 |
| `09-fiyat-artan` (tarihli) | 170.9 ms | 5 | 2 |
| `13-tarihsiz-fiyat-artan` | 115.1 ms | 4 | 2 |
| `14-kapasite-artan` | 152.7 ms | 5 | 2 |
| `16-EN-hepsi` | 299.5 ms | 12 | 2 |
| `16b-EN-fiyat-esnek` | 319.4 ms | 16 | 6 |

**Saf JS süresi (0 ms gecikme):** `02-tarih` 22.8 ms · `09-fiyat-artan` 39.5 ms → tarihli fiyat toplamı hesabı ≈ **17 ms / ~1000 müsait villa** (sentetik). `16b-EN-fiyat-esnek` 46.4 ms.

**Sentetik payload (JSON, 1500 villa):**

| Kaynak | Boyut |
|---|---|
| `findSearchResults` | ≈ **1.45 MB** (fixture'da villa başına ~15 kolon ve 200 karakter açıklama var; gerçek tabloda 46 kolon ve uzun açıklamalar olduğundan gerçek boyut muhtemelen daha büyük, **[ÖLÇÜLEMEDİ]**) |
| review batch | ≈ 77 KB |
| RPC (1500 ID) | ≈ 17 KB |

**Yorum:** Simülasyonda duvar saatini belirleyen, JS'ten çok **sıralı DB dalgalarının sayısı**. Gerçek prod'da dalga başına süre, app sunucusu ile DB arasındaki RTT'ye bağlı **[ÖLÇÜLEMEDİ]**.

## 8. Güvenli optimizasyon adayları

| # | Aday | Sonucu değiştirir mi? | Neden güvenli | Karar |
|---|---|---|---|---|
| **O1** | Kur sorgusunu **yalnız `price-asc`/`price-desc`'te** at | **Hayır** | `rates` başka hiçbir yerde okunmuyor (§5); hata yolunda da servis `{}` döndürüyordu | **UYGULA** |
| **O2** | Fiyat sıralamasında kur sorgusunu villa sorgusuyla **paralel başlat** (erken start, aynı noktada await) | **Hayır** | Bağımsız okuma; değer aynı noktada await ediliyor. Erken bir hata sayfayı düşürürse unhandled-rejection oluşmasın diye yan-dala no-op `catch` eklenir | **UYGULA** |
| **O3** | EN/DE tip adı çevirisini `categoryOptions` gelir gelmez **başlat** | **Hayır** | Aynı fonksiyon, aynı argüman, zaten `.catch(() => ({}))` ile; yalnız başlama anı erkene alınıyor | **UYGULA** |
| **O4** | `loadHeroFeatures`'ı **arka planda başlat**; `ozellikler` parametresi varsa token çözümünden önce, yoksa render'dan önce await et | **Hayır** | `featureTokensRaw` boşken `featureIds` seçenek listesinden bağımsız olarak `[]`. Fonksiyon zaten `.catch(() => [])` ile hiç reject etmiyor. Sidebar'a giden liste aynı | **UYGULA** |
| O5 | Review batch'i yalnız sayfa + esnek ID'leri için çekmek | Hayır (aynı aggregate, alt küme) | Yeni repository metodu gerekir; sıralı dalga ekler (TR'de +1 RTT) → gecikme kazancı belirsiz | **RAPOR** (onay) |
| O6 | Review batch'i `unstable_cache` (tag `villa-reviews`) ile cache'lemek | **Pencere içinde evet** (yeni onaylanan review geç görünebilir) | Tazelik davranışı değişir | **RAPOR** (onay) |
| O7 | Dar projeksiyon (`villa.*` yerine kart kolonları) | Prod şema bilinmediği için risk var | Repo L473-485: açık kolon listesi prod'da `villa.price` yok hatasıyla düşmüştü; şema doğrulanamadı | **UYGULANMADI** |
| O8 | Eksik index'ler (`villa_prices/villa_images/villa_reviews/villa_type_relations/villa_feature_relations (…_id)`, `villa.slug`) | Hayır (plan değişir, sonuç değişmez) | Migration gerektirir; prod'da var olup olmadığı doğrulanamadı → duplicate riski | **RAPOR** (§12, SQL) |
| O9 | Esnek modda 6 RPC'yi tek çağrıya indirmek | Hayır olabilir | RPC değişikliği veya yeni RPC gerekir — yasak | **UYGULANMADI** |
| O10 | EN/DE badge'lerini erken çekmek | — | Sayfa ID'lerine bağlı; erken çekmek tüm adayları sorgulamak (farklı sorgu) demek | **UYGULANMADI** |

## 9. Riskli optimizasyonlar (UYGULANMADI, yalnız rapor)
- SQL LIMIT/OFFSET: müsaitlik ve fiyat JS'te olduğu için sonuç setini bozar (bkz. `arama-pagination-compatibility-audit.md` §3).
- Müsaitliği SQL anti-join'e taşımak: fail-soft davranışı değişir, kural kopyası oluşur.
- Fiyat hesabını veya fiyat sıralamasını SQL'e taşımak: first-match, gece başı yuvarlama, fixed indirim, fail-closed birebir taklit edilemez.
- Tarih dışı fiyat dönemlerini SQL'de elemek: `getStartingPrice` geçmiş dönemleri de kullanıyor → tarihsiz fiyat ve sıralama değişir.
- Villa sorgusunu arama parametreleriyle cache'lemek: fiyat/indirim tazeliği ve 2 MB limiti.
- Müsaitlik sonucunu cache'lemek: stale availability (yasak).
- Dar projeksiyon (O7), review cache (O6), yeni RPC, cursor pagination, repository/query builder refactor.

## 10. Kesinlikle dokunulmaması gerekenler
- `get_blocked_villa_ids` RPC ve çağrı argümanları (`start`, `end`, aday ID'ler), fail-soft davranışı, esnek pencere üretimi (`shiftYmd`, `[-3..3]`, havuz tanımı).
- `price.engine.ts`'in tamamı, `convertPrice`, indirim ve snapshot mantığı, kart = sıralama invariant'ı.
- `applyPublicSort`, `parsePublic*`, slice ve `total` hesabı.
- Token çözümü, grup kökü genişletmesi, AND semantiği, `forceEmpty`.
- `findSearchResults` SQL'i ve `select("*")`.
- URL kontratı, JSON-LD, kart ve sidebar prop'ları.
- EXCLUDE constraint'leri ve external trigger'ı.

## 11. Baseline sonuçları (değişiklik ÖNCESİ, kod dokunulmamışken kaydedildi)

- **2 fixture boyutu:** 90 villa ve 1500 villa.
- **32 senaryo** (istenen 10 senaryonun hepsi dahil), her biri **8 sayfaya kadar** → **249 render / fixture**, toplam **498 render**.
- Her render için tam HTML kaydedildi. Baseline aynı kodla **iki kez** üretildi → byte-byte aynı (deterministik ✓).
- Mevcut `/arama` testleri: 5 dosya, **140/140 geçti** (arama-card-discount, villa-feature-filter, arama-locale-routes, public-tr-leak-forensic, availability-validator).

90 villalık fixture'da senaryo özeti (ID'ler `…0036` = sentetik villa 36):

| Senaryo | Toplam (normal) | Sayfa (12'lik) | 1. sayfa ilk 5 villa | Esnek (son sayfa) | Karşılaştırılan sayfa |
|---|---|---|---|---|---|
| `01-bos` | 86 | 8 | 0002, 0001, 0005, 0004, 0003 | 0 | 6 |
| `02-tarih` | 59 | 5 | 0002, 0001, 0004, 0003, 0008 | 0 | 6 |
| `03-tarih-kisi` | 37 | 4 | 0001, 0004, 0003, 0007, 0006 | 0 | 6 |
| `04-tarih-bolge-grupkoku` | 31 | 3 | 0001, 0004, 0008, 0009, 0012 | 0 | 6 |
| `04b-tarih-bolge-alt` | 28 | 3 | 0002, 0001, 0006, 0009, 0014 | 0 | 6 |
| `05-tarih-tip` | 29 | 3 | 0002, 0004, 0008, 0006, 0014 | 0 | 6 |
| `05b-tarih-tip-AND` | 11 | 1 | 0006, 0012, 0018, 0024, 0036 | 0 | 6 |
| `06-tarih-ozellik` | 30 | 3 | 0001, 0003, 0007, 0011, 0009 | 0 | 6 |
| `06b-tarih-ozellik-AND-dup` | 9 | 1 | 0001, 0007, 0019, 0043, 0049 | 0 | 6 |
| `07-hepsi` | 13 | 2 | 0004, 0012, 0016, 0024, 0028 | 0 | 6 |
| `08-esnek3` | 59 | 5 | 0002, 0001, 0004, 0003, 0008 | 24 | 6 |
| `08b-esnek3-kisi-fiyat` | 48 | 4 | 0036, 0027, 0081, 0018, 0054 | 21 | 6 |
| `08c-esnek1` | 59 | 5 | 0002, 0001, 0004, 0003, 0008 | 9 | 6 |
| `09-fiyat-artan` | 59 | 5 | 0036, 0063, 0027, 0081, 0018 | 0 | 6 |
| `10-fiyat-azalan` | 59 | 5 | 0059, 0061, 0071, 0047, 0073 | 0 | 6 |
| `11-fiyat-artan-EUR` | 59 | 5 | 0036, 0063, 0027, 0081, 0018 | 0 | 6 |
| `12-fiyat-azalan-USD-kisi` | 42 | 4 | 0059, 0061, 0047, 0073, 0043 | 0 | 6 |
| `13-tarihsiz-fiyat-artan` | 86 | 8 | 0024, 0064, 0052, 0032, 0019 | 0 | 6 |
| `13b-tarihsiz-fiyat-azalan-GBP` | 86 | 8 | 0061, 0078, 0059, 0071, 0009 | 0 | 6 |
| `14-kapasite-artan` | 59 | 5 | 0011, 0022, 0033, 0044, 0066 | 0 | 6 |
| `14b-kapasite-azalan` | 86 | 8 | 0003, 0014, 0025, 0036, 0047 | 0 | 6 |
| `15-pagesize30` | 59 | 2 (30'luk) | 0002, 0001, 0004, 0003, 0008 | 0 | 6 |
| `15b-pagesize-gecersiz` | 59 | 5 | 0077, 0076, 0079, 0083, 0082 | 0 | 1 |
| `16-EN-hepsi` | 13 | 2 | 0056, 0076, 0028, 0012, 0004 | 0 | 6 |
| `16b-EN-fiyat-esnek` | 59 | 5 | 0036, 0063, 0027, 0081, 0018 | 24 | 6 |
| `16c-DE-tip` | 29 | 3 | 0002, 0004, 0008, 0006, 0014 | 0 | 6 |
| `17-bos-kesisim` | 3 | 1 | 0028, 0056, 0084 | 0 | 6 |
| `17b-gecersiz-token` | 59 | 5 | 0002, 0001, 0004, 0003, 0008 | 0 | 6 |
| `17c-bos-kesisim-forceEmpty` | 0 | 1 | — | 0 | 6 |
| `18-legacy-params` | 5 | 1 | 0006, 0018, 0042, 0054, 0066 | 0 | 6 |
| `19-gecersiz-tarih` | 86 | 8 | 0024, 0064, 0052, 0032, 0019 | 0 | 6 |
| `20-bitisik-tarih` | 80 | 7 | 0059, 0079, 0073, 0061, 0043 | 0 | 6 |

> 1500 villalık baseline da aynı 32 senaryo ve 249 sayfayla kaydedildi. Değerleri fixture'a özgü olduğu için tabloya konmadı.

## 12. Önerilen uygulama sırası

1. **O1** (kur sorgusu yalnız fiyat sıralamasında) → parity → perf
2. **O2** (fiyat sıralamasında kur sorgusu paralel) → parity → perf
3. **O3** (EN/DE tip çevirisi erken başlar) → parity → perf
4. **O4** (özellik listesi villa sorgusunu bloklamaz) → parity → perf
5. Her adımdan sonra mevcut `/arama` testleri, sonunda tam test suite + lint + typecheck
6. **Onay sonrası (bu çalışmada YOK):**
   - O5 veya O6 (review)
   - O8 index migration'ı — önce prod'da `pg_indexes` ile doğrulama:
     ```sql
     -- Önce doğrula (salt-okunur):
     SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN
       ('villa','villa_prices','villa_images','villa_reviews','villa_type_relations','villa_feature_relations');
     -- Yalnız EKSİKSE, ayrı migration olarak (CONCURRENTLY, transaction dışında):
     -- CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_prices_villa_id_idx ON villa_prices (villa_id);
     -- CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_images_villa_id_idx ON villa_images (villa_id, is_cover DESC, sort_order);
     -- CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_reviews_approved_villa_idx ON villa_reviews (villa_id) WHERE is_approved;
     -- CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_type_relations_type_idx ON villa_type_relations (type_id, villa_id);
     -- CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_feature_relations_feature_idx ON villa_feature_relations (feature_id, villa_id);
     ```
   - O7, ancak `information_schema.columns` ile prod şema doğrulandıktan sonra.

---
## 13. Uygulanan değişiklikler (tek tek, her biri ayrı doğrulandı)

**Değişen tek dosya:** `app/components/search/AramaPageBody.tsx` (+66 / −13; satırların çoğu açıklama).

**Değişmeyenler:** repository, SQL, RPC, `availability.helper`, `price.engine`, `pagination`, `VillaCard`, `FilterSidebar`, migration, package.json, env, config.

| # | Değişiklik | Neden sonuç aynı |
|---|---|---|
| **O1** | `getExchangeRatesMap()` artık **yalnız `price-asc`/`price-desc`'te** çağrılıyor. Diğer sıralamalarda `{ rates: {}, updatedAt: null }` kullanılıyor (servisin hata dalıyla aynı şekil). | `rates` yalnız fiyat sıralamasının iki noktasında okunuyor (§5). |
| **O2** | Fiyat sıralamasında kur sorgusu **villa sorgusuyla aynı anda başlıyor**; değer **eskisi gibi** sıralamadan hemen önce `cookies()` ile birlikte await ediliyor. `sort` parse'ı bu yüzden yukarı taşındı (aynı fonksiyon, aynı girdi). | Değer, argüman ve kullanım noktası aynı; yalnız başlama anı değişti. Unhandled-rejection'a karşı yan-dal `catch`. |
| **O3** | EN/DE tip adı çevirisi, `categoryOptions` gelir gelmez başlıyor; sidebar bloğunda await ediliyor. | Aynı koşul (`locale !== DEFAULT_LOCALE && categoryOptions.length > 0`), aynı argüman, aynı `.catch(() => ({}))`. TR'de başlatılmıyor. |
| **O4** | `loadHeroFeatures` artık taxonomy `Promise.all`'unu bloklamıyor. URL'de `ozellikler` **varsa** token çözümünden önce, **yoksa** yalnız render'dan önce (sidebar prop'u için) await ediliyor. | Token yokken `resolveTokens([], …)` listeden bağımsız `[]`. Token varken sıra eskisiyle aynı. Sidebar'a aynı liste gidiyor. `.catch(() => [])` aynı. |

### 13.1 Her değişiklik sonrası doğrulama

**Parity (render edilen HTML'in tamamı, byte-byte, baseline = dokunulmamış kod):**

| Adım | 90 villa | 1500 villa | Mevcut `/arama` testleri |
|---|---|---|---|
| Baseline tekrar üretimi (değişiklik yok) | 0 fark / 249 | — | 140/140 |
| O1 | **0 fark / 249** | **0 fark / 249** | 128/128 |
| O2 | **0 fark / 249** | **0 fark / 249** | 128/128 |
| O3 | **0 fark / 249** | **0 fark / 249** | 128/128 |
| O4 | **0 fark / 249** | **0 fark / 249** | 128/128 |
| **Final + 8 hata senaryosu**, baseline **orijinal HEAD koduyla yeniden üretildi** | **0 fark / 268** | **0 fark / 268** | — |

- **Hata senaryoları (E1–E8):**
  - özellik listesi throw / error
  - kur sorgusu error (EUR fiyat sıralaması)
  - müsaitlik RPC error (fail-soft) ve esnek modda RPC error
  - review error
  - EN çeviri throw
  - tip junction error

  Hepsi orijinal kodla birebir aynı HTML üretti.
- **Negatif kontrol (harness gerçekten farkı yakalıyor mu?):** O1 geçici olarak bozuldu (fiyat sıralamasında da kur atlandı) → **85 sayfada fark yakalandı**, sonra geri alındı. Harness kör değil.
- **Çağrı dizisi farkları (beklenen ve kontrol edildi):**
  - Tarihsiz/tarihli smart ve capacity senaryolarında yalnız `exchange_rates` çağrısı **kalktı**.
  - Fiyat senaryolarında aynı sorgular yalnız **daha erken sırada** çalışıyor.
  - Başka hiçbir sorgu eklenmedi veya çıkmadı. Müsaitlik RPC'si çağrı sayısı ve argümanları aynı.

**Tam doğrulama (final hâl):**
- `tsc --noEmit` → **0 hata**
- ESLint (proje) → **0 hata / 198 uyarı** (baseline ile aynı)
- Tam test suite → **185 dosya, 3629 test, hepsi geçti** (4 parça: 906 + 1083 + 748 + 892)
- `next build`: §14'e bakın.

### 13.2 Önce / sonra ölçüm [ÖLÇÜLDÜ-SENTETİK — gerçek prod değil]

1500 villa, **DB çağrısı başına 25 ms simüle gecikme**. Orijinal ve final kod aynı harness sürümüyle arka arkaya ölçüldü; değerler 5 çalıştırmanın medyanı.

| Senaryo | Önce (ms) | Sonra (ms) | Fark | DB çağrısı | Max eşzamanlı DB |
|---|---|---|---|---|---|
| `01-bos` | 123.7 | 49.2 | −60% | 4 → 3 | 2 → 3 |
| `02-tarih` | 155.5 | 83.6 | −46% | 5 → 4 | 2 → 3 |
| `07-hepsi` (ozellikler dahil) | 181.5 | 147.9 | −19% | 7 → 6 | 2 → 2 |
| `08-esnek3` | 203.7 | 131.8 | −35% | 11 → 10 | 6 → 6 |
| `09-fiyat-artan` | 164.7 | 105.2 | −36% | 5 → 5 | 2 → 4 |
| `13-tarihsiz-fiyat-artan` | 118.2 | 54.7 | −54% | 4 → 4 | 2 → 4 |
| `14-kapasite-artan` | 148.0 | 81.8 | −45% | 5 → 4 | 2 → 3 |
| `16-EN-hepsi` | 287.5 | 220.5 | −23% | 12 → 12 | 2 → 4 |
| `16b-EN-fiyat-esnek` | 324.0 | 179.3 | −45% | 16 → 16 | 6 → 7 |

**Saf JS süresi (0 ms gecikme):** Önce ve sonra ±%6 içinde, gürültü seviyesinde. **JS hesabı değişmedi** (beklenen: fiyat, filtre ve sıralama koduna dokunulmadı).

**Nasıl okunmalı:** Kazanç, **sıralı DB dalgası sayısının azalmasından** geliyor. Tarihli smart aramada `features → villa → RPC → kur` dizisi (4 dalga) `villa → RPC` dizisine (2 dalga) iniyor. Prod'daki gerçek kazanç ≈ **kalkan dalga sayısı × app↔DB RTT**:

| RTT | Tarihli smart aramada kazanç |
|---|---|
| 1–2 ms (aynı bölge) | ~2–4 ms |
| 20–30 ms (farklı bölge) | ~40–60 ms |

Gerçek RTT **[ÖLÇÜLEMEDİ]**. Sorgu başına DB işi değişmedi. Toplam sorgu sayısı smart/capacity aramalarında 1 azaldı.

**Yan etki:** Aynı anda açık DB bağlantısı en fazla 2 → 4 (esnek EN'de 6 → 7). `PG_POOL_MAX=10` sınırının altında. Yoğun eşzamanlı trafikte pool baskısı biraz artar, toplam iş azalır.

### 13.3 Özellikle UYGULANMAYANLAR
- SQL LIMIT/OFFSET, SQL pagination, cursor pagination
- Müsaitliği veya fiyat hesabını/sıralamasını SQL'e taşımak; RPC değişikliği; yeni RPC
- `findSearchResults` projeksiyonunu daraltmak (O7): prod şema doğrulanamadı; geçmişte açık kolon listesi prod'u düşürmüş (repo L473-485)
- Review batch'i cache'lemek (O6: tazelik değişir) veya sayfa ID'leriyle sınırlamak (O5: yeni repo metodu + sıralı dalga) → **onayınızı bekliyor**
- Index migration'ları (O8): prod'da var olup olmadıkları doğrulanamadı → §12'deki SQL ile önce kontrol
- Esnek moddaki 6 RPC'yi birleştirmek, EN/DE badge'lerini erken çekmek (O9, O10)
- Villa listesi veya müsaitlik sonucu cache'i

### 13.4 Harness nasıl yeniden çalıştırılır
Kopyalar `Claude outputs/arama-parity-harness/*.txt` altında (lint ve test koşularına girmesin diye `.txt` uzantılı). Kullanmak için:
1. Dosyaları repo dışındaki bir klasöre (ör. `~/parity`) `.txt` uzantısı olmadan kopyalayın. Klasöre `node_modules` → repo `node_modules` symlink'i ekleyin. Config içindeki `REPO`/`root` yollarını kendi yolunuza göre düzeltin.
2. Repo kökünden:
   - baseline: `PARITY_MODE=baseline PARITY_N=90 npx vitest run --config ~/parity/vitest.parity.config.ts`
   - karşılaştırma: `PARITY_MODE=compare …`
   - perf: `PARITY_MODE=perf PARITY_N=1500 PARITY_LAT=25 …`
3. İsterseniz onayınızla kalıcı bir regresyon testi olarak `tests/` altına alınabilir. Bu çalışmada eklenmedi.

## 14. Build ve git durumu

- `next build --webpack` (offline, font mock) → **başarılı** ("Compiled successfully in 28.4s").
  - `/arama`, `/en/arama`, `/de/arama` → `ƒ` (dynamic), eskisi gibi.
  - Loglardaki `EAI_AGAIN` satırları, DB'ye erişilemeyen build ortamından geliyor. Build'in DB'siz yapılmasından kaynaklanıyor; değişiklikle ilgisi yok.
- `git status`:
  - ` M app/components/search/AramaPageBody.tsx` ← **tek kod değişikliği**
  - `?? Claude outputs/arama-safe-optimization-audit.md` (bu rapor)
  - `?? Claude outputs/arama-parity-harness/` (harness kopyası, `.txt`)
  - `?? Claude outputs/arama-pagination-compatibility-audit.md`, `?? Claude outputs/public-performance-audit-v2.md` (önceki raporlar; bu çalışmada değiştirilmedi)
- Commit ve push **yapılmadı**. Migration, env, package.json veya DB değişikliği **yok**.

## 15. Onayınızı bekleyenler
1. **O5 veya O6 (review batch):** Her aramada tüm onaylı review'ların okunması. O6 (cache) tazelik davranışını değiştirir. O5 (sayfa ID'leri) yeni repository metodu gerektirir. Hangisini isterseniz, önce aynı parity harness'iyle doğrulanır.
2. **O8 (index):** Önce prod'da §12'deki `pg_indexes` sorgusu çalıştırılmalı. Yalnız eksik olanlar için migration hazırlanır.
3. **O7 (dar projeksiyon):** Önce prod'da `information_schema.columns` kontrolü gerekiyor. Sentetik payload'ın ~1.45 MB olması bunun en büyük potansiyel kazanç olduğunu gösteriyor, ama en riskli değişiklik de bu.
4. **Gerçek ölçüm:** Prod'da `/arama` TTFB'si (tarihsiz, tarihli, fiyat sıralı) ve app↔DB RTT ölçülürse bu değişikliklerin gerçek etkisi sayıyla görülür.
