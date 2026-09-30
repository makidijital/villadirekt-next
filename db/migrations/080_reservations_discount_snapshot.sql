/* ===============================================================
   🔎 MIGRATION 080 — reservations.discount_* (snapshot alanları)
   ===============================================================
   HEDEF:
     Villa gecelik indirim/özel fiyat katmanının (villa_discounts,
     migration 079) rezervasyon anında UYGULANDIYSA, hangi indirimin
     uygulandığını `reservations` satırına DONDURMAK (snapshot) için
     6 kolon ekler. Hesaplama/server-authoritative enforcement/route/
     payload mantığı bu migration'a DAHİL DEĞİL — SADECE veri modeli.

   NEDEN GEREKLİ (immutability):
     Admin daha sonra villa_discounts'taki bir indirimi değiştirir/
     silerse, zaten OLUŞTURULMUŞ bir rezervasyonun fiyatı bundan
     ETKİLENMEMELİ. Bu garanti aslında server'ın nihai sayıyı INSERT
     anında MEVCUT finansal kolonlara yazmasıyla sağlanır (villa_
     discounts bir daha asla okunmaz) — bu migration o garantiyi
     DEĞİŞTİRMEZ. Bu kolonlar yalnız İZLENEBİLİRLİK/GÖRÜNÜRLÜK
     içindir (admin detayında "bu rezervasyona X indirimi uygulandı"
     gösterebilmek için).

   EKLENEN KOLONLAR:
     discount_applied             boolean NOT NULL DEFAULT false
       → Rezervasyon anında bir villa_discounts kaydı (percent veya
         fixed) konaklamaya uygulandı mı?
     discount_type                text NULL
       → Uygulandıysa: 'percent' | 'fixed' (villa_discounts.discount_type
         ile aynı sözlük). Uygulanmadıysa NULL.
     discount_value               numeric NULL
       → Uygulandıysa: admin'in villa_discounts'a girdiği ham değer
         (percent için yüzde sayısı, fixed için gecelik özel fiyat),
         indirimin KENDİ para biriminde (villa_discounts.currency).
     discount_currency            text NULL
       → discount_value'nun para birimi. percent tipinde villa_discounts
         kuralı gereği zaten NULL olabilir (bkz. migration 079).
     original_stay_total_try      numeric NULL
       → Konaklamanın (yalnız stay — temizlik/havuz ısıtma/depozito
         HARİÇ) İNDİRİMSİZ TRY toplamı. "İndirim öncesi" gösterimi
         için (örn. üstü çizili fiyat).
     stay_discount_amount_try     numeric NULL
       → original_stay_total_try ile indirimli stay TRY toplamı
         arasındaki fark (TRY). Bilgi amaçlı; "fixed" tipte normal
         fiyattan YÜKSEK bir özel fiyat durumunda negatif olabilir
         (villa_discounts'ın kendi kuralı gereği bu geçerli bir
         durumdur — bkz. migration 079 / price.engine.ts fixed davranışı).

   KAPSAM (BİLİNÇLİ SINIRLAMA — pool heating (migration 075) ile
   BİREBİR AYNI desen):
     - Bu migration SADECE `reservations` tablosuna 6 kolon ekler.
     - Ayrı bir "final_stay_total_try" / "discounted_stay_total_try"
       kolonu EKLENMEZ (bilinçli karar) — indirimli stay tutarı zaten
       mevcut `total_price_try` (ve varsa cleaning/pool-heating'in
       çıkarılmasıyla) içinden türetilebilir; gereksiz duplicate
       finansal alan istenmiyor.
     - Gece sayısı için ayrı bir kolon EKLENMEZ (start_date/end_date'ten
       türetilebilir — cleaning/pool-heating kolonlarıyla aynı desen).
     - Hesaplama mantığı (server-authoritative discount snapshot'ın
       NASIL hesaplanacağı), route.ts override'ı, payload-create.ts
       INSERT enumeration'ı bu migration'da UYGULANMAZ — sadece
       kolonlar hazırlanıyor.
     - lib/price.engine.ts, villa_prices, villa_discounts,
       PricingCalendarCanvas.tsx, admin/public UI, reservation
       servisleri, API route'ları bu adımda DEĞİŞTİRİLMEZ.
     - Mevcut hiçbir finansal kolona (total_price, total_price_try,
       original_price, original_cleaning_fee, cleaning_fee_try,
       pool_heating_* vb.) dokunulmaz.
     - Mevcut rezervasyon kayıtları için varsayılan:
       discount_applied = false, diğer 5 kolon NULL — geriye dönük
       davranış etkilenmez (yeni kolonlar henüz hiçbir okuma/yazma
       path'i tarafından kullanılmıyor).
     - Backfill YOK; DEFAULT/NULL değerler ALTER anında otomatik
       uygulanır, ek UPDATE gerekmez.
     - Gereksiz CHECK constraint EKLENMEDİ (örn. "discount_applied
       false iken diğer kolonlar NULL olmalı" gibi bir kural bilinçli
       olarak eklenmedi — ileride server tarafında yazılacak insert
       akışını gereksiz yere kırma riski taşır; bu adımın amacı
       sadece güvenli snapshot kolonlarını eklemek).

   RLS / GRANT:
     Native PostgreSQL mimarisi (migration 068/070/071/079 CANON) —
     RLS/POLICY/GRANT YOK, anon/authenticated/service_role rolleri
     hedef Hetzner PostgreSQL'de MEVCUT DEĞİL. Yetki uygulama
     katmanında (server-only repository). Mevcut `reservations`
     tablosuna EKLENEN kolonlar mevcut erişim modelini DEĞİŞTİRMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE reservations DROP COLUMN IF EXISTS discount_applied;
     ALTER TABLE reservations DROP COLUMN IF EXISTS discount_type;
     ALTER TABLE reservations DROP COLUMN IF EXISTS discount_value;
     ALTER TABLE reservations DROP COLUMN IF EXISTS discount_currency;
     ALTER TABLE reservations DROP COLUMN IF EXISTS original_stay_total_try;
     ALTER TABLE reservations DROP COLUMN IF EXISTS stay_discount_amount_try;
   =============================================================== */

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS discount_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_type text NULL,
  ADD COLUMN IF NOT EXISTS discount_value numeric NULL,
  ADD COLUMN IF NOT EXISTS discount_currency text NULL,
  ADD COLUMN IF NOT EXISTS original_stay_total_try numeric NULL,
  ADD COLUMN IF NOT EXISTS stay_discount_amount_try numeric NULL;

