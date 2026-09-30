import "server-only";
import { revalidateTag } from "next/cache";

/* ===============================================================
   🛡️ "villas" CACHE INVALIDATION — SUNUCU TARAFI (başarılı yazma sonrası)
   ===============================================================
   `revalidateVillas()` (app/services/revalidate.actions.ts) ile AYNI
   mekanizma: `revalidateTag("villas", { expire: 0 })`. Fark: bu bir
   Server Action DEĞİL — route handler / server action İÇİNDEN, yetki
   kontrolü ve başarılı DB/storage yazması ZATEN yapılmış noktalarda
   doğrudan çağrılır (ikinci bir auth turu ve istemciye açık yeni bir
   action yüzeyi oluşturmaz).

   `getCachedVillas` artık 2 MB altına indiği için gerçekten
   cache'leniyor; villa oluşturma/düzenleme/fiyat/galeri yazmaları
   sonrası liste 600 sn bayat kalmasın diye bu çağrılır. Mevcut
   istemci tarafı `revalidateVillas().catch(() => {})` çağrıları
   AYNEN korunur (idempotent; ikinci çağrı zararsız).

   GÜVENLİK: invalidation hatası yazma sonucunu ASLA değiştirmez —
   hata loglanır, çağıranın yanıtı/dönüş değeri aynı kalır. */
export function invalidateVillasCache(source: string): void {
  try {
    revalidateTag("villas", { expire: 0 });
  } catch (err) {
    console.error(
      `[villas-cache] invalidate FAILED (${source})`,
      err instanceof Error ? err.message : err
    );
  }
}
