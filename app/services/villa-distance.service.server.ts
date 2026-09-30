import "server-only";

import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import {
  normalizeDistanceValue,
  parseDistance,
  type DistanceUnit,
} from "@/lib/distance.helper";

/* ===============================================================
   🛡️ VILLA DISTANCE — SERVER-ONLY WRITE (service-role, throws)
   ===============================================================
   AMAÇ:
     `setVillaDistances` (anon) server context'ten çağrılınca aynı
     silent-fail problemine giriyordu: anon `db` JWT taşımaz → mig 037
     `villa_distances_admin_write` policy DENY → RPC replace bloklanır
     → caller orchestrator hata'yı fark etmez.

   ⚠️ NEDEN AYRI DOSYA:
     Eski `villa-distance.service.ts` server-only'a çevrilemiyor
     (CLIENT importer'ları olmasa da public RSC'ler `getVillaDistances`
     çağırıyor — read path bozulmasın). Yalnız write path'i için
     server-only variant.

   ⚠️ Payload normalize (title trim, unit re-serialize, drop empty)
     BYTE-IDENTICAL eski `setVillaDistances` ile.

   ⚠️ Sadece `createVillaFull` ve `updateVillaFull` (server context)
     tarafından kullanılır. Error → throw → orchestrator catch → 400.
=============================================================== */

export async function setVillaDistancesServer(
  villaId: string,
  distances: { title: string; distance: string; unit?: DistanceUnit }[]
): Promise<void> {
  if (!villaId) {
    throw new Error("villaId zorunlu");
  }

  const payload = (distances || [])
    .map((d) => {
      const title = String(d?.title || "").trim();
      let distance: string;
      if (d?.unit === "m" || d?.unit === "km") {
        const parsed = parseDistance(d.distance);
        if (parsed.isLegacy) {
          distance = String(d.distance || "").trim();
        } else {
          distance = parsed.value
            ? `${parsed.value} ${d.unit}`
            : "";
        }
      } else {
        distance = normalizeDistanceValue(d?.distance);
      }
      return { title, distance };
    })
    .filter((d) => d.title.length > 0 || d.distance.length > 0);

  const { error } =
    await villaAdminRepository.rpcReplaceVillaDistances(villaId, payload);

  if (error) {
    console.error("[setVillaDistancesServer] FAILED", error.message);
    throw new Error(error.message || "Villa mesafeleri kaydedilemedi");
  }
}
