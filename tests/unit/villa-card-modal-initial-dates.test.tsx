/* ===============================================================
   🛡️ /arama → VillaCard → "Müsaitlik / Tarih Seç" — URL TARİHLERİ
   ===============================================================
   UX düzeltmesi: /arama?start=…&end=… ile gelindiğinde kart modalinin
   takvimi bu aralık SEÇİLİ açılır. Uygulama TAMAMEN mevcut prop
   zinciri üzerinden: VillaCard(stayStart/stayEnd) →
   VillaCardBookingModal(initialStart/initialEnd) →
   useBookingEngine'in ZATEN var olan `initialStart`/`initialEnd`
   parametreleri (BookingSidebar ile AYNI yol). Yeni tarih/rezervasyon
   hesabı YOK.

   Harness `VillaCardBookingModal.pool-heating.test.tsx` deseniyle
   aynıdır (fetch stub + settings mock; gerçek network YOK). Hedef
   tarihler sistem saatinden bağımsız olsun diye HER ZAMAN "bugün +2 ay"
   içindedir → `disabled: before today` kuralına takılmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";

const PRICE_TRY = 4000;

function availabilityResponse() {
  return {
    config: {
      deposit: 0,
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      custom_prepayment_rate: 20,
      minimum_stay_nights: null,
      pool_heating_fee: null,
      pool_heating_currency: "TRY",
      pool_heating_months: null,
    },
    prices: [
      {
        price: PRICE_TRY,
        currency: "TRY",
        start_date: "2020-01-01",
        end_date: "2035-12-31",
      },
    ],
    externalBlocks: { checkin: [], checkout: [], middle: [] },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return { ok: true, json: async () => availabilityResponse() };
      }
      if (url.includes("/blocked-ranges")) {
        return { ok: true, json: async () => ({ ok: true, ranges: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
});

/* "bugün + 2 ay" ayının 8'i ve 11'i → her zaman gelecekte. */
function futureRange() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + 2);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  return {
    start: `${y}-${m}-08`,
    end: `${y}-${m}-11`,
    startDate: new Date(y, base.getMonth(), 8),
    endDate: new Date(y, base.getMonth(), 11),
  };
}

function renderModal(props: {
  initialStart?: string | null;
  initialEnd?: string | null;
}) {
  return render(
    <VillaCardBookingModal
      isOpen={true}
      onClose={vi.fn()}
      villaId="v1"
      villaSlug="test-villa"
      villaTitle="Test Villa"
      initialStart={props.initialStart}
      initialEnd={props.initialEnd}
    />
  );
}

function findDayGridcell(day: number): HTMLElement {
  const cells = screen.getAllByRole("gridcell");
  const pattern = new RegExp(`^${day}₺`);
  const match = cells.find((el) => pattern.test(el.textContent || ""));
  if (!match) throw new Error(`Gün ${day} için gridcell bulunamadı`);
  return match;
}

describe("VillaCardBookingModal — URL'den gelen tarihler", () => {
  /* ⚠️ UI turu: takvim ikonu + "Tarih" + "Tarih seç" bloğu KALDIRILDI.
     Seçim artık özet üzerinden doğrulanır ("Konaklama Tutarı (N Gece)"
     yalnız geçerli bir aralık hidrate olduğunda render edilir) —
     testlerin AMACI ve kapsamı DEĞİŞMEDİ, yalnız selector güncellendi. */
  it("1) start + end verilince takvim bu aralık SEÇİLİ açılır", async () => {
    const r = futureRange();
    renderModal({ initialStart: r.start, initialEnd: r.end });
    /* 08 → 11 = 3 gece → aralık hidrate olmuş demektir. */
    expect(
      await screen.findByText("Konaklama Tutarı (3 Gece)")
    ).toBeInTheDocument();
  });

  it("2) takvim seçili başlangıç tarihinin AYINDA açılır", async () => {
    const r = futureRange();
    renderModal({ initialStart: r.start, initialEnd: r.end });
    await screen.findByText("Konaklama Tutarı (3 Gece)");
    /* O ayın 8'i ve 11'i, ay değiştirmeden görünür olmalı. */
    expect(findDayGridcell(8)).toBeTruthy();
    expect(findDayGridcell(11)).toBeTruthy();
  });

  it("3) 🔒 tarih verilmezse MEVCUT davranış: takvim boş açılır", async () => {
    renderModal({});
    await screen.findAllByRole("gridcell");
    expect(screen.queryByText("Toplam Tutar")).not.toBeInTheDocument();
  });

  it("4) 🔒 yalnız start verilirse MEVCUT davranış korunur (boş takvim)", async () => {
    const r = futureRange();
    renderModal({ initialStart: r.start });
    await screen.findAllByRole("gridcell");
    expect(screen.queryByText("Toplam Tutar")).not.toBeInTheDocument();
  });

  it("5) 🔒 yalnız end verilirse MEVCUT davranış korunur (boş takvim)", async () => {
    const r = futureRange();
    renderModal({ initialEnd: r.end });
    await screen.findAllByRole("gridcell");
    expect(screen.queryByText("Toplam Tutar")).not.toBeInTheDocument();
  });

  it("6) kullanıcı YENİ tarih seçerse normal seçim davranışı çalışmaya devam eder", async () => {
    const r = futureRange();
    renderModal({ initialStart: r.start, initialEnd: r.end });
    await screen.findByText("Konaklama Tutarı (3 Gece)");

    /* Aynı ay içinde 20 → 25 yeni seçim (5 gece). */
    fireEvent.click(findDayGridcell(20));
    fireEvent.click(findDayGridcell(25));

    await waitFor(() =>
      expect(
        screen.getByText("Konaklama Tutarı (5 Gece)")
      ).toBeInTheDocument()
    );
  });
});

/* ===============================================================
   KAYNAK KİLİDİ — prop zinciri ve motor dokunulmazlığı
   =============================================================== */
describe("kaynak kilidi", () => {
  it("7) VillaCard, modal'a stayStart/stayEnd'i YALNIZ ikisi de varken geçer", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const card = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCard.tsx"),
      "utf-8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(card).toMatch(
      /initialStart=\{stayStart && stayEnd \? stayStart : undefined\}/
    );
    expect(card).toMatch(
      /initialEnd=\{stayStart && stayEnd \? stayEnd : undefined\}/
    );
  });

  it("8) modal, motorun MEVCUT initialStart/initialEnd parametrelerini kullanır", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const modal = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCardBookingModal.tsx"),
      "utf-8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(modal).toMatch(/initialStart: initialStart && initialEnd/);
    /* Modal'da fiyat motoru çağrısı TÜREMEDİ. */
    expect(modal).not.toMatch(/calculateGrandTotal\(/);
    expect(modal).not.toMatch(/calculateStayTotal\(/);
  });
});
