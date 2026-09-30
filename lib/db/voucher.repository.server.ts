import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (pilotlar PASS). maybeSingle +
   embed (villa:villa_id(title) + payment_method:payment_method_id(name),
   ikisi de relation-metadata'da kayıtlı) + numeric/tarih read parity
   hazır. Method yüzeyi + dönüş şekli aynen. Runtime testi yeşil olmadan
   production'a deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ VOUCHER REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `app/lib/voucher/data.ts` içindeki inline
   `dbAdmin.from("reservations")...maybeSingle()` read'inin
   BİREBİR taşınmış hali.

   GÜVENLİK SINIRI:
     • `import "server-only"` — voucher reservation snapshot'ı tam PII
       içerir; service-role (dbAdmin) + server-only zorunlu (mig 040
       admin-only RLS). Client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` = service-role → RLS bypass; PII server'da kalır.

   DAVRANIŞ:
     - SELECT string + embedded join'ler (villa:villa_id ( title ),
       payment_method:payment_method_id ( name )) AYNEN (byte-identical;
       alias / field list / whitespace değişmez).
     - `.eq("id", ...)` + `.maybeSingle()` AYNEN.
     - native `{ data, error }` döner; confirmed-guard, PII
       mapping, payment helper, logging, fallback hepsi CALLER'da.
=============================================================== */

export const voucherRepository = {
  async findReservationById(reservationId: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no, damage_deposit,
       name, phone, phone2, email, identity_number, country, city, address,
       guests, guest_names, note, status, created_at,
       start_date, end_date,
       total_price, total_price_try,
       paid_amount, prepayment_amount, remaining_payment,
       payment_preference,
       villa:villa_id ( title ),
       payment_method:payment_method_id ( name )`
      )
      .eq("id", reservationId)
      .maybeSingle();
  },
};
