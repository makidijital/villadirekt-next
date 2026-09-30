"use client";

import { useEffect, useState } from "react";
/* 🛡️ Migration PB1 — client boundary: runtime payment-method.service import'u
   yerine server action. Böylece service (ve ileride native server-only repo)
   client bundle'a sızmaz. Call-site'lar alias ile değişmez. */
import {
  getPaymentMethodsAction as getPaymentMethods,
  createPaymentMethodAction as createPaymentMethod,
  deletePaymentMethodAction as deletePaymentMethod,
} from "@/app/services/payment-method.action";
import { Plus, Trash2, CreditCard, Languages } from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
/* 🛡️ MIGRATION 088 — EN/DE çeviri paneli (opsiyonel, varsayılan KAPALI).
   Mevcut liste satırı, create ve delete akışları DEĞİŞTİRİLMEDİ. */
import PaymentMethodTranslationsPanel from "./PaymentMethodTranslationsPanel";

export default function PaymentMethodsPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  /* 🛡️ Aynı anda YALNIZ tek satırın çeviri paneli açık (faqs/types
     ekranlarındaki AYNI davranış). */
  const [openTranslationId, setOpenTranslationId] = useState<string | null>(
    null
  );

  const fetchData = async () => {
    const data = await getPaymentMethods();
    setItems(data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdd = async () => {
    if (!name) {
      toast.error("İsim gerekli", { id: "payment-method-create" });
      return;
    }
    setLoading(true);
    try {
      await createPaymentMethod({ name });
      setName("");
      fetchData();
      toast.success("Ödeme yöntemi eklendi", { id: "payment-method-create" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Eklenemedi";
      toast.error("Eklenemedi", {
        id: "payment-method-create",
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const proceed = await confirm({
      title: "Ödeme yöntemi silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    await deletePaymentMethod(id);
    fetchData();
    toast.success("Ödeme yöntemi silindi", {
      id: `payment-method-delete-${id}`,
    });
  };

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Ödeme yöntemleri
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Rezervasyon formunda misafire sunulan ödeme seçenekleri.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          placeholder="Örn: Havale / EFT"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={loading || !name}
          className="btn-primary"
        >
          <Plus size={15} />
          {loading ? "Ekleniyor…" : "Ekle"}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <CreditCard size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz ödeme yöntemi yok
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            En az bir ödeme yöntemi ekle.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item.id}>
              <div className="card-premium p-4 flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                    <CreditCard size={14} className="text-[var(--color-champagne-700)]" />
                  </span>
                  <span className="font-medium text-[var(--color-stone-900)] truncate">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* 🛡️ ÇOKLU DİL — EN/DE (opsiyonel). Canonical TR ad
                      bu panelden DÜZENLENEMEZ. */}
                  <button
                    type="button"
                    onClick={() =>
                      setOpenTranslationId((prev) =>
                        prev === item.id ? null : item.id
                      )
                    }
                    aria-expanded={openTranslationId === item.id}
                    className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-stone-500)] hover:text-[var(--color-stone-900)] px-3 py-1.5 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Languages size={13} />
                    Çeviriler
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 size={13} />
                    Sil
                  </button>
                </div>
              </div>

              {openTranslationId === item.id && (
                <PaymentMethodTranslationsPanel
                  paymentMethodId={item.id}
                  paymentMethodName={item.name}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
