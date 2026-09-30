"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Send, Check, Star } from "lucide-react";

/* 🛡️ Migration WU-B1 — client boundary: runtime western-union-account.service
   import'u yerine server action. Böylece service (ve ileride native server-only
   repo) client bundle'a sızmaz. Call-site'lar alias ile değişmez. */
import {
  getWesternUnionAccountsAction as getWesternUnionAccounts,
  createWesternUnionAccountAction as createWesternUnionAccount,
  updateWesternUnionAccountAction as updateWesternUnionAccount,
  deleteWesternUnionAccountAction as deleteWesternUnionAccount,
  setActiveWesternUnionAccountAction as setActiveWesternUnionAccount,
} from "@/app/services/western-union-account.action";
import type { WesternUnionAccountInput } from "@/app/services/western-union-account.service";
import type { WesternUnionAccount } from "@/lib/western-union-account.helper";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

import { SettingsSection, TextField, FieldShell } from "../../_components/SettingsField";

/* ===============================================================
   🛡️ Western Union Hesapları — settings/odeme alt section'ı
   ===============================================================
   payment_accounts CRUD pattern'inin WU karşılığı; AYRI tablo
   (western_union_accounts) + ayrı service. Banka hesabı UI'ına
   ve EFT akışına SIFIR temas — sadece bu card eklendi.

   single-active: aktif kayıt tek; mail akışı (western-union-payment)
   aktif kaydı kullanır.
   =============================================================== */

type Draft = WesternUnionAccountInput & { id?: string };

const EMPTY_DRAFT: Draft = {
  recipient_name: "",
  country: "",
  city: "",
  phone: "",
  instructions: "",
  is_active: false,
};

