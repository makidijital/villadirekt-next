"use client";

import { useEffect, useState } from "react";

import { getSettingsClient as getSettings, updateSettingsClient as updateSettings } from "@/app/services/settings.client";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateSettings } from "@/app/services/revalidate.actions";

import {
  SettingsSection,
  TextField,
  SaveButton,
} from "../_components/SettingsField";
import ExchangeRatesCard from "../_components/ExchangeRatesCard";

export default function SettingsIntegrationsPage() {
  const toast = useNotify();
  const [resendKey, setResendKey] = useState("");
  const [mailFrom, setMailFrom] = useState("");
  const [mailFromName, setMailFromName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setResendKey(s?.resend_api_key || "");
      setMailFrom(s?.mail_from || "");
      setMailFromName(s?.mail_from_name || "");
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
      resend_api_key: resendKey.trim() || null,
      mail_from: mailFrom.trim() || null,
      mail_from_name: mailFromName.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-integrations" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-integrations" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Entegrasyonlar
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          E-posta servisi ve diğer üçüncü taraf entegrasyonları.
          Test e-postası gönderimi "Tümü (Klasik)" bölümünde mevcut.
        </p>
      </div>

      {/* FAZ 53 — Döviz Kurları kartı (TCMB integration). Form'un
          dışında bağımsız mount; kendi state'i ve refresh action'ı
          var, Resend save flow'una dokunmaz.
          NOT: FAZ 54B — Mail Logları kartı buradan kaldırıldı,
          /maki-admin/system-logs (Mail Merkezi) sayfasına taşındı. */}
      <ExchangeRatesCard />

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        aria-busy={loading}
      >
        <SettingsSection
          title="E-posta (Resend)"
          description="Rezervasyon e-postaları, ödeme bildirimleri ve sistem mesajları için kullanılan Resend SMTP entegrasyonu."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <TextField
            label="Resend API Key"
            value={resendKey}
            onChange={setResendKey}
            placeholder="re_********************************"
            disabled={loading}
            hint="resend.com hesabınızdan üretin. Sunucu tarafında tutulur; public bundle'a çıkmaz."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TextField
              label="Gönderici e-posta"
              value={mailFrom}
              onChange={setMailFrom}
              type="email"
              placeholder="rezervasyon@domain.com"
              disabled={loading}
              hint="Resend dashboard'da verify edilmiş domain'i kullanın."
            />
            <TextField
              label="Gönderici adı"
              value={mailFromName}
              onChange={setMailFromName}
              placeholder="MAKI DIGITAL"
              disabled={loading}
              hint="Müşterinin inbox'ında görünen ad."
            />
          </div>
        </SettingsSection>
      </form>
    </div>
  );
}
