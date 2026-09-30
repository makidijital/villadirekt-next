import "server-only";

/* 🛡️ NATIVE CUTOVER — native provider (parity doğrulandı: embed
   villa+payment_method, PGRST116, SQLSTATE 23P01/23505, numeric/date/
   timestamptz/uuid parser, jsonb guest_names → JSON+::jsonb). Method
   yüzeyi + dönüş şekli aynen. Runtime testi yeşil olmadan production'a
   deploy edilmemeli. */
import { dbAdminNative as dbAdmin } from "@/lib/db/native";

import {
  SELECT_RESERVATION_DETAIL,
} from "@/app/services/reservation/_helpers/select-shapes";

/* ===============================================================
   🛡️ GEÇİŞSEL TİP KÖPRÜSÜ (DI kontratı) — server repo → anon repo tipi
   ===============================================================
   Service DI interface'leri `Pick<typeof reservationRepository, ...>`
   (app/services/reservation/*.service.ts) ANON repository'ye bağlıdır;
   anon repo HENÜZ eski sağlayıcı-tipli olduğundan bu 5 paylaşılan method'un
   dönüş tipi eski sağlayıcı response şeklindedir. Server repo (native) bu
   method'ları aynı dönüş tipiyle yüzeyler → DI kontratı (route call
   site'ları) DEĞİŞMEDEN sağlanır. Consumer'lar yalnız `{ data, error }`
   (+ `error.message`/`error.code`) okur; native runtime bunları birebir
   sağlar. Köprü YALNIZ tip düzeyinde (`import(...)` type-query → runtime
   import YOK, vendor-neutral native provider KİRLENMEZ). Anon repo
   native'e geçince DI interface'leri native tipe döner ve bu köprü kalkar. */
type AnonReservationRepo =
  typeof import("@/lib/db/reservation.repository").reservationRepository;
type SharedReturn<
  K extends "insert" | "findById" | "updateById" | "deleteById" | "findPaidAmount"
> = Awaited<ReturnType<AnonReservationRepo[K]>>;

/* ===============================================================
   🛡️ RESERVATION — SERVER-ONLY WRITE REPOSITORY (service-role)
   ===============================================================
   reservations PHASE 3 (migration 040) sonrası admin-only RLS:
   anon INSERT REDDEDILIR. Public booking CREATE bir auth'suz
   ziyaretçi tarafından tetiklendiği için INSERT'in SERVICE ROLE
   ile yapılması zorunlu (RLS bypass). Ayrıca service_role,
   `.insert().select().single()` RETURNING representation'ını
   görebildiği için RLS altında da inserted row caller'a döner
   (anon olsaydı RETURNING RLS'e takılır, .single() boş/err olurdu).

   GÜVENLİK SINIRI (mail-log.repository.server / payment-account.server
   ile aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa build HATA.
     • dbAdmin service-role kimlik bilgisi okur (NEXT_PUBLIC_
       prefix YOK) → yalnız server runtime.

   DAVRANIŞ:
     - INSERT chain `.insert(payload).select().single()` —
       reservation.repository.ts (anon) INSERT'i ile BYTE-IDENTICAL.
     - native `{ data, error }` döner; error.code (SQLSTATE
       23P01 = exclusion_violation) korunur → caller `mapInsertError`
       ile "Bu tarihler dolu"a map eder. Double-booking EXCLUDE
       constraint garantisi aynen.

   CALLER:
     • app/api/public/reservations/route.ts → createReservation(data,
       { insertRepository: reservationServerRepository })
   =============================================================== */

