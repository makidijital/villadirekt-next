import { villaDiscountRepository } from "@/lib/db/villa-discount.repository.server";
import type { DiscountRange } from "@/lib/price.engine";

/* ===============================================================
   🛡️ villa-discount.service.ts — PUBLIC-SAFE READ (villa_discounts)
   ===============================================================
   `villa-price.service.ts`'in (villa_prices) yapısal ikizi: tek
   sorumluluğu villa_discounts'ı OKUMAK ve `lib/price.engine.ts`'in
   zaten beklediği `DiscountRange[]` şekline normalize etmek.

   ⚠️ KAPSAM SINIRI:
     - `app/components/admin/villa/discount.action.ts` (admin "use
       server" action dosyası, authorizeAdminSession() içeriyor) BURADAN
       İMPORT EDİLMEZ — public/admin yüzeyleri KARIŞTIRILMAZ. Bu dosya
       doğrudan `villaDiscountRepository`'yi (Adım 1'den, zaten gate'siz
       bir READ metodu) kullanır — admin action'ın kendisi yalnız WRITE
       tarafını `authorizeAdminSession()` ile korur, READ zaten
       public-safe (villa_prices'ın kendi okuma deseniyle aynı).
     - `villaDiscountRepository` (`lib/db/villa-discount.repository.server.ts`)
       `import "server-only"` guard'lı — bu dosya onu import ettiği için
       transitif olarak server-only'dir; client bundle'a sızarsa build
       hata verir (ayrıca "server-only" burada AYRICA import edilmedi,
       `villa-price.service.ts` ile AYNI konvansiyon: guard zaten alttaki
       repository'den geliyor).
     - `lib/price.engine.ts`'e HİÇ dokunulmadı; yalnız zaten var olan
       `DiscountRange` type'ı reuse edildi.
     - villa_prices / PricingCalendarCanvas / admin indirim UI'sı /
       rezervasyon create akışı — HİÇBİRİNE dokunulmadı.

   FAIL-SAFE: repository hata dönerse (`error` doluysa) boş dizi
   döner — `calculateGrandTotal`'a `discounts: []` gitmesi "indirim
   yok" ile AYNI (getActiveDiscount boş/undefined diziyi zaten `null`
   olarak yorumluyor) — booking akışını ASLA bloklamaz.
   =============================================================== */

export async function getVillaDiscounts(
  villaId: string
): Promise<DiscountRange[]> {
  const { data, error } =
    await villaDiscountRepository.findDiscountsByVillaId(villaId);

  if (error) {
    console.error("getVillaDiscounts:", error.message);
    return [];
  }

  return (data || []).map((d) => ({
    start_date: d.start_date,
    end_date: d.end_date,
    discount_type: d.discount_type,
    discount_value: Number(d.discount_value) || 0,
    currency: d.currency,
  }));
}
