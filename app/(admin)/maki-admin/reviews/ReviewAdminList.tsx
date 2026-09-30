"use client";

/* ===============================================================
   🛡️ FAZ 33 — ADMIN REVIEW LIST (client island)
   ===============================================================
   /maki-admin/reviews moderation listesi.

   AKSIYONLAR:
     - Onayla → approveVillaReview (is_approved=true, approved_at=now)
     - Öne çıkar → toggleFeaturedReview (villa başına 1 tane;
       DB partial unique index zaten enforce eder)
     - Sil → deleteVillaReview (destructive useConfirm sonrası)

   🛡️ FAZ 33B — CLIENT-SIDE FETCH
   ─────────────────────────────────────────────────────────────
   Veri tarayıcıda fetch edilir; eski sağlayıcı client otomatik olarak
   admin'in JWT session'ını ekler → RLS `authenticated` role policy
   devreye girer → pending + approved hepsi görünür.

   Server fetch denenirse anon role uygulanır ve villa_reviews'in
   public SELECT policy'si `is_approved=true` koşuluyla pending
   yorumları gizler. Service-role kullanılmaz; mevcut admin auth
   pattern (client'ta eski sağlayıcı session) reuse edilir.

   POST-MUTATION:
     - useNotify ile premium toast
     - revalidateVillaReviews → public sayfa cache invalidate
     - Optimistic local update (server roundtrip beklenmez)
     - Counter strip + liste her durumda authoritative refetch ile
       senkron tutulur

   UX:
     - Luxury stacked-list (reservation panel hissi)
     - Rounded-2xl card, soft shadow on hover
     - Star rating premium typography
     - Comment preview truncate
     - Status badge (Bekliyor / Yayında / Öne çıkan)
     - Mobile: actions flex-wrap; min 768px tek satır
     - İlk yükleme skeleton + premium counter strip dataset bağımlı
   =============================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Star,
  Trash2,
  CalendarRange,
  Sparkles,
  Inbox,
  Plus,
  Pencil,
  X,
} from "lucide-react";

/* 🛡️ Migration VR-B1 — client boundary: runtime villa-review.service
   (server-only native repo) yerine server action. service + native repo
   client bundle'a sızmaz. Call-site'lar alias ile değişmez. Type type-only. */
import {
  approveVillaReviewAction as approveVillaReview,
  createVillaReviewByAdminAction as createVillaReviewByAdmin,
  updateVillaReviewByAdminAction as updateVillaReviewByAdmin,
  deleteVillaReviewAction as deleteVillaReview,
  getVillaReviewsForAdminAction as getVillaReviewsForAdmin,
  toggleFeaturedReviewAction as toggleFeaturedReview,
} from "@/app/services/villa-review.action";
import type { VillaReviewAdmin } from "@/app/services/villa-review.service";
import { revalidateVillaReviews } from "@/app/services/revalidate.actions";
import { logActivity } from "@/lib/activity-log.client";
import { formatDateTr, istanbulYmd, todayIstanbulYmd } from "@/lib/date-format";
import AdminDateInput from "@/app/components/admin/shared/AdminDateInput";
/* 🛡️ MANUEL YORUM — mülk seçimi. homepage-collection / discount-collection
   picker deseninin BİREBİR aynısı: adminFetch + /api/admin/villas?activeOnly=1
   + normalizeSearchText araması. Yeni endpoint/servis YOK. */
import { adminFetch } from "@/lib/admin-fetch";
import { normalizeSearchText } from "@/lib/search";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

/* 🛡️ MANUEL YORUM — form tipleri. `/api/admin/villas?activeOnly=1`
   yanıtındaki mülk şekli (homepage-collection/discount-collection ile
   AYNI alanlar). */
type VillaOption = { id: string; title: string | null; slug: string | null };

type AdminReviewForm = {
  villa_id: string;
  guest_name: string;
  rating: number;
  comment: string;
  /** "Hemen yayınla" — VARSAYILAN AÇIK. */
  publish: boolean;
  /** "Yorum Tarihi" — "" | "YYYY-MM-DD". BOŞ → DB default (bugün). */
  created_at: string;
};

const EMPTY_FORM: AdminReviewForm = {
  villa_id: "",
  guest_name: "",
  rating: 5,
  comment: "",
  publish: true,
  created_at: "",
};

