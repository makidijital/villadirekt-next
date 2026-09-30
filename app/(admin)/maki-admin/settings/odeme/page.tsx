"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Save,
  Wallet,
  Check,
  Star,
} from "lucide-react";

import {
  getPaymentAccountsAction as getPaymentAccounts,
  createPaymentAccountAction as createPaymentAccount,
  updatePaymentAccountAction as updatePaymentAccount,
  deletePaymentAccountAction as deletePaymentAccount,
  setActivePaymentAccountAction as setActivePaymentAccount,
} from "@/app/services/payment-account.action";
import type { PaymentAccountInput } from "@/app/services/payment-account.service";
import type { PaymentAccount } from "@/lib/payment-account.helper";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

import {
  SettingsSection,
  FieldShell,
} from "../_components/SettingsField";
import WesternUnionAccountsCard from "./_components/WesternUnionAccountsCard";

/* ===============================================================
   🛡️ /settings/odeme — payment_accounts CRUD (mevcut service reuse)
   ===============================================================
   Source-of-truth: public.payment_accounts (DUPLİKE DEĞİL).
   Settings tablosuna IBAN/banka/swift alanı EKLENMEZ.

   Mevcut payment-account.service.ts fonksiyonları reuse:
     - getPaymentAccounts (list)
     - createPaymentAccount
     - updatePaymentAccount
     - deletePaymentAccount
     - setActivePaymentAccount (single-active enforce)

   Reservation/payment public kontratı (`getActivePaymentAccount`,
   `paymentAccountDisplay`) DOKUNULMADI — bu sayfa sadece
   admin yönetim UI'ı.

   Sidebar: mevcut /maki-admin/payment-accounts admin page'i de
   intact; bu /settings/odeme route'u settings UX içinde ekstra
   erişim noktası (aynı CRUD).
   =============================================================== */

type DraftAccount = PaymentAccountInput & { id?: string };

const EMPTY_DRAFT: DraftAccount = {
  bank_name: "",
  account_holder: "",
  iban: "",
  branch_name: "",
  branch_code: "",
  swift_code: "",
  currency: "TRY",
  is_active: false,
};