export const reservationServerRepository = {
  async insert(
    payload: Record<string, unknown>
  ): Promise<SharedReturn<"insert">> {
    const res = await dbAdmin
      .from("reservations")
      .insert(payload)
      .select()
      .single();
    return res as unknown as SharedReturn<"insert">;
  },

  /* ===============================================================
     READ — DETAIL (service-role) — admin detail route için
     ===============================================================
     Anon repo `findById` ile BYTE-IDENTICAL chain:
       .from("reservations").select(SELECT_RESERVATION_DETAIL)
       .eq("id", id).single()
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     `.single()` resolver KORUNDU — orchestrator (read.service) bu
     resolver davranışına bağlıdır: missing row → error.code "PGRST116" →
     "Rezervasyon getirilemedi" throw. Mig 040 admin-only RLS altında
     anon SELECT 0 row → PGRST116 silent fail; service-role bypass ile
     gerçek row dönüyor.
  =============================================================== */
  async findById(id: string): Promise<SharedReturn<"findById">> {
    const res = await dbAdmin
      .from("reservations")
      .select(SELECT_RESERVATION_DETAIL)
      .eq("id", id)
      .single();
    return res as unknown as SharedReturn<"findById">;
  },

  /* ===============================================================
     UPDATE BY ID (service-role) — payment mail + admin update/status/note
     ===============================================================
     payment-link / payment-confirmed / bank-transfer route'ları
     reservation'ı server-side günceller (payment_link, paid_amount,
     payment_link_status vb.). 040 admin-only RLS sonrası anon UPDATE
     reddedilir → service_role ile.

     Admin update/status/note route'ları aynı server-side bağlamda
     çalışır (anon `db` JWT taşımaz → mig 040 DENY → UPDATE 0 row
     etkiler, eski sağlayıcı silent başarı döner; data değişmez). Bu metod
     dependency injection ile services'e geçer → byte-identical
     UPDATE artık service-role ile yapılır.
  =============================================================== */
  async updateById(
    id: string,
    partial: Record<string, unknown>
  ): Promise<SharedReturn<"updateById">> {
    const res = await dbAdmin
      .from("reservations")
      .update(partial)
      .eq("id", id);
    return res as unknown as SharedReturn<"updateById">;
  },

  /* ===============================================================
     DELETE BY ID (service-role) — admin delete route için
     ===============================================================
     Anon repo `deleteById` ile BYTE-IDENTICAL chain:
       .from("reservations").delete().eq("id", id)
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     Hard delete; 040 admin-only RLS altında anon DELETE 0 row etkiler
     (silent fail) → service-role bypass.
  =============================================================== */
  async deleteById(id: string): Promise<SharedReturn<"deleteById">> {
    const res = await dbAdmin
      .from("reservations")
      .delete()
      .eq("id", id);
    return res as unknown as SharedReturn<"deleteById">;
  },

  /* ===============================================================
     READ — PAID AMOUNT (service-role) — assertCanConfirm fallback
     ===============================================================
     Anon repo `findPaidAmount` ile BYTE-IDENTICAL chain:
       .from("reservations").select("paid_amount").eq("id", id).maybeSingle()
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     `assertCanConfirm` (status guard) tarafından kullanılır. Mig 040
     altında anon maybeSingle null → existing?.paid_amount === undefined
     → canConfirmReservation(undefined) === false → guard yanlışlıkla
     throw eder. Service-role ile gerçek paid_amount okunur.
  =============================================================== */
  async findPaidAmount(id: string): Promise<SharedReturn<"findPaidAmount">> {
    const res = await dbAdmin
      .from("reservations")
      .select("paid_amount")
      .eq("id", id)
      .maybeSingle();
    return res as unknown as SharedReturn<"findPaidAmount">;
  },

  /* ===============================================================
     MAIL SNAPSHOT READS (service-role) — .maybeSingle resolver
     ===============================================================
     SELECT shape'leri anon repository'deki orijinallerle BYTE-IDENTICAL
     (route-spesifik exact projection). 040 admin-only RLS sonrası bu
     server-side okumalar service_role ile çalışır; PII server'da kalır.
  =============================================================== */
  async findByIdForPaymentLinkMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         payment_link,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  async findByIdForPaymentConfirmedMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         payment_link_status,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  async findByIdForBankTransferMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — PUBLIC LOOKUP (service-role) — /api/public/reservation-lookup
     ===============================================================
     Müşteri reservation_no + email eşleşmesiyle durum sorgular. Mig 040
     admin-only RLS → anon SELECT reddedilir; service_role ile okunur.
     ⚠️ Public-lookup slim projeksiyon (PII yok: telefon/TC/adres/fiyat
        ASLA seçilmez) + `villa:villa_id ( title )` embed BİREBİR.
     ⚠️ Filter `.eq("reservation_no", …)` + resolver `.limit(1)` (array
        döner; caller `data[0]` alır). Email eşleşme + generic-404
        anti-enumeration guard route'ta KALIR. */
  async findForPublicLookup(reservationNo: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `reservation_no,
         email,
         status,
         payment_link_status,
         start_date,
         end_date,
         guests,
         villa:villa_id ( title )`
      )
      .eq("reservation_no", reservationNo)
      .limit(1);
  },

  /* ===============================================================
     READ — REQUEST MAIL snapshot (service-role) — /api/mail/reservation-request
     ===============================================================
     Public booking flow'unun request-mail snapshot'ı. Diğer
     findByIdFor*Mail read'leriyle aynı pattern; route-spesifik EXACT
     projeksiyon (yalnız BU read `original_price/original_currency/
     exchange_rate` + `payment_method:payment_method_id ( name, type )`
     embed'ini taşır). Select string + iki embed BİREBİR; .eq("id")
     .maybeSingle() resolver KORUNDU. */
  async findByIdForRequestMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, phone, phone2, email, identity_number, country, city, address,
         guests, guest_names, note, status, created_at,
         start_date, end_date,
         total_price, total_price_try,
         original_price, original_currency,
         paid_amount, prepayment_amount, remaining_payment,
         payment_preference,
         damage_deposit,
         exchange_rate,
         villa:villa_id ( title ),
         payment_method:payment_method_id ( name, type )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — CANCELLED MAIL snapshot (service-role) — /api/mail/reservation-cancelled
     ===============================================================
     ⚠️ findByIdForRequestMail'den FARKLI (byte-identical DEĞİL):
        • `damage_deposit` YOK (cancelled email damage-deposit satırı
          göstermez).
        • `payment_method:payment_method_id ( name )` — yalnız name
          (`type` YOK).
     Select string + `villa` embed + .eq("id").maybeSingle() BİREBİR. */
  async findByIdForCancelledMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, phone, phone2, email, identity_number, country, city, address,
         guests, guest_names, note, status, created_at,
         start_date, end_date,
         total_price, total_price_try,
         original_price, original_currency,
         paid_amount, prepayment_amount, remaining_payment,
         payment_preference,
         exchange_rate,
         villa:villa_id ( title ),
         payment_method:payment_method_id ( name )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — RECENT DASHBOARD LIST (service-role) — /maki-admin (RSC)
     ===============================================================
     Admin dashboard "Son rezervasyonlar" — en yeni 5. Slim projeksiyon
     + `villa:villa_id(title)` COMPACT embed (parantez içi boşluksuz) +
     created_at DESC + limit(5). Filter YOK. Select string BİREBİR. */
  async findRecentForDashboard() {
    return await dbAdmin
      .from("reservations")
      .select(
        "id, name, total_price, status, created_at, start_date, end_date, villa:villa_id(title)"
      )
      .order("created_at", { ascending: false })
      .limit(5);
  },

  /* ===============================================================
     READ — ADMIN LIST (service-role) — /api/admin/reservations GET
     ===============================================================
     Admin rezervasyon liste sayfası. 16-field list projeksiyon +
     `villa:villa_id ( title, villa_images (...) )` embed + created_at
     DESC. Filter/limit YOK. Select string'in geri kalanı BİREBİR
     (route'un RESERVATION_LIST_SELECT constant'ından kopyalandı);
     tek ek — kart thumbnail'i için villa_images (image_url, is_cover,
     sort_order) nested embed'i (route/API DEĞİŞMEDİ — data olduğu
     gibi geçer). */
  async findAllForAdminList() {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         villa_id, name, phone, phone2, start_date, end_date,
         total_price,
         total_price_try,
         original_price,
         original_currency,
         paid_amount,
         payment_preference,
         damage_deposit,
         status, created_at,
         villa:villa_id (
           title,
           villa_images ( image_url, is_cover, sort_order )
         )`
      )
      .order("created_at", { ascending: false });
  },
};
