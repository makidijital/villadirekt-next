/* ===============================================================
   🔎 MIGRATION 079 — villa_discounts (Tarih Bazlı Gecelik İndirim — ADIM 1)
   ===============================================================
   AMAÇ (yalnız veri modeli — hesaplama/UI bu adımın kapsamı DIŞINDA):
     Villa gecelik fiyatlarının (`villa_prices`) ÜZERİNE, hesap anında
     uygulanacak BAĞIMSIZ bir indirim katmanı için veri modeli. Bu
     migration'ın YAPMADIĞI şeyler kadar YAPTIĞI şeyler de önemli:

     ❌ YAPMAZ:
       - `villa_prices` tablosuna hiçbir kolon eklemez/çıkarmaz.
       - `villa_prices` kayıtlarını update/delete etmez.
       - `replace_villa_prices` fonksiyonunu değiştirmez.
       - Fiyat hesaplama koduna (`lib/price.engine.ts`) hiçbir şekilde
         bağlanmaz — bu tablo şu an HİÇBİR sorgu tarafından okunmuyor.
       - Admin/public UI'da hiçbir alan oluşturmaz.

     ✅ YAPAR:
       - Yeni, tamamen bağımsız `villa_discounts` tablosu.
       - `villa_prices` ile BİREBİR AYNI atomic-replace deseni:
         `replace_villa_discounts(p_villa_id, p_discounts jsonb)`.
       - NATIVE POSTGRESQL YETKİ MODELİ (migration 068/070/071 CANON):
         RLS/POLICY/GRANT YOK — hedef Hetzner PostgreSQL'de anon/
         authenticated/service_role rolleri YOK, bunlara referans
         vanilla PG'de "role does not exist" hatası üretir (bu,
         production'da gerçekten yaşanan hataydı — bkz. aşağıdaki
         "RLS / GRANT" bölümü). Yetki UYGULAMA KATMANINDA: tablo
         yalnız server-only native repository'den (villa-discount.
         repository.server.ts) okunur/yazılır.

   TARİH MANTIĞI — `villa_prices` İLE BİREBİR AYNI (yeni bir kural
   İCAT EDİLMEDİ):
     `start_date`/`end_date` — KAPALI interval, İKİSİ DE DAHİL.
     Kanıt (mevcut kodda): `lib/price.engine.ts > getDailyPrice`
       → `d >= s && d <= e` (villa_prices satırı bir güne denk geliyor
          mu kontrolü — start dahil, end dahil).
       → `pricing-calendar/_types/pricing-calendar.ts` tip yorumu:
          "[start_date, end_date] kapalı interval".
     `villa_discounts.start_date`/`end_date` bu kontrolle AYNI şekilde
     yorumlanacak şekilde (ikisi de dahil) tasarlandı — indirim
     hesaplama kodu (SONRAKİ ADIM) `getDailyPrice` ile AYNI karşılaştırma
     operatörünü (`>=` / `<=`) kullanacak; bu migration'da davranışsal
     bir karşılaştırma kodu YOK, yalnız CHECK (start_date <= end_date)
     ile geçersiz (ters) aralığın DB seviyesinde engellenmesi var.

   DISCOUNT_TYPE — GELECEĞE HAZIR, YALNIZ ŞEMA (henüz hesaplama YOK):
     'percent'      → % indirim (0 < value <= 100).
     'fixed'        → sabit TL/gecelik indirim (value > 0).
     `currency` kolonu yalnız 'fixed' tipte anlamlı (percent
     currency-agnostic — hangi para biriminde olursa olsun aynı oranı
     uygular, bu yüzden 'percent' satırlarda NULL bırakılabilir).

   ÇAKIŞMA (overlap) — DB-LEVEL ENGELLENDİ (Adım 1 güvenlik güncellemesi):
     Aynı villa için tarih aralığı çakışan iki villa_discounts satırı
     DB seviyesinde EXCLUDE constraint (`villa_discounts_no_overlap`)
     ile REDDEDİLİR — `reservations_no_overlap` (migration 001) ile
     AYNI TEKNİK (EXCLUDE USING gist), ama migration 001'in check-in/
     check-out ('[)') tarih sınırı KOPYALANMADI — bunun yerine bu
     migration'ın kendi "TARİH MANTIĞI" bölümünde tespit edilen
     villa_prices semantiği (KAPALI interval, '[]', ikisi de dahil)
     kullanıldı; yeni bir tarih semantiği İCAT EDİLMEDİ. Detay: aşağıdaki
     "2) ÇAKIŞMA ENGELLEME" bölümü.

   CURRENCY/DISCOUNT_TYPE TUTARLILIĞI — DB-LEVEL ENGELLENDİ (Adım 1
   güvenlik güncellemesi):
     `villa_discounts_currency_consistency` CHECK constraint'i:
     `discount_type='fixed'` iken `currency` NULL/boş OLAMAZ;
     `discount_type='percent'` iken `currency` MUTLAKA NULL olmalı
     (percent currency-agnostic — bir currency değeri taşımasının
     hiçbir anlamı yok, karışıklığı DB seviyesinde engeller).
     `replace_villa_discounts` RPC'si currency'i bu kurala göre
     normalize eder (bkz. aşağıdaki RPC bölümü) — çağıran yanlışlıkla
     percent satıra currency göndersin, CHECK ihlali yerine sessizce
     NULL'a normalize edilir; 'fixed' satırda currency eksikse CHECK
     ihlali ile REDDEDİLİR (bilinçli, istenen davranış).

   REPLACE-ALL DESENİ — `replace_villa_prices` (migration 002) İLE
   BİREBİR AYNI:
     - `pg_advisory_xact_lock(hashtext('villa_discounts:'||villa_id))`
       ile aynı villa için concurrent replace'ler serileştirilir.
     - `DELETE ... WHERE villa_id = p_villa_id` + toplu
       `INSERT ... SELECT FROM jsonb_array_elements`.
     - `p_discounts` NULL/boş → yalnız DELETE çalışır (o villa için
       indirim tablosu boşalır) — `replace_villa_prices` ile birebir
       aynı "boş payload = tümünü temizle" semantiği.
     - SECURITY DEFINER YOK (replace_villa_prices ile aynı — invoker
       rolüyle çalışır; native runtime'da tek app rolü zaten RLS'i
       bypass ediyor, bkz. `lib/db/native.ts` doc-comment'i).

   RLS / GRANT — YOK (BİLİNÇLİ; native production hatasının düzeltmesi):
     İlk sürüm `villa_prices`'ın migration 037'deki (eski sağlayıcı dönemi) RLS/
     POLICY desenini birebir kopyalamıştı: `TO anon, authenticated` +
     `public.is_active_admin()` guard'lı policy'ler. Bu, production'da
     ("Hetzner native PostgreSQL", migration 068 native-auth cutover
     sonrası) `ERROR: role "anon" does not exist` ile REDDEDİLDİ;
     migration transaction'ı (BEGIN...COMMIT) bu yüzden ROLLBACK oldu
     ve production'da KALICI hiçbir değişiklik OLMADI.
     Düzeltme: migration 068/070/071'in kanonik native deseni izlendi
       (bkz. `db/migrations/071_settings_orphan_gap_rule.sql`: "Bu
       projede anon/authenticated/service_role rolleri YOK; RLS/GRANT/
       REVOKE YOK") — bu migration'da artık ENABLE ROW LEVEL SECURITY,
       CREATE POLICY veya GRANT/REVOKE hiçbiri YOK. `is_active_admin()`
       de referans edilmiyor (RLS policy'si olmadığı için guard'a
       gerek yok; fonksiyonun kendisi migration 037'de tanımlı kalmaya
       devam ediyor, bu migration onu DEĞİŞTİRMİYOR/silmiyor).
     Native runtime tek bir ayrıcalıklı DB rolüyle bağlanıyor (bkz.
       `lib/db/native.ts`); yetki tamamen UYGULAMA KATMANINDA: tablo
       yalnız server-only native repository'den (`import "server-only"`
       guard'lı `lib/db/villa-discount.repository.server.ts`) okunur/
       yazılır; bu repository'yi ileride çağıracak admin servis/route
       kendi admin-auth kontrolünü yapacaktır (henüz hiçbir çağıran YOK
       — Adım 1 kapsamı yalnız veri modeli).
     GÜVENLİK GEVŞETİLMEDİ: "herkese açık" hiçbir YENİ erişim yolu
       AÇILMADI — kaldırılan şey, production'da zaten VAR OLMAYAN
       rollere referans veren ve native runtime'da zaten davranışsal
       etkisi olmayan (RLS runtime'da baştan beri bypass ediliyordu)
       ölü/çalışmayan koddu.

   IDEMPOTENT: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
     EXISTS`, `DROP POLICY IF EXISTS` + recreate, `CREATE OR REPLACE
     FUNCTION` — tekrar çalıştırılabilir.

   ROLLBACK:
     DROP FUNCTION IF EXISTS public.replace_villa_discounts(uuid, jsonb);
     ALTER TABLE IF EXISTS public.villa_discounts
       DROP CONSTRAINT IF EXISTS villa_discounts_no_overlap;
     DROP TABLE IF EXISTS public.villa_discounts;
   =============================================================== */

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) TABLO
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.villa_discounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  villa_id       uuid NOT NULL REFERENCES public.villa(id) ON DELETE CASCADE,

  -- villa_prices ile BİREBİR AYNI semantik: KAPALI interval, ikisi de dahil.
  start_date     date NOT NULL,
  end_date       date NOT NULL,

  -- Gelecek için hazır şema — bu adımda yalnız veri modeli, hesaplama YOK.
  discount_type  text NOT NULL,
  discount_value numeric NOT NULL,
  currency       text,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT villa_discounts_valid_range
    CHECK (start_date <= end_date),
  CONSTRAINT villa_discounts_type_check
    CHECK (discount_type IN ('percent', 'fixed')),
  CONSTRAINT villa_discounts_value_positive
    CHECK (discount_value > 0),
  CONSTRAINT villa_discounts_percent_range
    CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CONSTRAINT villa_discounts_currency_consistency
    CHECK (
      (discount_type = 'fixed'   AND currency IS NOT NULL AND currency <> '')
      OR
      (discount_type = 'percent' AND currency IS NULL)
    )
);

