"use client";

/* ===============================================================
   🛡️ VILLA ZIP SHARE BUTTON (client island, additive)
   ===============================================================
   Villa listeleme toolbar'ına eklenen "ZIP Paylaş" action. Kendi
   modal state'ini taşır; grid'in DnD/sort/CRUD state'ine DOKUNMAZ.

   UX:
     - Buton → modal açılır (lazy: liste YALNIZ açılışta fetch edilir;
       liste ekranında preload YOK).
     - Süre seç (1/3/6/24 saat) → "ZIP Link Oluştur".
     - Oluşunca: readonly input + "Kopyala" + success toast.
     - Aktif linkler listesi: expires_at + download_count + "İptal" (revoke).
     - Revoke: optimistic (satırı anında revoked işaretle) + API; hata → revert.

   TEKNİK:
     - Backend route'ları: GET/POST /api/admin/villa-zip, POST .../[id]/revoke
       (mevcut; DEĞİŞTİRİLMEDİ). Token üretimi + service_role YALNIZ server.
     - adminFetch (Bearer) — admin auth. window.location.origin → absolute URL.
     - Mevcut admin class'ları (admin-btn-ghost/primary) reuse; yeni design YOK.
     - VillaTemporaryUrlButton pattern'iyle (toast/clipboard) tutarlı.
     - Modal PORTAL ile en yakın `.admin-shell` köküne render edilir:
       tetikleyici buton kart toolbar'ının (`relative z-[2]`) stacking
       context'i içinde; inline render'da modalın z-[60]'ı o context'e
       hapsoluyor ve sonraki kartların toolbar'ları (+ sticky topbar)
       overlay'in ÜSTÜNDE boyanıyordu. `.admin-shell` (stacking context
       değil) → admin CSS token'ları/fontları aynen miras kalır;
       z-[60] kök stacking context'te topbar (z-30) / drawer (z-50)
       üstünde. Görsel tasarım, içerik ve davranış DEĞİŞMEDİ.
   =============================================================== */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Archive, Copy, X, Trash2, Loader2 } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";

type ZipLink = {
  id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  download_count: number;
  created_at: string;
};

const DURATIONS = [
  { hours: 1, label: "1 saat" },
  { hours: 3, label: "3 saat" },
  { hours: 6, label: "6 saat" },
  { hours: 24, label: "24 saat" },
] as const;

