# /arama — Performans Yeniden Audit'i (ölçüm odaklı)

- Tarih: 2026-09-23 · Kod: `e2f934f` (perf: optimize arama query flow). Kullanıcının makinesindeki çalışma kopyası ile `origin/main` aynı.
- **Bu çalışmada hiçbir kod, config, env, migration veya DB değişikliği yapılmadı; commit/push yok.** Tek çıktı bu rapor.

---

## 0. Hangi DB'ye bağlanılıyor? — kesin tespit

| Soru | Bulgu | Kanıt |
|---|---|---|
| Çalışma ortamının bağlantı dizesi | `DATABASE_URL` → **`aws-0-eu-west-1.pooler.supabase.com:5432/postgres`**, kullanıcı `postgres.ruilh…` (Supabase **session-mode pooler**, AWS eu-west-1), `PGSSLMODE=require`, `PG_POOL_MAX=10` | `.env.local` (değer ekrana basılmadı) |
| Bu, production mu? | **Repo'dan kesin belirlenemiyor.** | Deploy: "Hetzner VPS + Coolify" (`docs/coolify-scheduled-tasks.md:3`). Prod `DATABASE_URL`'i Coolify ortam değişkeninde, repo'da yok. `db/migrations/_archive/README.md` "native PostgreSQL (Hetzner)'e geçildi" diyor. `LEGACY_PROVIDER_PURGE_REPORT.md` §7.2 ise "**Production `DATABASE_URL` hâlâ eski sağlayıcıya işaret ediyorsa…**" diyerek bunu açık madde bırakıyor. |
| Kullanıcının makinesinden erişim | **YOK** — `getent hosts …pooler.supabase.com` → DNS çözülemiyor | device shell |
| Bulut çalışma alanından erişim | **YOK** — DNS çözülüyor ama `:5432`'ye TCP bağlantısı zaman aşımına düşüyor (egress yalnız HTTP/S) | `/dev/tcp` denemesi, 8 sn timeout |

### ⚠️ PRODUCTION DB ÖLÇÜLEMEDİ
Ne `.env.local`'daki Supabase pooler'a ne de (varsa) Hetzner'deki native PostgreSQL'e erişim var. **Bu rapordaki hiçbir DB sayısı production ölçümü değildir.** Production'da çalıştırılacak salt-okunur doğrulama script'i §8'de.

---

## 1. Ölçüm yöntemi (ne gerçek, ne sentetik)

Uygulamayı gerçek bir PostgreSQL'e karşı çalıştırmak için **bulut çalışma alanında** (kullanıcının makinesinde değil) şu ortam kuruldu:

| Bileşen | Durum |
|---|---|
| Kod | `origin/main` @ `e2f934f`, **salt-okunur klon**, `npm ci` |
| DB | **Yerel PostgreSQL 16.13**, loopback (ağ gecikmesi ≈ 0), varsayılan ayarlar + `shared_buffers=256MB`, `pg_stat_statements`, `auto_explain` |
| Şema | `types/database.ts` (`VillaRow`) + migrations'tan **yaklaşık** yeniden kuruldu (`villa.price` yok — repo notu). 039 RPC'si birebir. |
| Veri | **SENTETİK, deterministik** (`setseed`). Villa başına: 25 görsel, 20 fiyat dönemi (2024–2027 × 5 sezon), ~0.3 indirim, ~6 review (%85 onaylı), ~2 tip, ~15 özellik, 30 rezervasyon (yaklaşık %75'i bloklayan statüde), 8 manuel blok, 15 dış takvim bloğu (%80 aktif). Açıklama ~2.4 KB, map_embed iframe ~300 B. |
| Ölçekler | 10 / 100 / 500 / 1000 / 1500 villa (aktif ≈ %93) |
| Index setleri | **M** = yalnız migrations'ta tanımlı index/constraint'ler · **F** = M + `villa_images(villa_id,is_cover,sort_order)`, `villa_prices(villa_id)`, `villa_reviews(villa_id)`, `villa_type_relations(type_id,villa_id)` / `(villa_id)`, `villa_feature_relations(feature_id,villa_id)` / `(villa_id)`, `villa(slug)`, `villa(location_id)` |
| Çalışan kod | **Gerçek** `AramaPageBody` akışı, gerçek repository'ler + query compiler + `pg` driver, gerçek `availability.helper` + RPC, gerçek `price.engine`, `pagination`, gerçek `VillaCard` + `FilterSidebar` SSR (`renderToString`, **production React build**) |
| Mock'lar | Yalnız `next/headers`, `next/navigation`, `next/link`, `next/image`, `next/dynamic`, `PageHero`, `cache.helpers` (prod'da `unstable_cache` HIT olduğu için memo) |
| Aşama süreleri | Kaynağın **repo dışında**, `performance.now()` probe'ları eklenmiş bir **kopyası** kullanıldı (repo dosyası değişmedi). Her senaryo 2 ısınma + 7 ölçüm; **medyan**. |
| DB süreleri | İstemci tarafı süre: `pg` pool `query` sarmalayıcısı. Sunucu exec süresi: `pg_stat_statements` ve `EXPLAIN (ANALYZE, BUFFERS)`. |

