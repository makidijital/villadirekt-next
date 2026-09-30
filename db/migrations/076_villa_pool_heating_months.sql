/* ===============================================================
   🔎 MIGRATION 076 — villa.pool_heating_months (sezonluk ay kısıtı)
   ===============================================================
   HEDEF:
     Mevcut "Havuz Isıtma Ücreti" (villa.pool_heating_fee/_currency,
     bkz. migration 074) özelliğine, admin'in hizmetin HANGİ
     TAKVİM AYLARINDA sunulacağını seçebilmesini sağlayan tek bir
     JSONB kolon ekler. Hesaplama/UI/servis/server-verification
     mantığı bu migration'a DAHİL DEĞİL — yalnızca veri modeli.

   KOLON:
     pool_heating_months jsonb NULL
       → Değer: 1-12 arası ay numaralarının bir JSON dizisi,
         örn. [1,2,3,4,5,9,10,11,12] (1=Ocak ... 12=Aralık).
       → NULL  = "ay kısıtlaması YOK" → 12 ay da aktif kabul edilir
         (mevcut davranışla BYTE-IDENTICAL — bugün pool_heating_fee
         girilmiş her villa zaten yıl boyu ısıtma sunuyor).
       → []    = yazılabilir ama admin formu normalde üretmez.
       → [n,...] = yalnızca listelenen aylarda aktif.

   NEDEN JSONB (text[]/smallint[] DEĞİL):
     Bu projede `lib/db/pg-array-columns.ts` içinde AÇIKÇA
     allowlist'e eklenmemiş her JS dizisi/objesi query-compiler
     tarafından varsayılan olarak jsonb serialize edilir. Gerçek
     bir Postgres array tipi seçmek o allowlist dosyasına da
     dokunmayı gerektirirdi. JSONB seçilerek mevcut
     `villa.bedroom_layout`/`villa.bathroom_layout` (migration 047)
     ve `villa.youtube_videos` (migration 033) ile AYNI, zaten
     var olan varsayılan yol kullanılıyor — ek dosya değişikliği
     gerekmiyor.

   KAPSAM (BİLİNÇLİ SINIRLAMA):
     - Bu migration SADECE `villa` tablosuna 1 kolon ekler.
     - `reservations` tablosuna YENİ KOLON EKLENMEZ — hangi
       gecelerin ısıtmalı olduğu ayrıca saklanmaz (migration 075
       ile aynı felsefe: "gece sayısı start_date/end_date'ten
       türetilebilir, ek snapshot kolonu gerekmez"). Sezon kuralı
       yalnız mevcut 4 snapshot kolonuna (pool_heating_selected,
       original_pool_heating_total, original_pool_heating_currency,
       pool_heating_total_try) YAZILACAK DEĞERİ etkiler, şemayı değil.
     - lib/price.engine.ts, admin form, public UI, reservation
       servisleri, API route'ları bu migration'da DEĞİŞTİRİLMEZ.
     - Mevcut pool_heating_fee/pool_heating_currency kolonlarına
       hiçbir şekilde dokunulmaz.
     - Mevcut ~1595 villa kaydı için: pool_heating_months NULL
       kalır → "ay kısıtlaması yok" → geriye dönük davranış
       BYTE-IDENTICAL etkilenmez (yeni kolon henüz hiçbir
       okuma/yazma path'i tarafından kullanılmıyor).
     - Backfill YOK; DEFAULT NULL ALTER anında otomatik uygulanır,
       ek UPDATE gerekmez.

   RLS / GRANT:
     Mevcut `villa` tablosuna EKLENEN kolon. RLS satır-seviyesidir
     (kolon enumerate etmez) → mevcut policy'ler aynen geçerli, policy
     güncellemesi GEREKMEZ. GRANT'lar tablo-seviyesi (kolon listesiz)
     → yeni kolon anon/authenticated SELECT'ine otomatik dahil.
     Ek GRANT GEREKMEZ.

   IDEMPOTENT:
     ADD COLUMN IF NOT EXISTS → tekrar çalıştırmada no-op. Bu ortamdan
     (sandbox/local VM) production Postgres'e doğrudan network erişimi
     olmadığı için canlı şema bu turda sorgulanamadı — IDEMPOTENT
     yapı, kolon zaten var olsun ya da olmasın migration'ı güvenli
     kılar.

   ROLLBACK (gerekirse):
     ALTER TABLE villa DROP COLUMN IF EXISTS pool_heating_months;
   =============================================================== */

ALTER TABLE villa
  ADD COLUMN IF NOT EXISTS pool_heating_months jsonb NULL DEFAULT NULL;

/* ===============================================================
   DOĞRULAMA (manuel):
     SELECT id, title, pool_heating_fee, pool_heating_currency,
            pool_heating_months
       FROM villa
      ORDER BY created_at DESC
      LIMIT 5;
     -- pool_heating_months = NULL (tüm mevcut kayıtlar için, backfill yok)
   =============================================================== */
