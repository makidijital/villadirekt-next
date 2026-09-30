import { buildVoucherData } from "./data";
import { renderVoucherDocument } from "./template";

/* ===============================================================
   🔥 VOUCHER BUILD — facade
   ===============================================================
   data.ts  → reservation snapshot + helper-driven props
   template.ts → premium document HTML (email-shell'den BAĞIMSIZ)

   Bu modül iki tarafı birleştirir; route'lar buradan tüketir.
   ReservationApprovedEmail flow'u tek satır dokunulmaz; voucher
   kendine ait UI render'ına sahiptir, sadece data builder'da
   helper'lar paylaşılır.
   =============================================================== */

export type VoucherBuildResult =
  | {
      ok: true;
      subject: string;
      html: string;
      recipient: string | null;
      villaTitle: string;
    }
  | { ok: false; error: string; status: number };

export async function buildVoucherContent(
  reservationId: string
): Promise<VoucherBuildResult> {
  const dataResult = await buildVoucherData(reservationId);
  if (!dataResult.ok) {
    return dataResult;
  }

  const { subject, html } = renderVoucherDocument(dataResult.props);
  return {
    ok: true,
    subject,
    html,
    recipient: dataResult.recipient,
    villaTitle: dataResult.villaTitle,
  };
}
