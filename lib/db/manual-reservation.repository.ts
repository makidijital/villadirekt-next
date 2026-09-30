import "server-only";

/* 🛡️ NATIVE CUTOVER (FAZ 4 S2 — reservation core) — native provider'a
   alındı. Tüm tüketiciler server (manualReservation.service, handler-inputs,
   fetchBlockedDates [server-only]). eski sağlayıcı importu tamamen kaldırıldı.
   `server-only` defansif sınır. Metod gövdeleri + embed + half-open overlap
   (.lt/.gt) + insert/update .select().single() (RETURNING) + SQL AYNEN. */
import { dbNative as db } from "@/lib/db/native";

/* ===============================================================
   🛡️ FAZ 34 — MANUAL RESERVATION REPOSITORY (Data Access Layer)
   ===============================================================
   AMAÇ (FAZ 0 mapping raporu):
     Manual-reservation domain'inde eski sağlayıcıyı tek katman aşağı
     it. Service / page / component artık eski sağlayıcı client'ı
     doğrudan tüketmez; bu repository üzerinden delege eder.

     bugün : service|component → eski sağlayıcı
     hedef : service → repository → eski sağlayıcı
             component → service → repository → eski sağlayıcı

   PRODUCTION-SAFE YAKLAŞIM (reservation.repository.ts paralel):
     - Query'ler BİREBİR aynı (filter chain, embed, single() vs.
       maybeSingle(), order pattern).
     - Return shape: native `{ data, error }`. Repository
       sessiz; throw YOK, console.error YOK.
     - SQLSTATE 23P01 / `manual_reservations_no_overlap` mapping
       bu dosyada YOK — service edge'inde (_helpers/errors.ts'e
       FAZ 4'te taşınacak veya inline kalacak).
     - Throw mesajları (TR human-friendly) bu dosyada YOK —
       service/helper tarafında.

   AGGREGATE BOUNDARY (FAZ 0 §5):
     - `manual_reservations` (own)
     - `reservations` (cross-table — calendar feed + cross
       overlap check için). Manuel flow'un kendi ihtiyacı;
       reservation repository'sinin `findOverlappingReservations`
       metodu REUSE EDİLMEZ (kullanıcı kuralı: shared overlap
       engine yapma).

   FAZ KAPSAMI:
     - FAZ 1'de READ metodları implement edildi (4 metod).
     - FAZ 2'de CONFLICT metodları eklendi (2 metod).
     - FAZ 3'te UPDATE/DELETE metodları eklendi.
     - FAZ 4'te INSERT metodu eklendi (availability/revenue-critical;
       byte-identical extraction).
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ OverlapWindow — repository scope local type
   ---------------------------------------------------------------
   Manual conflict check input shape. Reservation repository'deki
   `OverlapWindow` ile structurally identical; ama bu repo
   kendi local type'ını tutar (reservation repo'ya bağımlılık
   kurmayız — domain boundary korunsun).
=============================================================== */
export type OverlapWindow = {
  villa_id: string;
  start_date: string;
  end_date: string;
};

/* ---------------------------------------------------------------
   🛡️ SELECT shape SINGLE SOURCE-OF-TRUTH
   ---------------------------------------------------------------
   Orijinal pattern (manualReservation.service.ts L19, page.tsx L7).
   Field set + sıra BYTE-IDENTICAL.
=============================================================== */
const SELECT_MANUAL_DETAIL = `id, villa_id, start_date, end_date, note, source, status, created_at`;

const SELECT_MANUAL_LIST_WITH_VILLA = `id, start_date, end_date, note, created_at, villa:villa_id ( title )`;

const SELECT_MANUAL_BLOCK_RANGE = `id, start_date, end_date`;

const SELECT_RESERVATION_AVAILABILITY = `start_date, end_date, status`;