function isLinkActive(l: ZipLink): boolean {
  return !l.revoked_at && new Date(l.expires_at).getTime() > Date.now();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toAbsolute(path: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function VillaZipShareButton({
  villaId,
  villaTitle,
  disabled,
}: {
  villaId: string;
  villaTitle: string;
  disabled?: boolean;
}) {
  const toast = useNotify();
  const [open, setOpen] = useState(false);
  /* Portal hedefi — açılışta tetikleyicinin `.admin-shell` kökü
     (yoksa body). Render sırasında DOM/ref okunmaz. */
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [duration, setDuration] = useState<number>(1);
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<ZipLink[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /* ---- liste fetch (YALNIZ modal açılışında) ---- */
  const loadLinks = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await adminFetch(
        `/api/admin/villa-zip?villa_id=${encodeURIComponent(villaId)}`
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; links?: ZipLink[] }
        | null;
      if (res.ok && json?.ok) {
        setLinks(json.links || []);
      }
    } catch {
      /* sessiz — UI boş liste gösterir */
    } finally {
      setLoadingList(false);
    }
  }, [villaId]);

  /* Modal açılınca fetch; kapanınca state reset (preload YOK). */
  useEffect(() => {
    if (!open) return;
    void loadLinks();
  }, [open, loadLinks]);

  /* ESC + body scroll lock (VillaVideoModal pattern). */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const closeModal = () => {
    setOpen(false);
    setCreatedUrl(null);
    setDuration(1);
  };

  /* ---- create ---- */
  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setCreatedUrl(null);
    try {
      const res = await adminFetch("/api/admin/villa-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa_id: villaId,
          duration_hours: duration,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; download_path?: string }
        | null;
      if (!res.ok || !json?.ok || !json.download_path) {
        toast.error("ZIP linki oluşturulamadı", {
          id: `villa-zip-${villaId}`,
          description: json?.error,
        });
        return;
      }
      const url = toAbsolute(json.download_path);
      setCreatedUrl(url);
      toast.success("ZIP linki oluşturuldu", {
        id: `villa-zip-${villaId}`,
        description: `${villaTitle} — ${duration} saat geçerli`,
      });
      void loadLinks();
    } catch (err) {
      toast.error("ZIP linki oluşturulamadı", {
        id: `villa-zip-${villaId}`,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  /* ---- copy ---- */
  const handleCopy = async (url: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link kopyalandı", { id: `villa-zip-copy-${villaId}` });
      } else {
        toast.info("Link hazır", {
          id: `villa-zip-copy-${villaId}`,
          description: url,
        });
      }
    } catch {
      toast.info("Link hazır", {
        id: `villa-zip-copy-${villaId}`,
        description: url,
      });
    }
  };

  /* ---- revoke (optimistic) ---- */
  const handleRevoke = async (id: string) => {
    if (revokingId) return;
    setRevokingId(id);
    const prev = links;
    /* Optimistic: anında revoked işaretle. */
    setLinks((cur) =>
      cur.map((l) =>
        l.id === id ? { ...l, revoked_at: new Date().toISOString() } : l
      )
    );
    try {
      const res = await adminFetch(`/api/admin/villa-zip/${id}/revoke`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        setLinks(prev); // revert
        toast.error("İptal edilemedi", {
          id: `villa-zip-revoke-${id}`,
          description: json?.error,
        });
        return;
      }
      toast.success("Link iptal edildi", { id: `villa-zip-revoke-${id}` });
    } catch (err) {
      setLinks(prev); // revert
      toast.error("İptal edilemedi", {
        id: `villa-zip-revoke-${id}`,
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          setPortalTarget(
            e.currentTarget.closest<HTMLElement>(".admin-shell") ??
              document.body
          );
          setOpen(true);
        }}
        disabled={disabled}
        className="admin-btn-ghost disabled:opacity-50"
        aria-label={`${villaTitle} için ZIP paylaşım linki`}
        title="Mülk görsellerini ZIP olarak paylaş (süreli, iptal edilebilir link)"
      >
        <Archive size={13} />
        ZIP Paylaş
      </button>

      {open && portalTarget && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${villaTitle} ZIP paylaşımı`}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          {/* backdrop */}
          <button
            type="button"
            aria-label="Kapat"
            onClick={closeModal}
            className="absolute inset-0 bg-[#020617]/55 backdrop-blur-sm"
          />

          <div className="relative z-10 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--admin-card,#fff)] shadow-2xl border border-[var(--admin-border,#e5e7eb)]">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--admin-border,#e5e7eb)]">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-[var(--admin-muted,#6b7280)]">
                  ZIP Paylaş
                </p>
                <h3 className="font-semibold text-[15px] text-[var(--admin-text,#111827)] truncate">
                  {villaTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="admin-icon-btn shrink-0"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* create */}
              <div className="space-y-2">
                <label className="block text-[12.5px] font-medium text-[var(--admin-text,#111827)]">
                  Geçerlilik süresi
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.hours}
                      type="button"
                      onClick={() => setDuration(d.hours)}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors ${
                        duration === d.hours
                          ? "admin-btn-primary"
                          : "admin-btn-ghost"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="admin-btn-primary w-full justify-center disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Archive size={14} />
                  )}
                  {creating ? "Oluşturuluyor…" : "ZIP Link Oluştur"}
                </button>
              </div>

              {/* created link */}
              {createdUrl && (
                <div className="space-y-1.5">
                  <label className="block text-[12px] text-[var(--admin-muted,#6b7280)]">
                    Paylaşım linki
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={createdUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 rounded-lg border border-[var(--admin-border,#e5e7eb)] px-3 py-2 text-[12.5px] bg-[var(--admin-bg-soft,#f9fafb)] text-[var(--admin-text,#111827)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(createdUrl)}
                      className="admin-btn-ghost shrink-0"
                    >
                      <Copy size={13} />
                      Kopyala
                    </button>
                  </div>
                </div>
              )}

              {/* active links list */}
              <div className="space-y-2">
                <p className="text-[12.5px] font-medium text-[var(--admin-text,#111827)]">
                  Mevcut linkler
                </p>
                {loadingList ? (
                  <p className="text-[12px] text-[var(--admin-muted,#6b7280)] flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Yükleniyor…
                  </p>
                ) : links.length === 0 ? (
                  <p className="text-[12px] text-[var(--admin-muted,#6b7280)]">
                    Henüz link yok.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {links.map((l) => {
                      const active = isLinkActive(l);
                      const status = l.revoked_at
                        ? "İptal edildi"
                        : active
                          ? "Aktif"
                          : "Süresi doldu";
                      return (
                        <li
                          key={l.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--admin-border,#e5e7eb)] px-3 py-2"
                        >
                          <div className="min-w-0 text-[11.5px]">
                            <span
                              className={`font-medium ${
                                active
                                  ? "text-emerald-600"
                                  : "text-[var(--admin-muted,#6b7280)]"
                              }`}
                            >
                              {status}
                            </span>
                            <span className="text-[var(--admin-muted,#6b7280)]">
                              {" "}
                              · {formatDate(l.expires_at)} · {l.download_count} indirme
                            </span>
                          </div>
                          {active && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(l.id)}
                              disabled={revokingId === l.id}
                              className="admin-btn-ghost shrink-0 hover:!text-rose-500 disabled:opacity-50"
                              aria-label="Linki iptal et"
                              title="Linki iptal et"
                            >
                              {revokingId === l.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Trash2 size={12} />
                              )}
                              İptal
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>,
        portalTarget
      )}
    </>
  );
}
