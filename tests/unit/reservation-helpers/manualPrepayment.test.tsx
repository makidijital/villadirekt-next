/* ===============================================================
   🛡️ MANUEL "ŞİMDİ ÖDENECEK TUTAR" (prepayment_amount) — regresyon
   ===============================================================
   Senaryo: toplam 56.000, otomatik ön ödeme 11.200 (%20),
   admin 20.000 girer → DB prepayment_amount = 20.000,
   paid_amount DEĞİŞMEZ → "Ödeme Bilgilerini Gönder" maili 20.000.
   Ayrıca: manuel değişiklik yoksa builder çıktısı ESKİSİYLE AYNI.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";

import { buildNormalPayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildNormalPayload";
import { buildCustomPricePayload } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/buildCustomPricePayload";
import {
  computeAutoPrepayment,
  resolveManualPrepayment,
  withLoadedPrepaymentLock,
} from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/manualPrepayment";
import PaymentCard from "@/app/(admin)/maki-admin/reservations/[id]/_components/PaymentCard";
import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";
import { buildUpdateReservationPayload } from "@/app/services/reservation/_helpers/payload-update";
import { asReservation, baseReservation } from "./_fixtures";

/* ---------------- Mail route mock'ları (yalnız dış bağımlılıklar) ---------------- */
let dbRow: Record<string, unknown> = {};
const sentMails: Array<{ html: string; mailType: string }> = [];

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminCaller: async () => ({ ok: true, caller: { id: "admin-1" } }),
}));
vi.mock("@/lib/auth/action-authz", () => ({
  callerHasPermission: async () => true,
  FORBIDDEN_MESSAGE: "forbidden",
}));
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: {
    findByIdForBankTransferMail: async () => ({ data: dbRow, error: null }),
    findByIdForPaymentLinkMail: async () => ({ data: dbRow, error: null }),
    updateById: async () => ({ error: null }),
  },
}));
vi.mock("@/app/lib/mail/send", () => ({
  sendMail: async (m: { html: string; mailType: string }) => {
    sentMails.push({ html: m.html, mailType: m.mailType });
    return { ok: true, id: "mail-1" };
  },
}));
vi.mock("@/app/lib/mail/client", () => ({
  getMailConfig: async () => ({ fromName: "Test", brandLogoUrl: null }),
}));
vi.mock("@/lib/payment-account.server", () => ({
  getActivePaymentAccount: async () => ({
    bank_name: "Test Bank",
    account_holder: "Test Holder",
    iban: "TR000000000000000000000000",
    currency: "TRY",
    is_active: true,
  }),
}));
vi.mock("@/lib/western-union-account.server", () => ({
  getActiveWesternUnionAccount: async () => ({ recipient_name: "WU Test" }),
}));

import { POST as bankTransferPOST } from "@/app/api/mail/bank-transfer-payment/route";
import { POST as paymentLinkPOST } from "@/app/api/mail/payment-link/route";
import { POST as westernUnionPOST } from "@/app/api/mail/western-union-payment/route";

/* ---------------- Fixture: 56.000 / %20 → 11.200 ---------------- */
const RATE = 20;
const scenario = (over: Partial<ReservationDetailData> = {}) =>
  asReservation({
    ...baseReservation,
    total_price: 56000,
    total_price_try: 56000,
    cleaning_fee_try: 0,
    pool_heating_total_try: 0,
    prepayment_amount: 11200,
    remaining_payment: 44800,
    paid_amount: 0,
    payment_preference: "prepayment",
    ...over,
  } as never);

const build = (data: ReservationDetailData) =>
  buildNormalPayload({ data, guestNames: [], priceDetail: null, prepaymentRate: RATE });

describe("computeAutoPrepayment", () => {
  it("56.000 toplam, %20 → 11.200 (builder'ın otomatik değeriyle aynı)", () => {
    const data = scenario();
    expect(computeAutoPrepayment({ data, priceDetail: null, prepaymentRate: RATE })).toBe(11200);
    expect(build(data).prepayment_amount).toBe(11200);
  });
  it("custom price: round(total × oran / 100)", () => {
    const data = scenario({ custom_price: true, cleaning_fee_try: 3000 });
    const auto = computeAutoPrepayment({ data, priceDetail: null, prepaymentRate: RATE });
    const payload = buildCustomPricePayload({ data, guestNames: [], prepaymentRate: RATE });
    expect(auto).toBe(11200);
    expect(payload.prepayment_amount).toBe(auto);
  });
  it("normal: temizlik + havuz ısıtma ön ödemeye girmez (builder ile aynı)", () => {
    const data = scenario({ cleaning_fee_try: 4000, pool_heating_total_try: 2000 });
    const auto = computeAutoPrepayment({ data, priceDetail: null, prepaymentRate: RATE });
    expect(auto).toBe(Math.round(((56000 - 4000 - 2000) * RATE) / 100));
    expect(build(data).prepayment_amount).toBe(auto);
  });
});

