"use client";

import { useEffect, useState } from "react";
import {
  getPriceIncludeItemsAction as getPriceIncludeItems,
  addPriceIncludeItemAction as addPriceIncludeItem,
  updatePriceIncludeItemAction as updatePriceIncludeItem,
  deletePriceIncludeItemAction as deletePriceIncludeItem,
} from "./price-includes.action";
import { Plus, Save, Trash2, BadgeCheck, Languages } from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
/* 🛡️ PHASE 10D — Batch 3 — multilingual_enabled kontrolü. Batch 2'de
   Features için kanıtlanan TopBar.tsx deseni (getPublicSettingsAction,
   public-safe, "use client" bileşenlerden çağrılabilir) BİREBİR aynı
   şekilde buraya taşındı — yeni bir settings-fetch sistemi İCAT
   EDİLMEDİ. */
import { getPublicSettingsAction } from "@/app/services/settings.action";
import PriceIncludeTranslationsPanel from "./PriceIncludeTranslationsPanel";

export default function PriceIncludesPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  async function load() {
    const data = await getPriceIncludeItems();
    setItems(data);
  }

  useEffect(() => {
    load();
  }, []);

  /* 🛡️ PHASE 10D — Batch 3 — TopBar.tsx / FeaturesPage (Batch 2) ile
     BİREBİR AYNI fetch mekaniği (useEffect + cancelled guard). Settings
     null/hata → fail-safe KAPALI. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const settings = await getPublicSettingsAction();
      if (cancelled) return;
      setMultilingualEnabled(!!settings?.multilingual_enabled);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd() {
    if (!name) return;
    setLoading(true);
    const ok = await addPriceIncludeItem(name);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "include-create" });
      setLoading(false);
      return;
    }
    setName("");
    await load();
    setLoading(false);
    toast.success("Fiyata dahil eklendi", { id: "include-create" });
  }

  async function handleUpdate(id: string, newName: string) {
    const ok = await updatePriceIncludeItem(id, newName);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `include-update-${id}` });
      return;
    }
    load();
    toast.success("Güncellendi", { id: `include-update-${id}` });
  }

  async function handleDelete(id: string) {
    const proceed = await confirm({
      title: "Kayıt silinsin mi?",
      description: "Seçili 'Fiyata Dahil' kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deletePriceIncludeItem(id);
    if (!ok) {
      toast.error("Silinemedi", { id: `include-delete-${id}` });
      return;
    }
    if (openItemId === id) setOpenItemId(null);
    load();
    toast.success("Silindi", { id: `include-delete-${id}` });
  }

  function toggleTranslations(id: string) {
    setOpenItemId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Fiyata dahil olanlar
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Mülk detayında &ldquo;Fiyata Dahil&rdquo; listesi olarak gösterilir.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Madde adı (Örn: WiFi)"
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
            <BadgeCheck
              size={16}
              className="text-[var(--color-champagne-700)]"
            />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz dahil madde eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk maddeyi eklemeyi dene.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((p) => (
            <div key={p.id}>
              <div className="card-premium p-3 flex items-center gap-2">
                <input
                  value={p.title}
                  onChange={(e) => {
                    const updated = items.map((x) =>
                      x.id === p.id
                        ? { ...x, title: e.target.value }
                        : x
                    );
                    setItems(updated);
                  }}
                  className="input flex-1"
                />

                <button
                  onClick={() => handleUpdate(p.id, p.title)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                >
                  <Save size={13} />
                  Kaydet
                </button>

                {/* 🛡️ PHASE 10D — Batch 3 — yalnız multilingual_enabled=true
                    iken render edilir; mevcut Kaydet/Sil aksiyonlarını
                    BOZMAZ, ayrı bir buton. */}
                {multilingualEnabled && (
                  <button
                    onClick={() => toggleTranslations(p.id)}
                    aria-label={`${p.title} çevirileri`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Languages size={13} />
                    Çeviriler
                  </button>
                )}

                <button
                  onClick={() => handleDelete(p.id)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 size={13} />
                  Sil
                </button>
              </div>

              {multilingualEnabled && openItemId === p.id && (
                <PriceIncludeTranslationsPanel
                  includeId={p.id}
                  includeTitle={p.title}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
