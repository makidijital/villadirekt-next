-- ============================================================================
-- 🛡️ 006 — VILLA SORT ORDER (admin drag-drop, frontend ASC)
-- ============================================================================
-- Bu migration `villa` tablosuna `sort_order` kolonu ekler ve toplu
-- güncellemeyi tek round-trip'te yapan bir RPC sağlar.
--
-- AMAÇ:
--   Admin panelinden sürükle-bırak ile sıralanabilen, frontend villa
--   listelerinde tek source-of-truth olarak kullanılan deterministik
--   bir sıra.
--
-- ORDERING SEMANTIC:
--   .order("sort_order", { ascending: true })
--   .order("created_at",  { ascending: false })   -- tie-break (eski → yeni)
--
-- BACKWARD COMPAT:
--   Mevcut tüm satırlar sort_order=0 olarak backfill edilir. Bu sayede
--   migration'dan ÖNCEKİ davranış ile sonrasındaki davranış birebir
--   aynı: tüm villalar tie'da → created_at DESC ile sıralanır.
--   Admin tek bir villayı yeniden sıraladığında, yeni sayılar yazılır
--   ve sıra anlamlı hale gelir.
--
-- INDEX:
--   sort_order üzerinde tek-kolonlu B-tree. Tipik admin ve frontend
--   listing query'leri ORDER BY sort_order ASC ile başlar; index plan
--   seed eder.
--
-- RPC: set_villa_sort_orders(p_updates jsonb)
--   Beklenen format: [{ "id": "<uuid>", "sort_order": <int> }, ...]
--   Tek transaction'da N UPDATE çalıştırır. Application tarafındaki
--   Promise.all(N parallel calls) çözümünün round-trip dezavantajını
--   kaldırır. Validation minimal (cast); hatalı UUID'ler Postgres
--   tarafından reddedilir.
--
-- ROLLBACK:
--   DROP FUNCTION set_villa_sort_orders(jsonb);
--   DROP INDEX IF EXISTS idx_villa_sort_order;
--   ALTER TABLE villa DROP COLUMN sort_order;
-- ============================================================================

ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_villa_sort_order ON villa (sort_order);

COMMENT ON COLUMN villa.sort_order IS
  'Admin drag-drop sırası. ASC; tie-break created_at DESC. Backward-compat default=0.';

-- ----------------------------------------------------------------------------
-- BULK UPDATE RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_villa_sort_orders(p_updates jsonb)
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
    UPDATE villa
       SET sort_order = (rec->>'sort_order')::integer
     WHERE id = (rec->>'id')::uuid;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_villa_sort_orders(jsonb) IS
  'Toplu villa sort_order güncellemesi. Input: [{id, sort_order}, ...]. Tek transaction.';