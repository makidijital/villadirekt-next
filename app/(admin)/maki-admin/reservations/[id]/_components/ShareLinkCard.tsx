"use client";

import { useState } from "react";
import { Link2, Copy, ExternalLink, X, Check } from "lucide-react";

import Section from "./Section";
import { adminFetch } from "@/lib/admin-fetch";

/* ===============================================================
   🔗 Reservation Detail — ShareLinkCard (Rezervasyon Bilgilerini Paylaş)
   ===============================================================
   Admin güvenli paylaşım linki üretir → müşteriye WhatsApp/SMS/e-posta ile
   gönderir. Müşteri linki açınca /rezervasyon-kontrol?token=... ile onay +
   ödeme özetini görür (kod+e-posta girmeden). Mevcut reservation akışına
   DOKUNMAZ; additive.

   GÜVENLİK: token DB'de hash-at-rest → ham URL YALNIZ oluşturma anında
   döner (bir kez görünür; API-key deseni). Sayfa yenilenirse kopyalamak
   için yeni link üretilir (eski link expire/iptal edilene kadar geçerli).
   =============================================================== */

export default function ShareLinkCard({
  reservationId,
}: {
  reservationId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const endpoint = `/api/admin/reservations/${reservationId}/share-link`;

  async function generate() {
    if (!reservationId) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(endpoint, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json?.ok || !json.url) {
        setError(json?.error || "Link oluşturulamadı.");
        return;
      }
      setUrl(json.url);
      setCopied(false);
    } catch {
      setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke() {
    setLoading(true);
    setError("");
    try {
      const res = await adminFetch(endpoint, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json?.ok) {
        setError(json?.error || "İptal edilemedi.");
        return;
      }
      setUrl(null);
      setCopied(false);
    } catch {
      setError("Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Kopyalanamadı; linki elle seçip kopyalayın.");
    }
  }

  return (
    <Section
      eyebrow="Paylaşım"
      title="Rezervasyon Bilgilerini Paylaş"
      subtitle="Müşteriye gönderilebilecek güvenli bir link oluşturun."
    >
      {!url ? (
        <button
          type="button"
          onClick={generate}
          disabled={loading || !reservationId}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Link2 size={15} aria-hidden />
          {loading ? "Oluşturuluyor…" : "Paylaşım Linki Oluştur"}
        </button>
      ) : (
        <div className="space-y-3">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="input"
            aria-label="Paylaşım linki"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="btn-primary inline-flex items-center gap-2"
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? "Link Kopyalandı" : "Linki Kopyala"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-stone-200)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)] transition-colors"
            >
              <ExternalLink size={15} aria-hidden />
              Yeni Sekmede Aç
            </a>
            <button
              type="button"
              onClick={revoke}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <X size={15} aria-hidden />
              Linki İptal Et
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-stone-500)]">
            Bu link müşteriye WhatsApp / SMS / e-posta ile gönderilebilir.
            Güvenlik için link yalnız şimdi görünür; sayfayı yenilerseniz
            kopyalamak için yeni link oluşturun.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </Section>
  );
}
