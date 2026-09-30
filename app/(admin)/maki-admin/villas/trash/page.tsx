"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  RotateCcw,
  Trash2,
  Trash as TrashBin,
  MapPin,
} from "lucide-react";

/* 🛡️ Villa Migration S1 — client boundary: runtime villa.service import'u
   yerine server action (call-site alias ile değişmez). Provider/repository/
   eski sağlayıcı AYNEN; yalnız client bundle'dan villa.service çıkarıldı. */
import { getTrashedVillasAction as getTrashedVillas } from "@/app/services/villa.action";
/* 🛡️ FAZ 2 frontend purge — TÜM villa-admin service runtime import'ları
   KALDIRILDI. Önceki turda `restoreVilla` deep import edilmişti
   (`villa-admin/visibility.service`); ama FAZ 2 STABILIZATION sonrası
   visibility.service `villa.repository.server` (server-only, dbAdmin)
   kullanıyor → client bundle'a server-only zincir sızıyordu.
   Şimdi her iki destructive eylem de adminFetch arkasında:
     - `hardDeleteVilla` → POST /api/admin/villas/[id]/hard-delete
     - `restoreVilla`    → POST /api/admin/villas/[id]/restore
   Service `{ ok, error? }` return shape AYNEN; route delege eder. */
import { adminFetch } from "@/lib/admin-fetch";
import { revalidateVillas } from "@/app/services/revalidate.actions";
import { parseUtcDate } from "@/lib/date-format";

import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🛡️ /maki-admin/villas/trash — TRASH BIN / RECOVERY LAYER
   ===============================================================
   Yalnız `deleted_at IS NOT NULL` olan villaları gösterir.
   İki destructive olmayan ve bir destructive aksiyon:
     - Geri Yükle      → restoreVilla()    (deleted_at=null, is_active=true)
     - Kalıcı Sil      → hardDeleteVilla() (presentation relations + storage
                          temizliği + DELETE FROM villa). useConfirm()
                          destructive modal arkasında.

   ARCHITECTURAL CONTRACT:
     soft delete     → business safety layer (getVillasForAdmin + getVillas
                       zaten gizliyor)
     trash           → recovery layer (BU ekran)
     hard delete     → manual destructive admin action (Kalıcı Sil)
     Üç semantic birbirine karışmaz.

   DOKUNULMAYANLAR:
     reservations / manual_reservations, pricing engine, availability
     helper, SEO metadata, slug structure, /arama filtering, public SSR,
     menu system. Hard delete reservation history'sini koruyor (FK
     reddederse explicit hata; admin bilgilendiriliyor).
   =============================================================== */

/* TrashedVilla: getTrashedVillas (VillaDTO) shape'inden okunan
   minimum fields. Index imzası unknown — forward-compat, ekstra
   alanlar runtime'da var olsa da tip katmanında any sızıntısı yok. */
type TrashedVilla = {
  id: string;
  title: string;
  slug: string;
  location?: string;
  images?: string[];
  created_at?: string | null;
  deleted_at?: string | null;
  [k: string]: unknown;
};