export default function SettingsPaymentPage() {
  const toast = useNotify();
  const confirm = useConfirm();

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<DraftAccount>(EMPTY_DRAFT);

  /* Inline edit drafts — id bazlı dirty state. */
  const [editDrafts, setEditDrafts] = useState<
    Record<string, Partial<PaymentAccountInput>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data = await getPaymentAccounts();
    setAccounts(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  /* ----- CREATE ----- */
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newDraft.bank_name.trim() || !newDraft.iban.trim()) {
      toast.error("Banka adı ve IBAN zorunlu", { id: "pa-create" });
      return;
    }
    setCreating(true);
    const res = await createPaymentAccount(newDraft);
    setCreating(false);
    if (!res.ok) {
      toast.error("Hesap eklenemedi", {
        id: "pa-create",
        description: res.error,
      });
      return;
    }
    toast.success("Hesap eklendi", { id: "pa-create" });
    setNewDraft(EMPTY_DRAFT);
    await load();
  }

  /* ----- UPDATE ----- */
  function patchDraft(id: string, patch: Partial<PaymentAccountInput>) {
    setEditDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  }
  async function handleSave(account: PaymentAccount) {
    const draft = editDrafts[account.id];
    if (!draft || Object.keys(draft).length === 0) return;
    setBusyId(account.id);
    const res = await updatePaymentAccount(account.id, draft);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Güncellenemedi", {
        id: `pa-save-${account.id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Kaydedildi", { id: `pa-save-${account.id}` });
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[account.id];
      return next;
    });
    await load();
  }

  /* ----- DELETE ----- */
  async function handleDelete(account: PaymentAccount) {
    const ok = await confirm({
      title: "Hesap silinsin mi?",
      description: `${account.bank_name || "Hesap"} kalıcı olarak silinecek.`,
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(account.id);
    const res = await deletePaymentAccount(account.id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `pa-del-${account.id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Hesap silindi", { id: `pa-del-${account.id}` });
    await load();
  }

  /* ----- SET ACTIVE ----- */
  async function handleSetActive(account: PaymentAccount) {
    if (account.is_active) return;
    setBusyId(account.id);
    const res = await setActivePaymentAccount(account.id);
    setBusyId(null);
    if (!res.ok) {
      toast.error("Aktif edilemedi", {
        id: `pa-active-${account.id}`,
        description: res.error,
      });
      return;
    }
    toast.success("Aktif hesap güncellendi", {
      id: `pa-active-${account.id}`,
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Ödeme
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Firma EFT/Havale hesap bilgileri.{" "}
          <strong className="text-[var(--color-stone-700)]">
            Aktif hesap
          </strong>{" "}
          tek olabilir; rezervasyon ödeme akışında müşteriye gösterilen
          hesap budur.
        </p>
      </div>

      {/* CREATE FORM */}
      <SettingsSection
        title="Yeni Hesap Ekle"
        description="Banka adı ve IBAN zorunlu; diğer alanlar opsiyonel."
        footer={
          <button
            type="submit"
            form="pa-create-form"
            disabled={creating}
            className="btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            {creating ? "Ekleniyor…" : "Hesap Ekle"}
          </button>
        }
      >
        <form
          id="pa-create-form"
          onSubmit={handleCreate}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldShell label="Banka adı">
              <input
                value={newDraft.bank_name}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, bank_name: e.target.value })
                }
                placeholder="Garanti BBVA"
                className="input"
              />
            </FieldShell>
            <FieldShell label="Hesap sahibi">
              <input
                value={newDraft.account_holder}
                onChange={(e) =>
                  setNewDraft({
                    ...newDraft,
                    account_holder: e.target.value,
                  })
                }
                placeholder="MAKİ DİJİTAL HİZ. LTD."
                className="input"
              />
            </FieldShell>
          </div>
          <FieldShell
            label="IBAN"
            hint="Boşluklar otomatik temizlenir, büyük harfe çevrilir."
          >
            <input
              value={newDraft.iban}
              onChange={(e) =>
                setNewDraft({ ...newDraft, iban: e.target.value })
              }
              placeholder="TR00 0000 0000 0000 0000 0000 00"
              className="input font-mono text-sm"
            />
          </FieldShell>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FieldShell label="Şube adı">
              <input
                value={newDraft.branch_name || ""}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, branch_name: e.target.value })
                }
                placeholder="Kalkan Şubesi"
                className="input"
              />
            </FieldShell>
            <FieldShell label="Şube kodu">
              <input
                value={newDraft.branch_code || ""}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, branch_code: e.target.value })
                }
                placeholder="1234"
                className="input"
              />
            </FieldShell>
            <FieldShell label="SWIFT / BIC">
              <input
                value={newDraft.swift_code || ""}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, swift_code: e.target.value })
                }
                placeholder="TGBATRIS"
                className="input font-mono text-sm"
              />
            </FieldShell>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FieldShell label="Para birimi">
              <select
                value={newDraft.currency || "TRY"}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, currency: e.target.value })
                }
                className="input"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </FieldShell>
            <label className="flex items-end gap-2 pb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={!!newDraft.is_active}
                onChange={(e) =>
                  setNewDraft({ ...newDraft, is_active: e.target.checked })
                }
              />
              <span className="text-sm text-[var(--color-stone-700)]">
                Ekleme sonrası aktif olarak işaretle
              </span>
            </label>
          </div>
        </form>
      </SettingsSection>

      {/* LIST */}
      {loading ? (
        <div className="card-premium p-10 text-center text-sm text-[var(--color-stone-500)]">
          Yükleniyor…
        </div>
      ) : accounts.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Wallet size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz hesap eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-md mx-auto">
            Yukarıdaki formdan ilk banka hesabını ekleyin. Eklenince
            rezervasyon ödeme akışında müşterinize gösterilir.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((a) => {
            const draft = editDrafts[a.id] || {};
            const dirty = Object.keys(draft).length > 0;
            const isBusy = busyId === a.id;
            const get = <K extends keyof PaymentAccountInput>(
              key: K
            ): PaymentAccountInput[K] => {
              const v = draft[key];
              if (v !== undefined) return v;
              return (a[key as keyof PaymentAccount] ?? "") as PaymentAccountInput[K];
            };
            return (
              <SettingsSection
                key={a.id}
                title={a.bank_name || "Banka hesabı"}
                description={a.iban || ""}
                footer={
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-champagne-700)] bg-[var(--color-champagne-500)]/15 px-3 py-1.5 rounded-full">
                        <Star size={11} /> Aktif hesap
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetActive(a)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-stone-700)] px-3 py-1.5 rounded-lg border border-[var(--color-stone-200)] hover:border-[var(--color-champagne-500)] hover:bg-[var(--color-sand-50)] transition disabled:opacity-50"
                      >
                        <Check size={12} /> Aktif yap
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSave(a)}
                      disabled={!dirty || isBusy}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-champagne-700)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Save size={12} /> Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 text-[12.5px] text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50 ml-auto"
                    >
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FieldShell label="Banka adı">
                    <input
                      value={String(get("bank_name") || "")}
                      onChange={(e) =>
                        patchDraft(a.id, { bank_name: e.target.value })
                      }
                      className="input"
                    />
                  </FieldShell>
                  <FieldShell label="Hesap sahibi">
                    <input
                      value={String(get("account_holder") || "")}
                      onChange={(e) =>
                        patchDraft(a.id, {
                          account_holder: e.target.value,
                        })
                      }
                      className="input"
                    />
                  </FieldShell>
                </div>
                <FieldShell label="IBAN">
                  <input
                    value={String(get("iban") || "")}
                    onChange={(e) =>
                      patchDraft(a.id, { iban: e.target.value })
                    }
                    className="input font-mono text-sm"
                  />
                </FieldShell>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <FieldShell label="Şube adı">
                    <input
                      value={String(get("branch_name") || "")}
                      onChange={(e) =>
                        patchDraft(a.id, { branch_name: e.target.value })
                      }
                      className="input"
                    />
                  </FieldShell>
                  <FieldShell label="Şube kodu">
                    <input
                      value={String(get("branch_code") || "")}
                      onChange={(e) =>
                        patchDraft(a.id, { branch_code: e.target.value })
                      }
                      className="input"
                    />
                  </FieldShell>
                  <FieldShell label="SWIFT / BIC">
                    <input
                      value={String(get("swift_code") || "")}
                      onChange={(e) =>
                        patchDraft(a.id, { swift_code: e.target.value })
                      }
                      className="input font-mono text-sm"
                    />
                  </FieldShell>
                </div>
                <FieldShell label="Para birimi">
                  <select
                    value={String(get("currency") || "TRY")}
                    onChange={(e) =>
                      patchDraft(a.id, { currency: e.target.value })
                    }
                    className="input"
                  >
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </FieldShell>
              </SettingsSection>
            );
          })}
        </div>
      )}

      {/* 🔥 Western Union Hesapları — banka hesaplarından AYRI section.
         EFT/payment_accounts akışına temas etmez (ayrı tablo + service). */}
      <WesternUnionAccountsCard />
    </div>
  );
}
