"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/activity-log.client";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";
import {
  Plus,
  Trash2,
  Check,
  X,
  Phone,
  Calendar,
  Search,
  Printer,
  Send,
  Link2,
  ImageOff,
} from "lucide-react";

import {
  normalizePaymentPreference,
  paymentPreferenceBadgeLabel,
} from "@/lib/payment.helper";

import {
  normalizeReservationNo,
} from "@/lib/reservation-code.helper";

import {
  canConfirmReservation,
  RESERVATION_CONFIRM_GUARD_MESSAGE,
} from "@/lib/reservation-confirm.helper";


import {
  adminFetch,
  buildAdminUrlWithToken,
} from "@/lib/admin-fetch";

import { resolveVillaImageUrl } from "@/lib/storage.helpers";

import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

/* 🛡️ Villa kapak görseli — mevcut villa-listesi/page.tsx deseniyle
   BİREBİR: is_cover önce, sonra sort_order ASC; resolveVillaImageUrl
   (client-safe — "server-only" DEĞİL) mevcut R2/CDN altyapısını
   kullanarak image_url'i (full URL veya bucket-relative path) doğru
   absolute URL'e çevirir. Yeni storage/CDN kodu YOK. */
function resolveReservationVillaCoverUrl(
  villa:
    | {
        villa_images?: ReadonlyArray<{
          image_url: string | null;
          is_cover: boolean | null;
          sort_order: number | null;
        }> | null;
      }
    | null
    | undefined
): string | null {
  const imgs = Array.isArray(villa?.villa_images) ? villa!.villa_images! : [];
  if (imgs.length === 0) return null;
  const sorted = [...imgs].sort((a, b) => {
    if (a?.is_cover && !b?.is_cover) return -1;
    if (!a?.is_cover && b?.is_cover) return 1;
    return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
  });
  return resolveVillaImageUrl(sorted[0]?.image_url) || null;
}