export default function ReviewAdminList() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [data, setData] = useState<VillaReviewAdmin[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  /* 🛡️ FAZ 33B — initial fetch loading state; mutation sırasında
     ayrı `busyId` per-row spinner zaten var. */
  const [loading, setLoading] = useState(true);

  /* Authoritative refetch — mount + her mutation sonrası çağrılır.
     Tarayıcı eski sağlayıcı oturumu authenticated → pending + approved gelir. */
  const refresh = useCallback(async () => {
    const fresh = await getVillaReviewsForAdmin();
    setData(fresh);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getVillaReviewsForAdmin();
        if (!cancelled) setData(fresh);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Counter strip: data değiştikçe yeniden hesaplanır. */
  const { pendingCount, approvedCount } = useMemo(() => {
    let p = 0;
    let a = 0;
    for (const r of data) {
      if (r.is_approved) a++;
      else p++;
    }
    return { pendingCount: p, approvedCount: a };
  }, [data]);

  /* ═══════════════════════════════════════════════════════════
     🛡️ MANUEL YORUM EKLEME (admin)
     ═══════════════════════════════════════════════════════════
     Mevcut ekrana entegre — yeni route/sayfa/modal YOK. Panel
     `discount-collection` / `homepage-collection` picker deseniyle
     aynı: buton → açılır `admin-card` paneli.

     ⚠️ Mevcut moderation akışlarına (approve / featured / delete)
     DOKUNULMADI; bu blok tamamen EK. */
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [villas, setVillas] = useState<VillaOption[] | null>(null);
  const [villasLoading, setVillasLoading] = useState(false);
  const [villaSearch, setVillaSearch] = useState("");
  const [form, setForm] = useState<AdminReviewForm>(EMPTY_FORM);

  /* Mülk listesi YALNIZ panel ilk açıldığında çekilir → sayfa ilk
     yüklemesinde ek istek YOK. */
  const openForm = async () => {
    const next = !showForm;
    setShowForm(next);
    if (!next) return;
    if (villas !== null || villasLoading) return;
    setVillasLoading(true);
    try {
      const res = await adminFetch("/api/admin/villas?activeOnly=1");
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        villas?: Array<{ id: string; title: string | null; slug: string | null }>;
      };
      setVillas(res.ok && json.ok ? json.villas || [] : []);
    } catch {
      setVillas([]);
    } finally {
      setVillasLoading(false);
    }
  };

  const filteredVillas = useMemo(() => {
    const list = villas || [];
    const q = villaSearch.trim();
    if (q.length === 0) return list;
    return list.filter((v) =>
      normalizeSearchText(v.title || "").includes(normalizeSearchText(q))
    );
  }, [villas, villaSearch]);

  const selectedVilla = useMemo(
    () => (villas || []).find((v) => v.id === form.villa_id) || null,
    [villas, form.villa_id]
  );

  const handleCreate = async () => {
    if (saving) return;
    setSaving(true);
    const res = await createVillaReviewByAdmin({
      villa_id: form.villa_id,
      guest_name: form.guest_name,
      rating: form.rating,
      comment: form.comment,
      publish: form.publish,
      created_at: form.created_at,
    });
    setSaving(false);

    if (!res.ok) {
      toast.error("Yorum eklenemedi", {
        id: "review-create",
        description: res.error,
      });
      return;
    }

    toast.success("Yorum eklendi", { id: "review-create" });

    /* 🛡️ FAZ 55F deseni — AUDIT LOG (fail-safe). Yeni kayıt olduğu için
       before_data YOK. entity_type "review" KORUNUR. */
    logActivity({
      action: "review.created",
      entity_type: "review",
      entity_title: selectedVilla?.title
        ? `${selectedVilla.title} · ${form.guest_name.trim()}`
        : form.guest_name.trim(),
      after_data: {
        villa_id: form.villa_id,
        rating: form.rating,
        is_approved: form.publish,
        is_featured: false,
        /* Tarih elle seçildiyse audit log'a yazılır; boşsa DB default. */
        created_at: form.created_at || null,
      },
    }).catch(() => {});

    /* Mevcut akış: public cache invalidate + authoritative refetch. */
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});

    setForm(EMPTY_FORM);
    setVillaSearch("");
    setShowForm(false);
  };

  /* ---------------- HANDLERS ---------------- */

  const handleApprove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const res = await approveVillaReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Onaylanamadı", {
        id: `review-approve-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Yorum onaylandı", { id: `review-approve-${id}` });
    /* 🛡️ FAZ 55F — AUDIT LOG (fail-safe).
       BEFORE snapshot: list state'inden review row'unu al. */
    const reviewBefore = data.find((r) => r.id === id);
    if (reviewBefore) {
      logActivity({
        action: "review.approved",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: {
          is_approved: reviewBefore.is_approved,
          approved_at: reviewBefore.approved_at,
          rating: reviewBefore.rating,
          villa_id: reviewBefore.villa_id,
        },
        after_data: {
          is_approved: true,
          approved_at: new Date().toISOString(),
          rating: reviewBefore.rating,
          villa_id: reviewBefore.villa_id,
        },
      }).catch(() => {});
    }
    /* Optimistic update — UI hızlı yansır, sonra authoritative refresh. */
    setData((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, is_approved: true, approved_at: new Date().toISOString() }
          : r
      )
    );
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  const handleToggleFeatured = async (id: string) => {
    if (busyId) return;
    /* Snapshot eski state — toast mesajını doğru anlatmak için
       (toggle sonrası `data` artık yeni state'e güncellenecek). */
    const prevFeatured = data.find((r) => r.id === id)?.is_featured ?? false;

    setBusyId(id);
    const res = await toggleFeaturedReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Öne çıkarılamadı", {
        id: `review-feature-${id}`,
        description: res.error,
      });
      return;
    }
    /* Toggle başarılı — local state'i optimistic update et:
       toggled review villa_id'sini bul; aynı villa'nın diğer
       featured'larını temizle; bunu invert et. */
    setData((prev) => {
      const target = prev.find((r) => r.id === id);
      if (!target) return prev;
      const willBeFeatured = !target.is_featured;
      return prev.map((r) => {
        if (r.id === id) {
          return { ...r, is_featured: willBeFeatured };
        }
        if (willBeFeatured && r.villa_id === target.villa_id) {
          return { ...r, is_featured: false };
        }
        return r;
      });
    });
    toast.success(
      prevFeatured ? "Öne çıkarma kaldırıldı" : "Yorum öne çıkarıldı",
      { id: `review-feature-${id}` }
    );
    /* 🛡️ FAZ 55F — AUDIT LOG (fail-safe).
       Action yön bilgisi explicit: featured / unfeatured. */
    const reviewBefore = data.find((r) => r.id === id);
    if (reviewBefore) {
      logActivity({
        action: prevFeatured ? "review.unfeatured" : "review.featured",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: { is_featured: prevFeatured, villa_id: reviewBefore.villa_id },
        after_data: { is_featured: !prevFeatured, villa_id: reviewBefore.villa_id },
      }).catch(() => {});
    }
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  /* ═══════════════════════════════════════════════════════════
     🛡️ MEVCUT YORUMU DÜZENLE (Ad Soyad / Puan / Yorum / Tarih)
     ═══════════════════════════════════════════════════════════
     Mevcut satır kartının İÇİNDE açılır — yeni route/modal/component
     sistemi YOK. Mutasyon sonrası akış approve/featured/delete ile
     BİREBİR aynı: optimistic update → audit log → cache invalidate
     → authoritative refetch. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleUpdate = async (
    id: string,
    patch: { guest_name: string; rating: number; comment: string; created_at: string }
  ): Promise<boolean> => {
    if (busyId) return false;
    const before = data.find((r) => r.id === id);

    setBusyId(id);
    const res = await updateVillaReviewByAdmin({ id, ...patch });
    setBusyId(null);

    if (!res.ok) {
      toast.error("Yorum güncellenemedi", {
        id: `review-update-${id}`,
        description: res.error,
      });
      return false;
    }

    toast.success("Yorum güncellendi", { id: `review-update-${id}` });

    /* 🛡️ FAZ 55F deseni — AUDIT LOG (fail-safe). is_featured/is_approved
       DEĞİŞMEDİĞİ için log'a da yazılmaz. */
    if (before) {
      logActivity({
        action: "review.updated",
        entity_type: "review",
        entity_id: id,
        entity_title: before.villa_title
          ? `${before.villa_title} · ${before.guest_name}`
          : before.guest_name,
        before_data: {
          guest_name: before.guest_name,
          rating: before.rating,
          created_at: before.created_at,
        },
        after_data: {
          guest_name: patch.guest_name,
          rating: patch.rating,
          created_at: patch.created_at || before.created_at,
        },
      }).catch(() => {});
    }

    setEditingId(null);
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
    return true;
  };

  const handleDelete = async (id: string) => {
    if (busyId) return;
    const ok = await confirm({
      title: "Yorum silinsin mi?",
      description:
        "Bu yorum kalıcı olarak kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;

    /* 🛡️ FAZ 55F — BEFORE snapshot (audit için), DELETE öncesi al. */
    const reviewBefore = data.find((r) => r.id === id);
    setBusyId(id);
    const res = await deleteVillaReview(id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `review-delete-${id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Yorum silindi", { id: `review-delete-${id}` });
    /* AUDIT LOG (fail-safe). */
    if (reviewBefore) {
      logActivity({
        action: "review.deleted",
        entity_type: "review",
        entity_id: id,
        entity_title:
          reviewBefore.villa_title
            ? `${reviewBefore.villa_title} · ${reviewBefore.guest_name}`
            : reviewBefore.guest_name,
        before_data: {
          id: reviewBefore.id,
          villa_id: reviewBefore.villa_id,
          villa_title: reviewBefore.villa_title,
          guest_name: reviewBefore.guest_name,
          rating: reviewBefore.rating,
          comment: reviewBefore.comment,
          is_approved: reviewBefore.is_approved,
          is_featured: reviewBefore.is_featured,
        },
      }).catch(() => {});
    }
    setData((prev) => prev.filter((r) => r.id !== id));
    revalidateVillaReviews().catch(() => {});
    refresh().catch(() => {});
  };

  /* ---------------- COUNTER STRIP ----------------
     Veri data'ya bağlı — server'da yoktu, client'a taşındı. */
  const counterStrip = (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="
          inline-flex items-center gap-2.5
          rounded-2xl border border-[var(--color-stone-100)]
          bg-white
          px-4 py-2.5
          text-sm
        "
      >
        <span
          className="
            w-7 h-7 rounded-full
            bg-amber-50 border border-amber-100
            flex items-center justify-center
            text-amber-700
          "
          aria-hidden
        >
          <Star size={13} />
        </span>
        <span className="text-[var(--color-stone-500)]">Bekleyen</span>
        <span className="font-display text-[16px] text-[var(--color-stone-900)] tabular-nums">
          {pendingCount}
        </span>
      </div>
      <div
        className="
          inline-flex items-center gap-2.5
          rounded-2xl border border-[var(--color-stone-100)]
          bg-white
          px-4 py-2.5
          text-sm
        "
      >
        <span
          className="
            w-7 h-7 rounded-full
            bg-emerald-50 border border-emerald-100
            flex items-center justify-center
            text-emerald-700
          "
          aria-hidden
        >
          <Star size={13} />
        </span>
        <span className="text-[var(--color-stone-500)]">Yayında</span>
        <span className="font-display text-[16px] text-[var(--color-stone-900)] tabular-nums">
          {approvedCount}
        </span>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     MANUEL YORUM PANELİ
     ═══════════════════════════════════════════════════════════
     Mevcut tasarım dili: `admin-card` + `btn-primary` + `input`
     class'ları, `useNotify` toast'ları, `Star` ikonu (liste ile aynı).
     Yeni tasarım sistemi/komponent kütüphanesi YOK. */
  const createPanel = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium text-[var(--color-stone-900)]">
          Manuel yorum
        </h2>
        <button
          type="button"
          onClick={openForm}
          className="btn-primary"
        >
          <Plus size={15} />
          {showForm ? "Kapat" : "Yeni Yorum Ekle"}
        </button>
      </div>

      {showForm && (
        <div className="admin-card p-4 md:p-5 space-y-4">
          {/* MÜLK SEÇİMİ */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
              Mülk
            </label>
            {selectedVilla ? (
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-[var(--color-stone-900)] truncate">
                  {selectedVilla.title}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, villa_id: "" }))
                  }
                  className="text-[12px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] underline underline-offset-2"
                >
                  Değiştir
                </button>
              </div>
            ) : (
              <>
                <input
                  value={villaSearch}
                  onChange={(e) => setVillaSearch(e.target.value)}
                  placeholder="Mülk ara…"
                  className="input w-full"
                />
                {villasLoading ? (
                  <p className="text-[12px] text-[var(--color-stone-400)] mt-2">
                    Yükleniyor…
                  </p>
                ) : filteredVillas.length === 0 ? (
                  <p className="text-[12px] text-[var(--color-stone-400)] mt-2">
                    Eşleşen mülk bulunamadı.
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-auto divide-y divide-[var(--color-stone-100)] mt-2 border border-[var(--color-stone-100)] rounded-xl">
                    {filteredVillas.slice(0, 50).map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, villa_id: v.id }));
                            setVillaSearch("");
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-[var(--color-sand-50)] flex items-center justify-between gap-3"
                        >
                          <span className="text-[14px] text-[var(--color-stone-900)] truncate">
                            {v.title}
                          </span>
                          <span className="text-[11px] text-[var(--color-stone-400)] tracking-[0.06em] font-mono">
                            /{v.slug || "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* AD SOYAD */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
              Ad Soyad
            </label>
            <input
              value={form.guest_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, guest_name: e.target.value }))
              }
              placeholder="Örn. Ayşe Yılmaz"
              maxLength={80}
              className="input w-full"
            />
          </div>

          {/* PUAN */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
              Puan
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, rating: n }))}
                  aria-label={`${n} yıldız`}
                  aria-pressed={form.rating === n}
                  className="p-1"
                >
                  <Star
                    size={18}
                    className={
                      n <= form.rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-[var(--color-stone-300)]"
                    }
                  />
                </button>
              ))}
              <span className="text-[12px] text-[var(--color-stone-500)] ml-1 tabular-nums">
                {form.rating}/5
              </span>
            </div>
          </div>

          {/* YORUM TARİHİ — mevcut AdminDateInput (admin design system).
              Boş bırakılırsa payload'a konmaz → DB default devrede. */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
              Yorum Tarihi
            </label>
            <div className="max-w-[220px]">
              <AdminDateInput
                mode="date"
                value={form.created_at}
                onChange={(v) => setForm((f) => ({ ...f, created_at: v }))}
                placeholder="Bugün"
                ariaLabel="Yorum tarihi"
                maxDate={todayIstanbulYmd()}
              />
            </div>
            <p className="text-[11px] text-[var(--color-stone-400)] mt-1">
              Boş bırakılırsa bugünün tarihi kullanılır. İleri tarih seçilemez.
            </p>
          </div>

          {/* YORUM */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
              Yorum
            </label>
            <textarea
              value={form.comment}
              onChange={(e) =>
                setForm((f) => ({ ...f, comment: e.target.value }))
              }
              rows={4}
              maxLength={1500}
              placeholder="En az 10 karakter…"
              className="input w-full resize-y"
            />
            <p className="text-[11px] text-[var(--color-stone-400)] mt-1 tabular-nums">
              {form.comment.trim().length} / 1500
            </p>
          </div>

          {/* HEMEN YAYINLA */}
          <label className="flex items-center gap-2 text-[13px] text-[var(--color-stone-700)] cursor-pointer">
            <input
              type="checkbox"
              checked={form.publish}
              onChange={(e) =>
                setForm((f) => ({ ...f, publish: e.target.checked }))
              }
              className="accent-[var(--color-champagne-600)]"
            />
            Hemen yayınla
            <span className="text-[11px] text-[var(--color-stone-400)]">
              (kapalıysa yorum onay bekleyenlere düşer)
            </span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="btn-primary disabled:opacity-40"
            >
              <Check size={15} />
              {saving ? "Kaydediliyor…" : "Yorumu Kaydet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setVillaSearch("");
              }}
              className="text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] px-3 py-2"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /* ---------------- LOADING SKELETON ---------------- */
  if (loading && data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        {createPanel}
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="admin-card p-4 md:p-5 animate-pulse"
            >
              <div className="h-4 w-1/3 bg-[var(--admin-bg-soft)] rounded mb-3" />
              <div className="h-3 w-2/3 bg-[var(--admin-bg-soft)] rounded mb-2" />
              <div className="h-3 w-1/2 bg-[var(--admin-bg-soft)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------- EMPTY STATE ---------------- */
  if (data.length === 0) {
    return (
      <div className="space-y-5">
        {counterStrip}
        {createPanel}
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Inbox size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz yorum yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Misafirlerden yeni yorumlar geldikçe bu sayfada listelenir.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------- LIST ---------------- */
  return (
    <div className="space-y-5">
      {counterStrip}
      {createPanel}
      <div className="flex flex-col gap-3">
        {data.map((r) => (
          <ReviewRow
            key={r.id}
            review={r}
            busy={busyId === r.id}
            editing={editingId === r.id}
            onEditOpen={() => setEditingId(r.id)}
            onEditCancel={() => setEditingId(null)}
            onSave={(patch) => handleUpdate(r.id, patch)}
            onApprove={() => handleApprove(r.id)}
            onToggleFeatured={() => handleToggleFeatured(r.id)}
            onDelete={() => handleDelete(r.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ===============================================================
   ROW CARD
   ===============================================================
   Reservation list / villa stacked-list paterni ile birebir feel.
   admin-card class reuse; left content + right action toolbar.
=============================================================== */
function ReviewRow({
  review,
  busy,
  editing,
  onEditOpen,
  onEditCancel,
  onSave,
  onApprove,
  onToggleFeatured,
  onDelete,
}: {
  review: VillaReviewAdmin;
  busy: boolean;
  editing: boolean;
  onEditOpen: () => void;
  onEditCancel: () => void;
  onSave: (patch: {
    guest_name: string;
    rating: number;
    comment: string;
    created_at: string;
  }) => Promise<boolean>;
  onApprove: () => void;
  onToggleFeatured: () => void;
  onDelete: () => void;
}) {
  const statusBadge = review.is_featured ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
      <Sparkles size={10} />
      Öne çıkan
    </span>
  ) : review.is_approved ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
      />
      Yayında
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-50 text-stone-700 border border-stone-200 shrink-0">
      <span
        aria-hidden="true"
        className="w-1.5 h-1.5 rounded-full bg-stone-400"
      />
      Bekliyor
    </span>
  );

  return (
    <article className="admin-card p-4 md:p-5 flex items-start gap-3 md:gap-4">
      {/* Avatar / star ring */}
      <div
        className="
          shrink-0 w-11 h-11 md:w-12 md:h-12
          rounded-full
          bg-[var(--color-sand-50)]
          border border-[var(--color-stone-100)]
          flex items-center justify-center
          text-[var(--color-champagne-700)]
        "
        aria-hidden
      >
        <Star size={16} fill="currentColor" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {/* HEADER ROW */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-[16px] md:text-[17px] text-[var(--admin-text)] tracking-[-0.015em] leading-tight truncate">
                {review.guest_name}
              </h3>
              {statusBadge}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-[12px] text-[var(--admin-muted-2)]">
              <span className="truncate">
                {review.villa_title || "—"}
              </span>
              <span className="text-[var(--admin-border-strong)]">·</span>
              <StarRow value={review.rating} />
              {review.created_at && (
                <>
                  <span className="text-[var(--admin-border-strong)]">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <CalendarRange size={11} aria-hidden />
                    {formatDateTr(review.created_at)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* COMMENT PREVIEW (line-clamp-3) — düzenleme modunda gizli */}
        {!editing && (
          <p
            className="
              text-[13.5px] text-[var(--admin-text)] leading-[1.65]
              whitespace-pre-line
            "
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {review.comment}
          </p>
        )}

        {/* 🛡️ INLINE DÜZENLEME — createPanel ile AYNI label/input
            desenleri; yeni modal/component sistemi YOK. */}
        {editing && (
          <ReviewEditFields
            review={review}
            busy={busy}
            onCancel={onEditCancel}
            onSave={onSave}
          />
        )}

        {/* ACTION TOOLBAR */}
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {!editing && (
            <button
              type="button"
              onClick={onEditOpen}
              disabled={busy}
              className="admin-btn-ghost disabled:opacity-50"
              title="Yorumu düzenle"
            >
              <Pencil size={13} />
              Düzenle
            </button>
          )}

          {!review.is_approved && (
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="admin-btn-primary disabled:opacity-50"
            >
              <Check size={13} />
              Onayla
            </button>
          )}

          {review.is_approved && (
            <button
              type="button"
              onClick={onToggleFeatured}
              disabled={busy}
              className={
                "admin-btn-ghost disabled:opacity-50 " +
                (review.is_featured
                  ? "!text-amber-700 !border-amber-200 hover:!bg-amber-50"
                  : "")
              }
              title={
                review.is_featured
                  ? "Öne çıkarmayı kaldır"
                  : "Bu yorumu öne çıkar (mülk başına 1)"
              }
            >
              <Sparkles size={13} />
              {review.is_featured ? "Öne çıkan" : "Öne çıkar"}
            </button>
          )}

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="admin-btn-ghost !text-red-600 !border-red-200 hover:!bg-red-50 disabled:opacity-50"
            aria-label="Yorum sil"
            title="Yorumu sil"
          >
            <Trash2 size={13} />
            Sil
          </button>
        </div>
      </div>
    </article>
  );
}

/* ===============================================================
   REVIEW EDIT FIELDS — mevcut kart İÇİNDE inline düzenleme
   ===============================================================
   Alanlar ve stiller "Yeni Yorum Ekle" panelinden BİREBİR devralındı
   (label sınıfları, `input` class'ı, yıldız seçici, AdminDateInput,
   admin-btn-primary / admin-btn-ghost). Yeni tasarım dili YOK.

   ⚠️ "Öne Çıkan" ve "Yayında" alanları BİLEREK YOK: mevcut
     toggleFeaturedReview / approveVillaReview akışları korunur,
     partial unique index invariant'ı bozulmaz.
=============================================================== */
function ReviewEditFields({
  review,
  busy,
  onCancel,
  onSave,
}: {
  review: VillaReviewAdmin;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: {
    guest_name: string;
    rating: number;
    comment: string;
    created_at: string;
  }) => Promise<boolean>;
}) {
  /* Mevcut created_at → "YYYY-MM-DD" (Istanbul takvim günü).
     Projenin mevcut tarih mantığı; yeni timezone sistemi YOK. */
  const [guestName, setGuestName] = useState(review.guest_name);
  const [rating, setRating] = useState(review.rating);
  const [comment, setComment] = useState(review.comment);
  const [createdAt, setCreatedAt] = useState(
    () => istanbulYmd(review.created_at || "") || ""
  );

  return (
    <div className="mt-2 pt-3 border-t border-[var(--admin-border)] flex flex-col gap-4">
      {/* AD SOYAD */}
      <div>
        <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
          Ad Soyad
        </label>
        <input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={80}
          className="input w-full"
        />
      </div>

      {/* PUAN */}
      <div>
        <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
          Puan
        </label>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n} yıldız`}
              aria-pressed={rating === n}
              className="p-1"
            >
              <Star
                size={18}
                className={
                  n <= rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-[var(--color-stone-300)]"
                }
              />
            </button>
          ))}
          <span className="text-[12px] text-[var(--color-stone-500)] ml-1 tabular-nums">
            {rating}/5
          </span>
        </div>
      </div>

      {/* YORUM TARİHİ */}
      <div>
        <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
          Yorum Tarihi
        </label>
        <div className="max-w-[220px]">
          <AdminDateInput
            mode="date"
            value={createdAt}
            onChange={setCreatedAt}
            placeholder="Tarih seç"
            ariaLabel="Yorum tarihi"
            maxDate={todayIstanbulYmd()}
          />
        </div>
        <p className="text-[11px] text-[var(--color-stone-400)] mt-1">
          İleri tarih seçilemez. Boş bırakılırsa mevcut tarih korunur.
        </p>
      </div>

      {/* YORUM */}
      <div>
        <label className="block text-[13px] font-medium text-[var(--color-stone-700)] mb-1.5">
          Yorum
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={1500}
          className="input w-full resize-y"
        />
        <p className="text-[11px] text-[var(--color-stone-400)] mt-1 tabular-nums">
          {comment.trim().length} / 1500
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              guest_name: guestName,
              rating,
              comment,
              created_at: createdAt,
            })
          }
          className="admin-btn-primary disabled:opacity-50"
        >
          <Check size={13} />
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="admin-btn-ghost disabled:opacity-50"
        >
          <X size={13} />
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/* ===============================================================
   STAR ROW — read-only, kompakt
   ===============================================================
   5 yıldız üzerinden filled count. Tabular display; admin liste
   içinde inline kullanılır.
=============================================================== */
function StarRow({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${filled} yıldız`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          fill={i <= filled ? "currentColor" : "none"}
          className={i <= filled ? "" : "text-[var(--admin-border-strong)]"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}