COMMENT ON TABLE public.villa_discounts IS
  'Adim 1 (veri modeli): villa_prices uzerine hesap aninda uygulanacak '
  'bagimsiz indirim katmani. Tarih semantigi villa_prices ile birebir '
  'ayni (kapali interval, ikisi de dahil). HENUZ hicbir hesaplama/UI '
  'kodu bu tabloyu okumuyor.';

-- Listeleme deseni villa_prices ile aynı: villa bazlı okuma ana erişim yolu.
CREATE INDEX IF NOT EXISTS villa_discounts_villa_id_idx
  ON public.villa_discounts (villa_id);

-- Tarih aralığı sorguları (ileride "bugün için hangi indirim aktif" gibi
-- sorgular) için — villa_prices'ta ayrı bir aralık index'i yok, ama
-- villa_discounts'ta beklenen satır sayısı çok daha küçük; yine de ucuz
-- ve zararsız bir index (yalnız okuma hızlandırır, davranış değiştirmez).
CREATE INDEX IF NOT EXISTS villa_discounts_range_idx
  ON public.villa_discounts (villa_id, start_date, end_date);


-- ----------------------------------------------------------------------------
-- 2) ÇAKIŞMA ENGELLEME — DB-level EXCLUDE (`reservations_no_overlap`,
--    migration 001, İLE AYNI TEKNİK; TARİH SINIRI FARKLI — bkz. aşağı).
-- ----------------------------------------------------------------------------
-- ⚠️ KRİTİK AYRIM: migration 001'deki `reservations_no_overlap`
--   `daterange(start_date, end_date, '[)')` KULLANIR (inclusive start,
--   EXCLUSIVE end — check-in/check-out gece semantiği; "checkout =
--   next checkin" adjacent'i overlap SAYMAZ). villa_discounts BUNU
--   KULLANMAZ — yeni bir tarih semantiği İCAT ETMEMEK için, bu
--   migration'ın başındaki "TARİH MANTIĞI" bölümünde tespit edilen
--   villa_prices semantiğine (KAPALI interval, start VE end İKİSİ DE
--   DAHİL) sadık kalınır: `daterange(start_date, end_date, '[]')` —
--   üçüncü parametre '[]' (both-inclusive). Yalnız TEKNİK (EXCLUDE
--   USING gist) migration 001'den ödünç alındı; TARİH SINIRI
--   KONVANSİYONU villa_prices'tan alındı — iki farklı kaynak
--   karıştırılmadan, doğru parçalar birleştirildi.
--
--   Örnek: 10.06-20.06 ve 20.06-25.06 iki villa_discounts satırı
--   villa_prices mantığında AYNI GÜNÜ (20.06) paylaştığı için ÇAKIŞIR
--   ve bu constraint bunu REDDEDER (migration 001'deki adjacent
--   check-in/out muafiyeti villa_discounts'a UYGULANMAZ — burada
--   "20.06" gecesi için hangi indirimin geçerli olduğu belirsizleşir,
--   bu yüzden bilinçli olarak izin verilmez).
--
-- ÖN GEREKSİNİM: btree_gist (migration 001'de zaten oluşturulmuş
--   olabilir; idempotent IF NOT EXISTS ile tekrar çalıştırma zararsız).
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.villa_discounts
  DROP CONSTRAINT IF EXISTS villa_discounts_no_overlap;

ALTER TABLE public.villa_discounts
  ADD CONSTRAINT villa_discounts_no_overlap
  EXCLUDE USING gist (
    villa_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );


-- ----------------------------------------------------------------------------
-- 3) RLS / GRANT — BİLİNÇLİ OLARAK YOK (production hatasının düzeltmesi).
--    ÖNCEKİ SÜRÜM burada `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` +
--    `TO anon, authenticated` / `public.is_active_admin()` guard'lı iki
--    CREATE POLICY içeriyordu (migration 037 eski sağlayıcı dönemi deseni). Hedef
--    Hetzner PostgreSQL'de (migration 068 native-auth cutover sonrası)
--    anon/authenticated/service_role rolleri YOK → bu ifadeler
--    `ERROR: role "anon" does not exist` üretti ve migration transaction'ı
--    ROLLBACK oldu (production'da kalıcı değişiklik olmadı).
--    Düzeltme: migration 068/070/071 kanonik native deseni — RLS/POLICY/
--    GRANT/REVOKE hiçbiri YOK, `is_active_admin()` referans edilmiyor.
--    Yetki UYGULAMA KATMANINDA (bkz. yukarıdaki "RLS / GRANT" doc bölümü).
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 4) replace_villa_discounts(villa_id, discounts_jsonb)
--    `replace_villa_prices` (migration 002) ile BİREBİR AYNI desen.
-- ----------------------------------------------------------------------------
-- discounts payload: jsonb array of objects
--   [{ "start_date": "2026-06-10", "end_date": "2026-06-20",
--      "discount_type": "percent", "discount_value": 20,
--      "currency": null }, ...]
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replace_villa_discounts(
  p_villa_id   uuid,
  p_discounts  jsonb
) RETURNS void
AS $$
BEGIN
  -- Aynı villa için concurrent replace operasyonlarını serileştir
  -- (replace_villa_prices ile birebir aynı kilit anahtarı deseni,
  -- yalnız tablo adı farklı — iki tablo birbirinden bağımsız kilitlenir).
  PERFORM pg_advisory_xact_lock(
    hashtext('villa_discounts:' || p_villa_id::text)
  );

  DELETE FROM villa_discounts WHERE villa_id = p_villa_id;

  IF p_discounts IS NOT NULL
     AND jsonb_typeof(p_discounts) = 'array'
     AND jsonb_array_length(p_discounts) > 0
  THEN
    INSERT INTO villa_discounts (
      villa_id, start_date, end_date, discount_type, discount_value, currency
    )
    SELECT
      p_villa_id,
      (item->>'start_date')::date,
      (item->>'end_date')::date,
      COALESCE(NULLIF(item->>'discount_type', ''), 'percent'),
      (item->>'discount_value')::numeric,
      -- 🛡️ currency/discount_type tutarlılığı (villa_discounts_currency_
      -- consistency CHECK'i ile eşleşir): 'fixed' değilse currency HER
      -- ZAMAN NULL'a normalize edilir — çağıran yanlışlıkla percent
      -- satıra currency gönderse bile CHECK ihlali yerine sessizce
      -- doğru davranış. 'fixed' iken currency eksik/boşsa NULL kalır
      -- ve CHECK constraint bunu (bilinçli olarak) REDDEDER.
      CASE
        WHEN COALESCE(NULLIF(item->>'discount_type', ''), 'percent') = 'fixed'
          THEN NULLIF(item->>'currency', '')
        ELSE NULL
      END
    FROM jsonb_array_elements(p_discounts) AS item;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;

/* ===============================================================
   DOĞRULAMA (manuel, migration uygulandıktan sonra):
     -- Tablo + kısıtlar:
     SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_name = 'villa_discounts' ORDER BY ordinal_position;

     -- RLS policy'leri — HİÇBİRİ beklenmiyor (bilinçli olarak yok, bkz. yukarı):
     SELECT policyname, cmd, roles FROM pg_policies
      WHERE tablename = 'villa_discounts';
     -- Beklenen: 0 satır. `relrowsecurity` de false olmalı:
     SELECT relrowsecurity FROM pg_class WHERE relname = 'villa_discounts';
     -- Beklenen: false

     -- RPC round-trip (örnek — gerçek bir villa_id ile):
     SELECT public.replace_villa_discounts(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '[{"start_date":"2026-06-10","end_date":"2026-06-20",
          "discount_type":"percent","discount_value":20}]'::jsonb
     );
     SELECT * FROM villa_discounts
      WHERE villa_id = '00000000-0000-0000-0000-000000000000';

     -- Çakışma reddi testi (overlap → exclusion_violation beklenir):
     SELECT public.replace_villa_discounts(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '[{"start_date":"2026-06-10","end_date":"2026-06-20",
          "discount_type":"percent","discount_value":20},
         {"start_date":"2026-06-15","end_date":"2026-06-25",
          "discount_type":"percent","discount_value":10}]'::jsonb
     );
     -- Beklenen: ERROR  conflicting key value violates exclusion
     -- constraint "villa_discounts_no_overlap"

     -- Currency tutarlılık reddi testi (fixed + currency yok → CHECK ihlali):
     SELECT public.replace_villa_discounts(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '[{"start_date":"2026-07-01","end_date":"2026-07-05",
          "discount_type":"fixed","discount_value":2000}]'::jsonb
     );
     -- Beklenen: ERROR  new row for relation "villa_discounts" violates
     -- check constraint "villa_discounts_currency_consistency"

     -- Currency normalize testi (percent + currency gönderilse bile
     -- sessizce NULL'a normalize edilmeli, CHECK ihlali OLMAMALI):
     SELECT public.replace_villa_discounts(
       '00000000-0000-0000-0000-000000000000'::uuid,
       '[{"start_date":"2026-08-01","end_date":"2026-08-05",
          "discount_type":"percent","discount_value":15,
          "currency":"TRY"}]'::jsonb
     );
     SELECT currency FROM villa_discounts
      WHERE villa_id = '00000000-0000-0000-0000-000000000000'
        AND start_date = '2026-08-01';
     -- Beklenen: currency = NULL (RPC normalize etti, hata YOK)

     -- villa_prices'a DOKUNULMADIĞININ doğrulaması:
     SELECT count(*) FROM villa_prices;  -- migration ÖNCESİ/SONRASI AYNI olmalı
   =============================================================== */
