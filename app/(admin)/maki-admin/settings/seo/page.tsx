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
  UploadField,
  SaveButton,
} from "../_components/SettingsField";

export default function SettingsSeoPage() {
  const toast = useNotify();
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [robotsIndex, setRobotsIndex] = useState(true);
  const [robotsFollow, setRobotsFollow] = useState(true);
  const [google, setGoogle] = useState("");
  const [yandex, setYandex] = useState("");
  const [bing, setBing] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      setMetaTitle(s?.default_meta_title || "");
      setMetaDescription(s?.default_meta_description || "");
      setOgImage(s?.default_og_image || null);
      setRobotsIndex(s?.robots_index !== false);
      setRobotsFollow(s?.robots_follow !== false);
      setGoogle(s?.google_site_verification || "");
      setYandex(s?.yandex_verification || "");
      setBing(s?.bing_verification || "");
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
      default_meta_title: metaTitle.trim() || null,
      default_meta_description: metaDescription.trim() || null,
      default_og_image: ogImage,
      robots_index: robotsIndex,
      robots_follow: robotsFollow,
      google_site_verification: google.trim() || null,
      yandex_verification: yandex.trim() || null,
      bing_verification: bing.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      toast.error("Kaydedilemedi", { id: "settings-seo" });
      return;
    }
    setSaved(true);
    toast.success("Kaydedildi", { id: "settings-seo" });
    revalidateSettings().catch(() => {});
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Ayarlar</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--color-stone-900)] mt-2 tracking-[-0.02em]">
          SEO
        </h1>
        <p className="text-sm text-[var(--color-stone-500)] mt-2 max-w-2xl">
          Sayfa-spesifik SEO yoksa kullanılan fallback değerler.
          Root layout metadata, OpenGraph default image ve robots
          meta tag'lerinde aktiftir.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
        <SettingsSection
          title="Varsayılan Meta"
          description="Sayfa kendi SEO title/description belirtmediğinde kullanılır."
        >
          <TextField
            label="Default meta title"
            value={metaTitle}
            onChange={setMetaTitle}
            placeholder="Akdeniz Villa Kiralama"
            disabled={loading}
            hint="Browser tab başlığı + arama sonucu başlığı."
          />
          <TextAreaField
            label="Default meta description"
            value={metaDescription}
            onChange={setMetaDescription}
            placeholder="Akdeniz'in seçkin villalarında özel havuz, deniz manzarası…"
            disabled={loading}
            rows={3}
            hint="Arama sonucunda görünen 150-160 karakterlik özet."
          />
          <UploadField
            label="Default OG image"
            currentUrl={ogImage}
            onChange={setOgImage}
            folder="seo"
            slug="default-og"
            disabled={loading}
            hint="WhatsApp/Twitter/Facebook paylaşımında görünen önizleme görseli. 1200×630 önerilir."
          />
        </SettingsSection>

        <SettingsSection
          title="Robots"
          description="Arama motorlarının default index/follow davranışı. Sayfa-spesifik noindex override eder."
        >
          <ToggleField
            label="Indexlemeye izin ver"
            description="Kapatırsanız site arama sonuçlarında görünmez."
            checked={robotsIndex}
            onChange={setRobotsIndex}
            disabled={loading}
          />
          <ToggleField
            label="Linkleri takip et"
            description="Kapatırsanız iç linkler crawl edilmez."
            checked={robotsFollow}
            onChange={setRobotsFollow}
            disabled={loading}
          />
        </SettingsSection>

        <SettingsSection
          title="Site Verification"
          description="Search Console / Webmaster Tools doğrulama meta tag'leri."
          footer={<SaveButton loading={saving} saved={saved} />}
        >
          <TextField
            label="Google Search Console"
            value={google}
            onChange={setGoogle}
            placeholder="abc123def456..."
            disabled={loading}
            hint="google-site-verification meta tag'inin content değeri."
          />
          <TextField
            label="Yandex Webmaster"
            value={yandex}
            onChange={setYandex}
            placeholder="..."
            disabled={loading}
          />
          <TextField
            label="Bing Webmaster"
            value={bing}
            onChange={setBing}
            placeholder="..."
            disabled={loading}
          />
        </SettingsSection>
      </form>
    </div>
  );
}
