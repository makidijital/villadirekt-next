import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

/* ===============================================================
   🛡️ PHASE 3 — conflict helpers UNIT TESTS (post-RPC migration)
   ===============================================================
   `_helpers/conflict.ts > checkReservationConflict` artık DB I/O'sunu
   anon `findOverlapping*` SELECT'leri yerine PII-safe SECURITY DEFINER
   RPC üzerinden yapıyor:
     `reservationRepository.checkAvailabilityConflict(window)` →
     `check_villa_availability_conflict` RPC → boolean.

   Bu testler şunu freeze eder:
     - data === true → throw "Bu tarihler dolu".
     - error → console.error("❌ Conflict error:", msg) + throw
       "Rezervasyon kontrol hatası".
     - data === false / null → no throw (resolve undefined).
     - window repository'ye OLDUĞU GİBİ geçer.
     - checkManualBlockConflict artık NO-OP (manual overlap'ı combined
       RPC kapsıyor) → her zaman resolve, repository ÇAĞIRMAZ.
     - AVAILABILITY_BLOCKING_STATUSES allow-list regression guard korunur.

   ⚠️ Repository MOCK'lanır — gerçek eski sağlayıcı/RPC çağrısı yapılmaz.
=============================================================== */

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    checkAvailabilityConflict: vi.fn(),
  },
}));

import {
  checkReservationConflict,
  checkManualBlockConflict,
  AVAILABILITY_BLOCKING_STATUSES,
} from "@/app/services/reservation/_helpers/conflict";
import { reservationRepository } from "@/lib/db/reservation.repository";

const WINDOW = {
  villa_id: "villa-1",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
} as const;

type ConflictResult = Awaited<
  ReturnType<typeof reservationRepository.checkAvailabilityConflict>
>;

describe("AVAILABILITY_BLOCKING_STATUSES — allow-list regression guard", () => {
  it("equals exactly ['pending','confirmed'] (lockstep w/ availability RPC)", () => {
    expect(AVAILABILITY_BLOCKING_STATUSES).toEqual(["pending", "confirmed"]);
  });

  it("does NOT contain 'rejected' or 'cancelled'", () => {
    expect(AVAILABILITY_BLOCKING_STATUSES).not.toContain("rejected");
    expect(AVAILABILITY_BLOCKING_STATUSES).not.toContain("cancelled");
  });
});

describe("checkReservationConflict — no overlap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves silently when RPC returns false", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: false,
      error: null,
    } as unknown as ConflictResult);

    await expect(checkReservationConflict(WINDOW)).resolves.toBeUndefined();
  });

  it("resolves silently when RPC returns null data + null error", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: null,
      error: null,
    } as unknown as ConflictResult);

    await expect(checkReservationConflict(WINDOW)).resolves.toBeUndefined();
  });
});

describe("checkReservationConflict — overlap found", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 'Bu tarihler dolu' when RPC returns true", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: true,
      error: null,
    } as unknown as ConflictResult);

    await expect(checkReservationConflict(WINDOW)).rejects.toThrow(
      "Bu tarihler dolu"
    );
  });
});

describe("checkReservationConflict — query error", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("throws 'Rezervasyon kontrol hatası' when RPC error present", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: null,
      error: { message: "DB down" },
    } as unknown as ConflictResult);

    await expect(checkReservationConflict(WINDOW)).rejects.toThrow(
      "Rezervasyon kontrol hatası"
    );
  });

  it("emits console.error('❌ Conflict error:', error.message) before throw", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: null,
      error: { message: "boom" },
    } as unknown as ConflictResult);

    await expect(checkReservationConflict(WINDOW)).rejects.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Conflict error:", "boom");
  });
});

describe("checkReservationConflict — repository contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes window UNCHANGED to checkAvailabilityConflict (single call)", async () => {
    vi.mocked(reservationRepository.checkAvailabilityConflict).mockResolvedValue({
      data: false,
      error: null,
    } as unknown as ConflictResult);

    await checkReservationConflict(WINDOW);

    expect(reservationRepository.checkAvailabilityConflict).toHaveBeenCalledTimes(1);
    expect(reservationRepository.checkAvailabilityConflict).toHaveBeenCalledWith(
      WINDOW
    );
  });
});

describe("checkManualBlockConflict — NO-OP (combined RPC covers manual)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always resolves undefined", async () => {
    await expect(checkManualBlockConflict(WINDOW)).resolves.toBeUndefined();
  });

  it("does NOT call the repository (manual overlap handled by combined RPC)", async () => {
    await checkManualBlockConflict(WINDOW);
    expect(
      reservationRepository.checkAvailabilityConflict
    ).not.toHaveBeenCalled();
  });
});
