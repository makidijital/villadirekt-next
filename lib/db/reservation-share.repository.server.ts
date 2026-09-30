import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ RESERVATION SHARE LINKS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   `reservation_share_links` tablosu admin-only RLS (migration 070). Bu
   repo YALNIZ server (admin share-link route'u + public resolve akışı)
   tarafından service_role ile çağrılır → RLS bypass. `import "server-only"`
   ile client bundle'a sızması build-time engellenir. `villa_zip.repository
   .server` deseninin BİREBİR kopyası (create/list/revoke/consume).

   ⚠️ MEVCUT reservation repository/service'e DOKUNULMAZ — bu ayrı, additive
      dosya. `reservations` tablosu YALNIZ salt-okuma (güvenli alanlar).
   =============================================================== */

export type ReservationShareLinkRow = {
  id: string;
  reservation_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
};

/** Public DTO kaynağı — YALNIZ güvenli alanlar (PII/komisyon/not YOK). */
export type ReservationShareRow = {
  reservation_no: string | null;
  status: string | null;
  payment_link_status: string | null;
  payment_preference: string | null;
  /* Misafir iletişim (rezervasyonun kendi kaydı). */
  name: string | null;
  phone: string | null;
  email: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  total_price: number | null;
  total_price_try: number | null;
  paid_amount: number | null;
  prepayment_amount: number | null;
  remaining_payment: number | null;
  original_currency: string | null;
  /* Bilgilendirme snapshot'ları (TRY) — hesaba KATILMAZ (total/kalan
     ödeme değişmez). Yalnız müşteriye gösterilir. */
  damage_deposit: number | null;
  cleaning_fee_try: number | null;
  /* 🛡️ `id` + `name` ADDITIVE: görünen ödeme yöntemi etiketi artık
     CANONICAL `payment_methods.name` (+ `payment_method_translations`
     EN/DE) üzerinden çözülür. `type` AYNEN kalır — ödeme/iş mantığı
     (`paymentMethodType` / `isWesternUnionMethod`) DEĞİŞMEDİ. */
  payment_method: {
    id: string | null;
    name: string | null;
    type: string | null;
  } | null;
  villa: {
    title: string | null;
    villa_images:
      | Array<{
          image_url: string | null;
          is_cover: boolean | null;
          sort_order: number | null;
        }>
      | null;
    /* Mülk sahibi — YALNIZ güvenli alanlar (email/iban embed EDİLMEZ). */
    owner: {
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    } | null;
  } | null;
};

export const reservationShareRepository = {
  /** Yeni paylaşım linki (admin). token_hash + expires_at caller'da
   *  hazırlanır (crypto random + end_date+3g). Inserted row döner. */
  async create(input: {
    reservation_id: string;
    token_hash: string;
    expires_at: string;
    created_by: string | null;
  }) {
    return await dbAdmin
      .from("reservation_share_links")
      .insert({
        reservation_id: input.reservation_id,
        token_hash: input.token_hash,
        expires_at: input.expires_at,
        created_by: input.created_by,
      })
      .select(
        "id, reservation_id, token_hash, expires_at, revoked_at, created_at, created_by"
      )
      .single();
  },

  /** Bir rezervasyonun AKTİF linki (revoked_at NULL + expires_at > now),
   *  yeni→eski, tek satır. Admin "zaten link var mı?" için. token_hash
   *  DÖNER ama admin'e gösterilmez (yalnız varlık/expires kontrolü). */
  async findActiveByReservation(reservationId: string) {
    return await dbAdmin
      .from("reservation_share_links")
      .select(
        "id, reservation_id, token_hash, expires_at, revoked_at, created_at, created_by"
      )
      .eq("reservation_id", reservationId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
  },

  /** Soft revoke — bir rezervasyonun TÜM aktif linklerini iptal eder. */
  async revokeByReservation(reservationId: string) {
    return await dbAdmin
      .from("reservation_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("reservation_id", reservationId)
      .is("revoked_at", null);
  },

  /** 🛡️ Opportunistic physical cleanup — bir rezervasyonun EXPIRED veya
   *  REVOKED linklerini fiziksel siler (create anında; cron YOK). Aktif
   *  satır filtreye girmez → silinmez. villa_zip.cleanupStale deseni. */
  async cleanupStale(reservationId: string) {
    return await dbAdmin
      .from("reservation_share_links")
      .delete()
      .eq("reservation_id", reservationId)
      .or(
        `expires_at.lte.${new Date().toISOString()},revoked_at.not.is.null`
      );
  },

  /** token_hash doğrula → reservation_id | null (revoked/expired → null).
   *  MULTI-USE (counter yok). `resolve_reservation_share_token` RPC. */
  async resolveByTokenHash(tokenHash: string) {
    return await dbAdmin.rpc("resolve_reservation_share_token", {
      p_token_hash: tokenHash,
    });
  },

  /** Public DTO için güvenli reservation read (service_role). YALNIZ
   *  müşteriye gösterilebilir alanlar + villa başlığı (1-level embed;
   *  findForPublicLookup ile aynı pattern). PII/not/komisyon SELECT'te
   *  YOK → sızma imkânsız. */
  async findReservationForShare(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `reservation_no,
         status,
         payment_link_status,
         payment_preference,
         name,
         phone,
         email,
         start_date,
         end_date,
         guests,
         total_price,
         total_price_try,
         paid_amount,
         prepayment_amount,
         remaining_payment,
         original_currency,
         damage_deposit,
         cleaning_fee_try,
         pool_heating_selected,
         pool_heating_total_try,
         payment_method:payment_method_id ( id, name, type ),
         villa:villa_id ( title, villa_images ( image_url, is_cover, sort_order ), owner:owner_id ( first_name, last_name, phone ) )`
      )
      .eq("id", id)
      .limit(1);
  },
};
