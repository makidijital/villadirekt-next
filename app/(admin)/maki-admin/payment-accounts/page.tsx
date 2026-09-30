"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Power,
  Save,
  X,
  Landmark,
  RefreshCw,
} from "lucide-react";

import {
  getPaymentAccountsAction as getPaymentAccounts,
  createPaymentAccountAction as createPaymentAccount,
  updatePaymentAccountAction as updatePaymentAccount,
  deletePaymentAccountAction as deletePaymentAccount,
  setActivePaymentAccountAction as setActivePaymentAccount,
} from "@/app/services/payment-account.action";
import type { PaymentAccountInput } from "@/app/services/payment-account.service";

import {
  formatIban,
  type PaymentAccount,
} from "@/lib/payment-account.helper";

import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";

/* ===============================================================
   🔥 ADMIN — FİRMA HESAP BİLGİLERİ
   ===============================================================
   - EFT/Havale ödeme bilgilerini merkezi yönet
   - Single-active mantığı (yalnız bir hesap aktif)
   - Mail/PDF/ödeme ekranları aktif hesabı tek noktadan okur
   =============================================================== */

const initialForm: PaymentAccountInput = {
  bank_name: "",
  account_holder: "",
  iban: "",
  branch_name: "",
  branch_code: "",
  swift_code: "",
  currency: "TRY",
  is_active: false,
};

type FormErrors = Partial<Record<keyof PaymentAccountInput, string>>;