describe("resolveManualPrepayment / withLoadedPrepaymentLock", () => {
  it("kilit yoksa null (otomatik hesap)", () => {
    expect(resolveManualPrepayment(scenario({ prepayment_amount: 20000 }), 56000)).toBeNull();
  });
  it("geçerli kilit → değer", () => {
    expect(
      resolveManualPrepayment(
        scenario({ prepayment_amount: 20000, prepayment_manual_amount: 20000 }),
        56000
      )
    ).toBe(20000);
  });
  it("state kilitten farklıysa (recalc) → null", () => {
    expect(
      resolveManualPrepayment(
        scenario({ prepayment_amount: 12000, prepayment_manual_amount: 20000 }),
        56000
      )
    ).toBeNull();
  });
  it("0, negatif, toplamı aşan → null; toplama eşit → kabul", () => {
    for (const v of [0, -5, 56001]) {
      expect(
        resolveManualPrepayment(
          scenario({ prepayment_amount: v, prepayment_manual_amount: v }),
          56000
        )
      ).toBeNull();
    }
    expect(
      resolveManualPrepayment(
        scenario({ prepayment_amount: 56000, prepayment_manual_amount: 56000 }),
        56000
      )
    ).toBe(56000);
  });
  it("full_payment → null", () => {
    expect(
      resolveManualPrepayment(
        scenario({
          payment_preference: "full_payment",
          prepayment_amount: 20000,
          prepayment_manual_amount: 20000,
        }),
        56000
      )
    ).toBeNull();
  });
  it("yüklemede yalnız prepayment tercihinde kilitler (string numeric dahil)", () => {
    expect(
      withLoadedPrepaymentLock({ payment_preference: "prepayment", prepayment_amount: "20000" })
    ).toMatchObject({ prepayment_manual_amount: 20000 });
    expect(
      withLoadedPrepaymentLock({ payment_preference: null, prepayment_amount: 20000 })
    ).toMatchObject({ prepayment_manual_amount: 20000 });
    const full = withLoadedPrepaymentLock({ payment_preference: "full_payment", prepayment_amount: 56000 });
    expect("prepayment_manual_amount" in full).toBe(false);
    const empty = withLoadedPrepaymentLock({ payment_preference: "prepayment", prepayment_amount: null });
    expect("prepayment_manual_amount" in empty).toBe(false);
    expect(withLoadedPrepaymentLock(null)).toBeNull();
  });
});

describe("buildNormalPayload / buildCustomPricePayload — manuel ön ödeme", () => {
  it("manuel değişiklik yoksa çıktı otomatik hesapla AYNI (mevcut davranış)", () => {
    const data = scenario({ prepayment_amount: 9999 });
    const payload = build(data);
    expect(payload.prepayment_amount).toBe(11200);
    expect(payload.remaining_payment).toBe(44800);
  });
  it("manuel 20.000 → prepayment 20.000, remaining 36.000, paid_amount DEĞİŞMEZ", () => {
    for (const paid of [0, 5000]) {
      const payload = build(
        scenario({ prepayment_amount: 20000, prepayment_manual_amount: 20000, paid_amount: paid })
      );
      expect(payload.prepayment_amount).toBe(20000);
      expect(payload.remaining_payment).toBe(36000);
      expect(payload.paid_amount).toBe(paid);
      expect(payload.total_price_try).toBe(56000);
    }
  });
  it("full_payment davranışı aynen: prepayment = toplam, remaining = 0", () => {
    const payload = build(
      scenario({
        payment_preference: "full_payment",
        prepayment_amount: 20000,
        prepayment_manual_amount: 20000,
      })
    );
    expect(payload.prepayment_amount).toBe(56000);
    expect(payload.remaining_payment).toBe(0);
  });
  it("custom price: manuel 20.000 korunur, paid_amount değişmez", () => {
    const payload = buildCustomPricePayload({
      data: scenario({
        custom_price: true,
        prepayment_amount: 20000,
        prepayment_manual_amount: 20000,
        paid_amount: 0,
      }),
      guestNames: [],
      prepaymentRate: RATE,
    });
    expect(payload.prepayment_amount).toBe(20000);
    expect(payload.remaining_payment).toBe(36000);
    expect(payload.paid_amount).toBe(0);
  });
});

