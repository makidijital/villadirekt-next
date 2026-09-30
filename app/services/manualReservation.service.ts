import { manualReservationRepository } from "@/lib/db/manual-reservation.repository";

/* ===============================================================
   🛡️ MANUAL RESERVATION SERVICE (FAZ 34 — repository delegation)
   ===============================================================
   FAZ 29 — Edit support eklendi:
     - getManualReservationById(id) — edit form data hidrate
     - updateManualReservation(id, data) — overlap check
       `.neq("id", id)` ile kendini ignore eder; DB-level EXCLUDE
       constraint kalan yarış koşullarını yine yakalar.
   Mevcut create flow (createManualReservation) dokunulmadı.

   FAZ 34 (repository extraction):
     Service artık eski sağlayıcıyı doğrudan tüketmez; DB I/O
     `manualReservationRepository.*` üzerinden delege edilir.
     Davranış BYTE-IDENTICAL — query'ler, select string'leri,
     resolver semantic'i, throw mesajları, console.error tag'leri,
     SQLSTATE 23P01 parse aynen.

     FAZ 1: READ extraction (getById + getManualReservations +
            getVillaAvailabilitySnapshot)
     FAZ 2: CONFLICT extraction (overlap helpers)
     FAZ 3: UPDATE/DELETE extraction
     FAZ 4: INSERT extraction (revenue/availability-critical)
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ AVAILABILITY ALLOW-LIST (lockstep w/ reservation domain)
   ---------------------------------------------------------------
   Manual flow'da cross-table reservation check ve calendar feed
   `pending` + `confirmed` allow-list'i kullanır. Reservation
   domain'in `AVAILABILITY_BLOCKING_STATUSES` ile lockstep;
   ama bu domain kendi kopyasını tutar (cross-domain import
   YOK — boundary disiplini).
=============================================================== */
export const MANUAL_AVAILABILITY_BLOCKING_STATUSES = [
  "pending",
  "confirmed",
] as const;

/* ---------------------------------------------------------------
   📦 GET single — admin edit form için
   ---------------------------------------------------------------
   FAZ 34: `db.from("manual_reservations")...` →
   `manualReservationRepository.findById(id)`. Davranış aynen:
     - !id → null (early return)
     - error → console.error tag + null return
     - data → return as-is
=============================================================== */
export const getManualReservationById = async (id: string) => {
  if (!id) return null;
  const { data, error } = await manualReservationRepository.findById(id);
  if (error) {
    console.error("[manualReservation.getById]", error.message);
    return null;
  }
  return data;
};

/* ---------------------------------------------------------------
   📦 GET list — admin liste sayfası için (page.tsx delege)
   ---------------------------------------------------------------
   FAZ 34: page.tsx'teki inline `getManualReservations()` fn'i
   service'e taşındı; page artık bu export'u tüketir. Davranış
   aynen:
     - SELECT embed (`villa:villa_id ( title )`) repo içinde
     - order created_at DESC
     - error → console.error + [] fallback
=============================================================== */
export const getManualReservations = async () => {
  const { data, error } = await manualReservationRepository.findList();
  if (error) {
    console.error("[manualReservation.list]", error.message);
    return [];
  }
  return data || [];
};

/* ---------------------------------------------------------------
   📦 GET availability snapshot — calendar feed
   ---------------------------------------------------------------
   ManualReservationForm > fetchBlockedDates orchestrator'ı için
   service-side fetch. İki cross-table read'i tek call altında
   toplar; component-side parse loop'u (checkin/checkout/blocked
   Date[] arrays) AYNEN korunur — bu service ham veri döner,
   parse component'in işi.

   ⚠️ KESIN KURAL:
     - Status allow-list `["pending", "confirmed"]` —
       MANUAL_AVAILABILITY_BLOCKING_STATUSES; lockstep
       w/ reservation domain.
     - Manual blokların TAMAMI döner (status filter YOK; manual
       asimetrisi).
     - Self-exclude (`editingId === id`) component-side filter
       olarak kalır — service raw döner. Byte-identical disiplini.
     - Error case: ham veri yerine boş array (`[]`) döner;
       console.error tag emit edilir. Component bu durumda
       calendar boş feed görür (mevcut davranış).
=============================================================== */
export const getVillaAvailabilitySnapshot = async (
  villaId: string
): Promise<{
  reservations: Array<{
    start_date: string;
    end_date: string;
    status: string;
  }>;
  manualBlocks: Array<{
    id: string;
    start_date: string;
    end_date: string;
  }>;
}> => {
  if (!villaId) {
    return { reservations: [], manualBlocks: [] };
  }

  /* 🛡️ AVAILABILITY ALLOW-LIST (Faz 2B):
     Manual blok form'unda yalnız `pending` ve `confirmed`
     rezervasyonların tarihleri calendar'a blocking yansımalı.
     `rejected` / `cancelled` boş. */
  const { data: reservations, error: reservationsError } =
    await manualReservationRepository.findActiveReservationsByVilla(
      villaId,
      MANUAL_AVAILABILITY_BLOCKING_STATUSES
    );

  if (reservationsError) {
    console.error(
      "[manualReservation.availability.reservations]",
      reservationsError.message
    );
  }

  /* 🛡️ FAZ 29 — id select edildi, edit mode'da kendini exclude
     etmek için. Mevcut create flow'unda payload üzerinde etkisiz
     (3 alan döner, ekstra "id" string'i göz ardı edilir). */
  const { data: manual, error: manualError } =
    await manualReservationRepository.findManualBlocksByVilla(villaId);

  if (manualError) {
    console.error(
      "[manualReservation.availability.manual]",
      manualError.message
    );
  }

  return {
    reservations:
      (reservations as Array<{
        start_date: string;
        end_date: string;
        status: string;
      }> | null) || [],
    manualBlocks:
      (manual as Array<{
        id: string;
        start_date: string;
        end_date: string;
      }> | null) || [],
  };
};

