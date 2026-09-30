import { NextResponse } from "next/server";

/* 🛡️ Villa Migration S3 — findAvailabilityConfigById native'e taşındı.
   Bu route server-only (API handler) → server-only native repo import'u
   güvenli. Diğer villaRepository çağrısı bu route'ta YOK (yalnız bu
   method). Provider/DTO/mapping AYNEN; yalnız bu tek read native. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.helper";
import { getVillaPrices } from "@/app/services/villa-price.service";
/* 🛡️ villa_discounts — MEVCUT public-safe servis (villa detay sayfası,
   /rezervasyon ve server-side `price-verify` ile AYNI kaynak). Yeni bir
   repository/sorgu/indirim sistemi OLUŞTURULMADI. Servis fail-safe:
   hata durumunda [] döner → "indirim yok" ile AYNI davranış. */
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import type { DiscountRange } from "@/lib/price.engine";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import { applyRateLimit } from "@/lib/rate-limit";

/* ===============================================================
   🛡️ GET /api/public/villas/[id]/availability
   ===============================================================
   AMAÇ:
     VillaCardBookingModal client component'i için BOOKING context
     verilerini server-side TOPLU olarak döner. Modal browser'da
     `dbAdmin` (service role) çağıramaz — bu route
     server-only helper'ları izolasyon altında kullanır.

     ÖNEMLI: Response, BookingSidebar'ın server-side aldığı
     prop setiyle birebir eşittir (drift YOK):

       BookingSidebar prop                 ↔  API response field
       ────────────────────────────────────────────────────────
       prices                               ↔  prices
       deposit                              ↔  config.deposit
       cleaning_fee                         ↔  config.cleaning_fee
       cleaning_currency                    ↔  config.cleaning_currency
       cleaning_limit                       ↔  config.cleaning_limit
       custom_prepayment_rate               ↔  config.custom_prepayment_rate
       minimum_stay_nights                  ↔  config.minimum_stay_nights
       pool_heating_fee                     ↔  config.pool_heating_fee
       pool_heating_currency                ↔  config.pool_heating_currency
       externalBlocks                       ↔  externalBlocks

     (villaId + villaSlug parent VillaCard zaten biliyor.)

     🛡️ HAVUZ ISITMA — VillaCardBookingModal fix turu: `config.pool_heating_fee`
        / `config.pool_heating_currency` EKLENDİ. VillaCardBookingModal +
        useBookingEngine wiring'i ÖNCEDEN tamamlanmıştı (bkz. o dosyadaki
        yorum) ama bu route alanları döndürmediği için checkbox hiç
        render edilmiyordu — kaynak (`findAvailabilityConfigById`) ve bu
        route'un mapping'i eksikti, yalnız burası düzeltildi.

   CALLER:
     - app/components/villa/VillaCardBookingModal.tsx (client)
       Modal mount sonrası TEK fetch; engine'e tüm input'lar
       buradan akar (VillaCard caller drift'i bypass edilir).

   RESPONSE SHAPE:
     {
       config: {
         deposit: number | null,
         cleaning_fee: number | null,
         cleaning_currency: string | null,
         cleaning_limit: number | null,
         custom_prepayment_rate: number | null,
         minimum_stay_nights: number | null,
         pool_heating_fee: number | null,
         pool_heating_currency: string | null
       },
       prices: VillaPriceEmbed[],          // villa_prices rows
       externalBlocks: ExternalCalendarStringArrays
     }

   DAVRANIŞ DOKUNULMAYAN:
     - external blocks expansion semantic'i (helper içinde)
     - villa table row shape
     - villa_prices shape (getVillaPrices service kullanıldı)
     - BookingSidebar (server-side props ile beslenir — değişmedi)

   GÜVENLİK:
     - PUBLIC route (auth yok). DÖNEN VERİLER:
       * villa.deposit / cleaning_* / custom_prepayment_rate /
         minimum_stay_nights → public villa detail sayfasında
         ZATEN gösteriliyor
       * villa_prices rows → public villa detail sayfasında ZATEN
         gösteriliyor (PriceList + BookingSidebar)
       * external_calendar_events.start_date / end_date (expand)
         → BookingSidebar'da ZATEN render ediliyor (kırmızı blok)
     - Service role key SADECE server'da kullanılır; response'a
       sadece tarih string'leri ve sayısal alanlar gider.

   CACHE:
     - `no-store` — availability gerçek-zamanlı; stale veri yanlış
       blocking gösterebilir.
   =============================================================== */

type VillaConfig = {
  deposit: number | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  custom_prepayment_rate: number | null;
  minimum_stay_nights: number | null;
  /* 🛡️ HAVUZ ISITMA — VillaCardBookingModal fix turu. */
  pool_heating_fee: number | null;
  pool_heating_currency: string | null;
  /* 🛡️ Migration 076 — sezonluk ay kısıtı. NULL = kısıtlama yok. */
  pool_heating_months: number[] | null;
};