export default function AdminPaymentAccountsPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentAccountInput>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setRefreshing(true);
    const list = await getPaymentAccounts();
    // 🔥 Diagnostic — fetch sonucunu console'da gör
    console.log("[payment-accounts.page] fetched", {
      count: list.length,
      list,
    });
    setAccounts(list);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (acc: PaymentAccount) => {
    setEditingId(acc.id);
    setForm({
      bank_name: acc.bank_name || "",
      account_holder: acc.account_holder || "",
      iban: acc.iban || "",
      branch_name: acc.branch_name || "",
      branch_code: acc.branch_code || "",
      swift_code: acc.swift_code || "",
      currency: acc.currency || "TRY",
      is_active: !!acc.is_active,
    });
    setErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    const trim = (v: unknown) => (v ?? "").toString().trim();
    if (!trim(form.bank_name)) e.bank_name = "Banka adı zorunlu";
    if (!trim(form.account_holder))
      e.account_holder = "Hesap sahibi zorunlu";
    if (!trim(form.iban)) e.iban = "IBAN zorunlu";
    return e;
  };

  const handleSave = async () => {
    const v = validate();
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (editingId) {
        const res = await updatePaymentAccount(editingId, form);
        if (!res.ok) {
          toast.error("Güncellenemedi", {
            id: "payment-account-save",
            description: res.error || undefined,
          });
          return;
        }
        toast.success("Hesap güncellendi", { id: "payment-account-save" });
      } else {
        const res = await createPaymentAccount(form);
        if (!res.ok) {
          toast.error("Oluşturulamadı", {
            id: "payment-account-save",
            description: res.error || undefined,
          });
          return;
        }
        toast.success("Hesap eklendi", { id: "payment-account-save" });
      }
      setModalOpen(false);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const proceed = await confirm({
      title: "Hesap silinsin mi?",
      description: "Seçili banka hesabı kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const res = await deletePaymentAccount(id);
    if (!res.ok) {
      toast.error("Silinemedi", {
        id: `payment-account-delete-${id}`,
        description: res.error || undefined,
      });
      return;
    }
    await fetchAll();
    toast.success("Hesap silindi", { id: `payment-account-delete-${id}` });
  };

  const handleSetActive = async (id: string) => {
    const res = await setActivePaymentAccount(id);
    if (!res.ok) {
      toast.error("Aktif yapılamadı", {
        id: `payment-account-active-${id}`,
        description: res.error || undefined,
      });
      return;
    }
    await fetchAll();
    toast.success("Aktif hesap güncellendi", {
      id: `payment-account-active-${id}`,
    });
  };

  return (
    <div className="space-y-10">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Rezervasyon</p>
          <h1 className="admin-page-header__title">
            Firma Hesap Bilgileri
          </h1>
          <p className="admin-page-header__sub">
            EFT/Havale akışında müşteriye iletilecek aktif hesabı
            buradan yönet. Aynı anda yalnızca bir hesap aktif olur.
          </p>
        </div>

        <div className="admin-page-header__actions">
          <button
            onClick={fetchAll}
            disabled={refreshing}
            className="admin-icon-btn"
            aria-label="Yenile"
            title="Yenile"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
          <button onClick={openCreate} className="admin-btn-primary">
            <Plus size={15} />
            Yeni Hesap
          </button>
        </div>
      </header>

      {/* LOADING */}
      {loading && (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted)]">
          Yükleniyor…
        </div>
      )}

      {/* EMPTY */}
      {!loading && accounts.length === 0 && (
        <div className="admin-card-flat p-12 text-center">
          <p className="font-display text-[22px] text-[var(--admin-text)] tracking-[-0.015em]">
            Henüz kayıtlı hesap yok
          </p>
          <p className="text-[var(--admin-muted-2)] text-sm mt-2">
            “Yeni Hesap” butonuyla ilk firma hesap bilginizi ekleyin.
          </p>
        </div>
      )}

      {/* LIST */}
      {!loading && accounts.length > 0 && (
        <div className="admin-table">
          {accounts.map((acc) => {
            const active = !!acc.is_active;
            return (
              <div key={acc.id} className="admin-row">
                {/* ICON */}
                <div className="w-10 h-10 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center text-[var(--admin-muted)] shrink-0">
                  <Landmark size={16} />
                </div>

                {/* BANK + HOLDER + IBAN */}
                <div className="min-w-0 flex-[1.6]">
                  <p className="text-[14px] font-semibold text-[var(--admin-text)] truncate leading-tight">
                    {acc.bank_name || "—"}
                  </p>
                  <p className="text-[12px] text-[var(--admin-muted-2)] truncate mt-0.5">
                    {acc.account_holder || "—"}
                  </p>
                  <p className="text-[11.5px] text-[var(--admin-muted)] mt-0.5 tabular-nums truncate">
                    {formatIban(acc.iban) || "—"}
                  </p>
                </div>

                {/* CURRENCY */}
                <div className="hidden md:block min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--admin-muted-2)]">
                    Para birimi
                  </p>
                  <p className="text-[13px] text-[var(--admin-text)] mt-0.5">
                    {acc.currency || "TRY"}
                  </p>
                </div>

                {/* ACTIVE BADGE */}
                <div className="shrink-0">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs border font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-stone-50 text-stone-600 border-stone-200"
                    }`}
                  >
                    {active ? "Aktif" : "Pasif"}
                  </span>
                </div>

                {/* ACTIONS */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {!active && (
                    <button
                      onClick={() => handleSetActive(acc.id)}
                      className="admin-icon-btn"
                      aria-label="Aktif yap"
                      title="Aktif yap"
                    >
                      <Power size={14} className="text-emerald-600" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(acc)}
                    className="admin-icon-btn"
                    aria-label="Düzenle"
                    title="Düzenle"
                  >
                    <Pencil
                      size={14}
                      className="text-[var(--admin-muted)]"
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="admin-icon-btn"
                    aria-label="Sil"
                    title="Sil"
                  >
                    <Trash2
                      size={14}
                      className="text-rose-600"
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            aria-label="Kapat"
            onClick={closeModal}
            className="absolute inset-0 bg-[#020617]/45 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.22)] border border-[var(--color-stone-100)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-stone-100)]">
              <div>
                <p className="eyebrow">Firma Hesabı</p>
                <h2 className="font-display text-xl text-[var(--color-stone-900)] tracking-[-0.015em] mt-0.5">
                  {editingId ? "Hesabı düzenle" : "Yeni hesap"}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="admin-icon-btn"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field
                label="Banka adı *"
                value={form.bank_name}
                error={errors.bank_name}
                onChange={(v) => setForm({ ...form, bank_name: v })}
              />
              <Field
                label="Hesap sahibi *"
                value={form.account_holder}
                error={errors.account_holder}
                onChange={(v) =>
                  setForm({ ...form, account_holder: v })
                }
              />
              <Field
                label="IBAN *"
                value={form.iban}
                error={errors.iban}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                onChange={(v) => setForm({ ...form, iban: v })}
                hint={
                  form.iban
                    ? `Önizleme: ${formatIban(form.iban)}`
                    : undefined
                }
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Şube adı"
                  value={form.branch_name || ""}
                  onChange={(v) =>
                    setForm({ ...form, branch_name: v })
                  }
                />
                <Field
                  label="Şube kodu"
                  value={form.branch_code || ""}
                  onChange={(v) =>
                    setForm({ ...form, branch_code: v })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="SWIFT"
                  value={form.swift_code || ""}
                  onChange={(v) =>
                    setForm({ ...form, swift_code: v })
                  }
                />
                <Field
                  label="Para birimi"
                  value={form.currency || ""}
                  placeholder="TRY"
                  onChange={(v) => setForm({ ...form, currency: v })}
                />
              </div>

              <label className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[var(--color-stone-100)] cursor-pointer hover:border-[var(--color-stone-200)] transition">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  className="!w-4 !h-4 accent-[var(--color-champagne-500)]"
                />
                <span className="text-sm font-medium text-[var(--color-stone-900)]">
                  Bu hesabı aktif yap
                </span>
                <span className="ml-auto text-[11px] text-[var(--color-stone-500)]">
                  Diğer hesaplar otomatik pasifleşir
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-[var(--color-stone-100)] flex items-center justify-end gap-2 bg-[var(--color-sand-50)]">
              <button
                onClick={closeModal}
                disabled={saving}
                className="admin-icon-btn px-4 !rounded-xl text-sm"
              >
                Vazgeç
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary disabled:opacity-60"
              >
                <Save size={15} />
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--color-stone-500)] block">
        {label}
      </label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`input ${error ? "!border-red-500" : ""}`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {!error && hint && (
        <p className="text-xs text-[var(--color-stone-500)]">{hint}</p>
      )}
    </div>
  );
}