function formatDateTr(s?: string | null): string {
  if (!s) return "—";
  /* 🛡️ parseUtcDate (central canonical) → naive datetime'ları (eski sağlayıcı
     bazen TZ suffix'siz döner) UTC olarak normalize eder. Sonra
     toLocaleDateString Istanbul tz ile Türkçe long-month format. */
  const d = parseUtcDate(s);
  if (!d) return "—";
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

export default function VillaTrashPage() {
  const router = useRouter();
  const toast = useNotify();
  const confirm = useConfirm();

  const [villas, setVillas] = useState<TrashedVilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getTrashedVillas();
      if (cancelled) return;
      setVillas(data as TrashedVilla[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRestore(villa: TrashedVilla) {
    /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas/[id]/restore.
       Route içinde aynı `restoreVilla(id)` service delege; aynı
       `{ ok, error? }` shape caller'a iletilir. Loading state
       (setBusyId), toast id, optimistic remove ve revalidateVillas
       davranışı AYNEN korundu. */
    setBusyId(villa.id);
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch(
        `/api/admin/villas/${encodeURIComponent(villa.id)}/restore`,
        { method: "POST" }
      );
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    setBusyId(null);

    if (!res.ok) {
      toast.error("Mülk geri yüklenemedi", {
        id: `villa-restore-${villa.id}`,
        description: res.error,
      });
      return;
    }

    setVillas((prev) => prev.filter((v) => v.id !== villa.id));
    toast.success("Mülk geri yüklendi", {
      id: `villa-restore-${villa.id}`,
      description: villa.title,
    });
    revalidateVillas().catch(() => {});
    router.refresh();
  }

  async function handleHardDelete(villa: TrashedVilla) {
    const proceed = await confirm({
      title: "Mülk kalıcı olarak silinsin mi?",
      description:
        "Bu işlem geri alınamaz. Mülk ile ilişkili görseller ve yönetim kayıtları tamamen kaldırılır.",
      confirmLabel: "Kalıcı Olarak Sil",
      variant: "danger",
    });
    if (!proceed) return;

    /* 🛡️ FAZ 2 — adminFetch POST /api/admin/villas/[id]/hard-delete.
       Route içinde aynı `hardDeleteVilla(id)` service delege; aynı
       `{ ok, error? }` shape caller'a iletilir (eski semantic). Loading
       state (setBusyId), toast id, optimistic remove ve revalidateVillas
       davranışı AYNEN korundu. */
    setBusyId(villa.id);
    let res: { ok: boolean; error?: string };
    try {
      const apiRes = await adminFetch(
        `/api/admin/villas/${encodeURIComponent(villa.id)}/hard-delete`,
        { method: "POST" }
      );
      const json = (await apiRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      res =
        apiRes.ok && json.ok
          ? { ok: true }
          : { ok: false, error: json.error || `HTTP ${apiRes.status}` };
    } catch (err) {
      res = {
        ok: false,
        error: err instanceof Error ? err.message : "İstek başarısız",
      };
    }
    setBusyId(null);

    if (!res.ok) {
      toast.error("Kalıcı silme başarısız", {
        id: `villa-harddelete-${villa.id}`,
        description: res.error,
      });
      return;
    }

    setVillas((prev) => prev.filter((v) => v.id !== villa.id));
    toast.success("Mülk kalıcı olarak silindi", {
      id: `villa-harddelete-${villa.id}`,
      description: villa.title,
    });
    revalidateVillas().catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Mülkler</p>
          <h1 className="admin-page-header__title">Çöp Kutusu</h1>
          <p className="admin-page-header__sub">
            Silinmiş villalar burada saklanır. Geri yükleyebilir veya
            kalıcı olarak kaldırabilirsin. Kalıcı silme, geri alınamayan
            destructive bir işlemdir.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <Link
            href="/maki-admin/villas"
            className="admin-btn-ghost"
          >
            <ArrowLeft size={14} />
            Mülklere dön
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="admin-card-flat p-12 text-center">
          <p className="text-[var(--admin-muted)] text-sm">Yükleniyor…</p>
        </div>
      ) : villas.length === 0 ? (
        <div className="admin-card-flat p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <TrashBin size={18} className="text-[var(--admin-muted)]" />
          </div>
          <h3 className="font-display text-[22px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Çöp Kutusu boş
          </h3>
          <p className="text-[var(--admin-muted)] text-sm mt-2 max-w-sm mx-auto">
            Silinmiş mülk yok. Buraya yalnızca soft delete ile çöpe
            taşınan mülkler düşer.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {villas.map((villa) => {
            const cover = Array.isArray(villa.images)
              ? villa.images.find(
                  (u): u is string =>
                    typeof u === "string" && u.trim().length > 0
                )
              : undefined;
            const isBusy = busyId === villa.id;

            return (
              <article
                key={villa.id}
                className="admin-card p-5 space-y-4 ring-1 ring-[var(--admin-border)]"
              >
                {/* COVER + meta */}
                <div className="relative aspect-[5/4] overflow-hidden rounded-xl bg-[var(--admin-bg-soft)] border border-[var(--admin-border)]">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cover}
                      alt={villa.title || "Mülk"}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[var(--admin-muted)] text-[11px] tracking-[0.18em] uppercase">
                      Görsel yok
                    </div>
                  )}
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--admin-text)] bg-white/90 backdrop-blur-sm border border-[var(--admin-border)] px-2 py-0.5 rounded-full">
                    <TrashBin size={10} />
                    Silindi
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
                      {villa.title}
                    </h3>
                    {villa.location && (
                      <p className="text-[12px] text-[var(--admin-muted-2)] mt-1 truncate inline-flex items-center gap-1.5">
                        <MapPin size={11} />
                        {villa.location}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] tracking-[0.16em] uppercase font-mono text-[var(--admin-muted-2)] bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] px-2 py-1 rounded-md shrink-0">
                    #{String(villa.id).slice(0, 4)}
                  </span>
                </div>

                <div className="admin-divider" />

                {/* META: slug + dates */}
                <dl className="text-[12px] space-y-1.5 text-[var(--admin-muted)]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="tracking-[0.04em] uppercase text-[10.5px] font-semibold text-[var(--admin-muted-2)]">
                      Slug
                    </dt>
                    <dd className="font-mono text-[11px] truncate text-[var(--admin-text)]">
                      /{villa.slug}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="tracking-[0.04em] uppercase text-[10.5px] font-semibold text-[var(--admin-muted-2)]">
                      Oluşturuldu
                    </dt>
                    <dd className="tabular-nums">
                      {formatDateTr(villa.created_at)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="tracking-[0.04em] uppercase text-[10.5px] font-semibold text-[var(--admin-muted-2)]">
                      Silindi
                    </dt>
                    <dd className="tabular-nums">
                      {formatDateTr(villa.deleted_at)}
                    </dd>
                  </div>
                </dl>

                {/* ACTIONS */}
                <div className="flex gap-2 items-stretch">
                  <button
                    type="button"
                    onClick={() => handleRestore(villa)}
                    disabled={isBusy}
                    className="admin-btn-ghost flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={13} />
                    {isBusy ? "İşleniyor…" : "Geri Yükle"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHardDelete(villa)}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-[12.5px] font-medium border border-red-200 text-red-700 bg-white hover:bg-red-50 hover:border-red-300 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                    {isBusy ? "İşleniyor…" : "Kalıcı Sil"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