/* ---------------------------------------------------------------
   💾 UPDATE — admin edit form save
   ---------------------------------------------------------------
   - Mevcut row için partial update; sadece tanımlı alanlar yazılır
   - Overlap kontrolü create flow ile birebir aynı kural ama
     **kendini ignore** eder (`.neq("id", id)`)
   - DB EXCLUDE constraint half-open `[)` semantic AYNEN korunur;
     race condition'da SQLSTATE 23P01 ile yine yakalanır
*/
export const updateManualReservation = async (
  id: string,
  data: {
    villa_id?: string;
    start_date?: string;
    end_date?: string;
    note?: string | null;
  }
) => {
  if (!id) throw new Error("ID gerekli");

  /* Tarih veya villa değişiyorsa fast-path overlap check */
  if (data.start_date && data.end_date && data.villa_id) {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    /* 🛡️ ZERO-NIGHT FIX — half-open [start,end) gereği aynı gün
       (start == end) geçersiz; `>` yerine `>=` ile tek günlük blok
       reddedilir. Rezervasyon servisiyle (start >= end) parite. */
    if (start >= end) throw new Error("Tarih aralığı hatalı");

    /* SELF conflict — kendi id'sini exclude et.
       Diğer manual_reservations rows ile çakışma varsa engelle.
       FAZ 34: DB I/O `manualReservationRepository.findOverlappingManualSelf`
       üzerinden delege; `.neq("id", excludeId)` predicate repo
       içinde aynen uygulanır. */
    const { data: selfConflict, error: selfErr } =
      await manualReservationRepository.findOverlappingManualSelf(
        {
          villa_id: data.villa_id,
          start_date: data.start_date,
          end_date: data.end_date,
        },
        id
      );

    if (selfErr) {
      console.error("[manualReservation.update] self check:", selfErr.message);
      throw new Error("Blok kontrol hatası");
    }
    if (selfConflict && selfConflict.length > 0) {
      throw new Error("Bu tarihler artık müsait değil");
    }

    /* CROSS conflict — reservations (pending/confirmed allow-list).
       Manual_reservations farklı tablo, id çakışması olmaz.
       FAZ 34: DB I/O `manualReservationRepository.findOverlappingReservationsForManualBlock`
       üzerinden delege; status allow-list parametre olarak geçer. */
    const { data: resConflict, error: resErr } =
      await manualReservationRepository.findOverlappingReservationsForManualBlock(
        {
          villa_id: data.villa_id,
          start_date: data.start_date,
          end_date: data.end_date,
        },
        MANUAL_AVAILABILITY_BLOCKING_STATUSES
      );

    if (resErr) {
      console.error("[manualReservation.update] cross check:", resErr.message);
      throw new Error("Blok kontrol hatası");
    }
    if (resConflict && resConflict.length > 0) {
      throw new Error("Bu tarihler artık müsait değil");
    }
  }

  /* Partial update payload */
  const payload: Record<string, unknown> = {};
  if (data.villa_id !== undefined) payload.villa_id = data.villa_id;
  if (data.start_date !== undefined) payload.start_date = data.start_date;
  if (data.end_date !== undefined) payload.end_date = data.end_date;
  if (data.note !== undefined) payload.note = data.note;

  /* FAZ 34: DB I/O `manualReservationRepository.updateById` üzerinden
     delege. Predicate (.eq("id", id)), .select().single() chain
     repo içinde aynen; SQLSTATE 23P01 parse + throw mesajları
     service edge'inde. */
  const { data: updated, error } =
    await manualReservationRepository.updateById(id, payload);

  if (error) {
    console.error("[manualReservation.update]:", error.message);
    /* DB EXCLUDE constraint violation — concurrent race */
    if (
      (error as { code?: string }).code === "23P01" ||
      /manual_reservations_no_overlap/i.test(error.message || "")
    ) {
      throw new Error("Bu tarihler artık müsait değil");
    }
    throw new Error("Blok güncellenemedi");
  }

  return updated;
};

