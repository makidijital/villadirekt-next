"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Eye, FileText, Check, Pencil } from "lucide-react";

import { adminFetch } from "@/lib/admin-fetch";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateMenu } from "@/app/services/revalidate.actions";
import { logActivity } from "@/lib/activity-log.client";
/* 🛡️ PHASE 12 — ADMIN I18N (Seçenek A: admin'de locale KAYNAĞI YOK).
   `getDictionary` saf/senkron bir fonksiyondur (Phase 2) → client
   component içinde güvenle çağrılır, server/client sınırı bozulmaz.
   Bu fazda cookie/localStorage/middleware/DB locale alanı EKLENMEDİ;
   bilinçli olarak DEFAULT_LOCALE sabit kullanılır → render çıktısı
   Phase 12 öncesiyle BYTE-IDENTICAL. İleride tek bir admin locale
   kaynağı bağlandığında yalnız bu argüman değişir. */
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/* ===============================================================
   🛡️ ADMIN > SAYFALAR — UNIFIED CONFIRM DIALOG (Faz: confirm parity)
   ===============================================================
   Önceden bu ekran server component + Server Action ile çalışıyordu;
   Sil butonu doğrudan POST ile yayından kaldırma yapıyor, native
   browser hissi veriyordu (admin'in premium UX dili'ni kırıyordu).

   YAPILAN: Tek sayfa client component'e dönüştürüldü:
     - useConfirm()  → unified premium ConfirmDialog (ESC,
                       outside-click reject, mobile parity)
     - useNotify()   → success/error toast'ları (server action'da
                       toast tetiklenemiyordu)
     - delete → DB davranışı byte-identical
     - router.refresh → menu/auto-include gibi türev kaynakları
                        invalidate eder

   DOKUNULMADI:
     - JSX layout, CSS classes, design language (card-premium,
       champagne/stone palette, button stilleri)
     - getPages() service'i (anon DB client ile hem server hem client
       tarafında çalışır)
     - Diğer route/component/service
   =============================================================== */

type PageRow = {
  id: string;
  title: string;
  slug: string;
  is_active?: boolean | null;
  show_in_menu?: boolean | null;
  [key: string]: any;
};

