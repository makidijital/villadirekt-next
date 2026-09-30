"use client";

/* ===============================================================
   🔥 MÜLK SAHİPLERİ — admin CRUD (minimal)
   ===============================================================
   Liste (Ad Soyad / Telefon / Mail / IBAN / Villa Sayısı / İşlemler)
   + create/edit modal + sil. Mevcut admin CRUD pattern (rules/page +
   ZIP modal) reuse; yeni design YOK. useNotify/useConfirm + admin
   class'ları. CRM/ödeme/hakediş/not YOK.
   =============================================================== */

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, X, Save, Users2 } from "lucide-react";

import {
  getPropertyOwnersAction as getPropertyOwners,
  addPropertyOwnerAction as addPropertyOwner,
  updatePropertyOwnerAction as updatePropertyOwner,
  deletePropertyOwnerAction as deletePropertyOwner,
} from "@/app/services/property-owner.action";
import type {
  PropertyOwnerWithCount,
  PropertyOwnerInput,
} from "@/app/services/property-owner.service";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

const EMPTY: PropertyOwnerInput = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  iban: "",
};

export default function PropertyOwnersPage() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [owners, setOwners] = useState<PropertyOwnerWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PropertyOwnerInput>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getPropertyOwners();
    setOwners(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (o: PropertyOwnerWithCount) => {
    setEditId(o.id);
    setForm({
      first_name: o.first_name ?? "",
      last_name: o.last_name ?? "",
      phone: o.phone ?? "",
      email: o.email ?? "",
      iban: o.iban ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditId(null);
    setForm(EMPTY);
  };

  const handleSave = async () => {
    if (saving) return;
    /* Hafif validasyon: en az ad veya soyad. */
    if (!form.first_name?.trim() && !form.last_name?.trim()) {
      toast.error("Ad veya soyad gerekli", { id: "owner-save" });
      return;
    }
    setSaving(true);
    const payload: PropertyOwnerInput = {
      first_name: form.first_name?.trim() || null,
      last_name: form.last_name?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      iban: form.iban?.trim() || null,
    };
    const ok = editId
      ? await updatePropertyOwner(editId, payload)
      : await addPropertyOwner(payload);
    setSaving(false);
    if (!ok) {
      toast.error(editId ? "Güncellenemedi" : "Kaydedilemedi", {
        id: "owner-save",
      });
      return;
    }
    toast.success(editId ? "Güncellendi" : "Mülk sahibi eklendi", {
      id: "owner-save",
    });
    closeModal();
    await load();
  };

  const handleDelete = async (o: PropertyOwnerWithCount) => {
    const proceed = await confirm({
      title: "Mülk sahibi silinsin mi?",
      description:
        o.villa_count > 0
          ? `${o.villa_count} mülkün bağlantısı kaldırılır (mülkler silinmez). Bu işlem geri alınamaz.`
          : "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
    });
    if (!proceed) return;
    const ok = await deletePropertyOwner(o.id);
    if (!ok) {
      toast.error("Silinemedi", { id: `owner-del-${o.id}` });
      return;
    }
    toast.success("Silindi", { id: `owner-del-${o.id}` });
    await load();
  };

  const fullName = (o: PropertyOwnerWithCount) =>
    `${o.first_name ?? ""} ${o.last_name ?? ""}`.trim() || "—";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Users2 size={18} className="text-[var(--admin-muted,#6b7280)]" />
          <h1 className="font-display text-[18px] text-[var(--admin-text,#111827)]">
            Mülk Sahipleri
          </h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="admin-btn-primary"
        >
          <Plus size={14} />
          Yeni Mülk Sahibi
        </button>
      </div>

      {/* Liste */}
      <div className="rounded-xl border border-[var(--admin-border,#e5e7eb)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--admin-bg-soft,#f9fafb)] text-[var(--admin-muted,#6b7280)]">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Ad Soyad</th>
                <th className="text-left font-medium px-4 py-2.5">Telefon</th>
                <th className="text-left font-medium px-4 py-2.5">Mail</th>
                <th className="text-left font-medium px-4 py-2.5">IBAN</th>
                <th className="text-left font-medium px-4 py-2.5">Mülk</th>
                <th className="text-right font-medium px-4 py-2.5">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--admin-muted,#6b7280)]">
                    Yükleniyor…
                  </td>
                </tr>
              ) : owners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--admin-muted,#6b7280)]">
                    Henüz mülk sahibi yok.
                  </td>
                </tr>
              ) : (
                owners.map((o) => (
                  <tr
                    key={o.id}
                    className="border-t border-[var(--admin-border,#e5e7eb)]"
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--admin-text,#111827)]">
                      {fullName(o)}
                    </td>
                    <td className="px-4 py-2.5">{o.phone || "—"}</td>
                    <td className="px-4 py-2.5">{o.email || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">
                      {o.iban || "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{o.villa_count}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          className="admin-btn-ghost"
                          aria-label="Düzenle"
                        >
                          <Pencil size={13} />
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(o)}
                          className="admin-btn-ghost hover:!text-rose-500"
                          aria-label="Sil"
                        >
                          <Trash2 size={13} />
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editId ? "Mülk sahibi düzenle" : "Yeni mülk sahibi"}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Kapat"
            onClick={closeModal}
            className="absolute inset-0 bg-[#020617]/55 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl bg-[var(--admin-card,#fff)] shadow-2xl border border-[var(--admin-border,#e5e7eb)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--admin-border,#e5e7eb)]">
              <h3 className="font-semibold text-[15px] text-[var(--admin-text,#111827)]">
                {editId ? "Mülk Sahibi Düzenle" : "Yeni Mülk Sahibi"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="admin-icon-btn"
                aria-label="Kapat"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <Field
                label="Ad"
                value={form.first_name ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, first_name: v }))}
              />
              <Field
                label="Soyad"
                value={form.last_name ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, last_name: v }))}
              />
              <Field
                label="Telefon"
                value={form.phone ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
              <Field
                label="Mail"
                type="email"
                value={form.email ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              />
              <Field
                label="IBAN"
                value={form.iban ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, iban: v }))}
              />
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--admin-border,#e5e7eb)]">
              <button
                type="button"
                onClick={closeModal}
                className="admin-btn-ghost"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="admin-btn-primary disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-[var(--admin-text,#111827)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--admin-border,#e5e7eb)] px-3 py-2 text-[13px] bg-white text-[var(--admin-text,#111827)] focus:outline-none focus:border-[var(--admin-accent,#a78b5f)]"
      />
    </label>
  );
}
