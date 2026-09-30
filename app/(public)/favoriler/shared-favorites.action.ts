"use server";

import {
  createSharedFavoritesList as createSharedFavoritesListService,
  type CreateSharedListResult,
} from "@/app/services/shared-favorites.service";

/* ===============================================================
   🛡️ SHARED FAVORITES — SERVER ACTION (thin wrapper)
   ===============================================================
   `FavoritesGrid` (client) → bu server action → `shared-favorites.service`
   (server) → native repo.

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız service'i delege eder. İmza +
     dönüş tipi service ile BİREBİR (davranış değişmez); amaç yalnız
     client→server sınırını oluşturup native repo'yu client bundle'a
     sızdırmamak.
   =============================================================== */

export async function createSharedFavoritesListAction(
  villaIds: string[]
): Promise<CreateSharedListResult> {
  return createSharedFavoritesListService(villaIds);
}