/* ---------------------------------------------------------------
   🗑️ DELETE — admin list component için
   ---------------------------------------------------------------
   FAZ 34: ManualReservationList.tsx > handleDelete inline eski sağlayıcı
   call'ı service'e taşındı. Component artık service'ten tüketir;
   audit log + toast + UI state component'te kalır (UI concerns).
   Davranış BYTE-IDENTICAL:
     - !id → throw "ID gerekli" (defensive guard; pre-FAZ component
       hiç check etmiyordu; service'te guard eklemek SUSTAINABLE
       ama davranış değişimi olur → guard EKLENMEDİ; aynen).
     - error → throw (caller toast.error gösterir; "Silinemedi"
       mesajı caller-side default).
     - success → return true.
=============================================================== */
export const deleteManualReservation = async (id: string) => {
  const { error } = await manualReservationRepository.deleteById(id);
  if (error) {
    /* Caller (component) zaten try/catch'te toast.error gösteriyor;
       throw original error pattern korunur. */
    throw error;
  }
  return true;
};

export const createManualReservation = async (data: {
  villa_id: string;
  start_date: string;
  end_date: string;
  note?: string;
}) => {
  // 🔥 VALIDATION
  if (!data.villa_id) throw new Error("Villa seçilmedi");
  if (!data.start_date || !data.end_date)
    throw new Error("Tarih seçilmedi");

  const start = new Date(data.start_date);
  const end = new Date(data.end_date);

  /* 🛡️ ZERO-NIGHT FIX — half-open [start,end) gereği aynı gün
     (start == end) geçersiz; `>` yerine `>=` ile tek günlük blok
     reddedilir. Rezervasyon servisiyle (start >= end) parite. */
  if (start >= end) throw new Error("Tarih aralığı hatalı");

  /* ================================
     🔥 ÇAKIŞMA KONTROLÜ — UX FAST-PATH
     =================================
     manual_reservations üzerinde DB-level EXCLUDE constraint var
     (db/migrations/001_reservations_no_overlap.sql →
      manual_reservations_no_overlap). Aşağıdaki SELECT'ler:
       - manual blok ↔ manual blok adjacency check
       - manual blok ↔ reservations cross-check
     erken kullanıcı feedback'i için. Atomik garanti DB constraint'inde.
  =================================*/
  /* FAZ 34: DB I/O `manualReservationRepository.findOverlappingManualSelf`
     üzerinden delege; excludeId YOK (create flow) — predicate
     chain'e `.neq` eklenmez. Half-open geometry repo içinde aynen. */
  const { data: selfConflict, error: selfConflictError } =
    await manualReservationRepository.findOverlappingManualSelf({
      villa_id: data.villa_id,
      start_date: data.start_date,
      end_date: data.end_date,
    });

  if (selfConflictError) {
    console.error(
      "❌ Manual self conflict error:",
      selfConflictError.message
    );
    throw new Error("Blok kontrol hatası");
  }
  if (selfConflict && selfConflict.length > 0) {
    throw new Error("Bu tarihler artık müsait değil");
  }

  /* 🛡️ AVAILABILITY SEMANTIC (Faz 2B):
     Manual blok eklenirken reservations tablosunda yalnız `pending`
     ve `confirmed` çakışması bloklayıcı sayılır. `rejected` ve
     `cancelled` müsait. Önceden `.neq("status","rejected")` cancelled
     rezervasyonu da blocking gösteriyordu → admin manual blok
     eklediği villa boş olsa bile "Bu tarihler artık müsait değil"
     hatası alıyordu. Allow-list ile düzeltildi.

     FAZ 34: DB I/O `manualReservationRepository.findOverlappingReservationsForManualBlock`
     üzerinden delege; status allow-list `MANUAL_AVAILABILITY_BLOCKING_STATUSES`
     parametre olarak geçer. */
  const { data: resConflict, error: resConflictError } =
    await manualReservationRepository.findOverlappingReservationsForManualBlock(
      {
        villa_id: data.villa_id,
        start_date: data.start_date,
        end_date: data.end_date,
      },
      MANUAL_AVAILABILITY_BLOCKING_STATUSES
    );

  if (resConflictError) {
    console.error(
      "❌ Manual cross conflict error:",
      resConflictError.message
    );
    throw new Error("Blok kontrol hatası");
  }
  if (resConflict && resConflict.length > 0) {
    throw new Error("Bu tarihler artık müsait değil");
  }

  // 🔥 INSERT
  const insertData = {
    villa_id: data.villa_id,
    start_date: data.start_date,
    end_date: data.end_date,
    note: data.note || null,

    // ✅ AÇTIK
    source: "manual",
    status: "blocked",
  };

  /* FAZ 34: DB I/O `manualReservationRepository.insert` üzerinden
     delege. `.insert([...]).select().single()` chain repo içinde
     aynen; SQLSTATE 23P01 parse + console.error tag + throw
     mesajları service edge'inde. */
  const { data: inserted, error } =
    await manualReservationRepository.insert(insertData);

  if (error) {
    console.error("❌ Manual insert error:", error.message);
    // 🔥 EXCLUDE CONSTRAINT VIOLATION — DB-level race yakalandı
    if (
      (error as { code?: string }).code === "23P01" ||
      /manual_reservations_no_overlap/i.test(error.message || "")
    ) {
      throw new Error("Bu tarihler artık müsait değil");
    }
    throw new Error("Blok eklenemedi");
  }

  return inserted;
};