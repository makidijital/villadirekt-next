"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Mail,
  Phone,
  Clock,
  Archive,
  ArchiveRestore,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  Trash2,
} from "lucide-react";

import {
  listMessagesAction as listMessages,
  markAsReadAction as markAsRead,
  archiveMessageAction as archiveMessage,
  deleteMessageAction as deleteMessage,
} from "./messages.action";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import type { ContactMessageRow } from "@/types/database";
import { formatDateTimeTr } from "@/lib/date-format";

/* ===============================================================
   🛡️ ADMIN > MESAJLAR — split-pane inbox (migration 015)
   ===============================================================
   Desktop: 12-col grid (left list 5, right detail 7).
   Mobile : list veya detail (selected'a göre stack).
   Actions: unread toggle, archive/restore, refresh.

   RLS authenticated SELECT/UPDATE/DELETE policy'leri sayesinde
   admin tarafından kullanılır (native auth ile login'li).
   Cache helper YOK — admin local state-driven refresh.
   =============================================================== */

type Filter = "active" | "archived";

export default function MessagesPage() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");

  async function load() {
    setLoading(true);
    const data = await listMessages({
      includeArchived: filter === "archived",
    });
    /* archived filter active'sa archived olanları gizle; archived
       mode'da SADECE archived'ları göster. */
    const filtered =
      filter === "archived"
        ? data.filter((m) => m.archived_at != null)
        : data.filter((m) => m.archived_at == null);
    setMessages(filtered);
    setLoading(false);
    /* Selected hâlâ listede mi? Değilse selection temizle. */
    setSelectedId((prev) =>
      prev && filtered.some((m) => m.id === prev) ? prev : null
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  const unreadCount = useMemo(
    () => messages.filter((m) => !m.is_read && !m.archived_at).length,
    [messages]
  );

  async function handleSelect(m: ContactMessageRow) {
    setSelectedId(m.id);
    /* Auto-mark-read: ilk açışta okundu işaretle (optimistic) */
    if (!m.is_read) {
      setMessages((prev) =>
        prev.map((p) => (p.id === m.id ? { ...p, is_read: true } : p))
      );
      const ok = await markAsRead(m.id, true);
      if (!ok) {
        /* revert */
        setMessages((prev) =>
          prev.map((p) =>
            p.id === m.id ? { ...p, is_read: false } : p
          )
        );
      }
    }
  }

  async function handleToggleRead(m: ContactMessageRow) {
    const next = !m.is_read;
    setMessages((prev) =>
      prev.map((p) => (p.id === m.id ? { ...p, is_read: next } : p))
    );
    const ok = await markAsRead(m.id, next);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `msg-read-${m.id}` });
      setMessages((prev) =>
        prev.map((p) =>
          p.id === m.id ? { ...p, is_read: m.is_read } : p
        )
      );
    }
  }

  async function handleArchive(m: ContactMessageRow, archived: boolean) {
    const ok = await archiveMessage(m.id, archived);
    if (!ok) {
      toast.error(
        archived ? "Arşivlenemedi" : "Geri alınamadı",
        { id: `msg-archive-${m.id}` }
      );
      return;
    }
    toast.success(
      archived ? "Arşivlendi" : "Aktife alındı",
      { id: `msg-archive-${m.id}` }
    );
    await load();
  }

  async function handleDelete(m: ContactMessageRow) {
    const ok = await confirm({
      title: "Mesaj silinsin mi?",
      description:
        "Bu mesaj kalıcı olarak kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;

    const deleted = await deleteMessage(m.id);
    if (!deleted) {
      toast.error("Silinemedi", { id: `msg-delete-${m.id}` });
      return;
    }
    toast.success("Mesaj silindi", { id: `msg-delete-${m.id}` });
    await load();
  }

  return (
    <div className="space-y-6 w-full">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="eyebrow">İçerik</p>
          <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
            Mesajlar
          </h1>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            /iletisim formundan gelen mesajlar — okundu, arşivle ve yanıtla.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && filter === "active" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-champagne-500)]/15 text-[var(--color-champagne-700)] text-[12px] font-medium">
              {unreadCount} okunmamış
            </span>
          )}
          <div className="inline-flex items-center bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] rounded-full p-0.5">
            <FilterChip
              active={filter === "active"}
              onClick={() => setFilter("active")}
            >
              Aktif
            </FilterChip>
            <FilterChip
              active={filter === "archived"}
              onClick={() => setFilter("archived")}
            >
              Arşiv
            </FilterChip>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-700)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
            title="Yenile"
          >
            <RefreshCw size={13} />
            Yenile
          </button>
        </div>
      </div>

      {/* SPLIT PANE */}
      {loading ? (
        <div className="card-premium p-10 text-center text-sm text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : messages.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Inbox size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            {filter === "archived" ? "Arşivde mesaj yok" : "Mesaj kutusu boş"}
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-md mx-auto">
            {filter === "archived"
              ? "Şu an arşivlenmiş mesaj bulunmuyor."
              : "Yeni mesajlar geldikçe burada listelenecek."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          {/* LIST PANE */}
          <div
            className={
              "lg:col-span-5 " + (selected ? "hidden lg:block" : "block")
            }
          >
            <ul className="space-y-2.5">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(m)}
                    className={
                      "w-full text-left card-premium p-4 transition border " +
                      (selectedId === m.id
                        ? "border-[var(--color-champagne-500)] bg-[var(--color-sand-50)]"
                        : "border-transparent hover:bg-[var(--color-sand-50)]/70")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {!m.is_read && (
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-full bg-[var(--color-champagne-500)] shrink-0"
                          />
                        )}
                        <p
                          className={
                            "truncate " +
                            (m.is_read
                              ? "font-medium text-[var(--color-stone-700)]"
                              : "font-semibold text-[var(--color-stone-900)]")
                          }
                        >
                          {m.full_name}
                        </p>
                      </div>
                      <span className="text-[11px] text-[var(--color-stone-400)] tabular-nums shrink-0">
                        {formatShortDate(m.created_at)}
                      </span>
                    </div>
                    <p className="text-[13.5px] text-[var(--color-stone-500)] mt-1.5 line-clamp-2 leading-[1.5]">
                      {m.message}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* DETAIL PANE */}
          <div
            className={
              "lg:col-span-7 " + (selected ? "block" : "hidden lg:block")
            }
          >
            {selected ? (
              <div className="card-premium p-6 md:p-8">
                {/* Mobile back */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="lg:hidden text-[12px] text-[var(--color-stone-500)] mb-4 inline-flex items-center gap-1"
                >
                  ← Listeye dön
                </button>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
                  <div className="min-w-0">
                    <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                      Mesaj
                    </p>
                    <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] mt-1.5 tracking-[-0.02em]">
                      {selected.full_name}
                    </h2>
                    <p className="text-[12px] text-[var(--color-stone-500)] mt-2 inline-flex items-center gap-1.5">
                      <Clock size={11} />
                      {formatDateTimeTr(selected.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleRead(selected)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)] transition"
                    >
                      {selected.is_read ? (
                        <>
                          <EyeOff size={12} /> Okunmadı işaretle
                        </>
                      ) : (
                        <>
                          <Eye size={12} /> Okundu işaretle
                        </>
                      )}
                    </button>
                    {selected.archived_at ? (
                      <button
                        onClick={() => handleArchive(selected, false)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)] transition"
                      >
                        <ArchiveRestore size={12} /> Aktife al
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchive(selected, true)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)] transition"
                      >
                        <Archive size={12} /> Arşivle
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(selected)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-red-600 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 transition"
                    >
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                </div>

                {/* Contact info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {selected.phone && (
                    <a
                      href={`tel:${selected.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] hover:border-[var(--color-champagne-500)] transition group"
                    >
                      <Phone
                        size={14}
                        className="text-[var(--color-champagne-700)] shrink-0"
                      />
                      <span className="text-[13.5px] text-[var(--color-stone-900)] truncate flex-1">
                        {selected.phone}
                      </span>
                      <ExternalLink
                        size={12}
                        className="text-[var(--color-stone-400)] group-hover:text-[var(--color-stone-700)]"
                      />
                    </a>
                  )}
                  {selected.email && (
                    <a
                      href={`mailto:${selected.email}`}
                      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--color-sand-50)] border border-[var(--color-stone-100)] hover:border-[var(--color-champagne-500)] transition group"
                    >
                      <Mail
                        size={14}
                        className="text-[var(--color-champagne-700)] shrink-0"
                      />
                      <span className="text-[13.5px] text-[var(--color-stone-900)] truncate flex-1">
                        {selected.email}
                      </span>
                      <ExternalLink
                        size={12}
                        className="text-[var(--color-stone-400)] group-hover:text-[var(--color-stone-700)]"
                      />
                    </a>
                  )}
                </div>

                {/* Source page */}
                {selected.source_page && (
                  <p className="text-[11px] tracking-[0.16em] uppercase font-medium text-[var(--color-stone-400)] mb-4">
                    Geldiği sayfa:{" "}
                    <span className="font-mono normal-case tracking-normal text-[var(--color-stone-500)]">
                      {selected.source_page}
                    </span>
                  </p>
                )}

                {/* Message body */}
                <div className="border-t border-[var(--color-stone-100)] pt-6">
                  <p className="text-[11px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] mb-3">
                    Mesaj
                  </p>
                  <p className="text-[15px] leading-[1.75] text-[var(--color-stone-800)] whitespace-pre-line">
                    {selected.message}
                  </p>
                </div>
              </div>
            ) : (
              <div className="card-premium p-10 text-center text-sm text-[var(--color-stone-500)] hidden lg:block">
                Sol listeden bir mesaj seçin.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "text-[12px] font-medium px-3 py-1.5 rounded-full transition " +
        (active
          ? "bg-white text-[var(--color-stone-900)] shadow-sm"
          : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-700)]")
      }
    >
      {children}
    </button>
  );
}

/* Mevcut date-format helper'ı kullan; "x dk önce" gibi relatif
   gösterim yerine kısa locale-aware tarih. */
function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return d.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}
