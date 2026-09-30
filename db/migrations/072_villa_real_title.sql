/* ===============================================================
   🔎 MIGRATION 072 — villa.real_title (admin-only, informational)
   ===============================================================
   HEDEF:
     Admin panelinde, mevcut "Villa Adı" (title) alanından TAMAMEN
     bağımsız, sadece admin panelinde bilgi amaçlı gösterilecek
     "Villanın Gerçek Adı" alanı için `villa` tablosuna nullable
     `real_title` kolonu ekler.

   KAPSAM (BİLİNÇLİ SINIRLAMA):
     - `title` kolonuna hiçbir şekilde dokunulmaz; mevcut 1595 villa
       kaydının `title` değeri DEĞİŞMEZ.
     - `real_title` slug üretiminde KULLANILMAZ (slug halen yalnız
       `title`'dan türetilir — bkz. lib/slug, generateUniqueSlug).
     - `real_title` public tarafa (mapVilla/VillaDTO, SEO title/
       description, JSON-LD, arama/search_title, VillaCard) HİÇBİR
       ŞEKİLDE aktarılmaz — sadece admin panelinde okunur/yazılır.
     - Zorunlu DEĞİL; boş bırakılabilir → NULL.
     - Backfill YOK: mevcut villa satırları bu kolon için NULL ile
       başlar, değer uydurulmaz.

   RLS / GRANT:
     `real_title` villa tablosuna EKLENEN bir KOLON. RLS satır-
     seviyesidir (kolon enumerate etmez) → mevcut policy'ler aynen
     geçerli, policy güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi
     → ek GRANT GEREKMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE villa DROP COLUMN IF EXISTS real_title;
   =============================================================== */

ALTER TABLE villa ADD COLUMN IF NOT EXISTS real_title text;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, title, real_title FROM villa ORDER BY created_at DESC LIMIT 5;
     -- real_title = NULL (mevcut kayıtlar için, backfill yapılmadı)
   =============================================================== */
