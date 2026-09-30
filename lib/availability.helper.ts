import { reservationRepository } from "@/lib/db/reservation.repository";

/* FAZ 51B — pure validators (isValidYmd / isValidRange /
   AVAILABILITY_BLOCKING_STATUSES) artık lib/availability.validator.ts
   içinde. Bu dosya onları RE-EXPORT eder; mevcut tüm consumer
   import path'leri (`@/lib/availability.helper`) byte-identical
   çalışmaya devam eder. Test ortamı pure validatorları doğrudan
   `@/lib/availability.validator`'dan import ederek eski sağlayıcı
   module-load yan etkisini atlar.

   ⚠️ `export { x } from "..."` re-export sözdizimi local scope'a
   binding YAPMAZ — yalnız dışa yayar. `getBlockedVillaIds` aynı
   dosya içinde `isValidYmd` ve `AVAILABILITY_BLOCKING_STATUSES`
   kullandığı için ek bir IMPORT gerekir. İki ifade ayrı: import
   local binding üretir, export re-export yapar. */
import { isValidYmd } from "@/lib/availability.validator";

export {
  isValidYmd,
  isValidRange,
  AVAILABILITY_BLOCKING_STATUSES,
} from "@/lib/availability.validator";

/* ===============================================================
   🛡️ AVAILABILITY HELPER — SINGLE SOURCE-OF-TRUTH FOR
   HALF-OPEN [start, end) OVERLAP CHECKING
   ===============================================================
   ⚠️ READ THIS BEFORE TOUCHING:

   Bu helper, app/services/reservation.service.ts >
   createReservation içindeki "AVAILABILITY SEMANTIC (Faz 2B)"
   bloğuyla BİREBİR aynı SQL clause'larını kullanır. Eğer
   reservation overlap kuralları değişirse, bu helper LOCKSTEP
   güncellenmek ZORUNDADIR — aksi halde /arama'da gösterilen
   villalar gerçekte bookable olmayanlardan sapar (veya tersi).

   Reservation tarafı bu helper'ı çağırmaz (createReservation'daki
   inline check fast-path UX feedback için; gerçek atomik garanti
   DB EXCLUDE constraint `reservations_no_overlap` migration
   001'den gelir). Burada bu mantığı **read-only listing filtresi**
   olarak yeniden kullanıyoruz.

   SEMANTIC (reservation.service.ts ile byte-identical):
     1) reservations tablosu:
          status ∈ {"pending","confirmed"} → blocking
          status ∈ {"rejected","cancelled", ...future} → free
        Allow-list; forward-compat (yeni status default'ta non-blocking).
     2) manual_reservations tablosu:
          tüm satırlar blocking (admin-curated holds).
     3) FAZ 56C — external_calendar_events tablosu:
          is_active=true satırlar blocking (Airbnb/Booking/VRBO sync).
          source/raw_ical join YOK — yalnız villa_id okunur.
          RLS authenticated-only olduğu için service-role client
          kullanılır (lib/eski sağlayıcı-admin). Çıktıda yalnız villa_id
          Set'i yer alır → PII expose YOK.
     4) Overlap test (half-open [) interval intersection):
          existing.start_date <  range.end
          existing.end_date   >  range.start
        Aynı gün checkout/checkin müsait:
          Existing 1–5, Range 5–10 → 1<10 ✓ AND 5>5 ✗ → no overlap
          Existing 1–5, Range 4–7  → 1<7  ✓ AND 5>4 ✓ → overlap

   PARAMETERS:
     - start/end: YYYY-MM-DD (lokal). Hero.tsx formatDate(...) ile
       birebir aynı format. Hiçbir UTC conversion yapılmaz; tüm
       comparison Postgres tarafında DATE-level çalışır.

   FAILURE MODE:
     - DB query hata verirse: log + boş Set döner (permissive).
       /arama bu durumda eski davranışa düşer (tüm villalar);
       overbooking yine DB EXCLUDE constraint tarafından engellenir.
   =============================================================== */

