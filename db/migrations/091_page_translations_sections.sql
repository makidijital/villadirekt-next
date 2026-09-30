-- ============================================================================
-- Migration 091 — page_translations.sections (EN/DE CMS bölüm içeriği)
-- ============================================================================
-- AMAÇ:
--   `/en/p/[slug]` ve `/de/p/[slug]` sayfalarında CMS bölümlerinin
--   (`pages.sections` JSONB: richtext | image | quote) kullanıcıya görünen
--   metinlerinin dile göre gösterilebilmesi.
--
--   Forensic audit tespiti: `page_translations` tablosunda `sections`
--   kolonu OLMADIĞI için bu içerik translation resolver zincirine hiç
--   giremiyordu ve EN/DE sayfalarda canonical Türkçe bölüm metni
--   render ediliyordu (DB_CANONICAL_LEAK).
--
--   Migration 085 / 087 ile BİREBİR AYNI desen (ikisi de mevcut bir
--   çeviri tablosuna ADDITIVE kolon eklemişti).
--
--   Bu migration'da:
--     ❌ Mevcut satır UPDATE'i / veri yazımı / backfill YOK
--     ❌ `public.pages` tablosuna DOKUNULMAZ (TR canonical
--        `pages.sections` AYNEN kalır)
--     ❌ Mevcut kolon/tip/CHECK/UNIQUE/FK değişikliği YOK
--     ❌ Mevcut `page_translations` satırları SİLİNMEZ/DEĞİŞTİRİLMEZ
--     ✅ Yalnız 1 ADDITIVE `ADD COLUMN IF NOT EXISTS`
--
-- TİP SEÇİMİ — `jsonb`:
--   Canonical kolon `public.pages.sections` migration 014:29'da
--   `JSONB NOT NULL DEFAULT '[]'::jsonb` olarak tanımlıdır. Çeviri
--   kolonu AYNI yapıyı (aynı discriminated union dizisi) taşıdığı için
--   AYNI tipi kullanır. Yeni bir section DSL / şema İCAT EDİLMEDİ.
--
-- NULLABLE — BİLİNÇLİ:
--   Canonical kolondan farklı olarak burada `NOT NULL DEFAULT '[]'`
--   KULLANILMAZ. `'[]'::jsonb` "çevirisi olmayan" ile "bilerek boş
--   bırakılmış" durumlarını ayırt edemezdi. `NULL` = "bu locale için
--   bölüm çevirisi yok" → public tarafta canonical TR bölümleri
--   gösterilir (`resolveTranslatedSections` semantiği, migration 082'deki
--   diğer çevrilebilir kolonlarla AYNI "nullable + fallback" ilkesi).
--
-- LOCALE: Tablonun mevcut `CHECK (locale IN ('tr','en','de'))` kısıtı
--   (migration 082) AYNEN geçerlidir; bu migration ona dokunmaz.
--
-- NATIVE POSTGRESQL (migration 068/071/082/083/085/087 CANON):
--   anon/authenticated/service_role rolleri YOK; RLS/GRANT/REVOKE YOK.
--
-- İDEMPOTENT: `ADD COLUMN IF NOT EXISTS` — tekrar çalıştırmak güvenli.
--   --single-transaction ile uygulanabilir.
--
-- ROLLBACK:
--   BEGIN;
--     ALTER TABLE public.page_translations DROP COLUMN IF EXISTS sections;
--   COMMIT;
--   -- `public.pages` tablosuna HİÇ dokunulmadığı için rollback'in
--   -- mevcut Türkçe bölüm içeriği üzerinde SIFIR etkisi vardır; public
--   -- taraf otomatik olarak canonical TR bölümlerine geri döner.
-- ============================================================================

BEGIN;

ALTER TABLE public.page_translations
  ADD COLUMN IF NOT EXISTS sections jsonb;

COMMENT ON COLUMN public.page_translations.sections IS
  'pages.sections çevirisi (EN/DE). Canonical ile AYNI yapı: '
  'PageSection[] (richtext|image|quote). NULL veya geçerli bölüm '
  'içermiyorsa public tarafta canonical TR pages.sections gösterilir '
  '(resolveTranslatedSections semantiği). image.path ÇEVRİLMEZ — '
  'canonical asset yolu korunur.';

COMMIT;

-- ============================================================================
-- DOĞRULAMA (deploy sonrası ELLE kontrol — salt-okunur)
-- ============================================================================
--   -- Kolon eklendi mi + hepsi NULL mı (backfill YOK)?
--   SELECT locale, (sections IS NULL) AS sections_null
--     FROM public.page_translations ORDER BY locale;
--
--   -- Canonical TR bölümler DEĞİŞMEDİ mi?
--   SELECT id, slug, jsonb_array_length(sections) AS section_count
--     FROM public.pages ORDER BY slug;
--
--   -- Kolon tipi jsonb + nullable mı?
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name   = 'page_translations'
--      AND column_name  = 'sections';
-- ============================================================================