export default function AdminReservationsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); // client-side UI filter only
  const [voucherSendingId, setVoucherSendingId] =
    useState<string | null>(null);
  /* 🔗 Paylaşım linki üretilirken ilgili satırın ikonu disable olur. */
  const [shareGeneratingId, setShareGeneratingId] =
    useState<string | null>(null);
  const router = useRouter();
  const toast = useNotify();
  const confirm = useConfirm();

  /* ---------------------------------------------
     🔥 VOUCHER MAIL — sadece confirmed rezervasyonlar için
     - POST /api/mail/voucher
     - structured logging; silent fail YOK
     - mevcut approved/cancelled mail flow'una dokunulmaz
  ---------------------------------------------- */
  /* ---------------------------------------------
     🔥 VOUCHER PDF — yeni tab'de PDF/print görünümü açar.
     - Admin auth: ?token=<access_token> URL'e eklenir
     - Server tarafında authorizeAdminCallerFlex doğrular
     - Token URL'de geçer → response Referrer-Policy: no-referrer
  ---------------------------------------------- */
  /* ---------------------------------------------
     🔗 REZERVASYON BİLGİLERİNİ PAYLAŞ — liste aksiyonu
     - Mevcut share-link API'sini yeniden kullanır (POST):
         /api/admin/reservations/{id}/share-link → { ok, url }
     - Dönen güvenli tokenlı linki panoya kopyalar.
     - Token lifecycle / hash-at-rest / expires davranışı DEĞİŞMEZ
       (API her POST'ta mevcut mantığıyla token üretir — bilinçli).
     - Modal/kart açmaz: oluştur → kopyala → toast.
  ---------------------------------------------- */
  const shareReservation = async (reservationId: string) => {
    if (!reservationId || shareGeneratingId) return;
    setShareGeneratingId(reservationId);
    const toastId = `share-${reservationId}`;
    toast.loading("Paylaşım linki oluşturuluyor", { id: toastId });
    try {
      const res = await adminFetch(
        `/api/admin/reservations/${reservationId}/share-link`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json?.ok || !json.url) {
        toast.error("Link oluşturulamadı", {
          id: toastId,
          description: json?.error || undefined,
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(json.url);
        toast.success("Rezervasyon paylaşım linki kopyalandı.", {
          id: toastId,
        });
      } catch {
        /* Pano erişimi yoksa link kaybolmasın — kullanıcı elle kopyalar. */
        toast.success("Paylaşım linki oluşturuldu", {
          id: toastId,
          description: json.url,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[share-link] CREATE_FAILED", { reservationId, error: msg });
      toast.error("Link oluşturulamadı", { id: toastId, description: msg });
    } finally {
      setShareGeneratingId(null);
    }
  };

  const openVoucherPdf = async (reservationId: string) => {
    if (!reservationId) return;
    try {
      const url = await buildAdminUrlWithToken(
        `/api/voucher/${encodeURIComponent(reservationId)}?print=1`
      );
      if (!url) {
        toast.error("Oturum bulunamadı", {
          id: "voucher-pdf",
          description: "Yeniden giriş yapın.",
        });
        return;
      }
      window.open(url, "_blank");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[voucher.pdf] OPEN_FAILED", { reservationId, error: msg });
      toast.error("Voucher PDF açılamadı", {
        id: "voucher-pdf",
        description: msg,
      });
    }
  };

  const sendVoucherMail = async (reservationId: string) => {
    if (!reservationId) return;
    setVoucherSendingId(reservationId);
    const toastId = `voucher-${reservationId}`;
    toast.loading("Rezervasyon Belgesi gönderiliyor", { id: toastId });
    try {
      const res = await adminFetch("/api/mail/voucher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          (json && typeof json.error === "string" && json.error) ||
          res.statusText ||
          "Gönderilemedi";
        console.error("[mail.voucher] FAILED", {
          reservationId,
          status: res.status,
          error: errMsg,
        });
        toast.error("Belge gönderilemedi", {
          id: toastId,
          description: errMsg,
        });
        return;
      }
      console.info("[mail.voucher] SENT", {
        reservationId,
        recipient: json?.recipient,
      });
      toast.success("Rezervasyon Belgesi gönderildi", {
        id: toastId,
        description: json?.recipient
          ? `Alıcı: ${json.recipient}`
          : undefined,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Bilinmeyen hata";
      console.error("[mail.voucher] DISPATCH ERROR", {
        reservationId,
        error: msg,
      });
      toast.error("Belge gönderilemedi", {
        id: toastId,
        description: msg,
      });
    } finally {
      setVoucherSendingId(null);
    }
  };

  /* ===============================================================
     🔥 LİSTE — TAMAMEN SNAPSHOT
     ===============================================================
     - calculateGrandTotal KULLANILMAZ.
     - Canlı villa fiyatı KULLANILMAZ.
     - Canlı kur KULLANILMAZ.
     - Gösterim sadece reservations tablosundaki frozen
       alanlardan beslenir:
         - original_price
         - original_currency
         - total_price_try
         - paid_amount
     =============================================================== */
  const fetchReservations = async () => {
    setLoading(true);
    /* 🛡️ FAZ 2 frontend purge — adminFetch (Bearer) GET /api/admin/reservations.
       Davranış BYTE-IDENTICAL: aynı select shape (villa:villa_id(title) embed
       dahil), aynı order (created_at desc), server-side service-role ile. */
    try {
      const res = await adminFetch("/api/admin/reservations");
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reservations?: unknown[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        console.error("❌ fetch error:", json.error || `HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      setData(json.reservations || []);
    } catch (err) {
      console.error("❌ fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    /* ---------------------------------------------
       🔥 OLD STATUS — eski değeri yerel state'ten yakala
       (mail trigger'ı için karşılaştırma)
    ---------------------------------------------- */
    const row = data.find((r: any) => r.id === id);
    const oldStatus = row?.status || null;

    /* ---------------------------------------------
       🔥 CONFIRMATION GUARD
       "confirmed" geçişi yalnız paid_amount > 0 ise serbest.
       Detail page'deki "Ödemeyi Onayla" akışı meşru yoldur.
    ---------------------------------------------- */
    if (
      status === "confirmed" &&
      !canConfirmReservation(row?.paid_amount)
    ) {
      toast.error("Onaylanamaz", {
        id: "confirm-guard",
        description: RESERVATION_CONFIRM_GUARD_MESSAGE,
      });
      return;
    }

    /* 🛡️ SERVER-SIDE GUARD (Faz 4B + FAZ 2 frontend purge):
       updateReservationStatus servisi route handler içinde çağrılır;
       'confirmed' transition paid_amount kuralını server-side enforce
       eder, audit log (adminGateway) atar. Client artık adminFetch ile
       /api/admin/reservations PATCH'i çağırır — server-only chain
       client'tan tamamen çıkarıldı. Error mesajı service'ten gelen
       text BYTE-IDENTICAL caller'a iletilir (toast aynı). */
    try {
      const res = await adminFetch(
        `/api/admin/reservations?id=${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        const msg = json.error || `HTTP ${res.status}`;
        toast.error("Durum güncellenemedi", {
          id: `status-${id}`,
          description: msg,
        });
        return;
      }
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error ? err.message : "Durum güncellenemedi";
      toast.error("Durum güncellenemedi", {
        id: `status-${id}`,
        description: msg,
      });
      return;
    }

    /* 🛡️ FAZ 55J-2 — AUDIT LOG (fail-safe).
       Status liste'den toggle edildiğinde minimal diff loglanır.
       Reservation row referansı `row` zaten state'te. */
    if (oldStatus !== status) {
      logActivity({
        action: "reservation.status_changed",
        entity_type: "reservation",
        entity_id: id,
        entity_title:
          (row?.name || "Misafir") +
          (row?.villa_id ? " · " + row.villa_id : ""),
        before_data: { status: oldStatus },
        after_data: { status },
      }).catch(() => {});
    }

    /* ===============================================================
       🔥 STATUS CHANGE MAIL TRIGGER (NON-BLOCKING)
       ===============================================================
       - Sadece oldStatus !== newStatus ise gönder
       - confirmed → approved mail
       - rejected  → cancelled mail
       - fire-and-forget; hata rezervasyon işlemini bozmaz
       =============================================================== */
    if (oldStatus !== status) {
      try {
        if (status === "confirmed") {
          adminFetch("/api/mail/reservation-approved", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reservationId: id }),
            keepalive: true,
          }).catch((mailErr) => {
            console.warn(
              "[mail.reservation_approved] non-blocking error:",
              mailErr?.message || mailErr
            );
          });
        } else if (status === "rejected" || status === "cancelled") {
          adminFetch("/api/mail/reservation-cancelled", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reservationId: id }),
            keepalive: true,
          }).catch((mailErr) => {
            console.warn(
              "[mail.reservation_cancelled] non-blocking error:",
              mailErr?.message || mailErr
            );
          });
        }
      } catch (mailErr: any) {
        console.warn(
          "[mail.status-change] dispatch failed:",
          mailErr?.message || mailErr
        );
      }
    }

    fetchReservations();
  };

  const deleteReservation = async (id: string) => {
    const proceed = await confirm({
      title: "Rezervasyon silinsin mi?",
      description:
        "Seçili rezervasyon kaydı kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    /* 🛡️ FAZ 2 frontend purge — adminFetch DELETE /api/admin/reservations.
       Davranış BYTE-IDENTICAL: aynı `.delete().eq("id", id)` server'da
       service-role ile. Eski client davranışı (audit yok) aynen korunur. */
    let delErrMsg: string | null = null;
    try {
      const res = await adminFetch(
        `/api/admin/reservations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        delErrMsg = json.error || `HTTP ${res.status}`;
      }
    } catch (err) {
      delErrMsg = err instanceof Error ? err.message : "İstek başarısız";
    }
    if (delErrMsg) {
      console.error(delErrMsg);
      toast.error("Rezervasyon silinemedi", {
        id: `delete-${id}`,
        description: delErrMsg,
      });
      return;
    }
    fetchReservations();
  };

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    /* 🛡️ Europe/Istanbul explicit — start_date / end_date DATE
       strings. nightsBetween/diff math timezone-independent (geçmiş
       davranış aynen korunur). */
    const startStr = s.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Istanbul",
    });
    const endStr = e.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      timeZone: "Europe/Istanbul",
    });
    const nights = Math.ceil(
      (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    );
    return { label: `${startStr} → ${endStr}`, nights };
  };

  /* ---------------------------------------------
     🔥 CURRENCY SYMBOL
  ---------------------------------------------- */
  const currencySymbol = (currency?: string) => {
    switch (currency) {
      case "USD":
        return "$";
      case "EUR":
        return "€";
      case "GBP":
        return "£";
      default:
        return "₺";
    }
  };

  /* ---------------------------------------------
     🔥 UI-ONLY FILTER (business logic'e dokunmaz)
     name / phone / phone2 / villa.title üzerinden client-side
     filtering. Asıl liste DB'den geldiği gibi gelir.
  ---------------------------------------------- */
  const filtered = !search.trim()
    ? data
    : data.filter((r: any) => {
        const q = normalizeSearchText(search);
        return (
          normalizeSearchText(r.name || "").includes(q) ||
          normalizeSearchText(r.phone || "").includes(q) ||
          normalizeSearchText(r.phone2 || "").includes(q) ||
          normalizeSearchText(r.villa?.title || "").includes(q)
        );
      });

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Rezervasyon</p>
          <h1 className="admin-page-header__title">Rezervasyonlar</h1>
          <p className="admin-page-header__sub">
            Tüm gelen rezervasyon talepleri burada listelenir. Hızlıca onayla,
            reddet veya detaylarını incele.
          </p>
        </div>

        <div className="admin-page-header__actions">
          <button
            onClick={() => router.push("/maki-admin/reservations/ekle")}
            className="admin-btn-primary"
          >
            <Plus size={15} />
            Rezervasyon Ekle
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="İsim, telefon veya mülk ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2">
          {filtered.length} kayıt
        </span>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted)]">
          Yükleniyor…
        </div>
      )}

      {/* EMPTY */}
      {!loading && data.length === 0 && (
        <div className="admin-card-flat p-12 text-center">
          <p className="font-display text-[22px] text-[var(--admin-text)] tracking-[-0.015em]">
            Henüz rezervasyon yok
          </p>
          <p className="text-[var(--admin-muted-2)] text-sm mt-2">
            İlk talep geldiğinde burada görünecek.
          </p>
        </div>
      )}

      {/* LIST — CRM table feel */}
      {!loading && data.length > 0 && (
        <div className="admin-table">
          {filtered.map((r: any) => {
            const dateInfo =
              r.start_date && r.end_date
                ? formatDateRange(r.start_date, r.end_date)
                : null;

            /* ---------------------------------------------
               🔥 SNAPSHOT FIYAT MANTIĞI
               - original_currency !== "TRY" ise:
                   ana fiyat = original_price + symbol
                   alt = TRY karşılığı (total_price_try)
               - aksi halde:
                   sadece ₺total_price_try
            ---------------------------------------------- */
            const originalCurrency = r.original_currency || "TRY";
            const isForeign =
              originalCurrency !== "TRY" &&
              Number(r.original_price) > 0;

            const totalTRY =
              Number(r.total_price_try) ||
              Number(r.total_price) ||
              0;

            const paid = Number(r.paid_amount) || 0;

            // 🔥 PAYMENT STATUS — derive
            const paymentStatus =
              paid <= 0
                ? "unpaid"
                : paid < totalTRY
                  ? "partial"
                  : "paid";

            /* 🛡️ STATUS GÖRSEL VURGU — yalnız liste kartı arka plan/divider.
               confirmed→yeşil, pending→sarı, rejected/cancelled→kırmızı.
               admin-row yalnız border-bottom kullandığı için full border
               yerine `border-b-*` recolor (yükseklik/grid değişmez); bg `!`
               ile override + hover deepen. İçerik/aksiyon/status mantığı AYNEN. */
            const statusTone =
              r.status === "confirmed"
                ? "!bg-green-50 hover:!bg-green-100 !border-b-green-200"
                : r.status === "pending"
                  ? "!bg-amber-50 hover:!bg-amber-100 !border-b-amber-200"
                  : r.status === "rejected" || r.status === "cancelled"
                    ? "!bg-red-50 hover:!bg-red-100 !border-b-red-200"
                    : "";

            /* 🖼️ Villa kapak thumbnail — yoksa görsel alanı sessizce
               fallback ikonuna düşer, kart genişliği/hizası değişmez. */
            const villaCoverUrl = resolveReservationVillaCoverUrl(r.villa);

            return (
              <div
                key={r.id}
                onClick={() =>
                  router.push(`/maki-admin/reservations/${r.id}`)
                }
                className={`admin-row cursor-pointer ${statusTone}`}
              >
                {/* AVATAR */}
                <div className="w-10 h-10 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center text-[var(--admin-muted)] font-medium text-[14px] shrink-0">
                  {(r.name || "?").slice(0, 1).toUpperCase()}
                </div>

                {/* VILLA KAPAK GÖRSELİ — küçük thumbnail; görsel yoksa
                    aynı boyutta nötr fallback (kart hizası bozulmaz). */}
                <div className="hidden sm:flex w-11 h-11 rounded-lg bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] items-center justify-center overflow-hidden shrink-0">
                  {villaCoverUrl ? (
                    <img
                      src={villaCoverUrl}
                      alt={r.villa?.title || "Mülk"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageOff
                      size={16}
                      className="text-[var(--admin-muted-2)]"
                    />
                  )}
                </div>

                {/* GUEST + VILLA + RESERVATION CODE */}
                <div className="min-w-0 flex-[1.4]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[14px] font-semibold text-[var(--admin-text)] truncate leading-tight">
                      {r.name || "İsimsiz"}
                    </p>
                    {normalizeReservationNo(r.reservation_no) && (
                      <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold tracking-[0.04em] tabular-nums bg-[var(--admin-bg-soft)] text-[var(--admin-muted)] border border-[var(--admin-border)]">
                        {normalizeReservationNo(r.reservation_no)}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--admin-muted-2)] truncate mt-0.5 flex items-center gap-1.5">
                    <Phone size={11} />
                    {r.phone || "-"}
                  </p>
                  {/* 🛡️ Migration 094 — ikinci telefon. Eski kayıtlarda
                      null → satır HİÇ basılmaz (liste yüksekliği değişmez). */}
                  {r.phone2 && (
                    <p className="text-[12px] text-[var(--admin-muted-2)] truncate mt-0.5 flex items-center gap-1.5">
                      <Phone size={11} />
                      {r.phone2}
                    </p>
                  )}
                  <p className="text-[11.5px] text-[var(--admin-muted)] truncate mt-0.5">
                    {r.villa?.title || "Mülk yok"}
                  </p>
                </div>

                {/* DATE */}
                <div className="hidden md:block min-w-0 flex-1">
                  {dateInfo ? (
                    <>
                      <p className="text-[13px] text-[var(--admin-text)] flex items-center gap-1.5 truncate">
                        <Calendar
                          size={12}
                          className="text-[var(--admin-muted-2)]"
                        />
                        {dateInfo.label}
                      </p>
                      <p className="text-[11.5px] text-[var(--admin-muted-2)] mt-0.5">
                        {dateInfo.nights} gece
                      </p>
                    </>
                  ) : (
                    <span className="text-[12px] text-[var(--admin-muted-2)]">
                      —
                    </span>
                  )}
                </div>

                {/* BADGES */}
                <div className="hidden lg:flex flex-col gap-1.5 shrink-0">
                  <StatusBadge status={r.status} />
                  <PaymentBadge status={paymentStatus} />
                  <PaymentPreferenceBadge value={r.payment_preference} />
                  {/* 🛡️ Depozito satırı liste kartından kaldırıldı (yalnız
                      görsel; veri/hesap/detay ekranı dokunulmadı). */}
                </div>

                {/* PRICE */}
                <div className="text-right shrink-0 min-w-[140px]">
                  {isForeign ? (
                    <>
                      <p className="font-display text-[18px] text-[var(--admin-text)] tracking-[-0.015em] tabular-nums">
                        {currencySymbol(originalCurrency)}
                        {new Intl.NumberFormat("tr-TR", {
                          maximumFractionDigits: 0,
                        }).format(Number(r.original_price) || 0)}
                      </p>
                      <p className="text-[10.5px] text-[var(--admin-muted-2)] tracking-[0.04em] uppercase mt-0.5">
                        TRY ·{" "}
                        {new Intl.NumberFormat("tr-TR", {
                          maximumFractionDigits: 0,
                        }).format(totalTRY)}
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-[18px] text-[var(--admin-text)] tracking-[-0.015em] tabular-nums">
                      ₺
                      {new Intl.NumberFormat("tr-TR", {
                        maximumFractionDigits: 0,
                      }).format(totalTRY)}
                    </p>
                  )}

                  {/* MOBILE BADGES */}
                  <div className="lg:hidden flex flex-wrap gap-1.5 justify-end pt-1.5">
                    <StatusBadge status={r.status} />
                    <PaymentBadge status={paymentStatus} />
                    <PaymentPreferenceBadge value={r.payment_preference} />
                  </div>
                </div>

                {/* ACTIONS */}
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.status === "pending" && (
                    <>
                      <button
                        onClick={() => updateStatus(r.id, "confirmed")}
                        className="admin-icon-btn"
                        aria-label="Onayla"
                        title="Onayla"
                      >
                        <Check
                          size={14}
                          className="text-emerald-600"
                        />
                      </button>
                      <button
                        onClick={() => updateStatus(r.id, "rejected")}
                        className="admin-icon-btn"
                        aria-label="Reddet"
                        title="Reddet"
                      >
                        <X size={14} className="text-rose-600" />
                      </button>
                    </>
                  )}

                  {/* 🔥 VOUCHER PDF — sadece confirmed rezervasyonlar */}
                  {r.status === "confirmed" && (
                    <>
                      <button
                        onClick={() => openVoucherPdf(r.id)}
                        className="admin-icon-btn"
                        aria-label="Rezervasyon Belgesi PDF"
                        title="Rezervasyon Belgesi PDF (yeni sekmede açılır, tarayıcıdan PDF olarak kaydet)"
                      >
                        <Printer
                          size={14}
                          className="text-[var(--color-stone-700)]"
                        />
                      </button>
                      <button
                        onClick={() => sendVoucherMail(r.id)}
                        disabled={voucherSendingId === r.id}
                        className="admin-icon-btn disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Rezervasyon Belgesi'ni Gönder"
                        title="Rezervasyon Belgesi'ni müşteriye mail olarak gönder"
                      >
                        <Send
                          size={14}
                          className="text-[var(--color-champagne-700)]"
                        />
                      </button>
                    </>
                  )}

                  {/* 🔗 REZERVASYON BİLGİLERİNİ PAYLAŞ — oluştur + kopyala.
                      Mevcut aksiyon ikonlarıyla aynı boyut/stil (admin-icon-btn). */}
                  <button
                    onClick={() => shareReservation(r.id)}
                    disabled={shareGeneratingId === r.id}
                    className="admin-icon-btn disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Rezervasyon Bilgilerini Paylaş"
                    title="Rezervasyon Bilgilerini Paylaş"
                  >
                    <Link2
                      size={14}
                      className="text-[var(--brand-coral)]"
                    />
                  </button>

                  <button
                    onClick={() => deleteReservation(r.id)}
                    className="admin-icon-btn"
                    aria-label="Sil"
                    title="Sil"
                  >
                    <Trash2
                      size={14}
                      className="text-[var(--admin-muted)]"
                    />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Bekliyor", cls: "admin-badge--pending" },
    confirmed: { label: "Onaylandı", cls: "admin-badge--confirmed" },
    rejected: { label: "Reddedildi", cls: "admin-badge--rejected" },
  };
  const conf = map[status] || {
    label: status || "-",
    cls: "admin-badge--neutral",
  };
  return (
    <span className={`admin-badge ${conf.cls}`}>
      <span className="admin-badge__dot" />
      {conf.label}
    </span>
  );
}

/* ---------------------------------------------
   🔥 PAYMENT BADGE
   - unpaid:  paid <= 0
   - partial: 0 < paid < total_price_try
   - paid:    paid >= total_price_try
---------------------------------------------- */
function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    unpaid: { label: "Ödenmedi", cls: "admin-badge--unpaid" },
    partial: { label: "Kısmi Ödeme", cls: "admin-badge--partial" },
    paid: { label: "Ödendi", cls: "admin-badge--paid" },
  };
  const conf = map[status] || map.unpaid;
  return (
    <span className={`admin-badge ${conf.cls}`}>
      <span className="admin-badge__dot" />
      {conf.label}
    </span>
  );
}

/* ---------------------------------------------
   🔥 PAYMENT PREFERENCE BADGE
   - prepayment   → "Ön Ödeme"
   - full_payment → "Full Payment"
   Eski rezervasyonlar (NULL) helper tarafından
   "prepayment" gibi normalize edilir → her zaman label görür.
---------------------------------------------- */
function PaymentPreferenceBadge({ value }: { value: unknown }) {
  const v = normalizePaymentPreference(value);
  const label = paymentPreferenceBadgeLabel(v);
  const cls =
    v === "full_payment"
      ? "admin-badge--paid"
      : "admin-badge--neutral";
  return (
    <span className={`admin-badge ${cls}`}>
      <span className="admin-badge__dot" />
      {label}
    </span>
  );
}
