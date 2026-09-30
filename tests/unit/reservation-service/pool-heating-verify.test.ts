import { describe, it, expect } from "vitest";

import { computeAuthoritativePoolHeatingSnapshot } from "@/app/services/reservation/_helpers/pool-heating-verify";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 6. adım (public reservation create, SERVER RULE)
   ===============================================================
   `computeAuthoritativePoolHeatingSnapshot` — SAF helper (server-only
   İŞARETİ YOK → doğrudan test edilebilir; price-verify.ts'in tersine).
   SERVER KURALI (kullanıcı spesifikasyonu, verbatim):
     - selected=false                        → total=0
     - selected=true, villa fee NULL/<=0     → total=0
     - selected=true, fee>0                  → nights × fee
   Client'ın gönderdiği bir "total" YOK — bu fonksiyonun imzasında
   böyle bir parametre hiç bulunmuyor (client total'a güvenmeme
   kuralı, tip seviyesinde garanti).
=============================================================== */

const RATES = { USD: 30, EUR: 33, GBP: 38 };

describe("computeAuthoritativePoolHeatingSnapshot — server kuralı", () => {
  it("1) selected=false → total=0 (fee>0 olsa dahi)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: false,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_selected).toBe(false);
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("2) selected=true, fee=1000 TRY, 5 gece → 5.000 TL", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_selected).toBe(true);
    expect(snap.original_pool_heating_total).toBe(5000);
    expect(snap.original_pool_heating_currency).toBe("TRY");
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("3) selected=true, villa fee NULL → total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: null,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("4) selected=true, villa fee=0 → total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 0,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("5) gece sayısı 5→6 değişince total 5.000→6.000 olur", () => {
    const snap5 = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    const snap6 = computeAuthoritativePoolHeatingSnapshot({
      nights: 6,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap5.pool_heating_total_try).toBe(5000);
    expect(snap6.pool_heating_total_try).toBe(6000);
  });

  it("7) client 'yanlış' bir total göndermiş olsa dahi — bu fonksiyonun imzasında client total parametresi YOK; yalnız villa gerçek fee'sinden üretir", () => {
    // Fonksiyon imzasında client total'a yer YOK — bu test tip-seviyesinde
    // "client total'a güvenilmiyor" garantisini dokümante eder.
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    // Villa gerçek fee'si (1000/gece × 5 gece) her zaman 5000 üretir —
    // client ne gönderirse göndersin (parametre olarak alınmadığı için
    // etkileyemez).
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("nights=0 → total=0 (selected+fee>0 olsa dahi)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 0,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("döviz (EUR) villa fee → pool_heating_total_try convertPrice ile TRY'ye çevrilir", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 100, // 100 EUR/gece
      villaPoolHeatingCurrency: "EUR",
      rates: RATES, // EUR: 33
    });
    // raw: 5 gece × 100 EUR = 500 EUR (original currency, orijinal alan)
    expect(snap.original_pool_heating_total).toBe(500);
    expect(snap.original_pool_heating_currency).toBe("EUR");
    // TRY karşılığı: 500 × 33 = 16.500
    expect(snap.pool_heating_total_try).toBe(16500);
  });

  it("villaPoolHeatingCurrency eksik → 'TRY' fallback", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: null,
      rates: RATES,
    });
    expect(snap.original_pool_heating_currency).toBe("TRY");
    expect(snap.pool_heating_total_try).toBe(5000);
  });
});


/* ===============================================================
   🛡️ Migration 076 — SEZONLUK AY KISITI (server-authoritative)
   ===============================================================
   Kullanıcının açık endişesi: "manuel payload ile poolHeating=1
   gönderilse bile aktif olmayan ayda ücret uygulanmamalı." Bu
   testler tam olarak bunu doğrular — startDate/endDate/
   villaPoolHeatingMonths ile server, client'ın "seçtim" tercihini
   villanın GERÇEK sezon kuralına göre geçersiz kılıyor.
=============================================================== */
describe("computeAuthoritativePoolHeatingSnapshot — sezonluk ay kısıtı (Migration 076)", () => {
  const JAN_MAY_SEP_DEC = [1, 2, 3, 4, 5, 9, 10, 11, 12];

  it("manuel payload poolHeatingSelected=true gönderse bile pasif ayda (Temmuz) total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      startDate: "2026-07-10",
      endDate: "2026-07-15",
      villaPoolHeatingMonths: JAN_MAY_SEP_DEC,
    });
    expect(snap.pool_heating_selected).toBe(true);
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("aktif ayda (Ekim) selected=true → tutar normal hesaplanır", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      startDate: "2026-10-10",
      endDate: "2026-10-15",
      villaPoolHeatingMonths: JAN_MAY_SEP_DEC,
    });
    expect(snap.original_pool_heating_total).toBe(5000);
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("çapraz-ay rezervasyon (28 Mayıs→3 Haziran) — Haziran pasif olduğu için total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 6,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      startDate: "2026-05-28",
      endDate: "2026-06-03",
      villaPoolHeatingMonths: JAN_MAY_SEP_DEC,
    });
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("startDate/endDate verilmezse (eski çağrılar/testler) davranış BYTE-IDENTICAL — sezon kontrolü atlanır", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      villaPoolHeatingMonths: JAN_MAY_SEP_DEC,
    });
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("villaPoolHeatingMonths NULL → her ayda aktif (geriye dönük uyumluluk, mevcut ~1595 villa)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      startDate: "2026-07-10",
      endDate: "2026-07-15",
      villaPoolHeatingMonths: null,
    });
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("pasif ayda selected=false zaten total=0 (sezon kuralı ile çakışma yok, çift-güvenli)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: false,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
      startDate: "2026-07-10",
      endDate: "2026-07-15",
      villaPoolHeatingMonths: JAN_MAY_SEP_DEC,
    });
    expect(snap.pool_heating_selected).toBe(false);
    expect(snap.pool_heating_total_try).toBe(0);
  });
});
