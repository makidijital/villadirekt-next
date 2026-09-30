# /arama — `villa_id` Index Audit'i

- Tarih: 2026-09-23 · Kod: `e2f934f`
- **Hiçbir kod, config, env, package.json, migration dosyası veya DB değişikliği yapılmadı. Commit/push yok.** Tek çıktı bu rapor.
- **Durum: AŞAMA 1'de DURULDU.** Production DB'ye bağlanılamadığı için indexlerin production'da eksik olduğu **doğrulanamadı**. Bu yüzden kurallar gereği migration dosyası **oluşturulmadı ve çalıştırılmadı**. Aşağıda (a) production'da çalıştırılacak **salt-okunur** doğrulama script'i ve (b) doğrulamadan sonra kullanılacak **taslak** migration var.

---

## 1. Production DB — erişim ve kimlik tespiti

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Çalışma ortamının `DATABASE_URL`'i | `aws-0-eu-west-1.pooler.supabase.com:5432/postgres` (Supabase session pooler) | `.env.local` (değer yazdırılmadı; dosya 2026-09-21'den beri değişmedi) |
| Kullanıcının bilgisayarından TCP bağlantısı | **ENGELLİ.** Bilgisayardaki çıkış proxy'si bağlantıyı reddetti: `X-Proxy-Error: blocked-by-allowlist` (hedef `…pooler.supabase.com:5432`, ağ izin listesinde yok). Doğrudan bağlantı: `Network is unreachable` | `curl -v telnet://…:5432` |
| Bulut çalışma alanından TCP | **ENGELLİ** — DNS çözülüyor, `:5432` ve `:6543` zaman aşımı | `/dev/tcp` |
| Production gerçekten bu DB mi? | **Doğrulanamadı.** Deploy Hetzner + Coolify üzerinde (`docs/coolify-scheduled-tasks.md:3`), production `DATABASE_URL` Coolify ortam değişkeninde. `LEGACY_PROVIDER_PURGE_REPORT.md` §7.2 bunu hâlâ açık madde olarak listeliyor. | — |

> ### ⚠️ Production'da hiçbir şey ölçülmedi
> Aşağıdaki "production" başlıklı her şey **çalıştırılmayı bekleyen script**'tir. Sayısal önce/sonra değerleri **yerel PostgreSQL 16 + sentetik veri** ile ölçüldü (bkz. §4) ve öyle etiketlendi. Production'ın index'leri, satır sayıları ve planı **bilinmiyor**.

---

## 2. Repo'daki kanıt: istenen 5 index migration'larda var mı? [KOD KANITI]

`db/migrations/**` (arşiv dahil) tarandı; `CREATE INDEX`, `PRIMARY KEY`, `UNIQUE`, `EXCLUDE` aranıyor:

| Tablo | `villa_id` ile başlayan index migrations'ta | Tablonun `CREATE TABLE`'ı migrations'ta | `/arama` bu tabloyu nasıl kullanıyor | Başka `villa_id` kullanımları |
|---|---|---|---|---|
| **`villa_images`** | **YOK** | yok (baseline'dan kalma) | `findSearchResults` embed: `WHERE e1.villa_id = villa.id ORDER BY is_cover DESC, sort_order LIMIT 1`, **her aday villa için bir kez** (correlated) | detay, admin galeri, zip (`villa-image.repository.server.ts`, `villa.repository.server.ts:999,1559,1773`) |
| **`villa_prices`** | **YOK** | yok | `findSearchResults` embed: `WHERE e2.villa_id = villa.id` → `json_agg`, **her aday villa için** | detay/rezervasyon `getVillaPrices` (`villa-price.repository.server.ts:35`), `replace_villa_prices` → `DELETE … WHERE villa_id` (`002`) |
| `villa_distances` | **YOK** | yok | **Kullanılmıyor** | detay (`villa.repository.server.ts:1344`), `replace_villa_distances` DELETE (`002`) |
| `villa_feature_relations` | **YOK** | yok | Yalnız **`WHERE feature_id IN (…)`** (`villa-feature.repository.ts:82`); `villa_id` ile sorgulanmıyor | detay/admin, `replace_villa_feature_relations` DELETE (`002`) |
| `villa_type_relations` | **YOK** | yok | Yalnız **`WHERE type_id IN (…)`** (`villa-type.repository.ts:96`); `villa_id` ile sorgulanmıyor | detay/admin, `replace_villa_type_relations` DELETE (`002`) |

**Önemli ayrım:**
- `/arama` performansını doğrudan etkileyen yalnız **`villa_images(villa_id)`** ve **`villa_prices(villa_id)`**.
- Diğer üçü `/arama`'yı hızlandırmaz. Villa detay, admin ve `replace_*` fonksiyonlarındaki `DELETE … WHERE villa_id` için faydalılar.
- `/arama`'daki junction sorguları `type_id` / `feature_id` ile filtreliyor; onlar için yararlı index `(type_id)` / `(feature_id)` olurdu. Bu çalışmanın kapsamı dışında, yalnız not edildi.

Bu tablolar migration geçmişinden eski (baseline). Production'da **baseline'dan gelen index veya PK/UNIQUE olabilir**; örneğin junction'larda `(villa_id, type_id)` PK'si `villa_id` araması için zaten yeterli olur. Bu, **yalnız production'da `pg_indexes` ile** netleşir (§3).

---

## 3. AŞAMA 1 — Production'da çalıştırılacak SALT-OKUNUR doğrulama script'i

> Nerede: Coolify container'ında `psql "$DATABASE_URL"` ya da production DB'ye erişimi olan herhangi bir `psql`. Script yalnız `SELECT` ve `EXPLAIN` içeriyor, `BEGIN READ ONLY` ile korunuyor. **8.4'teki `EXPLAIN ANALYZE` sorguyu gerçekten çalıştırır** (bir `/arama` isteği kadar CPU harcar, veri değiştirmez).

```sql
\timing on
-- 3.0 KİMLİK: production gerçekten hangi DB?
SELECT current_database() AS db, current_user, inet_server_addr() AS server_ip, inet_server_port() AS port,
       version(), pg_is_in_recovery() AS replica, current_setting('statement_timeout') AS statement_timeout;

BEGIN READ ONLY;

-- 3.1 GERÇEK SATIR SAYILARI
SELECT 'villa' t, count(*) FROM villa
UNION ALL SELECT 'villa (aktif)', count(*) FROM villa WHERE is_active = true AND deleted_at IS NULL
UNION ALL SELECT 'villa_images', count(*) FROM villa_images
UNION ALL SELECT 'villa_prices', count(*) FROM villa_prices
UNION ALL SELECT 'villa_distances', count(*) FROM villa_distances
UNION ALL SELECT 'villa_feature_relations', count(*) FROM villa_feature_relations
UNION ALL SELECT 'villa_type_relations', count(*) FROM villa_type_relations
UNION ALL SELECT 'villa_discounts', count(*) FROM villa_discounts
UNION ALL SELECT 'villa_reviews', count(*) FROM villa_reviews;

-- 3.2 MEVCUT TÜM INDEX'LER + CONSTRAINT'LER (geçerlilik dahil)
SELECT t.relname AS tablo, i.relname AS index, ix.indisprimary AS pk, ix.indisunique AS uniq,
       ix.indisvalid AS gecerli, pg_get_indexdef(ix.indexrelid) AS tanim,
       pg_size_pretty(pg_relation_size(ix.indexrelid)) AS boyut
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
WHERE t.relname IN ('villa','villa_images','villa_prices','villa_distances','villa_feature_relations',
                    'villa_type_relations','villa_discounts','villa_locations')
ORDER BY 1, 2;

-- 3.3 KARAR: her tabloda "villa_id ile BAŞLAYAN geçerli bir index" var mı?
--     (composite PK/UNIQUE dahil — örn. (villa_id, type_id) yeterlidir; duplicate açmayız)
WITH want(tbl) AS (VALUES ('villa_images'),('villa_prices'),('villa_distances'),
                          ('villa_feature_relations'),('villa_type_relations'))
SELECT w.tbl,
       bool_or(a.attname = 'villa_id' AND ix.indisvalid) AS villa_id_ile_baslayan_index_var,
       string_agg(i.relname, ', ') FILTER (WHERE a.attname = 'villa_id') AS mevcut_index
FROM want w
JOIN pg_class t ON t.relname = w.tbl AND t.relnamespace = 'public'::regnamespace
LEFT JOIN pg_index ix ON ix.indrelid = t.oid
LEFT JOIN pg_class i ON i.oid = ix.indexrelid
LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ix.indkey[0]
GROUP BY w.tbl ORDER BY w.tbl;

-- 3.4 İstatistikler: seq scan baskısı
SELECT relname, n_live_tup, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables
WHERE relname IN ('villa','villa_images','villa_prices','villa_distances','villa_feature_relations','villa_type_relations')
ORDER BY seq_tup_read DESC;

-- 3.5 /arama ANA SORGUSU — query compiler'ın ÜRETTİĞİ SQL'in BİREBİR aynısı (filtresiz, tarihli/tarihsiz aynı)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE OFF)
SELECT *, (SELECT json_build_object('name', "e0"."name") FROM "villa_locations" "e0" WHERE "e0"."id" = "villa"."location_id") AS "location",
 (SELECT coalesce(json_agg(__lim.__row), '[]'::json) FROM (SELECT json_build_object('image_url', "e1"."image_url", 'is_cover', "e1"."is_cover", 'sort_order', "e1"."sort_order") AS __row FROM "villa_images" "e1" WHERE "e1"."villa_id" = "villa"."id" ORDER BY "e1"."is_cover" DESC, "e1"."sort_order" ASC LIMIT 1) __lim) AS "villa_images",
 (SELECT coalesce(json_agg(json_build_object('price', "e2"."price", 'currency', "e2"."currency", 'start_date', "e2"."start_date", 'end_date', "e2"."end_date")), '[]'::json) FROM "villa_prices" "e2" WHERE "e2"."villa_id" = "villa"."id") AS "villa_prices",
 (SELECT coalesce(json_agg(json_build_object('start_date', "e3"."start_date", 'end_date', "e3"."end_date", 'discount_type', "e3"."discount_type", 'discount_value', "e3"."discount_value", 'currency', "e3"."currency") ORDER BY "e3"."start_date" ASC), '[]'::json) FROM "villa_discounts" "e3" WHERE "e3"."villa_id" = "villa"."id") AS "villa_discounts"
FROM "villa" WHERE "is_active" = true AND "deleted_at" IS NULL ORDER BY "sort_order" ASC, "created_at" DESC;
--  Okuma rehberi:
--   • "SubPlan 2 -> ... Seq Scan on villa_images e1 ... loops=N"  → villa_images HER VİLLA İÇİN baştan taranıyor
--   • "SubPlan 3 -> Seq Scan on villa_prices e2 ... loops=N"       → villa_prices HER VİLLA İÇİN baştan taranıyor
--   • "Rows Removed by Filter" büyük ve "Buffers: shared hit/read" SubPlan başına büyükse → darboğaz kanıtı
--   • Index Scan / Bitmap Index Scan görünüyorsa → index zaten var; migration GEREKMEZ
--   • En üst satırdaki "actual time=…..X" ve "Execution Time" → toplam gerçek süre

-- 3.6 DAVRANIŞ BASELINE'I (migration ÖNCESİ kaydet, SONRA karşılaştır)
--     Sonuç satırlarının ve gömülü dizilerin (fiyat dizisinin İÇ SIRASI dahil) tam özeti:
SELECT count(*) AS satir,
       md5(string_agg(q::text, E'\n' ORDER BY q.sort_order, q.created_at DESC, q.id)) AS sonuc_ozeti
FROM ( /* 3.5'teki SELECT — EXPLAIN satırı OLMADAN buraya */ ) q;

-- 3.7 Fiyat dizisinin sırası davranışı etkiler mi? (çakışan fiyat dönemi olan villa sayısı)
SELECT count(DISTINCT a.villa_id) AS cakisan_fiyat_donemli_villa
FROM villa_prices a JOIN villa_prices b
  ON a.villa_id = b.villa_id AND a.ctid <> b.ctid
 AND a.start_date <= b.end_date AND b.start_date <= a.end_date;
-- Kapak görseli seçimi tie'ı (aynı is_cover + sort_order'a sahip birden çok görsel):
SELECT count(*) AS tie_grubu FROM (
  SELECT villa_id, is_cover, sort_order FROM villa_images GROUP BY 1,2,3 HAVING count(*) > 1) x;

ROLLBACK;
```

**3.3'ün çıktısına göre karar:**
- `villa_id_ile_baslayan_index_var = true` olan tabloya **hiçbir şey oluşturulmaz**.
- Yalnız `false` olan tablolar için §5'teki taslaktan ilgili satır kullanılır.

---
## 4. Kanıt — yerel PostgreSQL 16, sentetik veri, 1500 villa [YEREL-ÖLÇÜM — production DEĞİL]

Production'a erişilemediği için etki ve davranış güvenliği **yerel bir kopya üzerinde** ölçüldü (bulut çalışma alanı; kullanıcının makinesine veya repo'ya hiçbir şey yazılmadı).