export const manualReservationRepository = {
  /* ===============================================================
     READ — DETAIL (`getManualReservationById` delege)
     ===============================================================
     Orijinal (manualReservation.service.ts L17-31):
       eski sağlayıcı
         .from("manual_reservations")
         .select("id, villa_id, start_date, end_date, note, source, status, created_at")
         .eq("id", id)
         .maybeSingle();
  =============================================================== */
  async findById(id: string) {
    return await db
      .from("manual_reservations")
      .select(SELECT_MANUAL_DETAIL)
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     READ — LIST (`manual-reservations/page.tsx > getManualReservations` delege)
     ===============================================================
     Orijinal (page.tsx > getManualReservations):
       eski sağlayıcı
         .from("manual_reservations")
         .select(`id, start_date, end_date, note, created_at, villa:villa_id ( title )`)
         .order("created_at", { ascending: false });

     ⚠️ Embed (`villa:villa_id ( title )`) PostgREST syntax; repository
        içinde aynen.
  =============================================================== */
  async findList() {
    return await db
      .from("manual_reservations")
      .select(SELECT_MANUAL_LIST_WITH_VILLA)
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     READ — ACTIVE RESERVATIONS BY VILLA (calendar feed cross-table)
     ===============================================================
     Orijinal (ManualReservationForm.tsx L120-124):
       eski sağlayıcı
         .from("reservations")
         .select("start_date, end_date, status")
         .eq("villa_id", selectedVilla)
         .in("status", ["pending", "confirmed"]);

     ⚠️ Cross-table; manual aggregate'in calendar feed ihtiyacı.
        Status allow-list HELPER/SERVICE tarafından parametre
        olarak geçer; repository allow-list'i bilmez.
     ⚠️ Reservation repository'sinin `findOverlappingReservations`
        metodu REUSE EDİLMEZ — manuel flow kendi sahipliğini tutar.
  =============================================================== */
  async findActiveReservationsByVilla(
    villaId: string,
    statuses: readonly string[]
  ) {
    return await db
      .from("reservations")
      .select(SELECT_RESERVATION_AVAILABILITY)
      .eq("villa_id", villaId)
      .in("status", statuses as unknown as string[]);
  },

  /* ===============================================================
     READ — MANUAL BLOCKS BY VILLA (calendar feed own-table)
     ===============================================================
     Orijinal (ManualReservationForm.tsx L129-132):
       eski sağlayıcı
         .from("manual_reservations")
         .select("id, start_date, end_date")
         .eq("villa_id", selectedVilla);

     ⚠️ Status filter YOK (manual blokların tamamı listelenir;
        manual asimetrisi). Order YOK (component-side parse).
     ⚠️ Self-exclude (`editingId === id`) component-side filter
        olarak kalır — service ham veri döner. Bu kasıtlı (byte
        identical disiplini; component parse loop'u dokunulmaz).
  =============================================================== */
  async findManualBlocksByVilla(villaId: string) {
    return await db
      .from("manual_reservations")
      .select(SELECT_MANUAL_BLOCK_RANGE)
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     READ — BLOCK DATE RANGES BY VILLA (edit-page calendar feed)
     ===============================================================
     Orijinal (fetchBlockedDates.ts):
       db.from("manual_reservations")
         .select("start_date, end_date")
         .eq("villa_id", villaId);

     ⚠️ `findManualBlocksByVilla`'dan FARKLI: select `id` YOK — yalnız
        start_date+end_date (fetchBlockedDates consumer id kullanmaz).
        CLIENT-SIDE consumer; anon `db` (browser JWT). Status/order YOK
        (manual asimetrisi). */
  async findBlockDateRangesByVilla(villaId: string) {
    return await db
      .from<{ start_date: string; end_date: string }>("manual_reservations")
      .select("start_date, end_date")
      .eq("villa_id", villaId);
  },

  /* ===============================================================
     CONFLICT — MANUAL SELF OVERLAP
     ===============================================================
     Orijinal:
       CREATE (manualReservation.service.ts L151-156):
         db.from("manual_reservations").select("id")
           .eq("villa_id", data.villa_id)
           .lt("start_date", data.end_date)
           .gt("end_date", data.start_date);

       UPDATE (L61-67):
         db.from("manual_reservations").select("id")
           .eq("villa_id", data.villa_id)
           .neq("id", id)
           .lt("start_date", data.end_date)
           .gt("end_date", data.start_date);

     ⚠️ KESIN KURAL:
       - Half-open overlap geometry (`.lt(start_date, end)` +
         `.gt(end_date, start)`) AYNEN — lockstep w/ reservation
         domain.
       - Self-exclude (`.neq("id", excludeId)`) sadece edit mode'da
         uygulanır; parametre ile geçer. Create flow'da excludeId
         undefined → predicate chain'e .neq EKLENMEZ.
       - `.select("id")` minimal projection.
       - Order YOK, limit YOK.
       - Repository sessiz; throw / console / TR mesajı YOK.

     CALLER (service inline body):
       - excludeId undefined → create flow (no self-exclude)
       - excludeId verilirse → update flow (kendini ignore)
       - Result.error → throw "Blok kontrol hatası".
       - Result.data.length > 0 → throw "Bu tarihler artık müsait
         değil".
  =============================================================== */
  async findOverlappingManualSelf(
    window: OverlapWindow,
    excludeId?: string
  ) {
    let query = db
      .from("manual_reservations")
      .select("id")
      .eq("villa_id", window.villa_id);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    return await query
      .lt("start_date", window.end_date)
      .gt("end_date", window.start_date);
  },

  /* ===============================================================
     CONFLICT — RESERVATIONS CROSS OVERLAP (manual flow)
     ===============================================================
     Orijinal:
       CREATE (manualReservation.service.ts L176-182):
         db.from("reservations").select("id")
           .eq("villa_id", data.villa_id)
           .in("status", ["pending", "confirmed"])
           .lt("start_date", data.end_date)
           .gt("end_date", data.start_date);

       UPDATE (L79-85): aynı pattern.

     ⚠️ KESIN KURAL:
       - Cross-table (manual flow → reservations). Manual
         aggregate'in kendi sahipliği; reservation repository
         REUSE EDİLMEZ (kullanıcı kuralı: shared overlap engine
         yapma).
       - Half-open overlap geometry AYNEN — lockstep.
       - Status allow-list HELPER/SERVICE tarafından parametre
         olarak geçer (`MANUAL_AVAILABILITY_BLOCKING_STATUSES`);
         repository allow-list'i bilmez.
       - `.select("id")` minimal projection.

     CALLER (service inline body):
       - Result.error → throw "Blok kontrol hatası".
       - Result.data.length > 0 → throw "Bu tarihler artık müsait
         değil".
  =============================================================== */
  async findOverlappingReservationsForManualBlock(
    window: OverlapWindow,
    statuses: readonly string[]
  ) {
    return await db
      .from("reservations")
      .select("id")
      .eq("villa_id", window.villa_id)
      .in("status", statuses as unknown as string[])
      .lt("start_date", window.end_date)
      .gt("end_date", window.start_date);
  },

  /* ===============================================================
     WRITE — UPDATE BY ID (updateManualReservation delege)
     ===============================================================
     Orijinal pattern (manualReservation.service.ts L103-108):
       db.from("manual_reservations")
         .update(payload)
         .eq("id", id)
         .select()
         .single();

     ⚠️ KESIN KURAL — BYTE-IDENTICAL CHAIN:
       - `.update(partial)` aynen.
       - `.select()` chain KORUNDU — updated row caller'a
         dönmesi gerek (`updateManualReservation` return value).
       - `.single()` resolver KORUNDU — caller bekliyor.
       - Predicate AYNEN: `.eq("id", id)` — başka filter YOK.
       - Payload shape orchestrator/service tarafında belirlenir;
         repository payload'a müdahil olmaz.
       - Return shape native `{ data, error }`. Repository
         sessiz; throw / console / SQLSTATE parse YOK.

     CALLER (service):
       - error.code === "23P01" + regex `manual_reservations_no_overlap`
         → throw "Bu tarihler artık müsait değil" (service edge).
       - Generic error → throw "Blok güncellenemedi".
       - Console.error tag `[manualReservation.update]:` aynen.
  =============================================================== */
  async updateById(id: string, partial: Record<string, unknown>) {
    return await db
      .from("manual_reservations")
      .update(partial)
      .eq("id", id)
      .select()
      .single();
  },

  /* ===============================================================
     WRITE — DELETE BY ID (ManualReservationList > handleDelete delege)
     ===============================================================
     Orijinal pattern (ManualReservationList.tsx L41-44):
       db.from("manual_reservations")
         .delete()
         .eq("id", id);

     ⚠️ KESIN KURAL:
       - Hard delete; soft-delete eklenmedi (business rule değişimi
         yasak).
       - Predicate AYNEN: `.eq("id", id)`.
       - Cascade YOK (service layer'da cascading cleanup yapılmaz;
         DB FK behavior'una bağlı).
       - `.select()` chain YOK (orijinal davranış: delete sonrası
         row dönmez; sadece error/success).
       - Return shape native `{ error }`. Repository
         sessiz; throw / console YOK.

     CALLER (service > deleteManualReservation, sonra component):
       - error → throw "Silinemedi" (veya pattern eslemediyse
         caller mevcut error semantic'ini sürdürür).
  =============================================================== */
  async deleteById(id: string) {
    return await db
      .from("manual_reservations")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     WRITE — INSERT (createManualReservation delege; AVAILABILITY-CRITICAL)
     ===============================================================
     Orijinal pattern (manualReservation.service.ts L207-211):
       const { data: inserted, error } = await eski sağlayıcı
         .from("manual_reservations")
         .insert([insertData])
         .select()
         .single();

     ⚠️ KESIN KURAL — BYTE-IDENTICAL CHAIN:
       - `.insert([payload])` aynen (ARRAY wrapper — orijinal
         davranış; tek-row INSERT array içinde geçer).
       - `.select()` chain KORUNDU — inserted row caller'a
         dönmesi gerek (`createManualReservation` return value
         + activity log entity_id).
       - `.single()` resolver KORUNDU.
       - Payload shape (`source: "manual"`, `status: "blocked"`
         literal'lar + 4 alan) orchestrator/service tarafında
         belirlenir; repository payload'a müdahil olmaz.
       - Return shape native `{ data, error }`. Repository
         sessiz; SQLSTATE 23P01 / `manual_reservations_no_overlap`
         parse + throw mesajları + console.error tag service
         edge'inde.

     🔥 EXCLUDE CONSTRAINT REFERANSI:
       `manual_reservations_no_overlap` DB-level atomik garanti —
       concurrent INSERT'ten ikincisi SQLSTATE 23P01 ile fail
       eder. Repository ham error'u geçirir; service edge'de
       parse edilip TR mesaja çevrilir ("Bu tarihler artık
       müsait değil").
  =============================================================== */
  async insert(payload: Record<string, unknown>) {
    return await db
      .from("manual_reservations")
      .insert([payload])
      .select()
      .single();
  },
};

/* ---------------------------------------------------------------
   🛡️ DEFAULT EXPORT YOK
   ---------------------------------------------------------------
   Villa + Reservation repository pattern'i ile uyumlu: named
   export tercih; accidental type-import drift'i önler.
=============================================================== */
