import { NextResponse } from "next/server";

import { applyRateLimit } from "@/lib/rate-limit";
import {
  createContactMessage,
  type ContactMessageInput,
} from "@/app/services/contact-message.service";

/* ===============================================================
   🛡️ POST /api/public/contact — PUBLIC İLETİŞİM FORMU (server)
   ===============================================================
   AMAÇ:
     /iletisim formunun insert'ini sunucu tarafına taşır. Akış:
       Browser → applyRateLimit("contact") → honeypot/time-trap →
       server validation → native insert → contact_messages

   MİMARİ (mevcut pattern paritesi):
     - Rate-limit: mevcut applyRateLimit (yeni "contact" bucket,
       5/10dk/IP). Yeni rate-limit sistemi YOK.
     - Insert: mevcut createContactMessage service'i → native repo
       (tek app rolü; RLS yok, session-DI gerekmez).
     - Validation: ContactForm'daki honeypot ("website") + time-trap
       (MIN_SUBMIT_MS) sunucuda da uygulanır (DOM'u baypas eden bota
       karşı; client guard'ları aynen korunur).

   GÜVENLİK:
     - Honeypot dolu veya time-trap altında ise → bot gibi davran:
       insert YOK, ama success-shaped 200 döner (botun anlamasını
       zorlaştırır; ContactForm UX'i ile birebir).
   =============================================================== */

const MIN_SUBMIT_MS = 2000;

export async function POST(req: Request): Promise<Response> {
  const limited = await applyRateLimit(req, "contact");
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
    return NextResponse.json({ ok: true });
  }
  if (Number.isFinite(elapsedMs) && elapsedMs < MIN_SUBMIT_MS) {
    return NextResponse.json({ ok: true });
  }

  /* SERVER-SIDE VALIDATION — ContactForm kuralları paritesi. */
  const fullName = (body.full_name ?? "").toString().trim();
  const phone = (body.phone ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim();
  const message = (body.message ?? "").toString().trim();

  if (fullName.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Lütfen adınızı yazın." },
      { status: 400 }
    );
  }
  if (message.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Mesajınız en az 10 karakter olmalı." },
      { status: 400 }
    );
  }
  if (phone.length === 0 && email.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Telefon veya e-posta — en az biri gerekli." },
      { status: 400 }
    );
  }

  const input: ContactMessageInput = {
    full_name: fullName,
    phone: phone || null,
    email: email || null,
    message,
    source_page: (body.source_page ?? "").toString().trim() || null,
  };

  /* NATIVE INSERT — service native repo'ya yazar (tek app rolü; RLS yok). */
  const result = await createContactMessage(input);

  if (!result.ok) {
    console.error("[api.public.contact] insert FAILED:", result.error);
    return NextResponse.json(
      { ok: false, error: "Mesaj iletilemedi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