**Etiketler:**
- **[YEREL-ÖLÇÜM]** yukarıdaki yerel PG + sentetik veri ile gerçekten ölçüldü
- **[HESAP]** ölçümden türetilen aritmetik (ör. ağ transferi)
- **[ÖLÇÜLEMEDİ]** production

**Sınırlar:** Gerçek satır sayıları, veri dağılımı, metin uzunlukları, PG ayarları, donanım ve ağ **bilinmiyor**. Sentetik veri gerçekte daha az ya da daha çok olabilir. Next.js'in RSC/flight serileştirmesi ölçülmedi; yerine client prop boyutları ölçüldü.

---

## 2. KISA CEVAP: "/arama neden hâlâ yavaş?"

Önceki turdaki optimizasyonlar **sıralı DB dalgalarının sayısını** azalttı. Ama tek bir çağrının **kendi maliyetine** dokunmadı. Ölçümler, kalan maliyetin neredeyse tamamının **tek sorgudan** (`findSearchResults`) ve fiyat sıralamasında **JS fiyat hesabından** geldiğini gösteriyor.

| # | Darboğaz | Kategori | Kanıt (1500 villa, yerel) | Önem |
|---|---|---|---|---|
| **1** | **`findSearchResults`'ın correlated subquery'leri, child tablolarda `villa_id` index'i yoksa her villa için tüm `villa_images` ve `villa_prices` tablosunu seq-scan ediyor** (O(villa × child satır)) | **A) DB sorgusu** | M setinde **3.2–3.4 sn DB exec**, 1.38 M buffer hit (~10.5 GB mantıksal okuma), sayfanın **~%97'si**. F setinde (index'li) aynı sorgu **~85–110 ms**, yani ~35× hızlı. | **KRİTİK** (prod'da index yoksa) |
| **2** | Sorgu, filtresiz/geniş aramalarda **~8.3 MB** veri döndürüyor (%42.5 `description`, %30.7 tüm fiyat dönemleri, %5 `map_embed`, …); ekranda yalnız 12 kart var | **B) DB → Node transfer** (+ A) | Yerel loopback'te transfer+parse **~22 ms**. Gerçek ağda: 100 Mbps ≈ **660 ms**, 500 Mbps ≈ 130 ms, 1 Gbps ≈ 66 ms **[HESAP]**. Pooler bir hop daha ekliyor. | **YÜKSEK** (ağa bağlı; [ÖLÇÜLEMEDİ]) |
| **3** | Tarihli **fiyat sıralamasında** `calculateGrandTotal` ~1300 müsait villanın hepsi için çalışıyor | **D) JS fiyat hesaplama** | **~170–190 ms** (5 gece); izole benchmark'ta 14 gece için **~510 ms** | **YÜKSEK** (yalnız `price-*` + tarih) |
| 4 | Tüm onaylı review'lar her aramada okunuyor | A + B | 7.6 bin satır, **~470 KB**, ~6–10 ms | Orta-düşük |
| 5 | Esnek mod: 7 RPC | A | ~50 ms (paralel, havuz kısıtlı) | Orta-düşük |
| 6 | JS filtreleme, müsaitlik eleme, normalize | C | toplam **~4–9 ms** | Düşük |
| 7 | JS sıralama (`applyPublicSort`) | E | **0–6 ms** | Düşük |
| 8 | React SSR render (12 kart + sidebar) | F | **~8–14 ms** (production React). Development React'ta ~50 ms. | Düşük |

