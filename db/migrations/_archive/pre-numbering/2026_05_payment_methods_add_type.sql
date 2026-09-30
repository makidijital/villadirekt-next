/* ===============================================================
   🔥 MIGRATION — payment_methods.type kolonu
   ===============================================================
   Hedef:
     payment_methods tablosuna `type` kolonu ekle.
     Allowed values:
       - bank_transfer
       - credit_card
       - cash

   Backward compatibility:
     - Kolon nullable kalır (helper NULL → "bank_transfer" davranır)
     - Default değer 'bank_transfer' olarak set edilir
     - Eski kayıtlar isim eşleşmesiyle (Türkçe/İngilizce) backfill
       edilir; eşleşmeyenler NULL kalır → app tarafı bunu zaten
       bank_transfer kabul eder.

   Idempotent:
     IF NOT EXISTS / WHERE NULL koşullarıyla tekrar çalıştırılabilir.
   =============================================================== */

-- 1) Kolonu ekle (idempotent)
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS type text;

-- 2) Yeni kayıtlar için default → 'bank_transfer'
ALTER TABLE payment_methods
  ALTER COLUMN type SET DEFAULT 'bank_transfer';

-- 3) BACKFILL — isim eşleşmesi (case-insensitive)
--    Türkçe + İngilizce yaygın isimleri kapsar.

-- 3a) bank_transfer
UPDATE payment_methods
SET type = 'bank_transfer'
WHERE type IS NULL
  AND (
    name ILIKE '%havale%' OR
    name ILIKE '%eft%' OR
    name ILIKE '%transfer%' OR
    name ILIKE '%bank%' OR
    name ILIKE '%iban%'
  );

-- 3b) credit_card
UPDATE payment_methods
SET type = 'credit_card'
WHERE type IS NULL
  AND (
    name ILIKE '%kredi%' OR
    name ILIKE '%kart%' OR
    name ILIKE '%card%' OR
    name ILIKE '%credit%' OR
    name ILIKE '%visa%' OR
    name ILIKE '%master%' OR
    name ILIKE '%link%'
  );

-- 3c) cash
UPDATE payment_methods
SET type = 'cash'
WHERE type IS NULL
  AND (
    name ILIKE '%nakit%' OR
    name ILIKE '%cash%'
  );

-- 4) Allowed values constraint
--    NULL'a izin veriyoruz (helper bunu zaten bank_transfer kabul eder).
ALTER TABLE payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_type_check;

ALTER TABLE payment_methods
  ADD CONSTRAINT payment_methods_type_check
  CHECK (type IS NULL OR type IN ('bank_transfer', 'credit_card', 'cash'));

-- ==============================================================
-- KONTROL — backfill sonrası eşleşmeyen kayıtları görmek için:
--
--   SELECT id, name, type
--   FROM payment_methods
--   WHERE type IS NULL;
--
-- Çıktı varsa elle düzelt:
--
--   UPDATE payment_methods SET type = 'bank_transfer' WHERE id = '...';
-- ==============================================================
