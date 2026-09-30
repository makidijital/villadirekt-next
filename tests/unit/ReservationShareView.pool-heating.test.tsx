/* ===============================================================
   🛡️ HAVUZ ISITMA — Rezervasyon paylaşım (share) sayfası
   ===============================================================
   Hedef: app/(public)/rezervasyon-kontrol/ReservationShareView.tsx
   ÇOK ÖNEMLİ (kullanıcı talimatı Section 7) — müşteri paylaşım linki
   görünümünde Temizlik Ücreti ile AYNI "(Fiyata Dahildir.)" desende
   Havuz Isıtma satırı.

   Kapsam: SADECE gösterim. `share.resolve.ts`'in DB sorgusu/derivation'ı
   burada test EDİLMİYOR — component doğrudan sanitized DTO alıp render
   eden saf (async) server component. getCachedSettings mock'lanır
   (gerçek DB/cache'e ÇIKMAZ — "no network" house kuralı, diğer pool-
   heating testleriyle AYNI desen).

   Async server component render: `await ReservationShareView({data})`
   çağrısı sonuçta düz bir JSX element döner (component hook kullanmıyor,
   yalnız veri dönüşümü + JSX) — bu resolved element `render()`'a verilir.
=============================================================== */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn(async () => ({
    phone: "",
    whatsapp_link: "",
  })),
}));

import ReservationShareView from "@/app/(public)/rezervasyon-kontrol/ReservationShareView";
import type { ReservationShareDTO } from "@/app/(public)/rezervasyon-kontrol/share.resolve";

const baseDTO: ReservationShareDTO = {
  reservationNo: "RES-1001",
  villaTitle: "Test Villa",
  villaImage: null,
  startDate: "2026-07-01",
  endDate: "2026-07-06",
  nights: 5,
  guests: 4,
  statusKey: "confirmed",
  checkInTime: "16:00",
  checkOutTime: "10:00",
  total: 28500,
  paid: 4000,
  remaining: 24500,
  prepayment: 4000,
  isFullPayment: false,
  damageDeposit: null,
  cleaningFee: 3500,
  poolHeatingFee: null,
  paymentMethodLabel: null,
  ownerName: null,
  ownerPhone: null,
  guestName: "Ahmet Yılmaz",
  guestPhone: null,
  guestEmail: null,
};

async function renderShareView(overrides: Partial<ReservationShareDTO>) {
  const element = await ReservationShareView({
    data: { ...baseDTO, ...overrides },
  });
  return render(element);
}

describe("ReservationShareView — havuz ısıtma gösterimi (müşteri paylaşım sayfası)", () => {
  it("1) poolHeatingFee=null → 'Havuz Isıtma' satırı render edilmez (eski rezervasyon regresyonu)", async () => {
    await renderShareView({ poolHeatingFee: null });

    expect(screen.queryByText(/Havuz Isıtma/)).not.toBeInTheDocument();
    // Temizlik Ücreti satırı hâlâ doğru (regresyon yok)
    expect(screen.getByText(/Temizlik Ücreti/)).toBeInTheDocument();
  });

  it("2) poolHeatingFee=5000 → 'Havuz Isıtma Ücreti (Fiyata Dahildir.)' satırı görünür, doğru TRY tutarı", async () => {
    await renderShareView({ poolHeatingFee: 5000 });

    /* 🛡️ Metin standardizasyonu turu: "Havuz Isıtma" → "Havuz Isıtma
       Ücreti" (yalnız görünen label metni — hesap/veri AYNEN). */
    expect(screen.getByText("Havuz Isıtma Ücreti")).toBeInTheDocument();
    // "(Fiyata Dahildir.)" hem Temizlik hem Havuz Isıtma satırında var
    // (cleaningFee=3500 baseDTO'dan) → getAllByText, tekil değil.
    expect(screen.getAllByText("(Fiyata Dahildir.)").length).toBe(2);
    expect(screen.getByText("5.000 TL")).toBeInTheDocument();
    // Toplam ve Temizlik satırları etkilenmez (worked example: 20.000 + 3.500 + 5.000 = 28.500)
    expect(screen.getByText("28.500 TL")).toBeInTheDocument();
    expect(screen.getByText("3.500 TL")).toBeInTheDocument();
  });
});

/* NOT: poolHeatingFee=0 senaryosu kasıtlı olarak test EDİLMİYOR — component
   (cleaningFee ile AYNI desen) yalnız `!== null` kontrolü yapar; 0 → null
   normalizasyonu component'in DEĞİL, share.resolve.ts'in sorumluluğudur
   (bkz. poolHeatingFeeVal > 0 ? poolHeatingFeeVal : null). Bu, mevcut
   cleaningFee davranışıyla BİREBİR tutarlı — component'i 0 değeriyle
   çağırmak gerçek kullanım akışında hiç olmaz. */
