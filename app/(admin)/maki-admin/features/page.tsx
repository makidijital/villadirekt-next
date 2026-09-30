"use client";

import { useEffect, useState } from "react";
import {
  getVillaFeaturesAction as getVillaFeatures,
  addVillaFeatureAction as addVillaFeature,
  updateVillaFeatureAction as updateVillaFeature,
  deleteVillaFeatureAction as deleteVillaFeature,
} from "./features.action";
import { Plus, Save, Trash2, Sparkles, Languages } from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
/* 🛡️ PHASE 10D — Batch 2 — multilingual_enabled kontrolü.
   Mevcut admin CRUD action'ları (features.action.ts) service-role/native
   repo üzerinden gider ve `Settings` döndürmez; `getPublicSettingsAction`
   (@/app/services/settings.action) ise TopBar.tsx'in ZATEN kullandığı,
   "use client" bileşenlerden çağrılabilen, public-safe (secret İÇERMEZ)
   tek mevcut settings-fetch kaynağı. Phase 10A'nın VillaTranslationsCard'ı
   multilingual_enabled'a göre GİZLENMİYOR (yalnız wizard step'ine göre
   mount ediliyor) — yani "admin panel multilingual_enabled'a göre
   gizlensin" için birebir kopyalanacak bir admin-taraf örnek YOK. Bu
   yüzden TopBar'ın public client-fetch deseni (useEffect + cancelled
   guard + local state, aşağıda BİREBİR aynı mekanik) buraya taşındı —
   yeni bir settings-fetch sistemi İCAT EDİLMEDİ. */
import { getPublicSettingsAction } from "@/app/services/settings.action";
import FeatureTranslationsPanel from "./FeatureTranslationsPanel";

export default function FeaturesPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  const [features, setFeatures] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [multilingualEnabled, setMultilingualEnabled] = useState(false);
  const [openFeatureId, setOpenFeatureId] = useState<string | null>(null);

  async function load() {
    const data = await getVillaFeatures();
    setFeatures(data);
  }

  useEffect(() => {
    load();
  }, []);

  /* 🛡️ PHASE 10D — Batch 2 — TopBar.tsx ile BİREBİR AYNI fetch mekaniği
     (useEffect + cancelled guard). Settings null/hata → fail-safe KAPALI
     (mevcut `isMultilingualEnabled` helper'ının null-safe davranışıyla
     tutarlı — bkz. lib/i18n/config.ts). */
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
    const ok = await addVillaFeature(name);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "feature-create" });
      setLoading(false);
      return;
    }
    setName("");
    await load();
    setLoading(false);
    toast.success("Olanak eklendi", { id: "feature-create" });
  }

  async function handleUpdate(id: string, newName: string) {
    const ok = await updateVillaFeature(id, newName);
    if (!ok) {
      toast.error("Güncellenemedi", { id: `feature-update-${id}` });
      return;
    }
    load();
    toast.success("Olanak güncellendi", { id: `feature-update-${id}` });
  }

  async function handleDelete(id: string) {
    const proceed = await confirm({
      title: "Olanak silinsin mi?",
      description: "Seçili kayıt kaldırılır. Bu işlem geri alınamaz.",
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteVillaFeature(id);
    if (!ok) {
      toast.error("Silinemedi", { id: `feature-delete-${id}` });
      return;
    }
    if (openFeatureId === id) setOpenFeatureId(null);
    load();
    toast.success("Olanak silindi", { id: `feature-delete-${id}` });
  }

  function toggleTranslations(id: string) {
    setOpenFeatureId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <p className="eyebrow">Yönetim</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Mülk olanakları
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2">
          Mülk detayında &ldquo;Özellikler&rdquo; listesi olarak gösterilir.
        </p>
      </div>

      <div className="card-premium p-5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Özellik adı (Örn: Havuzlu)"
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

      {features.length === 0 ? (
        <div className="card-premium p-10 text-center">
          <div className="w-11 h-11 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center mx-auto">
            <Sparkles size={16} className="text-[var(--color-champagne-700)]" />
          </div>
          <h3 className="font-display text-xl text-[var(--color-stone-900)] mt-4">
            Henüz özellik eklenmemiş
          </h3>
          <p className="text-sm text-[var(--color-stone-500)] mt-2">
            Yukarıdan ilk olanağı eklemeyi dene.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {features.map((f) => (
            <div key={f.id}>
              <div className="card-premium p-3 flex items-center gap-2">
                <input
                  value={f.name}
                  onChange={(e) => {
                    const updated = features.map((x) =>
                      x.id === f.id ? { ...x, name: e.target.value } : x
                    );
                    setFeatures(updated);
                  }}
                  className="input flex-1"
                />

                <button
                  onClick={() => handleUpdate(f.id, f.name)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-champagne-700)] hover:text-[var(--color-champagne-600)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                >
                  <Save size={13} />
                  Kaydet
                </button>

                {/* 🛡️ PHASE 10D — Batch 2 — yalnız multilingual_enabled=true
                    iken render edilir; mevcut Kaydet/Sil aksiyonlarını
                    BOZMAZ, ayrı bir buton. */}
                {multilingualEnabled && (
                  <button
                    onClick={() => toggleTranslations(f.id)}
                    aria-label={`${f.name} çevirileri`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-stone-600)] hover:text-[var(--color-stone-900)] px-3 py-2 rounded-lg hover:bg-[var(--color-sand-50)] transition"
                  >
                    <Languages size={13} />
                    Çeviriler
                  </button>
                )}

                <button
                  onClick={() => handleDelete(f.id)}
                  className="inline-flex items-center gap-1.5 text-[13px] text-red-600 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 size={13} />
                  Sil
                </button>
              </div>

              {multilingualEnabled && openFeatureId === f.id && (
                <FeatureTranslationsPanel featureId={f.id} featureName={f.name} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
