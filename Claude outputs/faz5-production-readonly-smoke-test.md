# FAZ 5 — Production READ-ONLY Smoke Test (senin çalıştırman için)

Bu dosya sadece **SELECT** (okuma) sorguları içerir. Hiçbir INSERT/UPDATE/DELETE
yoktur. Tüm sorgular ek güvenlik için `BEGIN TRANSACTION READ ONLY;` bloğu
içine alınmıştır — bu sayede yanlışlıkla bir yazma komutu çalıştırılsa bile
PostgreSQL bunu reddeder (`ERROR: cannot execute ... in a read-only transaction`).

Tüm tablo/kolon adları repodaki gerçek migration dosyalarından doğrulanmıştır:
`db/migrations/079_villa_discounts.sql`, `db/migrations/080_reservations_discount_snapshot.sql`,
`types/database.ts`.

---

## A) SQL — production PostgreSQL'de çalıştır (psql / pgAdmin / DBeaver vb.)

Aşağıdaki bloğu **tek seferde** kopyalayıp production DB bağlantında çalıştırabilirsin.
Her sorgu kendi sonuç setini ayrı ayrı döndürür.

```sql
BEGIN TRANSACTION READ ONLY;

-- ============================================================
-- 1) Migration 080'in 6 kolonu gerçekten mevcut mu?
--    Beklenen: 6 satır (discount_applied, discount_type,
--    discount_value, discount_currency, original_stay_total_try,
--    stay_discount_amount_try)
-- ============================================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'reservations'
  AND column_name IN (
    'discount_applied',
    'discount_type',
    'discount_value',
    'discount_currency',
    'original_stay_total_try',
    'stay_discount_amount_try'
  )
ORDER BY column_name;

-- ============================================================
-- 2) villa_discounts tablosunda kayıt var mı? Genel özet.
-- ============================================================
SELECT
  count(*)                                      AS toplam_kayit,
  count(*) FILTER (WHERE discount_type='percent') AS percent_sayisi,
  count(*) FILTER (WHERE discount_type='fixed')   AS fixed_sayisi,
  min(start_date)                               AS en_erken_baslangic,
  max(end_date)                                 AS en_gec_bitis
FROM public.villa_discounts;

-- ============================================================
-- 3) Mevcut bir PERCENT discount örneği (villa başlığıyla)
--    Sonuç boşsa: production'da henüz percent discount girilmemiş demektir.
-- ============================================================
SELECT
  vd.id, vd.villa_id, v.title AS villa_title,
  vd.start_date, vd.end_date,
  vd.discount_type, vd.discount_value, vd.currency,
  vd.created_at
FROM public.villa_discounts vd
JOIN public.villa v ON v.id = vd.villa_id
WHERE vd.discount_type = 'percent'
ORDER BY vd.created_at DESC
LIMIT 5;

-- ============================================================
-- 4) Mevcut bir FIXED (özel gecelik fiyat) discount örneği
--    Sonuç boşsa: production'da henüz fixed discount girilmemiş demektir.
-- ============================================================
SELECT
  vd.id, vd.villa_id, v.title AS villa_title,
  vd.start_date, vd.end_date,
  vd.discount_type, vd.discount_value, vd.currency,
  vd.created_at
FROM public.villa_discounts vd
JOIN public.villa v ON v.id = vd.villa_id
WHERE vd.discount_type = 'fixed'
ORDER BY vd.created_at DESC
LIMIT 5;

-- ============================================================
-- 5a) reservations tablosunda discount snapshot kolonları GERÇEKTEN
--     kullanılıyor mu? İndirim uygulanmış (varsa) son 10 rezervasyon.
--     Sonuç boşsa: Faz 3/4 deploy sonrası henüz indirimli bir
--     rezervasyon oluşturulmamış demektir (bu bir hata değildir).
-- ============================================================
SELECT
  id, reservation_no, villa_id, start_date, end_date,
  total_price_try,
  discount_applied, discount_type, discount_value, discount_currency,
  original_stay_total_try, stay_discount_amount_try,
  created_at
FROM reservations
WHERE discount_applied = true
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================
-- 5b) Genel kontrol: en son 5 rezervasyonda 6 kolon da SELECT
--     edilebiliyor mu (var olmayan kolon olsa sorgu zaten HATA verir).
--     İndirimsiz eski kayıtlarda discount_applied=false, diğer 5
--     alan NULL beklenir (migration'ın no-backfill davranışı).
-- ============================================================
SELECT
  id, reservation_no, created_at,
  discount_applied, discount_type, discount_value,
  discount_currency, original_stay_total_try, stay_discount_amount_try
FROM reservations
ORDER BY created_at DESC
LIMIT 5;

ROLLBACK;
```

`ROLLBACK` ile bitiyor çünkü zaten hiçbir şey yazılmadı — geri alınacak bir
değişiklik yok, sadece transaction'ı temiz kapatıyor.

---

## B) Deployment / commit doğrulama (SQL değil — GET / dashboard)

Bu adım için repoda gerçekten var olan tek read-only sinyal `app/api/health/route.ts`
dosyasıdır. Bu endpoint git commit SHA döndürmez (sadece süreç bilgisini verir),
bu yüzden **tam** commit doğrulaması için Vercel panelini kullanmak gerekiyor.
İkisini birlikte öneriyorum:

1. **Vercel Dashboard → Deployments → Production** sekmesinde en üstteki
   (production'a aktif) deployment'ın commit hash'inin şu olduğunu doğrula:

   ```
   ab6886ca939d625cabb444835cf862b8b3b0d716
   feat: persist reservation discount snapshots
   ```

   Bu benim yerel repoda doğruladığım `HEAD` = `origin/main` commit'i (Faz 4 çalışması).

2. (Ek sinyal, opsiyonel) Production URL'ine tarayıcıdan veya `curl` ile GET at:

   ```
   curl -s https://<PRODUCTION_DOMAIN>/api/health
   ```

   Dönen `serverStartTime` alanının, Vercel'de gördüğün son production deploy
   zamanına yakın/sonrasında olması beklenir (sürecin gerçekten yeniden
   başlatıldığını gösterir — stale bundle çalışmadığının dolaylı kanıtı).
   Bu endpoint tamamen read-only'dir: hiçbir DB sorgusu yapmaz, sadece process
   bilgisini döner (dosyanın kendi doc-comment'inde de belirtildiği gibi).

---

## Özet — hangi soru hangi adımla cevaplanıyor

| Soru | Nasıl |
|---|---|
| 1. Migration 080'in 6 kolonu mevcut mu? | SQL sorgu 1 |
| 2. villa_discounts'ta kayıt var mı? | SQL sorgu 2 |
| 3. Örnek percent discount kaydı | SQL sorgu 3 |
| 4. Örnek fixed discount kaydı | SQL sorgu 4 |
| 5. reservations'ta snapshot kolonları gerçekten dolduruluyor mu? | SQL sorgu 5a/5b |
| 6. Son deployment doğru commit'i mi çalıştırıyor? | Bölüm B (Vercel dashboard + opsiyonel `/api/health`) |