**Karar:**
- **Production'da child `villa_id` index'leri YOKSA** (migrations'ta tanımlı değiller), darboğaz kesin olarak **A) DB sorgusu**. Kök neden, correlated subquery'lerin index'siz seq-scan'i. Maliyet villa sayısıyla **karesel** büyüyor: 100 → 23 ms, 500 → ~470 ms, 1000 → ~1.7 sn, 1500 → ~3.3 sn [YEREL-ÖLÇÜM].
- **Index'ler VARSA**, darboğaz **A (~100 ms exec) + B (8 MB transfer, ağ hızına göre 66–660 ms)**. Fiyat sıralı tarihli aramalarda buna **D (~180 ms)** eklenir.
- Hangisinin geçerli olduğu production'da §8'deki **tek bir `pg_indexes` sorgusuyla** kesinleşir.

---
## 3. İstenen tablo — 1500 villa (1389 aktif), tarihli + fiyat artan (`S3`) [YEREL-ÖLÇÜM]

> "Gerçek süre" = yerel PG 16 + sentetik veri + loopback üzerinde ölçülen medyan. **Production değil.** İki index seti yan yana verildi, çünkü production'da hangisinin geçerli olduğu bilinmiyor.

| İşlem | Gerçek süre — M (migrations index'leri) | Gerçek süre — F (+FK index'leri) | Dönen satır | Veri boyutu | CPU/IO belirtisi | Sorun seviyesi |
|---|---|---|---|---|---|---|
| **Villa sorgusu** `findSearchResults` (villa.* + location + 1 görsel + tüm fiyat + indirim), istemciden | **3385 ms** | **113 ms** | 1389 | **8.3 MB** (metin) / 8.7 MB (Node nesnesi) | M: **1 378 408 buffer hit** (~10.5 GB mantıksal okuma, hepsi cache'ten → **saf DB CPU**); 4 SubPlan × 1389 loop; `villa_images` ve `villa_prices` her villa için **Seq Scan**, satır başına ~37.5 bin / ~30 bin satır eleniyor. F: 16 036 hit | **M: KRİTİK** · F: YÜKSEK |
| └ DB exec (sunucu) | 3380 ms | 85–108 ms | | | F'de maliyetin çoğu JSON inşası + ~8 MB çıktı | |
| └ DB → Node transfer + `pg` parse | ~17–22 ms (loopback) | ~22 ms (loopback) | | 8.3 MB | Gerçek ağda [HESAP]: 100 Mbps ≈ 660 ms · 500 Mbps ≈ 130 ms · 1 Gbps ≈ 66 ms (+TLS, +pooler hop) | **YÜKSEK** ([ÖLÇÜLEMEDİ]) |
| └ "Fiyat sorgusu" (`villa_prices` embed) | yukarıdakinin içinde; M'de SubPlan 3 ≈ 0.9 ms × 1389 = **~1.27 sn** | ~0.03 ms × 1389 ≈ 40 ms | 30 000 fiyat satırı (1389 × ~20) | **2.5 MB** (%30.7) | Her villanın **tüm** dönemleri (geçmiş yıllar dahil) | M: KRİTİK · F: orta |
| └ Görsel embed (`LIMIT 1`) | SubPlan 2 ≈ 1.23 ms × 1389 = **~1.7 sn** (seq scan + top-N sort) | ~0.005 ms × 1389 ≈ 7 ms | 1389 | 155 KB | M: 898 683 buffer hit | M: KRİTİK |
| **Yorum sorgusu** (tüm onaylı) | 6.8 ms | 6.6 ms | **7627** | **~470 KB** | Seq Scan (her iki sette) — sonuçların ~%85'i dönüyor, index fark etmiyor | Orta-düşük |
| **Müsaitlik RPC** `get_blocked_villa_ids` (1389 ID) | 9.9 ms | 9.2 ms | 28–44 | ~2 KB | DB exec 3–4 ms; `idx_reservations_avail` **tam tarandı** (villa_id koşulsuz: `$3 IS NULL OR …`); `manual_reservations` **Seq Scan** (12 000 satır) | Düşük |
| Esnek mod (7 RPC, `S5`) | 50.8 ms (toplam), aşama 10.7 ms | 50.5 ms / 10.3 ms | 132–199 | ~9–13 KB | 7 paralel çağrı | Düşük-orta |
| Özellik listesi (sidebar), kur (`exchange_rates`) | 1–5 ms | 1–5 ms | 40 / 3 | 2.6 KB / 0.2 KB | ihmal edilebilir | Düşük |
| Tip/özellik junction (`S4`) | 0.7 / 2.2 ms | 0.7 / 1.3 ms | 268 / 566 | 27 / 59 KB | M: Seq Scan (2 967 / 22 619 satır). F: Index Only Scan | Düşük |
| **JS filtreleme** (token, AND, bölge genişletme) | 0.0–2.7 ms | 0.0–1.7 ms | — | — | — | Düşük |
| **JS normalize** (1389 villa: görsel, fiyat, indirim, başlangıç fiyatı) | 3.6 ms | 3.9 ms | — | — | — | Düşük |
| **Müsaitlik eleme** (JS `filter`) | 0.16 ms | 0.13 ms | — | — | — | Düşük |
| **Fiyat hesaplama** (`calculateGrandTotal` × ~1300 müsait villa, 5 gece) | **172.8 ms** | **187.1 ms** | — | — | Tek thread CPU; gece × fiyat dönemi doğrusal taraması (§6) | **YÜKSEK** (yalnız `price-*` + tarih) |
| **Sıralama** (`applyPublicSort`) | 0.46 ms | 0.44 ms | — | — | — | Düşük |
| **Pagination** (`slice`) | < 0.01 ms | < 0.01 ms | — | — | — | Düşük |
| **Render** (SSR: 12 gerçek VillaCard + FilterSidebar, production React) | 13.3 ms | 12.2 ms | 12 kart | HTML **~138 KB**; client prop'ları: kartlar **~25 KB**, sidebar ~7 KB | — | Düşük |
| **TOPLAM** (gövde + render) | **3641 ms** | **378 ms** | | | | |

**Diğer senaryolarda toplam (1500 villa):**

| Senaryo | M | F |
|---|---|---|
| Boş (tarihsiz, smart) | 3400 ms | 161 ms |
| Tarihli smart | 3411 ms | 186 ms |
| Tarihli fiyat artan | 3641 ms | 378 ms |
| Tarih + kişi + bölge + tip + özellik (42 / 32 aday) | 141 ms | 27 ms |
| Tarihli esnek ±3 | 3492 ms | 194 ms |
| Tarihsiz fiyat artan (EUR) | 3533 ms | 162 ms |

**Filtreli aramalar hızlı**, çünkü `id IN (…)` / `location_id IN (…)` aday sayısını düşürüyor. **Geniş aramalar** (boş, sadece tarih, sadece fiyat sıralaması) yavaş, çünkü tüm villalar ve tüm child verisi çekiliyor.

---

## 4. Ölçeğe göre davranış [YEREL-ÖLÇÜM]

### 4.1 Index seti M (yalnız migrations index'leri)
| Villa (aktif) | Tarihli smart — toplam | Villa sorgusu (istemci) | Villa sorgusu DB exec | Villa payload | Tarihli fiyat artan — toplam | Fiyat anahtarı JS |
|---|---|---|---|---|---|---|
| 10 (8) | 11.6 ms | 2.5 ms | 0.7 ms | 49 KB | 12.8 ms | 1.0 ms |
| 100 (93) | 36.6 ms | 22.7 ms | ~23 ms | 567 KB | 52.8 ms | 11.6 ms |
| 500 (462) | 507 ms | 470 ms | ~450–500 ms | 2.8 MB | 552 ms | 65 ms |
| 1000 (920) | 1713 ms | 1664 ms | ~1.7–1.8 sn | 5.6 MB | 1853 ms | 107 ms |
| 1500 (1389) | **3411 ms** | **3313 ms** | **~3.3–3.4 sn** | 8.3 MB | **3641 ms** | 173 ms |

→ Villa sayısı 3 katına çıkınca (500 → 1500) süre **~7 kat** arttı: **karesel büyüme** (villa × child satır).

### 4.2 Index seti F (+FK index'leri)
| Villa (aktif) | Tarihli smart — toplam | Villa sorgusu (istemci) | DB exec | Transfer+parse (loopback) | Villa payload | Tarihli fiyat artan — toplam | Fiyat anahtarı JS |
|---|---|---|---|---|---|---|---|
| 10 (8) | 13.2 ms | 2.1 ms | 0.5 ms | ~1.6 ms | 49 KB | 11.8 ms | 1.1 ms |
| 100 (93) | 22.4 ms | 8.3 ms | 3.6 ms | 7.1 ms | 567 KB | 37.4 ms | 10.7 ms |
| 500 (462) | 61.3 ms | 28.1 ms | 20.0 ms | 9.8 ms | 2.8 MB | 121.6 ms | 61.9 ms |
| 1000 (920) | 95.2 ms | 51.7 ms | 37.3 ms | 19.1 ms | 5.6 MB | 213.5 ms | 109.0 ms |
| 1500 (1389) | **186.4 ms** | **107.4 ms** | 85.4 ms | 22.1 ms | 8.3 MB | **378.4 ms** | 187.1 ms |

→ F'de büyüme **doğrusal**. Kalan maliyetin yarısı villa sorgusu (JSON inşası + 8 MB), fiyat sıralamasında da yarısı JS fiyat hesabı.

> Transfer+parse değerleri ayrı bir ölçümle alındı: aynı SQL 7 kez istemciden çekildi ve `EXPLAIN (ANALYZE, TIMING OFF)` exec süresiyle karşılaştırıldı (medyan fark). Aşama tablolarındaki "DB exec" ise tek bir çalıştırmanın `pg_stat_statements` değeri.

---

## 5. EXPLAIN (ANALYZE, BUFFERS) — kilit planlar [YEREL-ÖLÇÜM, sentetik veri]

**`findSearchResults`, 1500 villa, M seti** (özet):
```
Incremental Sort (actual time=489..3443 ms rows=1389)  Buffers: shared hit=1378449
  -> Index Scan using idx_villa_sort_order on villa  Filter: (is_active AND deleted_at IS NULL)
     SubPlan 2 (villa_images LIMIT 1)
       -> Sort (top-N) -> Seq Scan on villa_images e1 (actual 1.211 ms, rows=25, loops=1389)
            Filter: (villa_id = villa.id)  Rows Removed by Filter: 37475   Buffers: shared hit=898683
     SubPlan 3 (villa_prices json_agg)
       -> Seq Scan on villa_prices e2 (actual 0.877 ms, rows=20, loops=1389)
            Filter: (villa_id = villa.id)  Rows Removed by Filter: 29980   Buffers: shared hit=473649
     SubPlan 4 (villa_discounts) -> Index Scan using villa_discounts_no_overlap (0.006 ms, loops=1389)
```
**Aynı sorgu, F seti:**
```
Incremental Sort (actual time=25..83 ms rows=1389)  Buffers: shared hit=16072
  SubPlan 2 -> Index Scan using (villa_images villa_id,is_cover,sort_order) (0.004 ms, loops=1389)
  SubPlan 3 -> Bitmap Index Scan on (villa_prices villa_id) (0.004 ms, loops=1389)
```
**`get_blocked_villa_ids` iç planı** (auto_explain, 1389 ID, F seti):
```
Unique -> HashAggregate -> Append (4.2 ms)
  reservations:  Index Only Scan using idx_reservations_avail   Index Cond: (villa_id IS NOT NULL AND start_date < $2 AND end_date > $1)
                 Filter: ($3 IS NULL OR villa_id = ANY($3))   ← villa_id koşulu index'e girmiyor (OR-null)
  manual:        Seq Scan on manual_reservations (12 000 satır)
  external:      Index Only Scan using external_calendar_events_overlap_idx
```
Bu ölçekte RPC 3–4 ms tutuyor; darboğaz değil.

**Review sorgusu:** Seq Scan, 7627 / 9044 satır döndürüyor (her iki sette). Index bu sorguya yardım etmez, çünkü sorunun kaynağı tüm tabloyu çekmek.

---

## 6. JS fiyat hesabı — izole benchmark [YEREL-ÖLÇÜM]

`calculateGrandTotal` (gerçek `price.engine`), 1389 villa, V8 ısınmış, production akışıyla aynı argümanlar:

| Fiyat dönemi / villa | Konaklama | Süre (1389 villa) | Villa başına |
|---|---|---|---|
| 20 (eşleşen dönem listenin **sonunda**, 2027) | 5 gece | **155.8 ms** | 112 µs |
| 20 | **14 gece** | **509.0 ms** | 366 µs |
| 40 | 5 gece | 171.2 ms | 123 µs |
| 5 (eşleşen dönem listenin **başında**, 2024) | 5 gece | 31.7 ms | 23 µs |

- **Neden (koddan):** `getDailyPrice` her gece için `prices.find(...)` çalıştırıyor ve her satırda `parseLocalDate(start_date)` + `parseLocalDate(end_date)` ile yeni `Date` üretiyor (`lib/price.engine.ts:110-117`). `getActiveDiscount` da aynısını yapıyor (`:183+`). Gece başına `convertPrice` + `toFixed` çağrılıyor.
- Maliyet ≈ gece sayısı × eşleşen satıra kadar taranan dönem sayısı. Geçmiş yılların dönemleri listenin başında kaldıkça her gece hepsi yeniden parse ediliyor.
- Bu yalnız **tarih + `price-asc`/`price-desc`** aramalarında çalışıyor ve **tüm müsait villalar** için yapılıyor (L1005-1041); ekranda yalnız 12 kart var.
- **Bu çalışmada fiyat motoruna dokunulmadı** (istenen kısıt).

---
## 7. Kategori kararı

| Kategori | Pay (1500 villa, tarihli smart / tarihli fiyat artan) | Hüküm |
|---|---|---|
| **A) DB sorgusu** | M: **%97 / %93** · F: %46 / %28 (exec) | **Birincil darboğaz** — özellikle child `villa_id` index'leri yoksa |
| **B) DB → Node transfer** | Loopback'te %12 / %6. Gerçek ağda 8.3 MB × ağ hızı ([HESAP]: 66–660 ms) | **İkincil, muhtemelen önemli** — [ÖLÇÜLEMEDİ] |
| C) JS filtreleme / normalize / müsaitlik eleme | < %3 | Sorun değil |
| **D) JS fiyat hesaplama** | 0 / **%49** (F) | **Fiyat sıralı tarihli aramalarda birincil** |
| E) JS sıralama | < %0.2 | Sorun değil |
| F) React/render | %4–7 (production React ~12 ms) | Sorun değil |
| G) Diğer (esnek mod RPC'leri, review okuması) | %3–6 | Düşük |

**Sonuç cümlesi:** `/arama` hâlâ yavaş, çünkü geniş aramalarda **tek bir villa sorgusu tüm aktif villaları, açıklamalarını ve tüm fiyat dönemlerini (~8 MB) çekiyor**. Child tablolarda `villa_id` index'i yoksa bu sorgu **villa sayısıyla karesel** büyüyor (yerelde 1500 villada ~3.4 sn). Önceki turdaki paralelleştirme bu tek sorgunun süresini kısaltamazdı. Tarihli fiyat sıralamasında buna **tüm müsait villalar için yapılan JS fiyat hesabı** (~180 ms, 14 gecede ~500 ms) ekleniyor.

---

## 8. Production'da çalıştırılacak salt-okunur doğrulama (SELECT / EXPLAIN)

> Production DB'ye erişimi olan biri (ör. Coolify container'ında `psql "$DATABASE_URL"`) çalıştırmalı. Hepsi `BEGIN READ ONLY … ROLLBACK` içinde. **Önce 8.0'ı çalıştırın: hangi DB'nin production olduğu buradan anlaşılır.**