/* ---------------- PaymentCard (UI) ---------------- */
function Harness({ initial, auto }: { initial: ReservationDetailData; auto: number }) {
  const [data, setData] = useState<Record<string, unknown>>(initial as never);
  return (
    <>
      <PaymentCard data={data} setData={setData as never} autoPrepayment={auto} />
      <pre data-testid="state">{JSON.stringify(data)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent || "{}");
const payNowInput = () =>
  screen.getByText("Şimdi Ödenecek Tutar (TRY)").parentElement!.querySelector("input")!;
const paidInput = () =>
  screen.getByText("Alınan tutar (TRY)").parentElement!.querySelector("input")!;

describe("PaymentCard — Şimdi Ödenecek Tutar", () => {
  it("20.000 girişi prepayment_amount'ı yazar, paid_amount'a dokunmaz", () => {
    render(<Harness initial={withLoadedPrepaymentLock(scenario())} auto={11200} />);
    expect(payNowInput().value).toBe("11200");
    fireEvent.change(payNowInput(), { target: { value: "20000" } });
    expect(state()).toMatchObject({
      prepayment_amount: 20000,
      prepayment_manual_amount: 20000,
      paid_amount: 0,
    });
    /* Mevcut "Alınan tutar" inputu aynen paid_amount'ı düzenler. */
    expect(paidInput().value).toBe("0");
    fireEvent.change(paidInput(), { target: { value: "5000" } });
    expect(state()).toMatchObject({ paid_amount: 5000, prepayment_amount: 20000 });
  });
  it("negatif → 0, toplamı aşan → toplam (kabul edilmez)", () => {
    render(<Harness initial={scenario()} auto={11200} />);
    fireEvent.change(payNowInput(), { target: { value: "-50" } });
    expect(state().prepayment_amount).toBe(0);
    fireEvent.change(payNowInput(), { target: { value: "99999" } });
    expect(state().prepayment_amount).toBe(56000);
  });
  it("Otomatik Ön Ödemeyi Doldur → 11.200 ve kilit kalkar", () => {
    render(
      <Harness
        initial={scenario({ prepayment_amount: 20000, prepayment_manual_amount: 20000 })}
        auto={11200}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Otomatik Ön Ödemeyi Doldur/ }));
    expect(state()).toMatchObject({ prepayment_amount: 11200, prepayment_manual_amount: null });
    expect(screen.queryByRole("button", { name: /Otomatik Ön Ödemeyi Doldur/ })).toBeNull();
  });
  it("full_payment → toplam, salt okunur", () => {
    render(<Harness initial={scenario({ payment_preference: "full_payment" })} auto={11200} />);
    expect(payNowInput().value).toBe("56000");
    expect(payNowInput().readOnly).toBe(true);
    expect(screen.queryByRole("button", { name: /Otomatik Ön Ödemeyi Doldur/ })).toBeNull();
  });
});

/* ---------------- Uçtan uca: kaydet → DB → ödeme bilgisi maili ---------------- */
describe("56.000 / 11.200 / 20.000 — kaydet ve gönder", () => {
  beforeEach(() => {
    sentMails.length = 0;
  });

  function saveToDb(db: Record<string, unknown>, data: ReservationDetailData) {
    /* Admin save = builder payload → PATCH → server payload-update → DB. */
    const serverPayload = buildUpdateReservationPayload(build(data) as never);
    return { ...db, ...serverPayload };
  }
  const mailRow = (db: Record<string, unknown>) => ({
    ...db,
    id: "res-1",
    reservation_no: "TY-1",
    email: "guest@test.local",
    name: "Misafir",
    start_date: "2026-10-10",
    end_date: "2026-10-14",
    villa: { title: "Villa Test" },
    payment_link: "https://pay.example/abc",
    damage_deposit: 0,
  });
  const req = () =>
    new Request("http://localhost/api/mail/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reservationId: "res-1" }),
    });

  it("DB: prepayment 20.000, paid 0 → EFT / kart / WU maillerinde ₺20.000", async () => {
    let db: Record<string, unknown> = { ...scenario() };

    /* 1) Admin sayfayı açar, 20.000 girer, kaydeder. */
    let data = withLoadedPrepaymentLock(scenario());
    data = { ...data, prepayment_amount: 20000, prepayment_manual_amount: 20000 };
    db = saveToDb(db, data);
    expect(db).toMatchObject({ total_price_try: 56000, prepayment_amount: 20000, paid_amount: 0 });

    /* 2) Sayfa yenilenir, admin yalnız notu değiştirip tekrar kaydeder. */
    data = withLoadedPrepaymentLock(asReservation(db as never));
    data = { ...data, note: "Not güncellendi" };
    db = saveToDb(db, data);
    expect(db).toMatchObject({ prepayment_amount: 20000, paid_amount: 0, note: "Not güncellendi" });

    /* 3) "Ödeme Bilgilerini Gönder" — mevcut route'lar DB'yi okur. */
    dbRow = mailRow(db);
    for (const post of [bankTransferPOST, paymentLinkPOST, westernUnionPOST]) {
      const res = await post(req());
      expect(res.status).toBe(200);
    }
    expect(sentMails).toHaveLength(3);
    for (const m of sentMails) {
      expect(m.html).toContain("Şimdi Ödenecek Tutar");
      expect(m.html).toContain("₺20.000");
      expect(m.html).not.toContain("₺11.200");
    }
  });

  it("manuel değişiklik yoksa mevcut davranış: ₺11.200", async () => {
    let db: Record<string, unknown> = { ...scenario({ prepayment_amount: null as never }) };
    db = saveToDb(db, withLoadedPrepaymentLock(asReservation(db as never)));
    expect(db).toMatchObject({ prepayment_amount: 11200, paid_amount: 0 });
    dbRow = mailRow(db);
    await bankTransferPOST(req());
    expect(sentMails[0].html).toContain("₺11.200");
  });
});
