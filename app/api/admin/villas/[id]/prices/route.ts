import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import {
  VILLA_DETAIL_READERS,
} from "@/lib/auth/admin-permission-map";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
/* 🛡️ PUBLIC ile ORTAK indirim okuma servisi (DiscountRange[] döner). */
import { getVillaDiscounts } from "@/app/services/villa-discount.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/prices — VILLA PRICES (admin-only)
   ===============================================================
   GET → villa_prices satırları (select="*") belirli villa için.

   FAZ 2 frontend purge — eski client davranışı:
     db.from("villa_prices").select("*").eq("villa_id", id)
   BYTE-IDENTICAL: aynı select * (tüm kolonlar), aynı filter.

   🛡️ ADDITIVE — `discounts` (villa_discounts) AYNI cevaba eklendi.
     NEDEN: admin rezervasyon takvimi public villa detay takvimiyle
     AYNI indirimli gecelik fiyatı göstermeli ve aynı indirim
     `calculateGrandTotal`'a da beslenmeli (takvim ile toplam
     tutarlı olsun). Ayrı bir endpoint/round-trip AÇILMADI — bu
     route'un yalnız 2 çağıranı var (reservations/ekle ve
     reservations/[id]) ve ikisi de indirimi burada istiyor.
     `prices` alanı ve mevcut hata/format davranışı DEĞİŞMEDİ →
     eski cevap şekli geriye dönük uyumlu.
     Veri kaynağı: `getVillaDiscounts` (app/services/villa-discount.service)
     — PUBLIC tarafın kullandığı AYNI service + AYNI repository.
     Yeni sorgu mantığı / yeni indirim motoru YAZILMADI.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* 🛡️ Admin yetki (VILLA_DETAIL_READERS) — izin yoksa 403; hiçbir veri
     okunmaz/değiştirilmez (lib/auth/admin-permission-map.ts). */
  if (!(await callerHasPermission(auth.caller.id, VILLA_DETAIL_READERS))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id gerekli" },
      { status: 400 }
    );
  }

  const { data, error } = await villaAdminRepository.findPricesByVillaId(id);

  if (error) {
    console.error("[admin.villas.prices] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Fiyatlar alınamadı" },
      { status: 500 }
    );
  }

  /* 🛡️ ADDITIVE — indirimler. FAIL-SOFT: `getVillaDiscounts` kendi
     içinde hatayı yutup [] döner; yine de savunma amaçlı sarmalandı.
     İndirim alınamazsa `prices` cevabı ETKİLENMEZ → takvim ve toplam
     indirimsiz (mevcut) davranışa düşer, istek 500 OLMAZ. */
  let discounts: Awaited<ReturnType<typeof getVillaDiscounts>> = [];
  try {
    discounts = await getVillaDiscounts(id);
  } catch (e) {
    console.error(
      "[admin.villas.prices] discounts FAILED",
      e instanceof Error ? e.message : e
    );
  }

  return NextResponse.json({ ok: true, prices: data || [], discounts });
}
