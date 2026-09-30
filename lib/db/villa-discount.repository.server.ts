import "server-only";

/* 🛡️ NATIVE-ONLY — bu repository baştan native provider ile yazıldı,
   eski sağlayıcı-js bağımlılığı hiç eklenmedi (mevcut mimarideki "NATIVE
   CUTOVER" ilkesiyle tutarlı — bkz. lib/db/villa-price.repository.server.ts,
   lib/db/discount.repository.ts). `dbAdminNative` = `dbNative` (native
   runtime'da tek app rolü; anon/service-role ayrımı yok, RLS bypass —
   bkz. lib/db/native.ts doc-comment'i). */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";
import type { VillaDiscountRow } from "@/types/database";

/* ===============================================================
   🛡️ VILLA DISCOUNT — SERVER-ONLY REPOSITORY (ADIM 1 — VERİ MODELİ)
   ===============================================================
   AMAÇ:
     `villa_discounts` tablosu (migration 079) için minimal repository
     yüzeyi — yalnız READ + atomic REPLACE-ALL. `villa_prices`'ın
     kendi server repository'sinin (villa-price.repository.server.ts)
     ve admin repository'deki `rpcReplaceVillaPrices`/`findPricesByVillaId`
     metodlarının BİREBİR yapısal ikizi.

   ⚠️ KAPSAM (bilinçli sınır — bu adımda):
     - Bu dosya HİÇBİR YERDEN import edilmiyor / çağrılmıyor. Price
       engine (`lib/price.engine.ts`), rezervasyon hesaplama/snapshot
       kodları, admin/public UI — HİÇBİRİ bu repository'yi kullanmıyor.
       Bu adımın kapsamı yalnız "veri modeli hazır, tüketici YOK".
     - `villa_prices`'a ait hiçbir repository metoduna (`villaAdminRepository`
       içindeki price metodları, `villa-price.repository.server.ts`)
       dokunulmadı; bu dosya onlardan tamamen bağımsız, ayrı bir dosya.

   GÜVENLİK SINIRI (diğer .server repo'larla aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → native provider; RLS'in aksine yetki uygulama
       katmanında (bu dosyayı çağıracak service/route kendi admin
       auth kontrolünü yapmalı — henüz hiçbir caller yok).

   TARİH SEMANTİĞİ: `start_date`/`end_date` `villa_prices` ile birebir
   aynı — kapalı interval, ikisi de dahil (migration 079 doc-comment'i).
   Bu repository yalnız ham veri taşır; karşılaştırma/hesaplama mantığı
   burada YOK (sonraki adımda `lib/price.engine.ts`'e eklenecek).
=============================================================== */

export type VillaDiscountInput = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency?: string | null;
};

