-- ============================================================================
-- 🛡️ ATOMIC REPLACE-ALL HELPERS
-- ============================================================================
-- Bu migration villa pricing/relation tablolarındaki delete-then-insert
-- pattern'ini tek atomik PL/pgSQL fonksiyonu altına alır. Application
-- katmanında "DELETE başarılı + INSERT fail" ara durumu artık imkansız;
-- fail olursa transaction otomatik rollback olur, eski data aynen kalır.
--
-- ATOMICITY:
--   Her fonksiyon body'si tek transaction içinde çalışır. Herhangi bir
--   step'te exception oluşursa Postgres transaction'ı rollback eder ve
--   tablo başlangıçtaki durumuna döner.
--
-- CONCURRENT REPLACE SAFETY:
--   pg_advisory_xact_lock(hashtext('<table>:' || villa_id)) ile aynı
--   villa için iki paralel replace operasyonu serileştirilir. Farklı
--   villa'lar paralel çalışmaya devam eder (fine-grained locking).
--   Lock transaction sonunda otomatik bırakılır.
--
-- REPLACE-ALL SEMANTIC:
--   Mevcut application-level davranış birebir korundu — "tüm eski
--   kayıtları sil, payload'daki yenileri yaz". Yeni rows[] boş ise
--   sadece DELETE çalışır (tablo o villa için boşalır).
--
-- BACKWARD COMPATIBILITY:
--   Service contract aynı (villaId + payload). Fonksiyonlar void
--   döndürür; db.rpc() çağrısı error nesnesi ile fail eder ve
--   mevcut error handling pattern'i çalışmaya devam eder.
-- ============================================================================


-- ============================================================================
-- 1) replace_villa_prices(villa_id, prices_jsonb)
-- ============================================================================
-- prices payload: jsonb array of objects
--   [{ "start_date": "2026-06-01", "end_date": "2026-06-30",
--      "price": 1500, "currency": "TRY" }, ...]
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_prices(
  p_villa_id uuid,
  p_prices   jsonb
) RETURNS void
AS $$
BEGIN
  -- Aynı villa için concurrent replace operasyonlarını serileştir.
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_prices:' || p_villa_id::text)
  );

  DELETE FROM villa_prices WHERE villa_id = p_villa_id;

  IF p_prices IS NOT NULL
     AND jsonb_typeof(p_prices) = 'array'
     AND jsonb_array_length(p_prices) > 0
  THEN
    INSERT INTO villa_prices (villa_id, start_date, end_date, price, currency)
    SELECT
      p_villa_id,
      (item->>'start_date')::date,
      (item->>'end_date')::date,
      (item->>'price')::numeric,
      COALESCE(NULLIF(item->>'currency', ''), 'TRY')
    FROM jsonb_array_elements(p_prices) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2) replace_villa_distances(villa_id, distances_jsonb)
-- ============================================================================
-- distances payload: jsonb array of { "title", "distance" }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_distances(
  p_villa_id  uuid,
  p_distances jsonb
) RETURNS void
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_distances:' || p_villa_id::text)
  );

  DELETE FROM villa_distances WHERE villa_id = p_villa_id;

  IF p_distances IS NOT NULL
     AND jsonb_typeof(p_distances) = 'array'
     AND jsonb_array_length(p_distances) > 0
  THEN
    INSERT INTO villa_distances (villa_id, title, distance)
    SELECT
      p_villa_id,
      item->>'title',
      item->>'distance'
    FROM jsonb_array_elements(p_distances) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3) replace_villa_type_relations(villa_id, type_ids_uuid_array)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_type_relations(
  p_villa_id uuid,
  p_type_ids uuid[]
) RETURNS void
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_type_relations:' || p_villa_id::text)
  );

  DELETE FROM villa_type_relations WHERE villa_id = p_villa_id;

  IF p_type_ids IS NOT NULL AND array_length(p_type_ids, 1) > 0 THEN
    INSERT INTO villa_type_relations (villa_id, type_id)
    SELECT p_villa_id, t FROM unnest(p_type_ids) AS t;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4) replace_villa_feature_relations(villa_id, feature_ids_uuid_array)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_feature_relations(
  p_villa_id    uuid,
  p_feature_ids uuid[]
) RETURNS void
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_feature_relations:' || p_villa_id::text)
  );

  DELETE FROM villa_feature_relations WHERE villa_id = p_villa_id;

  IF p_feature_ids IS NOT NULL AND array_length(p_feature_ids, 1) > 0 THEN
    INSERT INTO villa_feature_relations (villa_id, feature_id)
    SELECT p_villa_id, f FROM unnest(p_feature_ids) AS f;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5) replace_villa_rule_relations(villa_id, rule_ids_uuid_array)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_rule_relations(
  p_villa_id uuid,
  p_rule_ids uuid[]
) RETURNS void
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_rule_relations:' || p_villa_id::text)
  );

  DELETE FROM villa_rule_relations WHERE villa_id = p_villa_id;

  IF p_rule_ids IS NOT NULL AND array_length(p_rule_ids, 1) > 0 THEN
    INSERT INTO villa_rule_relations (villa_id, rule_id)
    SELECT p_villa_id, r FROM unnest(p_rule_ids) AS r;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6) replace_villa_price_include_relations(villa_id, include_ids_uuid_array)
-- ============================================================================
-- ⚠️ Relation kolonu adı "include_id" (mevcut application kodu ile aynı).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_price_include_relations(
  p_villa_id    uuid,
  p_include_ids uuid[]
) RETURNS void
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_price_include_relations:' || p_villa_id::text)
  );

  DELETE FROM villa_price_include_relations WHERE villa_id = p_villa_id;

  IF p_include_ids IS NOT NULL AND array_length(p_include_ids, 1) > 0 THEN
    INSERT INTO villa_price_include_relations (villa_id, include_id)
    SELECT p_villa_id, i FROM unnest(p_include_ids) AS i;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- ROLLBACK NOTU
-- ============================================================================
-- Bu migration'ı geri almak için:
--   DROP FUNCTION IF EXISTS public.replace_villa_prices(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.replace_villa_distances(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.replace_villa_type_relations(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.replace_villa_feature_relations(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.replace_villa_rule_relations(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.replace_villa_price_include_relations(uuid, uuid[]);
-- Service tarafı drop sonrası RPC bulamayacağı için rollback öncesi
-- service çağrılarını eski delete+insert pattern'ine geri çevir.
-- ============================================================================
