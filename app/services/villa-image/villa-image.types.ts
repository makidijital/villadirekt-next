/* ===============================================================
   🛡️ VILLA IMAGE — SHARED TYPE
   ===============================================================
   `villa_images` satır shape'i. SADECE TİP (runtime kod yok) →
   client + server + public her bağlamda güvenle import edilir.

   Client/server ayrıştırma sprinti: eski tek dosya
   `app/services/villa-image.service.ts` sorumluluğa göre bölündü:
     villa-image.types.ts      → bu dosya (shared type)
     villa-image.read.ts       → getVillaImages (read)
     villa-image.mutations.ts  → add / reorder / cover (client write)
     villa-image.delete.ts     → delete / deleteAll (delete orchestration)
   Fonksiyon gövdeleri BİREBİR taşındı; hiçbir davranış değişmedi.
   =============================================================== */

export type VillaImage = {
  id: string;
  villa_id: string;
  image_url: string;
  sort_order?: number;
  is_cover?: boolean;
  created_at?: string;
};