/* FAZ 51B — `AVAILABILITY_BLOCKING_STATUSES`, `isValidYmd`,
   `isValidRange` inline tanımlar bu dosyadan kaldırıldı; pure modül
   `lib/availability.validator.ts`'ye taşındı ve dosya tepesinden
   re-export ediliyor. Davranış byte-identical. */

/* ===============================================================
   🔥 getBlockedVillaIds(start, end, villaIds?)
   ===============================================================
   Given half-open [start, end) için BLOCK olan villa_id Set'i.
   Invalid/empty range → boş Set (caller filter uygulamaz).

   UNIFIED AVAILABILITY SEMANTIC — calendar (AvailabilityInlineCalendar
   `.eq("villa_id", id).in("status",[pending,confirmed])` ve aynı
   tablo için manual_reservations `.eq("villa_id", id)`) ile birebir
   aynı blocking kuralı. Buradaki tek farklılık: per-villa loop
   yerine **batch** çalışıyoruz (`.in("villa_id", villaIds)`).
   Sonuç olarak: takvimde bloklu görünen herhangi bir villa,
   aynı tarih aralığında aramada da gizli.

   Block kuralları (üç kaynak için ayrı ayrı, OR ile birleşir):
     reservations:
       status ∈ {pending, confirmed}
       AND start_date < range.end
       AND end_date   > range.start
     manual_reservations:
       (status filtresi YOK — tüm manuel bloklar blocking)
       start_date < range.end
       AND end_date   > range.start
     external_calendar_events  (FAZ 56C):
       is_active = true
       AND start_date < range.end
       AND end_date   > range.start
       → service-role (anon RLS deny); index `external_calendar_events_overlap_idx`
         (villa_id, start_date, end_date) WHERE is_active=true.

   PERFORMANS:
     - 3 paralel SELECT (Promise.all)
     - villaIds verildiyse `.in("villa_id", villaIds)` ile
       sadece kısa listede olanlar dönüyor → daha az satır.
     - Sonuç birleştirme: O(N) Set.add döngüsü.
     - External query fail-safe: IIFE içinde try/catch; service-role
       erişimi yoksa veya query patlasa boş döner — reservations +
       manual_reservations availability path'i ASLA kırılmaz.
=============================================================== */
export async function getBlockedVillaIds(
  start: string | null | undefined,
  end: string | null | undefined,
  villaIds?: string[]
): Promise<Set<string>> {
  const blocked = new Set<string>();

  if (!isValidYmd(start) || !isValidYmd(end)) return blocked;
  if (!(start < end)) return blocked;

  /* Defensive: villaIds verildiyse ama boş array ise → block edecek
     hiçbir aday villa yok → boş Set (zaten filter no-op olur). */
  if (Array.isArray(villaIds) && villaIds.length === 0) return blocked;

  /* 🛡️ PII-SAFE AVAILABILITY — SECURITY DEFINER RPC (migration 039).
     ----------------------------------------------------------------
     ESKİ: anon `db.from("reservations"/"manual_reservations")
     .select("villa_id")` + service-role external query. 040 admin-only
     RLS sonrası anon SELECT reddedilirdi.
     YENİ: tek RPC `get_blocked_villa_ids` — reservations(pending/
     confirmed) + manual + external(active) blocking birleşimini DB
     içinde (definer, RLS-bypass) hesaplar; YALNIZ villa_id döner.
     PII (isim/telefon/email/fiyat) browser'a / anon'a ASLA gelmez.
     Allow-list + half-open overlap + external dahiliyeti RPC içinde —
     `AVAILABILITY_BLOCKING_STATUSES` ile lockstep semantic korunur.
     FAIL-SOFT: RPC hatasında boş Set döner (eski permissive davranış;
     overbooking yine DB EXCLUDE constraint ile engellenir). */
  const scoped =
    Array.isArray(villaIds) && villaIds.length > 0 ? villaIds : null;

  const { data, error } = await reservationRepository.getBlockedVillaIdsRpc(
    start,
    end,
    scoped
  );

  if (error) {
    console.error(
      "[availability.helper] get_blocked_villa_ids RPC error (fail-soft):",
      error.message
    );
    return blocked;
  }

  for (const id of (data as string[] | null) || []) {
    if (id) blocked.add(String(id));
  }

  return blocked;
}
