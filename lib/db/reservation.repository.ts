import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 4 S2 — reservation core) — native provider'a
   alındı. Tüm tüketiciler server (reservation/* servisleri, availability.
   helper, blocked-ranges route, fetchBlockedDates [server-only]). eski sağlayıcı
   importu tamamen kaldırıldı. `server-only` defansif sınır. Metod gövdeleri +
   RPC (check_villa_availability_conflict / get_villa_blocked_ranges /
   get_blocked_villa_ids) + embed + half-open overlap SQL davranışı AYNEN. */
import { dbNative as db } from "@/lib/db/native";

import {
  SELECT_RESERVATION_DETAIL,
  SELECT_RESERVATION_LIST,
} from "@/app/services/reservation/_helpers/select-shapes";

/* ===============================================================
   🛡️ FAZ 33 — RESERVATION REPOSITORY (Data Access Layer)
   ===============================================================
   AMAÇ (FAZ 0 mapping raporu, §7):
     Reservation domain'inde eski sağlayıcıyı tek katman aşağı it.
     Service / helper katmanı artık eski sağlayıcı client'ı doğrudan
     tüketmez; bu repository üzerinden delege eder.

     bugün : service → eski sağlayıcı
     hedef : service → repository → eski sağlayıcı

   PRODUCTION-SAFE YAKLAŞIM (villa.repository.ts paralel):
     - Query'ler BİREBİR aynı (filter chain, embed, single() vs.
       maybeSingle(), order pattern).
     - Return shape: native `{ data, error }`. Repository
       sessiz; throw YOK, console.error YOK.
     - SQLSTATE 23P01 / `reservations_no_overlap` mapping bu
       dosyada YOK — service edge'inde (`_helpers/errors.ts`)
       kalır.
     - Throw mesajları (TR human-friendly) bu dosyada YOK —
       orchestrator/helper tarafında.
     - Fail-open semantic (commission fetch) bu dosyada YOK —
       helper tarafında.

   AGGREGATE BOUNDARY (FAZ 0 §4.3):
     - `reservations` (own)
     - `manual_reservations` (cross-table conflict — FAZ 3'te
       eklenecek)
     - `villa.commission_rate` (cross-table snapshot — yalnız
       commission için; villa repository scope dondurulduğu
       için sahiplik reservation tarafında)

   GELECEK MIGRATION ZEMINI:
     Bu dosya stabil bir Data Access katmanı. İleride eski sağlayıcı
     yerine başka client (Drizzle, Prisma, direct pg) takılırsa
     sadece bu dosya değişir; service + helper'lar dokunulmaz.

   ⚠️ FAZ KAPSAMI:
     - FAZ 2'de READ metodları implement edildi
       (findById, findList, findPaidAmount, findVillaCommissionRate).
     - FAZ 3'te CONFLICT metodları eklendi
       (findOverlappingReservations, findOverlappingManualBlocks).
     - FAZ 4'te UPDATE/DELETE metodları eklendi
       (updateById, deleteById).
     - FAZ 5'te INSERT metodu eklendi
       (insert) — revenue-critical, byte-identical extraction.
     - FAZ 36'da MAIL/PAYMENT extension eklendi: 3 yeni READ
       metod (findByIdForPaymentLinkMail,
       findByIdForPaymentConfirmedMail, findByIdForBankTransferMail)
       `.maybeSingle()` resolver + route-spesifik SELECT shape.
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ OverlapWindow — repository scope local type
   ---------------------------------------------------------------
   `_helpers/conflict.ts` tarafından kullanılan
   `ReservationConflictWindow` type'ı ile yapısal olarak birebir
   aynı; repository self-contained kalsın diye burada da local
   olarak tanımlı. Service `_types/types.ts` üzerinden import
   etmeyiz — dependency yönü "service → repository" olmalı,
   tersi DEĞIL.

   ⚠️ Field set + sıra birebir aynı. Service'ten gelen window
   payload'ı bu shape'e structurally compatible olarak akar.
=============================================================== */
export type OverlapWindow = {
  villa_id: string;
  start_date: string;
  end_date: string;
};

/* ---------------------------------------------------------------
   🛡️ SELECT shape SINGLE SOURCE-OF-TRUTH
   ---------------------------------------------------------------
   `SELECT_RESERVATION_DETAIL` ve `SELECT_RESERVATION_LIST`
   constant'ları `_helpers/select-shapes.ts`'de yaşamaya devam
   eder (byte-identical whitespace garantisi için tek nokta).
   Repository onları import eder — runtime'da eski sağlayıcıya geçen
   string aynı reference.
=============================================================== */

export const reservationRepository = {
  /* ===============================================================
     READ — DETAIL (`getReservationById` delege)
     ===============================================================
     Orijinal pattern (read.service.ts > getReservationById):
       eski sağlayıcı
         .from("reservations")
         .select(SELECT_RESERVATION_DETAIL)
         .eq("id", id)
         .single();

     ⚠️ `single()` korundu (maybeSingle DEĞIL). Missing row durumu
        eski sağlayıcı tarafında error olarak yansır (`PGRST116`). Bu
        davranış orchestrator'da `if (error) throw "Rezervasyon
        getirilemedi"` ile zaten yakalanıyor — byte-identical.
  =============================================================== */
  async findById(id: string) {
    return await db
      .from("reservations")
      .select(SELECT_RESERVATION_DETAIL)
      .eq("id", id)
      .single();
  },

  /* ===============================================================
     READ — LIST (`getReservations` delege)
     ===============================================================
     Orijinal pattern (read.service.ts > getReservations):
       eski sağlayıcı
         .from("reservations")
         .select(SELECT_RESERVATION_LIST)
         .order("created_at", { ascending: false });

     ⚠️ Order pattern + select string aynen.
  =============================================================== */
  async findList() {
    return await db
      .from("reservations")
      .select(SELECT_RESERVATION_LIST)
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     READ — PAID AMOUNT (`assertCanConfirm` fallback delege)
     ===============================================================
     Orijinal pattern (_helpers/status.ts > assertCanConfirm):
       eski sağlayıcı
         .from("reservations")
         .select("paid_amount")
         .eq("id", id)
         .maybeSingle();

     ⚠️ `maybeSingle()` korundu — null row durumu data=null,
        error=null olarak akar; helper bunu `existing?.paid_amount`
        ile defensive okur.
  =============================================================== */
  async findPaidAmount(id: string) {
    return await db
      .from("reservations")
      .select("paid_amount")
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — VILLA COMMISSION RATE (cross-table, fail-open caller)
     ===============================================================
     Orijinal pattern (_helpers/commission.ts > fetchCommissionRate):
       eski sağlayıcı
         .from("villa")
         .select("commission_rate")
         .eq("id", villaId)
         .maybeSingle();

     ⚠️ KESIN KURAL:
       - Cross-table read; `villa` tablosuna eriştik ama bu
         **reservation domain'in ihtiyacı** (commission snapshot
         createReservation flow'unda). Sahiplik reservation
         repository'sinde — villa repository (read-only, donmuş)
         genişletilmiyor.
       - Fail-open policy bu dosyada YOK; helper tarafında
         (`_helpers/commission.ts`) console.error + fallback
         rate (DEFAULT 20) aynen sürer.
  =============================================================== */
  async findVillaCommissionRate(villaId: string) {
    return await db
      .from("villa")
      .select("commission_rate")
      .eq("id", villaId)
      .maybeSingle();
  },

  /* ===============================================================
     READ — VILLA CLEANING CONFIG (cross-table, price-verify helper)
     ===============================================================
     Orijinal (_helpers/price-verify.ts recompute):
       db.from("villa")
         .select("cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate")
         .eq("id", villa_id)
         .maybeSingle();

     ⚠️ Cross-table villa read; reservation flow'un (public price
        recompute/compare) ihtiyacı — `findVillaCommissionRate`
        precedent'i ile aynı sahiplik (villa repository donmuş).
        4-field projeksiyon BİREBİR; `findAvailabilityConfigById`
        (6-field superset) REUSE EDİLMEZ. Anon `db` (villa public_read).
        Fail-open mapping caller'da (helper).

     🛡️ HAVUZ ISITMA — 6. adım: `pool_heating_fee, pool_heating_currency`
        EKLENDİ (6-field projeksiyon). Metod adı DEĞİŞTİRİLMEDİ (tek
        call site — price-verify.ts); diff yüzeyi minimize edildi.

     🛡️ Migration 076 — sezonluk ay kısıtı: `pool_heating_months`
        EKLENDİ (7-field projeksiyon). Server-authoritative sezon
        kontrolü (isPoolHeatingActiveForRange) bu alana ihtiyaç
        duyuyor — bkz. pool-heating-verify.ts/price-verify.ts.

     🛡️ SEC-06 F4 — `deposit` EKLENDİ (8-field). Public create'te
        damage_deposit client'tan değil villanın kendi kaydından
        yazılır (tek call site — price-verify.ts). */
  async findVillaCleaningConfig(villaId: string) {
    return await db
      .from("villa")
      .select(
        "cleaning_fee, cleaning_currency, cleaning_limit, custom_prepayment_rate, pool_heating_fee, pool_heating_currency, pool_heating_months, deposit"
      )
      .eq("id", villaId)
      .maybeSingle();
  },

  /* ===============================================================
     CONFLICT — AVAILABILITY (PII-SAFE, SECURITY DEFINER RPC — migration 039)
     ===============================================================
     ESKİ: iki ayrı anon SELECT (findOverlappingReservations +
     findOverlappingManualBlocks) `reservations`/`manual_reservations`
     tablolarına. 040 admin-only RLS sonrası anon SELECT reddedilirdi.

     YENİ: tek `check_villa_availability_conflict(p_villa_id, p_start,
     p_end)` RPC çağrısı. RPC reservations(pending/confirmed) + manual
     overlap'ını DB içinde (definer, RLS-bypass) hesaplar ve YALNIZ
     boolean döner — PII açılmaz, anon/server/authenticated her bağlamda
     çalışır.

     ⚠️ SEMANTIC LOCKSTEP korunur: allow-list (pending/confirmed) +
     half-open overlap RPC içinde; `lib/availability.helper.ts` ile aynı.
     Asıl atomik garanti DB EXCLUDE constraint `reservations_no_overlap`.

     RETURN: native `{ data: boolean, error }`. Repository sessiz;
     throw/console/TR mesajı caller (`_helpers/conflict.ts`) tarafında.
  =============================================================== */
  async checkAvailabilityConflict(window: OverlapWindow) {
    return await db.rpc("check_villa_availability_conflict", {
      p_villa_id: window.villa_id,
      p_start: window.start_date,
      p_end: window.end_date,
    });
  },

  /* ===============================================================
     RPC — BLOCKED RANGES (public availability, SECURITY DEFINER — mig 039)
     ===============================================================
     Orijinal (/api/public/villas/[id]/blocked-ranges route):
       db.rpc("get_villa_blocked_ranges", { p_villa_id: id })

     ⚠️ SECURITY DEFINER RPC (grant execute → anon/authenticated/
        service_role). PII açmaz; yalnız blocked range array döner
        (`{ kind, status, start_date, end_date }[]`). Anon `db` (public
        route). RPC adı + arg key BİREBİR. Sessiz: native `{ data, error }`
        döner; fail-soft (empty array) caller'da. */
  async getBlockedRanges(villaId: string) {
    return await db.rpc("get_villa_blocked_ranges", {
      p_villa_id: villaId,
    });
  },

  /* ===============================================================
     RPC — BLOCKED VILLA IDS (batch availability, SECURITY DEFINER — mig 039)
     ===============================================================
     Orijinal (lib/availability.helper.ts > getBlockedVillaIds):
       db.rpc("get_blocked_villa_ids", {
         p_start: start, p_end: end, p_villa_ids: scoped,
       })

     ⚠️ SECURITY DEFINER RPC — reservations(pending/confirmed) + manual +
        external(active) blocking birleşimini DB içinde (RLS-bypass)
        hesaplar; YALNIZ villa_id[] döner (PII yok). Half-open overlap +
        allow-list RPC İÇİNDE — bu wrapper mantığa DOKUNMAZ. Anon `db`
        (grant → anon). `scoped` (villaIds|null) caller'da hesaplanır;
        arg key'leri (p_start/p_end/p_villa_ids) BİREBİR. Fail-soft
        (empty Set) caller'da. */
  async getBlockedVillaIdsRpc(
    start: string,
    end: string,
    scoped: string[] | null
  ) {
    return await db.rpc("get_blocked_villa_ids", {
      p_start: start,
      p_end: end,
      p_villa_ids: scoped,
    });
  },

  /* ===============================================================
     READ — ACTIVE BLOCK DATES BY VILLA (edit-page calendar feed)
     ===============================================================
     Orijinal (fetchBlockedDates.ts):
       db.from("reservations")
         .select("start_date, end_date, status")
         .eq("villa_id", villaId)
         .in("status", ["pending", "confirmed"])
         .neq("id", excludeReservationId);

     ⚠️ CLIENT-SIDE consumer (reservation edit page useEffect); anon `db`
        (browser JWT authenticated-admin). Status allow-list + exclude-id
        caller'da (byte-identical). `.neq("id", …)` self-exclude KORUNDU
        — düzenlenen rezervasyon kendi takvimini bloklamamalı. */
  async findActiveBlockDatesByVilla(
    villaId: string,
    statuses: readonly string[],
    excludeReservationId: string
  ) {
    return await db
      .from<{ start_date: string; end_date: string; status: string | null }>(
        "reservations"
      )
      .select("start_date, end_date, status")
      .eq("villa_id", villaId)
      .in("status", statuses as unknown as string[])
      .neq("id", excludeReservationId);
  },

  /* ===============================================================
     WRITE — UPDATE BY ID
     ===============================================================
     Üç orchestrator tarafından çağrılır — payload'ın shape'i
     orchestrator'a göre değişir, repository sadece UPDATE
     uygular:

       update.service.ts:
         db.from("reservations")
           .update(buildUpdateReservationPayload(data))
           .eq("id", id)

       status.service.ts:
         db.from("reservations")
           .update({ status })
           .eq("id", id)

       note.service.ts:
         db.from("reservations")
           .update({ note })
           .eq("id", id)

     ⚠️ KESIN KURAL:
       - Payload shape'i orchestrator/helper tarafında belirlenir
         (`buildUpdateReservationPayload`, `{ status }`, `{ note }`).
       - Repository payload'a müdahil olmaz — `Record<string, unknown>`
         olarak alır, repository update'e direkt geçirir.
       - Predicate AYNEN: `.eq("id", id)` — başka filter YOK.
       - `.select()` chain YOK (orijinal davranış: update sonrası
         row dönmez; error/success kararı ile yetinilir).
       - Return shape native `{ error }`. Repository
         sessiz; throw/console YOK.
       - Throw mesajlarını orchestrator yönetir
         ("Güncellenemedi", "Durum güncellenemedi", "Not kaydedilemedi").

     ⚠️ Bu metod **partial UPDATE** çeşitliliğini tek API yüzeyinde
     birleştirir — büyük orchestrator'ın payload (helper'dan)
     ile küçük orchestrator'un inline `{ status }` / `{ note }`
     objesi aynı path'i kullanır. Davranış byte-identical.
  =============================================================== */
  async updateById(id: string, partial: Record<string, unknown>) {
    return await db
      .from("reservations")
      .update(partial)
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — DELETE BY ID
     ===============================================================
     Orijinal pattern (delete.service.ts > deleteReservationById):
       db.from("reservations")
         .delete()
         .eq("id", id);

     ⚠️ KESIN KURAL:
       - Hard delete (soft-delete eklenmedi — business rule
         değişimi yasak).
       - Predicate AYNEN: `.eq("id", id)`.
       - Cascade YOK (service layer'da cascading cleanup yapılmaz;
         DB FK behavior'una bağlı).
       - Return shape native `{ error }`. Repository
         sessiz; throw "Silinemedi" + log tag service'te kalır.
  =============================================================== */
  async deleteById(id: string) {
    return await db
      .from("reservations")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — INSERT (createReservation delege; REVENUE-CRITICAL)
     ===============================================================
     Orijinal pattern (create.service.ts > createReservation):
       const { data: inserted, error } = await eski sağlayıcı
         .from("reservations")
         .insert(buildCreateReservationPayload({...}))
         .select()
         .single();

     ⚠️ KESIN KURAL — BYTE-IDENTICAL CHAIN:
       - `.insert(payload)` aynen.
       - `.select()` chain KORUNDU — inserted row caller'a
         dönmesi gerek (`createReservation` return value).
       - `.single()` resolver KORUNDU — caller bekliyor (return
         shape şu an `Row | null`; orijinal davranış aynen).
       - Payload shape orchestrator'da `buildCreateReservationPayload`
         tarafından üretilir; repository payload'a müdahil olmaz.
       - Return shape native `{ data, error }`. Service
         tarafında:
           const { data: inserted, error } =
             await reservationRepository.insert(payload);
           if (error) {
             console.error("❌ Create error:", error.message);
             mapInsertError(error);          // SQLSTATE 23P01
             throw new Error(error.message); // generic fallback
           }
           return inserted;
         davranışı BYTE-IDENTICAL korunur.

     🔥 EXCLUDE CONSTRAINT REFERANSI (yorum aynen):
       `reservations_no_overlap` DB-level atomik garanti —
       concurrent INSERT'ten ikincisi SQLSTATE 23P01
       (exclusion_violation) ile fail eder. DB client bunu
       `error.code` olarak yansıtır. `mapInsertError` service
       edge'inde bu code'u parse eder; repository'nin SQLSTATE
       bilgisi YOK — sadece error'u ham geçirir.
  =============================================================== */
  async insert(payload: Record<string, unknown>) {
    return await db
      .from("reservations")
      .insert(payload)
      .select()
      .single();
  },

  /* 🛡️ PHASE 3 (Stage 2): findByIdForPaymentLinkMail /
     findByIdForPaymentConfirmedMail / findByIdForBankTransferMail
     bu anon repository'den KALDIRILDI. Bu mail snapshot okumaları
     yalnız server route'larından (payment-link / payment-confirmed /
     bank-transfer) çağrılıyordu → service_role variant'larına taşındı:
       lib/db/reservation.repository.server.ts (reservationServerRepository)
     040 admin-only RLS sonrası server-anon SELECT reddedileceği için. */
};

/* ---------------------------------------------------------------
   🛡️ DEFAULT EXPORT YOK
   ---------------------------------------------------------------
   Villa repository pattern'i ile uyumlu: named export tercih
   edilir; accidental type-import drift'i önler.
=============================================================== */
