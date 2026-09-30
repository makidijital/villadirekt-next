/* 🛡️ FAZ 2 STABILIZATION — server-role repo (dbAdmin) RLS bypass. */
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { adminGateway } from "@/lib/admin-gateway/server";

import { generatePrivateTokenString } from "./_helpers/private-token";

import type { PrivateTokenResult } from "./types";

/* ===============================================================
   🛡️ FAZ 3 — PRIVATE / TEMPORARY VILLA URL TOKEN
   ===============================================================
   Off-market / VIP preview için secret token üretimi.

   FLOW (BYTE-IDENTICAL):
     1) Villa zaten token sahibi mi? → mevcut token'ı reuse et
        (idempotent; admin defalarca tıklayabilir, link değişmez).
     2) Yoksa generatePrivateTokenString() ile yeni unguessable token
        üret, DB'ye yaz.
     3) Sonuç: { ok, token } veya { ok:false, error }.

   COLLISION:
     20-char hex token (~80 bit entropi) → realistically collision
     ihtimali ihmal edilebilir. DB unique partial index (token IS
     NOT NULL) constraint violation döndürürse 1 kez retry yapılır
     (over-engineering yapma kuralına uygun şekilde minimal).

   SECURITY:
     - is_active filter UYGULANMAZ (pasif villalar da token alabilir
       — özellikle bu amaç).
     - deleted_at IS NULL kontrolü KORUNUR (silinmiş villaya token
       basılamaz).
     - Token leak'lerine karşı admin ileride "regenerate" akışı
       eklenebilir; bu faz için scope dışı.

   URL OLUŞTURMA:
     Bu fonksiyon yalnız { token } döner. Tam URL'i client tarafı
     (admin button) `window.location.origin + "/p/" + token` ile
     oluşturur. Origin'i server'a sabitlemek (env var) bilinçli olarak
     yapılmadı — local dev / staging / prod URL'leri client context'te
     zaten doğru.
=============================================================== */

export async function generatePrivateAccessToken(
  villaId: string
): Promise<PrivateTokenResult> {
  if (!villaId) return { ok: false, error: "ID gerekli" };

  /* 1) Mevcut token reuse — defansif: villayı fetch et, henüz
     token'ı varsa aynısını dön.
     FAZ 37: DB I/O villaAdminRepository.findForPrivateTokenLookup
     delege. .maybeSingle() resolver repo içinde aynen. */
  const { data: existing, error: selErr } =
    await villaAdminRepository.findForPrivateTokenLookup(villaId);

  if (selErr) {
    console.error("[villa.privateToken] select FAILED", selErr.message);
    return { ok: false, error: selErr.message };
  }
  if (!existing) return { ok: false, error: "Villa bulunamadı" };
  if (existing.deleted_at) {
    return { ok: false, error: "Silinmiş villalar için bağlantı üretilemez" };
  }
  if (
    typeof existing.private_access_token === "string" &&
    existing.private_access_token.trim().length > 0
  ) {
    return { ok: true, token: existing.private_access_token };
  }

  /* 2) Yeni token üret + DB'ye yaz. Çok düşük olasılıklı collision
     senaryosunda 1 kez retry. */
  const attempt = async (): Promise<PrivateTokenResult> => {
    const token = generatePrivateTokenString();
    /* FAZ 37: DB I/O villaAdminRepository.updatePrivateTokenById
       delege. UPDATE + .eq("id") + .is("deleted_at", null) predicate
       repo içinde aynen; SQLSTATE 23505 collision retry service edge'de. */
    const { error } = await villaAdminRepository.updatePrivateTokenById(
      villaId,
      token
    );

    if (error) {
      /* Unique constraint violation → retry */
      const code = (error as { code?: string }).code;
      if (code === "23505") {
        return { ok: false, error: "COLLISION" };
      }
      console.error("[villa.privateToken] update FAILED", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, token };
  };

  const first = await attempt();
  if (first.ok) {
    /* FAZ 42: AUDIT (fire-forget). Token tam değer LOG ALINMAZ;
       sadece masked prefix (ilk 4 char) — leak prevention. */
    void adminGateway.audit("villa.private_token_generated", {
      entityType: "villa",
      entityId: villaId,
      metadata: {
        source: "generatePrivateAccessToken",
        tokenPrefix: first.token.slice(0, 4),
        attempt: 1,
      },
    });
    return first;
  }
  if (first.error === "COLLISION") {
    const retry = await attempt();
    if (retry.ok) {
      void adminGateway.audit("villa.private_token_generated", {
        entityType: "villa",
        entityId: villaId,
        metadata: {
          source: "generatePrivateAccessToken",
          tokenPrefix: retry.token.slice(0, 4),
          attempt: 2,
          collisionRetry: true,
        },
      });
      return retry;
    }
    return { ok: false, error: "Token üretimi başarısız (collision)" };
  }
  return first;
}
