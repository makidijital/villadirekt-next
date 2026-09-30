"use client";

import { useEffect, useState } from "react";
import { getSettingsClient as getSettings, updateSettingsClient as updateSettings } from "@/app/services/settings.client";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateSettings } from "@/app/services/revalidate.actions";
import {
  SettingsSection,
  TextField,
  TextAreaField,
  ToggleField,
  SaveButton,
} from "../_components/SettingsField";

export default function SettingsAdvancedPage() {
  const toast = useNotify();
  const [customHead, setCustomHead] = useState("");
  const [analyticsScript, setAnalyticsScript] = useState("");
  const [gtmId, setGtmId] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setCustomHead(s?.custom_head_scripts || "");
      setAnalyticsScript(s?.analytics_script || "");
      setGtmId(s?.gtm_container_id || "");
      setMaintenanceMode(!!s?.maintenance_mode);
      setMaintenanceMessage(s?.maintenance_message || "");
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
    const ok = await updateSettings({
      custom_head_scripts: customHead.trim() || null,
      analytics_script: analyticsScript.trim() || null,
      gtm_container_id: gtmId.trim() || null,
      maintenance_mode: maintenanceMode,
      maintenance_message: maintenanceMessage.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-advanced" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-advanced" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Gelişmiş
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Custom script enjeksiyonu, analytics ve bakım modu.
          Yanlış konfigürasyon site renderını bozabilir.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
        <SettingsSection
          title="Analytics & Tag Manager"
          description="Google Analytics, GTM, Facebook Pixel gibi tracking script'leri."
        >
          <TextField
            label="GTM Container ID"
            value={gtmId}
            onChange={setGtmId}
            placeholder="GTM-XXXXXXX"
            disabled={loading}
            hint="Boş ise GTM yüklenmez. Container ID girilirse otomatik <script> root layout'a inject edilir."
          />
          <TextAreaField
            label="Analytics script (manuel)"
            value={analyticsScript}
            onChange={setAnalyticsScript}
            placeholder="<!-- Google Analytics -->\n<script async src='...'></script>"
            disabled={loading}
            rows={6}
            hint="Custom analytics HTML. Raw inject — XSS riski; sadece güvendiğiniz script'leri yapıştırın."
          />
        </SettingsSection>

        <SettingsSection
          title="Custom Head Scripts"
          description="Root layout <head> içine raw HTML inject. Verification meta'lar /seo'dan, GTM yukarıdan; bu alan ekstra (font, hotjar, vs.)."
        >
          <TextAreaField
            label="Custom head HTML"
            value={customHead}
            onChange={setCustomHead}
            placeholder="<link rel='preconnect' href='...'>"
            disabled={loading}
            rows={6}
            hint="Geçerli HTML olmalı. Yanlış syntax sayfa render'ını bozabilir."
          />
        </SettingsSection>

        <SettingsSection
          title="Bakım Modu"
          description="Aktifken public site bakım sayfası gösterir; admin panel + login çalışmaya devam eder."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <ToggleField
            label="Bakım modu aktif"
            description="Public sayfalar bakım ekranıyla değiştirilir. /maki-admin/* etkilenmez."
            checked={maintenanceMode}
            onChange={setMaintenanceMode}
            disabled={loading}
          />
          <TextAreaField
            label="Bakım mesajı"
            value={maintenanceMessage}
            onChange={setMaintenanceMessage}
            placeholder="Sitemizi yeniliyoruz. Kısa süre içinde tekrar buradayız."
            disabled={loading || !maintenanceMode}
            rows={3}
            hint="Bakım ekranında gösterilen mesaj."
          />
        </SettingsSection>
      </form>
    </div>
  );
}
