import type { OfferRequestStatus } from "@/types/database";

/* ===============================================================
   🛡️ OFFER STATUS LABEL — client-safe sabit
   ===============================================================
   `OfferRequestList` (client) UI etiketi için bunu kullanır. Eskiden
   `offer-request.service`'te tanımlıydı; service native repo (server-only)
   import ettiği için client bundle'a sızmasın diye buraya (yalnız tip
   import eden, saf-veri modülü) taşındı. Değerler AYNEN.
=============================================================== */
export const OFFER_STATUS_LABEL: Record<OfferRequestStatus, string> = {
  pending: "Bekliyor",
  contacted: "İletişime Geçildi",
  offered: "Mülk Önerildi",
  closed: "Kapandı",
};