export default function WesternUnionAccountsCard() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState<WesternUnionAccount[]>([]);
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT);
  const [edits, setEdits] = useState<
    Record<string, Partial<WesternUnionAccountInput>>
  >({});

  async function refresh() {
    setAccounts(await getWesternUnionAccounts());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate() {
    if (!newDraft.recipient_name.trim()) {
      toast.error("Alıcı adı gerekli", { id: "wu-create" });
      return;
    }
    const res = await createWesternUnionAccount(newDraft);
    if (!res.ok) {
      toast.error("Eklenemedi", { id: "wu-create", description: res.error });
      return;
    }
    setNewDraft(EMPTY_DRAFT);
    await refresh();
    toast.success("Western Union kaydı eklendi", { id: "wu-create" });
  }

  function patch(id: string, p: Partial<WesternUnionAccountInput>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  async function handleSave(acc: WesternUnionAccount) {
    const draft = edits[acc.id] || {};
    const res = await updateWesternUnionAccount(acc.id, draft);
    if (!res.ok) {
      toast.error("Kaydedilemedi", {
        id: `wu-save-${acc.id}`,
        description: res.error,
      });
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      delete next[acc.id];
      return next;
    });
    await refresh();
    toast.success("Kaydedildi", { id: `wu-save-${acc.id}` });
  }

  async function handleDelete(acc: WesternUnionAccount) {
    const proceed = await confirm({
      title: "Western Union kaydı silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const res = await deleteWesternUnionAccount(acc.id);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `wu-del-${acc.id}`,
        description: res.error,
      });
      return;
    }
    await refresh();
    toast.success("Silindi", { id: `wu-del-${acc.id}` });
  }

  async function handleSetActive(acc: WesternUnionAccount) {
    const res = await setActiveWesternUnionAccount(acc.id);
    if (!res.ok) {
      toast.error("Aktif yapılamadı", {
        id: `wu-active-${acc.id}`,
        description: res.error,
      });
      return;
    }
    await refresh();
    toast.success("Aktif kayıt güncellendi", { id: `wu-active-${acc.id}` });
  }

  const get = <K extends keyof WesternUnionAccountInput>(
    acc: WesternUnionAccount,
    key: K
  ): string => {
    const e = edits[acc.id]?.[key];
    if (e !== undefined && e !== null) return String(e);
    const v = acc[key as keyof WesternUnionAccount];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <div className="space-y-6">
      {/* Görsel ayraç — banka hesaplarından net ayrım */}
      <div className="flex items-center gap-3 pt-2">
        <Send size={16} className="text-[var(--color-champagne-700)]" />
        <span className="text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-stone-400)]">
          Western Union
        </span>
        <span className="flex-1 h-px bg-[var(--color-stone-100)]" />
      </div>

      {/* CREATE */}
      <SettingsSection
        title="Yeni Western Union Kaydı"
        description="Western Union ile ödeme seçildiğinde müşteriye gönderilecek alıcı bilgileri. Aktif kayıt tek olabilir."
        footer={
          <button onClick={handleCreate} className="btn-primary">
            <Plus size={15} />
            Ekle
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <TextField
            label="Alıcı Adı"
            value={newDraft.recipient_name}
            onChange={(v) => setNewDraft((d) => ({ ...d, recipient_name: v }))}
            placeholder="Örn: Ahmet Yılmaz"
          />
          <TextField
            label="Ülke"
            value={newDraft.country ?? ""}
            onChange={(v) => setNewDraft((d) => ({ ...d, country: v }))}
            placeholder="Örn: Türkiye"
          />
          <TextField
            label="Şehir"
            value={newDraft.city ?? ""}
            onChange={(v) => setNewDraft((d) => ({ ...d, city: v }))}
            placeholder="Örn: İstanbul"
          />
          <TextField
            label="Telefon"
            type="tel"
            value={newDraft.phone ?? ""}
            onChange={(v) => setNewDraft((d) => ({ ...d, phone: v }))}
            placeholder="Örn: +90 5xx xxx xx xx"
          />
        </div>
        <FieldShell label="Talimat / Açıklama">
          <textarea
            value={newDraft.instructions ?? ""}
            onChange={(e) =>
              setNewDraft((d) => ({ ...d, instructions: e.target.value }))
            }
            rows={3}
            className="input"
            placeholder="Transfer sonrası MTCN kodunu bizimle paylaşınız vb."
          />
        </FieldShell>
        <label className="flex items-center gap-2 text-sm text-[var(--color-stone-700)] cursor-pointer">
          <input
            type="checkbox"
            checked={!!newDraft.is_active}
            onChange={(e) =>
              setNewDraft((d) => ({ ...d, is_active: e.target.checked }))
            }
          />
          Bu kaydı aktif yap
        </label>
      </SettingsSection>

      {/* LIST */}
      {accounts.length === 0 ? (
        <div className="card-premium p-8 text-center text-sm text-[var(--color-stone-500)]">
          Henüz Western Union kaydı yok.
        </div>
      ) : (
        <div className="space-y-5">
          {accounts.map((acc) => (
            <SettingsSection
              key={acc.id}
              title={acc.recipient_name || "—"}
              footer={
                <div className="flex flex-wrap items-center gap-2">
                  {acc.is_active ? (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700 px-3 py-1.5 rounded-lg bg-emerald-50">
                      <Check size={13} /> Aktif
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetActive(acc)}
                      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                    >
                      <Star size={13} /> Aktif Yap
                    </button>
                  )}
                  <button
                    onClick={() => handleSave(acc)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Save size={13} /> Kaydet
                  </button>
                  <button
                    onClick={() => handleDelete(acc)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 size={13} /> Sil
                  </button>
                </div>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <TextField
                  label="Alıcı Adı"
                  value={get(acc, "recipient_name")}
                  onChange={(v) => patch(acc.id, { recipient_name: v })}
                />
                <TextField
                  label="Ülke"
                  value={get(acc, "country")}
                  onChange={(v) => patch(acc.id, { country: v })}
                />
                <TextField
                  label="Şehir"
                  value={get(acc, "city")}
                  onChange={(v) => patch(acc.id, { city: v })}
                />
                <TextField
                  label="Telefon"
                  type="tel"
                  value={get(acc, "phone")}
                  onChange={(v) => patch(acc.id, { phone: v })}
                />
              </div>
              <FieldShell label="Talimat / Açıklama">
                <textarea
                  value={get(acc, "instructions")}
                  onChange={(e) => patch(acc.id, { instructions: e.target.value })}
                  rows={3}
                  className="input"
                />
              </FieldShell>
            </SettingsSection>
          ))}
        </div>
      )}
    </div>
  );
}
