/* ===============================================================
   🔎 MIGRATION 073 — villa.pool_sheltered (Korunaklı Havuz)
   ===============================================================
   HEDEF:
     Public villa detay sayfasındaki havuz başlığını dinamikleştirmek
     için `villa` tablosuna `pool_sheltered` boolean kolonu ekler.
     Admin panelinde "Korunaklı Havuz" checkbox'ı bu kolonu okur/yazar.

   DAVRANIŞ (public villa detay — sadece "Yüzme havuzu" başlığı):
     pool_type = "ozel" AND pool_sheltered = true  → "Özel Korunaklı Havuz"
     pool_type = "ozel" AND pool_sheltered = false → "Özel Havuz"
     pool_type = "ortak"                            → "Ortak Havuz"
     (pool_type = "yok" → havuz kartı zaten render edilmiyor, mevcut
      davranış aynen korunur.)

   KAPSAM (BİLİNÇLİ SINIRLAMA):
     - `pool_type`, `pool_depth/width/length`, `indoor_pool*`,
       `child_pool*` kolonlarına hiçbir şekilde dokunulmaz.
     - Mevcut villa kayıtları için varsayılan `false` — geriye dönük
       davranış (mevcut "Özel Korunaklı Havuz" sabit metni yerine artık
       "Özel Havuz" görünecek olması) BİLEREK kabul edilir; admin,
       ilgili villalarda checkbox'ı işaretleyerek eski metni geri
       getirebilir.
     - Backfill YOK; NOT NULL DEFAULT false ile tüm mevcut satırlar
       otomatik `false` alır (ALTER anında, ek UPDATE gerekmez).

   RLS / GRANT:
     `pool_sheltered` `villa` tablosuna EKLENEN bir KOLON. RLS satır-
     seviyesidir (kolon enumerate etmez) → mevcut policy'ler aynen
     geçerli, policy güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi
     (kolon listesiz) → yeni kolon anon/authenticated SELECT'ine
     otomatik dahil. Ek GRANT GEREKMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE villa DROP COLUMN IF EXISTS pool_sheltered;
   =============================================================== */

ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS pool_sheltered boolean NOT NULL DEFAULT false;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, title, pool_type, pool_sheltered
       FROM villa
      ORDER BY created_at DESC
      LIMIT 5;
     -- pool_sheltered = false (tüm mevcut kayıtlar için, backfill yok)
   =============================================================== */
