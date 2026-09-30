import { NextResponse } from "next/server";

import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { applyRateLimit } from "@/lib/rate-limit";
import { normalizeReservationNo } from "@/lib/reservation-code.helper";

/* ===============================================================
   🛡️ POST /api/public/reservation-lookup — PUBLIC DURUM SORGULAMA
   ===============================================================
   AMAÇ:
     Müşteri, rezervasyon kodu (reservations.reservation_no) + e-posta
     eşleşmesiyle rezervasyonunun güncel durumunu görüntüler.

   MİMARİ:
     reservations PHASE 3 (migration 040) sonrası admin-only RLS:
     anon SELECT REDDEDİLİR. Bu yüzden okuma SERVICE ROLE ile yapılır
     (dbAdmin → service-role kimlik bilgisi, yalnız server).

   GÜVENLİK:
     - Sadece reservation_no + email BİRLİKTE eşleşirse veri döner.
     - E-posta karşılaştırması case-insensitive + trim (server-side).
     - Telefon / TC / admin auth İSTENMEZ.
     - Response yalnızca güvenli alanları döner; PII (telefon, TC,
       adres, fiyat, komisyon) ASLA dönmez.
     - Eşleşme yoksa generic 404 — hangi alanın hatalı olduğu
       sızdırılmaz (enumeration koruması).
     - Rate-limit: "reservation_check" bucket (10/10dk/IP) —
       brute-force / enumeration koruması.

   reservation_no zaten DB trigger ile üretilir (örn. REZ-2026-0042)
   ve create response + müşteri mailinde gösterilir → yeni alan/
   migration GEREKMEZ.
   =============================================================== */

type StatusKey = "pending" | "prepayment" | "confirmed" | "cancelled";

/* DB status + payment_link_status → public görüntüleme durumu.
   Mevcut canonical status seti: pending | confirmed | cancelled |
   rejected. payment_link_status: pending | sent | paid | expired. */
function deriveStatusKey(
  status: unknown,
  paymentLinkStatus: unknown
): StatusKey {
  const s = (status ?? "").toString().trim().toLowerCase();
  const p = (paymentLinkStatus ?? "").toString().trim().toLowerCase();

  if (s === "cancelled" || s === "rejected") return "cancelled";
  if (s === "confirmed") return "confirmed";
  /* Ödeme talebi gönderilmiş ama henüz ödenmemiş → ön ödeme bekleniyor. */
  if (p === "sent") return "prepayment";
  return "pending";
}

export async function POST(req: Request): Promise<Response> {
  const limited = await applyRateLimit(req, "reservation_check");
  if (limited) return limited;

  let body: { code?: unknown; email?: unknown };
  try {
    body = (await req.json()) as { code?: unknown; email?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  const code = normalizeReservationNo(body.code).toUpperCase();
  const email = (body.email ?? "").toString().trim().toLowerCase();

  if (!code || !email) {
    return NextResponse.json(
      { ok: false, error: "Rezervasyon kodu ve e-posta gerekli." },
      { status: 400 }
    );
  }

  /* Çok basit e-posta format kontrolü (gereksiz katı değil). */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Geçerli bir e-posta adresi girin." },
      { status: 400 }
    );
  }

  /* reservation_no DB trigger ile uppercase üretilir (örn.
     REZ-2026-0042); `code` zaten uppercase+trim normalize edildi →
     exact `eq` kullanılır (ilike wildcard %/_ injection riskini
     eler). Defansif: limit(1). */
  const { data, error } =
    await reservationServerRepository.findForPublicLookup(code);

  if (error) {
    console.error("[reservation-lookup] query error:", error.message);
    return NextResponse.json(
      { ok: false, error: "Sorgulama sırasında bir hata oluştu." },
      { status: 500 }
    );
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

  /* Generic not-found: kod yok VEYA email eşleşmiyor → aynı yanıt.
     (Hangi parçanın yanlış olduğu sızdırılmaz.) */
  const rowEmail = (row?.email ?? "").toString().trim().toLowerCase();
  if (!row || rowEmail !== email) {
    return NextResponse.json(
      {
        ok: false,
        notFound: true,
        error:
          "Bu bilgilerle eşleşen bir rezervasyon bulunamadı. Kod ve e-postayı kontrol edin.",
      },
      { status: 404 }
    );
  }

  const villa = (row as { villa?: { title?: string | null } | null }).villa;

  return NextResponse.json({
    ok: true,
    reservation: {
      reservationNo: normalizeReservationNo(row.reservation_no),
      villaTitle: (villa?.title || "Villa").toString(),
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      guests: Number(row.guests) || null,
      statusKey: deriveStatusKey(row.status, row.payment_link_status),
    },
  });
}
