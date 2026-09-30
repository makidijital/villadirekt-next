/* ===============================================================
   🛡️ FAZ 3 — VILLA ADMIN SERVICE — BARREL / FACADE
   ===============================================================
   Bu dosya FAZ 3 sonrası bir BARREL'a dönüştü. İçerik domain bazında
   parçalandı (`./villa-admin/` altında) ve buradan re-export edilir.

   ZERO CALLER MIGRATION:
     Eski caller'lar (`@/app/services/villa-admin.service`) aynı
     import path'inden bilinmeyen değişiklikle çalışmaya devam eder.
     Hiçbir caller dosya dokunmamak refactor'un kritik şartı.

   DOMAIN PARTITIONING:
     ./villa-admin/types.ts                  → 9 type
     ./villa-admin/_helpers/normalizers.ts   → 5 pure normalizer
     ./villa-admin/_helpers/payload.ts       → buildVillaCorePayload
     ./villa-admin/_helpers/slug.ts          → generateUniqueSlug
     ./villa-admin/_helpers/relations.ts     → 4 insert + 4 replace helper
     ./villa-admin/_helpers/storage-cleanup.ts → cleanupVillaStorageForHardDelete
     ./villa-admin/_helpers/private-token.ts → generatePrivateTokenString
     ./villa-admin/_helpers/distances.ts     → sanitizeDistances
     ./villa-admin/create.service.ts         → createVillaFull
     ./villa-admin/update.service.ts         → updateVillaFull
     ./villa-admin/visibility.service.ts     → setVillaActive / softDeleteVilla / restoreVilla
     ./villa-admin/sort.service.ts           → setVillaSortOrders
     ./villa-admin/private-token.service.ts  → generatePrivateAccessToken
     ./villa-admin/hard-delete.service.ts    → hardDeleteVilla

   ⚠️ Runtime davranış BYTE-IDENTICAL. Bu dosya yalnız re-export
      yapar; iç gövde mantığı barındırmaz.
=============================================================== */

/* ---------------- TYPES ---------------- */
export type {
  VillaForm,
  VillaMapData,
  VillaDistanceInput,
  VillaPriceInput,
  VillaFormPayload,
  VillaUpdatePayload,
  VillaSortOrderUpdate,
  VillaServiceResult,
  PrivateTokenResult,
} from "./villa-admin/types";

/* ---------------- CREATE / UPDATE ---------------- */
export { createVillaFull } from "./villa-admin/create.service";
export { updateVillaFull } from "./villa-admin/update.service";

/* ---------------- VISIBILITY ---------------- */
export {
  setVillaActive,
  softDeleteVilla,
  restoreVilla,
} from "./villa-admin/visibility.service";

/* ---------------- SORT ---------------- */
export { setVillaSortOrders } from "./villa-admin/sort.service";

/* ---------------- PRIVATE TOKEN ---------------- */
export { generatePrivateAccessToken } from "./villa-admin/private-token.service";

/* ---------------- HARD DELETE ---------------- */
export { hardDeleteVilla } from "./villa-admin/hard-delete.service";
