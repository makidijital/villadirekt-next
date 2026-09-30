/* ===============================================================
   🔎 MIGRATION 075 — reservations.pool_heating_* (snapshot alanları)
   ===============================================================
   HEDEF:
     Villalara opsiyonel ücretli "Havuz Isıtma" hizmeti eklemenin
     İLK ADIMI — sadece veri modeli hazırlığı. `reservations`
     tablosuna, rezervasyon anında havuz ısıtma seçilip seçilmediğini
     ve o anki (snapshot) tutarı/para birimini tutan 4 kolon ekler.
     Hesaplama/UI/servis mantığı bu migration'a DAHİL DEĞİL.

   EKLENEN KOLONLAR:
     pool_heating_selected        boolean NOT NULL DEFAULT false
       → Rezervasyon sırasında havuz ısıtma hizmeti seçildi mi?
     original_pool_heating_total  numeric NULL
       → Seçildiyse: gece sayısı × o anki gecelik havuz ısıtma
         ücretinin toplamı (villa'nın orijinal para biriminde).
         Mevcut original_cleaning_fee deseniyle uyumlu — gece sayısı
         AYRICA saklanmaz (start_date/end_date'ten türetilebilir).
     original_pool_heating_currency text NULL
       → original_pool_heating_total'ın para birimi.
     pool_heating_total_try       numeric NULL
       → original_pool_heating_total'ın TRY karşılığı (mevcut
         cleaning_fee_try / total_price_try deseniyle uyumlu).

   KAPSAM (BİLİNÇLİ SINIRLAMA):
     - Bu migration SADECE `reservations` tablosuna 4 kolon ekler.
     - Gece sayısı için AYRI bir snapshot kolonu EKLENMEZ (bilinçli
       karar — start_date/end_date'ten her zaman türetilebilir;
       cleaning fee için de böyle bir kolon yok).
     - Hesaplama mantığı (pool_heating_total = nights × nightly rate)
       bu migration'da UYGULANMAZ — sadece kolonlar hazırlanıyor.
     - lib/price.engine.ts, admin form, public UI, reservation
       servisleri, API route'ları bu adımda DEĞİŞTİRİLMEZ.
     - Mevcut original_cleaning_fee/original_cleaning_currency/
       cleaning_fee_try kolonlarına hiçbir şekilde dokunulmaz.
     - Mevcut rezervasyon kayıtları için varsayılan:
       pool_heating_selected = false, diğer 3 kolon NULL — geriye
       dönük davranış etkilenmez (yeni kolonlar henüz hiçbir
       okuma/yazma path'i tarafından kullanılmıyor).
     - Backfill YOK; DEFAULT/NULL değerler ALTER anında otomatik
       uygulanır, ek UPDATE gerekmez.

   RLS / GRANT:
     Mevcut `reservations` tablosuna EKLENEN kolonlar. RLS satır-
     seviyesidir (kolon enumerate etmez) → mevcut policy'ler aynen
     geçerli, policy güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi
     (kolon listesiz) → yeni kolonlar mevcut okuma/yazma erişimine
     otomatik dahil. Ek GRANT GEREKMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE reservations DROP COLUMN IF EXISTS pool_heating_selected;
     ALTER TABLE reservations DROP COLUMN IF EXISTS original_pool_heating_total;
     ALTER TABLE reservations DROP COLUMN IF EXISTS original_pool_heating_currency;
     ALTER TABLE reservations DROP COLUMN IF EXISTS pool_heating_total_try;
   =============================================================== */

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS pool_heating_selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_pool_heating_total numeric NULL,
  ADD COLUMN IF NOT EXISTS original_pool_heating_currency text NULL,
  ADD COLUMN IF NOT EXISTS pool_heating_total_try numeric NULL;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, reservation_no, original_cleaning_fee, cleaning_fee_try,
            pool_heating_selected, original_pool_heating_total,
            original_pool_heating_currency, pool_heating_total_try
       FROM reservations
      ORDER BY created_at DESC
      LIMIT 5;
     -- pool_heating_selected = false, diğer 3 kolon = NULL
     -- (tüm mevcut kayıtlar için, backfill yok)
   =============================================================== */
