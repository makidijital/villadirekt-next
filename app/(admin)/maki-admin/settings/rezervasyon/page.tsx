"use client";

import { useEffect, useState } from "react";

import { getSettingsClient as getSettings, updateSettingsClient as updateSettings } from "@/app/services/settings.client";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateSettings } from "@/app/services/revalidate.actions";

import {
  SettingsSection,
  NumberField,
  ToggleField,
  SaveButton,
} from "../_components/SettingsField";

export default function SettingsReservationPage() {
  const toast = useNotify();
  const [prepayment, setPrepayment] = useState<number | "">(30);
  /* 🛡️ Orphan-gap kuralı — default AÇIK (fail-safe). Settings okunana kadar
     true; null/okunamaz → true kalır (migration default'u ile uyumlu). */
  const [orphanGapEnabled, setOrphanGapEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setPrepayment(s?.prepayment_rate ?? 30);
      setOrphanGapEnabled(s?.orphan_gap_rule_enabled ?? true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const n = prepayment === "" ? null : Number(prepayment);
    if (n !== null && (isNaN(n) || n < 0 || n > 100)) {
      toast.error("Ön ödeme oranı 0-100 arası olmalı", {
        id: "settings-rezervasyon",
      });
      setSaving(false);
      return;
    }
    const ok = await updateSettings({
      prepayment_rate: n,
      orphan_gap_rule_enabled: orphanGapEnabled,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-rezervasyon" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-rezervasyon" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Rezervasyon
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Genel rezervasyon davranışları. Mülk-spesifik
          custom_prepayment_rate override mevcut; bu değer fallback.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        aria-busy={loading}
      >
        <SettingsSection
          title="Ön Ödeme Oranı"
          description="Mülk detay sayfasında özel oran tanımlanmamışsa kullanılan global yüzde."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <NumberField
            label="Varsayılan ön ödeme oranı (%)"
            value={prepayment}
            onChange={setPrepayment}
            min={0}
            max={100}
            step={1}
            placeholder="30"
            disabled={loading}
            hint="0-100 arası. BookingSidebar ön ödeme tutarını bu oran üzerinden hesaplar."
          />
        </SettingsSection>

        <SettingsSection
          title="Minimum Konaklama Boşluk Kuralı"
          description="Rezervasyon tarih seçiminde 'orphan gap' (kullanılamaz kısa boşluk) oluşumunu engeller."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <ToggleField
            label="Kısa kullanılamaz boşlukları rezervasyona kapat"
            description="Minimum konaklama süresinden daha kısa kullanılabilir boşlukların rezervasyona kapatılmasını sağlar. Kapalıyken mevcut minimum konaklama kuralı ve boşluğu tam dolduran rezervasyon davranışı aynen çalışmaya devam eder."
            checked={orphanGapEnabled}
            onChange={setOrphanGapEnabled}
            disabled={loading}
          />
        </SettingsSection>
      </form>
    </div>
  );
}
