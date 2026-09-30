/* ===============================================================
   🔎 MIGRATION 074 — villa.pool_heating_fee / pool_heating_currency
   ===============================================================
   HEDEF:
     Villalara opsiyonel ücretli "Havuz Isıtma" hizmeti eklemenin
     İLK ADIMI — sadece veri modeli hazırlığı. `villa` tablosuna
     havuz ısıtma gecelik ücretini ve para birimini tutan iki kolon
     ekler. Hesaplama/UI/servis mantığı bu migration'a DAHİL DEĞİL.

   DAVRANIŞ (gelecekteki kullanım — bu migration'da UYGULANMAZ):
     pool_heating_fee NULL veya 0  → villa havuz ısıtma hizmeti
       SUNMUYOR kabul edilecek (mevcut cleaning_fee=0 → ücretsiz
       davranışıyla tutarlı).
     pool_heating_fee > 0          → villa opsiyonel havuz ısıtma
       hizmeti sunuyor; gecelik ücret bu alanda saklanır.

   KAPSAM (BİLİNÇLİ SINIRLAMA):
     - Bu migration SADECE `villa` tablosuna 2 kolon ekler.
     - lib/price.engine.ts, admin form, public UI, reservation
       servisleri, API route'ları bu adımda DEĞİŞTİRİLMEZ.
     - Mevcut `cleaning_fee`/`cleaning_currency` kolonlarına
       hiçbir şekilde dokunulmaz.
     - Mevcut 1595 villa kaydı için varsayılan: pool_heating_fee
       NULL (hizmet yok), pool_heating_currency "TRY" — geriye
       dönük davranış etkilenmez (yeni kolonlar henüz hiçbir
       okuma/yazma path'i tarafından kullanılmıyor).
     - Backfill YOK; DEFAULT değerler ALTER anında otomatik uygulanır,
       ek UPDATE gerekmez.

   RLS / GRANT:
     Mevcut `villa` tablosuna EKLENEN kolonlar. RLS satır-seviyesidir
     (kolon enumerate etmez) → mevcut policy'ler aynen geçerli, policy
     güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi (kolon listesiz)
     → yeni kolonlar anon/authenticated SELECT'ine otomatik dahil.
     Ek GRANT GEREKMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE villa DROP COLUMN IF EXISTS pool_heating_fee;
     ALTER TABLE villa DROP COLUMN IF EXISTS pool_heating_currency;
   =============================================================== */

ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS pool_heating_fee numeric NULL,
  ADD COLUMN IF NOT EXISTS pool_heating_currency text DEFAULT 'TRY';

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, title, cleaning_fee, cleaning_currency,
            pool_heating_fee, pool_heating_currency
       FROM villa
      ORDER BY created_at DESC
      LIMIT 5;
     -- pool_heating_fee = NULL, pool_heating_currency = 'TRY'
     -- (tüm mevcut kayıtlar için, backfill yok)
   =============================================================== */