COMMENT ON COLUMN reservations.discount_applied IS
  'Rezervasyon anında villa_discounts üzerinden bir indirim/özel fiyat konaklamaya uygulandı mı (snapshot). Sadece izlenebilirlik; hesaplama/enforcement bu kolona bağlı DEĞİLDİR.';
COMMENT ON COLUMN reservations.discount_type IS
  'Uygulanan indirimin tipi: percent | fixed (villa_discounts.discount_type ile aynı sözlük). discount_applied=false ise NULL.';
COMMENT ON COLUMN reservations.discount_value IS
  'Uygulanan indirimin ham değeri, kendi para biriminde (percent: yüzde sayısı, fixed: gecelik özel fiyat). discount_applied=false ise NULL.';
COMMENT ON COLUMN reservations.discount_currency IS
  'discount_value için para birimi (villa_discounts.currency ile aynı). percent tipte NULL olabilir.';
COMMENT ON COLUMN reservations.original_stay_total_try IS
  'Yalnız konaklamanın (stay) indirim UYGULANMADAN ÖNCEKİ TRY toplamı — temizlik/havuz ısıtma/depozito HARİÇ. Gösterim amaçlı (örn. üstü çizili fiyat).';
COMMENT ON COLUMN reservations.stay_discount_amount_try IS
  'original_stay_total_try ile indirim uygulanmış stay TRY toplamı arasındaki fark. fixed tipte normal fiyattan yüksek özel fiyat durumunda negatif olabilir.';

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, reservation_no, total_price_try,
            discount_applied, discount_type, discount_value,
            discount_currency, original_stay_total_try,
            stay_discount_amount_try
       FROM reservations
      ORDER BY created_at DESC
      LIMIT 5;
     -- discount_applied = false, diğer 5 kolon = NULL
     -- (tüm mevcut kayıtlar için, backfill yok)
   =============================================================== */