```sql
-- 8.0 Hangi sunucu? (Supabase mi, Hetzner'deki native PG mi)
SELECT current_database(), inet_server_addr(), version(),
       current_setting('shared_buffers') AS shared_buffers, current_setting('work_mem') AS work_mem;

BEGIN READ ONLY;

-- 8.1 KARAR SORGUSU: child tablolarda villa_id index'i var mı?
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('villa','villa_images','villa_prices','villa_discounts','villa_reviews',
                    'villa_type_relations','villa_feature_relations','reservations',
                    'manual_reservations','external_calendar_events')
ORDER BY tablename, indexname;

-- 8.2 Gerçek satır sayıları
SELECT relname, n_live_tup, seq_scan, seq_tup_read, idx_scan,
       pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE relname IN ('villa','villa_images','villa_prices','villa_discounts','villa_reviews',
                  'villa_type_relations','villa_feature_relations','reservations',
                  'manual_reservations','external_calendar_events')
ORDER BY seq_tup_read DESC;
SELECT count(*) FILTER (WHERE is_active AND deleted_at IS NULL) AS aktif, count(*) AS toplam FROM villa;

-- 8.3 /arama ana sorgusu — uygulamanın query compiler'ının ÜRETTİĞİ SQL'in BİREBİR aynısı (filtresiz tarihli arama)
EXPLAIN (ANALYZE, BUFFERS)
SELECT *, (SELECT json_build_object('name', "e0"."name") FROM "villa_locations" "e0" WHERE "e0"."id" = "villa"."location_id") AS "location",
 (SELECT coalesce(json_agg(__lim.__row), '[]'::json) FROM (SELECT json_build_object('image_url', "e1"."image_url", 'is_cover', "e1"."is_cover", 'sort_order', "e1"."sort_order") AS __row FROM "villa_images" "e1" WHERE "e1"."villa_id" = "villa"."id" ORDER BY "e1"."is_cover" DESC, "e1"."sort_order" ASC LIMIT 1) __lim) AS "villa_images",
 (SELECT coalesce(json_agg(json_build_object('price', "e2"."price", 'currency', "e2"."currency", 'start_date', "e2"."start_date", 'end_date', "e2"."end_date")), '[]'::json) FROM "villa_prices" "e2" WHERE "e2"."villa_id" = "villa"."id") AS "villa_prices",
 (SELECT coalesce(json_agg(json_build_object('start_date', "e3"."start_date", 'end_date', "e3"."end_date", 'discount_type', "e3"."discount_type", 'discount_value', "e3"."discount_value", 'currency', "e3"."currency") ORDER BY "e3"."start_date" ASC), '[]'::json) FROM "villa_discounts" "e3" WHERE "e3"."villa_id" = "villa"."id") AS "villa_discounts"
FROM "villa" WHERE "is_active" = true AND "deleted_at" IS NULL ORDER BY "sort_order" ASC, "created_at" DESC;
--   Bakılacak: SubPlan'larda "Seq Scan on villa_images / villa_prices" + "loops=N" var mı? Toplam "Buffers: shared hit/read"?

-- 8.4 Aynı sorgunun döndürdüğü veri boyutu (DB → Node transferi)
SELECT count(*) AS satir, pg_size_pretty(sum(octet_length(t::text))) AS metin_boyutu,
       pg_size_pretty(sum(octet_length(coalesce(t.description,'')))) AS description,
       pg_size_pretty(sum(octet_length(t.villa_prices::text))) AS fiyatlar
FROM ( /* 8.3'teki SELECT, EXPLAIN satırı olmadan */ ) t;

-- 8.5 Review ve müsaitlik
EXPLAIN (ANALYZE, BUFFERS) SELECT "villa_id", "rating" FROM "villa_reviews" WHERE "is_approved" = true;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM get_blocked_villa_ids('2027-06-10', '2027-06-15', NULL);

-- 8.6 En pahalı sorgular (pg_stat_statements kuruluysa; Supabase'de varsayılan açık)
SELECT calls, round(total_exec_time::numeric,1) AS total_ms, round(mean_exec_time::numeric,2) AS mean_ms,
       rows, shared_blks_hit, shared_blks_read, left(query, 120) AS query
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

ROLLBACK;
```
**App sunucusu ↔ DB RTT ve bant genişliği** (prod container'ında, salt-okunur): 20 kez `SELECT 1` → p50 RTT; 8.3'teki sorguyu istemciden çekip süreyi `EXPLAIN ANALYZE` exec süresinden çıkarın → gerçek transfer süresi.

---

## 9. Bu çalışmada YAPILMAYANLAR
- Kod, config, env, migration, DB değişikliği **yok**. Commit/push **yok**. SQL pagination, LIMIT/OFFSET, cache, müsaitlik/fiyat/filtre/sıralama mantığı değişikliği **yok**.
- Production DB'ye bağlanılamadı; **production ölçümü yok**.
- Ölçüm ortamı (yerel PG, sentetik veri, probe'lu kopya, harness) **yalnız bulut çalışma alanında**; kullanıcının proje klasörüne yazılmadı. Tek dosya: bu rapor.

## 10. Sonraki adım için seçenekler (UYGULANMADI — karar sizin)
Aşağıdakilerin hepsi sonuç setini değiştirmeden uygulanabilir **adaylar**. Her biri, önceki turdaki parity harness'iyle doğrulanmalı.

1. **(A) Index doğrulaması → migration.** §8.1 sonucunda `villa_images(villa_id)` / `villa_prices(villa_id)` yoksa, `CREATE INDEX CONCURRENTLY` ile eklemek. Sorgu metnini ve sonucunu değiştirmez; yerelde 1500 villada **3.4 sn → ~0.1 sn**. En yüksek kazanç / en düşük davranış riski.
2. **(A+B) Payload küçültme.** Liste için `description`, `map_embed`, `seo_*`, layout JSON'ları gerekmiyor (payload'ın ~%55'i). Prod şeması doğrulanmadan açık kolon listesine geçilmemeli (repo L473-485'teki incident).
3. **(D) Fiyat anahtarı hesabı.** Motorun **kendisini değiştirmeden**, çağrı başına aynı sonucu veren bir ön-hesap (ör. dönemlerin tarih parse'ını bir kez yapmak) ancak ayrı bir onay ve kapsamlı parity testiyle yapılmalı. Fiyat mantığına dokunduğu için riskli sınıfta.
4. **(A+B) Review okuması.** SQL aggregate veya yalnız sayfa ID'leri (önceki raporun O5/O6 seçenekleri).
