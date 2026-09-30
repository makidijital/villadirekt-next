/* ===============================================================
   🔎 MIGRATION 078 — villa.real_title_search (Türkçe-aware arama kanonu)
   ===============================================================
   HEDEF:
     `real_title` (migration 072, admin-only "Villanın Gerçek Adı")
     alanında Türkçe karakterli TEK BAŞINA kelime araması ÇALIŞMIYORDU.
     Örn. real_title = "Villa Aydoğdu" iken hem "Aydoğdu" hem "Aydogdu"
     araması `searchByTitle`'da sonuç VERMİYORDU — çünkü `.or()`
     ifadesi HER İKİ arama teriminde de `normalizeSearchText` ile aynı
     ASCII pattern'i üretiyor (`lib/search.ts`, TR-fold zaten arama
     TERİMİNE uygulanıyor) ve bunu HAM (normalize edilmemiş)
     `real_title` koluna karşı ILIKE ile karşılaştırıyordu — pattern
     ASCII, kolon Türkçe karakterli → asimetrik normalizasyon, eşleşme
     güvenilmez/başarısız. (Kök neden: read-only audit, bu migration'ın
     hazırlandığı konuşma.)

   ÇÖZÜM:
     `search_title` (migration 065) ile BİREBİR AYNI normalize
     formülünü kullanan, `real_title`'dan türeyen GENERATED STORED
     `real_title_search` kolonu + pg_trgm GIN index. `searchByTitle`
     artık `real_title` yerine bu kolonu sorgular → pattern (ASCII)
     ile kolon (ASCII) AYNI kanonda → simetrik, güvenilir eşleşme.

   NORMALIZE KANONU (search_title/migration 065 ve lib/search.ts ile
   BİREBİR — farklı bir formül İCAT EDİLMEDİ):
     translate(TR fold) → lower() → whitespace sadeleştir → btrim
       ç/Ç→c ğ/Ğ→g ı→i İ→i ö/Ö→o ş/Ş→s ü/Ü→u â/Â→a î/Î→i û/Û→u
     coalesce(real_title, '') → real_title NULL ise → '' (boş string;
     arama eşleşmesi hiç vermez, hata da vermez — search_title'daki
     coalesce(title,'') deseniyle AYNI).

   TAŞINABİLİRLİK & SÜRÜM:
     search_title ile AYNI gereksinimler — PostgreSQL 12+ (GENERATED
     ALWAYS ... STORED), pg_trgm contrib extension. Migration 065
     zaten `CREATE EXTENSION IF NOT EXISTS pg_trgm` çalıştırdı; burada
     idempotent güvenlik için tekrar eklendi (extension zaten varsa
     no-op).

   RLS / GRANT:
     villa tablosuna EKLENEN bir KOLON. RLS satır-seviyesidir (kolon
     enumerate etmez) → mevcut public_read policy aynen geçerli,
     policy güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi (kolon
     listesiz) → yeni kolon anon/authenticated SELECT'ine otomatik
     dahil. Ek GRANT GEREKMEZ. `real_title_search` yalnız WHERE/OR
     filtresinde kullanılacak, `searchByTitle`'ın `.select()`
     listesine EKLENMEYECEK → public response'a hiçbir zaman dahil
     olmaz (search_title'daki mevcut desenle birebir aynı).

   OTOMATİK BAKIM:
     GENERATED STORED → mevcut satırlar ALTER anında backfill edilir
     (real_title dolu satırlar için hesaplanır, NULL olanlar için ''
     olur); her INSERT/UPDATE'te `real_title` değişince
     `real_title_search` otomatik yeniden hesaplanır. Uygulama tarafı
     bu kolona YAZMAZ (generated kolonlar manuel yazmaya izin vermez —
     admin panelindeki "Gerçek İsmi" update payload'ları bu kolonu
     içermez, içeremez de).

   ETKİLENMEYENLER (bilinçli sınırlama — mevcut davranış KORUNUR):
     - `search_title` / `title` (public villa adı) araması DEĞİŞMEDİ,
       bu migration'la HİÇ ilişkisi yok.
     - `real_title` kolonunun kendisi DEĞİŞMEDİ — hâlâ ham metin,
       yalnız admin panelinde gösterilir/düzenlenir.
     - `real_title` NULL/boş olan villalar aramaya YENİ bir şekilde
       dahil OLMAZ: `real_title_search` de '' olur, dolu bir arama
       terimi (`needle.length > 0`) için `'' ILIKE '%x%'` asla TRUE
       olmaz — bu villalar önceki davranışla birebir aynı şekilde
       yalnızca `search_title` üzerinden bulunabilir.

   IDEMPOTENT:
     Tüm adımlar IF NOT EXISTS ile korunur → tekrar çalıştırmada no-op:
       - CREATE EXTENSION IF NOT EXISTS pg_trgm
       - ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... GENERATED ...
       - CREATE INDEX IF NOT EXISTS ...
       - ANALYZE (her koşulda güvenli)

   ROLLBACK (geri alma):
     -- Sıra: önce index, sonra kolon. pg_trgm BIRAKILIR (search_title
     -- index'i hâlâ kullanıyor).
     DROP INDEX IF EXISTS villa_real_title_search_trgm_idx;
     ALTER TABLE villa DROP COLUMN IF EXISTS real_title_search;
     -- (Uygulama searchByTitle bu kolona bağımlı hale geldiyse
     --  rollback ÖNCESİ searchByTitle eski `real_title.ilike`
     --  davranışına döndürülmeli veya real_title branch'i kapatılmalı.)
   =============================================================== */

-- 1) pg_trgm — infix LIKE/ILIKE '%q%' hızlandırması için (idempotent,
--    migration 065 zaten oluşturmuş olabilir).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Normalize edilmiş türev kolon (GENERATED STORED, idempotent).
--    search_title (migration 065) ile BİREBİR AYNI translate haritası.
--    coalesce ile NULL real_title → '' (kolon her zaman non-null string).
ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS real_title_search text
  GENERATED ALWAYS AS (
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(real_title, ''),
            'ıİşŞçÇğĞüÜöÖâÂîÎûÛ',
            'iIsScCgGuUoOaAiIuU'
          )
        ),
        '\s+', ' ', 'g'
      )
    )
  ) STORED;

-- 3) Trigram GIN index — infix substring araması için (idempotent).
CREATE INDEX IF NOT EXISTS villa_real_title_search_trgm_idx
  ON villa
  USING gin (real_title_search gin_trgm_ops);

-- 4) Planner istatistiklerini tazele (yeni kolon + index).
ANALYZE villa;

/* ===============================================================
   DOĞRULAMA (manuel, production'da migration uygulandıktan sonra):
     SELECT id, real_title, real_title_search FROM villa
      WHERE real_title IS NOT NULL AND real_title <> '' LIMIT 5;
     -- real_title = "Villa Aydoğdu" → real_title_search = "villa aydogdu"

     SELECT id, real_title FROM villa
      WHERE real_title_search ILIKE '%' || 'aydogdu' || '%';
     SELECT id, real_title FROM villa
      WHERE real_title_search ILIKE '%' || 'dogdu' || '%';
     -- İkisi de "Villa Aydoğdu" satırını döner (Aydoğdu/Aydogdu/
        Doğdu/Dogdu hepsi normalizeSearchText ile aynı needle'a
        foldlanır — bkz. lib/search.ts).

     -- real_title NULL olan villalar etkilenmedi mi:
     SELECT id, real_title, real_title_search FROM villa
      WHERE real_title IS NULL LIMIT 5;
     -- real_title_search = '' beklenir, arama eşleşmesi vermez.
   =============================================================== */
