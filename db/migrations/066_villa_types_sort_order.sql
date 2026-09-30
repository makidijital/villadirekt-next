-- ============================================================================
-- 🛡️ 066 — VILLA TYPES SORT ORDER (admin drag-drop, public ASC)
-- ============================================================================
-- `villa_types` tablosuna `sort_order` kolonu ekler + toplu güncelleme RPC'si
-- sağlar. Referans: 006_villa_sort_order.sql (villa) deseni BİREBİR taklit.
--
-- AMAÇ:
--   Admin `/maki-admin/types` "Sıralama Modu" (dnd-kit) ile belirlenen
--   deterministik sıra; public villa tipi kullanılan tüm alanların
--   (getCachedVillaTypes → anasayfa/filtre/liste + taxonomies API) tek
--   source-of-truth'u. Alfabetik/id sıralaması yerine geçer.
--
-- ORDERING SEMANTIC:
--   .order("sort_order", { ascending: true })
--   .order("name",       { ascending: true })   -- tie-break (stabil)
--
-- BACKFILL (villa'dan FARK):
--   Villa tümünü 0 yapıyordu; burada mevcut public görünümü (name ASC)
--   KORUMAK için satırlara name ASC sırasıyla 0,1,2,… atanır → migration
--   sonrası ilk görünüm bugünküyle aynı. İDEMPOTENT: yalnız hiç sıralanmamış
--   durumda (sort_order hepsi 0) backfill yapılır; admin sonradan
--   sıraladıysa (bir satır <>0) yeniden çalıştırmada sıra KORUNUR.
--
-- INDEX:
--   sort_order üzerinde tek-kolonlu B-tree (listing query'leri ORDER BY
--   sort_order ASC ile başlar).
--
-- RPC: set_villa_type_sort_orders(p_updates jsonb)
--   Format: [{ "id": "<uuid>", "sort_order": <int> }, ...]
--   Tek transaction'da N UPDATE (villa RPC'siyle aynı imza/semantik).
--
-- GÜVENLİK / KAPSAM:
--   villa_types.id / slug / name / villa_type_relations / SEO DEĞİŞMEZ;
--   sort_order additive kolondur. RPC villa deseniyle aynı (SECURITY
--   INVOKER default) — admin gating app/route katmanında (mevcut CRUD
--   ile aynı yol).
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS set_villa_type_sort_orders(jsonb);
--   DROP INDEX IF EXISTS idx_villa_types_sort_order;
--   ALTER TABLE villa_types DROP COLUMN IF EXISTS sort_order;
-- ============================================================================

-- 1) Kolon (idempotent)
ALTER TABLE villa_types
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 2) Index (idempotent)
CREATE INDEX IF NOT EXISTS idx_villa_types_sort_order
  ON villa_types (sort_order);

COMMENT ON COLUMN villa_types.sort_order IS
  'Admin drag-drop sırası. ASC; tie-break name ASC. Backfill: name ASC (0..N-1).';

-- 3) Backfill — mevcut public sırası (name ASC) ile; yalnız hiç
--    sıralanmamışsa (idempotent guard). Admin sonradan sıraladıysa dokunmaz.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM villa_types WHERE sort_order <> 0) = 0 THEN
    WITH ordered AS (
      SELECT id, (row_number() OVER (ORDER BY name ASC) - 1) AS rn
        FROM villa_types
    )
    UPDATE villa_types vt
       SET sort_order = ordered.rn
      FROM ordered
     WHERE vt.id = ordered.id;
  END IF;
END $$;

-- 4) Toplu güncelleme RPC (villa set_villa_sort_orders BİREBİR taklidi)
CREATE OR REPLACE FUNCTION set_villa_type_sort_orders(p_updates jsonb)
RETURNS void
AS $$
DECLARE
  rec jsonb;
BEGIN
  IF p_updates IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE villa_types
       SET sort_order = (rec->>'sort_order')::integer
     WHERE id = (rec->>'id')::uuid;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_villa_type_sort_orders(jsonb) IS
  'Toplu villa_types sort_order güncellemesi. Input: [{id, sort_order}, ...]. Tek transaction.';