**Ortam:**
- Şema: `types/database.ts` + migrations'tan yaklaşık kuruldu. İndex'ler **yalnız migrations'takiler** (production'ın index'siz olduğu varsayımı).
- Veri: 1500 villa (1389 aktif), 37 500 görsel, ~30 100 fiyat satırı.
- Gerçekçi bozulmalar kasıtlı eklendi:
  - %15 fiyat satırı UPDATE edildi (tuple'lar fiziksel olarak yer değiştirdi)
  - %10 villanın fiyatları `replace_villa_prices` deseniyle silinip **ters sırada** yeniden eklendi
  - 127 villaya **çakışan fiyat dönemi** eklendi (first-match semantiği devreye girsin diye)
  - 7300 görselde `is_cover=false, sort_order=0` **tie**'ı oluşturuldu
- Uygulanan: §5'teki taslağın ilk 4 satırı, **`CREATE INDEX CONCURRENTLY`** ile. Oluşturma süresi toplam **96 ms**; 4 index'in hepsi `indisvalid = true`.

### 4.1 EXPLAIN (ANALYZE, BUFFERS) — önce / sonra (aynı DB, aynı veri)
| | ÖNCE (index yok) | SONRA (varsayılan plan) | SONRA (index scan zorlanmış) | SONRA (bitmap zorlanmış) |
|---|---|---|---|---|
| Execution Time | **3 861 ms** | **155 ms** | 148 ms | 138 ms |
| Buffers: shared hit | **1 678 432** (~12.8 GB mantıksal okuma) | **52 159** | 53 548 | 52 312 |
| Buffers: shared read | 0 (hepsi cache'ten; saf CPU) | 0 | 0 | 0 |
| `villa_images` | **Seq Scan × 1389 loop** | Bitmap Heap Scan × 1389 | Index Scan (`villa_images_villa_id_idx`) × 1389 | Bitmap × 1389 |
| `villa_prices` | **Seq Scan × 1389 loop** | Bitmap Heap Scan × 1389 | Index Scan (`villa_prices_villa_id_idx`) × 1389 | Bitmap × 1389 |
| `villa_discounts` | Index Scan (mevcut) | aynı | aynı | aynı |
| Sonuç özeti (SHA-256, tüm satırlar + gömülü diziler) | `36715d965a062349` | **`36715d965a062349`** | **`36715d965a062349`** | **`36715d965a062349`** |

**En çok buffer tüketen:**
- `villa_images`: bir önceki ölçümde 898 683 hit (tüm buffer'ların ~%65'i); her villa için ~37 475 satır filtreleniyor
- `villa_prices`: ~473 649 hit; her villa için ~29 980 satır filtreleniyor

→ **Yerel kopyada `villa_id` index eksikliği kesin darboğaz**: süre ~25× düştü, buffer ~32× azaldı. **Production'da aynı durumun geçerli olup olmadığı §3.5 çıktısıyla doğrulanmalı.**

### 4.2 Davranış eşitliği — uygulamanın tamamıyla
Aynı yerel DB'ye karşı **gerçek `/arama` kodu** (gerçek repository + query compiler + `pg` + müsaitlik RPC + fiyat motoru + sıralama + pagination + gerçek `VillaCard`/`FilterSidebar` SSR) index'ten önce ve sonra çalıştırıldı:

- **15 senaryo × 5 sayfa = 75 render**:
  - boş arama; tarihli arama; tarih + kişi / bölge (grup kökü) / tip / özellik
  - tarih + tüm filtreler; esnek ±3
  - fiyat artan, fiyat azalan, fiyat artan EUR, tarihsiz fiyat artan
  - kapasite; 14 gece fiyat (GBP); pageSize 50
  - sayfalar: 1, 2, 3, 7, 999 (son sayfaya clamp + esnek bölüm)
- **Sonuç: 75 / 75 render byte-byte AYNI HTML.** Toplam sayı, kart sırası, fiyatlar, müsaitlik, esnek sonuçlar ve sayfalama linkleri dahil.
- Aynı 75 render'ın toplam süresi: **230.1 sn → 18.4 sn** (render başına ~3.07 sn → ~0.25 sn).

### 4.3 Neden sonuç değişmez? (teknik gerekçe)
- **Index sonuç kümesini değiştirmez.** `WHERE villa_id = …` her iki planda da aynı satırları döndürür.
- **Gizli risk — sıra:** `villa_prices` embed'inde `json_agg` **ORDER BY içermiyor**, dolayısıyla dizinin iç sırası tarama sırasına bağlı. Bu önemli, çünkü `getDailyPrice` çakışan dönemlerde **ilk eşleşeni** alıyor (`lib/price.engine.ts:110`).
  - Seq Scan satırları fiziksel (TID) sırada okur.
  - Bitmap Heap Scan da TID sırasında okur.
  - B-tree Index Scan, eşit anahtarlarda PostgreSQL 12+'da heap TID'ye göre sıralı döner.
  - Yani üç plan da **aynı sırayı** üretir. Bu, çakışan dönemli 127 villa ve ters sırada yeniden eklenmiş fiyatlarla **deneyle doğrulandı** (4.1'deki özet dört planda da aynı).
- **Kapak görseli tie'ı:** Önerilen **düz** `(villa_id)` index'i satırları yine TID sırasında getiriyor ve aynı `Sort` (top-N) adımından geçiriyor → aynı girdi, aynı sonuç. Bileşik `(villa_id, is_cover DESC, sort_order)` index'i daha hızlı (yerelde 93 ms) ve yerel testte de aynı sonucu verdi. Ama tie'larda sıralamayı sort yerine index belirlediği için **teorik** bir fark riski taşıyor. Bu yüzden **önerilmedi**.
- `villa_type_relations` / `villa_feature_relations` `/arama`'da küme olarak kullanılıyor (`Set` ile AND), sıra önemsiz. `villa_distances` `/arama`'da hiç kullanılmıyor.

---

## 5. AŞAMA 2 — TASLAK migration (production doğrulanana kadar KULLANILMAYACAK)

> **Repo'ya migration dosyası EKLENMEDİ.** §3.3 çıktısı gelince yalnız `false` dönen tablolar için `db/migrations/095_villa_child_villa_id_indexes.sql` hazırlanıp önce size gösterilecek.

```sql
-- 095_villa_child_villa_id_indexes.sql  (TASLAK)
-- AMAÇ: /arama findSearchResults correlated embed'lerinde villa_images / villa_prices'ın
--       her aday villa için seq scan edilmesini önlemek. Sorgu metni, sonuç kümesi ve
--       uygulama kodu DEĞİŞMEZ.
-- KURALLAR:
--   • BEGIN/COMMIT YOK — CREATE INDEX CONCURRENTLY transaction bloğu içinde çalışamaz.
--   • Her satır AYRI çalıştırılır; yalnız §3.3'te "false" dönen tablonun satırı çalıştırılır.
--   • Veri, constraint, mevcut index DEĞİŞMEZ; DROP/ALTER/UPDATE/DELETE YOK.
--   • Session-mode bağlantı (5432) veya doğrudan bağlantı; transaction-mode pooler (6543) KULLANILMAZ.

-- /arama'yı doğrudan etkileyenler:
CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_images_villa_id_idx ON public.villa_images (villa_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_prices_villa_id_idx ON public.villa_prices (villa_id);

-- /arama'yı ETKİLEMEZ; villa detay/admin ve replace_* DELETE'leri için (isteğe bağlı, ayrı onay):
CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_distances_villa_id_idx ON public.villa_distances (villa_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_feature_relations_villa_id_idx ON public.villa_feature_relations (villa_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS villa_type_relations_villa_id_idx ON public.villa_type_relations (villa_id);

-- Sonrası doğrulama (salt-okunur): hepsi valid mi?
SELECT c.relname, i.indisvalid, i.indisready FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname LIKE '%\_villa\_id\_idx';
ANALYZE public.villa_images; ANALYZE public.villa_prices;   -- (planner istatistiği; veri değiştirmez)
```

### 5.1 İstenen 6 madde

| # | Soru | Cevap |
|---|---|---|
| 1 | Hangi index'ler eksik? | **Production için BİLİNMİYOR.** Repo migrations'ında 5'inin de tanımı yok. §3.3 kesin cevabı verir. |
| 2 | Her biri neden gerekli? | **`villa_images(villa_id)`, `villa_prices(villa_id)`:** `/arama`'daki correlated subquery her aday villa için bu tabloları `villa_id = villa.id` ile arıyor; index yoksa her villa için tüm tablo taranıyor (O(villa × satır)). **`villa_distances`, `villa_*_relations(villa_id)`:** `/arama` için gerekli değil. Detay sayfası ve `replace_*` fonksiyonlarındaki `DELETE … WHERE villa_id` için faydalı. |
| 3 | EXPLAIN kanıtı | Production: **yok** (§3.5 bekleniyor). Yerel: §4.1 — `Seq Scan on villa_images … loops=1389, Rows Removed by Filter: 37475` ve `Seq Scan on villa_prices … loops=1389, Rows Removed by Filter: 29980`. |
| 4 | Tahmini etki | Yerel 1500 villa: DB exec **3 861 → 155 ms (~25×)**, buffer **1.68 M → 52 k (~32×)**, tam sayfa render ~3.07 → ~0.25 sn. Production'daki etki satır sayısına bağlı: ~ **aktif villa × (görsel + fiyat satırı)** oranında. Index zaten varsa etki **sıfır**. |
| 5 | `CONCURRENTLY` uygun mu? | **Evet.** `SHARE UPDATE EXCLUSIVE` kilidi alır: okuma ve yazma **bloklanmaz**, yalnız aynı tabloda eşzamanlı DDL/VACUUM FULL beklenir. Tablolar küçük (yerelde 30–40 bin satır, 96 ms). **Dikkat:** (a) transaction bloğu içinde çalışmaz (dosyada BEGIN/COMMIT olmamalı); (b) başlamadan önce tablodaki açık transaction'ların bitmesini bekler; (c) yarıda kesilirse **`INVALID`** bir index bırakır — `indisvalid=false` kontrolü şart. Kurtarma için `DROP INDEX CONCURRENTLY <ad>` gerekir, bu **ayrı onay** ister; (d) `statement_timeout` (§3.0'da görünür) çok düşükse zaman aşımına düşebilir. |
| 6 | Çakışma / duplicate riski | `IF NOT EXISTS` yalnız **ada** bakar; farklı adla aynı kolonda bir index varsa **duplicate oluşur**. Bu yüzden karar **§3.3'e göre verilir**: `villa_id` ile başlayan **herhangi bir** geçerli index (composite PK/UNIQUE dahil, örn. `(villa_id, type_id)`) varsa o satır çalıştırılmaz. Mevcut hiçbir index/constraint silinmez veya değiştirilmez. Yazma maliyeti: her INSERT/UPDATE'e küçük bir index bakımı eklenir; admin'deki `replace_*` DELETE'leri ise **hızlanır**. |

---

## 6. AŞAMA 3 — Migration sonrası doğrulama planı (onay + uygulama sonrası)

1. §3.3 → ilgili tablolar artık `true`; §5 sonundaki sorgu → `indisvalid = true`.
2. §3.5 `EXPLAIN (ANALYZE, BUFFERS)` tekrar → `Seq Scan on villa_images/villa_prices` yerine `Index Scan` / `Bitmap Heap Scan`; **Execution Time** ve **Buffers** önce/sonra tablosu.
3. §3.6 `sonuc_ozeti` md5 → **önceki değerle birebir aynı olmalı** (satırlar + fiyat dizisinin iç sırası + kapak görseli). Farklıysa:
   - `/arama` davranışını etkileyebilecek tek fark fiyat dizisi sırasıdır.
   - §3.7'deki çakışan dönem sayısı 0 ise pratik etki yok; değilse durup değerlendirilir.
4. Uygulama seviyesi: canlı `/arama` için §4.2'deki senaryolarla (boş, tarih, kişi, bölge, tip, özellik, esnek, fiyat artan/azalan, sayfa 1/2/son) önce ve sonra ekran/HTML karşılaştırması. Ya da önceki turdaki parity harness'i production verisinin salt-okunur bir kopyasına karşı çalıştırılır.
5. Müsaitlik: bu index'ler `reservations` / `manual_reservations` / `external_calendar_events`'e ve RPC'ye **dokunmaz**; RPC planı değişmez (§3.5'ten ayrı `EXPLAIN` ile teyit edilebilir).

---

## 7. Özet

| Soru | Durum |
|---|---|
| Production hangi DB? | **Doğrulanamadı** — erişim `blocked-by-allowlist`. `.env.local` Supabase pooler gösteriyor; production ayarı Coolify'da. |
| 5 index production'da var mı? | **Doğrulanamadı.** Repo migrations'ında 5'inin de tanımı **yok**. |
| Production EXPLAIN | **Çalıştırılamadı** — script hazır (§3). |
| `villa_id` eksikliği darboğaz mı? | **Yerel kopyada evet, kesin** (25× süre, 32× buffer). Production için §3.5 gerekli. |
| `/arama`'yı etkileyenler | Yalnız `villa_images(villa_id)` ve `villa_prices(villa_id)`. Diğer üçü `/arama` dışı. |
| Davranış riski | Yerelde 4 plan şeklinde aynı sonuç özeti + 75/75 aynı HTML. Düz `(villa_id)` index'i bilinçli seçildi. |
| Migration | **Oluşturulmadı ve çalıştırılmadı.** Taslak §5'te; §3.3 çıktısından sonra yalnız eksikler için hazırlanacak. |
| Git | Yalnız bu rapor eklendi (`?? Claude outputs/arama-index-audit.md`). Commit/push yok. |

**Devam etmek için gereken:**
- (a) §3'teki script'in production çıktısı (özellikle 3.0, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7), **veya**
- (b) bu oturumun production DB host'una erişebilmesi. Bunun için hesabın ağ izin listesine ilgili DB host'unun eklenmesi gerekir; bu, organizasyon yöneticisinin ayarıdır.
