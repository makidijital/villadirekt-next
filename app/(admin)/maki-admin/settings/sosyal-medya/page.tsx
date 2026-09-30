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

export default function SettingsSocialPage() {
  const toast = useNotify();
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [youtube, setYoutube] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setInstagram(s?.instagram || "");
      setFacebook(s?.facebook || "");
      setYoutube(s?.youtube || "");
      setTiktok(s?.tiktok || "");
      setWhatsapp(s?.whatsapp_link || "");
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
      instagram: instagram.trim() || null,
      facebook: facebook.trim() || null,
      youtube: youtube.trim() || null,
      tiktok: tiktok.trim() || null,
      whatsapp_link: whatsapp.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-social" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-social" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          Sosyal Medya
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Footer, /iletisim sayfası ve Organization schema.org
          <code className="text-[12px] font-mono mx-1">sameAs</code>
          alanlarında kullanılır. Boş bırakılan platform ikonu render
          edilmez.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
        <SettingsSection
          title="Hesap Bağlantıları"
          description="Tam URL girin (örn. https://instagram.com/handle). Boş alanlar UI'da gizlenir."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <TextField
            label="Instagram URL"
            value={instagram}
            onChange={setInstagram}
            type="url"
            placeholder="https://instagram.com/handle"
            disabled={loading}
          />
          <TextField
            label="Facebook URL"
            value={facebook}
            onChange={setFacebook}
            type="url"
            placeholder="https://facebook.com/sayfa"
            disabled={loading}
          />
          <TextField
            label="YouTube URL"
            value={youtube}
            onChange={setYoutube}
            type="url"
            placeholder="https://youtube.com/@kanal"
            disabled={loading}
          />
          <TextField
            label="TikTok URL"
            value={tiktok}
            onChange={setTiktok}
            type="url"
            placeholder="https://tiktok.com/@handle"
            disabled={loading}
          />
          <TextField
            label="WhatsApp Link"
            value={whatsapp}
            onChange={setWhatsapp}
            type="url"
            placeholder="https://wa.me/905XXXXXXXXX"
            hint="Floating WhatsApp CTA + /iletisim sayfası butonu burada bağlanır."
            disabled={loading}
          />
        </SettingsSection>
      </form>
    </div>
  );
}
