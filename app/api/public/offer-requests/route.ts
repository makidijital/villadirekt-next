import { NextResponse } from "next/server";

import { applyRateLimit } from "@/lib/rate-limit";
import {
  createOfferRequest,
  type CreateOfferRequestInput,
} from "@/app/services/offer-request.service";

/* ===============================================================
   🛡️ POST /api/public/offer-requests — PUBLIC TEKLİF FORMU (server)
   ===============================================================
   AMAÇ:
     /teklif-al formunun client-side anon DB client insert'ini sunucu
     tarafına taşır. Akış:
       Browser → applyRateLimit("offer") → honeypot/time-trap →
       service validation → native insert → offer_requests

   MİMARİ (mevcut pattern paritesi):
     - Rate-limit: mevcut applyRateLimit (yeni "offer" bucket,
       5/10dk/IP).
     - Insert: mevcut createOfferRequest service'i (sanitize + MAX
       uzunluk doğrulamaları AYNEN) → native repo (tek app rolü;
       session-DI gerekmez).
     - Honeypot ("website") + time-trap (MIN_SUBMIT_MS) — iletişim
       formuyla aynı koruma, teklif tarafına da eklendi.

   GÜVENLİK:
     - Honeypot dolu / time-trap altında → bot gibi: insert YOK,
       success-shaped 200 (sahte id) döner; form UX'i değişmez.
   =============================================================== */

const MIN_SUBMIT_MS = 2000;

export async function POST(req: Request): Promise<Response> {
  const limited = await applyRateLimit(req, "offer");
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  /* HONEYPOT + TIME-TRAP — bot ise sessiz success (insert yok). */
  const website = (body.website ?? "").toString().trim();
  const elapsedMs = Number(body.elapsedMs);
  if (website.length > 0) {
    return NextResponse.json({ ok: true, id: "" });
  }
  if (Number.isFinite(elapsedMs) && elapsedMs < MIN_SUBMIT_MS) {
    return NextResponse.json({ ok: true, id: "" });
  }

  /* Payload — service'in beklediği şekle indir (sanitize + MAX
     doğrulamaları createOfferRequest içinde aynen çalışır). */
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const input: CreateOfferRequestInput = {
    travel_group: (body.travel_group ?? null) as string | null,
    start_date: (body.start_date ?? null) as string | null,
    end_date: (body.end_date ?? null) as string | null,
    adults: num(body.adults),
    children: num(body.children),
    region_tokens: arr(body.region_tokens),
    villa_type_tokens: arr(body.villa_type_tokens),
    feature_tokens: arr(body.feature_tokens),
    budget_min: num(body.budget_min) ?? null,
    budget_max: num(body.budget_max) ?? null,
    budget_currency: (body.budget_currency ?? "TRY").toString(),
    full_name: (body.full_name ?? "").toString(),
    phone: (body.phone ?? "").toString(),
    email: (body.email ?? null) as string | null,
    note: (body.note ?? null) as string | null,
  };

  /* NATIVE INSERT — mevcut service native repo'ya yazar (tek app rolü).
     Result shape (ok/id/error) AYNEN form'a döner → UX değişmez. */
  const result = await createOfferRequest(input);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, id: result.id });
}