export default function AdminPages() {
  const router = useRouter();
  const toast = useNotify();
  const confirm = useConfirm();

  const adminDict = getDictionary(DEFAULT_LOCALE).admin;
  const pagesDict = adminDict.pages;

  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [publishTogglingId, setPublishTogglingId] = useState<string | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* 🛡️ adminFetch GET /api/admin/pages — service-role list; drafts
         (is_active=false) dahil. Daha önce client-anon `getPages()`
         servisi `findActiveList()` ile DRAFTleri gizliyordu → admin
         publish toggle eklendiği için artık tüm satırlar gerekli. */
      try {
        const res = await adminFetch("/api/admin/pages");
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: PageRow[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          toast.error(pagesDict.toast.listFailed, {
            id: "pages-list",
            description: json.error || `HTTP ${res.status}`,
          });
          setPages([]);
        } else {
          setPages((json.data || []) as PageRow[]);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : adminDict.common.networkError;
        toast.error(pagesDict.toast.listFailed, {
          id: "pages-list",
          description: msg,
        });
        setPages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    /* 🛡️ DEP ARRAY: boş — yalnız mount'ta fetch.
       `useNotify()` her render'da yeni object literal döner; bunu
       dep'e koyarsak optimistic publish-toggle update edildikten
       sonra re-render → toast yeni ref → effect re-fetches list →
       optimistic state REVERT olur (kullanıcı "Yayında" derken
       satır eski haline atlar). eslint-disable bilinçli intent. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 🛡️ YAYIN DURUMU toggle — is_active aç/kapat.
     Optimistic UI; başarısızsa revert. /p/[slug] dynamic render,
     route cache invalidation gerekmez. Header menüsü is_active'i
     filtrelediği için revalidateMenu de tetiklenir. */
  async function handleTogglePublish(page: PageRow) {
    if (publishTogglingId) return;
    const next = !(page.is_active !== false);
    setPublishTogglingId(page.id);
    setPages((prev) =>
      prev.map((p) => (p.id === page.id ? { ...p, is_active: next } : p))
    );
    let updErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/pages/${encodeURIComponent(page.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: next }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        updErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      updErr = err instanceof Error ? err.message : adminDict.common.requestFailed;
    }
    setPublishTogglingId(null);
    if (updErr) {
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, is_active: !next } : p
        )
      );
      toast.error(pagesDict.toast.publishFailed, {
        id: `page-publish-${page.id}`,
        description: updErr,
      });
      return;
    }
    toast.success(
      next ? pagesDict.toast.published : pagesDict.toast.drafted,
      {
        id: `page-publish-${page.id}`,
      }
    );
    logActivity({
      action: "page.updated",
      entity_type: "page",
      entity_id: page.id,
      entity_title: page.title,
      after_data: { id: page.id, is_active: next },
    }).catch(() => {});
    revalidateMenu().catch(() => {});
    router.refresh();
  }

  async function handleDelete(page: PageRow) {
    const ok = await confirm({
      title: pagesDict.confirm.deleteTitle,
      description: pagesDict.confirm.deleteDescription,
      confirmLabel: pagesDict.confirm.deleteLabel,
      variant: "danger",
    });
    if (!ok) return;

    setDeletingId(page.id);
    /* 🛡️ FAZ 2 frontend purge — adminFetch (Bearer) DELETE /api/admin/pages.
       Davranış BYTE-IDENTICAL: aynı `.delete().eq("id", id)` server'da
       service_role ile. Slug/path/SEO/sitemap mevcut davranışa göre
       row silinince invalidate olur (route içinde DB delete). */
    let delErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/pages?id=${encodeURIComponent(page.id)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        delErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      delErr = err instanceof Error ? err.message : adminDict.common.requestFailed;
    }
    setDeletingId(null);

    if (delErr) {
      toast.error(pagesDict.toast.deleteFailed, {
        id: `page-delete-${page.id}`,
        description: delErr,
      });
      return;
    }

    /* Optimistic local list update; ardından server-side cache
       invalidation (header menu, kiralık-villalar arşivi vs. türev
       kaynakları taze versiyon görsün). */
    setPages((prev) => prev.filter((p) => p.id !== page.id));
    toast.success(pagesDict.toast.deleted, { id: `page-delete-${page.id}` });

    /* 🛡️ FAZ 55H — AUDIT LOG (fail-safe).
       before_data: silinen page snapshot; admin page listesinde
       zaten yüklü minimal alanlar var. */
    logActivity({
      action: "page.deleted",
      entity_type: "page",
      entity_id: page.id,
      entity_title: page.title,
      before_data: {
        id: page.id,
        title: page.title,
        slug: page.slug,
      },
    }).catch(() => {});

    /* Page silinmesi menu auto-include'ı da etkiler. */
    revalidateMenu().catch(() => {});
    router.refresh();
  }

  /* 🛡️ MENÜDE GÖSTER toggle (migration 045) — mevcut sayfayı header
     auto-include'a ekler/çıkarır. Optimistic + revalidateMenu. /p/{slug}
     route + SEO + sitemap ETKİLENMEZ. */
  async function handleToggleMenu(page: PageRow) {
    if (togglingId) return;
    const next = !page.show_in_menu;
    setTogglingId(page.id);
    setPages((prev) =>
      prev.map((p) => (p.id === page.id ? { ...p, show_in_menu: next } : p))
    );
    /* 🛡️ FAZ 2 frontend purge — adminFetch (Bearer) PATCH /api/admin/pages.
       Optimistic UI (yukarıda zaten setPages) + revert (aşağıda) korundu.
       Davranış BYTE-IDENTICAL: aynı `pages.update({ show_in_menu })`
       service_role server-side. revalidateMenu + router.refresh aynen. */
    let updErr: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/pages?id=${encodeURIComponent(page.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ show_in_menu: next }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        updErr = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      updErr = err instanceof Error ? err.message : adminDict.common.requestFailed;
    }
    setTogglingId(null);
    if (updErr) {
      /* revert */
      setPages((prev) =>
        prev.map((p) =>
          p.id === page.id ? { ...p, show_in_menu: !next } : p
        )
      );
      toast.error(adminDict.common.updateFailed, {
        id: `page-menu-${page.id}`,
        description: updErr,
      });
      return;
    }
    toast.success(
      next ? pagesDict.toast.menuAdded : pagesDict.toast.menuRemoved,
      {
        id: `page-menu-${page.id}`,
      }
    );
    revalidateMenu().catch(() => {});
    router.refresh();
  }

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{pagesDict.list.eyebrow}</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            {pagesDict.list.title}
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            {pagesDict.list.subtitle}
          </p>
        </div>

        <Link
          href="/maki-admin/pages/new"
          className="btn-primary self-start"
        >
          <Plus size={15} />
          {pagesDict.list.newPageCta}
        </Link>
      </div>

      {loading ? (
        <div className="card-premium p-10 text-center">
          <p className="text-sm text-[var(--color-stone-500)]">
            {adminDict.common.loadingEllipsis}
          </p>
        </div>
      ) : pages.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <FileText size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            {pagesDict.list.emptyTitle}
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            {pagesDict.list.emptyDescription}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pages.map((page) => {
            const isDeleting = deletingId === page.id;
            const isPublished = page.is_active !== false;
            const isPublishing = publishTogglingId === page.id;
            return (
              <div
                key={page.id}
                className="card-premium p-5 flex justify-between items-center gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                    <FileText size={14} className="text-[var(--color-champagne-700)]" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-medium text-[var(--color-stone-900)] truncate">
                        {page.title}
                      </h3>
                      {!isPublished && (
                        <span className="text-[10px] tracking-[0.12em] uppercase font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                          Taslak
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] uppercase font-mono truncate">
                      /p/{page.slug}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 items-center shrink-0">
                  <Link
                    href={`/p/${page.slug}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Eye size={13} />
                    {pagesDict.list.view}
                  </Link>

                  <Link
                    href={`/maki-admin/pages/${page.id}`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Pencil size={13} />
                    {adminDict.common.edit}
                  </Link>

                  {/* 🛡️ YAYIN DURUMU toggle — taslak ⇄ yayında. */}
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(page)}
                    disabled={isPublishing}
                    title={
                      isPublished
                        ? pagesDict.publish.unpublishTitle
                        : pagesDict.publish.publishTitle
                    }
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed ${
                      isPublished
                        ? "text-emerald-700 hover:bg-emerald-50"
                        : "text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {isPublished
                      ? pagesDict.publish.published
                      : pagesDict.publish.draft}
                  </button>

                  {/* 🛡️ Menüde Göster toggle — aktif yeşil; kapalı nötr.
                     /p/{slug} erişimi ve SEO bundan bağımsızdır. */}
                  <button
                    type="button"
                    onClick={() => handleToggleMenu(page)}
                    disabled={togglingId === page.id}
                    title={
                      page.show_in_menu
                        ? pagesDict.list.removeFromMenu
                        : pagesDict.list.addToTopMenu
                    }
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-60 disabled:cursor-not-allowed ${
                      page.show_in_menu
                        ? "text-emerald-700 hover:bg-emerald-50"
                        : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-800)] hover:bg-[var(--color-sand-50)]"
                    }`}
                  >
                    <Check size={13} />
                    {page.show_in_menu
                      ? pagesDict.list.inMenu
                      : pagesDict.list.addToMenu}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(page)}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                    {isDeleting
                      ? adminDict.common.deleting
                      : adminDict.common.delete}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
