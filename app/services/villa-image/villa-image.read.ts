import { villaImageServerRepository as villaImageRepository } from "@/lib/db/villa-image.repository.server";
import type { VillaImage } from "./villa-image.types";

/* ===============================================================
   🛡️ VILLA IMAGE — READ (get)
   ===============================================================
   SORUMLULUK: villa görsellerini sort_order ASC oku.
   BAĞLAM: izomorfik / client-safe — anon `db` (RLS public read)
     hem browser (admin galeri) hem server (public villa/rezervasyon
     sayfaları) tarafından çağrılır. Public read RLS koşulsuz
     (villa_images_public_read: using(true)).
   ⚠️ DAVRANIŞ DEĞİŞMEDİ — gövde eski servisten birebir.
   =============================================================== */

//
// 📦 GET IMAGES
//
export async function getVillaImages(
  villaId: string
): Promise<VillaImage[]> {
  if (!villaId) return [];

  const { data, error } = await villaImageRepository.findByVillaIdOrdered(
    villaId
  );

  if (error) {
    console.error("❌ getVillaImages error:", error.message);
    return [];
  }

  return data || [];
}
