"use client";

import { useEffect, useState } from "react";

import { getSettingsClient as getSettings, updateSettingsClient as updateSettings } from "@/app/services/settings.client";
import { useNotify } from "@/app/components/admin/notifications/NotificationProvider";
import { revalidateSettings } from "@/app/services/revalidate.actions";

import {
  SettingsSection,
  TextField,
  TextAreaField,
  SaveButton,
} from "../_components/SettingsField";

export default function SettingsContactPage() {
  const toast = useNotify();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setPhone(s?.phone || "");
      setEmail(s?.email || "");
      setAddress(s?.address || "");
      setBusinessHours(s?.business_hours || "");
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
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      business_hours: businessHours.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-iletisim" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-iletisim" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          İletişim
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Public site footer, /iletisim sayfası ve Organization
          structured data'da kullanılan iletişim bilgileri.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
        aria-busy={loading}
      >
        <SettingsSection
          title="İletişim Bilgileri"
          description="Telefon, e-posta ve adres bilgileri public site'da görünür ve admin/messages inbox'ında referans olarak kullanılır."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TextField
              label="Telefon"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="+90 252 000 00 00"
              disabled={loading}
              hint="Footer + iletişim sayfası + WhatsApp link."
            />
            <TextField
              label="E-posta"
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="info@example.com"
              disabled={loading}
              hint="Footer + iletişim sayfası + mailto link."
            />
          </div>
          <TextAreaField
            label="Adres"
            value={address}
            onChange={setAddress}
            placeholder="Kalkan, Kaş — Antalya, Türkiye"
            disabled={loading}
            rows={3}
            hint="Footer ve /iletisim sayfasında görünür."
          />
          <TextAreaField
            label="Çalışma saatleri"
            value={businessHours}
            onChange={setBusinessHours}
            placeholder="Hafta içi 09:00 – 19:00 · Hafta sonu 10:00 – 17:00"
            disabled={loading}
            rows={3}
            hint="/iletisim sayfasındaki info panelde görünür. Boş bırakılırsa satır gizlenir."
          />
        </SettingsSection>
      </form>
    </div>
  );
}