type ResponseShape = {
  config: VillaConfig;
  prices: VillaPriceEmbed[];
  externalBlocks: ExternalCalendarStringArrays;
  /* 🛡️ ADDITIVE — mevcut alanların hiçbiri değişmedi/kaldırılmadı.
     BookingSidebar'ın sayfa server-fetch'inde ZATEN var olan
     `discounts` prop'unun API karşılığı (drift kapanır). */
  discounts: DiscountRange[];
};

const EMPTY_CONFIG: VillaConfig = {
  deposit: null,
  cleaning_fee: null,
  cleaning_currency: null,
  cleaning_limit: null,
  custom_prepayment_rate: null,
  minimum_stay_nights: null,
  pool_heating_fee: null,
  pool_heating_currency: null,
  pool_heating_months: null,
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  /* Rate limit: 30 req/dakika/IP. Modal lazy mount + nadir refresh
     pattern bu limiti aşmaz; bot scraping korunur. Limit aşılırsa
     429 + stable JSON; mevcut başarı path'i değişmez. */
  const limited = await applyRateLimit(req, "availability");
  if (limited) return limited;

  const { id } = await ctx.params;

  /* Defansif id validation — UUID enforcement yapmıyoruz (eski sağlayıcı
     zaten geçersiz formatta empty döner) ama tip ve boş string
     erken-reddi yapıyoruz. */
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { error: "id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    /* Paralel fetch — 3 bağımsız kaynak:
         1. villa row (deposit, cleaning_*, prepayment, min stay) — anon
         2. villa_prices (getVillaPrices service, anon) — BookingSidebar
            sayfa server-fetch'i ile birebir aynı service çağrısı
         3. external_calendar_events (service role, helper internal) */
    const [configRes, prices, externalBlocks, discounts] = await Promise.all([
      villaAdminRepository.findAvailabilityConfigById(id),
      getVillaPrices(id),
      fetchExternalCalendarStringsForVilla(id),
      /* 4. kaynak: villa_discounts (public-safe servis; mevcut üç
         fetch ile PARALEL → ek RTT yok). */
      getVillaDiscounts(id),
    ]);

    if (configRes.error) {
      console.error(
        "[api.public.villas.availability] config fetch:",
        configRes.error.message
      );
    }

    const raw = configRes.data as Record<string, unknown> | null;
    const config: VillaConfig = raw
      ? {
          deposit:
            typeof raw.deposit === "number" ? raw.deposit : null,
          cleaning_fee:
            typeof raw.cleaning_fee === "number"
              ? raw.cleaning_fee
              : null,
          cleaning_currency:
            typeof raw.cleaning_currency === "string"
              ? raw.cleaning_currency
              : null,
          cleaning_limit:
            typeof raw.cleaning_limit === "number"
              ? raw.cleaning_limit
              : null,
          custom_prepayment_rate:
            typeof raw.custom_prepayment_rate === "number"
              ? raw.custom_prepayment_rate
              : null,
          minimum_stay_nights:
            typeof raw.minimum_stay_nights === "number"
              ? raw.minimum_stay_nights
              : null,
          /* 🛡️ HAVUZ ISITMA — VillaCardBookingModal fix turu. Villa'da
             ücret tanımlı değilse (NULL/0) `findAvailabilityConfigById`
             null döner → defansif parse aynı desende null'a düşer;
             modal checkbox'ı zaten `pool_heating_fee > 0` guard'ı ile
             gizli tutar (BookingSidebar ile AYNI kural). */
          pool_heating_fee:
            typeof raw.pool_heating_fee === "number"
              ? raw.pool_heating_fee
              : null,
          pool_heating_currency:
            typeof raw.pool_heating_currency === "string"
              ? raw.pool_heating_currency
              : null,
          /* 🛡️ Migration 076 — sezonluk ay kısıtı. Defansif parse:
             yalnız gerçek bir dizi ise geçirilir, aksi halde null
             ("ay kısıtlaması yok" — mevcut pool_heating_fee/currency
             ile AYNI defansif desen). */
          pool_heating_months: Array.isArray(raw.pool_heating_months)
            ? (raw.pool_heating_months as number[])
            : null,
        }
      : EMPTY_CONFIG;

    /* getVillaPrices defansif olarak [] döner (hata durumunda). */
    const safePrices: VillaPriceEmbed[] = Array.isArray(prices)
      ? (prices as VillaPriceEmbed[])
      : [];

    const body: ResponseShape = {
      config,
      prices: safePrices,
      externalBlocks: externalBlocks || EMPTY_EXTERNAL_STRING_ARRAYS,
      /* Defansif: servis zaten [] garantiler; yine de tip güvencesi. */
      discounts: Array.isArray(discounts) ? discounts : [],
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[api.public.villas.availability] EXCEPTION:", msg);

    /* Hata durumunda 500 — modal kendi defansif fallback'lerini
       uygular (EMPTY_CONFIG + [] prices + EMPTY_EXTERNAL).
       UI yine açılır, sadece engine inputları zayıflar. */
    return NextResponse.json(
      { error: "availability fetch failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
