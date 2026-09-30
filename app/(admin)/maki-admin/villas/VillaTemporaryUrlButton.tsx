"use client";

/* ===============================================================
   🛡️ FAZ 31 — VILLA TEMPORARY URL BUTTON (client island)
   ===============================================================
   Admin stacked-list toolbar içindeki "Temporary URL" action.
   Tıklandığında:
     1) generatePrivateAccessToken(villaId) çağırır
        - Villa zaten token sahibi ise mevcut token'ı reuse eder
          (idempotent; defalarca tıklamak aynı link döner)
        - Yoksa yeni unguessable 20-char hex token üretir, DB'ye yazar
     2) Tam URL'i window.location.origin + "/p/" + token şeklinde oluşturur
     3) navigator.clipboard.writeText ile panoya kopyalar
     4) Premium toast: "Geçici bağlantı kopyalandı"

   PRODUCTION-SAFE:
     - Mevcut admin-btn-ghost / admin-btn-primary class'larını
       reuse eder (yeni dashboard styling YAZILMAZ)
     - Pending state disable-by-prop ile dış toolbar drag handle
       senkron çalışır
     - SSR-safe: button click'inde window erişimi koşullu
     - Clipboard API yoksa execCommand fallback YOK (modern browser
       baseline; admin internal araç)
   =============================================================== */

import { useState } from "react";
import { Link2 } from "lucide-react";

/* 🛡️ FAZ 2 frontend purge — direct service import KALDIRILDI.
   Eskiden:
     import { generatePrivateAccessToken } from "@/app/services/villa-admin.service";
   villa-admin.service barrel'ı private-token.service ve hard-delete.service
   re-export ediyor; her ikisi `admin-gateway/server` (server-only) zinciri
   pulluyordu → client bundle'a server-only sızıyordu. Şimdi adminFetch
   (Bearer) ile /api/admin/villas/[id]/private-token POST route'u; route
   içinde aynı service delege. Token reuse + yeni üretim + audit log
   BYTE-IDENTICAL. */
import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

export function VillaTemporaryUrlButton({
  villaId,
  villaTitle,
  disabled,
}: {
  villaId: string;
  villaTitle: string;
  disabled?: boolean;
}) {
  const toast = useNotify();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);

    try {
      /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas/[id]/private-token.
         Route içinde `generatePrivateAccessToken(villaId)` service delege:
         token reuse + yeni üretim + audit log AYNEN service tarafında.
         Service return shape `{ ok: true; token } | { ok: false; error }`
         JSON olarak route response'una iletilir; caller `res.ok / res.token /
         res.error` ile aynı eski semantic. */
      let res: { ok: true; token: string } | { ok: false; error: string };
      try {
        const apiRes = await adminFetch(
          `/api/admin/villas/${encodeURIComponent(villaId)}/private-token`,
          { method: "POST" }
        );
        const json = (await apiRes.json().catch(() => ({}))) as
          | { ok?: true; token?: string }
          | { ok?: false; error?: string }
          | Record<string, unknown>;
        const okFlag = (json as { ok?: unknown }).ok === true;
        const token = (json as { token?: unknown }).token;
        const errMsg = (json as { error?: unknown }).error;
        if (apiRes.ok && okFlag && typeof token === "string") {
          res = { ok: true, token };
        } else {
          res = {
            ok: false,
            error:
              typeof errMsg === "string" && errMsg
                ? errMsg
                : `HTTP ${apiRes.status}`,
          };
        }
      } catch (err) {
        res = {
          ok: false,
          error: err instanceof Error ? err.message : "İstek başarısız",
        };
      }

      if (!res.ok) {
        toast.error("Bağlantı üretilemedi", {
          id: `villa-private-${villaId}`,
          description: res.error,
        });
        return;
      }

      /* Tam URL: client tarafında origin biliniyor. Server'a env
         bağımlılığı YAZILMADI — local/staging/prod URL'leri
         otomatik doğru.

         Route path `/v/[token]` — "v" villa preview. Spec'te
         `/p/[token]` istenmişti ama mevcut `app/p/[slug]` CMS route
         ile çakıştığı için kısa & premium alternatif `/v/` seçildi
         (Bitly-style). CMS slug sistemi dokunulmadan kaldı. */
      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
      const url = `${origin}/v/${res.token}`;

      /* Clipboard. Permission/secure-context kısıtlarına karşı
         try/catch ile defansif; failure'da toast.info ile manuel
         kopya seçeneği. */
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard &&
          typeof navigator.clipboard.writeText === "function"
        ) {
          await navigator.clipboard.writeText(url);
          toast.success("Geçici bağlantı kopyalandı", {
            id: `villa-private-${villaId}`,
            description: `${villaTitle} — bağlantı panoya alındı`,
          });
        } else {
          toast.info("Bağlantı hazır", {
            id: `villa-private-${villaId}`,
            description: url,
          });
        }
      } catch {
        toast.info("Bağlantı hazır", {
          id: `villa-private-${villaId}`,
          description: url,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      className="admin-btn-ghost disabled:opacity-50"
      aria-label={`${villaTitle} için geçici paylaşım bağlantısı oluştur`}
      title="Geçici paylaşım bağlantısı (sadece bağlantıyı bilen kişiler görür)"
    >
      <Link2 size={13} />
      {busy ? "Hazırlanıyor…" : "Geçici URL"}
    </button>
  );
}
