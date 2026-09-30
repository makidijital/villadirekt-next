/* ===============================================================
   🔎 MIGRATION 092 — discount_collections.selected_discount_ranges
   ===============================================================
   AMAÇ (yalnız veri modeli — davranış bu migration'da DEĞİŞMEZ):
     Admin'in "İndirimli Koleksiyon" ekranında, bir villanın HANGİ
     `villa_discounts` dönemlerinin PUBLIC ana sayfada gösterileceğini
     seçebilmesi için küratörlük bilgisi.

   ❌ YAPMAZ:
     - `villa_discounts` tablosuna/kayıtlarına DOKUNMAZ. Admin'in
       "public'te gösterme" tercihi indirim kaydını ASLA silmez;
       `villa_discounts` fiyat/indirim sisteminin TEK gerçek kaynağı
       olmaya devam eder (lib/price.engine.ts, /rezervasyon,
       price-verify, admin fiyat takvimi).
     - `discount_collections_villa_unique` UNIQUE index'ine DOKUNMAZ —
       bir villa koleksiyonda YİNE tek satırdır; birden fazla kart TEK
       satırdan türetilir (bkz. lib/cache.helpers.ts).
     - `replace_villa_discounts` fonksiyonunu DEĞİŞTİRMEZ.
     - Mevcut satırları GÜNCELLEMEZ (backfill YOK).
     - Hiçbir constraint/index/RPC eklemez veya değiştirmez.

   ✅ YAPAR:
     - Tek, additive, nullable `jsonb` kolon.

   DEĞER FORMATI (uygulama katmanı sözleşmesi; DB CHECK YOK):
     [ { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }, ... ]

   ⚠️ NEDEN `villa_discounts.id` DEĞİL, TARİH ÇİFTİ:
     `replace_villa_discounts` (migration 002 deseni) DELETE + INSERT
     yapar → bir villanın indirimleri her kaydetmede YENİ `id` alır.
     `id` ile saklanan seçim bu yüzden sessizce kaybolurdu.
     `(start_date, end_date)` ise KARARLI ve villa içinde BENZERSİZDİR:
     migration 079'daki `villa_discounts_no_overlap` EXCLUDE constraint'i
     aynı villada çakışan (dolayısıyla aynı) aralığı zaten yasaklar.

   NULL / [] SEMANTİĞİ (uygulama katmanı):
     NULL → seçim yapılmamış (legacy)  → TÜM görünür dönemler
     []   → admin tüm kutuları kaldırdı → TÜM görünür dönemler
     Böylece migration sonrası mevcut kayıtlar BİREBİR eskisi gibi
     davranır ve kart hiçbir koşulda sessizce kaybolmaz ("gösterme"
     isteği zaten `is_active = false` ile karşılanıyor).

   NATIVE POSTGRESQL YETKİ MODELİ (068/070/071 CANON):
     RLS/POLICY/GRANT YOK — hedef Hetzner PostgreSQL'de anon/
     authenticated/service_role rolleri YOKTUR. Yetki uygulama
     katmanında (server-only repository + requirePermission).

   IDEMPOTENT: `ADD COLUMN IF NOT EXISTS` → tekrar çalıştırmada no-op.

   ROLLBACK (gerekirse):
     ALTER TABLE discount_collections
       DROP COLUMN IF EXISTS selected_discount_ranges;
   =============================================================== */

ALTER TABLE discount_collections
  ADD COLUMN IF NOT EXISTS selected_discount_ranges jsonb;

COMMENT ON COLUMN discount_collections.selected_discount_ranges IS
  'Public ana sayfada gösterilecek villa_discounts dönemleri (küratörlük). Format: [{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}]. NULL veya [] → tüm görünür dönemler (legacy davranış). villa_discounts.id KULLANILMAZ (replace_villa_discounts id değiştirir); tarih çifti villa içinde EXCLUDE constraint sayesinde benzersizdir.';