export const villaDiscountRepository = {
  /** READ — villa_discounts by villa_id. `findPricesByVillaId` (villa
   *  admin repository) ile aynı desen: ham satırlar, filtre/sıralama
   *  caller'da. */
  async findDiscountsByVillaId(villaId: string) {
    return await dbAdmin
      .from<VillaDiscountRow>("villa_discounts")
      .select("*")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — villa_discounts tablosunda EN AZ 1 kaydı olan villa_id'ler
     ===============================================================
     AMAÇ: /maki-admin/discount-collection "Villa Ekle" seçicisinde
     yalnızca en az bir villa_discounts kaydı bulunan villaları
     göstermek (aktif/geçmiş/gelecek fark etmez — tarih filtresi YOK,
     yalnızca "kaydı var mı" sorgusu). TEK sorgu — her villa için ayrı
     ayrı sorgu atılmıyor (N+1 YOK); caller (route/service) `villa_id`
     kolonunu Set'e çevirip mevcut villa listesiyle in-memory kesiştirir.
     `findDiscountsByVillaId`'nin (tek villa, `select("*")`) yapısal
     ikizi — yalnız filtre YOK, kolon SADECE `villa_id`. */
  async findDistinctVillaIdsWithDiscounts() {
    return await dbAdmin
      .from<Pick<VillaDiscountRow, "villa_id">>("villa_discounts")
      .select("villa_id");
  },

  /* ===============================================================
     RPC — DISCOUNTS atomic replace (`replace_villa_discounts`,
     migration 079). `rpcReplaceVillaPrices`'in BİREBİR yapısal ikizi
     — yalnız tablo/RPC adı ve payload alanları farklı.
     ⚠️ RPC parameter shape: { p_villa_id, p_discounts jsonb }
     ⚠️ pg_advisory_xact_lock DB-level concurrent admin replace
       serileştirir — değiştirilmez.
     ⚠️ Bu metodun HENÜZ hiçbir çağıranı yok (Adım 1 kapsamı).
  =============================================================== */
  async rpcReplaceVillaDiscounts(
    villaId: string,
    payload: VillaDiscountInput[]
  ) {
    return await dbAdmin.rpc("replace_villa_discounts", {
      p_villa_id: villaId,
      p_discounts: payload,
    });
  },

  /* ===============================================================
     DELETE — TEK villa_discounts kaydı (replace-all'dan AYRI yol)
     ===============================================================
     AMAÇ: Admin "İndirimler" listesinden tek bir kaydı silmek artık
     `rpcReplaceVillaDiscounts` (tüm listeyi yeniden yazan replace-all)
     üzerinden GEÇMİYOR — bu yüzden currency enforcement/villa.currency/
     villa_prices okuması HİÇ devreye girmez (villanın fiyat verisi
     eksik/NULL olsa bile silme çalışır).
     WHERE `id = discountId AND villa_id = villaId` — IDOR guard: başka
     bir villaya ait discountId gönderilirse WHERE hiç eşleşmez, hiçbir
     satır silinmez (mevcut `deleteById` desenleriyle AYNI — bkz.
     villa.repository.server.ts'teki tekil-koşullu delete'ler; burada
     ikinci `.eq()` ile compound koşul EKLENDİ, chain kalıbı projede
     zaten var — bkz. villa-zip.repository.server.ts/reservation-share.
     repository.server.ts'teki `.delete().eq(...).or(...)` örnekleri). */
  async deleteDiscountById(villaId: string, discountId: string) {
    return await dbAdmin
      .from("villa_discounts")
      .delete()
      .eq("id", discountId)
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     🛡️ CLEANUP — TAMAMEN GEÇMİŞ İNDİRİMLER (cron)
     ===============================================================
     `villa-price.repository.server.ts > deletePastSeasons` metodunun
     BİREBİR KARDEŞİ — yalnız tablo + çağıran cron farklı. Yeni desen,
     yeni mimari, yeni migration YOK.

     KURAL: `end_date < today` — STRICT `<`.
       • BUGÜN biten indirim KORUNUR (o gün hâlâ geçerli/görünür),
         ertesi gün silinir. `<=` KULLANILMAZ.
       • Bu eşik, projedeki İKİ mevcut görünürlük filtresiyle
         (lib/cache.helpers > getCachedDiscountCollectionVillas ve
         app/services/discount-collection.service > listDiscountCollection,
         her ikisi de `end_date >= bugün` → görünür) TAM SİMETRİKTİR.

     KAPSAM SINIRI — DOKUNMADIKLARI:
       • `discount_collections`: bu tablo HİÇ okunmaz/yazılmaz. Admin
         küratörlüğü (sort_order, is_active, custom_title,
         custom_cover_image) KORUNUR; villaya yeni indirim eklenince
         kart otomatik geri gelir.
       • `reservations`: indirim bilgisi orada SNAPSHOT kolonlarında
         tutulur (migration 080: discount_applied/discount_type/
         discount_value/discount_currency/...). `villa_discounts`'a FK
         YOKTUR → geçmiş rezervasyonların fiyat/indirim bilgisi
         ETKİLENMEZ.
       • FK/CASCADE: `villa_discounts`'a referans veren BAŞKA TABLO
         YOKTUR; tek FK giden yönde (`villa_id → villa(id) ON DELETE
         CASCADE`, migration 079:136). Silme zinciri tetiklenmez.

     İdempotent: eşleşen satır yoksa `count: 0`, hata yok. Tek DELETE
     ifadesi PostgreSQL'de zaten atomiktir → ayrı transaction GEREKMEZ.
     WHERE'li DELETE (safe-updates OK). */
  async deletePastDiscounts(today: string) {
    return await dbAdmin
      .from("villa_discounts")
      .delete({ count: "exact" })
      .lt("end_date", today);
  },
};
