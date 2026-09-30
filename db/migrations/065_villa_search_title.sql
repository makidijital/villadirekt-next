/* ===============================================================
   🔎 MIGRATION 065 — villa.search_title (Türkçe-aware arama kolonu)
   ===============================================================
   HEDEF:
     Villa adı araması DB seviyesinde Türkçe-toleranslı ve aksan-
     duyarsız olsun. Postgres `ILIKE` noktalı/noktasız i (i/ı/İ/I)
     çiftini AYNI kabul etmez → "ırmak" ile "Villa Irmak" eşleşmez.

   ÇÖZÜM:
     `title`'dan türeyen, normalize edilmiş bir `search_title`
     GENERATED STORED kolonu + pg_trgm GIN indexi. Uygulama sorguyu
     aynı kanona indirir (lib/search.ts > normalizeSearchText) ve
     `search_title ILIKE '%<needle>%'` ile sorgular → infix eşleşme
     trigram index üzerinden hızlanır.

   NORMALIZE KANONU (lib/search.ts ile BİREBİR + migration 008 slug
   translate map'iyle tutarlı):
     translate(TR fold) → lower() → whitespace sadeleştir → btrim
       ç/Ç→c ğ/Ğ→g ı→i İ→i ö/Ö→o ş/Ş→s ü/Ü→u â/Â→a î/Î→i û/Û→u
     (İ→I translate + lower() = i; noktasız 'I' → lower() = i)

   TAŞINABİLİRLİK & SÜRÜM:
     eski sağlayıcıya bağımlı DEĞİL. translate / lower / regexp_replace /
     btrim hepsi IMMUTABLE core fonksiyonlar → GENERATED STORED'da
     geçerli. pg_trgm standart contrib extension'dır (plain PostgreSQL
     / Hetzner PostgreSQL'de de mevcut; CREATE EXTENSION yetkisi ister).
     ⚠️ GENERATED ALWAYS AS ... STORED → PostgreSQL 12+ gerektirir.
        eski sağlayıcı = PG15 ✓. Hetzner: `SHOW server_version;` ile ≥12
        doğrulanmalı (modern kurulumlar 14–17). <12 ise BEFORE trigger
        varyantına geçilir (bkz. dosya sonu NOT).

   RLS / GRANT:
     `search_title` villa tablosuna EKLENEN bir KOLON. RLS satır-
     seviyesidir (kolon enumerate etmez) → mevcut public_read policy
     (is_active + deleted_at) aynen geçerli, policy güncellemesi GEREKMEZ.
     GRANT'lar tablo-seviyesi (kolon listesiz) → yeni kolon anon/
     authenticated SELECT'ine otomatik dahil. Ek GRANT GEREKMEZ.

   OTOMATİK BAKIM:
     GENERATED STORED → mevcut satırlar ALTER anında backfill edilir;
     her INSERT/UPDATE'te `title` değişince search_title yeniden
     hesaplanır. Uygulama tarafı search_title'a YAZMAZ (generated
     kolonlar manuel yazmaya izin vermez — insert/update payload'ları
     bu kolonu içermez).

   IDEMPOTENT:
     Tüm adımlar IF NOT EXISTS ile korunur → tekrar çalıştırmada no-op:
       - CREATE EXTENSION IF NOT EXISTS pg_trgm
       - ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... GENERATED ...
       - CREATE INDEX IF NOT EXISTS ...
       - ANALYZE (her koşulda güvenli)
     eski sağlayıcı ve Hetzner (aynı standart PG DDL) üzerinde birebir.

   ROLLBACK (geri alma):
     -- Sıra: önce index, sonra kolon. pg_trgm BIRAKILIR (başka
     -- index/consumer kullanıyor olabilir).
     DROP INDEX IF EXISTS villa_search_title_trgm_idx;
     ALTER TABLE villa DROP COLUMN IF EXISTS search_title;
     -- (Uygulama searchByTitle bu kolona bağımlıdır; rollback ÖNCESİ
     --  searchByTitle eski davranışa döndürülmeli veya feature kapatılmalı.)
   =============================================================== */

-- 1) pg_trgm — infix LIKE/ILIKE '%q%' hızlandırması için (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Normalize edilmiş türev kolon (GENERATED STORED, idempotent)
--    Not: coalesce ile NULL title → '' (kolon her zaman non-null string).
ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS search_title text
  GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(title, ''),
            'ıİşŞçÇğĞüÜöÖâÂîÎûÛ',
            'iIsScCgGuUoOaAiIuU'
          )
        ),
        '\s+', ' ', 'g'
      )
    )
  ) STORED;

-- 3) Trigram GIN index — infix substring araması için (idempotent)
CREATE INDEX IF NOT EXISTS villa_search_title_trgm_idx
  ON villa
  USING gin (search_title gin_trgm_ops);

-- 4) Planner istatistiklerini tazele (yeni kolon + index).
ANALYZE villa;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT title, search_title FROM villa ORDER BY created_at DESC LIMIT 5;
     -- "Villa Irmak" → search_title = 'villa irmak'

     EXPLAIN ANALYZE
       SELECT id, title FROM villa
        WHERE is_active AND deleted_at IS NULL
          AND search_title ILIKE '%irmak%';
     -- Bitmap Index Scan on villa_search_title_trgm_idx beklenir.

     -- Türkçe tolerans: hepsi aynı satırı döner
     SELECT id FROM villa WHERE search_title ILIKE '%' || 'ırmak' || '%';
     SELECT id FROM villa WHERE search_title ILIKE '%' || 'irmak' || '%';
   =============================================================== */

/* ===============================================================
   ALTERNATİF — PostgreSQL < 12 (GENERATED kolon YOKSA) TRIGGER varyantı
   ===============================================================
   Hedef PG sürümü 12'nin ALTINDAysa yukarıdaki (2) numaralı GENERATED
   bloğu ÇALIŞMAZ. O durumda kolonu düz `text` ekleyip BEFORE trigger
   ile besleyin (aynı normalize kanonu). pg_trgm index + query aynen.

   -- 2a) Düz kolon
   -- ALTER TABLE villa ADD COLUMN IF NOT EXISTS search_title text;
   --
   -- 2b) Normalize fonksiyonu (IMMUTABLE)
   -- CREATE OR REPLACE FUNCTION villa_normalize_search_title(t text)
   --   RETURNS text LANGUAGE sql IMMUTABLE AS $$
   --     SELECT btrim(regexp_replace(
   --       lower(translate(coalesce(t,''),
   --         'ıİşŞçÇğĞüÜöÖâÂîÎûÛ','iIsScCgGuUoOaAiIuU')),
   --       '\s+',' ','g'));
   --   $$;
   --
   -- 2c) Trigger
   -- CREATE OR REPLACE FUNCTION villa_search_title_biu()
   --   RETURNS trigger LANGUAGE plpgsql AS $$
   --   BEGIN
   --     NEW.search_title := villa_normalize_search_title(NEW.title);
   --     RETURN NEW;
   --   END; $$;
   -- DROP TRIGGER IF EXISTS trg_villa_search_title ON villa;
   -- CREATE TRIGGER trg_villa_search_title
   --   BEFORE INSERT OR UPDATE OF title ON villa
   --   FOR EACH ROW EXECUTE FUNCTION villa_search_title_biu();
   --
   -- 2d) Backfill (GENERATED'de gerekmez; trigger varyantında ŞART)
   -- UPDATE villa SET search_title = villa_normalize_search_title(title);
   =============================================================== */
